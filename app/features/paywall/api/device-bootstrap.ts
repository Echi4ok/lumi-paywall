const databaseName = 'lumi-device-v1'
const storeName = 'identity'
const deviceKey = 'device-id'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DeviceBootstrap = (signal: AbortSignal) => Promise<string | null>

/** A read/write transaction elects one anonymous identity across concurrent tabs. */
export function createDeviceBootstrap(
  factory: IDBFactory | undefined,
  createId: () => string = () => crypto.randomUUID(),
): DeviceBootstrap {
  return (signal) =>
    new Promise((resolve) => {
      if (!factory || signal.aborted) return resolve(null)
      let settled = false
      let database: IDBDatabase | undefined
      let transaction: IDBTransaction | undefined

      function finish(value: string | null) {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        database?.close()
        resolve(value)
      }

      function abort() {
        // Abort only this connection's transaction; another tab may still be electing the ID.
        try {
          transaction?.abort()
        } catch {
          // A completed transaction can no longer be aborted.
        }
        finish(null)
      }

      signal.addEventListener('abort', abort, { once: true })
      try {
        const opening = factory.open(databaseName, 1)
        opening.onerror = () => finish(null)
        opening.onblocked = () => finish(null)
        opening.onupgradeneeded = () => {
          if (settled) {
            opening.transaction?.abort()
            return
          }
          opening.result.createObjectStore(storeName)
        }
        opening.onsuccess = () => {
          database = opening.result
          if (settled) {
            database.close()
            return
          }
          database.onversionchange = () => database?.close()
          try {
            transaction = database.transaction(storeName, 'readwrite')
            const store = transaction.objectStore(storeName)
            const reading = store.get(deviceKey)
            let deviceId: string | null = null
            transaction.oncomplete = () => finish(deviceId)
            transaction.onabort = () => finish(null)
            transaction.onerror = () => finish(null)
            reading.onsuccess = () => {
              try {
                const existing: unknown = reading.result
                deviceId =
                  typeof existing === 'string' && uuid.test(existing) ? existing : createId()
                if (!uuid.test(deviceId)) throw new Error('Invalid device identity')
                if (deviceId !== existing) store.put(deviceId, deviceKey)
              } catch {
                transaction?.abort()
              }
            }
          } catch {
            finish(null)
          }
        }
      } catch {
        finish(null)
      }
    })
}

export const deviceBootstrap: DeviceBootstrap = (signal) => {
  try {
    return createDeviceBootstrap(globalThis.indexedDB)(signal)
  } catch {
    // Existing HttpOnly sessions still work when browser storage is blocked.
    return Promise.resolve(null)
  }
}

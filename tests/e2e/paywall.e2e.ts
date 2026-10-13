import { expect, test, type Page } from '@playwright/test'

test('purchase persists across reload and restores the same receipt', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('radio', { name: /На один месяц/ }).check()
  await page.getByRole('button', { name: 'Открыть весь мир' }).click()
  await expect(page.getByRole('heading', { name: /теперь открыт/ })).toBeFocused()
  await page.screenshot({
    path: test.info().outputPath('success-390.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Посмотреть детали покупки' }).click()
  const receipt = await page.locator('#receipt-details dd').first().innerText()
  expect(receipt).toMatch(/^[0-9a-f-]{36}$/)
  await page.reload()
  await page.getByRole('button', { name: 'Восстановить покупки' }).click()
  await expect(page.getByText('Покупка восстановлена', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Посмотреть детали покупки' }).click()
  await expect(page.locator('#receipt-details dd').first()).toHaveText(receipt)
  expect(errors).toEqual([])
})

test('lost response retries the committed request without another purchase', async ({ page }) => {
  let originalId = ''
  let requestId = ''
  let calls = 0
  await page.route('**/api/purchase', async (route) => {
    calls++
    const payload = route.request().postDataJSON() as { requestId: string }
    if (calls === 1) {
      requestId = payload.requestId
      const result = await route.fetch()
      expect(result.ok()).toBe(true)
      originalId = (await result.json()).purchase.id
      await route.abort('failed')
    } else {
      expect(payload.requestId).toBe(requestId)
      await route.continue()
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть весь мир' }).click()
  await expect(page.getByRole('alert')).toContainText('Не получилось подтвердить покупку')
  await page.screenshot({
    path: test.info().outputPath('error-390.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Попробовать ещё раз', exact: true }).click()
  await expect(page.getByRole('heading', { name: /теперь открыт/ })).toBeVisible()
  await page.getByRole('button', { name: 'Посмотреть детали покупки' }).click()
  await expect(page.locator('#receipt-details dd').first()).toHaveText(originalId)
  expect(calls).toBe(2)
})

test('concurrent first tabs share identity despite a delayed bootstrap response', async ({
  context,
}) => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let bothArrived = () => {}
  const arrivals = new Promise<void>((resolve) => {
    bothArrived = resolve
  })
  const bootstraps: { id: string; page: Page }[] = []
  await context.route('**/api/offers', async (route) => {
    const order = bootstraps.push({
      id: route.request().headers()['x-lumi-bootstrap'] || '',
      page: route.request().frame().page(),
    })
    if (order === 2) bothArrived()
    await arrivals
    // Node fetch has no browser cookie jar: Set-Cookie is applied only at fulfill.
    // Preserve the original headers, captured before either bootstrap response.
    expect(route.request().headers().cookie).toBeUndefined()
    const result = await fetch(route.request().url(), { headers: route.request().headers() })
    const body = await result.text()
    if (order === 2) await gate
    await route.fulfill({
      status: result.status,
      headers: Object.fromEntries(result.headers),
      body,
    })
  })
  const first = await context.newPage()
  const second = await context.newPage()
  try {
    await Promise.all([first.goto('/'), second.goto('/')])
    await expect.poll(() => bootstraps.length).toBe(2)
    const fast = bootstraps[0]!
    const delayed = bootstraps[1]!
    expect(fast.id).not.toBe('')
    expect(delayed.id).toBe(fast.id)
    await fast.page.getByRole('button', { name: 'Открыть весь мир' }).click()
    await expect(fast.page.getByRole('heading', { name: /теперь открыт/ })).toBeVisible()
    release()
    await delayed.page.getByRole('button', { name: 'Восстановить покупки' }).click()
    await expect(delayed.page.getByText('Покупка восстановлена', { exact: true })).toBeVisible()
  } finally {
    bothArrived()
    release()
  }
})

test('restoration stays usable when catalog loading fails', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть весь мир' }).click()
  await expect(page.getByRole('heading', { name: /теперь открыт/ })).toBeVisible()
  await page.route('**/api/offers', (route) => route.abort('failed'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Тарифы немного задержались' })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить покупки' }).click()
  await expect(page.getByText('Покупка восстановлена', { exact: true })).toBeVisible()
})

for (const width of [360, 390, 430]) {
  test(`mobile layout and keyboard selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 838 })
    await page.goto('/')
    const yearly = page.getByRole('radio', { name: /На целый год/ })
    await expect(yearly).toBeChecked()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: test.info().outputPath(`main-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    await yearly.focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: /На один месяц/ })).toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    await expect(page.getByRole('button', { name: 'Открыть весь мир' })).toBeEnabled()
  })
}

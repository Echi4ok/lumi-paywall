import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../server/infrastructure/database/create-database'

describe('database configuration', () => {
  it.each([{ NODE_ENV: 'production' }, { NODE_ENV: 'development', VERCEL: '1' }])(
    'refuses ephemeral storage in a deployed environment: %j',
    async (environment) => {
      await expect(createDatabase(environment)).rejects.toThrow(
        'DATABASE_URL is required in production',
      )
    },
  )
})

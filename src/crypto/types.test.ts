import { describe, expect, it } from 'vitest'
import { parseVaultPayload } from './types'

describe('vault payload migration', () => {
  it('migrates origin-based credentials into route-based site profiles', () => {
    const timestamp = '2026-10-29T00:00:00.000Z'
    const migrated = parseVaultPayload({
      version: 1,
      credentials: [
        {
          id: 'credential-admin',
          label: '管理员',
          origin: 'https://example.com',
          loginUrl: 'https://example.com/admin/login',
          username: 'admin',
          password: 'admin-password',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'credential-customer',
          label: '客户',
          origin: 'https://example.com',
          loginUrl: 'https://example.com/customer/login',
          username: 'customer',
          password: 'customer-password',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      siteAliases: {
        'https://example.com': '旧版站点别名',
      },
    })

    expect(migrated.version).toBe(2)
    expect(migrated.sites).toHaveLength(2)
    expect(migrated.sites.map((site) => site.loginUrl)).toEqual([
      'https://example.com/admin/login',
      'https://example.com/customer/login',
    ])
    expect(migrated.sites.every((site) => site.alias === '旧版站点别名')).toBe(true)
    expect(migrated.credentials.map((credential) => credential.siteId)).toEqual([
      'legacy-site-credential-admin',
      'legacy-site-credential-customer',
    ])
  })

  it('keeps credentials sharing one login route in the same profile', () => {
    const timestamp = '2026-10-29T00:00:00.000Z'
    const migrated = parseVaultPayload({
      version: 1,
      credentials: ['one', 'two'].map((id) => ({
        id,
        label: id,
        origin: 'https://example.com',
        loginUrl: 'https://example.com/login',
        username: id,
        password: id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      siteAliases: {},
    })

    expect(migrated.sites).toHaveLength(1)
    expect(new Set(migrated.credentials.map((credential) => credential.siteId)).size).toBe(1)
  })
})

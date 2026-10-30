import { describe, expect, it } from 'vitest'
import { createEmptyVaultPayload } from '../crypto/types'
import {
  deleteCredentialsForOrigin,
  deleteCredential,
  getCredentialById,
  getSiteAlias,
  listCredentialsForOrigin,
  listSavedSites,
  normalizeHttpOrigin,
  saveCredential,
  setSiteAlias,
} from './credential-service'

const now = '2026-10-29T00:00:00.000Z'

describe('credential service', () => {
  it('creates a credential and returns a summary without its password', () => {
    const saved = saveCredential(
      createEmptyVaultPayload(),
      {
        label: '管理员',
        origin: 'https://example.com/login',
        username: 'admin@example.com',
        password: 'site password',
      },
      { now, createId: () => 'credential-1' },
    )
    const summaries = listCredentialsForOrigin(
      saved.payload,
      'https://example.com/another-page',
    )

    expect(saved.credential.origin).toBe('https://example.com')
    expect(summaries).toEqual([
      {
        id: 'credential-1',
        label: '管理员',
        username: 'admin@example.com',
        updatedAt: now,
      },
    ])
    expect(summaries[0]).not.toHaveProperty('password')
  })

  it('updates a credential while preserving its id and creation time', () => {
    const created = saveCredential(
      createEmptyVaultPayload(),
      {
        label: '旧名称',
        origin: 'https://example.com',
        username: 'old-user',
        password: 'old-password',
      },
      { now, createId: () => 'credential-1' },
    )
    const updated = saveCredential(
      created.payload,
      {
        id: 'credential-1',
        label: '新名称',
        origin: 'https://example.com',
        username: 'new-user',
        password: 'new-password',
      },
      {
        now: '2026-10-30T00:00:00.000Z',
        createId: () => 'unused',
      },
    )

    expect(updated.credential.id).toBe('credential-1')
    expect(updated.credential.createdAt).toBe(now)
    expect(updated.credential.password).toBe('new-password')
  })

  it('deletes a credential by id', () => {
    const created = saveCredential(
      createEmptyVaultPayload(),
      {
        label: '测试账号',
        origin: 'https://example.com',
        username: 'tester',
        password: 'password',
      },
      { now, createId: () => 'credential-1' },
    )

    const payload = deleteCredential(created.payload, 'credential-1')
    expect(getCredentialById(payload, 'credential-1')).toBeNull()
  })

  it('rejects unsupported origins', () => {
    expect(() => normalizeHttpOrigin('chrome://extensions')).toThrow()
  })

  it('stores a trimmed alias and lists grouped saved sites', () => {
    const first = saveCredential(
      createEmptyVaultPayload(),
      {
        label: '管理员',
        origin: 'https://example.com/login',
        username: 'admin',
        password: 'password',
      },
      { now, createId: () => 'credential-1' },
    )
    const second = saveCredential(
      first.payload,
      {
        label: '普通用户',
        origin: 'https://example.com/other',
        username: 'user',
        password: 'password',
      },
      {
        now: '2026-10-30T00:00:00.000Z',
        createId: () => 'credential-2',
      },
    )
    const withAlias = setSiteAlias(
      second.payload,
      'https://example.com/path',
      '  公司后台  ',
    )

    expect(getSiteAlias(withAlias, 'https://example.com')).toBe('公司后台')
    expect(listSavedSites(withAlias)).toEqual([
      {
        origin: 'https://example.com',
        hostname: 'example.com',
        alias: '公司后台',
        loginUrl: 'https://example.com/',
        credentialCount: 2,
        updatedAt: '2026-10-30T00:00:00.000Z',
      },
    ])
  })

  it('deletes every credential and the alias for one site only', () => {
    const first = saveCredential(
      createEmptyVaultPayload(),
      {
        label: '站点 A',
        origin: 'https://a.example.com',
        username: 'a',
        password: 'password',
      },
      { now, createId: () => 'credential-a' },
    )
    const second = saveCredential(
      first.payload,
      {
        label: '站点 B',
        origin: 'https://b.example.com',
        username: 'b',
        password: 'password',
      },
      { now, createId: () => 'credential-b' },
    )
    const withAlias = setSiteAlias(second.payload, 'https://a.example.com', '站点 A')
    const deleted = deleteCredentialsForOrigin(withAlias, 'https://a.example.com/login')

    expect(deleted.deletedCredentialCount).toBe(1)
    expect(deleted.payload.credentials).toHaveLength(1)
    expect(deleted.payload.credentials[0].origin).toBe('https://b.example.com')
    expect(getSiteAlias(deleted.payload, 'https://a.example.com')).toBe('')
  })

  it('stores a site alias without a character limit', () => {
    const alias = '这是一个不限制字符数量的登录页面别名'
    const payload = setSiteAlias(
      createEmptyVaultPayload(),
      'https://example.com',
      `  ${alias}  `,
    )

    expect(getSiteAlias(payload, 'https://example.com')).toBe(alias)
  })

  it('stores a full same-origin login route and rejects another origin', () => {
    const saved = saveCredential(
      createEmptyVaultPayload(),
      {
        label: '管理员',
        origin: 'https://example.com',
        loginUrl: 'https://example.com/auth/login?from=admin',
        username: 'admin',
        password: 'password',
      },
      { now, createId: () => 'credential-1' },
    )

    expect(saved.credential.loginUrl).toBe(
      'https://example.com/auth/login?from=admin',
    )
    expect(listSavedSites(saved.payload)[0].loginUrl).toBe(
      'https://example.com/auth/login?from=admin',
    )
    expect(() =>
      saveCredential(
        createEmptyVaultPayload(),
        {
          label: '管理员',
          origin: 'https://example.com',
          loginUrl: 'https://evil.example/login',
          username: 'admin',
          password: 'password',
        },
        { now, createId: () => 'credential-2' },
      ),
    ).toThrow()
  })
})

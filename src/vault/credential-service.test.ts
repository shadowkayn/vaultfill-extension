import { describe, expect, it } from 'vitest'
import { createEmptyVaultPayload } from '../crypto/types'
import {
  deleteCredentialsForSite,
  deleteCredential,
  getCredentialById,
  getCredentialDetails,
  listCredentialsForSite,
  listSavedSites,
  listSiteProfilesForPage,
  normalizeHttpOrigin,
  resolveSiteProfileForPage,
  saveCredential,
  setSiteAlias,
} from './credential-service'

const now = '2026-10-29T00:00:00.000Z'

function saveTestCredential(
  payload = createEmptyVaultPayload(),
  overrides: Partial<Parameters<typeof saveCredential>[1]> = {},
  ids = { credential: 'credential-1', site: 'site-1' },
) {
  return saveCredential(
    payload,
    {
      label: '管理员',
      origin: 'https://example.com',
      loginUrl: 'https://example.com/admin/login',
      username: 'admin@example.com',
      password: 'site password',
      ...overrides,
    },
    {
      now,
      createCredentialId: () => ids.credential,
      createSiteId: () => ids.site,
    },
  )
}

describe('credential service', () => {
  it('creates a login-page profile and links the credential by site id', () => {
    const saved = saveTestCredential()
    const summaries = listCredentialsForSite(saved.payload, saved.site.id)

    expect(saved.site).toMatchObject({
      id: 'site-1',
      origin: 'https://example.com',
      loginUrl: 'https://example.com/admin/login',
    })
    expect(saved.credential.siteId).toBe('site-1')
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

  it('keeps different login routes on the same origin as separate profiles', () => {
    const first = saveTestCredential()
    const second = saveTestCredential(
      first.payload,
      {
        label: '客户账号',
        loginUrl: 'https://example.com/customer/login',
        username: 'customer',
      },
      { credential: 'credential-2', site: 'site-2' },
    )

    expect(second.payload.sites).toHaveLength(2)
    expect(listSavedSites(second.payload)).toEqual([
      expect.objectContaining({
        id: 'site-1',
        loginUrl: 'https://example.com/admin/login',
        credentialCount: 1,
      }),
      expect.objectContaining({
        id: 'site-2',
        loginUrl: 'https://example.com/customer/login',
        credentialCount: 1,
      }),
    ])
    expect(
      resolveSiteProfileForPage(
        second.payload,
        'https://example.com/customer/login',
      )?.id,
    ).toBe('site-2')
    expect(
      resolveSiteProfileForPage(second.payload, 'https://example.com/home'),
    ).toBeNull()
  })

  it('reuses a profile when another account uses the same login URL', () => {
    const first = saveTestCredential()
    const second = saveTestCredential(
      first.payload,
      { label: '普通用户', username: 'user@example.com' },
      { credential: 'credential-2', site: 'unused-site' },
    )

    expect(second.payload.sites).toHaveLength(1)
    expect(second.credential.siteId).toBe(first.site.id)
    expect(listCredentialsForSite(second.payload, first.site.id)).toHaveLength(2)
  })

  it('updates a credential and exposes its login-page details', () => {
    const created = saveTestCredential()
    const updated = saveTestCredential(
      created.payload,
      {
        id: created.credential.id,
        siteId: created.site.id,
        label: '新名称',
        username: 'new-user',
        password: 'new-password',
      },
      { credential: 'unused', site: 'unused' },
    )

    expect(updated.credential.id).toBe('credential-1')
    expect(updated.credential.createdAt).toBe(now)
    expect(getCredentialDetails(updated.payload, 'credential-1')).toMatchObject({
      origin: 'https://example.com',
      loginUrl: 'https://example.com/admin/login',
      password: 'new-password',
    })
  })

  it('moves one account to a new profile when a shared login route is edited', () => {
    const first = saveTestCredential()
    const second = saveTestCredential(
      first.payload,
      { label: '普通用户', username: 'user@example.com' },
      { credential: 'credential-2', site: 'unused-site' },
    )
    const moved = saveTestCredential(
      second.payload,
      {
        id: second.credential.id,
        siteId: first.site.id,
        label: '普通用户',
        loginUrl: 'https://example.com/customer/login',
        username: 'user@example.com',
      },
      { credential: 'unused', site: 'site-2' },
    )

    expect(moved.payload.sites).toHaveLength(2)
    expect(getCredentialById(moved.payload, 'credential-1')?.siteId).toBe('site-1')
    expect(getCredentialById(moved.payload, 'credential-2')?.siteId).toBe('site-2')
    expect(moved.site.loginUrl).toBe('https://example.com/customer/login')
  })

  it('stores an alias on one exact login-page profile', () => {
    const first = saveTestCredential()
    const second = saveTestCredential(
      first.payload,
      { loginUrl: 'https://example.com/customer/login' },
      { credential: 'credential-2', site: 'site-2' },
    )
    const updated = setSiteAlias(
      second.payload,
      {
        pageUrl: first.site.loginUrl,
        siteId: first.site.id,
        alias: '  公司管理员入口  ',
      },
      { now, createSiteId: () => 'unused' },
    )

    expect(updated.site.alias).toBe('公司管理员入口')
    expect(updated.payload.sites.find((site) => site.id === 'site-2')?.alias).toBe('')
    expect(listSiteProfilesForPage(updated.payload, first.site.loginUrl)).toHaveLength(2)
  })

  it('stores a site alias without a character limit', () => {
    const alias = '这是一个不限制字符数量的登录页面别名'
    const updated = setSiteAlias(
      createEmptyVaultPayload(),
      { pageUrl: 'https://example.com/login', alias: `  ${alias}  ` },
      { now, createSiteId: () => 'site-1' },
    )

    expect(updated.site.alias).toBe(alias)
  })

  it('deletes one profile and only its linked credentials', () => {
    const first = saveTestCredential()
    const second = saveTestCredential(
      first.payload,
      {
        origin: 'https://other.example.com',
        loginUrl: 'https://other.example.com/login',
      },
      { credential: 'credential-2', site: 'site-2' },
    )
    const deleted = deleteCredentialsForSite(second.payload, first.site.id)

    expect(deleted.deletedCredentialCount).toBe(1)
    expect(deleted.payload.sites.map((site) => site.id)).toEqual(['site-2'])
    expect(deleted.payload.credentials.map((credential) => credential.id)).toEqual([
      'credential-2',
    ])
  })

  it('removes an empty profile after deleting its last credential', () => {
    const created = saveTestCredential()
    const payload = deleteCredential(created.payload, created.credential.id)

    expect(getCredentialById(payload, created.credential.id)).toBeNull()
    expect(payload.sites).toHaveLength(0)
  })

  it('rejects unsupported origins and cross-origin login URLs', () => {
    expect(() => normalizeHttpOrigin('chrome://extensions')).toThrow()
    expect(() =>
      saveTestCredential(createEmptyVaultPayload(), {
        loginUrl: 'https://evil.example/login',
      }),
    ).toThrow()
  })
})

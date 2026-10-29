import { describe, expect, it } from 'vitest'
import { createEmptyVaultPayload } from '../crypto/types'
import {
  deleteCredential,
  getCredentialById,
  listCredentialsForOrigin,
  normalizeHttpOrigin,
  saveCredential,
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
})

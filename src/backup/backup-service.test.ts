import { describe, expect, it } from 'vitest'
import { createEmptyVaultPayload, isEncryptedVault } from '../crypto/types'
import {
  createEncryptedVault,
  unlockWithMasterPassword,
} from '../crypto/vault-crypto'
import { createVaultBackup, parseVaultBackupText } from './backup-service'

describe('encrypted backup service', () => {
  it('creates and parses an encrypted VaultFill backup', async () => {
    const payload = createEmptyVaultPayload()
    payload.sites.push({
      id: 'site-1',
      alias: '公司后台',
      origin: 'https://example.com',
      loginUrl: 'https://example.com/admin/login',
      createdAt: '2026-10-30T00:00:00.000Z',
      updatedAt: '2026-10-30T00:00:00.000Z',
    })
    payload.credentials.push({
      id: 'credential-1',
      siteId: 'site-1',
      label: '管理员',
      username: 'admin@example.com',
      password: 'a-real-site-password',
      createdAt: '2026-10-30T00:00:00.000Z',
      updatedAt: '2026-10-30T00:00:00.000Z',
    })
    const encrypted = await createEncryptedVault(
      payload,
      'a strong backup password',
    )
    const backup = createVaultBackup(encrypted.encryptedVault, {
      exportedAt: '2026-10-30T00:00:00.000Z',
      appVersion: '0.6.0',
    })

    const serialized = JSON.stringify(backup)
    const parsed = parseVaultBackupText(serialized)

    expect(parsed).toEqual(backup)
    expect(serialized).not.toContain('a strong backup password')
    expect(serialized).not.toContain('admin@example.com')
    expect(serialized).not.toContain('a-real-site-password')
    expect(isEncryptedVault(parsed.encryptedVault)).toBe(true)
    if (!isEncryptedVault(parsed.encryptedVault)) {
      throw new Error('Expected a current encrypted vault backup.')
    }
    await expect(
      unlockWithMasterPassword(parsed.encryptedVault, 'a strong backup password'),
    ).resolves.toMatchObject({ payload })
  })

  it('rejects unrelated or unsupported files', () => {
    expect(() => parseVaultBackupText('{}')).toThrow()
    expect(() =>
      parseVaultBackupText(JSON.stringify({
        format: 'vaultfill-encrypted-backup',
        backupVersion: 999,
      })),
    ).toThrow()
  })
})

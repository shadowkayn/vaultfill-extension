import {
  isEncryptedVault,
  isLegacyEncryptedVault,
  type StoredVault,
} from '../crypto/types'
import {
  VAULT_BACKUP_FORMAT,
  VAULT_BACKUP_VERSION,
  type VaultBackupFile,
} from './types'

export const MAX_BACKUP_FILE_SIZE_BYTES = 16 * 1024 * 1024

export function createVaultBackup(
  encryptedVault: StoredVault,
  options: { exportedAt: string; appVersion: string },
): VaultBackupFile {
  return {
    format: VAULT_BACKUP_FORMAT,
    backupVersion: VAULT_BACKUP_VERSION,
    exportedAt: options.exportedAt,
    appVersion: options.appVersion,
    encryptedVault,
  }
}

export function parseVaultBackupText(value: string): VaultBackupFile {
  if (!value || new Blob([value]).size > MAX_BACKUP_FILE_SIZE_BYTES) {
    throw new Error('The backup file is empty or too large.')
  }

  const parsed = JSON.parse(value) as unknown

  if (!isVaultBackupFile(parsed)) {
    throw new Error('The backup file format is invalid.')
  }

  return parsed
}

function isVaultBackupFile(value: unknown): value is VaultBackupFile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const backup = value as Partial<VaultBackupFile>
  return (
    backup.format === VAULT_BACKUP_FORMAT &&
    backup.backupVersion === VAULT_BACKUP_VERSION &&
    typeof backup.exportedAt === 'string' &&
    typeof backup.appVersion === 'string' &&
    (isEncryptedVault(backup.encryptedVault) ||
      isLegacyEncryptedVault(backup.encryptedVault))
  )
}

import type { StoredVault } from '../crypto/types'

export const VAULT_BACKUP_FORMAT = 'vaultfill-encrypted-backup' as const
export const VAULT_BACKUP_VERSION = 1 as const

export type VaultBackupFile = {
  format: typeof VAULT_BACKUP_FORMAT
  backupVersion: typeof VAULT_BACKUP_VERSION
  exportedAt: string
  appVersion: string
  encryptedVault: StoredVault
}

export type BackupImportAuthentication =
  | {
      type: 'master-password'
      masterPassword: string
    }
  | {
      type: 'recovery-key'
      recoveryKey: string
      newMasterPassword: string
    }

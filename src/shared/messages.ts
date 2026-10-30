import type {
  BackupImportAuthentication,
  VaultBackupFile,
} from '../backup/types'
import type { Credential, SiteProfile } from '../crypto/types'

export const RESET_VAULT_CONFIRMATION = '删除我的密码库'
export const IMPORT_VAULT_CONFIRMATION = '覆盖当前密码库'

export type CredentialSummary = Pick<
  Credential,
  'id' | 'label' | 'username' | 'updatedAt'
>

export type CredentialInput = Pick<Credential, 'label' | 'username' | 'password'> & {
  id?: string
  siteId?: string
  origin: string
  loginUrl: string
  notes?: string
}

export type CredentialDetails = Credential & {
  origin: string
  loginUrl: string
}

export type SiteProfileSummary = Pick<
  SiteProfile,
  'id' | 'alias' | 'origin' | 'loginUrl' | 'updatedAt'
> & {
  hostname: string
  credentialCount: number
}

export type SiteSummary = SiteProfileSummary

export type VaultStatus = {
  hasVault: boolean
  isUnlocked: boolean
  formatVersion: number | null
}

export type FillResult = {
  status: 'filled'
  usernameFieldFound: boolean
  passwordFieldFound: boolean
}

export type VaultMessage =
  | { type: 'GET_VAULT_STATUS' }
  | { type: 'CREATE_VAULT'; masterPassword: string }
  | { type: 'UNLOCK_VAULT'; masterPassword: string }
  | {
      type: 'RECOVER_VAULT'
      recoveryKey: string
      newMasterPassword: string
    }
  | {
      type: 'CHANGE_MASTER_PASSWORD'
      currentMasterPassword: string
      newMasterPassword: string
    }
  | { type: 'ROTATE_RECOVERY_KEY' }
  | { type: 'EXPORT_VAULT_BACKUP' }
  | {
      type: 'IMPORT_VAULT_BACKUP'
      backupText: string
      authentication: BackupImportAuthentication
      confirmation: string
    }
  | { type: 'LIST_CREDENTIALS'; pageUrl: string; siteId?: string }
  | { type: 'LIST_SITES' }
  | { type: 'SET_SITE_ALIAS'; pageUrl: string; siteId?: string; alias: string }
  | { type: 'DELETE_SITE_CREDENTIALS'; siteId: string }
  | { type: 'GET_CREDENTIAL'; credentialId: string }
  | { type: 'SAVE_CREDENTIAL'; credential: CredentialInput }
  | { type: 'DELETE_CREDENTIAL'; credentialId: string }
  | {
      type: 'FILL_CREDENTIAL'
      credentialId: string
      expectedOrigin: string
    }
  | { type: 'LOCK_VAULT' }
  | {
      type: 'RESET_VAULT'
      confirmation: string
    }

export type VaultErrorCode =
  | 'INVALID_REQUEST'
  | 'VAULT_ALREADY_EXISTS'
  | 'VAULT_NOT_FOUND'
  | 'VAULT_LOCKED'
  | 'UNLOCK_FAILED'
  | 'RECOVERY_FAILED'
  | 'BACKUP_EXPORT_FAILED'
  | 'BACKUP_IMPORT_FAILED'
  | 'ORIGIN_MISMATCH'
  | 'FILL_FAILED'
  | 'STORAGE_ERROR'

export type VaultResponse =
  | {
      ok: true
      status: VaultStatus
      recoveryKey?: string
      backup?: VaultBackupFile
      credentials?: CredentialSummary[]
      credential?: CredentialDetails
      sites?: SiteSummary[]
      siteProfiles?: SiteProfileSummary[]
      activeSite?: SiteProfileSummary | null
      siteAlias?: string
      deletedCredentialCount?: number
      fillResult?: FillResult
    }
  | {
      ok: false
      error: {
        code: VaultErrorCode
        message: string
      }
    }

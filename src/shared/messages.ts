import type { Credential } from '../crypto/types'

export const RESET_VAULT_CONFIRMATION = '删除我的密码库'

export type CredentialSummary = Pick<
  Credential,
  'id' | 'label' | 'username' | 'updatedAt'
>

export type CredentialInput = Pick<
  Credential,
  'label' | 'origin' | 'username' | 'password'
> & {
  id?: string
  notes?: string
}

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
  | { type: 'LIST_CREDENTIALS'; origin: string }
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
  | 'ORIGIN_MISMATCH'
  | 'FILL_FAILED'
  | 'STORAGE_ERROR'

export type VaultResponse =
  | {
      ok: true
      status: VaultStatus
      recoveryKey?: string
      credentials?: CredentialSummary[]
      credential?: Credential
      fillResult?: FillResult
    }
  | {
      ok: false
      error: {
        code: VaultErrorCode
        message: string
      }
    }

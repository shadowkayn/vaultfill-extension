export const RESET_VAULT_CONFIRMATION = '删除我的密码库'

export type VaultStatus = {
  hasVault: boolean
  isUnlocked: boolean
  formatVersion: number | null
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
  | 'STORAGE_ERROR'

export type VaultResponse =
  | {
      ok: true
      status: VaultStatus
      recoveryKey?: string
    }
  | {
      ok: false
      error: {
        code: VaultErrorCode
        message: string
      }
    }

import {
  isEncryptedVault,
  isLegacyEncryptedVault,
  type StoredVault,
} from '../crypto/types'

const ENCRYPTED_VAULT_KEY = 'vaultfill.encryptedVault'

export async function getStoredVault(): Promise<StoredVault | null> {
  const result = await chrome.storage.local.get(ENCRYPTED_VAULT_KEY)
  const storedVault: unknown = result[ENCRYPTED_VAULT_KEY]

  if (storedVault === undefined) {
    return null
  }

  if (!isEncryptedVault(storedVault) && !isLegacyEncryptedVault(storedVault)) {
    throw new Error('The stored vault has an unsupported format.')
  }

  return storedVault
}

export async function saveStoredVault(
  encryptedVault: StoredVault,
): Promise<void> {
  await chrome.storage.local.set({
    [ENCRYPTED_VAULT_KEY]: encryptedVault,
  })
}

export async function clearStoredVault(): Promise<void> {
  await chrome.storage.local.remove(ENCRYPTED_VAULT_KEY)
}

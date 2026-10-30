import { base64ToBytes } from './encoding'
import { deriveVaultKeyBytes, importVaultKey } from './key-derivation'
import type { LegacyEncryptedVault, VaultPayload } from './types'

const legacyAdditionalData = new TextEncoder().encode('vaultfill:v1')
const textDecoder = new TextDecoder('utf-8', { fatal: true })

export async function unlockLegacyVault(
  encryptedVault: LegacyEncryptedVault,
  masterPassword: string,
): Promise<VaultPayload> {
  const keyBytes = await deriveVaultKeyBytes(
    masterPassword,
    base64ToBytes(encryptedVault.kdf.salt),
    encryptedVault.kdf.iterations,
  )
  const key = await importVaultKey(keyBytes)
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(encryptedVault.cipher.iv),
      additionalData: legacyAdditionalData,
      tagLength: 128,
    },
    key,
    base64ToBytes(encryptedVault.cipher.ciphertext),
  )
  const payload = JSON.parse(textDecoder.decode(plaintext)) as unknown

  if (!isVaultPayload(payload)) {
    throw new Error('The legacy vault has an unsupported format.')
  }

  return payload
}

function isVaultPayload(value: unknown): value is VaultPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<VaultPayload>
  return (
    payload.version === 1 &&
    Array.isArray(payload.credentials) &&
    isOptionalSiteAliasRecord(payload.siteAliases)
  )
}

function isOptionalSiteAliasRecord(value: unknown): boolean {
  if (value === undefined) {
    return true
  }

  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((alias) => typeof alias === 'string')
  )
}

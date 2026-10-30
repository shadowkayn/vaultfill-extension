import { base64ToBytes } from './encoding'
import { deriveVaultKeyBytes, importVaultKey } from './key-derivation'
import {
  parseVaultPayload,
  type LegacyEncryptedVault,
  type VaultPayload,
} from './types'

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
  return parseVaultPayload(payload)
}

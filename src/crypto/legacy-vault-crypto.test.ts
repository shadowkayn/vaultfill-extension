import { expect, it } from 'vitest'
import { bytesToBase64 } from './encoding'
import { deriveVaultKeyBytes, importVaultKey } from './key-derivation'
import { unlockLegacyVault } from './legacy-vault-crypto'
import {
  createEmptyVaultPayload,
  PBKDF2_ITERATIONS,
  type LegacyEncryptedVault,
} from './types'

it('decrypts the version 1 vault format for migration', async () => {
  const masterPassword = 'legacy master password'
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const keyBytes = await deriveVaultKeyBytes(
    masterPassword,
    salt,
    PBKDF2_ITERATIONS,
  )
  const key = await importVaultKey(keyBytes)
  const legacyPayload = {
    version: 1,
    credentials: [],
    siteAliases: {},
  }
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode('vaultfill:v1'),
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(JSON.stringify(legacyPayload)),
  )
  const timestamp = new Date().toISOString()
  const legacyVault: LegacyEncryptedVault = {
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      keyLength: 256,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await expect(
    unlockLegacyVault(legacyVault, masterPassword),
  ).resolves.toEqual(createEmptyVaultPayload())
})

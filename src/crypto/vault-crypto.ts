import { base64ToBytes, bytesToBase64 } from './encoding'
import { deriveVaultKeyBytes, importVaultKey } from './key-derivation'
import { generateRecoveryKey, normalizeRecoveryKey } from './recovery-key'
import {
  PBKDF2_ITERATIONS,
  VAULT_FORMAT_VERSION,
  type EncryptedData,
  type EncryptedVault,
  type VaultPayload,
  type WrappedDataKey,
} from './types'

const DATA_KEY_LENGTH_BYTES = 32
const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12
const AES_GCM_TAG_LENGTH_BITS = 128
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const vaultAdditionalData = textEncoder.encode('vaultfill:v2:vault')
const masterKeyAdditionalData = textEncoder.encode(
  'vaultfill:v2:key-slot:master-password',
)
const recoveryKeyAdditionalData = textEncoder.encode(
  'vaultfill:v2:key-slot:recovery-key',
)

export type NewEncryptedVaultResult = {
  encryptedVault: EncryptedVault
  recoveryKey: string
  sessionDataKey: string
}

export type VaultUnlockResult = {
  payload: VaultPayload
  sessionDataKey: string
}

export async function createEncryptedVault(
  payload: VaultPayload,
  masterPassword: string,
): Promise<NewEncryptedVaultResult> {
  const dataKeyBytes = crypto.getRandomValues(
    new Uint8Array(DATA_KEY_LENGTH_BYTES),
  )
  const recoveryKey = generateRecoveryKey()
  const timestamp = new Date().toISOString()

  return {
    encryptedVault: {
      version: VAULT_FORMAT_VERSION,
      vaultCipher: await encryptVaultPayload(payload, dataKeyBytes),
      keySlots: {
        masterPassword: await wrapDataKey(
          dataKeyBytes,
          masterPassword,
          masterKeyAdditionalData,
        ),
        recoveryKey: await wrapDataKey(
          dataKeyBytes,
          normalizeRecoveryKey(recoveryKey),
          recoveryKeyAdditionalData,
        ),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    recoveryKey,
    sessionDataKey: bytesToBase64(dataKeyBytes),
  }
}

export async function unlockWithMasterPassword(
  encryptedVault: EncryptedVault,
  masterPassword: string,
): Promise<VaultUnlockResult> {
  const dataKeyBytes = await unwrapDataKey(
    encryptedVault.keySlots.masterPassword,
    masterPassword,
    masterKeyAdditionalData,
  )

  return {
    payload: await decryptVaultPayload(encryptedVault, dataKeyBytes),
    sessionDataKey: bytesToBase64(dataKeyBytes),
  }
}

export async function unlockWithRecoveryKey(
  encryptedVault: EncryptedVault,
  recoveryKey: string,
): Promise<VaultUnlockResult> {
  const dataKeyBytes = await unwrapDataKey(
    encryptedVault.keySlots.recoveryKey,
    normalizeRecoveryKey(recoveryKey),
    recoveryKeyAdditionalData,
  )

  return {
    payload: await decryptVaultPayload(encryptedVault, dataKeyBytes),
    sessionDataKey: bytesToBase64(dataKeyBytes),
  }
}

export async function decryptVaultWithSessionDataKey(
  encryptedVault: EncryptedVault,
  sessionDataKey: string,
): Promise<VaultPayload> {
  return decryptVaultPayload(
    encryptedVault,
    base64ToBytes(sessionDataKey),
  )
}

export async function encryptVaultWithSessionDataKey(
  payload: VaultPayload,
  encryptedVault: EncryptedVault,
  sessionDataKey: string,
): Promise<EncryptedVault> {
  return {
    ...encryptedVault,
    vaultCipher: await encryptVaultPayload(
      payload,
      base64ToBytes(sessionDataKey),
    ),
    updatedAt: new Date().toISOString(),
  }
}

export async function replaceMasterPasswordSlot(
  encryptedVault: EncryptedVault,
  sessionDataKey: string,
  newMasterPassword: string,
): Promise<EncryptedVault> {
  const dataKeyBytes = base64ToBytes(sessionDataKey)

  return {
    ...encryptedVault,
    keySlots: {
      ...encryptedVault.keySlots,
      masterPassword: await wrapDataKey(
        dataKeyBytes,
        newMasterPassword,
        masterKeyAdditionalData,
      ),
    },
    updatedAt: new Date().toISOString(),
  }
}

export async function rotateRecoveryKeySlot(
  encryptedVault: EncryptedVault,
  sessionDataKey: string,
): Promise<{ encryptedVault: EncryptedVault; recoveryKey: string }> {
  const dataKeyBytes = base64ToBytes(sessionDataKey)
  const recoveryKey = generateRecoveryKey()

  return {
    encryptedVault: {
      ...encryptedVault,
      keySlots: {
        ...encryptedVault.keySlots,
        recoveryKey: await wrapDataKey(
          dataKeyBytes,
          normalizeRecoveryKey(recoveryKey),
          recoveryKeyAdditionalData,
        ),
      },
      updatedAt: new Date().toISOString(),
    },
    recoveryKey,
  }
}

async function wrapDataKey(
  dataKeyBytes: Uint8Array<ArrayBuffer>,
  secret: string,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<WrappedDataKey> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES))
  const wrappingKeyBytes = await deriveVaultKeyBytes(
    secret,
    salt,
    PBKDF2_ITERATIONS,
  )
  const wrappingKey = await importVaultKey(wrappingKeyBytes)

  return {
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: await encryptBytes(dataKeyBytes, wrappingKey, additionalData),
  }
}

async function unwrapDataKey(
  wrappedDataKey: WrappedDataKey,
  secret: string,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const wrappingKeyBytes = await deriveVaultKeyBytes(
    secret,
    base64ToBytes(wrappedDataKey.kdf.salt),
    wrappedDataKey.kdf.iterations,
  )
  const wrappingKey = await importVaultKey(wrappingKeyBytes)
  const dataKeyBytes = await decryptBytes(
    wrappedDataKey.cipher,
    wrappingKey,
    additionalData,
  )

  if (dataKeyBytes.byteLength !== DATA_KEY_LENGTH_BYTES) {
    throw new Error('The wrapped data key has an invalid length.')
  }

  return dataKeyBytes
}

async function encryptVaultPayload(
  payload: VaultPayload,
  dataKeyBytes: Uint8Array<ArrayBuffer>,
): Promise<EncryptedData> {
  const dataKey = await importVaultKey(dataKeyBytes)
  return encryptBytes(
    textEncoder.encode(JSON.stringify(payload)),
    dataKey,
    vaultAdditionalData,
  )
}

async function decryptVaultPayload(
  encryptedVault: EncryptedVault,
  dataKeyBytes: Uint8Array<ArrayBuffer>,
): Promise<VaultPayload> {
  const dataKey = await importVaultKey(dataKeyBytes)
  const plaintext = await decryptBytes(
    encryptedVault.vaultCipher,
    dataKey,
    vaultAdditionalData,
  )
  const payload = JSON.parse(textDecoder.decode(plaintext)) as unknown

  if (!isVaultPayload(payload)) {
    throw new Error('The decrypted vault has an unsupported format.')
  }

  return payload
}

async function encryptBytes(
  plaintext: Uint8Array<ArrayBuffer>,
  key: CryptoKey,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    key,
    plaintext,
  )

  return {
    name: 'AES-GCM',
    keyLength: 256,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

async function decryptBytes(
  encryptedData: EncryptedData,
  key: CryptoKey,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(encryptedData.iv),
      additionalData,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    key,
    base64ToBytes(encryptedData.ciphertext),
  )

  return new Uint8Array(plaintext)
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
    Object.entries(value).every(
      ([origin, alias]) =>
        typeof origin === 'string' && typeof alias === 'string',
    )
  )
}

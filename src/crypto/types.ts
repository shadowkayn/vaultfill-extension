export const VAULT_FORMAT_VERSION = 2 as const
export const LEGACY_VAULT_FORMAT_VERSION = 1 as const
export const PBKDF2_ITERATIONS = 600_000

export type Credential = {
  id: string
  label: string
  origin: string
  loginUrl?: string
  username: string
  password: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type VaultPayload = {
  version: 1
  credentials: Credential[]
  siteAliases?: Record<string, string>
}

export type KdfParameters = {
  name: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  salt: string
}

export type EncryptedData = {
  name: 'AES-GCM'
  keyLength: 256
  iv: string
  ciphertext: string
}

export type WrappedDataKey = {
  kdf: KdfParameters
  cipher: EncryptedData
}

export type EncryptedVault = {
  version: typeof VAULT_FORMAT_VERSION
  vaultCipher: EncryptedData
  keySlots: {
    masterPassword: WrappedDataKey
    recoveryKey: WrappedDataKey
  }
  createdAt: string
  updatedAt: string
}

export type LegacyEncryptedVault = {
  version: typeof LEGACY_VAULT_FORMAT_VERSION
  kdf: KdfParameters
  cipher: EncryptedData
  createdAt: string
  updatedAt: string
}

export type StoredVault = EncryptedVault | LegacyEncryptedVault

export function createEmptyVaultPayload(): VaultPayload {
  return {
    version: 1,
    credentials: [],
    siteAliases: {},
  }
}

export function isEncryptedVault(value: unknown): value is EncryptedVault {
  if (!value || typeof value !== 'object') {
    return false
  }

  const vault = value as Partial<EncryptedVault>

  return (
    vault.version === VAULT_FORMAT_VERSION &&
    isEncryptedData(vault.vaultCipher) &&
    isWrappedDataKey(vault.keySlots?.masterPassword) &&
    isWrappedDataKey(vault.keySlots?.recoveryKey) &&
    typeof vault.createdAt === 'string' &&
    typeof vault.updatedAt === 'string'
  )
}

export function isLegacyEncryptedVault(
  value: unknown,
): value is LegacyEncryptedVault {
  if (!value || typeof value !== 'object') {
    return false
  }

  const vault = value as Partial<LegacyEncryptedVault>

  return (
    vault.version === LEGACY_VAULT_FORMAT_VERSION &&
    isKdfParameters(vault.kdf) &&
    isEncryptedData(vault.cipher) &&
    typeof vault.createdAt === 'string' &&
    typeof vault.updatedAt === 'string'
  )
}

function isWrappedDataKey(value: unknown): value is WrappedDataKey {
  if (!value || typeof value !== 'object') {
    return false
  }

  const wrappedKey = value as Partial<WrappedDataKey>
  return (
    isKdfParameters(wrappedKey.kdf) && isEncryptedData(wrappedKey.cipher)
  )
}

function isKdfParameters(value: unknown): value is KdfParameters {
  if (!value || typeof value !== 'object') {
    return false
  }

  const kdf = value as Partial<KdfParameters>
  return (
    kdf.name === 'PBKDF2' &&
    kdf.hash === 'SHA-256' &&
    typeof kdf.iterations === 'number' &&
    Number.isSafeInteger(kdf.iterations) &&
    kdf.iterations >= 100_000 &&
    kdf.iterations <= 10_000_000 &&
    typeof kdf.salt === 'string'
  )
}

function isEncryptedData(value: unknown): value is EncryptedData {
  if (!value || typeof value !== 'object') {
    return false
  }

  const encryptedData = value as Partial<EncryptedData>
  return (
    encryptedData.name === 'AES-GCM' &&
    encryptedData.keyLength === 256 &&
    typeof encryptedData.iv === 'string' &&
    typeof encryptedData.ciphertext === 'string'
  )
}

export const VAULT_FORMAT_VERSION = 2 as const
export const LEGACY_VAULT_FORMAT_VERSION = 1 as const
export const VAULT_PAYLOAD_VERSION = 2 as const
export const PBKDF2_ITERATIONS = 600_000

export type SiteProfile = {
  id: string
  alias: string
  origin: string
  loginUrl: string
  createdAt: string
  updatedAt: string
}

export type Credential = {
  id: string
  siteId: string
  label: string
  username: string
  password: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type VaultPayload = {
  version: typeof VAULT_PAYLOAD_VERSION
  sites: SiteProfile[]
  credentials: Credential[]
}

type LegacyCredentialPayload = Omit<Credential, 'siteId'> & {
  origin: string
  loginUrl?: string
}

type LegacyVaultPayload = {
  version: 1
  credentials: LegacyCredentialPayload[]
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
    version: VAULT_PAYLOAD_VERSION,
    sites: [],
    credentials: [],
  }
}

export function parseVaultPayload(value: unknown): VaultPayload {
  if (isCurrentVaultPayload(value)) {
    return value
  }

  if (isLegacyVaultPayload(value)) {
    return migrateLegacyVaultPayload(value)
  }

  throw new Error('The decrypted vault has an unsupported format.')
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

function isCurrentVaultPayload(value: unknown): value is VaultPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<VaultPayload>

  if (
    payload.version !== VAULT_PAYLOAD_VERSION ||
    !Array.isArray(payload.sites) ||
    !Array.isArray(payload.credentials) ||
    !payload.sites.every(isSiteProfile) ||
    !payload.credentials.every(isCredential)
  ) {
    return false
  }

  const siteIds = new Set(payload.sites.map((site) => site.id))
  return (
    siteIds.size === payload.sites.length &&
    payload.credentials.every((credential) => siteIds.has(credential.siteId))
  )
}

function isLegacyVaultPayload(value: unknown): value is LegacyVaultPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<LegacyVaultPayload>
  return (
    payload.version === 1 &&
    Array.isArray(payload.credentials) &&
    payload.credentials.every(isLegacyCredential) &&
    isOptionalSiteAliasRecord(payload.siteAliases)
  )
}

function isSiteProfile(value: unknown): value is SiteProfile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const site = value as Partial<SiteProfile>
  return (
    isNonEmptyString(site.id) &&
    typeof site.alias === 'string' &&
    isHttpUrl(site.loginUrl, site.origin) &&
    isNonEmptyString(site.createdAt) &&
    isNonEmptyString(site.updatedAt)
  )
}

function isCredential(value: unknown): value is Credential {
  if (!value || typeof value !== 'object') {
    return false
  }

  const credential = value as Partial<Credential>
  return (
    isNonEmptyString(credential.id) &&
    isNonEmptyString(credential.siteId) &&
    isNonEmptyString(credential.label) &&
    isNonEmptyString(credential.username) &&
    typeof credential.password === 'string' &&
    (credential.notes === undefined || typeof credential.notes === 'string') &&
    isNonEmptyString(credential.createdAt) &&
    isNonEmptyString(credential.updatedAt)
  )
}

function isLegacyCredential(value: unknown): value is LegacyCredentialPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const credential = value as Partial<LegacyCredentialPayload>
  return (
    isNonEmptyString(credential.id) &&
    isNonEmptyString(credential.label) &&
    isNonEmptyString(credential.origin) &&
    (credential.loginUrl === undefined || typeof credential.loginUrl === 'string') &&
    isNonEmptyString(credential.username) &&
    typeof credential.password === 'string' &&
    (credential.notes === undefined || typeof credential.notes === 'string') &&
    isNonEmptyString(credential.createdAt) &&
    isNonEmptyString(credential.updatedAt)
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
      ([origin, alias]) => typeof origin === 'string' && typeof alias === 'string',
    )
  )
}

function migrateLegacyVaultPayload(payload: LegacyVaultPayload): VaultPayload {
  const sites: SiteProfile[] = []
  const sitesByLoginUrl = new Map<string, SiteProfile>()
  const usedSiteIds = new Set<string>()
  const credentials: Credential[] = []

  for (const legacyCredential of payload.credentials) {
    const origin = normalizeLegacyOrigin(legacyCredential.origin)
    const loginUrl = normalizeLegacyLoginUrl(
      legacyCredential.loginUrl ?? origin,
      origin,
    )
    let site = sitesByLoginUrl.get(loginUrl)

    if (!site) {
      const id = createUniqueLegacySiteId(
        `legacy-site-${legacyCredential.id}`,
        usedSiteIds,
      )
      site = {
        id,
        alias: payload.siteAliases?.[origin]?.trim() ?? '',
        origin,
        loginUrl,
        createdAt: legacyCredential.createdAt,
        updatedAt: legacyCredential.updatedAt,
      }
      sites.push(site)
      sitesByLoginUrl.set(loginUrl, site)
    } else {
      if (legacyCredential.createdAt < site.createdAt) {
        site.createdAt = legacyCredential.createdAt
      }
      if (legacyCredential.updatedAt > site.updatedAt) {
        site.updatedAt = legacyCredential.updatedAt
      }
    }

    credentials.push({
      id: legacyCredential.id,
      siteId: site.id,
      label: legacyCredential.label,
      username: legacyCredential.username,
      password: legacyCredential.password,
      ...(legacyCredential.notes ? { notes: legacyCredential.notes } : {}),
      createdAt: legacyCredential.createdAt,
      updatedAt: legacyCredential.updatedAt,
    })
  }

  const representedOrigins = new Set(sites.map((site) => site.origin))
  const aliasEntries = Object.entries(payload.siteAliases ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  for (const [rawOrigin, rawAlias] of aliasEntries) {
    const origin = normalizeLegacyOrigin(rawOrigin)
    const alias = rawAlias.trim()

    if (!alias || representedOrigins.has(origin)) {
      continue
    }

    const id = createUniqueLegacySiteId(
      `legacy-alias-${sites.length + 1}`,
      usedSiteIds,
    )
    sites.push({
      id,
      alias,
      origin,
      loginUrl: `${origin}/`,
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    })
    representedOrigins.add(origin)
  }

  return {
    version: VAULT_PAYLOAD_VERSION,
    sites,
    credentials,
  }
}

function createUniqueLegacySiteId(base: string, usedIds: Set<string>): string {
  let candidate = base
  let suffix = 2

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }

  usedIds.add(candidate)
  return candidate
}

function normalizeLegacyOrigin(value: string): string {
  const url = new URL(value)

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The legacy vault contains an unsupported origin.')
  }

  return url.origin
}

function normalizeLegacyLoginUrl(value: string, expectedOrigin: string): string {
  const url = new URL(value)

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.origin !== expectedOrigin ||
    url.username ||
    url.password
  ) {
    throw new Error('The legacy vault contains an invalid login URL.')
  }

  return url.href
}

function isHttpUrl(value: unknown, expectedOrigin: unknown): boolean {
  if (typeof value !== 'string' || typeof expectedOrigin !== 'string') {
    return false
  }

  try {
    const url = new URL(value)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.origin === expectedOrigin &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

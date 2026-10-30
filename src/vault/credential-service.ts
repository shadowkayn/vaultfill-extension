import type { Credential, VaultPayload } from '../crypto/types'
import type {
  CredentialInput,
  CredentialSummary,
  SiteSummary,
} from '../shared/messages'

const MAX_LABEL_LENGTH = 100
const MAX_USERNAME_LENGTH = 320
const MAX_PASSWORD_LENGTH = 4096
const MAX_NOTES_LENGTH = 2000
const MAX_LOGIN_URL_LENGTH = 2048

export function listCredentialsForOrigin(
  payload: VaultPayload,
  origin: string,
): CredentialSummary[] {
  const normalizedOrigin = normalizeHttpOrigin(origin)

  return payload.credentials
    .filter((credential) => credential.origin === normalizedOrigin)
    .map(({ id, label, username, updatedAt }) => ({
      id,
      label,
      username,
      updatedAt,
    }))
    .sort((first, second) => first.label.localeCompare(second.label))
}

export function getCredentialById(
  payload: VaultPayload,
  credentialId: string,
): Credential | null {
  return (
    payload.credentials.find((credential) => credential.id === credentialId) ??
    null
  )
}

export function saveCredential(
  payload: VaultPayload,
  input: CredentialInput,
  options: {
    now: string
    createId: () => string
  },
): { payload: VaultPayload; credential: Credential } {
  const normalizedInput = validateCredentialInput(input)
  const existingCredential = normalizedInput.id
    ? getCredentialById(payload, normalizedInput.id)
    : null

  if (normalizedInput.id && !existingCredential) {
    throw new Error('The credential to update does not exist.')
  }

  const credential: Credential = {
    id: existingCredential?.id ?? options.createId(),
    label: normalizedInput.label,
    origin: normalizedInput.origin,
    loginUrl: normalizedInput.loginUrl,
    username: normalizedInput.username,
    password: normalizedInput.password,
    ...(normalizedInput.notes ? { notes: normalizedInput.notes } : {}),
    createdAt: existingCredential?.createdAt ?? options.now,
    updatedAt: options.now,
  }
  const credentials = existingCredential
    ? payload.credentials.map((item) =>
        item.id === existingCredential.id ? credential : item,
      )
    : [...payload.credentials, credential]

  return {
    payload: { ...payload, credentials },
    credential,
  }
}

export function deleteCredential(
  payload: VaultPayload,
  credentialId: string,
): VaultPayload {
  const credentials = payload.credentials.filter(
    (credential) => credential.id !== credentialId,
  )

  if (credentials.length === payload.credentials.length) {
    throw new Error('The credential to delete does not exist.')
  }

  const deletedOrigin = payload.credentials.find(
    (credential) => credential.id === credentialId,
  )?.origin
  const siteAliases = { ...(payload.siteAliases ?? {}) }

  if (
    deletedOrigin &&
    !credentials.some((credential) => credential.origin === deletedOrigin)
  ) {
    delete siteAliases[deletedOrigin]
  }

  return { ...payload, credentials, siteAliases }
}

export function getSiteAlias(payload: VaultPayload, origin: string): string {
  const normalizedOrigin = normalizeHttpOrigin(origin)
  return normalizeStoredSiteAlias(payload.siteAliases?.[normalizedOrigin])
}

export function setSiteAlias(
  payload: VaultPayload,
  origin: string,
  alias: string,
): VaultPayload {
  const normalizedOrigin = normalizeHttpOrigin(origin)
  const normalizedAlias = alias.trim()

  const siteAliases = { ...(payload.siteAliases ?? {}) }

  if (normalizedAlias) {
    siteAliases[normalizedOrigin] = normalizedAlias
  } else {
    delete siteAliases[normalizedOrigin]
  }

  return { ...payload, siteAliases }
}

export function listSavedSites(payload: VaultPayload): SiteSummary[] {
  const sites = new Map<string, SiteSummary>()

  for (const credential of payload.credentials) {
    const existing = sites.get(credential.origin)

    if (existing) {
      existing.credentialCount += 1
      if (credential.updatedAt > existing.updatedAt) {
        existing.updatedAt = credential.updatedAt
        existing.loginUrl = credential.loginUrl ?? credential.origin
      }
      continue
    }

    const url = new URL(credential.origin)
    sites.set(credential.origin, {
      origin: credential.origin,
      hostname: url.hostname,
      alias: normalizeStoredSiteAlias(payload.siteAliases?.[credential.origin]),
      loginUrl: credential.loginUrl ?? credential.origin,
      credentialCount: 1,
      updatedAt: credential.updatedAt,
    })
  }

  return [...sites.values()].sort((first, second) => {
    const firstName = first.alias || first.hostname
    const secondName = second.alias || second.hostname
    return firstName.localeCompare(secondName)
  })
}

function normalizeStoredSiteAlias(value: string | undefined): string {
  return value?.trim() ?? ''
}

export function deleteCredentialsForOrigin(
  payload: VaultPayload,
  origin: string,
): { payload: VaultPayload; deletedCredentialCount: number } {
  const normalizedOrigin = normalizeHttpOrigin(origin)
  const credentials = payload.credentials.filter(
    (credential) => credential.origin !== normalizedOrigin,
  )
  const deletedCredentialCount = payload.credentials.length - credentials.length

  if (deletedCredentialCount === 0) {
    throw new Error('The site does not have saved credentials.')
  }

  const siteAliases = { ...(payload.siteAliases ?? {}) }
  delete siteAliases[normalizedOrigin]

  return {
    payload: { ...payload, credentials, siteAliases },
    deletedCredentialCount,
  }
}

export function normalizeHttpOrigin(value: string): string {
  const url = new URL(value)

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS origins are supported.')
  }

  return url.origin
}

function validateCredentialInput(input: CredentialInput): CredentialInput {
  const label = input.label.trim()
  const username = input.username.trim()
  const notes = input.notes?.trim() ?? ''
  const origin = normalizeHttpOrigin(input.origin)
  const loginUrl = normalizeLoginUrl(input.loginUrl ?? origin, origin)

  if (!label || label.length > MAX_LABEL_LENGTH) {
    throw new Error('Account label is invalid.')
  }

  if (!username || username.length > MAX_USERNAME_LENGTH) {
    throw new Error('Username is invalid.')
  }

  if (!input.password || input.password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Password is invalid.')
  }

  if (notes.length > MAX_NOTES_LENGTH) {
    throw new Error('Notes are too long.')
  }

  if (input.id !== undefined && (!input.id || input.id.length > 100)) {
    throw new Error('Credential id is invalid.')
  }

  return {
    ...(input.id ? { id: input.id } : {}),
    label,
    origin,
    loginUrl,
    username,
    password: input.password,
    ...(notes ? { notes } : {}),
  }
}

function normalizeLoginUrl(value: string, expectedOrigin: string): string {
  if (!value || value.length > MAX_LOGIN_URL_LENGTH) {
    throw new Error('Login URL is invalid.')
  }

  const url = new URL(value)

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.origin !== expectedOrigin ||
    url.username ||
    url.password
  ) {
    throw new Error('Login URL must use the credential origin.')
  }

  return url.href
}

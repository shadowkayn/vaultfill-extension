import type { Credential, SiteProfile, VaultPayload } from '../crypto/types'
import type {
  CredentialDetails,
  CredentialInput,
  CredentialSummary,
  SiteProfileSummary,
  SiteSummary,
} from '../shared/messages'

const MAX_LABEL_LENGTH = 100
const MAX_USERNAME_LENGTH = 320
const MAX_PASSWORD_LENGTH = 4096
const MAX_NOTES_LENGTH = 2000
const MAX_LOGIN_URL_LENGTH = 2048

export function listCredentialsForSite(
  payload: VaultPayload,
  siteId: string | null,
): CredentialSummary[] {
  if (!siteId) return []

  return payload.credentials
    .filter((credential) => credential.siteId === siteId)
    .map(({ id, label, username, updatedAt }) => ({ id, label, username, updatedAt }))
    .sort((first, second) => first.label.localeCompare(second.label))
}

export function getCredentialById(
  payload: VaultPayload,
  credentialId: string,
): Credential | null {
  return payload.credentials.find((credential) => credential.id === credentialId) ?? null
}

export function getSiteProfileById(
  payload: VaultPayload,
  siteId: string,
): SiteProfile | null {
  return payload.sites.find((site) => site.id === siteId) ?? null
}

export function getCredentialDetails(
  payload: VaultPayload,
  credentialId: string,
): CredentialDetails | null {
  const credential = getCredentialById(payload, credentialId)
  if (!credential) return null

  const site = getSiteProfileById(payload, credential.siteId)
  if (!site) return null

  return { ...credential, origin: site.origin, loginUrl: site.loginUrl }
}

export function listSiteProfilesForPage(
  payload: VaultPayload,
  pageUrl: string,
): SiteProfileSummary[] {
  const origin = normalizeHttpOrigin(pageUrl)

  return payload.sites
    .filter((site) => site.origin === origin)
    .map((site) => toSiteProfileSummary(payload, site))
    .sort(compareSiteProfiles)
}

export function resolveSiteProfileForPage(
  payload: VaultPayload,
  pageUrl: string,
  preferredSiteId?: string,
): SiteProfile | null {
  const page = normalizeHttpUrl(pageUrl)
  const candidates = payload.sites.filter((site) => site.origin === page.origin)

  if (preferredSiteId) {
    const preferred = candidates.find((site) => site.id === preferredSiteId)
    if (preferred) return preferred
  }

  const exact = candidates.find((site) => site.loginUrl === page.href)
  if (exact) return exact

  const samePathAndSearch = candidates.filter((site) => {
    const loginUrl = new URL(site.loginUrl)
    return loginUrl.pathname === page.pathname && loginUrl.search === page.search
  })
  if (samePathAndSearch.length === 1) return samePathAndSearch[0]

  const samePath = candidates.filter(
    (site) => new URL(site.loginUrl).pathname === page.pathname,
  )
  if (samePath.length === 1) return samePath[0]

  return candidates.length === 1 ? candidates[0] : null
}

export function saveCredential(
  payload: VaultPayload,
  input: CredentialInput,
  options: {
    now: string
    createCredentialId: () => string
    createSiteId: () => string
  },
): { payload: VaultPayload; credential: Credential; site: SiteProfile } {
  const normalizedInput = validateCredentialInput(input)
  const existingCredential = normalizedInput.id
    ? getCredentialById(payload, normalizedInput.id)
    : null

  if (normalizedInput.id && !existingCredential) {
    throw new Error('The credential to update does not exist.')
  }

  const currentSite = existingCredential
    ? getSiteProfileById(payload, existingCredential.siteId)
    : null
  const matchingSite = payload.sites.find(
    (site) => site.loginUrl === normalizedInput.loginUrl,
  )
  const currentSiteCredentialCount = currentSite
    ? payload.credentials.filter((credential) => credential.siteId === currentSite.id).length
    : 0

  let site: SiteProfile
  let sites: SiteProfile[]

  if (matchingSite) {
    site = { ...matchingSite, updatedAt: options.now }
    sites = payload.sites.map((item) => (item.id === site.id ? site : item))
  } else if (currentSite && currentSiteCredentialCount === 1) {
    site = {
      ...currentSite,
      origin: normalizedInput.origin,
      loginUrl: normalizedInput.loginUrl,
      updatedAt: options.now,
    }
    sites = payload.sites.map((item) => (item.id === site.id ? site : item))
  } else {
    site = {
      id: options.createSiteId(),
      alias: '',
      origin: normalizedInput.origin,
      loginUrl: normalizedInput.loginUrl,
      createdAt: options.now,
      updatedAt: options.now,
    }
    sites = [...payload.sites, site]
  }

  const credential: Credential = {
    id: existingCredential?.id ?? options.createCredentialId(),
    siteId: site.id,
    label: normalizedInput.label,
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

  if (
    currentSite &&
    currentSite.id !== site.id &&
    !credentials.some((item) => item.siteId === currentSite.id)
  ) {
    sites = sites.filter((item) => item.id !== currentSite.id)
  }

  return {
    payload: { ...payload, sites, credentials },
    credential,
    site,
  }
}

export function deleteCredential(
  payload: VaultPayload,
  credentialId: string,
): VaultPayload {
  const deletedCredential = getCredentialById(payload, credentialId)
  if (!deletedCredential) {
    throw new Error('The credential to delete does not exist.')
  }

  const credentials = payload.credentials.filter(
    (credential) => credential.id !== credentialId,
  )
  const sites = credentials.some(
    (credential) => credential.siteId === deletedCredential.siteId,
  )
    ? payload.sites
    : payload.sites.filter((site) => site.id !== deletedCredential.siteId)

  return { ...payload, sites, credentials }
}

export function setSiteAlias(
  payload: VaultPayload,
  input: { pageUrl: string; siteId?: string; alias: string },
  options: { now: string; createSiteId: () => string },
): { payload: VaultPayload; site: SiteProfile } {
  const page = normalizeHttpUrl(input.pageUrl)
  const normalizedAlias = input.alias.trim()
  const existingSite = resolveSiteProfileForPage(payload, page.href, input.siteId)
  const site: SiteProfile = existingSite
    ? { ...existingSite, alias: normalizedAlias, updatedAt: options.now }
    : {
        id: options.createSiteId(),
        alias: normalizedAlias,
        origin: page.origin,
        loginUrl: page.href,
        createdAt: options.now,
        updatedAt: options.now,
      }
  const sites = existingSite
    ? payload.sites.map((item) => (item.id === site.id ? site : item))
    : [...payload.sites, site]

  return { payload: { ...payload, sites }, site }
}

export function listSavedSites(payload: VaultPayload): SiteSummary[] {
  return payload.sites
    .map((site) => toSiteProfileSummary(payload, site))
    .filter((site) => site.credentialCount > 0)
    .sort(compareSiteProfiles)
}

export function deleteCredentialsForSite(
  payload: VaultPayload,
  siteId: string,
): { payload: VaultPayload; deletedCredentialCount: number } {
  const site = getSiteProfileById(payload, siteId)
  if (!site) throw new Error('The login page does not exist.')

  const credentials = payload.credentials.filter(
    (credential) => credential.siteId !== siteId,
  )
  const deletedCredentialCount = payload.credentials.length - credentials.length

  if (deletedCredentialCount === 0) {
    throw new Error('The login page does not have saved credentials.')
  }

  return {
    payload: {
      ...payload,
      sites: payload.sites.filter((item) => item.id !== siteId),
      credentials,
    },
    deletedCredentialCount,
  }
}

export function normalizeHttpOrigin(value: string): string {
  return normalizeHttpUrl(value).origin
}

function validateCredentialInput(input: CredentialInput): CredentialInput {
  const label = input.label.trim()
  const username = input.username.trim()
  const notes = input.notes?.trim() ?? ''
  const origin = normalizeHttpOrigin(input.origin)
  const loginUrl = normalizeLoginUrl(input.loginUrl, origin)

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
  if (input.siteId !== undefined && (!input.siteId || input.siteId.length > 200)) {
    throw new Error('Site id is invalid.')
  }

  return {
    ...(input.id ? { id: input.id } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
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

  const url = normalizeHttpUrl(value)
  if (url.origin !== expectedOrigin) {
    throw new Error('Login URL must use the credential origin.')
  }

  return url.href
}

function normalizeHttpUrl(value: string): URL {
  const url = new URL(value)

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password
  ) {
    throw new Error('Only HTTP and HTTPS URLs are supported.')
  }

  return url
}

function toSiteProfileSummary(
  payload: VaultPayload,
  site: SiteProfile,
): SiteProfileSummary {
  return {
    id: site.id,
    alias: site.alias,
    origin: site.origin,
    loginUrl: site.loginUrl,
    hostname: new URL(site.origin).hostname,
    credentialCount: payload.credentials.filter(
      (credential) => credential.siteId === site.id,
    ).length,
    updatedAt: site.updatedAt,
  }
}

function compareSiteProfiles(
  first: SiteProfileSummary,
  second: SiteProfileSummary,
): number {
  const firstName = first.alias || first.loginUrl
  const secondName = second.alias || second.loginUrl
  return firstName.localeCompare(secondName)
}

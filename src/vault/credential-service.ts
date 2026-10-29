import type { Credential, VaultPayload } from '../crypto/types'
import type {
  CredentialInput,
  CredentialSummary,
} from '../shared/messages'

const MAX_LABEL_LENGTH = 100
const MAX_USERNAME_LENGTH = 320
const MAX_PASSWORD_LENGTH = 4096
const MAX_NOTES_LENGTH = 2000

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

  return { ...payload, credentials }
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
    origin: normalizeHttpOrigin(input.origin),
    username,
    password: input.password,
    ...(notes ? { notes } : {}),
  }
}

const RECOVERY_KEY_PREFIX = 'VF'
const RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RECOVERY_KEY_BYTES = 20
const RECOVERY_KEY_CHARACTERS = 32
const RECOVERY_KEY_GROUP_SIZE = 4

export function generateRecoveryKey(): string {
  const randomBytes = crypto.getRandomValues(
    new Uint8Array(RECOVERY_KEY_BYTES),
  )
  let bitBuffer = 0
  let bitCount = 0
  let encoded = ''

  for (const byte of randomBytes) {
    bitBuffer = (bitBuffer << 8) | byte
    bitCount += 8

    while (bitCount >= 5) {
      bitCount -= 5
      encoded += RECOVERY_KEY_ALPHABET[(bitBuffer >>> bitCount) & 31]
      bitBuffer &= (1 << bitCount) - 1
    }
  }

  const groups = encoded.match(
    new RegExp(`.{1,${RECOVERY_KEY_GROUP_SIZE}}`, 'g'),
  )

  if (!groups || encoded.length !== RECOVERY_KEY_CHARACTERS) {
    throw new Error('Failed to generate a recovery key.')
  }

  return `${RECOVERY_KEY_PREFIX}-${groups.join('-')}`
}

export function normalizeRecoveryKey(value: string): string {
  const normalized = value.toUpperCase().replace(/[\s-]/g, '')
  const withoutPrefix =
    normalized.length === RECOVERY_KEY_CHARACTERS + RECOVERY_KEY_PREFIX.length &&
    normalized.startsWith(RECOVERY_KEY_PREFIX)
    ? normalized.slice(RECOVERY_KEY_PREFIX.length)
    : normalized

  if (
    withoutPrefix.length !== RECOVERY_KEY_CHARACTERS ||
    Array.from(withoutPrefix).some(
      (character) => !RECOVERY_KEY_ALPHABET.includes(character),
    )
  ) {
    throw new Error('Invalid recovery key format.')
  }

  const groups = withoutPrefix.match(
    new RegExp(`.{1,${RECOVERY_KEY_GROUP_SIZE}}`, 'g'),
  )

  if (!groups) {
    throw new Error('Invalid recovery key format.')
  }

  return `${RECOVERY_KEY_PREFIX}-${groups.join('-')}`
}

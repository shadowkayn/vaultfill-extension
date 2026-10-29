import { expect, it } from 'vitest'
import { generateRecoveryKey, normalizeRecoveryKey } from './recovery-key'

it('normalizes lowercase and ungrouped recovery keys', () => {
  const generated = generateRecoveryKey()
  const ungrouped = generated.replaceAll('-', '').toLowerCase()

  expect(normalizeRecoveryKey(ungrouped)).toBe(generated)
})

it('does not mistake a prefix-like payload for the VF prefix', () => {
  const payloadBeginningWithVf = `VF${'A'.repeat(30)}`

  expect(normalizeRecoveryKey(payloadBeginningWithVf)).toBe(
    `VF-VFAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA`,
  )
})

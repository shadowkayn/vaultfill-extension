import { beforeAll, describe, expect, it } from 'vitest'
import { generateRecoveryKey } from './recovery-key'
import {
  createEncryptedVault,
  replaceMasterPasswordSlot,
  rotateRecoveryKeySlot,
  unlockWithMasterPassword,
  unlockWithRecoveryKey,
  type NewEncryptedVaultResult,
} from './vault-crypto'
import { createEmptyVaultPayload, type EncryptedVault } from './types'

const masterPassword = 'correct horse battery staple'
let createdVault: NewEncryptedVaultResult

beforeAll(async () => {
  createdVault = await createEncryptedVault(
    createEmptyVaultPayload(),
    masterPassword,
  )
})

describe('vault envelope encryption', () => {
  it('creates a version 2 vault and a formatted recovery key', () => {
    expect(createdVault.encryptedVault.version).toBe(2)
    expect(createdVault.recoveryKey).toMatch(
      /^VF-(?:[A-HJ-NP-Z2-9]{4}-){7}[A-HJ-NP-Z2-9]{4}$/,
    )
  })

  it('unlocks the same payload with the master password', async () => {
    const result = await unlockWithMasterPassword(
      createdVault.encryptedVault,
      masterPassword,
    )

    expect(result.payload).toEqual(createEmptyVaultPayload())
  })

  it('unlocks the same payload with a normalized recovery key', async () => {
    const looselyFormattedRecoveryKey = createdVault.recoveryKey
      .replaceAll('-', ' ')
      .toLowerCase()
    const result = await unlockWithRecoveryKey(
      createdVault.encryptedVault,
      looselyFormattedRecoveryKey,
    )

    expect(result.payload).toEqual(createEmptyVaultPayload())
  })

  it('does not persist the master password, recovery key, or plaintext payload', () => {
    const serializedVault = JSON.stringify(createdVault.encryptedVault)

    expect(serializedVault).not.toContain(masterPassword)
    expect(serializedVault).not.toContain(createdVault.recoveryKey)
    expect(serializedVault).not.toContain('credentials')
  })

  it('rejects incorrect unlock secrets', async () => {
    await expect(
      unlockWithMasterPassword(
        createdVault.encryptedVault,
        'this is the wrong password',
      ),
    ).rejects.toThrow()

    await expect(
      unlockWithRecoveryKey(
        createdVault.encryptedVault,
        generateRecoveryKey(),
      ),
    ).rejects.toThrow()
  })

  it('rejects modified vault ciphertext', async () => {
    const firstCharacter = createdVault.encryptedVault.vaultCipher.ciphertext.at(0)
    const replacement = firstCharacter === 'A' ? 'B' : 'A'
    const modifiedVault: EncryptedVault = {
      ...createdVault.encryptedVault,
      vaultCipher: {
        ...createdVault.encryptedVault.vaultCipher,
        ciphertext: `${replacement}${createdVault.encryptedVault.vaultCipher.ciphertext.slice(1)}`,
      },
    }

    await expect(
      unlockWithMasterPassword(modifiedVault, masterPassword),
    ).rejects.toThrow()
  })

  it('replaces the master-password key slot without re-encrypting vault data', async () => {
    const newMasterPassword = 'a newer and stronger master password'
    const changedVault = await replaceMasterPasswordSlot(
      createdVault.encryptedVault,
      createdVault.sessionDataKey,
      newMasterPassword,
    )

    expect(changedVault.vaultCipher).toEqual(
      createdVault.encryptedVault.vaultCipher,
    )
    await expect(
      unlockWithMasterPassword(changedVault, masterPassword),
    ).rejects.toThrow()
    await expect(
      unlockWithMasterPassword(changedVault, newMasterPassword),
    ).resolves.toMatchObject({ payload: createEmptyVaultPayload() })
  })

  it('rotates the recovery key and invalidates the old one', async () => {
    const rotated = await rotateRecoveryKeySlot(
      createdVault.encryptedVault,
      createdVault.sessionDataKey,
    )

    await expect(
      unlockWithRecoveryKey(
        rotated.encryptedVault,
        createdVault.recoveryKey,
      ),
    ).rejects.toThrow()
    await expect(
      unlockWithRecoveryKey(rotated.encryptedVault, rotated.recoveryKey),
    ).resolves.toMatchObject({ payload: createEmptyVaultPayload() })
  })
})

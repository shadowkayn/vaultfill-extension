import { unlockLegacyVault } from '../crypto/legacy-vault-crypto'
import {
  createEncryptedVault,
  decryptVaultWithSessionDataKey,
  encryptVaultWithSessionDataKey,
  replaceMasterPasswordSlot,
  rotateRecoveryKeySlot,
  unlockWithMasterPassword,
  unlockWithRecoveryKey,
} from '../crypto/vault-crypto'
import {
  createEmptyVaultPayload,
  isLegacyEncryptedVault,
  type EncryptedVault,
} from '../crypto/types'
import {
  RESET_VAULT_CONFIRMATION,
  type VaultErrorCode,
  type VaultMessage,
  type VaultResponse,
  type VaultStatus,
} from '../shared/messages'
import { MINIMUM_MASTER_PASSWORD_LENGTH } from '../shared/security'
import { restrictStorageAccess } from '../storage/access'
import {
  clearSessionDataKey,
  getSessionDataKey,
  saveSessionDataKey,
} from '../storage/session-repository'
import {
  clearStoredVault,
  getStoredVault,
  saveStoredVault,
} from '../storage/vault-repository'
import {
  deleteCredential,
  getCredentialById,
  listCredentialsForOrigin,
  normalizeHttpOrigin,
  saveCredential,
} from '../vault/credential-service'

const storageAccessReady = restrictStorageAccess()

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.info('VaultFill installed')
  }
})

chrome.runtime.onMessage.addListener((message: VaultMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      console.error('VaultFill request failed', error)
      sendResponse(errorResponse('STORAGE_ERROR', 'VaultFill 暂时无法访问本地密码库。'))
    })

  return true
})

async function handleMessage(message: VaultMessage): Promise<VaultResponse> {
  await storageAccessReady

  switch (message?.type) {
    case 'GET_VAULT_STATUS':
      return successResponse(await getVaultStatus())

    case 'CREATE_VAULT':
      return createVault(message.masterPassword)

    case 'UNLOCK_VAULT':
      return unlockVault(message.masterPassword)

    case 'RECOVER_VAULT':
      return recoverVault(message.recoveryKey, message.newMasterPassword)

    case 'CHANGE_MASTER_PASSWORD':
      return changeMasterPassword(
        message.currentMasterPassword,
        message.newMasterPassword,
      )

    case 'ROTATE_RECOVERY_KEY':
      return rotateRecoveryKey()

    case 'LIST_CREDENTIALS':
      return listCredentials(message.origin)

    case 'GET_CREDENTIAL':
      return getCredential(message.credentialId)

    case 'SAVE_CREDENTIAL':
      return persistCredential(message.credential)

    case 'DELETE_CREDENTIAL':
      return removeCredential(message.credentialId)

    case 'FILL_CREDENTIAL':
      return fillCredential(message.credentialId, message.expectedOrigin)

    case 'LOCK_VAULT':
      await clearSessionDataKey()
      return successResponse(await getVaultStatus())

    case 'RESET_VAULT':
      return resetVault(message.confirmation)

    default:
      return errorResponse('INVALID_REQUEST', '无法识别的 VaultFill 请求。')
  }
}

async function createVault(masterPassword: string): Promise<VaultResponse> {
  if (!isValidNewMasterPassword(masterPassword)) {
    return errorResponse(
      'INVALID_REQUEST',
      `主密码至少需要 ${MINIMUM_MASTER_PASSWORD_LENGTH} 个字符。`,
    )
  }

  if (await getStoredVault()) {
    return errorResponse('VAULT_ALREADY_EXISTS', '本地密码库已经存在。')
  }

  const result = await createEncryptedVault(
    createEmptyVaultPayload(),
    masterPassword,
  )

  await saveStoredVault(result.encryptedVault)
  await saveSessionDataKey(result.sessionDataKey)

  return successResponse(
    { hasVault: true, isUnlocked: true, formatVersion: 2 },
    result.recoveryKey,
  )
}

async function unlockVault(masterPassword: string): Promise<VaultResponse> {
  if (!isValidUnlockPassword(masterPassword)) {
    return errorResponse('INVALID_REQUEST', '请输入主密码。')
  }

  const storedVault = await getStoredVault()

  if (!storedVault) {
    return errorResponse('VAULT_NOT_FOUND', '本地密码库尚未创建。')
  }

  try {
    if (isLegacyEncryptedVault(storedVault)) {
      const payload = await unlockLegacyVault(storedVault, masterPassword)
      const migrated = await createEncryptedVault(payload, masterPassword)

      await saveStoredVault(migrated.encryptedVault)
      await saveSessionDataKey(migrated.sessionDataKey)

      return successResponse(
        { hasVault: true, isUnlocked: true, formatVersion: 2 },
        migrated.recoveryKey,
      )
    }

    const result = await unlockWithMasterPassword(storedVault, masterPassword)
    await saveSessionDataKey(result.sessionDataKey)

    return successResponse({
      hasVault: true,
      isUnlocked: true,
      formatVersion: 2,
    })
  } catch {
    await clearSessionDataKey()
    return errorResponse(
      'UNLOCK_FAILED',
      '主密码不正确，或本地密码库已经损坏。',
    )
  }
}

async function recoverVault(
  recoveryKey: string,
  newMasterPassword: string,
): Promise<VaultResponse> {
  if (!isValidRecoveryKeyInput(recoveryKey)) {
    return errorResponse('INVALID_REQUEST', '请输入有效的恢复密钥。')
  }

  if (!isValidNewMasterPassword(newMasterPassword)) {
    return errorResponse(
      'INVALID_REQUEST',
      `新主密码至少需要 ${MINIMUM_MASTER_PASSWORD_LENGTH} 个字符。`,
    )
  }

  const storedVault = await getStoredVault()

  if (!storedVault) {
    return errorResponse('VAULT_NOT_FOUND', '本地密码库尚未创建。')
  }

  if (isLegacyEncryptedVault(storedVault)) {
    return errorResponse(
      'RECOVERY_FAILED',
      '旧版密码库尚未生成恢复密钥，请使用原主密码解锁并完成迁移。',
    )
  }

  try {
    const unlocked = await unlockWithRecoveryKey(storedVault, recoveryKey)
    const withNewMasterPassword = await replaceMasterPasswordSlot(
      storedVault,
      unlocked.sessionDataKey,
      newMasterPassword,
    )
    const rotated = await rotateRecoveryKeySlot(
      withNewMasterPassword,
      unlocked.sessionDataKey,
    )

    await saveStoredVault(rotated.encryptedVault)
    await saveSessionDataKey(unlocked.sessionDataKey)

    return successResponse(
      { hasVault: true, isUnlocked: true, formatVersion: 2 },
      rotated.recoveryKey,
    )
  } catch {
    await clearSessionDataKey()
    return errorResponse(
      'RECOVERY_FAILED',
      '恢复密钥不正确，或本地密码库已经损坏。',
    )
  }
}

async function changeMasterPassword(
  currentMasterPassword: string,
  newMasterPassword: string,
): Promise<VaultResponse> {
  if (!isValidUnlockPassword(currentMasterPassword)) {
    return errorResponse('INVALID_REQUEST', '请输入当前主密码。')
  }

  if (!isValidNewMasterPassword(newMasterPassword)) {
    return errorResponse(
      'INVALID_REQUEST',
      `新主密码至少需要 ${MINIMUM_MASTER_PASSWORD_LENGTH} 个字符。`,
    )
  }

  if (currentMasterPassword === newMasterPassword) {
    return errorResponse('INVALID_REQUEST', '新主密码不能与当前主密码相同。')
  }

  const storedVault = await getStoredVault()

  if (!storedVault) {
    return errorResponse('VAULT_NOT_FOUND', '本地密码库尚未创建。')
  }

  if (isLegacyEncryptedVault(storedVault)) {
    return errorResponse('VAULT_LOCKED', '请先使用原主密码解锁并迁移密码库。')
  }

  try {
    const unlocked = await unlockWithMasterPassword(
      storedVault,
      currentMasterPassword,
    )
    const changedVault = await replaceMasterPasswordSlot(
      storedVault,
      unlocked.sessionDataKey,
      newMasterPassword,
    )

    await saveStoredVault(changedVault)
    await clearSessionDataKey()

    return successResponse({
      hasVault: true,
      isUnlocked: false,
      formatVersion: 2,
    })
  } catch {
    return errorResponse('UNLOCK_FAILED', '当前主密码不正确。')
  }
}

async function rotateRecoveryKey(): Promise<VaultResponse> {
  const storedVault = await getStoredVault()

  if (!storedVault) {
    return errorResponse('VAULT_NOT_FOUND', '本地密码库尚未创建。')
  }

  if (isLegacyEncryptedVault(storedVault)) {
    return errorResponse('VAULT_LOCKED', '请先解锁并迁移密码库。')
  }

  const sessionDataKey = await getSessionDataKey()

  if (!sessionDataKey) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  try {
    await decryptVaultWithSessionDataKey(storedVault, sessionDataKey)
    const rotated = await rotateRecoveryKeySlot(
      storedVault,
      sessionDataKey,
    )
    await saveStoredVault(rotated.encryptedVault)

    return successResponse(
      { hasVault: true, isUnlocked: true, formatVersion: 2 },
      rotated.recoveryKey,
    )
  } catch {
    await clearSessionDataKey()
    return errorResponse('VAULT_LOCKED', '当前解锁会话已经失效。')
  }
}

async function listCredentials(origin: string): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  try {
    return {
      ok: true,
      status: unlockedStatus(),
      credentials: listCredentialsForOrigin(context.payload, origin),
    }
  } catch {
    return errorResponse('INVALID_REQUEST', '当前页面地址不支持保存账号。')
  }
}

async function getCredential(credentialId: string): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  const credential = getCredentialById(context.payload, credentialId)

  if (!credential) {
    return errorResponse('INVALID_REQUEST', '找不到要编辑的账号。')
  }

  return {
    ok: true,
    status: unlockedStatus(),
    credential,
  }
}

async function persistCredential(
  input: Extract<VaultMessage, { type: 'SAVE_CREDENTIAL' }>['credential'],
): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  try {
    const saved = saveCredential(context.payload, input, {
      now: new Date().toISOString(),
      createId: () => crypto.randomUUID(),
    })
    const encryptedVault = await encryptVaultWithSessionDataKey(
      saved.payload,
      context.encryptedVault,
      context.sessionDataKey,
    )
    await saveStoredVault(encryptedVault)

    return {
      ok: true,
      status: unlockedStatus(),
      credential: saved.credential,
      credentials: listCredentialsForOrigin(saved.payload, saved.credential.origin),
    }
  } catch {
    return errorResponse('INVALID_REQUEST', '账号信息不完整或格式不正确。')
  }
}

async function removeCredential(credentialId: string): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  const credential = getCredentialById(context.payload, credentialId)

  if (!credential) {
    return errorResponse('INVALID_REQUEST', '找不到要删除的账号。')
  }

  try {
    const payload = deleteCredential(context.payload, credentialId)
    const encryptedVault = await encryptVaultWithSessionDataKey(
      payload,
      context.encryptedVault,
      context.sessionDataKey,
    )
    await saveStoredVault(encryptedVault)

    return {
      ok: true,
      status: unlockedStatus(),
      credentials: listCredentialsForOrigin(payload, credential.origin),
    }
  } catch {
    return errorResponse('INVALID_REQUEST', '删除账号失败。')
  }
}

async function fillCredential(
  credentialId: string,
  expectedOrigin: string,
): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  const credential = getCredentialById(context.payload, credentialId)

  if (!credential) {
    return errorResponse('INVALID_REQUEST', '找不到要填入的账号。')
  }

  try {
    const normalizedExpectedOrigin = normalizeHttpOrigin(expectedOrigin)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id || !tab.url) {
      return errorResponse('FILL_FAILED', '无法访问当前标签页。')
    }

    const currentOrigin = normalizeHttpOrigin(tab.url)

    if (
      currentOrigin !== credential.origin ||
      currentOrigin !== normalizedExpectedOrigin
    ) {
      return errorResponse(
        'ORIGIN_MISMATCH',
        '当前网站与账号保存的网站不一致，已阻止填入。',
      )
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['fill-form.js'],
    })

    const result = (await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_LOGIN_FIELDS',
      expectedOrigin: normalizedExpectedOrigin,
      username: credential.username,
      password: credential.password,
    })) as
      | {
          ok: true
          status: 'filled'
          usernameFieldFound: boolean
          passwordFieldFound: boolean
        }
      | { ok: false; code: 'NO_LOGIN_FIELDS' | 'ORIGIN_MISMATCH' }

    if (!result?.ok) {
      const message =
        result?.code === 'ORIGIN_MISMATCH'
          ? '页面地址在填入前发生变化，已阻止操作。'
          : '当前页面没有找到可填写的登录输入框。'
      return errorResponse(
        result?.code === 'ORIGIN_MISMATCH'
          ? 'ORIGIN_MISMATCH'
          : 'FILL_FAILED',
        message,
      )
    }

    return {
      ok: true,
      status: unlockedStatus(),
      fillResult: {
        status: 'filled',
        usernameFieldFound: result.usernameFieldFound,
        passwordFieldFound: result.passwordFieldFound,
      },
    }
  } catch {
    return errorResponse(
      'FILL_FAILED',
      '当前页面不允许填入，或登录表单暂时无法识别。',
    )
  }
}

async function getUnlockedVaultContext(): Promise<{
  encryptedVault: EncryptedVault
  payload: Awaited<ReturnType<typeof decryptVaultWithSessionDataKey>>
  sessionDataKey: string
} | null> {
  const storedVault = await getStoredVault()

  if (!storedVault || isLegacyEncryptedVault(storedVault)) {
    return null
  }

  const sessionDataKey = await getSessionDataKey()

  if (!sessionDataKey) {
    return null
  }

  try {
    return {
      encryptedVault: storedVault,
      payload: await decryptVaultWithSessionDataKey(
        storedVault,
        sessionDataKey,
      ),
      sessionDataKey,
    }
  } catch {
    await clearSessionDataKey()
    return null
  }
}

function unlockedStatus(): VaultStatus {
  return { hasVault: true, isUnlocked: true, formatVersion: 2 }
}

async function resetVault(confirmation: string): Promise<VaultResponse> {
  if (confirmation !== RESET_VAULT_CONFIRMATION) {
    return errorResponse('INVALID_REQUEST', '重置确认信息不正确。')
  }

  await clearSessionDataKey()
  await clearStoredVault()

  return successResponse({
    hasVault: false,
    isUnlocked: false,
    formatVersion: null,
  })
}

async function getVaultStatus(): Promise<VaultStatus> {
  const storedVault = await getStoredVault()

  if (!storedVault) {
    await clearSessionDataKey()
    return { hasVault: false, isUnlocked: false, formatVersion: null }
  }

  if (isLegacyEncryptedVault(storedVault)) {
    await clearSessionDataKey()
    return { hasVault: true, isUnlocked: false, formatVersion: 1 }
  }

  const sessionDataKey = await getSessionDataKey()

  if (!sessionDataKey) {
    return { hasVault: true, isUnlocked: false, formatVersion: 2 }
  }

  try {
    await decryptVaultWithSessionDataKey(storedVault, sessionDataKey)
    return { hasVault: true, isUnlocked: true, formatVersion: 2 }
  } catch {
    await clearSessionDataKey()
    return { hasVault: true, isUnlocked: false, formatVersion: 2 }
  }
}

function isValidNewMasterPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Array.from(value).length >= MINIMUM_MASTER_PASSWORD_LENGTH &&
    value.length <= 1024 &&
    value.trim().length > 0
  )
}

function isValidUnlockPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024
}

function isValidRecoveryKeyInput(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function successResponse(
  status: VaultStatus,
  recoveryKey?: string,
): VaultResponse {
  return recoveryKey ? { ok: true, status, recoveryKey } : { ok: true, status }
}

function errorResponse(
  code: VaultErrorCode,
  message: string,
): VaultResponse {
  return {
    ok: false,
    error: { code, message },
  }
}

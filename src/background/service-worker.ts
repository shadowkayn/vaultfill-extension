import {
  createVaultBackup,
  parseVaultBackupText,
} from '../backup/backup-service'
import type { BackupImportAuthentication } from '../backup/types'
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
  IMPORT_VAULT_CONFIRMATION,
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
  deleteCredentialsForSite,
  deleteCredential,
  getCredentialDetails,
  getSiteProfileById,
  listCredentialsForSite,
  listSavedSites,
  listSiteProfilesForPage,
  normalizeHttpOrigin,
  resolveSiteProfileForPage,
  saveCredential,
  setSiteAlias,
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

    case 'EXPORT_VAULT_BACKUP':
      return exportVaultBackup()

    case 'IMPORT_VAULT_BACKUP':
      return importVaultBackup(
        message.backupText,
        message.authentication,
        message.confirmation,
      )

    case 'LIST_CREDENTIALS':
      return listCredentials(message.pageUrl, message.siteId)

    case 'LIST_SITES':
      return listSites()

    case 'SET_SITE_ALIAS':
      return updateSiteAlias(message.pageUrl, message.siteId, message.alias)

    case 'DELETE_SITE_CREDENTIALS':
      return removeSiteCredentials(message.siteId)

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

async function exportVaultBackup(): Promise<VaultResponse> {
  const storedVault = await getStoredVault()

  if (!storedVault) {
    return errorResponse('VAULT_NOT_FOUND', '本地密码库尚未创建。')
  }

  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '请先解锁密码库，再下载备份。')
  }

  if (context.payload.credentials.length === 0) {
    return errorResponse(
      'BACKUP_EXPORT_FAILED',
      '密码库中还没有保存任何账号，暂时无需下载备份。',
    )
  }

  return {
    ok: true,
    status: unlockedStatus(),
    backup: createVaultBackup(context.encryptedVault, {
      exportedAt: new Date().toISOString(),
      appVersion: chrome.runtime.getManifest().version,
    }),
  }
}

async function importVaultBackup(
  backupText: string,
  authentication: BackupImportAuthentication,
  confirmation: string,
): Promise<VaultResponse> {
  const existingVault = await getStoredVault()

  if (existingVault && confirmation !== IMPORT_VAULT_CONFIRMATION) {
    return errorResponse(
      'INVALID_REQUEST',
      '请确认恢复操作会替换当前密码库。',
    )
  }

  try {
    const backup = parseVaultBackupText(backupText)

    if (authentication.type === 'master-password') {
      if (!isValidUnlockPassword(authentication.masterPassword)) {
        return errorResponse('INVALID_REQUEST', '请输入备份文件的主密码。')
      }

      if (isLegacyEncryptedVault(backup.encryptedVault)) {
        const payload = await unlockLegacyVault(
          backup.encryptedVault,
          authentication.masterPassword,
        )
        const migrated = await createEncryptedVault(
          payload,
          authentication.masterPassword,
        )

        await replaceVaultAfterVerifiedImport(
          migrated.encryptedVault,
          migrated.sessionDataKey,
        )

        return successResponse(unlockedStatus(), migrated.recoveryKey)
      }

      const unlocked = await unlockWithMasterPassword(
        backup.encryptedVault,
        authentication.masterPassword,
      )
      const importedVault = await encryptVaultWithSessionDataKey(
        unlocked.payload,
        backup.encryptedVault,
        unlocked.sessionDataKey,
      )

      await replaceVaultAfterVerifiedImport(
        importedVault,
        unlocked.sessionDataKey,
      )

      return successResponse(unlockedStatus())
    }

    if (!isValidRecoveryKeyInput(authentication.recoveryKey)) {
      return errorResponse('INVALID_REQUEST', '请输入有效的恢复密钥。')
    }

    if (!isValidNewMasterPassword(authentication.newMasterPassword)) {
      return errorResponse(
        'INVALID_REQUEST',
        `新主密码至少需要 ${MINIMUM_MASTER_PASSWORD_LENGTH} 个字符。`,
      )
    }

    if (isLegacyEncryptedVault(backup.encryptedVault)) {
      return errorResponse(
        'BACKUP_IMPORT_FAILED',
        '旧版备份没有恢复密钥，请改用原主密码导入。',
      )
    }

    const unlocked = await unlockWithRecoveryKey(
      backup.encryptedVault,
      authentication.recoveryKey,
    )
    const withNewMasterPassword = await replaceMasterPasswordSlot(
      backup.encryptedVault,
      unlocked.sessionDataKey,
      authentication.newMasterPassword,
    )
    const rotated = await rotateRecoveryKeySlot(
      withNewMasterPassword,
      unlocked.sessionDataKey,
    )
    const importedVault = await encryptVaultWithSessionDataKey(
      unlocked.payload,
      rotated.encryptedVault,
      unlocked.sessionDataKey,
    )

    await replaceVaultAfterVerifiedImport(
      importedVault,
      unlocked.sessionDataKey,
    )

    return successResponse(unlockedStatus(), rotated.recoveryKey)
  } catch {
    return errorResponse(
      'BACKUP_IMPORT_FAILED',
      '备份文件、主密码或恢复密钥不正确，现有密码库未被覆盖。',
    )
  }
}

async function replaceVaultAfterVerifiedImport(
  importedVault: EncryptedVault,
  sessionDataKey: string,
): Promise<void> {
  const previousVault = await getStoredVault()
  const previousSessionDataKey = await getSessionDataKey()

  try {
    await saveStoredVault(importedVault)
    await saveSessionDataKey(sessionDataKey)
  } catch (error) {
    if (previousVault) {
      await saveStoredVault(previousVault)
    }
    if (previousSessionDataKey) {
      await saveSessionDataKey(previousSessionDataKey)
    } else {
      await clearSessionDataKey()
    }
    throw error
  }
}

async function listCredentials(
  pageUrl: string,
  siteId?: string,
): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  try {
    const activeSite = resolveSiteProfileForPage(
      context.payload,
      pageUrl,
      siteId,
    )

    return {
      ok: true,
      status: unlockedStatus(),
      credentials: listCredentialsForSite(context.payload, activeSite?.id ?? null),
      siteProfiles: listSiteProfilesForPage(context.payload, pageUrl),
      activeSite: activeSite
        ? listSiteProfilesForPage(context.payload, pageUrl).find(
            (site) => site.id === activeSite.id,
          ) ?? null
        : null,
      siteAlias: activeSite?.alias ?? '',
    }
  } catch {
    return errorResponse('INVALID_REQUEST', '当前页面地址不支持保存账号。')
  }
}

async function listSites(): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  return {
    ok: true,
    status: unlockedStatus(),
    sites: listSavedSites(context.payload),
  }
}

async function updateSiteAlias(
  pageUrl: string,
  siteId: string | undefined,
  alias: string,
): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  try {
    const updated = setSiteAlias(
      context.payload,
      { pageUrl, siteId, alias },
      { now: new Date().toISOString(), createSiteId: () => crypto.randomUUID() },
    )
    const encryptedVault = await encryptVaultWithSessionDataKey(
      updated.payload,
      context.encryptedVault,
      context.sessionDataKey,
    )
    await saveStoredVault(encryptedVault)

    return {
      ok: true,
      status: unlockedStatus(),
      siteProfiles: listSiteProfilesForPage(updated.payload, pageUrl),
      activeSite:
        listSiteProfilesForPage(updated.payload, pageUrl).find(
          (site) => site.id === updated.site.id,
        ) ?? null,
      siteAlias: updated.site.alias,
    }
  } catch {
    return errorResponse('INVALID_REQUEST', '登录页别名格式不正确。')
  }
}

async function removeSiteCredentials(siteId: string): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  try {
    const deleted = deleteCredentialsForSite(context.payload, siteId)
    const encryptedVault = await encryptVaultWithSessionDataKey(
      deleted.payload,
      context.encryptedVault,
      context.sessionDataKey,
    )
    await saveStoredVault(encryptedVault)

    return {
      ok: true,
      status: unlockedStatus(),
      sites: listSavedSites(deleted.payload),
      deletedCredentialCount: deleted.deletedCredentialCount,
    }
  } catch {
    return errorResponse('INVALID_REQUEST', '找不到要清理的登录页账号。')
  }
}

async function getCredential(credentialId: string): Promise<VaultResponse> {
  const context = await getUnlockedVaultContext()

  if (!context) {
    return errorResponse('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
  }

  const credential = getCredentialDetails(context.payload, credentialId)

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
      createCredentialId: () => crypto.randomUUID(),
      createSiteId: () => crypto.randomUUID(),
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
      credential: getCredentialDetails(saved.payload, saved.credential.id) ?? undefined,
      credentials: listCredentialsForSite(saved.payload, saved.site.id),
      siteProfiles: listSiteProfilesForPage(saved.payload, saved.site.loginUrl),
      activeSite:
        listSiteProfilesForPage(saved.payload, saved.site.loginUrl).find(
          (site) => site.id === saved.site.id,
        ) ?? null,
      siteAlias: saved.site.alias,
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

  const credential = getCredentialDetails(context.payload, credentialId)

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

    const siteProfiles = listSiteProfilesForPage(payload, credential.loginUrl)
    const nextActiveSite = resolveSiteProfileForPage(
      payload,
      credential.loginUrl,
    )

    return {
      ok: true,
      status: unlockedStatus(),
      credentials: listCredentialsForSite(payload, nextActiveSite?.id ?? null),
      siteProfiles,
      activeSite: nextActiveSite
        ? siteProfiles.find((site) => site.id === nextActiveSite.id) ?? null
        : null,
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

  const credential = getCredentialDetails(context.payload, credentialId)

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

    const site = getSiteProfileById(context.payload, credential.siteId)

    if (!site) {
      return errorResponse('INVALID_REQUEST', '找不到账号所属的登录页。')
    }

    if (
      currentOrigin !== site.origin ||
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

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { BackupManager } from './backup/BackupManager'
import { FishButton, FishMascot } from './components/FishMascot'
import { FISH_GUARDIAN_IMAGE, FISH_IMAGES } from './components/fish-assets'
import { CredentialManager } from './credentials/CredentialManager'
import { SavedSitesManager } from './sites/SavedSitesManager'
import {
  RESET_VAULT_CONFIRMATION,
  type VaultMessage,
  type VaultResponse,
  type VaultStatus,
} from './shared/messages'
import { MINIMUM_MASTER_PASSWORD_LENGTH } from './shared/security'
import { sendVaultMessage } from './shared/runtime'
import './App.css'

type CurrentSite = {
  hostname: string
  origin: string
  url: string
  supported: boolean
  isLoginPage: boolean
}

type VaultView =
  | 'default'
  | 'recover'
  | 'reset'
  | 'change-password'
  | 'sites'
  | 'backup'

function App() {
  const [currentSite, setCurrentSite] = useState<CurrentSite | null>(null)
  const [currentSiteAlias, setCurrentSiteAlias] = useState('')
  const [siteMessage, setSiteMessage] = useState('正在读取当前页面…')
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null)
  const [view, setView] = useState<VaultView>('default')
  const [masterPassword, setMasterPassword] = useState('')
  const [newMasterPassword, setNewMasterPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('')
  const [displayedRecoveryKey, setDisplayedRecoveryKey] = useState<string | null>(null)
  const [recoveryKeySaved, setRecoveryKeySaved] = useState(false)
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadCurrentSite(setCurrentSite, setSiteMessage)
    loadVaultStatus(setVaultStatus, setFormError)
  }, [])

  async function handleCreateVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validateNewMasterPassword(newMasterPassword, confirmedPassword, setFormError)) {
      return
    }

    await submitRequest({
      type: 'CREATE_VAULT',
      masterPassword: newMasterPassword,
    })
  }

  async function handleUnlockVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    if (!masterPassword) {
      setFormError('请输入主密码。')
      return
    }

    await submitRequest({
      type: 'UNLOCK_VAULT',
      masterPassword,
    })
  }

  async function handleRecoverVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    if (!recoveryKeyInput.trim()) {
      setFormError('请输入恢复密钥。')
      return
    }

    if (!validateNewMasterPassword(newMasterPassword, confirmedPassword, setFormError)) {
      return
    }

    await submitRequest({
      type: 'RECOVER_VAULT',
      recoveryKey: recoveryKeyInput,
      newMasterPassword,
    })
  }

  async function handleChangeMasterPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    if (!masterPassword) {
      setFormError('请输入当前主密码。')
      return
    }

    if (!validateNewMasterPassword(newMasterPassword, confirmedPassword, setFormError)) {
      return
    }

    if (masterPassword === newMasterPassword) {
      setFormError('新主密码不能与当前主密码相同。')
      return
    }

    await submitRequest({
      type: 'CHANGE_MASTER_PASSWORD',
      currentMasterPassword: masterPassword,
      newMasterPassword,
    })
  }

  async function handleRotateRecoveryKey(): Promise<void> {
    await submitRequest({ type: 'ROTATE_RECOVERY_KEY' })
  }

  async function handleLockVault(): Promise<void> {
    await submitRequest({ type: 'LOCK_VAULT' })
  }

  async function handleResetVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    if (resetConfirmation !== RESET_VAULT_CONFIRMATION) {
      setFormError(`请输入“${RESET_VAULT_CONFIRMATION}”确认永久删除。`)
      return
    }

    await submitRequest({
      type: 'RESET_VAULT',
      confirmation: resetConfirmation,
    })
  }

  async function submitRequest(message: VaultMessage): Promise<void> {
    setIsSubmitting(true)
    setFormError('')

    try {
      const response = await sendVaultMessage(message)

      if (!response.ok) {
        setFormError(response.error.message)
        return
      }

      applySuccessfulResponse(response)
    } catch {
      setFormError('操作失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  function applySuccessfulResponse(response: Extract<VaultResponse, { ok: true }>) {
    setVaultStatus(response.status)
    setDisplayedRecoveryKey(response.recoveryKey ?? null)
    setRecoveryKeySaved(false)
    setView('default')
    if (!response.status.isUnlocked) {
      setCurrentSiteAlias('')
    }
    clearSensitiveFormValues()
  }

  function clearSensitiveFormValues() {
    setMasterPassword('')
    setNewMasterPassword('')
    setConfirmedPassword('')
    setRecoveryKeyInput('')
    setResetConfirmation('')
    setFormError('')
  }

  function switchView(nextView: VaultView) {
    clearSensitiveFormValues()
    setView(nextView)
  }

  const handleVaultLocked = useCallback(() => {
    setVaultStatus({
      hasVault: true,
      isUnlocked: false,
      formatVersion: 2,
    })
    setCurrentSiteAlias('')
    setView('default')
  }, [])

  const handleSiteAliasChange = useCallback((alias: string) => {
    setCurrentSiteAlias(alias)
  }, [])

  const screen = getVaultScreen(vaultStatus)
  const version = chrome.runtime.getManifest().version

  return (
    <main className="popup">
      <header className="fish-hero">
        <span className="hero-bubble hero-bubble--one" aria-hidden="true" />
        <span className="hero-bubble hero-bubble--two" aria-hidden="true" />
        <span className="hero-bubble hero-bubble--three" aria-hidden="true" />
        <div className="hero-copy">
          <span className="hero-kicker"><span aria-hidden="true">✦</span> 蓝色大肥鱼密码管家</span>
          <div className="hero-title-row">
            <h1>VaultFill</h1>
            <span className="version">v{version}</span>
          </div>
          <p>账号交给鱼鱼，在本机安心保管</p>
        </div>
        <div className="hero-fish" aria-hidden="true">
          <span className="hero-fish-halo" />
          <img src={FISH_GUARDIAN_IMAGE} alt="" />
        </div>
      </header>

      <section className="site-card" aria-live="polite">
        <div className="site-icon" aria-hidden="true"><span>⌁</span></div>
        <div className="site-details">
          <span className="label">鱼鱼正在查看</span>
          <strong>
            {formatSiteDisplayName(
              currentSiteAlias,
              currentSite?.hostname || '—',
              currentSite?.isLoginPage ?? false,
            )}
          </strong>
          <span className="origin">{currentSite?.origin || siteMessage}</span>
        </div>
        <span className="site-chip">当前网站</span>
      </section>

      <section className={`vault-panel vault-panel--${screen}`} aria-live="polite">
        {displayedRecoveryKey ? (
          <RecoveryKeyPanel
            recoveryKey={displayedRecoveryKey}
            confirmed={recoveryKeySaved}
            onConfirmedChange={setRecoveryKeySaved}
            onContinue={() => setDisplayedRecoveryKey(null)}
          />
        ) : (
          <>
            {screen === 'loading' && <LoadingState error={formError} />}

            {screen === 'setup' && view === 'default' && (
              <CreateVaultForm
                newPassword={newMasterPassword}
                confirmedPassword={confirmedPassword}
                error={formError}
                submitting={isSubmitting}
                onNewPasswordChange={setNewMasterPassword}
                onConfirmedPasswordChange={setConfirmedPassword}
                onSubmit={handleCreateVault}
                onImportBackup={() => switchView('backup')}
              />
            )}

            {screen === 'locked' && view === 'default' && (
              <UnlockVaultForm
                password={masterPassword}
                error={formError}
                submitting={isSubmitting}
                legacyVault={vaultStatus?.formatVersion === 1}
                onPasswordChange={setMasterPassword}
                onSubmit={handleUnlockVault}
                onRecover={() => switchView('recover')}
                onReset={() => switchView('reset')}
                onImportBackup={() => switchView('backup')}
              />
            )}

            {screen === 'locked' && view === 'recover' && (
              <RecoverVaultForm
                recoveryKey={recoveryKeyInput}
                newPassword={newMasterPassword}
                confirmedPassword={confirmedPassword}
                error={formError}
                submitting={isSubmitting}
                onRecoveryKeyChange={setRecoveryKeyInput}
                onNewPasswordChange={setNewMasterPassword}
                onConfirmedPasswordChange={setConfirmedPassword}
                onSubmit={handleRecoverVault}
                onBack={() => switchView('default')}
              />
            )}

            {screen === 'locked' && view === 'reset' && (
              <ResetVaultForm
                confirmation={resetConfirmation}
                error={formError}
                submitting={isSubmitting}
                onConfirmationChange={setResetConfirmation}
                onSubmit={handleResetVault}
                onBack={() => switchView('default')}
              />
            )}

            {screen === 'unlocked' && view === 'default' && (
              <UnlockedVaultPanel
                hostname={currentSite?.hostname || '当前页面'}
                siteAlias={currentSiteAlias}
                isLoginPage={currentSite?.isLoginPage ?? false}
                origin={currentSite?.supported ? currentSite.origin : null}
                currentPageUrl={currentSite?.supported ? currentSite.url : null}
                error={formError}
                submitting={isSubmitting}
                onChangePassword={() => switchView('change-password')}
                onRotateRecoveryKey={() => void handleRotateRecoveryKey()}
                onManageSites={() => switchView('sites')}
                onManageBackup={() => switchView('backup')}
                onLock={() => void handleLockVault()}
                onSiteAliasChange={handleSiteAliasChange}
                onVaultLocked={handleVaultLocked}
              />
            )}

            {screen === 'unlocked' && view === 'sites' && (
              <SavedSitesManager
                currentOrigin={currentSite?.supported ? currentSite.origin : null}
                onBack={() => switchView('default')}
                onCurrentSiteDeleted={() => setCurrentSiteAlias('')}
                onVaultLocked={handleVaultLocked}
              />
            )}

            {screen !== 'loading' && view === 'backup' && (
              <BackupManager
                canExport={screen === 'unlocked'}
                hasExistingVault={vaultStatus?.hasVault ?? false}
                onBack={() => switchView('default')}
                onImported={applySuccessfulResponse}
                onVaultLocked={handleVaultLocked}
              />
            )}

            {screen === 'unlocked' && view === 'change-password' && (
              <ChangeMasterPasswordForm
                currentPassword={masterPassword}
                newPassword={newMasterPassword}
                confirmedPassword={confirmedPassword}
                error={formError}
                submitting={isSubmitting}
                onCurrentPasswordChange={setMasterPassword}
                onNewPasswordChange={setNewMasterPassword}
                onConfirmedPasswordChange={setConfirmedPassword}
                onSubmit={handleChangeMasterPassword}
                onBack={() => switchView('default')}
              />
            )}
          </>
        )}
      </section>

      <footer>
        <img className="footer-fish" src={FISH_IMAGES.guardian} alt="" aria-hidden="true" />
        <span>
          <strong>鱼鱼只在本机守护你的密码</strong>
          <small>AES-256-GCM 加密 · 不上传云端</small>
        </span>
      </footer>
    </main>
  )
}

type PasswordFormProps = {
  newPassword: string
  confirmedPassword: string
  error: string
  submitting: boolean
  onNewPasswordChange: (value: string) => void
  onConfirmedPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function CreateVaultForm(
  props: PasswordFormProps & { onImportBackup: () => void },
) {
  return (
    <form className="vault-form" onSubmit={props.onSubmit}>
      <FishMascot badge="🔐" variant="create" />
      <h2>创建本地密码库</h2>
      <p className="description">
        主密码不会保存。创建后会生成恢复密钥，忘记主密码时可用它恢复密码库。
      </p>
      <NewPasswordFields {...props} />
      <FormError message={props.error} />
      <FishButton variant="create" type="submit" disabled={props.submitting}>
        {props.submitting ? '鱼鱼正在加密…' : '创建并交给鱼鱼守护'}
      </FishButton>
      <button className="backup-entry-link" type="button" onClick={props.onImportBackup}>
        已有备份？恢复密码库
      </button>
      <p className="warning">主密码和恢复密钥同时丢失后，数据无法恢复。</p>
    </form>
  )
}

function NewPasswordFields(props: PasswordFormProps) {
  return (
    <>
      <label htmlFor="new-master-password">新主密码</label>
      <input
        id="new-master-password"
        type="password"
        autoComplete="new-password"
        minLength={MINIMUM_MASTER_PASSWORD_LENGTH}
        maxLength={1024}
        value={props.newPassword}
        onChange={(event) => props.onNewPasswordChange(event.target.value)}
        placeholder={`至少 ${MINIMUM_MASTER_PASSWORD_LENGTH} 个字符`}
        autoFocus
      />
      <label htmlFor="confirmed-password">确认新主密码</label>
      <input
        id="confirmed-password"
        type="password"
        autoComplete="new-password"
        minLength={MINIMUM_MASTER_PASSWORD_LENGTH}
        maxLength={1024}
        value={props.confirmedPassword}
        onChange={(event) => props.onConfirmedPasswordChange(event.target.value)}
        placeholder="再次输入新主密码"
      />
    </>
  )
}

function UnlockVaultForm({
  password,
  error,
  submitting,
  legacyVault,
  onPasswordChange,
  onSubmit,
  onRecover,
  onReset,
  onImportBackup,
}: {
  password: string
  error: string
  submitting: boolean
  legacyVault: boolean
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRecover: () => void
  onReset: () => void
  onImportBackup: () => void
}) {
  return (
    <form className="vault-form" onSubmit={onSubmit}>
      <FishMascot badge="🔒" variant="unlock" />
      <h2>密码库已锁定</h2>
      <p className="description">
        {legacyVault ? '输入原主密码后，将自动升级并生成恢复密钥。' : '输入主密码以解锁本地凭据。'}
      </p>
      <label htmlFor="unlock-password">主密码</label>
      <input
        id="unlock-password"
        type="password"
        autoComplete="current-password"
        maxLength={1024}
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        placeholder="输入主密码"
        autoFocus
      />
      <FormError message={error} />
      <FishButton variant="unlock" type="submit" disabled={submitting}>
        {submitting ? '鱼鱼正在解锁…' : '让鱼鱼解锁密码库'}
      </FishButton>
      <div className="text-actions">
        {!legacyVault && <button type="button" onClick={onRecover}>忘记主密码</button>}
        <button type="button" onClick={onImportBackup}>从备份恢复</button>
        <button type="button" className="danger-link" onClick={onReset}>重置密码库</button>
      </div>
    </form>
  )
}

function RecoverVaultForm({
  recoveryKey,
  newPassword,
  confirmedPassword,
  error,
  submitting,
  onRecoveryKeyChange,
  onNewPasswordChange,
  onConfirmedPasswordChange,
  onSubmit,
  onBack,
}: PasswordFormProps & {
  recoveryKey: string
  onRecoveryKeyChange: (value: string) => void
  onBack: () => void
}) {
  const passwordProps: PasswordFormProps = {
    newPassword,
    confirmedPassword,
    error,
    submitting,
    onNewPasswordChange,
    onConfirmedPasswordChange,
    onSubmit,
  }

  return (
    <form className="vault-form" onSubmit={onSubmit}>
      <BackButton onClick={onBack} />
      <FishMascot badge="🛟" variant="recover" />
      <h2>恢复密码库</h2>
      <p className="description">恢复成功后，旧恢复密钥会立即失效。</p>
      <label htmlFor="recovery-key">恢复密钥</label>
      <input
        id="recovery-key"
        className="monospace-input"
        type="text"
        autoComplete="off"
        maxLength={128}
        value={recoveryKey}
        onChange={(event) => onRecoveryKeyChange(event.target.value)}
        placeholder="VF-XXXX-XXXX-…"
        autoFocus
      />
      <NewPasswordFields {...passwordProps} />
      <FormError message={error} />
      <FishButton variant="recover" type="submit" disabled={submitting}>
        {submitting ? '正在恢复…' : '恢复并设置新主密码'}
      </FishButton>
    </form>
  )
}

function ChangeMasterPasswordForm({
  currentPassword,
  newPassword,
  confirmedPassword,
  error,
  submitting,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmedPasswordChange,
  onSubmit,
  onBack,
}: PasswordFormProps & {
  currentPassword: string
  onCurrentPasswordChange: (value: string) => void
  onBack: () => void
}) {
  const passwordProps: PasswordFormProps = {
    newPassword,
    confirmedPassword,
    error,
    submitting,
    onNewPasswordChange,
    onConfirmedPasswordChange,
    onSubmit,
  }

  return (
    <form className="vault-form" onSubmit={onSubmit}>
      <BackButton onClick={onBack} />
      <FishMascot badge="🔑" variant="change" />
      <h2>修改主密码</h2>
      <p className="description">修改后当前解锁会话会被关闭。</p>
      <label htmlFor="current-password">当前主密码</label>
      <input
        id="current-password"
        type="password"
        autoComplete="current-password"
        maxLength={1024}
        value={currentPassword}
        onChange={(event) => onCurrentPasswordChange(event.target.value)}
        placeholder="输入当前主密码"
        autoFocus
      />
      <NewPasswordFields {...passwordProps} />
      <FormError message={error} />
      <FishButton variant="change" type="submit" disabled={submitting}>
        {submitting ? '正在修改…' : '修改主密码'}
      </FishButton>
    </form>
  )
}

function ResetVaultForm({
  confirmation,
  error,
  submitting,
  onConfirmationChange,
  onSubmit,
  onBack,
}: {
  confirmation: string
  error: string
  submitting: boolean
  onConfirmationChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onBack: () => void
}) {
  return (
    <form className="vault-form" onSubmit={onSubmit}>
      <BackButton onClick={onBack} />
      <FishMascot badge="⚠️" variant="reset" />
      <h2>永久重置密码库</h2>
      <div className="danger-panel">
        这会删除全部加密数据，无法撤销。请输入“{RESET_VAULT_CONFIRMATION}”继续。
      </div>
      <label htmlFor="reset-confirmation">确认文字</label>
      <input
        id="reset-confirmation"
        type="text"
        autoComplete="off"
        value={confirmation}
        onChange={(event) => onConfirmationChange(event.target.value)}
        placeholder={RESET_VAULT_CONFIRMATION}
        autoFocus
      />
      <FormError message={error} />
      <FishButton variant="reset" tone="danger" type="submit" disabled={submitting}>
        {submitting ? '正在删除…' : '永久删除并重置'}
      </FishButton>
    </form>
  )
}

function RecoveryKeyPanel({
  recoveryKey,
  confirmed,
  onConfirmedChange,
  onContinue,
}: {
  recoveryKey: string
  confirmed: boolean
  onConfirmedChange: (value: boolean) => void
  onContinue: () => void
}) {
  return (
    <div className="recovery-key-panel">
      <FishMascot badge="🧾" variant="continue" />
      <h2>请保存密码库恢复密钥</h2>
      <p className="description">
        如果以后忘记主密码，可以使用这串恢复密钥重新解锁密码库，并设置新的主密码。
      </p>
      <div className="recovery-key-help">
        <strong>在哪里使用？</strong>
        <span>打开插件，在密码库锁定页面点击「忘记主密码」，然后输入恢复密钥。</span>
        <strong>它有什么作用？</strong>
        <span>验证你拥有这个密码库，让你在忘记主密码后恢复访问并设置新密码。</span>
      </div>
      <code className="recovery-key-value">{recoveryKey}</code>
      <p className="warning recovery-key-warning">
        恢复密钥相当于密码库的备用钥匙，只显示这一次。请抄写到纸上或保存到安全的离线位置，不要发送给他人或上传到网络。
      </p>
      <label className="confirmation-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => onConfirmedChange(event.target.checked)}
        />
        我已将恢复密钥保存在安全的位置
      </label>
      <FishButton variant="continue" type="button" disabled={!confirmed} onClick={onContinue}>
        继续使用 VaultFill
      </FishButton>
    </div>
  )
}

function UnlockedVaultPanel({
  hostname,
  siteAlias,
  isLoginPage,
  origin,
  currentPageUrl,
  error,
  submitting,
  onChangePassword,
  onRotateRecoveryKey,
  onManageSites,
  onManageBackup,
  onLock,
  onSiteAliasChange,
  onVaultLocked,
}: {
  hostname: string
  siteAlias: string
  isLoginPage: boolean
  origin: string | null
  currentPageUrl: string | null
  error: string
  submitting: boolean
  onChangePassword: () => void
  onRotateRecoveryKey: () => void
  onManageSites: () => void
  onManageBackup: () => void
  onLock: () => void
  onSiteAliasChange: (alias: string) => void
  onVaultLocked: () => void
}) {
  return (
    <div className="unlocked-state">
      <div className="unlocked-heading">
        <div>
          <span className="eyebrow"><span aria-hidden="true">●</span> 密码库已解锁</span>
          <h2>{formatSiteDisplayName(siteAlias, hostname, isLoginPage)}</h2>
        </div>
        <span className="unlocked-badge">鱼鱼守护中</span>
      </div>
      <CredentialManager
        origin={origin}
        currentPageUrl={currentPageUrl}
        isLoginPage={isLoginPage}
        onSiteAliasChange={onSiteAliasChange}
        onVaultLocked={onVaultLocked}
      />
      <FormError message={error} />
      <FishButton variant="sites" tone="secondary" type="button" onClick={onManageSites}>
        查看已保存登录页
      </FishButton>
      <FishButton variant="backup" tone="secondary" type="button" onClick={onManageBackup}>
        备份与恢复
      </FishButton>
      <div className="management-actions">
        <button type="button" onClick={onChangePassword} disabled={submitting}>修改主密码</button>
        <button type="button" onClick={onRotateRecoveryKey} disabled={submitting}>更新恢复密钥</button>
      </div>
      <FishButton variant="lock" tone="secondary" type="button" onClick={onLock} disabled={submitting}>
        锁定密码库
      </FishButton>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button className="back-button" type="button" onClick={onClick}>← 返回</button>
}

function LoadingState({ error }: { error: string }) {
  return (
    <div className="loading-state">
      {error ? <FormError message={error} /> : <><span className="spinner" aria-hidden="true" /><p>正在检查本地密码库…</p></>}
    </div>
  )
}

function FormError({ message }: { message: string }) {
  return message ? <p className="form-error">{message}</p> : null
}

function validateNewMasterPassword(
  password: string,
  confirmedPassword: string,
  setError: (message: string) => void,
): boolean {
  setError('')

  if (Array.from(password).length < MINIMUM_MASTER_PASSWORD_LENGTH) {
    setError(`主密码至少需要 ${MINIMUM_MASTER_PASSWORD_LENGTH} 个字符。`)
    return false
  }

  if (!password.trim()) {
    setError('主密码不能全部为空格。')
    return false
  }

  if (password !== confirmedPassword) {
    setError('两次输入的主密码不一致。')
    return false
  }

  return true
}

function getVaultScreen(
  vaultStatus: VaultStatus | null,
): 'loading' | 'setup' | 'locked' | 'unlocked' {
  if (!vaultStatus) {
    return 'loading'
  }

  if (!vaultStatus.hasVault) {
    return 'setup'
  }

  return vaultStatus.isUnlocked ? 'unlocked' : 'locked'
}

function loadVaultStatus(
  setVaultStatus: (status: VaultStatus) => void,
  setFormError: (message: string) => void,
): void {
  void sendVaultMessage({ type: 'GET_VAULT_STATUS' })
    .then((response) => {
      if (!response.ok) {
        setFormError(response.error.message)
        return
      }

      setVaultStatus(response.status)
    })
    .catch(() => {
      setFormError('无法连接 VaultFill 后台，请在扩展管理页重新加载插件。')
    })
}

function loadCurrentSite(
  setCurrentSite: (site: CurrentSite) => void,
  setSiteMessage: (message: string) => void,
): void {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (chrome.runtime.lastError || !tab?.url) {
      setSiteMessage('无法读取当前页面')
      return
    }

    try {
      const url = new URL(tab.url)
      const supported = url.protocol === 'https:' || url.protocol === 'http:'

      setCurrentSite({
        hostname: url.hostname,
        origin: url.origin,
        url: url.href,
        supported,
        isLoginPage: false,
      })
      setSiteMessage(supported ? '当前页面可以使用 VaultFill' : '此类浏览器页面不支持填充')

      if (supported && tab.id) {
        void detectLoginPage(tab.id, url.origin).then((isLoginPage) => {
          setCurrentSite({
            hostname: url.hostname,
            origin: url.origin,
            url: url.href,
            supported: true,
            isLoginPage,
          })
        })
      }
    } catch {
      setSiteMessage('当前页面地址无法识别')
    }
  })
}

async function detectLoginPage(
  tabId: number,
  expectedOrigin: string,
): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['detect-login-page.js'],
    })

    const result = (await chrome.tabs.sendMessage(tabId, {
      type: 'DETECT_LOGIN_PAGE',
      expectedOrigin,
    })) as
      | { ok: true; isLoginPage: boolean }
      | { ok: false; code: 'ORIGIN_MISMATCH' }

    return result?.ok === true && result.isLoginPage
  } catch {
    return false
  }
}

function formatSiteDisplayName(
  alias: string,
  hostname: string,
  isLoginPage: boolean,
): string {
  if (!alias) {
    return hostname
  }

  return `${alias}${isLoginPage ? '登录' : '页面'}`
}

export default App

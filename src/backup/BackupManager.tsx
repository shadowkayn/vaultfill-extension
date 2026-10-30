import { type FormEvent, useState } from 'react'
import { FishButton, FishMascot } from '../components/FishMascot'
import type { BackupImportAuthentication, VaultBackupFile } from './types'
import {
  IMPORT_VAULT_CONFIRMATION,
  type VaultResponse,
} from '../shared/messages'
import { sendVaultMessage } from '../shared/runtime'
import { MINIMUM_MASTER_PASSWORD_LENGTH } from '../shared/security'
import { MAX_BACKUP_FILE_SIZE_BYTES } from './backup-service'

type ImportMode = BackupImportAuthentication['type']

export function BackupManager({
  canExport,
  hasExistingVault,
  onBack,
  onImported,
  onVaultLocked,
}: {
  canExport: boolean
  hasExistingVault: boolean
  onBack: () => void
  onImported: (response: Extract<VaultResponse, { ok: true }>) => void
  onVaultLocked: () => void
}) {
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('master-password')
  const [masterPassword, setMasterPassword] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newMasterPassword, setNewMasterPassword] = useState('')
  const [confirmedPassword, setConfirmedPassword] = useState('')
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  function handleResponseError(
    response: VaultResponse,
  ): response is Extract<VaultResponse, { ok: false }> {
    if (response.ok) return false

    setError(response.error.message)
    if (response.error.code === 'VAULT_LOCKED') {
      onVaultLocked()
    }
    return true
  }

  async function exportBackup(): Promise<void> {
    setIsExporting(true)
    setError('')
    setSuccessMessage('')

    try {
      const response = await sendVaultMessage({ type: 'EXPORT_VAULT_BACKUP' })
      if (handleResponseError(response)) return

      if (!response.backup) {
        setError('没有收到可导出的加密备份。')
        return
      }

      downloadBackupFile(response.backup)
      setSuccessMessage('加密备份已导出，请将文件保存到安全位置。')
    } catch {
      setError('导出加密备份失败，请稍后重试。')
    } finally {
      setIsExporting(false)
    }
  }

  async function importBackup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    setSuccessMessage('')

    if (!backupFile) {
      setError('请先选择 VaultFill 加密备份文件。')
      return
    }

    if (backupFile.size > MAX_BACKUP_FILE_SIZE_BYTES) {
      setError('备份文件过大，无法安全导入。')
      return
    }

    if (hasExistingVault && !overwriteConfirmed) {
      setError('请先确认恢复操作会替换当前密码库。')
      return
    }

    let authentication: BackupImportAuthentication

    if (importMode === 'master-password') {
      if (!masterPassword) {
        setError('请输入该备份原来的主密码。')
        return
      }
      authentication = { type: 'master-password', masterPassword }
    } else {
      if (!recoveryKey.trim()) {
        setError('请输入该备份的恢复密钥。')
        return
      }
      if (Array.from(newMasterPassword).length < MINIMUM_MASTER_PASSWORD_LENGTH) {
        setError(`新主密码至少需要 ${MINIMUM_MASTER_PASSWORD_LENGTH} 个字符。`)
        return
      }
      if (!newMasterPassword.trim()) {
        setError('新主密码不能全部为空格。')
        return
      }
      if (newMasterPassword !== confirmedPassword) {
        setError('两次输入的新主密码不一致。')
        return
      }
      authentication = {
        type: 'recovery-key',
        recoveryKey,
        newMasterPassword,
      }
    }

    setIsImporting(true)

    try {
      const backupText = await backupFile.text()
      const response = await sendVaultMessage({
        type: 'IMPORT_VAULT_BACKUP',
        backupText,
        authentication,
        confirmation: overwriteConfirmed ? IMPORT_VAULT_CONFIRMATION : '',
      })

      if (handleResponseError(response)) return
      onImported(response)
    } catch {
      setError('读取或恢复备份失败，现有密码库未被替换。')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="backup-page">
      <button className="back-button" type="button" onClick={onBack}>← 返回</button>
      <FishMascot badge="🧳" compact variant="backup" />
      <h2>{canExport ? '备份与恢复' : '恢复密码库'}</h2>
      <p className="description">
        {canExport
          ? '下载一份加密备份，换电脑或重装插件后可以恢复。'
          : '选择以前下载的 VaultFill 备份，把账号数据恢复到这台浏览器。'}
      </p>

      {canExport && (
        <section className="backup-section">
          <div>
            <strong>备份当前密码库</strong>
            <span>文件中的账号和密码均为加密数据，请妥善保存。</span>
          </div>
          <p className="backup-key-reminder">
            <strong>恢复备份必须验证身份：</strong>
            请记住当前主密码，或把当前恢复密钥安全保存。二者都没有时，备份也无法恢复。
          </p>
          <FishButton
            variant="save"
            tone="secondary"
            type="button"
            disabled={isExporting || isImporting}
            onClick={() => void exportBackup()}
          >
            {isExporting ? '正在备份…' : '下载加密备份'}
          </FishButton>
        </section>
      )}

      {!canExport && hasExistingVault && (
        <p className="backup-lock-note">
          当前密码库已锁定。如需下载备份，请返回并先解锁，进入备份与恢复界面。
        </p>
      )}

      {error && <p className="form-error">{error}</p>}
      {successMessage && <p className="fill-success">{successMessage}</p>}

      <form className="backup-import-form" onSubmit={(event) => void importBackup(event)}>
        <div className="backup-section-heading">
          <strong>从备份恢复密码库</strong>
          <span>
            {hasExistingVault
              ? '恢复不是合并数据：备份会全面覆盖当前密码库。备份中有的数据会恢复，当前新增的数据可能丢失。'
              : '选择备份文件并验证身份即可恢复。'}
          </span>
        </div>

        <p className="backup-key-reminder">
          <strong>恢复时需要：</strong>
          创建这份备份时使用的主密码，或当时有效的恢复密钥。当前密码不一定能恢复旧备份。
        </p>

        <label className="backup-file-picker">
          <span>{backupFile?.name ?? '选择 VaultFill 备份文件'}</span>
          <input
            type="file"
            accept=".vault,application/json"
            onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
          />
        </label>

        {backupFile && (
          <>
            <div className="backup-verify-heading">
              <strong>验证这份备份</strong>
              <span>输入创建备份时使用的主密码；忘记主密码时可改用恢复密钥。</span>
            </div>

            <div className="backup-mode-switch" role="group" aria-label="备份验证方式">
              <button
                type="button"
                className={importMode === 'master-password' ? 'active' : ''}
                onClick={() => setImportMode('master-password')}
              >
                主密码
              </button>
              <button
                type="button"
                className={importMode === 'recovery-key' ? 'active' : ''}
                onClick={() => setImportMode('recovery-key')}
              >
                恢复密钥
              </button>
            </div>

            {importMode === 'master-password' ? (
              <>
                <label htmlFor="backup-master-password">原主密码</label>
                <input
                  id="backup-master-password"
                  type="password"
                  value={masterPassword}
                  onChange={(event) => setMasterPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="输入这份备份的主密码"
                />
              </>
            ) : (
              <>
                <label htmlFor="backup-recovery-key">原恢复密钥</label>
                <textarea
                  id="backup-recovery-key"
                  value={recoveryKey}
                  onChange={(event) => setRecoveryKey(event.target.value)}
                  placeholder="VF-XXXX-XXXX-…"
                  rows={2}
                />
                <label htmlFor="backup-new-password">设置新主密码</label>
                <input
                  id="backup-new-password"
                  type="password"
                  value={newMasterPassword}
                  onChange={(event) => setNewMasterPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <label htmlFor="backup-confirm-password">确认新主密码</label>
                <input
                  id="backup-confirm-password"
                  type="password"
                  value={confirmedPassword}
                  onChange={(event) => setConfirmedPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </>
            )}

            {hasExistingVault && (
              <label className="backup-confirm-check">
                <input
                  type="checkbox"
                  checked={overwriteConfirmed}
                  onChange={(event) => setOverwriteConfirmed(event.target.checked)}
                />
                <span>我知道此次恢复会全面覆盖当前密码库，不会合并数据</span>
              </label>
            )}

            <FishButton
              variant="recover"
              tone="danger"
              type="submit"
              disabled={isImporting || isExporting}
            >
              {isImporting ? '正在验证并恢复…' : '恢复密码库'}
            </FishButton>
          </>
        )}
      </form>
    </div>
  )
}

function downloadBackupFile(backup: VaultBackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const downloadUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = `vaultfill-backup-${new Date().toISOString().slice(0, 10)}.vault`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000)
}

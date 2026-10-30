import { useCallback, useEffect, useState } from 'react'
import { FishButton, FishMascot } from '../components/FishMascot'
import type { SiteSummary, VaultResponse } from '../shared/messages'
import { sendVaultMessage } from '../shared/runtime'

export function SavedSitesManager({
  currentOrigin,
  onBack,
  onCurrentSiteDeleted,
  onVaultLocked,
}: {
  currentOrigin: string | null
  onBack: () => void
  onCurrentSiteDeleted: () => void
  onVaultLocked: () => void
}) {
  const [sites, setSites] = useState<SiteSummary[]>([])
  const [deleteTarget, setDeleteTarget] = useState<SiteSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleResponseError = useCallback((
    response: VaultResponse,
  ): response is Extract<VaultResponse, { ok: false }> => {
    if (response.ok) {
      return false
    }

    setError(response.error.message)

    if (response.error.code === 'VAULT_LOCKED') {
      onVaultLocked()
    }

    return true
  }, [onVaultLocked])

  useEffect(() => {
    let active = true

    void sendVaultMessage({ type: 'LIST_SITES' })
      .then((response) => {
        if (!active) {
          return
        }

        if (handleResponseError(response)) {
          return
        }

        setSites(response.sites ?? [])
      })
      .catch(() => {
        if (active) {
          setError('读取已保存登录页失败，请稍后重试。')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [handleResponseError])

  async function confirmDeleteSite(): Promise<void> {
    if (!deleteTarget) {
      return
    }

    setIsSubmitting(true)
    setError('')
    setSuccessMessage('')

    try {
      const response = await sendVaultMessage({
        type: 'DELETE_SITE_CREDENTIALS',
        origin: deleteTarget.origin,
      })

      if (handleResponseError(response)) {
        return
      }

      setSites(response.sites ?? [])
      setSuccessMessage(`已清理 ${response.deletedCredentialCount ?? deleteTarget.credentialCount} 个账号。`)

      if (deleteTarget.origin === currentOrigin) {
        onCurrentSiteDeleted()
      }

      setDeleteTarget(null)
    } catch {
      setError('清理登录页账号失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function openLoginPage(loginUrl: string): Promise<void> {
    setError('')

    try {
      await chrome.tabs.create({
        url: loginUrl,
        active: true,
      })
    } catch {
      setError('无法打开登录页面，请检查保存的登录地址。')
    }
  }

  if (isLoading) {
    return (
      <div className="credential-loading">
        <span className="spinner" aria-hidden="true" />
        正在读取已保存登录页…
      </div>
    )
  }

  if (deleteTarget) {
    return (
      <div className="saved-sites-delete">
        <button className="back-button" type="button" onClick={() => setDeleteTarget(null)}>
          ← 返回
        </button>
        <FishMascot badge="🧹" variant="clearSite" />
        <h2>清理整个登录页</h2>
        <p>
          将删除“{deleteTarget.alias || deleteTarget.hostname}”保存的全部
          <strong> {deleteTarget.credentialCount} 个账号和密码</strong>。
        </p>
        <code>{deleteTarget.origin}</code>
        <p className="danger-copy">此操作无法撤销，但不会影响其他网站。</p>
        {error && <p className="form-error">{error}</p>}
        <FishButton
          variant="clearSite"
          tone="danger"
          type="button"
          disabled={isSubmitting}
          onClick={() => void confirmDeleteSite()}
        >
          {isSubmitting ? '正在清理…' : '清理该登录页全部账号'}
        </FishButton>
        <button
          className="secondary-button"
          type="button"
          disabled={isSubmitting}
          onClick={() => setDeleteTarget(null)}
        >
          取消
        </button>
      </div>
    )
  }

  return (
    <div className="saved-sites-page">
      <button className="back-button" type="button" onClick={onBack}>← 返回</button>
      <div className="saved-sites-heading">
        <FishMascot badge="🗂️" compact variant="sites" />
        <div>
          <h2>已保存登录页</h2>
          <p>查看哪些网站保存了账号，也可以按网站一次性清理。</p>
        </div>
      </div>

      {successMessage && <p className="fill-success">{successMessage}</p>}
      {error && <p className="form-error">{error}</p>}

      {sites.length === 0 ? (
        <div className="empty-credentials">
          <FishMascot badge="✨" compact variant="sites" />
          <strong>还没有保存任何登录页</strong>
          <p>在网站中添加账号后，会显示在这里。</p>
        </div>
      ) : (
        <div className="saved-sites-list">
          {sites.map((site) => (
            <article className="saved-site-card" key={site.origin}>
              <div className="saved-site-summary">
                <span className="saved-site-title-row">
                  <strong>{site.alias || site.hostname}</strong>
                  {site.origin === currentOrigin && <em>当前网站</em>}
                </span>
                <span className="saved-site-address-label">站点地址</span>
                <code>{site.origin}</code>
                <span className="saved-site-address-label">登录地址</span>
                <button
                  className="saved-site-login-link"
                  type="button"
                  aria-label={`在新页签打开登录页面：${site.loginUrl}`}
                  title={`${site.loginUrl}\n点击后在新页签打开`}
                  onClick={() => void openLoginPage(site.loginUrl)}
                >
                  {site.loginUrl}
                </button>
                <small>
                  已保存 {site.credentialCount} 个账号 · 最近更新 {formatDate(site.updatedAt)}
                </small>
              </div>
              <button
                className="saved-site-delete-button"
                type="button"
                onClick={() => {
                  setError('')
                  setSuccessMessage('')
                  setDeleteTarget(site)
                }}
              >
                清理全部
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleDateString('zh-CN')
}

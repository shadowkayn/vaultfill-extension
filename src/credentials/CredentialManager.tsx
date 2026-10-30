import { type FormEvent, useEffect, useState } from 'react'
import { FishButton, FishMascot } from '../components/FishMascot'
import type {
  CredentialInput,
  CredentialSummary,
  VaultResponse,
} from '../shared/messages'
import { sendVaultMessage } from '../shared/runtime'

type CredentialForm = {
  id?: string
  label: string
  loginUrl: string
  username: string
  password: string
  notes: string
}

type CredentialView = 'list' | 'form' | 'delete'

const emptyCredentialForm: CredentialForm = {
  label: '',
  loginUrl: '',
  username: '',
  password: '',
  notes: '',
}

export function CredentialManager({
  origin,
  currentPageUrl,
  isLoginPage,
  onVaultLocked,
  onSiteAliasChange,
}: {
  origin: string | null
  currentPageUrl: string | null
  isLoginPage: boolean
  onVaultLocked: () => void
  onSiteAliasChange: (alias: string) => void
}) {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [siteAlias, setSiteAlias] = useState('')
  const [siteAliasDraft, setSiteAliasDraft] = useState('')
  const [isEditingSiteAlias, setIsEditingSiteAlias] = useState(false)
  const [view, setView] = useState<CredentialView>('list')
  const [form, setForm] = useState<CredentialForm>(emptyCredentialForm)
  const [deleteTarget, setDeleteTarget] = useState<CredentialSummary | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fillingCredentialId, setFillingCredentialId] = useState<string | null>(null)
  const [fillStatus, setFillStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!origin) {
      return
    }

    let active = true

    void sendVaultMessage({
        type: 'LIST_CREDENTIALS',
        origin,
      })
      .then((response) => {
        if (!active) {
          return
        }

        if (!response.ok) {
          setError(response.error.message)
          if (response.error.code === 'VAULT_LOCKED') {
            onVaultLocked()
          }
          return
        }

        setCredentials(response.credentials ?? [])
        const nextAlias = response.siteAlias ?? ''
        setSiteAlias(nextAlias)
        setSiteAliasDraft(nextAlias)
        onSiteAliasChange(nextAlias)
      })
      .catch(() => {
        if (active) {
          setError('读取账号列表失败，请稍后重试。')
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
  }, [origin, onSiteAliasChange, onVaultLocked])

  function handleResponseError(response: VaultResponse): response is Extract<VaultResponse, { ok: false }> {
    if (response.ok) {
      return false
    }

    setError(response.error.message)
    setFillStatus('')

    if (response.error.code === 'VAULT_LOCKED') {
      onVaultLocked()
    }

    return true
  }

  function startCreatingCredential() {
    setForm({
      ...emptyCredentialForm,
      loginUrl: currentPageUrl ?? origin ?? '',
    })
    setShowPassword(false)
    setError('')
    setFillStatus('')
    setView('form')
  }

  async function saveSiteAlias(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!origin) {
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await sendVaultMessage({
        type: 'SET_SITE_ALIAS',
        origin,
        alias: siteAliasDraft,
      })

      if (handleResponseError(response)) {
        return
      }

      const nextAlias = response.siteAlias ?? ''
      setSiteAlias(nextAlias)
      setSiteAliasDraft(nextAlias)
      setIsEditingSiteAlias(false)
      onSiteAliasChange(nextAlias)
    } catch {
      setError('保存登录页别名失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function startEditingCredential(credentialId: string): Promise<void> {
    setIsLoading(true)
    setError('')
    setFillStatus('')

    try {
      const response = await sendVaultMessage({
        type: 'GET_CREDENTIAL',
        credentialId,
      })

      if (handleResponseError(response)) {
        return
      }

      if (!response.credential) {
        setError('找不到要编辑的账号。')
        return
      }

      setForm({
        id: response.credential.id,
        label: response.credential.label,
        loginUrl: response.credential.loginUrl ?? currentPageUrl ?? origin ?? '',
        username: response.credential.username,
        password: response.credential.password,
        notes: response.credential.notes ?? '',
      })
      setShowPassword(false)
      setView('form')
    } catch {
      setError('读取账号信息失败，请稍后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!origin) {
      setError('当前页面不支持保存账号。')
      return
    }

    if (
      !form.label.trim() ||
      !form.loginUrl.trim() ||
      !form.username.trim() ||
      !form.password
    ) {
      setError('账号名称、登录页面地址、用户名和密码不能为空。')
      return
    }

    try {
      const loginUrl = new URL(form.loginUrl)
      if (
        loginUrl.origin !== origin ||
        (loginUrl.protocol !== 'https:' && loginUrl.protocol !== 'http:')
      ) {
        setError('登录页面地址必须与当前网站使用相同的协议、域名和端口。')
        return
      }
    } catch {
      setError('请输入完整有效的登录页面地址。')
      return
    }

    setIsSubmitting(true)

    const credential: CredentialInput = {
      ...(form.id ? { id: form.id } : {}),
      label: form.label,
      origin,
      loginUrl: form.loginUrl,
      username: form.username,
      password: form.password,
      ...(form.notes.trim() ? { notes: form.notes } : {}),
    }

    try {
      const response = await sendVaultMessage({
        type: 'SAVE_CREDENTIAL',
        credential,
      })

      if (handleResponseError(response)) {
        return
      }

      setCredentials(response.credentials ?? [])
      closeSensitiveView()
    } catch {
      setError('保存账号失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  function startDeletingCredential(credential: CredentialSummary) {
    setDeleteTarget(credential)
    setError('')
    setFillStatus('')
    setView('delete')
  }

  async function confirmDeleteCredential(): Promise<void> {
    if (!deleteTarget) {
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await sendVaultMessage({
        type: 'DELETE_CREDENTIAL',
        credentialId: deleteTarget.id,
      })

      if (handleResponseError(response)) {
        return
      }

      setCredentials(response.credentials ?? [])
      closeSensitiveView()
    } catch {
      setError('删除账号失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  function closeSensitiveView() {
    setForm(emptyCredentialForm)
    setDeleteTarget(null)
    setShowPassword(false)
    setError('')
    setFillStatus('')
    setView('list')
  }

  async function fillCredential(credentialId: string): Promise<void> {
    if (!origin) {
      setError('当前页面不支持填入账号。')
      return
    }

    setFillingCredentialId(credentialId)
    setError('')
    setFillStatus('')

    try {
      const response = await sendVaultMessage({
        type: 'FILL_CREDENTIAL',
        credentialId,
        expectedOrigin: origin,
      })

      if (handleResponseError(response)) {
        return
      }

      const result = response.fillResult

      if (!result) {
        setError('网页没有返回填入结果。')
        return
      }

      if (result.usernameFieldFound && result.passwordFieldFound) {
        setFillStatus('用户名和密码已填入，请检查后手动登录。')
      } else if (result.usernameFieldFound) {
        setFillStatus('已填入用户名，当前页面没有找到密码框。')
      } else {
        setFillStatus('已填入密码，当前页面没有找到用户名框。')
      }
    } catch {
      setError('填入账号失败，请稍后重试。')
    } finally {
      setFillingCredentialId(null)
    }
  }

  if (!origin) {
    return (
      <div className="empty-credentials">
        <FishMascot badge="🚫" compact variant="change" />
        <strong>当前页面不支持账号保存</strong>
        <p>请打开普通 HTTP 或 HTTPS 登录页面。</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="credential-loading">
        <span className="spinner" aria-hidden="true" />
        正在读取账号…
      </div>
    )
  }

  if (view === 'form') {
    return (
      <form className="credential-form" onSubmit={handleSave}>
        <div className="credential-form-heading">
          <button type="button" onClick={closeSensitiveView}>← 返回</button>
          <strong>{form.id ? '编辑账号' : '添加账号'}</strong>
        </div>
        <label htmlFor="credential-label">账号名称</label>
        <input
          id="credential-label"
          type="text"
          maxLength={100}
          value={form.label}
          onChange={(event) => setForm({ ...form, label: event.target.value })}
          placeholder="例如：公司管理员"
          autoFocus
        />
        <label htmlFor="credential-login-url">登录页面地址</label>
        <input
          id="credential-login-url"
          type="url"
          maxLength={2048}
          value={form.loginUrl}
          onChange={(event) => setForm({ ...form, loginUrl: event.target.value })}
          placeholder="例如：https://example.com/login"
        />
        <span className="credential-field-help">必须与当前网站使用相同的协议、域名和端口。</span>
        <label htmlFor="credential-username">用户名</label>
        <input
          id="credential-username"
          type="text"
          maxLength={320}
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
          placeholder="登录账号或邮箱"
        />
        <label htmlFor="credential-password">密码</label>
        <div className="password-field">
          <input
            id="credential-password"
            type={showPassword ? 'text' : 'password'}
            maxLength={4096}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="网站登录密码"
          />
          <button type="button" onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? '隐藏' : '显示'}
          </button>
        </div>
        <label htmlFor="credential-notes">备注（可选）</label>
        <textarea
          id="credential-notes"
          maxLength={2000}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="部门、用途或其他说明"
          rows={3}
        />
        <CredentialError message={error} />
        <FishButton variant="save" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '正在加密保存…' : '保存账号'}
        </FishButton>
      </form>
    )
  }

  if (view === 'delete' && deleteTarget) {
    return (
      <div className="credential-delete">
        <FishMascot badge="🗑️" compact variant="delete" />
        <strong>删除“{deleteTarget.label}”？</strong>
        <p>用户名：{deleteTarget.username}</p>
        <p className="danger-copy">删除后无法恢复。</p>
        <CredentialError message={error} />
        <FishButton
          variant="delete"
          tone="danger"
          type="button"
          onClick={() => void confirmDeleteCredential()}
          disabled={isSubmitting}
        >
          {isSubmitting ? '正在删除…' : '确认删除'}
        </FishButton>
        <FishButton variant="cancel" tone="secondary" type="button" onClick={closeSensitiveView}>
          取消
        </FishButton>
      </div>
    )
  }

  return (
    <div className="credential-list">
      <div className="site-alias-card">
        {isEditingSiteAlias ? (
          <form className="site-alias-form" onSubmit={(event) => void saveSiteAlias(event)}>
            <label htmlFor="site-alias">登录页别名</label>
            <input
              id="site-alias"
              type="text"
              value={siteAliasDraft}
              onChange={(event) => setSiteAliasDraft(event.target.value)}
              placeholder="例如：公司内网后台"
              autoFocus
            />
            <div className="site-alias-actions">
              <button type="submit" disabled={isSubmitting}>保存</button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setSiteAliasDraft(siteAlias)
                  setIsEditingSiteAlias(false)
                }}
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          <>
            <div>
              <span>登录页别名</span>
              <strong>{siteAlias || '未设置别名'}</strong>
            </div>
            <button
              type="button"
              onClick={() => {
                setSiteAliasDraft(siteAlias)
                setIsEditingSiteAlias(true)
              }}
            >
              {siteAlias ? '修改' : '设置'}
            </button>
          </>
        )}
      </div>
      {!isLoginPage && (
        <p className="page-mode-note">
          当前是网站内部页面；进入包含密码输入框的登录页后，才会显示“一键填入”。
        </p>
      )}
      {credentials.length === 0 ? (
        <div className="empty-credentials">
          <FishMascot badge="🗝️" compact variant="unlock" />
          <strong>这个网站还没有保存的账号</strong>
          <p>可以保存多个账号，之后再选择需要填入的账号。</p>
        </div>
      ) : (
        credentials.map((credential) => (
          <article className="credential-card" key={credential.id}>
            <div>
              <strong>{credential.label}</strong>
              <span>{credential.username}</span>
            </div>
            <div className="credential-actions">
              {isLoginPage && (
                <button
                  type="button"
                  className="fill"
                  onClick={() => void fillCredential(credential.id)}
                  disabled={fillingCredentialId !== null}
                >
                  {fillingCredentialId === credential.id ? '填入中…' : '一键填入'}
                </button>
              )}
              <button type="button" onClick={() => void startEditingCredential(credential.id)}>编辑</button>
              <button type="button" className="delete" onClick={() => startDeletingCredential(credential)}>删除</button>
            </div>
          </article>
        ))
      )}
      <CredentialError message={error} />
      {fillStatus && <p className="fill-success">{fillStatus}</p>}
      <FishButton variant="add" type="button" onClick={startCreatingCredential}>
        添加账号
      </FishButton>
    </div>
  )
}

function CredentialError({ message }: { message: string }) {
  return message ? <p className="form-error">{message}</p> : null
}

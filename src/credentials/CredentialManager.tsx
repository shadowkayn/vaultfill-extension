import { type FormEvent, useEffect, useState } from 'react'
import type {
  CredentialInput,
  CredentialSummary,
  VaultResponse,
} from '../shared/messages'
import { sendVaultMessage } from '../shared/runtime'

type CredentialForm = {
  id?: string
  label: string
  username: string
  password: string
  notes: string
}

type CredentialView = 'list' | 'form' | 'delete'

const emptyCredentialForm: CredentialForm = {
  label: '',
  username: '',
  password: '',
  notes: '',
}

export function CredentialManager({
  origin,
  onVaultLocked,
}: {
  origin: string | null
  onVaultLocked: () => void
}) {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [view, setView] = useState<CredentialView>('list')
  const [form, setForm] = useState<CredentialForm>(emptyCredentialForm)
  const [deleteTarget, setDeleteTarget] = useState<CredentialSummary | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
  }, [origin, onVaultLocked])

  function handleResponseError(response: VaultResponse): response is Extract<VaultResponse, { ok: false }> {
    if (response.ok) {
      return false
    }

    setError(response.error.message)

    if (response.error.code === 'VAULT_LOCKED') {
      onVaultLocked()
    }

    return true
  }

  function startCreatingCredential() {
    setForm(emptyCredentialForm)
    setShowPassword(false)
    setError('')
    setView('form')
  }

  async function startEditingCredential(credentialId: string): Promise<void> {
    setIsLoading(true)
    setError('')

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

    if (!form.label.trim() || !form.username.trim() || !form.password) {
      setError('账号名称、用户名和密码不能为空。')
      return
    }

    setIsSubmitting(true)

    const credential: CredentialInput = {
      ...(form.id ? { id: form.id } : {}),
      label: form.label,
      origin,
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
    setView('list')
  }

  if (!origin) {
    return (
      <div className="empty-credentials">
        <div className="state-icon" aria-hidden="true">🚫</div>
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
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '正在加密保存…' : '保存账号'}
        </button>
      </form>
    )
  }

  if (view === 'delete' && deleteTarget) {
    return (
      <div className="credential-delete">
        <div className="state-icon" aria-hidden="true">🗑️</div>
        <strong>删除“{deleteTarget.label}”？</strong>
        <p>用户名：{deleteTarget.username}</p>
        <p className="danger-copy">删除后无法恢复。</p>
        <CredentialError message={error} />
        <button
          className="danger-button"
          type="button"
          onClick={() => void confirmDeleteCredential()}
          disabled={isSubmitting}
        >
          {isSubmitting ? '正在删除…' : '确认删除'}
        </button>
        <button className="secondary-button" type="button" onClick={closeSensitiveView}>
          取消
        </button>
      </div>
    )
  }

  return (
    <div className="credential-list">
      {credentials.length === 0 ? (
        <div className="empty-credentials">
          <div className="state-icon" aria-hidden="true">🗝️</div>
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
              <button type="button" onClick={() => void startEditingCredential(credential.id)}>编辑</button>
              <button type="button" className="delete" onClick={() => startDeletingCredential(credential)}>删除</button>
            </div>
          </article>
        ))
      )}
      <CredentialError message={error} />
      <button className="primary-button" type="button" onClick={startCreatingCredential}>
        添加账号
      </button>
    </div>
  )
}

function CredentialError({ message }: { message: string }) {
  return message ? <p className="form-error">{message}</p> : null
}

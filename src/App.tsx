import { useEffect, useState } from 'react'
import './App.css'

type CurrentSite = {
  hostname: string
  origin: string
  supported: boolean
}

function App() {
  const [currentSite, setCurrentSite] = useState<CurrentSite | null>(null)
  const [message, setMessage] = useState('正在读取当前页面…')

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (chrome.runtime.lastError || !tab?.url) {
        setMessage('无法读取当前页面')
        return
      }

      try {
        const url = new URL(tab.url)
        const supported = url.protocol === 'https:' || url.protocol === 'http:'

        setCurrentSite({
          hostname: url.hostname,
          origin: url.origin,
          supported,
        })
        setMessage(supported ? '当前页面可以使用 VaultFill' : '此类浏览器页面不支持填充')
      } catch {
        setMessage('当前页面地址无法识别')
      }
    })
  }, [])

  return (
    <main className="popup">
      <header className="header">
        <div className="brand-mark" aria-hidden="true">
          V
        </div>
        <div>
          <h1>VaultFill</h1>
          <p>本地加密密码库</p>
        </div>
        <span className="version">v0.1.0</span>
      </header>

      <section className="site-card" aria-live="polite">
        <span className="label">当前网站</span>
        <strong>{currentSite?.hostname || '—'}</strong>
        <span className="origin">{currentSite?.origin || message}</span>
      </section>

      <section className="empty-state">
        <div className="lock" aria-hidden="true">
          🔒
        </div>
        <h2>项目骨架已就绪</h2>
        <p>{message}</p>
        <p className="hint">下一阶段将接入主密码和本地加密密码库。</p>
      </section>

      <button type="button" disabled={!currentSite?.supported}>
        密码库功能即将接入
      </button>

      <footer>
        <span className="status-dot" aria-hidden="true" />
        Manifest V3 · 本地运行
      </footer>
    </main>
  )
}

export default App

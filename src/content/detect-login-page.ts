type VaultFillLoginDetectorGlobal = typeof globalThis & {
  __vaultFillLoginDetectorInstalled?: boolean
}

var vaultFillLoginDetectorGlobal = globalThis as VaultFillLoginDetectorGlobal

if (!vaultFillLoginDetectorGlobal.__vaultFillLoginDetectorInstalled) {
  vaultFillLoginDetectorGlobal.__vaultFillLoginDetectorInstalled = true

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'DETECT_LOGIN_PAGE') {
      return
    }

    if (location.origin !== message.expectedOrigin) {
      sendResponse({ ok: false, code: 'ORIGIN_MISMATCH' })
      return
    }

    sendResponse({
      ok: true,
      isLoginPage: hasUsableLoginPasswordField(),
    })
  })
}

function hasUsableLoginPasswordField(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="password"]:not([autocomplete="new-password"])',
    ),
  ).some((input) => {
    if (input.disabled || input.readOnly || input.hidden) {
      return false
    }

    const style = getComputedStyle(input)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

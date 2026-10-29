import { fillLoginFields } from './form-filler'

type VaultFillContentScriptGlobal = typeof globalThis & {
  __vaultFillContentScriptInstalled?: boolean
}

var vaultFillGlobal = globalThis as VaultFillContentScriptGlobal

if (!vaultFillGlobal.__vaultFillContentScriptInstalled) {
  vaultFillGlobal.__vaultFillContentScriptInstalled = true

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'FILL_LOGIN_FIELDS') {
      if (location.origin !== message.expectedOrigin) {
        sendResponse({ ok: false, code: 'ORIGIN_MISMATCH' })
        return
      }

      sendResponse(fillLoginFields(message.username, message.password))
    }
  })
}

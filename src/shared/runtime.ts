import type { VaultMessage, VaultResponse } from './messages'

export function sendVaultMessage(message: VaultMessage): Promise<VaultResponse> {
  return chrome.runtime.sendMessage(message) as Promise<VaultResponse>
}

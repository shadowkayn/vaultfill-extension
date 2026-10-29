const SESSION_DATA_KEY = 'vaultfill.sessionDataKey'
const LEGACY_SESSION_KEY = 'vaultfill.sessionKey'

export async function getSessionDataKey(): Promise<string | null> {
  const result = await chrome.storage.session.get(SESSION_DATA_KEY)
  const sessionDataKey: unknown = result[SESSION_DATA_KEY]

  return typeof sessionDataKey === 'string' ? sessionDataKey : null
}

export async function saveSessionDataKey(
  sessionDataKey: string,
): Promise<void> {
  await chrome.storage.session.set({ [SESSION_DATA_KEY]: sessionDataKey })
  await chrome.storage.session.remove(LEGACY_SESSION_KEY)
}

export async function clearSessionDataKey(): Promise<void> {
  await chrome.storage.session.remove([SESSION_DATA_KEY, LEGACY_SESSION_KEY])
}

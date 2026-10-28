chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.info('VaultFill installed')
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_EXTENSION_STATUS') {
    sendResponse({
      ready: true,
      version: chrome.runtime.getManifest().version,
    })
  }
})

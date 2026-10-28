type LoginFieldDetection = {
  usernameFieldFound: boolean
  passwordFieldFound: boolean
}

function detectLoginFields(): LoginFieldDetection {
  const passwordField = document.querySelector<HTMLInputElement>(
    'input[type="password"]',
  )
  const usernameField = document.querySelector<HTMLInputElement>(
    'input[autocomplete="username"], input[type="email"], input[type="text"]',
  )

  return {
    usernameFieldFound: usernameField !== null,
    passwordFieldFound: passwordField !== null,
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'DETECT_LOGIN_FIELDS') {
    sendResponse(detectLoginFields())
  }
})

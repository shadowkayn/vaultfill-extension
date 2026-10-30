export type FillLoginResult =
  | {
      ok: true
      status: 'filled'
      usernameFieldFound: boolean
      passwordFieldFound: boolean
    }
  | {
      ok: false
      code: 'NO_LOGIN_FIELDS'
    }

export function hasUsableLoginPasswordField(): boolean {
  return findPasswordField() !== null
}

export function fillLoginFields(
  username: string,
  password: string,
): FillLoginResult {
  const passwordField = findPasswordField()
  const usernameField = findUsernameField(passwordField)

  if (!usernameField && !passwordField) {
    return { ok: false, code: 'NO_LOGIN_FIELDS' }
  }

  if (usernameField) {
    setFrameworkCompatibleValue(usernameField, username)
  }

  if (passwordField) {
    setFrameworkCompatibleValue(passwordField, password)
  }

  return {
    ok: true,
    status: 'filled',
    usernameFieldFound: usernameField !== null,
    passwordFieldFound: passwordField !== null,
  }
}

function findPasswordField(): HTMLInputElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[type="password"]:not([autocomplete="new-password"])',
    ),
  ).filter(isUsableInput)

  return (
    candidates.find((input) => input.autocomplete === 'current-password') ??
    candidates[0] ??
    null
  )
}

function findUsernameField(
  passwordField: HTMLInputElement | null,
): HTMLInputElement | null {
  const scope = passwordField?.form ?? document
  const scopedCandidate = findBestUsernameCandidate(
    scope,
    passwordField,
    passwordField ? 0 : 50,
  )

  if (scopedCandidate || !passwordField?.form) {
    return scopedCandidate
  }

  return findBestUsernameCandidate(document, passwordField, 50)
}

function findBestUsernameCandidate(
  scope: ParentNode,
  passwordField: HTMLInputElement | null,
  minimumScore: number,
): HTMLInputElement | null {
  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>(
      'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
    ),
  )
    .filter(isUsableInput)
    .filter((input) => {
      const autocomplete = input.autocomplete.toLowerCase()
      return !['new-password', 'current-password', 'one-time-code'].includes(
        autocomplete,
      )
    })

  const bestCandidate = candidates
    .map((input) => ({ input, score: scoreUsernameField(input, passwordField) }))
    .sort((first, second) => second.score - first.score)[0]

  return bestCandidate && bestCandidate.score >= minimumScore
    ? bestCandidate.input
    : null
}

function scoreUsernameField(
  input: HTMLInputElement,
  passwordField: HTMLInputElement | null,
): number {
  const autocomplete = input.autocomplete.toLowerCase()
  const identity = `${input.name} ${input.id} ${input.placeholder}`.toLowerCase()
  let score = 0

  if (autocomplete === 'username') score += 100
  if (input.type === 'email') score += 80
  if (/(user|email|login|account|账号|用户|邮箱)/i.test(identity)) score += 50
  if (input.type === 'text' || input.type === 'email' || input.type === 'tel') {
    score += 20
  }
  if (
    passwordField &&
    (input.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING)
  ) {
    score += 10
  }

  return score
}

function isUsableInput(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly || input.hidden || input.type === 'hidden') {
    return false
  }

  const style = getComputedStyle(input)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function setFrameworkCompatibleValue(
  input: HTMLInputElement,
  value: string,
): void {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set

  if (valueSetter) {
    valueSetter.call(input, value)
  } else {
    input.value = value
  }

  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

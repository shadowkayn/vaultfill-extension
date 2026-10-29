// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fillLoginFields } from './form-filler'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('login form filler', () => {
  it('fills a standard login form and dispatches framework-compatible events', () => {
    document.body.innerHTML = `
      <form>
        <input id="email" type="email" autocomplete="username" />
        <input id="password" type="password" autocomplete="current-password" />
      </form>
    `
    const usernameInput = document.querySelector<HTMLInputElement>('#email')!
    const passwordInput = document.querySelector<HTMLInputElement>('#password')!
    const usernameInputEvent = vi.fn()
    const passwordChangeEvent = vi.fn()
    usernameInput.addEventListener('input', usernameInputEvent)
    passwordInput.addEventListener('change', passwordChangeEvent)

    const result = fillLoginFields('admin@example.com', 'site-password')

    expect(result).toEqual({
      ok: true,
      status: 'filled',
      usernameFieldFound: true,
      passwordFieldFound: true,
    })
    expect(usernameInput.value).toBe('admin@example.com')
    expect(passwordInput.value).toBe('site-password')
    expect(usernameInputEvent).toHaveBeenCalledOnce()
    expect(passwordChangeEvent).toHaveBeenCalledOnce()
  })

  it('prefers an explicit username field over unrelated text inputs', () => {
    document.body.innerHTML = `
      <form>
        <input id="search" type="text" placeholder="搜索" />
        <input id="account" type="text" autocomplete="username" />
        <input id="password" type="password" />
      </form>
    `

    fillLoginFields('chosen-user', 'chosen-password')

    expect(document.querySelector<HTMLInputElement>('#search')!.value).toBe('')
    expect(document.querySelector<HTMLInputElement>('#account')!.value).toBe(
      'chosen-user',
    )
  })

  it('supports a username-only step', () => {
    document.body.innerHTML = `
      <input id="username" type="text" autocomplete="username" />
    `

    const result = fillLoginFields('step-user', 'unused-password')

    expect(result).toMatchObject({
      ok: true,
      usernameFieldFound: true,
      passwordFieldFound: false,
    })
    expect(document.querySelector<HTMLInputElement>('#username')!.value).toBe(
      'step-user',
    )
  })

  it('supports a password-only step', () => {
    document.body.innerHTML = `
      <input id="password" type="password" autocomplete="current-password" />
    `

    const result = fillLoginFields('unused-user', 'step-password')

    expect(result).toMatchObject({
      ok: true,
      usernameFieldFound: false,
      passwordFieldFound: true,
    })
    expect(document.querySelector<HTMLInputElement>('#password')!.value).toBe(
      'step-password',
    )
  })

  it('does not fill an unrelated text field when no password field exists', () => {
    document.body.innerHTML = `
      <input id="search" type="text" placeholder="搜索内容" />
    `

    expect(fillLoginFields('should-not-fill', 'unused-password')).toEqual({
      ok: false,
      code: 'NO_LOGIN_FIELDS',
    })
    expect(document.querySelector<HTMLInputElement>('#search')!.value).toBe('')
  })

  it('ignores hidden inputs and new-password fields', () => {
    document.body.innerHTML = `
      <input type="text" autocomplete="username" style="display: none" />
      <input type="password" autocomplete="new-password" />
      <input type="password" autocomplete="new-password" />
    `

    expect(fillLoginFields('user', 'password')).toEqual({
      ok: false,
      code: 'NO_LOGIN_FIELDS',
    })
  })
})

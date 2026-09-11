import {describe, expect, test} from 'vitest'

import {mcpPolicy} from '../mcpPolicy.js'

function validate(
  commandId: string,
  invocation: {args?: Record<string, unknown>; flags?: Record<string, unknown>},
): boolean {
  const policy = mcpPolicy[commandId]
  if (!policy) throw new Error(`No policy for ${commandId}`)
  return policy.validate({args: invocation.args ?? {}, flags: invocation.flags ?? {}})
}

describe('mcpPolicy media:import', () => {
  test('is conditional rather than an outright deny', () => {
    expect(mcpPolicy['media:import']?.kind).toBe('conditional')
  })

  test('allows an http(s) URL source', () => {
    expect(validate('media:import', {args: {source: 'https://example.com/hero.png'}})).toBe(true)
    expect(validate('media:import', {args: {source: 'http://example.com/hero.png'}})).toBe(true)
  })

  test.each([
    ['a relative directory', './products'],
    ['a bare directory name', 'products'],
    ['an archive', 'gallery.tar.gz'],
    ['an absolute path', '/srv/media'],
    ['a Windows path', String.raw`C:\media`],
    ['a file: URL', 'file:///srv/media/hero.png'],
  ])('refuses %s, which would read from the host', (_label, source) => {
    expect(validate('media:import', {args: {source}})).toBe(false)
  })

  test('refuses a missing source', () => {
    expect(validate('media:import', {args: {}})).toBe(false)
  })

  test('refuses --replace-aspects even alongside a URL source', () => {
    expect(
      validate('media:import', {
        args: {source: 'https://example.com/hero.png'},
        flags: {'replace-aspects': true},
      }),
    ).toBe(false)
  })

  test('allows the aspect and filename flags with a URL source', () => {
    expect(
      validate('media:import', {
        args: {source: 'https://example.com/hero.png'},
        flags: {aspect: ['department=Brand'], filename: 'hero.png'},
      }),
    ).toBe(true)
  })
})

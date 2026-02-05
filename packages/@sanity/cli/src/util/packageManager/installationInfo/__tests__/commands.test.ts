import {describe, expect, test} from 'vitest'

import {getGlobalUninstallCommand, getLocalRemoveCommand} from '../commands.js'

describe('getGlobalUninstallCommand', () => {
  test('generates npm global uninstall command', () => {
    expect(getGlobalUninstallCommand('npm', '@sanity/cli')).toBe('npm uninstall -g @sanity/cli')
  })

  test('generates pnpm global uninstall command', () => {
    expect(getGlobalUninstallCommand('pnpm', '@sanity/cli')).toBe('pnpm remove -g @sanity/cli')
  })

  test('generates yarn global uninstall command', () => {
    expect(getGlobalUninstallCommand('yarn', '@sanity/cli')).toBe('yarn global remove @sanity/cli')
  })

  test('generates bun global uninstall command', () => {
    expect(getGlobalUninstallCommand('bun', '@sanity/cli')).toBe('bun remove -g @sanity/cli')
  })
})

describe('getLocalRemoveCommand', () => {
  test('generates npm remove command', () => {
    expect(getLocalRemoveCommand('npm', '@sanity/cli')).toBe('npm uninstall @sanity/cli')
  })

  test('generates pnpm remove command', () => {
    expect(getLocalRemoveCommand('pnpm', '@sanity/cli')).toBe('pnpm remove @sanity/cli')
  })

  test('generates yarn remove command', () => {
    expect(getLocalRemoveCommand('yarn', '@sanity/cli')).toBe('yarn remove @sanity/cli')
  })

  test('generates bun remove command', () => {
    expect(getLocalRemoveCommand('bun', '@sanity/cli')).toBe('bun remove @sanity/cli')
  })
})

import {createElement, type ReactNode} from 'react'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {SchemaIcon} from '../SchemaIcon.js'

const mockResolveLocalPackage = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    resolveLocalPackage: mockResolveLocalPackage,
  }
})

const MockThemeProvider = ({children}: {children: ReactNode}) => <>{children}</>

function setupMocks() {
  const mockTheme = {color: 'mock-theme'}
  const buildTheme = vi.fn().mockReturnValue(mockTheme)
  const createDefaultIcon = vi.fn().mockReturnValue(createElement('span', null, 'default'))

  mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
    switch (pkg) {
      case '@sanity/ui': {
        return {ThemeProvider: MockThemeProvider}
      }
      case '@sanity/ui/theme': {
        return {buildTheme}
      }
      case 'sanity': {
        return {createDefaultIcon}
      }
      default: {
        throw new Error(`Unexpected package resolution: ${pkg}`)
      }
    }
  })

  return {buildTheme, createDefaultIcon, mockTheme}
}

describe('SchemaIcon', () => {
  const workDir = '/studio/project'

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('resolves @sanity/ui from the studio workDir', async () => {
    setupMocks()

    await SchemaIcon({title: 'Test', workDir})

    expect(mockResolveLocalPackage).toHaveBeenCalledWith('@sanity/ui', workDir)
  })

  test('resolves @sanity/ui/theme from the studio workDir', async () => {
    setupMocks()

    await SchemaIcon({title: 'Test', workDir})

    expect(mockResolveLocalPackage).toHaveBeenCalledWith('@sanity/ui/theme', workDir)
  })

  test('resolves sanity from the studio workDir when no icon is provided', async () => {
    setupMocks()

    await SchemaIcon({title: 'Test', workDir})

    expect(mockResolveLocalPackage).toHaveBeenCalledWith('sanity', workDir)
  })

  test('does not resolve sanity package when a valid component icon is provided', async () => {
    setupMocks()
    const CustomIcon = () => <span>custom</span>

    await SchemaIcon({icon: CustomIcon, title: 'Test', workDir})

    expect(mockResolveLocalPackage).not.toHaveBeenCalledWith('sanity', workDir)
  })

  test('does not resolve sanity package when a React element icon is provided', async () => {
    setupMocks()
    const elementIcon = createElement('svg', null, createElement('path', {d: 'M0 0'}))

    await SchemaIcon({icon: elementIcon, title: 'Test', workDir})

    expect(mockResolveLocalPackage).not.toHaveBeenCalledWith('sanity', workDir)
  })

  test('wraps output with the resolved ThemeProvider and built theme', async () => {
    const {mockTheme} = setupMocks()

    const result = await SchemaIcon({title: 'Test', workDir})

    expect(result.type).toBe(MockThemeProvider)
    expect(result.props).toHaveProperty('theme', mockTheme)
  })

  test('calls createDefaultIcon with title and subtitle when no icon is provided', async () => {
    const {createDefaultIcon} = setupMocks()

    await SchemaIcon({subtitle: 'document', title: 'My Type', workDir})

    expect(createDefaultIcon).toHaveBeenCalledWith('My Type', 'document')
  })

  test('passes empty string as subtitle default to createDefaultIcon', async () => {
    const {createDefaultIcon} = setupMocks()

    await SchemaIcon({title: 'My Type', workDir})

    expect(createDefaultIcon).toHaveBeenCalledWith('My Type', '')
  })
})

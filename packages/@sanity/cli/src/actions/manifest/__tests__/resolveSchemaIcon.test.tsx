import {createElement, type ReactNode} from 'react'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {resolveSchemaIcon} from '../resolveSchemaIcon.js'

const mockResolveLocalPackage = vi.hoisted(() => vi.fn())
const mockResolveLocalPackageFrom = vi.hoisted(() => vi.fn())
const mockResolveLocalPackagePath = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    resolveLocalPackage: mockResolveLocalPackage,
    resolveLocalPackageFrom: mockResolveLocalPackageFrom,
    resolveLocalPackagePath: mockResolveLocalPackagePath,
  }
})

const MockThemeProvider = ({children}: {children: ReactNode}) => <>{children}</>

function setupMocks() {
  const mockTheme = {color: 'mock-theme'}
  const buildTheme = vi.fn().mockReturnValue(mockTheme)
  const createDefaultIcon = vi.fn().mockReturnValue(createElement('span', null, 'default'))
  const fakeSanityUrl = new URL('file:///studio/project/node_modules/sanity/dist/index.js')

  mockResolveLocalPackagePath.mockImplementation((pkg: string) => {
    if (pkg === 'sanity') return fakeSanityUrl
    throw new Error(`Unexpected resolveLocalPackagePath call: ${pkg}`)
  })

  mockResolveLocalPackageFrom.mockImplementation(async (pkg: string, parentUrl: URL) => {
    if (parentUrl !== fakeSanityUrl) {
      throw new Error(`Unexpected parent URL: ${parentUrl.href}`)
    }
    switch (pkg) {
      case '@sanity/ui': {
        return {ThemeProvider: MockThemeProvider}
      }
      case '@sanity/ui/theme': {
        return {buildTheme}
      }
      default: {
        throw new Error(`Unexpected resolveLocalPackageFrom call: ${pkg}`)
      }
    }
  })

  mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
    switch (pkg) {
      case 'sanity': {
        return {createDefaultIcon}
      }
      default: {
        throw new Error(`Unexpected resolveLocalPackage call: ${pkg}`)
      }
    }
  })

  return {buildTheme, createDefaultIcon, fakeSanityUrl, mockTheme}
}

describe('resolveSchemaIcon', () => {
  const workDir = '/studio/project'

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('resolves @sanity/ui via sanity package location', async () => {
    const {fakeSanityUrl} = setupMocks()

    await resolveSchemaIcon({title: 'Test', workDir})

    expect(mockResolveLocalPackagePath).toHaveBeenCalledWith('sanity', workDir)
    expect(mockResolveLocalPackageFrom).toHaveBeenCalledWith('@sanity/ui', fakeSanityUrl)
  })

  test('resolves @sanity/ui/theme via sanity package location', async () => {
    const {fakeSanityUrl} = setupMocks()

    await resolveSchemaIcon({title: 'Test', workDir})

    expect(mockResolveLocalPackageFrom).toHaveBeenCalledWith('@sanity/ui/theme', fakeSanityUrl)
  })

  test('resolves sanity from the studio workDir when no icon is provided', async () => {
    setupMocks()

    await resolveSchemaIcon({title: 'Test', workDir})

    expect(mockResolveLocalPackage).toHaveBeenCalledWith('sanity', workDir)
  })

  test('does not resolve sanity package when a valid component icon is provided', async () => {
    setupMocks()
    const CustomIcon = () => <span>custom</span>

    await resolveSchemaIcon({icon: CustomIcon, title: 'Test', workDir})

    expect(mockResolveLocalPackage).not.toHaveBeenCalledWith('sanity', workDir)
  })

  test('does not resolve sanity package when a React element icon is provided', async () => {
    setupMocks()
    const elementIcon = createElement('svg', null, createElement('path', {d: 'M0 0'}))

    await resolveSchemaIcon({icon: elementIcon, title: 'Test', workDir})

    expect(mockResolveLocalPackage).not.toHaveBeenCalledWith('sanity', workDir)
  })

  test('wraps output with the resolved ThemeProvider and built theme', async () => {
    const {mockTheme} = setupMocks()

    const result = await resolveSchemaIcon({title: 'Test', workDir})

    expect(result.type).toBe(MockThemeProvider)
    expect(result.props).toHaveProperty('theme', mockTheme)
  })

  test('calls createDefaultIcon with title and subtitle when no icon is provided', async () => {
    const {createDefaultIcon} = setupMocks()

    await resolveSchemaIcon({subtitle: 'document', title: 'My Type', workDir})

    expect(createDefaultIcon).toHaveBeenCalledWith('My Type', 'document')
  })

  test('passes empty string as subtitle default to createDefaultIcon', async () => {
    const {createDefaultIcon} = setupMocks()

    await resolveSchemaIcon({title: 'My Type', workDir})

    expect(createDefaultIcon).toHaveBeenCalledWith('My Type', '')
  })
})

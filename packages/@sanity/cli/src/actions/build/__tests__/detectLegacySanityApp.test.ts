import fs from 'node:fs/promises'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {detectLegacySanityApp} from '../detectLegacySanityApp'

describe('detectLegacySanityApp', () => {
  const mockCwd = '/test/project'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('detects legacy pattern with SanityApp import and usage', async () => {
    const mockContent = `
import {SanityApp} from '@sanity/sdk-react'

function App() {
  const config = [{projectId: 'xxx', dataset: 'yyy'}]
  return (
    <SanityApp config={config}>
      <Content />
    </SanityApp>
  )
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(true)
    expect(result.warningMessage).toBeDefined()
    expect(result.warningMessage).toContain('DEPRECATION WARNING')
  })

  test('detects legacy pattern with multiple imports', async () => {
    const mockContent = `
import {SanityApp, useSanityClient} from '@sanity/sdk-react'
import {useState} from 'react'

function App() {
  return (
    <SanityApp config={[]}>
      <Content />
    </SanityApp>
  )
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(true)
  })

  test('does not detect when only import is present', async () => {
    const mockContent = `
import {SanityApp} from '@sanity/sdk-react'

function App() {
  // SanityApp imported but not used
  return <Content />
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(false)
    expect(result.warningMessage).toBeUndefined()
  })

  test('does not detect when only usage is present without import', async () => {
    const mockContent = `
// No import from @sanity/sdk-react
function App() {
  return (
    <SanityApp config={[]}>
      <Content />
    </SanityApp>
  )
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(false)
  })

  test('does not detect when using new pattern (no SanityApp)', async () => {
    const mockContent = `
import {useSanityClient} from '@sanity/sdk-react'

function App() {
  return <Content />
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(false)
  })

  test('handles file with double quotes in imports', async () => {
    const mockContent = `
import {SanityApp} from "@sanity/sdk-react"

function App() {
  return (
    <SanityApp config={[]}>
      <Content />
    </SanityApp>
  )
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(true)
  })

  test('tries multiple extensions when file path has no extension', async () => {
    const mockContent = `
import {SanityApp} from '@sanity/sdk-react'

function App() {
  return <SanityApp config={[]}><Content /></SanityApp>
}
`
    // First two attempts fail, third succeeds
    vi.spyOn(fs, 'readFile')
      .mockRejectedValueOnce(new Error('Not found'))
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce(mockContent)

    const result = await detectLegacySanityApp('./src/App', mockCwd)

    expect(result.hasLegacyPattern).toBe(true)
  })

  test('returns false when file cannot be found', async () => {
    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'))

    const result = await detectLegacySanityApp('./src/NonExistent.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(false)
    expect(result.warningMessage).toBeUndefined()
  })

  test('detects usage with self-closing tag', async () => {
    const mockContent = `
import {SanityApp} from '@sanity/sdk-react'

function App() {
  return <SanityApp config={[]} />
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.hasLegacyPattern).toBe(true)
  })

  test('warning message mentions the legacy pattern', async () => {
    const mockContent = `
import {SanityApp} from '@sanity/sdk-react'
function App() {
  return <SanityApp config={[]}><div /></SanityApp>
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/components/App.tsx', mockCwd)

    expect(result.warningMessage).toContain('SanityApp')
  })

  test('warning message includes migration instructions', async () => {
    const mockContent = `
import {SanityApp} from '@sanity/sdk-react'
function App() {
  return <SanityApp config={[]}><div /></SanityApp>
}
`
    vi.spyOn(fs, 'readFile').mockResolvedValue(mockContent)

    const result = await detectLegacySanityApp('./src/App.tsx', mockCwd)

    expect(result.warningMessage).toContain('sanity.cli.ts')
    expect(result.warningMessage).toContain('resources')
  })
})

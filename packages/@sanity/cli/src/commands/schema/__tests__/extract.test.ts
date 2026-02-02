import {existsSync} from 'node:fs'
import {resolve} from 'node:path'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ExtractSchemaCommand} from '../extract.js'

describe('#schema:extract', {timeout: 30 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should extract schema', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, [])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })

  test('should extract schema with enforce-required-fields flag', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--enforce-required-fields'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Extracting schema with enforced required fields')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })

  test('should extract schema with path flag', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--path', './custom-output'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'custom-output', 'schema.json'))).toBe(true)
  })

  test('throws an error if format flag is not groq-type-nodes', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--format', 'invalid-format'])

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Failed to extract schema')
    expect(error?.message).toContain('Unsupported format: "invalid-format"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should extract schema with workspace flag', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--workspace', 'production'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })
})

import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {SchemaValidate} from '../validate.js'

describe('#schema:validate', {timeout: 30 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should validate schema with default options (pretty format)', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr, stdout} = await testCommand(SchemaValidate, [])

    if (error) throw error
    expect(stderr).toContain('Validating schema')
    expect(stderr).toContain('Validated schema')
    expect(stdout).toContain('Validation results:')
    expect(stdout).toContain('Errors:')
    expect(stdout).toContain('Warnings:')
  })

  test('should output JSON format with --format json', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr, stdout} = await testCommand(SchemaValidate, ['--format', 'json'])

    if (error) throw error
    expect(stderr).not.toContain('Validating schema')
    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
  })

  test('should output NDJSON format with --format ndjson', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr, stdout} = await testCommand(SchemaValidate, ['--format', 'ndjson'])

    if (error) throw error
    expect(stderr).not.toContain('Validating schema')
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n')
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow()
      }
    }
  })

  test.each([
    {flag: 'format', options: 'pretty, ndjson, json'},
    {flag: 'level', options: 'error, warning'},
  ])('shows error when user inputs incorrect --$flag flag', async ({flag, options}) => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error} = await testCommand(SchemaValidate, [`--${flag}`, 'invalid'])

    expect(error?.message).toContain(`Expected --${flag}=invalid to be one of: ${options}`)
  })

  test('should show both errors and warnings with --level warning (default)', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stdout} = await testCommand(SchemaValidate, ['--level', 'warning'])

    if (error) throw error
    expect(stdout).toContain('Errors:')
    expect(stdout).toContain('Warnings:')
  })

  test('should show only errors with --level error', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stdout} = await testCommand(SchemaValidate, ['--level', 'error'])

    if (error) throw error
    expect(stdout).toContain('Errors:')
    expect(stdout).not.toContain('Warnings:')
  })

  test('should validate schema with workspace flag', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(SchemaValidate, ['--workspace', 'production'])

    if (error) throw error
    expect(stderr).toContain('Validating schema')
    expect(stderr).toContain('Validated schema')
  })

  test('should fail when multiple workspaces exist and no workspace flag provided', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(SchemaValidate, [])

    expect(stderr).toContain('Validating schema')
    expect(error?.message).toContain('Multiple workspaces found')
    expect(error?.message).toContain('--workspace')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when workspace does not exist', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(SchemaValidate, [
      '--workspace',
      'non-existent-workspace',
    ])

    expect(stderr).toContain('Validating schema')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail with validation errors for invalid schema (duplicate types)', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
    const content = await readFile(schemaIndexPath, 'utf8')
    const modified = content.replace(
      'export const schemaTypes = [post, author, category, blockContent]',
      'export const schemaTypes = [post, post, author, category, blockContent]',
    )
    await writeFile(schemaIndexPath, modified)

    const {error, stderr, stdout} = await testCommand(SchemaValidate, [])

    expect(stderr).toContain('Validating schema')
    expect(stdout).toContain('[ERROR]')
    expect(stdout).toContain('A type with name "post" is already defined in the schema')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should output validation errors in JSON format', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
    const content = await readFile(schemaIndexPath, 'utf8')
    const modified = content.replace(
      'export const schemaTypes = [post, author, category, blockContent]',
      'export const schemaTypes = [post, post, author, category, blockContent]',
    )
    await writeFile(schemaIndexPath, modified)

    const {error, stdout} = await testCommand(SchemaValidate, ['--format', 'json'])

    expect(error?.oclif?.exit).toBe(1)
    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
    const hasPostError = parsed.some((group: {problems?: Array<{message?: string}>}) =>
      group.problems?.some((p: {message?: string}) =>
        p.message?.includes('A type with name "post" is already defined'),
      ),
    )
    expect(hasPostError).toBe(true)
  })

  test('should output validation errors in NDJSON format', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
    const content = await readFile(schemaIndexPath, 'utf8')
    const modified = content.replace(
      'export const schemaTypes = [post, author, category, blockContent]',
      'export const schemaTypes = [post, post, author, category, blockContent]',
    )
    await writeFile(schemaIndexPath, modified)

    const {error, stdout} = await testCommand(SchemaValidate, ['--format', 'ndjson'])

    expect(error?.oclif?.exit).toBe(1)
    const lines = stdout.trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
    const hasPostError = lines.some((line) => {
      const parsed = JSON.parse(line)
      return parsed.problems?.some((p: {message?: string}) =>
        p.message?.includes('A type with name "post" is already defined'),
      )
    })
    expect(hasPostError).toBe(true)
  })

  test('should create metafile with --debug-metafile-path on successful validation', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const metafilePath = resolve(cwd, 'metafile.json')

    const {error, stdout} = await testCommand(SchemaValidate, [
      '--debug-metafile-path',
      metafilePath,
    ])

    if (error) throw error
    expect(existsSync(metafilePath)).toBe(true)
    expect(stdout).toContain('Metafile written to:')
    expect(stdout).toContain('https://esbuild.github.io/analyze/')

    const metafileContent = await readFile(metafilePath, 'utf8')
    const metafile = JSON.parse(metafileContent)
    expect(metafile).toHaveProperty('inputs')
    expect(metafile).toHaveProperty('outputs')
  })

  test('should NOT create metafile when validation fails', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
    const content = await readFile(schemaIndexPath, 'utf8')
    const modified = content.replace(
      'export const schemaTypes = [post, author, category, blockContent]',
      'export const schemaTypes = [post, post, author, category, blockContent]',
    )
    await writeFile(schemaIndexPath, modified)

    const metafilePath = resolve(cwd, 'metafile.json')

    const {error, stdout} = await testCommand(SchemaValidate, [
      '--debug-metafile-path',
      metafilePath,
    ])

    expect(error?.oclif?.exit).toBe(1)
    expect(existsSync(metafilePath)).toBe(false)
    expect(stdout).toContain('Metafile not written due to validation errors')
  })
})

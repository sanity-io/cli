import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {SchemaValidate} from '../../../../src/commands/schemas/validate.js'

describe('#schema:validate', {timeout: 60 * 1000}, () => {
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
})

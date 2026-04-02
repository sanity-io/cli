import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {canCloseWatcher} from '../../../../test/testUtils.js'
import {ExtractSchemaCommand} from '../extract.js'

describe('#schema:extract', {timeout: 60 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should extract schema', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, [])

    if (error) throw error
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })

  test('should start watch mode and extract initial schema', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, result, stderr, stdout} = await testCommand(ExtractSchemaCommand, ['--watch'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Extracting schema')
    expect(stdout).toContain('Watching for changes')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)

    if (canCloseWatcher(result)) {
      await result.close()
    }
  })

  test('should start watch mode with custom watch patterns', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, result, stderr, stdout} = await testCommand(ExtractSchemaCommand, [
      '--watch',
      '--watch-patterns',
      'custom/**/*.ts',
      '--watch-patterns',
      'lib/**/*.js',
    ])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Extracting schema')
    expect(stdout).toContain('Watching for changes')
    expect(stdout).toContain('custom/**/*.ts')
    expect(stdout).toContain('lib/**/*.js')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)

    // Clean up watcher
    if (canCloseWatcher(result)) {
      await result.close()
    }
  })

  test('should use options provided extraction options from cli config', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, result, stderr, stdout} = await testCommand(ExtractSchemaCommand, ['--watch'], {
      mocks: {
        cliConfig: {
          schemaExtraction: {
            enforceRequiredFields: true,
            path: 'cli-config-output',
            watchPatterns: ['sanity.cli.{js,jsx,ts,tsx,mjs}'],
          },
        },
      },
    })

    const outputPath = resolve(cwd, 'cli-config-output', 'schema.json')

    expect(error).toBeUndefined()
    expect(stderr).toContain(`Extracting schema with enforced required fields`)
    expect(existsSync(outputPath)).toBe(true)
    expect(stdout).toContain('sanity.cli.{js,jsx,ts,tsx,mjs}')

    if (canCloseWatcher(result)) {
      await result.close()
    }
  })

  test('should extract schema with enforce-required-fields flag', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--enforce-required-fields'])

    if (error) throw error
    expect(stderr).toContain('Extracting schema with enforced required fields')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })

  test('should extract schema with path flag (directory)', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--path', './custom-output'])

    if (error) throw error
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'custom-output', 'schema.json'))).toBe(true)
  })

  test('should extract schema with path flag (file path with .json extension)', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--path', './my-schema.json'])

    if (error) throw error
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'my-schema.json'))).toBe(true)
  })

  test('throws an error if format flag is not groq-type-nodes', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--format', 'invalid-format'])

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Failed to extract schema')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should extract schema with workspace flag', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--workspace', 'production'])

    if (error) throw error
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })

  test('should fail with validation errors for invalid schema (duplicate types)', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    // Modify schema to have duplicate types
    const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
    const content = await readFile(schemaIndexPath, 'utf8')
    const modified = content.replace(
      'export const schemaTypes = [post, author, category, blockContent]',
      'export const schemaTypes = [post, post, author, category, blockContent]',
    )
    await writeFile(schemaIndexPath, modified)

    const {error, stderr, stdout} = await testCommand(ExtractSchemaCommand, [])

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Failed to extract schema')
    expect(stdout).toContain('[ERROR]')
    expect(stdout).toContain('A type with name "post" is already defined in the schema')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when workspace does not exist', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, [
      '--workspace',
      'non-existent-workspace',
    ])

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Failed to extract schema')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when multiple workspaces exist and no workspace flag provided', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, [])

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Failed to extract schema')
    expect(error?.message).toContain('Multiple workspaces found')
    expect(error?.message).toContain('--workspace')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should extract schema for worst-case-studio fixture', async () => {
    const cwd = await testFixture('worst-case-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, [])

    if (error) throw error
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })

  test('should extract schema for worst-case-studio without tsconfigPaths plugin', async () => {
    const cwd = await testFixture('worst-case-studio')
    process.chdir(cwd)

    // Remove the tsconfigPaths plugin from the CLI config
    const cliConfigPath = join(cwd, 'sanity.cli.ts')
    const content = await readFile(cliConfigPath, 'utf8')
    const modified = content
      .replace("import tsconfigPaths from 'vite-tsconfig-paths'\n", '')
      .replace("plugins: [tsconfigPaths({root: '.'})],", '')
    await writeFile(cliConfigPath, modified)

    const {error, stderr} = await testCommand(ExtractSchemaCommand, [])

    if (error) throw error
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })

  test('should resolve exact tsconfig path aliases without tsconfigPaths plugin', async () => {
    const cwd = await testFixture('worst-case-studio')
    process.chdir(cwd)

    // Remove the tsconfigPaths plugin from the CLI config
    const cliConfigPath = join(cwd, 'sanity.cli.ts')
    const cliContent = await readFile(cliConfigPath, 'utf8')
    await writeFile(
      cliConfigPath,
      cliContent
        .replace("import tsconfigPaths from 'vite-tsconfig-paths'\n", '')
        .replace("plugins: [tsconfigPaths({root: '.'})],", ''),
    )

    // Add an exact (non-wildcard) path alias to tsconfig.json
    const tsconfigPath = join(cwd, 'tsconfig.json')
    const tsconfigContent = await readFile(tsconfigPath, 'utf8')
    await writeFile(
      tsconfigPath,
      tsconfigContent.replace(
        '"@/*": ["./src/*"]',
        '"@/*": ["./src/*"],\n      "@defines": ["./src/defines.ts"]',
      ),
    )

    // Use the exact alias in the config
    const configPath = join(cwd, 'sanity.config.tsx')
    const configContent = await readFile(configPath, 'utf8')
    await writeFile(
      configPath,
      configContent.replace(
        "const arbitraryImport = await import('@/defines')",
        "const arbitraryImport = await import('@defines')",
      ),
    )

    const {error, stderr} = await testCommand(ExtractSchemaCommand, [])

    if (error) throw error
    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')
    expect(existsSync(resolve(cwd, 'schema.json'))).toBe(true)
  })
})

import {existsSync} from 'node:fs'
import {readFile, rename, rm, symlink, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {getStudioConfig} from '@sanity/cli-core'
import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ExtractSchemaCommand} from '../../../../src/commands/schemas/extract.js'
import {canCloseWatcher} from '../../../testUtils.js'

describe('#schema:extract', {timeout: 60 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
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

  test('extracts schema when ESM declarations shadow CommonJS bindings', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
    const content = await readFile(schemaIndexPath, 'utf8')
    await writeFile(
      schemaIndexPath,
      `import {createRequire} from 'node:module'\n` +
        `const require = createRequire(import.meta.url)\n` +
        `const module = require('node:path')\n` +
        `const exports = 'Bindings'\n` +
        `const __dirname = 'scope'\n` +
        `const __filename = '/schema/string'\n` +
        `const scopedType = {name: __dirname + exports, type: module.basename(__filename)}\n` +
        content.replace('schemaTypes = [', 'schemaTypes = [scopedType, '),
    )

    const {error} = await testCommand(ExtractSchemaCommand, [])

    if (error) throw error
    const schema = JSON.parse(await readFile(join(cwd, 'schema.json'), 'utf8'))
    expect(schema).toEqual(
      expect.arrayContaining([expect.objectContaining({name: 'scopeBindings'})]),
    )
  })

  test.each(['false', 'true'])(
    'extracts real styled-components imports with bundling=%s',
    async (bundling) => {
      vi.stubEnv('SANITY_CLI_STUDIO_WORKER_BUNDLE', bundling)
      const cwd = await testFixture('basic-studio')
      process.chdir(cwd)
      const configPath = join(cwd, 'sanity.config.ts')
      const config = await readFile(configPath, 'utf8')
      await writeFile(
        configPath,
        `import styled, {css, styled as namedStyled} from 'styled-components'\n` +
          `const Preview = styled.div(css({color: 'red'}))\n` +
          `if (styled !== namedStyled) throw new Error('Different styled instances')\n` +
          config.replace(
            'types: schemaTypes',
            "types: [...schemaTypes, {name: 'styledPreview', type: 'string', components: {input: Preview}}]",
          ),
      )
      const {error} = await testCommand(ExtractSchemaCommand, [])
      if (error) throw error
      const schema = JSON.parse(await readFile(join(cwd, 'schema.json'), 'utf8'))
      expect(schema).toEqual(
        expect.arrayContaining([expect.objectContaining({name: 'styledPreview'})]),
      )
    },
  )

  test.each(['root', 'config'])(
    'extracts bundled configuration through a symlinked %s',
    async (target) => {
      vi.stubEnv('SANITY_CLI_STUDIO_WORKER_BUNDLE', 'true')
      const cwd = await testFixture('basic-studio')
      const linkedRoot = `${cwd}-linked`
      try {
        if (target === 'root') {
          await symlink(cwd, linkedRoot, 'junction')
          process.chdir(linkedRoot)
        } else {
          await rename(join(cwd, 'sanity.config.ts'), join(cwd, 'actual.config.ts'))
          await symlink('actual.config.ts', join(cwd, 'sanity.config.ts'), 'file')
          process.chdir(cwd)
        }
        const rootPath = target === 'root' ? linkedRoot : cwd
        const workspaces = await getStudioConfig(rootPath, {resolvePlugins: true})
        expect(workspaces).toHaveLength(1)
        const {error} = await testCommand(ExtractSchemaCommand, [])
        if (error) throw error
        const schema = JSON.parse(await readFile(join(cwd, 'schema.json'), 'utf8'))
        expect(schema.length).toBeGreaterThan(0)
      } finally {
        process.chdir(cwd)
        if (target === 'root') await rm(linkedRoot, {force: true})
      }
    },
  )

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

  test('reloads bundled configuration between worker tasks', async () => {
    vi.stubEnv('SANITY_CLI_STUDIO_WORKER_BUNDLE', 'true')
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)
    const first = await testCommand(ExtractSchemaCommand, [])
    if (first.error) throw first.error

    const schemaIndexPath = join(cwd, 'schemaTypes', 'index.ts')
    const content = await readFile(schemaIndexPath, 'utf8')
    await writeFile(
      schemaIndexPath,
      content.replace(
        'schemaTypes = [',
        "schemaTypes = [{name: 'addedAfterExtraction', type: 'string'}, ",
      ),
    )
    const second = await testCommand(ExtractSchemaCommand, ['--force'])
    if (second.error) throw second.error
    const schema = JSON.parse(await readFile(join(cwd, 'schema.json'), 'utf8'))
    expect(schema).toEqual(
      expect.arrayContaining([expect.objectContaining({name: 'addedAfterExtraction'})]),
    )
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

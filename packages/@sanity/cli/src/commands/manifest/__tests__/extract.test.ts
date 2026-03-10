import {existsSync} from 'node:fs'
import {mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {getTempPath, testCommand, testFixture} from '@sanity/cli-test'
import {type CreateManifest} from '@sanity/schema/_internal'
import {describe, expect, test} from 'vitest'

import {ExtractManifestCommand} from '../extract.js'

describe('#manifest:extract', {timeout: 60 * 1000}, () => {
  test('should extract manifest files', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractManifestCommand, [])

    if (error) throw error
    expect(stderr).toContain('Extracting manifest')
    expect(stderr).toContain('Extracted manifest')

    // Verify main manifest file exists
    const manifestPath = resolve(cwd, 'dist/static/create-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)

    // Verify schema and tools files exist
    const staticDir = resolve(cwd, 'dist/static')
    const files = await readdir(staticDir)
    expect(files.some((f) => f.endsWith('.create-schema.json'))).toBe(true)
    expect(files.some((f) => f.endsWith('.create-tools.json'))).toBe(true)

    // Verify manifest structure
    const manifest: CreateManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.version).toBe(3)
    expect(manifest.createdAt).toBeDefined()
    expect(manifest.workspaces).toHaveLength(1)
    expect(manifest.workspaces[0].name).toBe('default')
    expect(manifest.workspaces[0].dataset).toBe('test')
    expect(manifest.workspaces[0].projectId).toBe('ppsg7ml5')

    // Verify workspace references schema and tools filenames
    expect(manifest.workspaces[0].schema).toMatch(/\.create-schema\.json$/)
    expect(manifest.workspaces[0].tools).toMatch(/\.create-tools\.json$/)

    // Verify schema file content
    const schemaFilename = manifest.workspaces[0].schema
    const schemaContent = JSON.parse(await readFile(resolve(staticDir, schemaFilename), 'utf8'))
    expect(Array.isArray(schemaContent)).toBe(true)
    expect(schemaContent.some((type: {name: string}) => type.name === 'post')).toBe(true)

    // Verify tools file content
    const toolsFilename = manifest.workspaces[0].tools
    const toolsContent = JSON.parse(await readFile(resolve(staticDir, toolsFilename), 'utf8'))
    expect(Array.isArray(toolsContent)).toBe(true)
    expect(toolsContent.some((tool: {name: string}) => tool.name === 'structure')).toBe(true)

    // Verify workspace icon is resolved (default icon generated from title)
    expect(manifest.workspaces[0].icon).toContain('<svg')

    // Verify tool icons are resolved
    const structureTool = toolsContent.find(
      (tool: {name: string}) => tool.name === 'structure',
    ) as {icon: string | null; name: string}
    expect(structureTool.icon).toContain('<svg')
  })

  test('should extract manifest files with custom --path flag', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractManifestCommand, ['--path', './custom-output'])

    if (error) throw error
    expect(stderr).toContain('Extracting manifest')
    expect(stderr).toContain('Extracted manifest')

    // Verify files are created in custom location
    const customDir = resolve(cwd, 'custom-output')
    expect(existsSync(customDir)).toBe(true)

    const manifestPath = resolve(customDir, 'create-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)

    // Verify schema and tools files exist in custom location
    const files = await readdir(customDir)
    expect(files.some((f) => f.endsWith('.create-schema.json'))).toBe(true)
    expect(files.some((f) => f.endsWith('.create-tools.json'))).toBe(true)
  })

  test('should extract manifest from multi-workspace studio', async () => {
    const cwd = await testFixture('multi-workspace-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractManifestCommand, [])

    if (error) throw error
    expect(stderr).toContain('Extracting manifest')
    expect(stderr).toContain('Extracted manifest')

    // Verify main manifest file exists
    const manifestPath = resolve(cwd, 'dist/static/create-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)

    // Verify manifest contains both workspaces
    const manifest: CreateManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.version).toBe(3)
    expect(manifest.workspaces).toHaveLength(2)

    // Verify workspace names
    const workspaceNames = manifest.workspaces.map((w) => w.name).toSorted()
    expect(workspaceNames).toEqual(['production', 'staging'])

    // Verify each workspace has proper references
    for (const workspace of manifest.workspaces) {
      expect(workspace.schema).toMatch(/\.create-schema\.json$/)
      expect(workspace.tools).toMatch(/\.create-tools\.json$/)
      expect(workspace.projectId).toBe('ppsg7ml5')
    }

    // Verify schema and tools files exist for workspaces
    const staticDir = resolve(cwd, 'dist/static')
    const files = await readdir(staticDir)

    // Should have schema and tools files (may share files if content is identical)
    const schemaFiles = files.filter((f) => f.endsWith('.create-schema.json'))
    const toolsFiles = files.filter((f) => f.endsWith('.create-tools.json'))
    expect(schemaFiles.length).toBeGreaterThanOrEqual(1)
    expect(toolsFiles.length).toBeGreaterThanOrEqual(1)
  })

  test('should fail when run outside a studio project', async () => {
    // Create an isolated temp directory outside any project
    const isolatedDir = await mkdtemp(resolve(getTempPath(), 'manifest-test-'))
    process.chdir(isolatedDir)

    const {error} = await testCommand(ExtractManifestCommand, [])

    // The error should contain the failure message
    expect(error?.message).toContain('Failed to extract manifest')
    expect(error?.oclif?.exit).toBe(1)
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

    const {error, stderr, stdout} = await testCommand(ExtractManifestCommand, [])

    // Spinner starts and fails
    expect(stderr).toContain('Extracting manifest')

    // Validation errors are output to stdout
    expect(stdout).toContain('[ERROR]')
    expect(stdout).toContain('A type with name "post" is already defined in the schema')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('can extract manifest from worst-case-studio', async () => {
    const cwd = await testFixture('worst-case-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(ExtractManifestCommand, [])

    if (error) throw error
    expect(stderr).toContain('Extracting manifest')
    expect(stderr).toContain('Extracted manifest')
  })
})

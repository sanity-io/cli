import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {describe, expect, test} from 'vitest'

import {type ExtractSchemaCommand} from '../../../commands/schema/extract.js'
import {getExtractOptions} from '../getExtractOptions.js'

describe('getExtractOptions', () => {
  const mockProjectRoot = {
    directory: '/test/project',
    path: '/test/project/sanity.config.ts',
    type: 'studio' as const,
  }

  test('should use flag values when provided', () => {
    const result = getExtractOptions({
      flags: {
        'enforce-required-fields': true,
        format: 'groq-type-nodes',
        path: 'custom-output',
        watch: false,
        'watch-patterns': ['pattern1/**/*.ts', 'pattern2/**/*.js'],
        workspace: 'production',
      } as ExtractSchemaCommand['flags'],
      projectRoot: mockProjectRoot,
      schemaExtraction: {
        enforceRequiredFields: false,
        path: 'cli-config-path',
        watchPatterns: ['cli-pattern/**/*.ts'],
        workspace: 'staging',
      },
    })

    expect(result).toEqual({
      configPath: '/test/project/sanity.config.ts',
      enforceRequiredFields: true,
      format: 'groq-type-nodes',
      outputPath: resolve(join('/test/project', 'custom-output', 'schema.json')),
      watchPatterns: ['pattern1/**/*.ts', 'pattern2/**/*.js'],
      workspace: 'production',
    })
  })

  test('should use CLI config values when flags are not provided', () => {
    const result = getExtractOptions({
      flags: {
        format: 'groq-type-nodes',
        path: undefined,
        watch: false,
        'watch-patterns': undefined,
        workspace: undefined,
      } as ExtractSchemaCommand['flags'],
      projectRoot: mockProjectRoot,
      schemaExtraction: {
        enforceRequiredFields: true,
        path: 'cli-config-output',
        watchPatterns: ['cli-pattern/**/*.ts'],
        workspace: 'staging',
      },
    })

    expect(result).toEqual({
      configPath: '/test/project/sanity.config.ts',
      enforceRequiredFields: true,
      format: 'groq-type-nodes',
      outputPath: resolve(join('/test/project', 'cli-config-output', 'schema.json')),
      watchPatterns: ['cli-pattern/**/*.ts'],
      workspace: 'staging',
    })
  })

  test('should append schema.json when path points to an existing directory', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'schema-test-'))
    const projectRoot = {
      directory: tempDir,
      path: join(tempDir, 'sanity.config.ts'),
      type: 'studio' as const,
    }

    const result = getExtractOptions({
      flags: {
        format: 'groq-type-nodes',
        path: '.', // current dir - definitely exists
        watch: false,
        'watch-patterns': undefined,
        workspace: undefined,
      } as ExtractSchemaCommand['flags'],
      projectRoot,
      schemaExtraction: undefined,
    })

    expect(result.outputPath).toEqual(join(tempDir, 'schema.json'))
  })

  test('should treat path with .json extension as a file path', () => {
    const result = getExtractOptions({
      flags: {
        format: 'groq-type-nodes',
        path: './schema.json',
        watch: false,
        'watch-patterns': undefined,
        workspace: undefined,
      } as ExtractSchemaCommand['flags'],
      projectRoot: mockProjectRoot,
      schemaExtraction: undefined,
    })

    expect(result.outputPath).toEqual(resolve(join('/test/project', 'schema.json')))
  })

  test('should treat path with .json extension in subdirectory as a file path', () => {
    const result = getExtractOptions({
      flags: {
        format: 'groq-type-nodes',
        path: 'output/my-schema.json',
        watch: false,
        'watch-patterns': undefined,
        workspace: undefined,
      } as ExtractSchemaCommand['flags'],
      projectRoot: mockProjectRoot,
      schemaExtraction: undefined,
    })

    expect(result.outputPath).toEqual(resolve(join('/test/project', 'output', 'my-schema.json')))
  })

  test('should treat path with non-.json extension as a file path', () => {
    const result = getExtractOptions({
      flags: {
        format: 'groq-type-nodes',
        path: 'output/my-schema.yaml',
        watch: false,
        'watch-patterns': undefined,
        workspace: undefined,
      } as ExtractSchemaCommand['flags'],
      projectRoot: mockProjectRoot,
      schemaExtraction: undefined,
    })

    expect(result.outputPath).toEqual(resolve(join('/test/project', 'output', 'my-schema.yaml')))
  })

  test('should respect .json file path when file exists on disk', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'schema-test-'))
    writeFileSync(join(tempDir, 'schema.json'), '{}')
    const projectRoot = {
      directory: tempDir,
      path: join(tempDir, 'sanity.config.ts'),
      type: 'studio' as const,
    }

    const result = getExtractOptions({
      flags: {
        format: 'groq-type-nodes',
        path: 'schema.json',
        watch: false,
        'watch-patterns': undefined,
        workspace: undefined,
      } as ExtractSchemaCommand['flags'],
      projectRoot,
      schemaExtraction: undefined,
    })

    expect(result.outputPath).toEqual(join(tempDir, 'schema.json'))
  })

  test('should use default values when neither flags nor CLI config are provided', () => {
    const result = getExtractOptions({
      flags: {
        format: 'groq-type-nodes',
        path: undefined,
        watch: false,
        'watch-patterns': undefined,
        workspace: undefined,
      } as ExtractSchemaCommand['flags'],
      projectRoot: mockProjectRoot,
      schemaExtraction: undefined,
    })

    expect(result).toEqual({
      configPath: '/test/project/sanity.config.ts',
      enforceRequiredFields: false,
      format: 'groq-type-nodes',
      outputPath: resolve(join('/test/project', 'schema.json')),
      watchPatterns: [],
      workspace: undefined,
    })
  })
})

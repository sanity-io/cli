import {describe, expect, test} from 'vitest'

import {flagsToInitOptions} from '../types.js'

/** Returns a minimal set of flags with required boolean fields set to defaults. */
function defaultFlags(
  overrides: Record<string, unknown> = {},
): Parameters<typeof flagsToInitOptions>[0] {
  return {
    'auto-updates': true,
    bare: false,
    'dataset-default': false,
    mcp: true,
    'no-git': false,
    ...overrides,
  } as Parameters<typeof flagsToInitOptions>[0]
}

/** Shorthand that fills in the trailing `args` and `mcpMode` parameters. */
function toOptions(
  flags: Parameters<typeof flagsToInitOptions>[0],
  isUnattended: boolean,
): ReturnType<typeof flagsToInitOptions> {
  return flagsToInitOptions(flags, isUnattended, undefined, 'prompt')
}

describe('flagsToInitOptions', () => {
  test('maps kebab-case flags to camelCase options', () => {
    const result = toOptions(
      defaultFlags({
        'auto-updates': false,
        dataset: 'staging',
        'dataset-default': true,
        'output-path': '/tmp/myproject',
        'package-manager': 'pnpm',
        project: 'proj-123',
        'project-plan': 'enterprise',
        template: 'blog',
        'template-token': 'ghp_abc',
        visibility: 'private',
      }),
      false,
    )

    expect(result.autoUpdates).toBe(false)
    expect(result.dataset).toBe('staging')
    expect(result.datasetDefault).toBe(true)
    expect(result.outputPath).toBe('/tmp/myproject')
    expect(result.packageManager).toBe('pnpm')
    expect(result.project).toBe('proj-123')
    expect(result.projectPlan).toBe('enterprise')
    expect(result.template).toBe('blog')
    expect(result.templateToken).toBe('ghp_abc')
    expect(result.visibility).toBe('private')
  })

  test('maps Next.js specific flags', () => {
    const result = toOptions(
      defaultFlags({
        'nextjs-add-config-files': true,
        'nextjs-append-env': false,
        'nextjs-embed-studio': true,
      }),
      false,
    )

    expect(result.nextjsAddConfigFiles).toBe(true)
    expect(result.nextjsAppendEnv).toBe(false)
    expect(result.nextjsEmbedStudio).toBe(true)
  })

  test('resolves --no-git to git: false', () => {
    const result = toOptions(defaultFlags({'no-git': true}), false)

    expect(result.git).toBe(false)
  })

  test('passes through git commit message when --no-git is not set', () => {
    const result = toOptions(defaultFlags({git: 'Initial commit from Sanity'}), false)

    expect(result.git).toBe('Initial commit from Sanity')
  })

  test('leaves git as undefined when neither --git nor --no-git is provided', () => {
    const result = toOptions(defaultFlags(), false)

    expect(result.git).toBeUndefined()
  })

  test('sets unattended from the isUnattended parameter', () => {
    const attended = toOptions(defaultFlags(), false)
    expect(attended.unattended).toBe(false)

    const unattended = toOptions(defaultFlags(), true)
    expect(unattended.unattended).toBe(true)
  })

  test('aliases --create-project to projectName', () => {
    const result = toOptions(defaultFlags({'create-project': 'My Legacy Project'}), false)

    expect(result.projectName).toBe('My Legacy Project')
  })

  test('prefers --project-name over --create-project', () => {
    const result = toOptions(
      defaultFlags({
        'create-project': 'Legacy Name',
        'project-name': 'Preferred Name',
      }),
      false,
    )

    expect(result.projectName).toBe('Preferred Name')
  })

  test('returns undefined for optional fields when not provided', () => {
    const result = toOptions(defaultFlags(), false)

    expect(result.coupon).toBeUndefined()
    expect(result.dataset).toBeUndefined()
    expect(result.env).toBeUndefined()
    expect(result.importDataset).toBeUndefined()
    expect(result.organization).toBeUndefined()
    expect(result.outputPath).toBeUndefined()
    expect(result.overwriteFiles).toBeUndefined()
    expect(result.packageManager).toBeUndefined()
    expect(result.project).toBeUndefined()
    expect(result.projectName).toBeUndefined()
    expect(result.projectPlan).toBeUndefined()
    expect(result.provider).toBeUndefined()
    expect(result.template).toBeUndefined()
    expect(result.templateToken).toBeUndefined()
    expect(result.typescript).toBeUndefined()
    expect(result.visibility).toBeUndefined()
  })

  test('passes mcpMode through to options', () => {
    const prompt = flagsToInitOptions(defaultFlags(), false, undefined, 'prompt')
    expect(prompt.mcpMode).toBe('prompt')

    const auto = flagsToInitOptions(defaultFlags(), false, undefined, 'auto')
    expect(auto.mcpMode).toBe('auto')

    const skip = flagsToInitOptions(defaultFlags(), false, undefined, 'skip')
    expect(skip.mcpMode).toBe('skip')
  })
})

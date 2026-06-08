import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {parse as parseYaml} from 'yaml'

import {getTemplateChoices, scaffoldAndInstall} from '../scaffoldTemplate.js'

const mockExeca = vi.hoisted(() => vi.fn())

// Mock only the boundaries — the process boundary (execa) and the heavy
// collaborators (template scaffolding, package manager resolution, git, env).
// Crucially, pnpmBuildApproval.js and installPackages.js are NOT mocked: those
// run for real so this exercises the wired-together seam.
vi.mock('execa', () => ({execa: mockExeca}))

vi.mock('../bootstrapTemplate.js', () => ({
  bootstrapTemplate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../resolvePackageManager.js', () => ({
  resolvePackageManager: vi.fn().mockResolvedValue('pnpm'),
}))

vi.mock('../git.js', () => ({
  tryGitInit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../initHelpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../initHelpers.js')>()
  return {
    ...actual,
    writeStagingEnvIfNeeded: vi.fn().mockResolvedValue(undefined),
  }
})

describe('scaffoldAndInstall (pnpm build approval integration)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'scaffold-pnpm-'))
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'studio'}), 'utf8')
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(dir, {force: true, recursive: true})
  })

  test('writes pnpm 11 build approval and propagates ignored builds', async () => {
    mockExeca.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') {
        return Promise.resolve({
          exitCode: 0,
          failed: false,
          stderr: '',
          stdout: '11.5.2',
        }) as never
      }

      // pnpm install: pnpm 11 exits non-zero when build scripts are ignored
      return Promise.resolve({
        exitCode: 1,
        failed: true,
        stderr: ' ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: esbuild@0.28.0',
        stdout: '',
      }) as never
    })

    const output = {error: vi.fn() as never, log: vi.fn(), warn: vi.fn()}
    const trace = {log: vi.fn()}

    const result = await scaffoldAndInstall({
      datasetName: 'production',
      defaults: {projectName: 'studio'},
      displayName: 'Studio',
      // Only the option fields consumed by scaffoldAndInstall need to be real.
      options: {
        autoUpdates: true,
        git: false,
        overwriteFiles: undefined,
        packageManager: 'pnpm',
        templateToken: undefined,
        unattended: true,
      } as never,
      organizationId: undefined,
      output: output as never,
      outputPath: dir,
      projectId: 'proj-id',
      remoteTemplateInfo: undefined,
      sluggedName: 'studio',
      templateName: 'clean',
      trace: trace as never,
      useTypeScript: true,
      workDir: dir,
    })

    // (a) The real writePnpmBuildApproval ran on the pnpm 11 path and wrote a
    // sibling pnpm-workspace.yaml with the allowlist pre-approved.
    const yamlPath = path.join(dir, 'pnpm-workspace.yaml')
    const parsed: unknown = parseYaml(readFileSync(yamlPath, 'utf8'))
    expect(parsed).toMatchObject({allowBuilds: {esbuild: true}})

    // (b) The real installDeclaredPackages + parseIgnoredBuilds ran and the
    // ignored builds propagated back to the caller.
    expect(result).toEqual({ignoredBuilds: ['esbuild'], pkgManager: 'pnpm'})
  })
})

describe('getTemplateChoices', () => {
  test('includes the page-builder template in non-production environments', () => {
    const values = getTemplateChoices('staging').map((choice) => choice.value)
    expect(values).toContain('page-builder')
  })

  test('excludes the page-builder template in production', () => {
    const values = getTemplateChoices('production').map((choice) => choice.value)
    expect(values).not.toContain('page-builder')
  })
})

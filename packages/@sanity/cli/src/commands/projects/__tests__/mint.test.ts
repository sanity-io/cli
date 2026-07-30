import path from 'node:path'
import {stripVTControlCharacters} from 'node:util'

import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockMintUnclaimedProject = vi.hoisted(() => vi.fn())
const mockRecordUnclaimedProject = vi.hoisted(() => vi.fn())
const mockIsStudioScaffoldTargetAvailable = vi.hoisted(() => vi.fn())
const mockInspectEnvKeys = vi.hoisted(() => vi.fn())
const mockAppendEnvValues = vi.hoisted(() => vi.fn())
const mockEnsureEnvGitignored = vi.hoisted(() => vi.fn())
const mockIsEnvTracked = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())
const mockScaffoldProject = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/ux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
  input: mockInput,
}))
vi.mock('../../../services/mintProject.js', () => ({
  mintUnclaimedProject: mockMintUnclaimedProject,
}))
vi.mock('../../../util/unclaimedProjects.js', () => ({
  recordUnclaimedProject: mockRecordUnclaimedProject,
}))
vi.mock('../../../util/envFile.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/envFile.js')>()),
  appendEnvValues: mockAppendEnvValues,
  ensureEnvGitignored: mockEnsureEnvGitignored,
  inspectEnvKeys: mockInspectEnvKeys,
  isEnvTracked: mockIsEnvTracked,
}))
vi.mock('../../../actions/scaffold/scaffoldProject.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../actions/scaffold/scaffoldProject.js')>()),
  isStudioScaffoldTargetAvailable: mockIsStudioScaffoldTargetAvailable,
  scaffoldProject: mockScaffoldProject,
}))

const minted = {
  apiHost: 'https://abc123.api.sanity.io',
  claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
  claimToken: 'claim-token',
  claimUrl: 'https://www.sanity.io/claim/claim-token',
  datasetName: 'production',
  expiresAt: '2026-08-01T00:00:00.000Z',
  resourceId: 'abc123',
  token: 'sk-robot-token',
}

const result = {
  apiHost: minted.apiHost,
  claimApiUrl: minted.claimApiUrl,
  claimToken: minted.claimToken,
  claimUrl: minted.claimUrl,
  dataset: minted.datasetName,
  expiresAt: minted.expiresAt,
  projectId: minted.resourceId,
  token: minted.token,
}

const emptyInspection = {blankKeys: [], presentKeys: [], values: {}}

const {NewCommand} = await import('../../new.js')
const {MintProjectCommand} = await import('../mint.js')

function outputText(): string {
  return stripVTControlCharacters(vi.mocked(mocks.SanityCmdOutput.log).mock.calls.flat().join('\n'))
}

beforeEach(() => {
  mockMintUnclaimedProject.mockResolvedValue(minted)
  mockRecordUnclaimedProject.mockReturnValue(true)
  mockIsStudioScaffoldTargetAvailable.mockResolvedValue(true)
  mockInspectEnvKeys.mockReturnValue(emptyInspection)
  mockAppendEnvValues.mockReturnValue({
    created: true,
    skippedKeys: [],
    wroteKeys: ['SANITY_AUTH_TOKEN', 'SANITY_DATASET', 'SANITY_PROJECT_ID'],
  })
  mockEnsureEnvGitignored.mockReturnValue({added: true, ignored: true})
  mockIsEnvTracked.mockReturnValue(false)
  mockScaffoldProject.mockResolvedValue({
    frontendDependenciesInstalled: true,
    frontendEnv: {
      NEXT_PUBLIC_SANITY_DATASET: minted.datasetName,
      NEXT_PUBLIC_SANITY_PROJECT_ID: minted.resourceId,
    },
    frontendEnvWritten: true,
    frontendPackageManager: 'npm',
    frontendPath: '/tmp/project/web',
    studioEnvWritten: true,
    studioPath: '/tmp/project/sanity',
  })
  mocks.SanityCmdIsUnattended.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = undefined
})

describe('#projects:mint', () => {
  test('keeps help description lines within the rendered 80-column limit', () => {
    for (const line of `${MintProjectCommand.summary}\n${MintProjectCommand.description}`.split(
      '\n',
    )) {
      expect(line.length + 2).toBeLessThanOrEqual(80)
    }

    const description = MintProjectCommand.description.replaceAll(/\s+/gu, ' ')
    expect(description).toContain(
      'By default this also scaffolds a Studio into ./sanity and a Next.js frontend into ./web, ' +
        'with credentials wired into both; pass --no-scaffold to skip it.',
    )
    expect(description).toContain(
      'The CLI does not load ./.env because the mint root has no Sanity config.',
    )
    expect(description).toContain(
      'Commands run from the scaffolded Studio load sanity/.env.local because ./sanity has a ' +
        'Sanity config.',
    )
    expect(description).not.toContain(
      'so `sanity` commands run from here authenticate as the project with no account',
    )
    expect(description).toContain(
      'After the claim, run `sanity login` and remove SANITY_AUTH_TOKEN from sanity/.env.local to ' +
        'make CLI commands run from ./sanity authenticate as your account. The token in ./.env is ' +
        'not used for CLI authentication from the mint root.',
    )
  })

  test('mints, records, writes setup values, and scaffolds the project', async () => {
    await expect(MintProjectCommand.run(['My New Project'])).resolves.toEqual(result)

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
    expect(mockRecordUnclaimedProject).toHaveBeenCalledWith(minted)
    expect(mockAppendEnvValues).toHaveBeenCalledWith(
      expect.stringMatching(/\.env$/),
      {
        SANITY_AUTH_TOKEN: minted.token,
        SANITY_DATASET: minted.datasetName,
        SANITY_PROJECT_ID: minted.resourceId,
      },
      expect.objectContaining({
        banner: expect.arrayContaining([expect.stringContaining(minted.claimUrl)]),
      }),
    )
    expect(mockEnsureEnvGitignored).toHaveBeenCalledWith(expect.any(String), '.env*')
    expect(mockScaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: minted.datasetName,
        displayName: 'My New Project',
        projectId: minted.resourceId,
        token: minted.token,
      }),
    )
  })

  test('narrates the canonical project, claim, and scaffold handoff', async () => {
    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('@@@@')
    expect(output).toContain('Setting up your Sanity project.')
    expect(output).toContain('Created "My New Project"')
    expect(output).toContain(`Project ID: ${minted.resourceId}`)
    expect(output).toContain(`Dataset: ${minted.datasetName} (where your content lives)`)
    expect(output).toContain(`Access token: ${minted.token}`)
    expect(output).toContain('Run a CLI command with this access token:')
    expect(output).toContain(`$ SANITY_AUTH_TOKEN="${minted.token}" sanity <command>`)
    expect(output.indexOf(`Access token: ${minted.token}`)).toBeLessThan(
      output.indexOf('Claim your project by'),
    )
    expect(output.indexOf(`Access token: ${minted.token}`)).toBeLessThan(
      output.indexOf('Created two folders'),
    )
    expect(output).toContain('Claim your project by 1 August 2026, 00:00 UTC')
    expect(output).toContain(minted.claimUrl)
    expect(output).toContain('Created two folders')
    expect(output).toContain('./sanity: your Studio')
    expect(output).toContain('./web: your website')
    expect(output).toContain('Start your Studio with:')
    expect(output).toContain('$ cd sanity && npx sanity dev')
    expect(output).toContain('then open http://localhost:3333/#token=sk-robot-token')
    expect(output).toContain('In a separate terminal, start your website with:')
    expect(output).toContain('$ cd web && npm run dev')
    expect(output).toContain('then open http://localhost:3000/')
    expect(output).toContain('If you are an agent: give this claim URL')
    expect(output).toContain('to open it themselves before the deadline')
    expect(output).toContain('Your access token is in ./.env and ./sanity/.env.local')
    expect(output).toContain('Keep those reads server-side')
    expect(output).toContain('never expose the token to the')
    expect(output).toContain('browser: it can change everything in this project')
    expect(output).toContain('Claiming makes your')
    expect(output).toContain('content readable without it')
    expect(output).toContain(
      'Framework setup, and what to do after claiming:\n│  https://sanity.new',
    )
    expect(output).not.toContain(' — ')
  })

  test('uses the default project name when unattended', async () => {
    await MintProjectCommand.run([])

    expect(mockInput).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My Sanity project'})
  })

  test('prompts for a project name when attended', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockInput.mockResolvedValue('Prompted Project')

    await MintProjectCommand.run([])

    expect(mockInput).toHaveBeenCalledWith({
      default: 'My Sanity project',
      message: 'Project name',
    })
    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'Prompted Project'})
    expect(outputText()).toContain('--yes for a non-interactive flow with defaults')
  })

  test('--no-scaffold keeps the project-only flow', async () => {
    await MintProjectCommand.run(['My New Project', '--no-scaffold'])

    expect(mockScaffoldProject).not.toHaveBeenCalled()
    expect(outputText()).toContain('Project created without scaffolding')
  })

  test('refuses a non-empty Studio target before minting', async () => {
    mockIsStudioScaffoldTargetAvailable.mockResolvedValue(false)

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toMatchObject({
      code: 'EXISTING_STUDIO_DIRECTORY',
    })
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('--no-scaffold allows minting alongside an existing Studio target', async () => {
    mockIsStudioScaffoldTargetAvailable.mockResolvedValue(false)

    await expect(MintProjectCommand.run(['My New Project', '--no-scaffold'])).resolves.toEqual(
      result,
    )
    expect(mockMintUnclaimedProject).toHaveBeenCalled()
  })

  test('--json ignores local env values and returns the payload without local writes', async () => {
    mockInspectEnvKeys.mockReturnValue({
      blankKeys: [],
      presentKeys: ['SANITY_PROJECT_ID'],
      values: {SANITY_PROJECT_ID: 'existing'},
    })

    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toEqual(result)

    expect(mockInspectEnvKeys).not.toHaveBeenCalled()
    expect(mockRecordUnclaimedProject).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    expect(mockEnsureEnvGitignored).not.toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalled()
  })

  test('refuses before minting when .env already has project values', async () => {
    mockInspectEnvKeys
      .mockReturnValueOnce({
        blankKeys: [],
        presentKeys: ['SANITY_PROJECT_ID'],
        values: {SANITY_PROJECT_ID: 'existing'},
      })
      .mockReturnValueOnce(emptyInspection)

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toMatchObject({
      code: 'EXISTING_SANITY_ENV_VALUES',
    })
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('refuses before minting when .env.local has project values', async () => {
    const cwd = process.cwd()
    mockInspectEnvKeys.mockReturnValueOnce(emptyInspection).mockReturnValueOnce({
      blankKeys: [],
      presentKeys: ['SANITY_AUTH_TOKEN'],
      values: {SANITY_AUTH_TOKEN: 'existing'},
    })

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toMatchObject({
      code: 'EXISTING_SANITY_ENV_VALUES',
    })
    expect(mockInspectEnvKeys).toHaveBeenNthCalledWith(1, path.join(cwd, '.env'), expect.any(Array))
    expect(mockInspectEnvKeys).toHaveBeenNthCalledWith(
      2,
      path.join(cwd, '.env.local'),
      expect.any(Array),
    )
    expect(mockInspectEnvKeys).toHaveBeenCalledTimes(2)
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('--force prints replacement values without changing .env or scaffolding', async () => {
    mockInspectEnvKeys
      .mockReturnValueOnce({
        blankKeys: [],
        presentKeys: ['SANITY_PROJECT_ID'],
        values: {SANITY_PROJECT_ID: 'existing'},
      })
      .mockReturnValueOnce(emptyInspection)

    await MintProjectCommand.run(['My New Project', '--force'])

    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    expect(outputText()).toContain('Your existing ./.env was left unchanged')
    expect(outputText()).toContain('Update ./.env')
    expect(outputText()).toContain('Create your Studio')
    expect(outputText()).toContain('Create a new Next.js website in ./web')
    expect(outputText()).toContain(`SANITY_PROJECT_ID="${minted.resourceId}"`)
    expect(outputText()).toContain(`SANITY_AUTH_TOKEN="${minted.token}"`)
    expect(outputText()).toContain('Keep those reads server-side')
    expect(outputText()).toContain('never expose the token to the')
    expect(outputText()).toContain('browser: it can change everything in this project')
  })

  test('--force identifies .env.local as the file that needs new values', async () => {
    mockInspectEnvKeys.mockReturnValueOnce(emptyInspection).mockReturnValueOnce({
      blankKeys: [],
      presentKeys: ['SANITY_PROJECT_ID'],
      values: {SANITY_PROJECT_ID: 'existing'},
    })

    await MintProjectCommand.run(['My New Project', '--force'])

    expect(outputText()).toContain('Your existing ./.env.local was left unchanged')
    expect(outputText()).toContain('Update ./.env.local')
  })

  test('refuses blank project placeholders even with --force', async () => {
    mockInspectEnvKeys.mockReturnValue({
      blankKeys: ['SANITY_AUTH_TOKEN'],
      presentKeys: ['SANITY_AUTH_TOKEN'],
      values: {},
    })

    await expect(MintProjectCommand.run(['My New Project', '--force'])).rejects.toMatchObject({
      code: 'BLANK_SANITY_ENV_VALUES',
    })
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('keeps passive registry recovery inside the flow', async () => {
    mockRecordUnclaimedProject.mockReturnValue(false)

    await MintProjectCommand.run(['My New Project', '--no-scaffold'])

    const output = outputText()
    expect(output).toContain('The local recovery record was not saved')
    expect(output).toContain('Keep the claim URL and access token from this output')
    expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalled()
  })

  test('preserves the mint handoff when automatic scaffolding fails', async () => {
    mockScaffoldProject.mockRejectedValue(new Error('template failed'))

    await MintProjectCommand.run(['My New Project'])

    expect(outputText()).toContain('Automatic setup did not finish: template failed')
    expect(outputText()).toContain('The project is ready. You do not need to create another one')
    expect(outputText()).toContain('Create your Studio')
    expect(outputText()).toContain(minted.claimUrl)
    expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalled()
  })

  test('gives a runnable recovery when .env is already tracked by git', async () => {
    mockIsEnvTracked.mockReturnValue(true)

    await MintProjectCommand.run(['My New Project', '--no-scaffold'])

    expect(outputText()).toContain('Keep .env out of version control')
    expect(outputText()).toContain('$ git rm --cached .env')
    expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalled()
  })

  test('connects an existing recognized frontend without replacing it', async () => {
    mockScaffoldProject.mockResolvedValue({
      detectedFramework: 'Next.js',
      frontendEnv: {
        NEXT_PUBLIC_SANITY_DATASET: minted.datasetName,
        NEXT_PUBLIC_SANITY_PROJECT_ID: minted.resourceId,
      },
      frontendEnvPrefix: 'NEXT_PUBLIC_',
      frontendEnvWritten: false,
      studioEnvWritten: true,
      studioPath: '/tmp/project/sanity',
    })

    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('Created ./sanity for your existing Next.js app')
    expect(output).toContain('Your existing Next.js frontend was left unchanged')
    expect(output).not.toContain('Connect your existing Next.js app')
    expect(output).not.toContain('NEXT_PUBLIC_SANITY_PROJECT_ID')
    expect(output).not.toContain('Start your website: terminal 2')
  })

  test('gives a runnable recovery when frontend creation fails after Studio setup', async () => {
    mockScaffoldProject.mockResolvedValue({
      frontendCreationError: 'create-next-app failed',
      frontendEnv: {
        NEXT_PUBLIC_SANITY_DATASET: minted.datasetName,
        NEXT_PUBLIC_SANITY_PROJECT_ID: minted.resourceId,
      },
      frontendEnvPrefix: 'NEXT_PUBLIC_',
      frontendEnvWritten: false,
      studioEnvWritten: true,
      studioPath: '/tmp/project/sanity',
    })

    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('Created ./sanity')
    expect(output).toContain('The website was not created: create-next-app failed')
    expect(output).toContain('Start your Studio with:')
    expect(output).toContain('Create your website')
    expect(output).toContain('$ npx --yes create-next-app')
  })

  test('prints the full manual recovery when ./.env cannot be written', async () => {
    mockAppendEnvValues.mockImplementation(() => {
      throw new Error('permission denied')
    })

    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('Could not write ./.env: permission denied')
    expect(output).toContain('Add these values to ./.env')
    expect(output).toContain('Create your Studio')
    expect(output).toContain('Create a new Next.js website in ./web')
    expect(mockScaffoldProject).not.toHaveBeenCalled()
  })

  test('calls out an existing dataset value that was left unchanged', async () => {
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_DATASET'],
      wroteKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
    })

    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('Update SANITY_DATASET in ./.env')
    expect(output).toContain('The existing value was left unchanged')
    expect(output).toContain(`SANITY_DATASET="${minted.datasetName}"`)
    expect(mockScaffoldProject).toHaveBeenCalled()
  })

  test('renders scoped env and dependency recoveries as actions', async () => {
    mockScaffoldProject.mockResolvedValue({
      frontendDependenciesInstalled: false,
      frontendDependencyError: 'next-sanity failed',
      frontendEnv: {
        NEXT_PUBLIC_SANITY_DATASET: minted.datasetName,
        NEXT_PUBLIC_SANITY_PROJECT_ID: minted.resourceId,
      },
      frontendEnvPrefix: 'NEXT_PUBLIC_',
      frontendEnvWritten: false,
      frontendPackageManager: 'pnpm',
      frontendPath: '/tmp/project/web',
      studioEnvWritten: false,
      studioPath: '/tmp/project/sanity',
    })

    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('Add these values to ./web/.env.local')
    expect(output).toContain('Add your access token to ./sanity/.env.local')
    expect(output).toContain('Finish installing your website dependencies')
    expect(output).toContain('$ cd web && pnpm add --save-prod next-sanity')
  })

  test('asks the user to protect .env when .gitignore cannot be updated', async () => {
    mockEnsureEnvGitignored.mockReturnValue({added: false, ignored: false})

    await MintProjectCommand.run(['My New Project', '--no-scaffold'])

    expect(outputText()).toContain('Add .env* to .gitignore before committing')
  })

  test('does not claim token files are ignored when .gitignore cannot be updated', async () => {
    mockEnsureEnvGitignored.mockReturnValue({added: false, ignored: false})

    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('Keep both files out of version control')
    expect(output).not.toContain('Both files are kept out of version control for you')
    expect(output).not.toContain('./sanity/.env.local is ignored')
  })

  test('leaves framework-specific setup to the guide when a frontend is detected', async () => {
    mockScaffoldProject.mockResolvedValue({
      detectedFramework: 'Mystery.js',
      frontendEnv: {
        NEXT_PUBLIC_SANITY_DATASET: minted.datasetName,
        NEXT_PUBLIC_SANITY_PROJECT_ID: minted.resourceId,
      },
      frontendEnvWritten: false,
      studioEnvWritten: true,
      studioPath: '/tmp/project/sanity',
    })

    await MintProjectCommand.run(['My New Project'])

    const output = outputText()
    expect(output).toContain('Created ./sanity for your existing Mystery.js app')
    expect(output).not.toContain('Connect your existing Mystery.js app')
    expect(output).not.toContain('Those names follow the Next.js convention')
    expect(output).not.toContain('NEXT_PUBLIC_SANITY_PROJECT_ID')
    expect(output).toContain('Framework setup, and what to do after claiming:')
  })

  test('retains the claim recovery when setup is cancelled after minting', async () => {
    mockScaffoldProject.mockRejectedValue(new Error('SIGINT'))

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow('SIGINT')

    const output = outputText()
    expect(output).toContain('Setup stopped. Your project was still created')
    expect(output).toContain(`Claim your project: ${minted.claimUrl}`)
  })
})

describe('#new', () => {
  test('has newcomer-oriented help distinct from the plumbing command', () => {
    for (const line of NewCommand.description.split('\n')) {
      expect(line.length + 2).toBeLessThanOrEqual(80)
    }
    const description = `${NewCommand.summary} ${NewCommand.description}`.replaceAll(/\s+/gu, ' ')
    expect(description).toContain(
      'Create a Sanity project without an account, and claim it within 72 hours to keep it.',
    )
    expect(description).toContain(
      'Sets up two folders here: ./sanity, a Studio where you write and edit your content',
    )
    expect(description).toContain(
      'Fetch https://sanity.new for full instructions, or point your AI agent at it.',
    )
    expect(NewCommand.description).not.toBe(MintProjectCommand.description)
    expect(NewCommand.examples.map(({description}) => description)).toContain(
      'Create the project only, with no Studio or website',
    )
    expect(NewCommand.flags.scaffold.description).toBe(
      'Set up a Studio in ./sanity and a Next.js website in ./web (on by default)',
    )
    expect(NewCommand.args.projectName.description).toBe('Display name for the new project')
    expect(NewCommand.flags.force.description).toMatch(/^Create a new project/u)
  })

  test('runs the same self-contained implementation with its own command identity', async () => {
    await NewCommand.run(['My New Project', '--no-scaffold'])

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
    expect(outputText()).toContain('Created "My New Project"')
  })
})

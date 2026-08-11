import {stripVTControlCharacters} from 'node:util'

import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockMintUnclaimedProject = vi.hoisted(() => vi.fn())
const mockRecordUnclaimedProject = vi.hoisted(() => vi.fn())
const mockGetUnavailableScaffoldTarget = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())
const mockScaffoldProject = vi.hoisted(() => vi.fn())
const mockFetchNewInstructions = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/ux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
  input: mockInput,
}))
vi.mock('../../services/mintProject.js', () => ({
  mintUnclaimedProject: mockMintUnclaimedProject,
}))
vi.mock('../../util/unclaimedProjects.js', () => ({
  recordUnclaimedProject: mockRecordUnclaimedProject,
}))
vi.mock('../../services/newInstructions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/newInstructions.js')>()),
  fetchNewInstructions: mockFetchNewInstructions,
}))
vi.mock('../../actions/scaffold/scaffoldProject.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../actions/scaffold/scaffoldProject.js')>()),
  getUnavailableScaffoldTarget: mockGetUnavailableScaffoldTarget,
  scaffoldProject: mockScaffoldProject,
}))

const project = {
  apiHost: 'https://abc123.api.sanity.io',
  claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
  claimToken: 'claim-token',
  claimUrl: 'https://www.sanity.io/claim/claim-token',
  datasetName: 'production',
  expiresAt: '2026-08-01T00:00:00.000Z',
  resourceId: 'abc123',
  termsNotice: 'By continuing to use this project you accept the Sanity Terms of Service.',
  termsUrl: 'https://www.sanity.io/legal/tos',
  token: 'sk-robot-token',
}

const result = {
  apiHost: project.apiHost,
  claimApiUrl: project.claimApiUrl,
  claimToken: project.claimToken,
  claimUrl: project.claimUrl,
  dataset: project.datasetName,
  expiresAt: project.expiresAt,
  projectId: project.resourceId,
  terms: {notice: project.termsNotice, url: project.termsUrl},
  token: project.token,
}

const INSTRUCTIONS_MARKDOWN = [
  '# Set up a Sanity project (mint and claim)',
  '',
  '## 1. Mint a project',
  '',
  '```sh',
  'npx sanity@latest new "My Project" --yes',
  '```',
].join('\n')

const studioUrl =
  'http://localhost:3333/#token=sk-robot-token' +
  '&claim=https%3A%2F%2Fwww.sanity.io%2Fclaim%2Fclaim-token'

const {NewCommand} = await import('../new.js')
const {InstructionsUnavailableError} = await import('../../services/newInstructions.js')

function outputText(): string {
  return stripVTControlCharacters(vi.mocked(mocks.SanityCmdOutput.log).mock.calls.flat().join('\n'))
}

function outputLines(): string[] {
  return vi
    .mocked(mocks.SanityCmdOutput.log)
    .mock.calls.flat()
    .map((line) => stripVTControlCharacters(String(line)))
}

function stderrText(): string {
  return stripVTControlCharacters(
    vi.mocked(process.stderr.write).mock.calls.flat().map(String).join('\n'),
  )
}

beforeEach(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  mockMintUnclaimedProject.mockResolvedValue(project)
  mockRecordUnclaimedProject.mockReturnValue(true)
  mockGetUnavailableScaffoldTarget.mockResolvedValue(undefined)
  mockScaffoldProject.mockResolvedValue({
    frontendDependenciesInstalled: true,
    frontendPackageManager: 'npm',
    frontendPath: '/tmp/project/web',
    studioPath: '/tmp/project/sanity',
  })
  mockFetchNewInstructions.mockResolvedValue(INSTRUCTIONS_MARKDOWN)
  mocks.SanityCmdIsUnattended.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

describe('#new', () => {
  test('owns project creation, records recovery before scaffolding, and returns the result', async () => {
    await expect(NewCommand.run(['My New Project'])).resolves.toEqual(result)

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
    expect(mockRecordUnclaimedProject).toHaveBeenCalledWith(project)
    expect(mockScaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: project.datasetName,
        displayName: 'My New Project',
        projectId: project.resourceId,
        token: project.token,
      }),
    )
    expect(mockRecordUnclaimedProject.mock.invocationCallOrder[0]).toBeLessThan(
      mockScaffoldProject.mock.invocationCallOrder[0],
    )
  })

  test('prints scannable claim details before the scaffold handoff', async () => {
    await NewCommand.run(['My New Project'])

    const output = outputText()
    const lines = outputLines()
    expect(output).toContain(`Project ID: ${project.resourceId}`)
    expect(output).toContain(`Dataset: ${project.datasetName}`)
    expect(lines).toContain(`◇  Token: ${project.token}`)
    expect(lines).toContain(`│  Claim link: ${project.claimUrl}`)
    expect(lines).toContain('◆  Claim your project by 1 August 2026, 00:00 UTC to avoid losing it.')
    expect(lines).toContain('│  To use the Sanity CLI before claiming use your token by setting')
    expect(lines).toContain(`│  SANITY_AUTH_TOKEN="${project.token}" sanity "command"`)
    const cliInstructionIndex = lines.indexOf(
      '│  To use the Sanity CLI before claiming use your token by setting',
    )
    expect(lines.slice(cliInstructionIndex, cliInstructionIndex + 2)).toEqual([
      '│  To use the Sanity CLI before claiming use your token by setting',
      `│  SANITY_AUTH_TOKEN="${project.token}" sanity "command"`,
    ])
    expect(output).toContain(studioUrl)
    const studioLinkIndex = lines.indexOf(`│  Then open this link: ${studioUrl}`)
    expect(lines.slice(studioLinkIndex, studioLinkIndex + 3)).toEqual([
      `│  Then open this link: ${studioUrl}`,
      '│',
      '│  The token signs you in: there is no account yet.',
    ])
    expect(output).toContain(
      'Your content is private until you claim, to read it, you need the token.',
    )
    expect(output).toContain(
      "Treat your token as a password and don't expose it publicly in your app.",
    )
    expect(lines).toContain(
      '│  The claim link and token are printed above but you can recover them with',
    )
    expect(lines).toContain(
      '│  sanity projects unclaimed before the timer runs out on 1 August 2026, 00:00',
    )
    expect(lines).toContain('│  UTC.')
    expect(lines).toContain(
      '│  For more information on how claiming works or how to build your app',
    )
    expect(lines).toContain('└  visit https://sanity.new')
    expect(lines).toContain('◆  In a separate terminal, start your website:')
    expect(lines).toContain('│  Then open this link: http://localhost:3000')
    expect(output.split(project.claimUrl)).toHaveLength(2)
    expect(output).not.toContain('./.env')
  })

  test('has newcomer-oriented help without parent env or force behavior', () => {
    const help = `${NewCommand.summary} ${NewCommand.description}`.replaceAll(/\s+/gu, ' ')
    expect(help).toContain(
      'Create a Sanity project without an account, and claim it within 72 hours to keep it.',
    )
    expect(help).toContain('Sets up two folders here: ./sanity')
    expect(help).toContain('./sanity/.env.local')
    expect(help).toContain('./web/.env.local')
    expect(help).not.toContain('./.env')
    expect(NewCommand.flags).not.toHaveProperty('force')
  })

  test('uses the default project name when unattended', async () => {
    await NewCommand.run(['--no-scaffold'])

    expect(mockInput).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My Sanity project'})
  })

  test('prompts for a project name when attended', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockInput.mockResolvedValue('Prompted Project')

    await NewCommand.run(['--no-scaffold'])

    expect(mockInput).toHaveBeenCalledWith({
      default: 'My Sanity project',
      message: 'Project name',
    })
    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'Prompted Project'})
  })

  test('--no-scaffold creates no child applications and prints the Studio sign-in link', async () => {
    await NewCommand.run(['My New Project', '--no-scaffold'])

    expect(mockScaffoldProject).not.toHaveBeenCalled()
    const lines = outputLines()
    const handoffIndex = lines.indexOf('◇  Project created without scaffolding')
    expect(lines.slice(handoffIndex, handoffIndex + 7)).toEqual([
      '◇  Project created without scaffolding',
      '│  No folders or env files were created. Use the project ID and dataset above',
      '│  in your own setup.',
      '│',
      `│  Once a Studio is running on http://localhost:3333, sign in with: ${studioUrl}`,
      '│',
      '│  The token signs you in: there is no account yet.',
    ])
    expect(outputLines()).toContain(`◇  Token: ${project.token}`)
    expect(outputLines()).toContain(`│  Claim link: ${project.claimUrl}`)
    expect(outputText()).toContain('Claim your project by 1 August 2026, 00:00 UTC')
  })

  test('--instructions prints the guide verbatim under a header and creates nothing', async () => {
    await expect(NewCommand.run(['--instructions'])).resolves.toBeUndefined()

    expect(outputText()).toBe(
      `# Nothing has been created yet — follow these steps.\n\n${INSTRUCTIONS_MARKDOWN}`,
    )
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    expect(mockRecordUnclaimedProject).not.toHaveBeenCalled()
  })

  test('--instructions skips the directory check that would otherwise block the command', async () => {
    mockGetUnavailableScaffoldTarget.mockResolvedValue('sanity')

    await expect(NewCommand.run(['--instructions'])).resolves.toBeUndefined()

    expect(outputText()).toContain(INSTRUCTIONS_MARKDOWN)
    expect(mockGetUnavailableScaffoldTarget).not.toHaveBeenCalled()
  })

  test('--instructions fails with the direct fetch fallback when sanity.new is unreachable', async () => {
    mockFetchNewInstructions.mockRejectedValue(
      new InstructionsUnavailableError('the server responded with HTTP 503'),
    )

    await expect(NewCommand.run(['--instructions'])).rejects.toMatchObject({
      code: 'INSTRUCTIONS_UNAVAILABLE',
      message: expect.stringContaining('the server responded with HTTP 503'),
      suggestions: [
        'Fetch them directly: curl -sSL https://sanity.new/llms.txt',
        'Or open https://sanity.new in a browser',
      ],
    })
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  // In json mode oclif reports the error itself and sets a non-zero exit code rather than
  // rejecting, so the observable contract is the failure plus doing neither of the two things.
  test('--instructions cannot be combined with --json', async () => {
    await NewCommand.run(['--instructions', '--json']).catch(() => null)

    expect(process.exitCode).not.toBe(0)
    expect(process.exitCode).toBeDefined()
    expect(mockFetchNewInstructions).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('a project named "instructions" still mints, so the flag is the only guide path', async () => {
    await NewCommand.run(['instructions', '--no-scaffold'])

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'instructions'})
    expect(mockFetchNewInstructions).not.toHaveBeenCalled()
  })

  test('refuses a non-empty Studio target before creating a project', async () => {
    mockGetUnavailableScaffoldTarget.mockResolvedValue('sanity')

    await expect(NewCommand.run(['My New Project'])).rejects.toMatchObject({
      code: 'EXISTING_STUDIO_DIRECTORY',
    })
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('refuses a non-empty frontend target before creating a project', async () => {
    mockGetUnavailableScaffoldTarget.mockResolvedValue('web')

    await expect(NewCommand.run(['My New Project'])).rejects.toMatchObject({
      code: 'EXISTING_FRONTEND_DIRECTORY',
      suggestions: [
        'Run this command where ./web does not exist or is an empty directory',
        expect.stringMatching(
          /^Or run `.+ --no-scaffold` to create the project without changing \.\/web$/u,
        ),
      ],
    })
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test.each([
    ['a transport failure', new Error('network unavailable')],
    [
      'rate limiting',
      new Error('Project creation rate limit reached for this machine. Try again later.'),
    ],
  ])('reports %s before recording or scaffolding', async (_, error) => {
    mockMintUnclaimedProject.mockRejectedValue(error)

    await expect(NewCommand.run(['My New Project'])).rejects.toThrow(error.message)

    expect(stderrText()).toContain('Creating your project failed.')
    expect(mockRecordUnclaimedProject).not.toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    expect(outputText()).not.toContain(project.claimUrl)
    expect(outputText()).not.toContain(project.token)
  })

  test('keeps the credential handoff when the local recovery record cannot be saved', async () => {
    mockRecordUnclaimedProject.mockReturnValue(false)

    await expect(NewCommand.run(['My New Project', '--no-scaffold'])).resolves.toEqual(result)

    expect(outputText()).toContain('The local recovery record was not saved.')
    expect(outputText()).toContain('Keep the claim URL and access token from this output.')
    expect(outputText()).toContain(project.claimUrl)
    expect(outputText()).toContain(project.token)
  })

  test('keeps project details without suggesting unsupported manual recovery', async () => {
    mockScaffoldProject.mockRejectedValue(new Error('template failed'))

    await NewCommand.run(['My New Project'])

    expect(outputText()).toContain('Automatic setup did not finish: template failed')
    expect(outputText()).toContain('The project was created. You do not need to create another one')
    expect(outputText()).toContain(project.claimUrl)
    expect(outputText()).toContain(`Token: ${project.token}`)
    expect(outputText()).toContain(`SANITY_AUTH_TOKEN="${project.token}" sanity "command"`)
    expect(outputText()).toContain(`Project ID: ${project.resourceId}`)
    expect(outputText()).toContain(`Dataset: ${project.datasetName}`)
    expect(outputText()).not.toContain('sanity init')
    expect(outputText()).not.toContain('Create your Studio')
    expect(outputText()).not.toContain('create-next-app')
  })

  test('announces frontend scaffold failure without suggesting a retry', async () => {
    mockScaffoldProject.mockResolvedValue({
      frontendCreationError: 'create-next-app failed',
      frontendPackageManager: 'pnpm',
      studioPath: '/tmp/project/sanity',
    })

    await NewCommand.run(['My New Project'])

    expect(outputText()).toContain('The website was not created: create-next-app failed')
    expect(outputText()).not.toContain('Create your website')
    expect(outputText()).not.toContain('create-next-app@')
    expect(outputText()).not.toContain('--use-pnpm')
  })

  test('suggests the safe dependency completion command', async () => {
    mockScaffoldProject.mockResolvedValue({
      frontendDependenciesInstalled: false,
      frontendDependencyError: 'next-sanity failed',
      frontendPackageManager: 'pnpm',
      frontendPath: '/tmp/project/web',
      studioPath: '/tmp/project/sanity',
    })

    await NewCommand.run(['My New Project'])

    expect(outputText()).toContain('Installing website dependencies failed: next-sanity failed')
    expect(outputText()).toContain('Finish installing your website dependencies')
    expect(outputText()).toContain('cd web && pnpm add --save-prod next-sanity')
    expect(outputText().indexOf('cd web && pnpm add --save-prod next-sanity')).toBeLessThan(
      outputText().indexOf('In a separate terminal, start your website:'),
    )
  })

  test('prints the terms of service notice from the provision response', async () => {
    await NewCommand.run(['My New Project'])

    const lines = outputLines()
    expect(lines).toContain(`│  ${project.termsNotice}`)
    expect(lines).toContain(`│  Terms of Service: ${project.termsUrl}`)
    expect(lines.indexOf(`│  Terms of Service: ${project.termsUrl}`)).toBeLessThan(
      lines.indexOf('└  visit https://sanity.new'),
    )
  })

  test('prints the terms of service notice when the project is created without scaffolding', async () => {
    await NewCommand.run(['My New Project', '--no-scaffold'])

    expect(outputLines()).toContain(`│  Terms of Service: ${project.termsUrl}`)
  })

  test('exits without additional recovery output when setup is cancelled', async () => {
    mockScaffoldProject.mockRejectedValue(new Error('SIGINT'))

    await expect(NewCommand.run(['My New Project'])).rejects.toThrow('SIGINT')
    expect(outputText()).not.toContain('Setup stopped')
    expect(outputText()).not.toContain('Claim it before the deadline')
  })

  test('--json records recovery but does not scaffold or print flow output', async () => {
    await expect(NewCommand.run(['My New Project', '--json'])).resolves.toEqual(result)

    expect(mockRecordUnclaimedProject).toHaveBeenCalledWith(project)
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalled()
  })

  test('--json returns credentials when the best-effort recovery write fails', async () => {
    mockRecordUnclaimedProject.mockReturnValue(false)

    await expect(NewCommand.run(['My New Project', '--json'])).resolves.toEqual(result)

    expect(mockRecordUnclaimedProject).toHaveBeenCalledWith(project)
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalled()
  })
})

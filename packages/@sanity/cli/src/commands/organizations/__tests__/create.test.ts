import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {testCommand} from '@sanity/cli-test'
import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {CreateOrganizationCommand} from '../create.js'

const mockRequest = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: mockRequest,
    }),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: mockInput,
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    }),
  }
})

const createdOrg = {
  createdAt: '2026-01-01T00:00:00Z',
  createdByUserId: 'user-123',
  defaultRoleName: null,
  features: [],
  id: 'org-new',
  members: [],
  name: 'My Org',
  slug: null,
  telemetryConsentStatus: 'allowed',
  updatedAt: '2026-01-01T00:00:00Z',
}

let dir: string
let logoPath: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'org-create-'))
  logoPath = path.join(dir, 'logo.png')
  await writeFile(logoPath, 'png bytes')
})

afterAll(async () => {
  await rm(dir, {force: true, recursive: true})
})

describe('organizations create', () => {
  afterEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued mockResolvedValueOnce values, which would leak into the next test.
    mockRequest.mockReset()
  })

  test('redacts the logo path from command telemetry', () => {
    const result = parseArguments(
      ['node', 'sanity', 'organizations', 'create', '--logo=/Users/test/acme/logo.png'],
      CreateOrganizationCommand,
    )

    expect(result.extraArguments).toEqual(['--logo'])
  })

  test('creates the organization, then sets its logo', async () => {
    const logoUrl = 'https://cdn.sanity.io/organizations/org-new/images/abc-64x64.png'
    mockRequest.mockResolvedValueOnce(createdOrg).mockResolvedValueOnce({logoUrl})

    const {error, stdout} = await testCommand(CreateOrganizationCommand, [
      '--name',
      'My Org',
      '--logo',
      logoPath,
    ])

    if (error) throw error
    expect(stdout).toContain('org-new')
    expect(stdout).toContain(`Logo: ${logoUrl}`)
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      body: Buffer.from('png bytes'),
      headers: {'Content-Type': 'image/png'},
      method: 'put',
      url: '/organizations/org-new/logo',
    })
  })

  test('keeps the organization and says how to retry when the logo is rejected', async () => {
    mockRequest.mockResolvedValueOnce(createdOrg).mockRejectedValueOnce(
      httpError(422, 'Unprocessable Entity - The image could not be processed', {
        message: 'The image could not be processed',
      }),
    )

    const {error, stdout} = await testCommand(CreateOrganizationCommand, [
      '--name',
      'My Org',
      '--logo',
      logoPath,
    ])

    expect(stdout).toContain('org-new')
    expect(error?.message).toContain(
      "The organization was created, but its logo wasn't set: The image could not be processed",
    )
    expect(error?.message).toContain(`organizations update org-new --logo "${logoPath}"`)
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    ['an unsupported file type', './logo.psd', "isn't a supported image type"],
    ['an empty logo path', '', '--logo needs the path to an image file'],
  ])('creates nothing when given %s', async (_label, logo, message) => {
    const {error} = await testCommand(CreateOrganizationCommand, [
      '--name',
      'My Org',
      '--logo',
      logo,
    ])

    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(1)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('creates organization with --name flag', async () => {
    mockRequest.mockResolvedValue(createdOrg)

    const {error, stdout} = await testCommand(CreateOrganizationCommand, ['--name', 'My Org'])

    if (error) throw error
    expect(stdout).toContain('org-new')
    expect(stdout).toContain('My Org')
    expect(mockRequest).toHaveBeenCalledWith({
      body: {name: 'My Org'},
      method: 'post',
      url: '/organizations',
    })
  })

  test('creates organization with --name flag and --default-role flag', async () => {
    mockRequest.mockResolvedValue({...createdOrg, defaultRoleName: 'viewer'})

    const {error, stdout} = await testCommand(CreateOrganizationCommand, [
      '--name',
      'My Org',
      '--default-role',
      'viewer',
    ])

    if (error) throw error
    expect(stdout).toContain('org-new')
    expect(mockRequest).toHaveBeenCalledWith({
      body: {defaultRoleName: 'viewer', name: 'My Org'},
      method: 'post',
      url: '/organizations',
    })
  })

  test('trims name before sending', async () => {
    mockRequest.mockResolvedValue(createdOrg)

    const {error} = await testCommand(CreateOrganizationCommand, ['--name', '  My Org  '])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith({
      body: {name: 'My Org'},
      method: 'post',
      url: '/organizations',
    })
  })

  test('errors when --default-role flag is empty', async () => {
    const {error} = await testCommand(CreateOrganizationCommand, [
      '--name',
      'My Org',
      '--default-role',
      '  ',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Default role cannot be empty')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('prompts for name when arg is not provided', async () => {
    mockInput.mockResolvedValue('Prompted Org')
    mockRequest.mockResolvedValue({...createdOrg, name: 'Prompted Org'})

    const {error, stdout} = await testCommand(CreateOrganizationCommand, [], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Organization name:',
        validate: expect.any(Function),
      }),
    )
    expect(stdout).toContain('org-new')
  })

  test('errors when --name is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(CreateOrganizationCommand, [], {
      mocks: {isInteractive: false},
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing required flag name')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('errors when --name flag is empty', async () => {
    const {error} = await testCommand(CreateOrganizationCommand, ['--name', ''])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization name cannot be empty')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when --name flag exceeds 100 characters', async () => {
    const longName = 'a'.repeat(101)
    const {error} = await testCommand(CreateOrganizationCommand, ['--name', longName])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization name cannot be longer than 100 characters')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockRequest.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(CreateOrganizationCommand, ['--name', 'My Org'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create organization')
    expect(error?.oclif?.exit).toBe(1)
  })
})

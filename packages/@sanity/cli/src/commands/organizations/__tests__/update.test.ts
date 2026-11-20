import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {getGlobalCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {UpdateOrganizationCommand} from '../update.js'

const mockRequest = vi.hoisted(() => vi.fn())

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
    spinner: vi
      .fn()
      .mockReturnValue({fail: vi.fn(), start: vi.fn().mockReturnThis(), succeed: vi.fn()}),
  }
})

const updatedOrg = {
  createdAt: '2024-01-01T00:00:00Z',
  defaultRoleName: null,
  id: 'org-aaa',
  name: 'New Name',
  slug: 'new-slug',
  updatedAt: '2026-03-18T00:00:00Z',
}

const logoUrl = 'https://cdn.sanity.io/organizations/org-aaa/images/abc-64x64.png'

let dir: string
let logoPath: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'org-update-'))
  logoPath = path.join(dir, 'logo.png')
  await writeFile(logoPath, 'png bytes')
})

afterAll(async () => {
  await rm(dir, {force: true, recursive: true})
})

describe('organizations update', () => {
  afterEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued mockResolvedValueOnce values, which would leak into the next test.
    mockRequest.mockReset()
  })

  test('redacts the logo path from command telemetry', () => {
    const result = parseArguments(
      ['node', 'sanity', 'organizations', 'update', 'org-aaa', '--logo=/Users/test/acme/logo.png'],
      UpdateOrganizationCommand,
    )

    expect(result.extraArguments).toEqual(['--logo'])
  })

  test('sets the logo from an image file and prints its URL', async () => {
    mockRequest.mockResolvedValue({logoUrl})

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--logo',
      logoPath,
    ])

    if (error) throw error
    expect(stdout).toContain(`Logo: ${logoUrl}`)
    expect(getGlobalCliClient).toHaveBeenCalledWith({apiVersion: 'vX', requireUser: true})
    expect(mockRequest).toHaveBeenCalledOnce()
    expect(mockRequest).toHaveBeenCalledWith({
      body: Buffer.from('png bytes'),
      headers: {'Content-Type': 'image/png'},
      method: 'put',
      url: '/organizations/org-aaa/logo',
    })
  })

  test('removes the logo with --logo ""', async () => {
    mockRequest.mockResolvedValue({logoUrl: null})

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--logo', ''])

    if (error) throw error
    expect(stdout).toContain('Logo removed')
    expect(getGlobalCliClient).toHaveBeenCalledWith({apiVersion: 'vX', requireUser: true})
    expect(mockRequest).toHaveBeenCalledOnce()
    expect(mockRequest).toHaveBeenCalledWith({method: 'delete', url: '/organizations/org-aaa/logo'})
  })

  test('updates the name and then the logo', async () => {
    mockRequest.mockResolvedValueOnce(updatedOrg).mockResolvedValueOnce({logoUrl})

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      'New Name',
      '--logo',
      logoPath,
    ])

    if (error) throw error
    expect(stdout).toContain(`Logo: ${logoUrl}`)
    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      body: {name: 'New Name'},
      method: 'patch',
      url: '/organizations/org-aaa',
    })
    expect(mockRequest).toHaveBeenNthCalledWith(2, {
      body: Buffer.from('png bytes'),
      headers: {'Content-Type': 'image/png'},
      method: 'put',
      url: '/organizations/org-aaa/logo',
    })
  })

  test('rejects a logo over 5 MB without sending anything', async () => {
    const largeLogo = path.join(dir, 'large.png')
    await writeFile(largeLogo, Buffer.alloc(10 * 1024 * 1024))

    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      'New Name',
      '--logo',
      largeLogo,
    ])

    expect(error?.message).toContain('is larger than 5 MB, the upload limit')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test("prints the API's reason when it rejects the logo", async () => {
    mockRequest.mockRejectedValue(
      httpError(415, 'Unsupported Media Type - The image format is not supported', {
        error: 'Unsupported Media Type',
        message: 'The image format is not supported',
        statusCode: 415,
      }),
    )

    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--logo', logoPath])

    expect(error?.message).toBe(
      "Failed to set the organization's logo: The image format is not supported",
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('says the other changes were saved when only the logo is rejected', async () => {
    mockRequest.mockResolvedValueOnce(updatedOrg).mockRejectedValueOnce(
      httpError(422, 'Unprocessable Entity - The image could not be processed', {
        message: 'The image could not be processed',
      }),
    )

    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      'New Name',
      '--logo',
      logoPath,
    ])

    expect(error?.message).toBe(
      "The organization was updated, but its logo wasn't set: The image could not be processed",
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test("prints the API's reason when it can't remove the logo", async () => {
    mockRequest.mockRejectedValue(
      httpError(403, 'Forbidden - You do not have permission to update this organization', {
        message: 'You do not have permission to update this organization',
      }),
    )

    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--logo', ''])

    expect(error?.message).toBe(
      "Failed to remove the organization's logo: You do not have permission to update this organization",
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('updates organization name', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      'New Name',
    ])

    if (error) throw error
    expect(stdout).toContain('Organization updated')
    expect(mockRequest).toHaveBeenCalledWith({
      body: {name: 'New Name'},
      method: 'patch',
      url: '/organizations/org-aaa',
    })
  })

  test('updates organization slug', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--slug',
      'new-slug',
    ])

    if (error) throw error
    expect(stdout).toContain('Organization updated')
    expect(mockRequest).toHaveBeenCalledWith({
      body: {slug: 'new-slug'},
      method: 'patch',
      url: '/organizations/org-aaa',
    })
  })

  test('updates multiple fields at once', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error, stdout} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      'New Name',
      '--slug',
      'new-slug',
      '--default-role',
      'viewer',
    ])

    if (error) throw error
    expect(stdout).toContain('Organization updated')
    expect(mockRequest).toHaveBeenCalledWith({
      body: {defaultRoleName: 'viewer', name: 'New Name', slug: 'new-slug'},
      method: 'patch',
      url: '/organizations/org-aaa',
    })
  })

  test('trims name and slug before sending', async () => {
    mockRequest.mockResolvedValue(updatedOrg)

    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--name',
      '  New Name  ',
      '--slug',
      '  new-slug  ',
    ])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith({
      body: {name: 'New Name', slug: 'new-slug'},
      method: 'patch',
      url: '/organizations/org-aaa',
    })
  })

  test('errors when --default-role flag is empty', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--default-role',
      '  ',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Default role cannot be empty')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('errors when no flags are provided', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('At least one of the following must be provided')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('requires organizationId argument', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['--name', 'Foo'])

    expect(error).toBeInstanceOf(Error)
  })

  test('validates name flag', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--name', '   '])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization name cannot be empty')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows user-friendly error on 404', async () => {
    mockRequest.mockRejectedValue(httpError(404, 'Not found'))

    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--name', 'New Name'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization "org-aaa" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('validates slug flag', async () => {
    const {error} = await testCommand(UpdateOrganizationCommand, [
      'org-aaa',
      '--slug',
      'Invalid Slug!',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('must be lowercase')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('surfaces API error (e.g. slug requires authSAML feature)', async () => {
    mockRequest.mockRejectedValue(httpError(403, 'Slug requires SAML'))

    const {error} = await testCommand(UpdateOrganizationCommand, ['org-aaa', '--slug', 'my-slug'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to update organization')
    expect(error?.oclif?.exit).toBe(1)
  })
})

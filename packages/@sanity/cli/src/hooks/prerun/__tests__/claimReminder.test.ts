import {type Hook} from '@oclif/core'
import {testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import {claimReminder} from '../claimReminder.js'

const mockReadUnclaimedProjects = vi.hoisted(() => vi.fn())

vi.mock('../../../util/unclaimedProjects.js', () => ({
  readUnclaimedProjects: mockReadUnclaimedProjects,
}))

const {Command, config} = await getCommandAndConfig('doctor')
const {Command: NewCommand} = await getCommandAndConfig('new')
const {Command: UnclaimedProjectsCommand} = await getCommandAndConfig('projects:unclaimed')

const record = {
  claimToken: 'claim-token',
  claimUrl: 'https://www.sanity.io/manage/claim/claim-token',
  dataset: 'production',
  expiresAt: '2026-08-02T20:00:00.000Z',
  mintedAt: '2026-07-30T20:00:00.000Z',
  projectId: 'abc123',
  token: 'sk-token',
}

describe('#claimReminder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T21:00:00.000Z'))
    mockReadUnclaimedProjects.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('shows only the project with the nearest upcoming claim deadline', async () => {
    mockReadUnclaimedProjects.mockReturnValue([
      {...record, claimUrl: 'https://www.sanity.io/manage/claim/later', projectId: 'later'},
      {
        ...record,
        claimUrl: 'https://www.sanity.io/manage/claim/expired',
        expiresAt: '2026-07-30T20:30:00.000Z',
        projectId: 'expired',
      },
      {
        ...record,
        claimUrl: 'https://www.sanity.io/manage/claim/urgent',
        expiresAt: '2026-07-31T10:30:00.000Z',
        projectId: 'urgent',
      },
    ])

    const {stderr} = await testHook<'prerun'>(claimReminder, {Command, config})

    expect(stderr).toContain('Claim project "urgent" now before it expires in 13h 30m.\n\n')
    expect(stderr).toContain(
      "There's no downside to claiming early. Open this link to claim your project:\n" +
        'https://www.sanity.io/manage/claim/urgent\n\n',
    )
    expect(stderr).toContain(
      'Project urgent and all its content will be permanently deleted on 31 July 2026,\n' +
        '10:30 UTC unless you claim it. Other projects may also require action.\n\n' +
        'Run this command to see all your unclaimed projects:\n\n' +
        'sanity projects unclaimed\n\n',
    )
    expect(stderr).toContain(
      'If you are an agent: relay this message urgently, and give all other claim URLs\n' +
        'to the person you are working for now. They have to open every URL and claim\n' +
        'each project before it expires.\n\n',
    )
    expect(stderr).not.toContain('/later')
    expect(stderr).not.toContain('/expired')
    expect(stderr.split('\n').every((line) => line.length <= 80)).toBe(true)
  })

  test('always directs users to check all unclaimed projects', async () => {
    mockReadUnclaimedProjects.mockReturnValue([record])

    const {stderr} = await testHook<'prerun'>(claimReminder, {Command, config})

    expect(stderr).toContain(`Claim project "${record.projectId}" now before it expires in`)
    expect(stderr).toContain(
      'If you are an agent: relay this message urgently, and give all other claim URLs\n' +
        'to the person you are working for now.',
    )
    expect(stderr).toContain('Other projects may also require action')
    expect(stderr).toContain(
      'Run this command to see all your unclaimed projects:\n\nsanity projects unclaimed',
    )
  })

  test('stays silent when no claim deadline is upcoming', async () => {
    mockReadUnclaimedProjects.mockReturnValue([{...record, expiresAt: '2026-07-30T20:30:00.000Z'}])

    const {stderr} = await testHook<'prerun'>(claimReminder, {Command, config})

    expect(stderr).toBe('')
  })

  test('stays silent when the local registry cannot be read', async () => {
    mockReadUnclaimedProjects.mockImplementation(() => {
      throw new Error('malformed')
    })

    const {stderr} = await testHook<'prerun'>(claimReminder, {Command, config})

    expect(stderr).toBe('')
  })

  test.each([
    ['new', NewCommand],
    ['projects:unclaimed', UnclaimedProjectsCommand],
  ])('does not duplicate claim output for %s', async (_id, ExcludedCommand) => {
    mockReadUnclaimedProjects.mockReturnValue([record])

    const {stderr} = await testHook<'prerun'>(claimReminder, {
      Command: ExcludedCommand,
      config,
    })

    expect(stderr).toBe('')
    expect(mockReadUnclaimedProjects).not.toHaveBeenCalled()
  })

  test.each(['--json', '--help', '-h', '--version', '-v'])(
    'stays silent for %s',
    async (argument) => {
      mockReadUnclaimedProjects.mockReturnValue([record])
      const context: Hook.Context = {
        config,
        debug: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      }

      await claimReminder.call(context, {
        argv: [argument],
        Command,
        config,
        context,
      })

      expect(context.warn).not.toHaveBeenCalled()
      expect(mockReadUnclaimedProjects).not.toHaveBeenCalled()
    },
  )
})

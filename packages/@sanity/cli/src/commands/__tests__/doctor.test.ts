import {mocks} from '@sanity/cli-test/mocks'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {DoctorCommand} from '../doctor.js'

vi.mock('@sanity/cli-core/SanityCommand', async () => {
  const actual = await import('@sanity/cli-test/mocks')
  return {SanityCommand: actual.MockedSanityCommand}
})
vi.mock('@sanity/cli-core/ux', async () => (await import('@sanity/cli-test/mocks')).uxMocks)

const mockDoctorChecks = vi.hoisted(() => ({cli: vi.fn()})) // coupled to actions/doctor/checks/index.js
const mockKnownChecks = vi.hoisted(() => Object.keys(mockDoctorChecks))
const mockRunDoctorChecks = vi.hoisted(() => vi.fn())
vi.mock('../../actions/doctor/checks/index.js', () => ({
  doctorChecks: mockDoctorChecks,
  KNOWN_CHECKS: mockKnownChecks,
}))
vi.mock('../../actions/doctor/runDoctorChecks.js', () => ({
  runDoctorChecks: mockRunDoctorChecks,
}))

describe('doctor command', () => {
  beforeEach(() => {
    mocks.SanityCmdGetProjectRoot.mockResolvedValue('/some/dir')
    mocks.SanityCmdGetProjectId.mockResolvedValue('1337newb')
    mockDoctorChecks.cli.mockResolvedValue(undefined)
    mockRunDoctorChecks.mockResolvedValue({checks: [], summary: {}})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('delegates to runDoctorChecks and reports results', async () => {
    const passingCheck = {messages: [], status: 'passed', title: 'everybody cool it'}
    const checkResults = {checks: [passingCheck], summary: {passed: 420}}
    mockRunDoctorChecks.mockResolvedValue(checkResults)

    await DoctorCommand.run()

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Running diag'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(passingCheck.title),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Summary:'))
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(String(checkResults.summary.passed)),
    )
  })

  test('outputs JSON when --json flag is provided', async () => {
    const passingCheck = {messages: [], status: 'passed', title: 'everybody cool it'}
    const checkResults = {checks: [passingCheck], summary: {passed: 420}}
    mockRunDoctorChecks.mockResolvedValue(checkResults)

    await DoctorCommand.run(['--json'])

    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(checkResults, null, 2)),
    )
  })
})

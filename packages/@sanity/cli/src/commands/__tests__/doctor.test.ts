import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../test/mockSanityCommand.js'
// Third: mock doctor command imports
const mockDoctorChecks = {cli: vi.fn()} // coupled to actions/doctor/checks/index.js
const mockKnownChecks = Object.keys(mockDoctorChecks)
const mockRunDoctorChecks = vi.hoisted(() => vi.fn())
vi.mock('../../actions/doctor/checks/index.js', () => ({
  doctorChecks: mockDoctorChecks,
  KNOWN_CHECKS: mockKnownChecks,
}))
vi.mock('../../actions/doctor/runDoctorChecks.js', () => ({
  runDoctorChecks: mockRunDoctorChecks,
}))

// Finally, import the module under test: doctor command
const {DoctorCommand} = await import('../doctor.js')
// First: create the mocks and mocked SanityCommand class
const {createCmdInstance, mocks} = await createMockSanityCommand(DoctorCommand)

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

    await createCmdInstance().run()

    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(expect.stringContaining('Running diag'))
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
      expect.stringContaining(passingCheck.title),
    )
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(expect.stringContaining('Summary:'))
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
      expect.stringContaining(String(checkResults.summary.passed)),
    )
  })

  test('outputs JSON when --json flag is provided', async () => {
    const passingCheck = {messages: [], status: 'passed', title: 'everybody cool it'}
    const checkResults = {checks: [passingCheck], summary: {passed: 420}}
    mockRunDoctorChecks.mockResolvedValue(checkResults)

    await createCmdInstance(['--json']).run()

    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify(checkResults, null, 2)),
    )
  })
})

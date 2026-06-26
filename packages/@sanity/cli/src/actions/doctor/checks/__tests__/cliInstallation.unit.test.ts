import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockDetectCliInstallation = vi.hoisted(() => vi.fn())

vi.mock(
  import('../../../../util/packageManager/installationInfo/detectCliInstallation.js'),
  async (importOriginal) => {
    const actual = await importOriginal()
    return {
      ...actual,
      detectCliInstallation: mockDetectCliInstallation,
    }
  },
)

const {cliInstallationCheck} = await import('../cliInstallation.js')

describe('cliInstallationCheck.run', () => {
  beforeEach(() => {
    mockDetectCliInstallation.mockResolvedValue({packages: {sanity: {}}})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns hint to run in studio dir if detectCliInstallation returns no sanity package info', async () => {
    mockDetectCliInstallation.mockResolvedValue({issues: [], packages: {}})
    const result = await cliInstallationCheck.run({cwd: 'no importa'})

    expect(result.status).toBe('passed')
    // Should have a brief info message
    const infoMsg = result.messages.find((m) => m.type === 'info')
    expect(infoMsg).toBeDefined()
    expect(infoMsg?.text).toContain('No Sanity studio detected')
  })

  test('returns success message with version when no issues found', async () => {
    mockDetectCliInstallation.mockResolvedValue({issues: [], packages: {sanity: {declared: true}}})
    const result = await cliInstallationCheck.run({cwd: 'no importa'})

    expect(result.status).toBe('passed')
    // Should have a brief success message, not verbose info dump
    const successMsg = result.messages.find((m) => m.type === 'success')
    expect(successMsg).toBeDefined()
    expect(successMsg?.text).toMatch(/no issues found/i)

    // Should NOT have info-dump messages about workspace type, execution context
    const infoMessages = result.messages.filter((m) => m.type === 'info')
    expect(infoMessages.filter((m) => m.text.startsWith('Workspace:'))).toHaveLength(0)
    expect(infoMessages.filter((m) => m.text.startsWith('Running CLI from:'))).toHaveLength(0)
  })
})

import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../types.js'

const mockCheckbox = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', () => ({
  checkbox: mockCheckbox,
}))

const {promptForMCPSetup} = await import('../promptForMCPSetup.js')

function makeEditor(overrides: Partial<Editor> & Pick<Editor, 'name'>): Editor {
  return {
    configPath: `/fake/${overrides.name}/config.json`,
    configured: false,
    ...overrides,
  }
}

describe('promptForMCPSetup', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('labels unconfigured editors with plain name', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    const editors = [makeEditor({name: 'Cursor'})]
    await promptForMCPSetup(editors)

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [{checked: false, description: 'Not configured', name: 'Cursor', value: 'Cursor'}],
      }),
    )
  })

  test('preselects configured editors and labels them as configured', async () => {
    mockCheckbox.mockResolvedValue(['Cursor', 'VS Code', 'Claude Code'])

    const editors = [
      makeEditor({
        authStatus: 'valid',
        configured: true,
        existingToken: 'token',
        name: 'Cursor',
      }),
      makeEditor({
        authStatus: 'unauthorized',
        configured: true,
        existingToken: 'old',
        name: 'VS Code',
      }),
      makeEditor({configured: true, name: 'Claude Code'}),
    ]
    await promptForMCPSetup(editors)

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          {
            checked: true,
            description: 'Configured',
            name: 'Cursor',
            value: 'Cursor',
          },
          {
            checked: true,
            description: 'Configured',
            name: 'VS Code',
            value: 'VS Code',
          },
          {
            checked: true,
            description: 'Configured',
            name: 'Claude Code',
            value: 'Claude Code',
          },
        ],
      }),
    )
  })

  test('returns an empty list when user deselects all editors', async () => {
    mockCheckbox.mockResolvedValue([])

    const editors = [makeEditor({name: 'Cursor'})]
    const result = await promptForMCPSetup(editors)

    expect(result).toEqual([])
  })

  test('returns only selected editors', async () => {
    mockCheckbox.mockResolvedValue(['VS Code'])

    const editors = [makeEditor({name: 'Cursor'}), makeEditor({name: 'VS Code'})]
    const result = await promptForMCPSetup(editors)

    expect(result).toHaveLength(1)
    expect(result![0].name).toBe('VS Code')
  })
})

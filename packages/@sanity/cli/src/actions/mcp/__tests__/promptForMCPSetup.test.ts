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
        choices: [{checked: true, name: 'Cursor', value: 'Cursor'}],
      }),
    )
  })

  test('labels editors with expired auth as "(auth expired)"', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    const editors = [
      makeEditor({
        authStatus: 'unauthorized',
        configured: true,
        existingToken: 'old',
        name: 'Cursor',
      }),
    ]
    await promptForMCPSetup(editors)

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [{checked: true, name: 'Cursor (auth expired)', value: 'Cursor'}],
      }),
    )
  })

  test('labels configured editors without token as "(missing credentials)"', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    const editors = [makeEditor({configured: true, name: 'Cursor'})]
    await promptForMCPSetup(editors)

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [{checked: true, name: 'Cursor (missing credentials)', value: 'Cursor'}],
      }),
    )
  })

  test('returns null when user deselects all editors', async () => {
    mockCheckbox.mockResolvedValue([])

    const editors = [makeEditor({name: 'Cursor'})]
    const result = await promptForMCPSetup(editors)

    expect(result).toBeNull()
  })

  test('returns only selected editors', async () => {
    mockCheckbox.mockResolvedValue(['VS Code'])

    const editors = [makeEditor({name: 'Cursor'}), makeEditor({name: 'VS Code'})]
    const result = await promptForMCPSetup(editors)

    expect(result).toHaveLength(1)
    expect(result![0].name).toBe('VS Code')
  })
})

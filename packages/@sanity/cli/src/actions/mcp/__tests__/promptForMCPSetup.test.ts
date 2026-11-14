import {afterEach, describe, expect, test, vi} from 'vitest'

import {type EditorChoice} from '../promptForMCPSetup.js'
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

function choice(editor: Editor, action: EditorChoice['action'] = 'mcp-and-skill'): EditorChoice {
  return {action, editor}
}

describe('promptForMCPSetup', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('labels unconfigured editors with plain name', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    await promptForMCPSetup({
      choices: [choice(makeEditor({name: 'Cursor'}), 'mcp-and-skill')],
      message: 'Configure Sanity MCP and agent skills for these editors?',
    })

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [{checked: true, name: 'Cursor', value: 'Cursor'}],
        message: 'Configure Sanity MCP and agent skills for these editors?',
      }),
    )
  })

  test('labels editors with a saved login token as switching to OAuth', async () => {
    mockCheckbox.mockResolvedValue(['Zed'])

    const editor = makeEditor({configured: true, hasLegacyToken: true, name: 'Zed'})
    await promptForMCPSetup({choices: [choice(editor, 'mcp-only')], message: 'q?'})

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          {checked: true, name: 'Zed (switch from saved login token to OAuth)', value: 'Zed'},
        ],
      }),
    )
  })

  test('labels skill-only action distinctly', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    const editor = makeEditor({configured: true, name: 'Cursor'})
    await promptForMCPSetup({choices: [choice(editor, 'skill-only')], message: 'q?'})

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          {
            checked: true,
            name: 'Cursor (skills only — MCP already configured)',
            value: 'Cursor',
          },
        ],
      }),
    )
  })

  test('returns null when user deselects all editors', async () => {
    mockCheckbox.mockResolvedValue([])

    const result = await promptForMCPSetup({
      choices: [choice(makeEditor({name: 'Cursor'}))],
      message: 'q?',
    })

    expect(result).toBeNull()
  })

  test('returns only selected choices', async () => {
    mockCheckbox.mockResolvedValue(['VS Code'])

    const result = await promptForMCPSetup({
      choices: [choice(makeEditor({name: 'Cursor'})), choice(makeEditor({name: 'VS Code'}))],
      message: 'q?',
    })

    expect(result).toHaveLength(1)
    expect(result![0].editor.name).toBe('VS Code')
  })
})

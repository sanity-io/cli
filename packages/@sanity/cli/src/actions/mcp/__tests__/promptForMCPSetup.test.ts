import {checkbox as mockCheckbox} from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {type EditorChoice} from '../promptForMCPSetup.js'
import {type Editor} from '../types.js'

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

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

  test('labels editors with expired auth as "(auth expired)"', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    const editor = makeEditor({
      authStatus: 'unauthorized',
      configured: true,
      existingToken: 'old',
      name: 'Cursor',
    })
    await promptForMCPSetup({choices: [choice(editor, 'mcp-and-skill')], message: 'q?'})

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [{checked: true, name: 'Cursor (auth expired)', value: 'Cursor'}],
      }),
    )
  })

  test('labels configured editors without token as "(missing credentials)"', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    const editor = makeEditor({configured: true, name: 'Cursor'})
    await promptForMCPSetup({choices: [choice(editor, 'mcp-and-skill')], message: 'q?'})

    expect(mockCheckbox).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [{checked: true, name: 'Cursor (missing credentials)', value: 'Cursor'}],
      }),
    )
  })

  test('labels skill-only action distinctly', async () => {
    mockCheckbox.mockResolvedValue(['Cursor'])

    const editor = makeEditor({
      authStatus: 'valid',
      configured: true,
      existingToken: 'tok',
      name: 'Cursor',
    })
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

import {stripVTControlCharacters} from 'node:util'

import {describe, expect, test} from 'vitest'

import {KEYS} from '../../helpers/keys.js'
import {getE2EOrganizationId, getE2EProjectId, runCli} from '../../helpers/runCli.js'

const isRegistryMode = process.env.E2E_REGISTRY_MODE === 'true'
const projectId = getE2EProjectId()
const organizationId = getE2EOrganizationId()
const noMatchTerm = 'zz-no-such-entry'

// Search prompts render the header before the results, so wait for a highlighted row before navigating
// Matches the frame where the typed term is echoed and the highlighted row directly below contains `id`
const highlightedAfterTyping = (prompt: string, id: string) =>
  new RegExp(`${prompt} ${id}\\s*\\n\\s*❯ [^\\n]*${id}`)

describe.skipIf(isRegistryMode)(
  'sanity init - picker search (interactive)',
  {timeout: 60_000},
  () => {
    test('filters projects by search term and ignores Enter without a match', async () => {
      const session = await runCli({args: ['init', '--bare'], interactive: true})

      await session.waitForText(/Create a new project or select an existing one/)

      session.write(noMatchTerm)
      await session.waitForText(new RegExp(`No matches for "${noMatchTerm}"`))
      session.sendKey('Enter')

      session.write(KEYS.Backspace.repeat(noMatchTerm.length))
      session.write(projectId)
      await session.waitForText(highlightedAfterTyping('select an existing one', projectId))
      session.sendKey('Enter')

      await session.waitForText(/❯ Create new dataset/)
      await session.selectOption('production')

      await session.waitForExit(0)

      const output = stripVTControlCharacters(session.getOutput())
      expect(output).toContain(`Project ID: ${projectId}`)
      expect(output).toContain('Dataset: production')
      expect(output).not.toMatch(/Project name:/)
    })

    test('selects the project whose ID is pasted with Enter', async () => {
      const session = await runCli({args: ['init', '--bare'], interactive: true})

      await session.waitForText(/❯ Create new project/)
      // One write, like a paste: Enter arrives before the results for the term
      session.write(`${projectId}\r`)
      await session.waitForText(highlightedAfterTyping('select an existing one', projectId))
      session.sendKey('Enter')

      await session.waitForText(/Select dataset to use|Project name:/)
      expect(stripVTControlCharacters(session.getOutput())).not.toMatch(/Project name:/)
      await session.waitForText(/❯ Create new dataset/)
      await session.selectOption('production')

      await session.waitForExit(0)

      expect(stripVTControlCharacters(session.getOutput())).toContain(`Project ID: ${projectId}`)
    })

    test('filters organizations by search term when creating a project', async () => {
      const session = await runCli({args: ['init', '--bare'], interactive: true})

      await session.waitForText(/❯ Create new project/)
      await session.selectOption('Create new project')

      await session.waitForText(/Project name:/)
      session.write('e2e picker search')
      session.sendKey('Enter')

      await session.waitForText(/Select organization:/)
      session.write(organizationId)
      await session.waitForText(highlightedAfterTyping('Select organization:', organizationId))

      // Enter here would create a real project
      session.sendControl('c')
      await session.waitForExit(130)
    })
  },
)

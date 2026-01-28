import {testCommand} from '@sanity/cli-test'
import open from 'open'
import {describe, expect, test} from 'vitest'

import {DocsBrowseCommand} from '../browse.js'

describe('#docs:browse', () => {
  test('command runs and opens docs URL', async () => {
    const {stdout} = await testCommand(DocsBrowseCommand)

    expect(stdout).toContain('Opening https://www.sanity.io/docs')
    // Mocked in test setup
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs')
  })
})

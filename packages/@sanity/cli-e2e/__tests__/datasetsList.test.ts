import {testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {E2E_PROJECT_ID, runCli} from '../helpers/runCli.js'

describe('sanity datasets list', () => {
  test('without project context exits with project-not-found error', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['datasets', 'list'],
      // Ensure no token so we don't hit an interactive project prompt
      env: {SANITY_AUTH_TOKEN: ''},
    })

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('Unable to determine project ID')
  })

  test('with project context but no auth exits with login error', async () => {
    const cwd = await testFixture('basic-studio')
    const {exitCode, stderr} = await runCli({
      args: ['datasets', 'list'],
      cwd,
      env: {SANITY_AUTH_TOKEN: ''},
    })

    expect(exitCode).not.toBe(0)
    expect(stderr).toMatch(/login/i)
  })

  test('with --project-id flag but no auth exits with login error', async () => {
    const {exitCode, stderr} = await runCli({
      args: ['datasets', 'list', '--project-id', E2E_PROJECT_ID],
      env: {SANITY_AUTH_TOKEN: ''},
    })

    expect(exitCode).not.toBe(0)
    expect(stderr).toMatch(/login/i)
  })

  describe('with authentication', () => {
    test('lists datasets for the fixture project', async () => {
      const cwd = await testFixture('basic-studio')
      const {error, stdout} = await runCli({
        args: ['datasets', 'list'],
        cwd,
      })

      if (error) throw error
      expect(stdout.trim().length).toBeGreaterThan(0)
    })

    test('lists datasets with --project-id flag', async () => {
      const {error, stdout} = await runCli({
        args: ['datasets', 'list', '--project-id', E2E_PROJECT_ID],
      })

      if (error) throw error
      expect(stdout.trim().length).toBeGreaterThan(0)
    })
  })
})

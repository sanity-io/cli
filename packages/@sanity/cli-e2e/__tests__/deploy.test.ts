import {testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {runCli} from '../helpers/runCli.js'

// `--dry-run` isn't on the published `latest` CLI yet, so skip against the registry.
const isRegistryMode = process.env.E2E_REGISTRY_MODE === 'true'

/**
 * Asserts the shared shape of a `--dry-run` report: the header, at least one
 * built file, and the studio/app entrypoint. Each file renders as
 * `  <path> (<size> MB)`; the summary line ends with `):`, so it's excluded.
 *
 * The bare fixtures have no deploy target configured, so the plan reports a
 * blocking problem — which lets us verify problems and their fixes surface
 * end-to-end. A dry run still builds, renders the plan, and never deploys.
 */
function expectDeploymentSummary(stdout: string): void {
  expect(stdout).toContain('Dry run — no changes made.')

  const fileLines = stdout.split('\n').filter((line) => /\(\d+\.\d+ MB\)$/.test(line))
  expect(fileLines.length).toBeGreaterThan(0)
  expect(stdout).toContain('index.html')

  // No deploy target → a blocking problem in the report
  expect(stdout).toContain("can't be deployed")
  expect(stdout).toContain('Problems to fix:')
}

// `deploy --dry-run` is safe against real infrastructure: it builds locally and
// resolves the deploy target read-only, never uploading, creating, or prompting.
// The bare fixtures have no deploy target, so each run also exercises the
// "can't deploy" report — its problems, fixes, and warnings.
describe.skipIf(isRegistryMode)('sanity deploy --dry-run', {timeout: 180_000}, () => {
  test('reports a studio deploy plan without deploying', async () => {
    const cwd = await testFixture('basic-studio')

    const {stdout} = await runCli({args: ['deploy', '--dry-run'], cwd})

    expectDeploymentSummary(stdout)
    // The missing studio hostname is surfaced with its fix
    expect(stdout).toContain('→ Set `studioHost`')
    expect(stdout).not.toContain('Success! Studio deployed')
  })

  test('reports a core app deploy plan without deploying', async () => {
    const cwd = await testFixture('basic-app')

    const {stdout} = await runCli({args: ['deploy', '--dry-run'], cwd})

    expectDeploymentSummary(stdout)
    expect(stdout).not.toContain('Success! Application deployed')
  })

  test('surfaces warnings in the report', async () => {
    const cwd = await testFixture('basic-studio')

    // The deprecated --auto-updates flag is reported as a warning
    const {stdout} = await runCli({
      args: ['deploy', '--dry-run', '--no-build', '--auto-updates'],
      cwd,
    })

    expect(stdout).toContain('Warnings:')
    expect(stdout).toContain('--auto-updates flag is deprecated')
  })
})

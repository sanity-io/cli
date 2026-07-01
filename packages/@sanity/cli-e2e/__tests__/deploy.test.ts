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
 * The bare fixtures aren't configured with a deploy target, so the plan may
 * report "cannot be deployed" and exit non-zero — that's fine here. All we
 * verify is that a dry run builds, renders the plan, and never deploys.
 */
function expectDeploymentSummary(stdout: string): void {
  expect(stdout).toContain('Dry run — no changes made.')

  const fileLines = stdout.split('\n').filter((line) => /\(\d+\.\d+ MB\)$/.test(line))
  expect(fileLines.length).toBeGreaterThan(0)
  expect(stdout).toContain('index.html')
}

// `deploy --dry-run` is safe to run against real infrastructure: it builds
// locally and resolves the deploy target read-only, but never uploads, creates,
// or prompts — so it always exits 0 and just prints the plan. These prove the
// flag end-to-end for both deploy kinds.
describe.skipIf(isRegistryMode)('sanity deploy --dry-run', {timeout: 180_000}, () => {
  test('reports a studio deploy plan without deploying', async () => {
    const cwd = await testFixture('basic-studio')

    const {stdout} = await runCli({args: ['deploy', '--dry-run'], cwd})

    expectDeploymentSummary(stdout)
    expect(stdout).not.toContain('Success! Studio deployed')
  })

  test('reports a core app deploy plan without deploying', async () => {
    const cwd = await testFixture('basic-app')

    const {stdout} = await runCli({args: ['deploy', '--dry-run'], cwd})

    expectDeploymentSummary(stdout)
    expect(stdout).not.toContain('Success! Application deployed')
  })
})

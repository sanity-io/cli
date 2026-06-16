import {testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {runCli} from '../../helpers/runCli.js'

// The federated-studio fixture opts into workbench via `unstable_defineApp`, so
// `sanity dev` runs the studio through the module-federation dev pipeline. This is
// the only place the real federation dev path runs unmocked, end-to-end, through
// the actual binary — the in-process command test stubs `startWorkbenchDevServer`.
describe('sanity dev (workbench/federation)', {timeout: 120_000}, () => {
  test('runs the federation dev pipeline and starts the studio', async () => {
    const cwd = await testFixture('federated-studio')
    const port = 9332
    const session = await runCli({
      args: ['dev', '--port', String(port)],
      cwd,
      interactive: true,
    })

    // The Sanity Studio dev server reports it's ready on the *configured* port. A
    // federated studio runs itself through federation (no separate workbench host
    // server), so it stays on `port` rather than being shifted to the next one —
    // pin both the studio identity and the exact URL so a regression in either
    // (wrong server, shifted port) fails instead of matching any localhost line.
    await session.waitForText(
      new RegExp(String.raw`Sanity Studio.+running at http://localhost:${port}/`, 'i'),
      {timeout: 90_000},
    )
    // ...and the federation dev pipeline extracts the app manifest on startup.
    // A plain studio never extracts a manifest, so this line proves the workbench
    // path ran unmocked end-to-end — if the federation plugin threw or its deps
    // were missing, the manifest step would never complete and this would time out.
    await session.waitForText(/Extracted manifest/i, {timeout: 90_000})

    // `getOutput()` keeps ANSI codes (unlike `waitForText`, which strips them).
    // The URL itself isn't split by color escapes, so the exact origin is safe to
    // assert on the raw buffer.
    const output = session.getOutput()
    expect(output).toContain(`http://localhost:${port}/`)
    expect(output).toContain('Extracted manifest')

    session.sendControl('c')
    await session.waitForExit(15_000).catch(() => session.kill())
  })
})

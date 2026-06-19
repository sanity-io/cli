import {testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {runCli} from '../../helpers/runCli.js'

// Workbench isn't on the published `latest` CLI yet, so skip against the registry.
const isRegistryMode = process.env.E2E_REGISTRY_MODE === 'true'

// The federated-studio fixture opts into workbench via `unstable_defineApp` and
// pins the `sanity` workbench dist-tag, so `sanity/workbench` resolves and
// `sanity dev` starts the real workbench host dev server. This is the only place
// that orchestration runs unmocked, end-to-end, through the actual binary — the
// in-process command test stubs `startWorkbenchDevServer`.
describe.skipIf(isRegistryMode)('sanity dev (workbench/federation)', {timeout: 120_000}, () => {
  test('starts the workbench host and pushes the studio to the next port', async () => {
    const cwd = await testFixture('federated-studio')
    const port = 9332
    const session = await runCli({
      // Use the pinned local workbench build, not the auto-update CDN runtime.
      // The fixture pins the `sanity@workbench` dist-tag; when it drifts from
      // the CDN's served runtime version, auto-updates raises an interactive
      // "upgrade local versions?" prompt that blocks the dev server from ever
      // starting (and this test never answers it).
      args: ['dev', '--port', String(port), '--no-auto-updates'],
      cwd,
      interactive: true,
    })

    // The workbench host binds the configured port and the studio app is pushed
    // to the next one. This line only prints when the workbench runtime resolves
    // and the host vite server actually starts (lock acquired, runtime written),
    // so it proves the real workbench dev orchestration ran — not just a build.
    await session.waitForText(
      new RegExp(
        String.raw`Workbench dev server started at http://localhost:${port} \(app on port ${port + 1}\)`,
        'i',
      ),
      {timeout: 90_000},
    )

    // `getOutput()` keeps ANSI codes; neither the host URL nor the app-port label
    // is split by color escapes, so assert them on the raw buffer too.
    const output = session.getOutput()
    expect(output).toContain(`http://localhost:${port}`)
    expect(output).toContain(`app on port ${port + 1}`)

    session.sendControl('c')
    await session.waitForExit(15_000).catch(() => session.kill())
  })
})

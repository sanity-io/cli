import {testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {runCli} from '../../helpers/runCli.js'

// `sanity dev` starts a long-running server, so these drive it through the PTY
// transport: wait for the ready line, prove the server actually serves the
// studio/app over HTTP, then Ctrl+C. No auth/API is involved — the dev server
// only serves the local studio/app, so a placeholder token is enough.
//
// These double as the inverse workbench guard: a plain (non-`unstable_defineApp`)
// project must serve on the *configured* port. If a gating regression started the
// workbench host, the studio/app would be pushed to port+1 — and the studio's
// "running at" line suppressed in favour of "Workbench dev server started…" — so
// the port-pinned `ready` assertion would time out instead of matching.
describe('sanity dev', {timeout: 120_000}, () => {
  test.each([
    {fixture: 'basic-studio', kind: 'studio', port: 9330, rootMarker: /id="sanity"/},
    {fixture: 'basic-app', kind: 'app', port: 9331, rootMarker: /id="root"|id="sanity"/},
  ])(
    'serves the $fixture dev server on the configured port and shuts down on Ctrl+C',
    async ({fixture, kind, port, rootMarker}) => {
      const cwd = await testFixture(fixture)
      const session = await runCli({
        args: ['dev', '--port', String(port)],
        cwd,
        interactive: true,
      })

      // Studios log the full URL; apps log the port. Pinning the configured port
      // (rather than `\d+`) is what makes this fail if the workbench host took over
      // and pushed the server to port+1 — see the file header.
      const ready =
        kind === 'studio'
          ? new RegExp(String.raw`running at http://localhost:${port}/`, 'i')
          : new RegExp(String.raw`dev server started on port ${port}`, 'i')
      await session.waitForText(ready, {timeout: 90_000})

      const res = await fetch(`http://localhost:${port}/`)
      expect(res.status).toBe(200)
      expect(await res.text()).toMatch(rootMarker)

      session.sendControl('c')
      // Ctrl+C should tear the server down; kill as a fallback if it's swallowed.
      await session.waitForExit(15_000).catch(() => session.kill())
    },
  )
})

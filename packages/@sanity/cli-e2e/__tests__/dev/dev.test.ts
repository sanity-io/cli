import {testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {runCli} from '../../helpers/runCli.js'

// `sanity dev` starts a long-running server, so these drive it through the PTY
// transport: wait for the ready line, prove the server actually serves the shell
// over HTTP, then Ctrl+C. No auth/API is involved — the dev server only serves the
// local studio/app, so a placeholder token is enough.
describe('sanity dev', {timeout: 120_000}, () => {
  test.each([
    {
      fixture: 'basic-studio',
      port: 9330,
      // Studios log the full URL once Vite is ready.
      ready: /running at http:\/\/localhost:\d+/i,
      // The studio mounts into this root element.
      rootMarker: /id="sanity"/,
    },
    {
      fixture: 'basic-app',
      port: 9331,
      ready: /dev server started on port \d+/i,
      rootMarker: /id="root"|id="sanity"/,
    },
  ])(
    'serves the $fixture dev server over HTTP and shuts down on Ctrl+C',
    async ({fixture, port, ready, rootMarker}) => {
      const cwd = await testFixture(fixture)
      const session = await runCli({
        args: ['dev', '--port', String(port)],
        cwd,
        interactive: true,
      })

      await session.waitForText(ready, {timeout: 90_000})

      // Read the actual port from the output — apps fall back to the next free
      // port when the requested one is taken, so we don't assume it stayed `port`.
      const url =
        session.getOutput().match(/http:\/\/localhost:\d+/)?.[0] ?? `http://localhost:${port}`

      const res = await fetch(`${url}/`)
      expect(res.status).toBe(200)
      expect(await res.text()).toMatch(rootMarker)

      session.sendControl('c')
      // Ctrl+C should tear the server down; kill as a fallback if it's swallowed.
      await session.waitForExit(15_000).catch(() => session.kill())
    },
  )
})

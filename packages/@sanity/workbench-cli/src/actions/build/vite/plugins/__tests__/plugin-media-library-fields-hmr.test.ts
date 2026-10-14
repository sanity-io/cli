import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'

import {describe, expect, test, vi} from 'vitest'

import {
  FIELDS_HMR_ACK_MS,
  FIELDS_HMR_LOGGED_PATH_RE,
  fieldsHmrReloadUnlessAckSnippet,
  isFieldsHmrLoggedPath,
  isViteClientModuleId,
  MEDIA_LIBRARY_FIELDS_HMR_ACK,
  MEDIA_LIBRARY_FIELDS_HMR_EVENT,
  mediaLibraryFieldsHmrPlugin,
  VITE_HOT_UPDATED_LOG,
  withViteClientFieldsHmr,
} from '../plugin-media-library-fields-hmr.js'

describe('mediaLibraryFieldsHmrPlugin', () => {
  test('is serve-only and transforms only the Vite client', () => {
    const plugin = mediaLibraryFieldsHmrPlugin()
    expect(plugin.apply).toBe('serve')

    // Vite types `transform` as ObjectHook (function | {handler}); unwrap so tsc can call it.
    const transform = plugin.transform
    const transformHook = typeof transform === 'function' ? transform : transform?.handler

    const client = transformHook?.call(
      undefined as never,
      VITE_HOT_UPDATED_LOG,
      '/x/vite/dist/client/client.mjs',
    )
    const clientCode =
      client && typeof client === 'object' && 'code' in client ? client.code : undefined
    expect(clientCode).toContain(MEDIA_LIBRARY_FIELDS_HMR_ACK)
    expect(clientCode).toContain(String(FIELDS_HMR_ACK_MS))

    const other = transformHook?.call(
      undefined as never,
      VITE_HOT_UPDATED_LOG,
      '/apps/ml-sdk/src/fields/notes.tsx',
    )
    expect(other).toBeNull()
  })
})

describe('withViteClientFieldsHmr', () => {
  test('pings the host and schedules a reload unless the host ACKs', () => {
    const source = `${VITE_HOT_UPDATED_LOG}\n`
    const next = withViteClientFieldsHmr(source)
    expect(next).toContain(MEDIA_LIBRARY_FIELDS_HMR_EVENT)
    expect(next).toContain(MEDIA_LIBRARY_FIELDS_HMR_ACK)
    expect(next).toContain('window.location.reload()')
    expect(next).toContain(`/${FIELDS_HMR_LOGGED_PATH_RE.source}/`)
    // Same-window dispatch only: a cross-origin parent throws on dispatchEvent.
    expect(next).not.toContain('window.parent.dispatchEvent')
    expect(withViteClientFieldsHmr(next)).toBe(next)
  })

  test('arms the ACK timeout on this window without touching window.parent', () => {
    const setTimeout = vi.fn().mockReturnValue(1)
    const fakeWindow = {
      addEventListener: vi.fn(),
      clearTimeout: vi.fn(),
      setTimeout,
    }
    // oxlint-disable-next-line no-new-func -- executes the injected client snippet in isolation
    new Function('window', fieldsHmrReloadUnlessAckSnippet())(fakeWindow)
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), FIELDS_HMR_ACK_MS)
    expect(fakeWindow.addEventListener).toHaveBeenCalledWith(
      MEDIA_LIBRARY_FIELDS_HMR_ACK,
      expect.any(Function),
    )
  })

  test("matches the installed Vite client's hot-updated log line", () => {
    // Byte-for-byte guard: a Vite bump that rewrites the log line must land
    // here, or the injected ping silently stops firing in config-app dev.
    const require = createRequire(import.meta.url)
    const clientPath = require.resolve('vite/dist/client/client.mjs')
    expect(readFileSync(clientPath, 'utf8')).toContain(VITE_HOT_UPDATED_LOG)
  })
})

describe('isViteClientModuleId', () => {
  test("matches Vite's browser HMR client", () => {
    expect(isViteClientModuleId('/@vite/client')).toBe(true)
    expect(isViteClientModuleId('/x/vite/dist/client/client.mjs')).toBe(true)
    expect(isViteClientModuleId('/x/vite/dist/client/client.mjs?v=1')).toBe(true)
    expect(isViteClientModuleId('/apps/ml-sdk/src/fields/notes.tsx')).toBe(false)
  })
})

describe('isFieldsHmrLoggedPath', () => {
  test('matches the paths Vite logs for field HMR', () => {
    expect(isFieldsHmrLoggedPath('/src/fields/geolocation.tsx')).toBe(true)
    expect(isFieldsHmrLoggedPath('/.sanity/federation/configs/installation_config.js')).toBe(true)
    expect(isFieldsHmrLoggedPath('/src/App.tsx')).toBe(false)
  })
})

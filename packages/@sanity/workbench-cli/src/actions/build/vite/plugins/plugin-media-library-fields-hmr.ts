// Local-dev HMR for Media Library config apps (ported from the Media Library
// repo's @repo/media-library-config, which previously injected this by
// transforming the CLI's generated self-accept).
//
// The generated `installation_config` module accepts its own hot updates and
// forwards the fresh namespace to the Media Library host on a window event
// (see `configArtifacts`) — the host loads that module once through Module
// Federation and never re-reads it on its own. A host that applies the update
// in place ACKs; otherwise (deployed host, or apply failed) the config app's
// Vite client full-reloads after a short timeout so the first ESM evaluation
// is discarded. This plugin injects that ping + reload-unless-ACK fallback
// next to the Vite client's own `hot updated` log line.

import {type Plugin} from 'vite'

/** Window event the Media Library host listens for. Must match the host's `MEDIA_LIBRARY_FIELDS_HMR_EVENT`. */
export const MEDIA_LIBRARY_FIELDS_HMR_EVENT = 'sanity:media-library-fields-hmr'

/** The host dispatches this after applying the new field module; cancels the reload. */
export const MEDIA_LIBRARY_FIELDS_HMR_ACK = 'sanity:media-library-fields-hmr-ack'

/** Wait for the host to ACK in-page HMR before falling back to a full reload. */
export const FIELDS_HMR_ACK_MS = 500

/** Byte-for-byte match of Vite 8's `hot updated` log; a Vite bump that changes it must fail tests. */
export const VITE_HOT_UPDATED_LOG = 'this.logger.debug(`hot updated: ${loggedPath}`);'

/** Vite `loggedPath` values that should ping the host. Shared with the injected client snippet. */
export const FIELDS_HMR_LOGGED_PATH_RE = /installation_config|(?:^|\/)src\/fields\//

export function isViteClientModuleId(id: string): boolean {
  const modulePath = id.split('?', 1)[0] ?? id
  return (
    modulePath.endsWith('/@vite/client') ||
    modulePath.includes('/vite/dist/client/client.mjs') ||
    modulePath.endsWith('/client/client.mjs')
  )
}

export function isFieldsHmrLoggedPath(loggedPath: string): boolean {
  return FIELDS_HMR_LOGGED_PATH_RE.test(loggedPath)
}

/**
 * Injected into the config-app Vite client: reload unless the host ACKs.
 * Shared timer so field-module + installation_config logs don't stack two
 * reloads.
 */
export function fieldsHmrReloadUnlessAckSnippet(): string {
  return `window.clearTimeout(window.__mlFieldsHmrReload);
					window.__mlFieldsHmrReload = window.setTimeout(function () { window.location.reload() }, ${FIELDS_HMR_ACK_MS});
					if (!window.__mlFieldsHmrAckBound) {
						window.__mlFieldsHmrAckBound = true;
						window.addEventListener('${MEDIA_LIBRARY_FIELDS_HMR_ACK}', function () {
							window.clearTimeout(window.__mlFieldsHmrReload);
						});
					}`
}

/**
 * Next to Vite's `hot updated` log: ping the host and start the ACK timeout.
 * The event here carries no payload — the fresh module namespace travels on
 * the `installation_config` accept (see `configArtifacts`). Dispatched on this
 * window only: a cross-origin parent throws SecurityError on dispatchEvent,
 * and nothing in the shell listens for it.
 */
export function withViteClientFieldsHmr(code: string): string {
  if (code.includes(MEDIA_LIBRARY_FIELDS_HMR_ACK) || !code.includes(VITE_HOT_UPDATED_LOG)) {
    return code
  }
  return code.replace(
    VITE_HOT_UPDATED_LOG,
    `${VITE_HOT_UPDATED_LOG}
				if (/${FIELDS_HMR_LOGGED_PATH_RE.source}/.test(loggedPath)) {
					const __mlFieldsHmr = new CustomEvent('${MEDIA_LIBRARY_FIELDS_HMR_EVENT}')
					window.dispatchEvent(__mlFieldsHmr)
					${fieldsHmrReloadUnlessAckSnippet()}
				}`,
  )
}

/**
 * Dev-only: forward field-module HMR to the Media Library host; full-reload
 * if it does not ACK.
 */
export function mediaLibraryFieldsHmrPlugin(): Plugin {
  return {
    apply: 'serve',
    name: 'sanity/media-library-fields-hmr',
    transform(code, id) {
      if (!isViteClientModuleId(id)) return null
      const next = withViteClientFieldsHmr(code)
      return next === code ? null : {code: next, map: null}
    },
  }
}

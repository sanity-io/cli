import {parse as parseHtml} from 'node-html-parser'

export const DEFERRED_MODULE_SCRIPT_TYPE = 'sanity/deferred-module'

export const DEFERRED_MODULEPRELOAD_REL = 'sanity-deferred-modulepreload'

export const ENTRY_SCRIPT_ATTRIBUTE = 'data-sanity-entry'

/**
 * Makes module scripts and modulepreloads inert until the loader commits its import map;
 * browsers ignore a map that arrives after a module fetch has started.
 *
 * @internal
 */
export function deferModuleScripts(
  html: string,
  options: {entryPath: string; onEntryNotFound?: () => void},
): string {
  const root = parseHtml(html, {comment: true})
  let entryMatched = false

  for (const script of root.querySelectorAll('script[type="module"]')) {
    script.setAttribute('type', DEFERRED_MODULE_SCRIPT_TYPE)
    if (script.getAttribute('src') === options.entryPath) {
      script.setAttribute(ENTRY_SCRIPT_ATTRIBUTE, '')
      entryMatched = true
    }
  }

  for (const link of root.querySelectorAll('link[rel="modulepreload"]')) {
    link.setAttribute('rel', DEFERRED_MODULEPRELOAD_REL)
  }

  if (entryMatched === false) options.onEntryNotFound?.()

  return root.toString()
}

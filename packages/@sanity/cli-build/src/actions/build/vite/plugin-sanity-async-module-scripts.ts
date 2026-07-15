import {type Plugin} from 'vite'

/**
 * Ensures every `type="module"` script in HTML is marked `async`.
 *
 * Vite warns and falls back to defer when module scripts mix async and defer.
 * Sanity's bridge script is intentionally async; `@vitejs/plugin-react` injects
 * a react-refresh preamble without `async` under `experimental.bundledDev`.
 * Aligning all module scripts to async silences that warning.
 *
 * @internal
 */
export function sanityAsyncModuleScriptsPlugin(): Plugin {
  return {
    name: 'sanity/async-module-scripts',
    transformIndexHtml: {
      handler(html) {
        return html.replaceAll(/<script\b([^>]*)>/gi, (tag, attrs: string) => {
          if (!/\btype\s*=\s*(["']?)module\1/i.test(attrs) || /\basync\b/i.test(attrs)) {
            return tag
          }
          return `<script async${attrs ? ` ${attrs.trimStart()}` : ''}>`
        })
      },
      // Run after `@vitejs/plugin-react`'s `order: 'pre'` preamble injection so
      // the react-refresh script is rewritten too.
      order: 'pre',
    },
  }
}

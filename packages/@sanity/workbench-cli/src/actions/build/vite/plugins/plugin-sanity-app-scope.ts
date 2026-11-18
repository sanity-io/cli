import postcss from 'postcss'
import {type Plugin} from 'vite'

import {scopeAppCss} from '../app-scope-css.js'

const CSS = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/
const NOT_APPLIED = /[?&](inline|raw|url)\b/

/**
 * Keeps an app's root styles working in the Dashboard. The render harness stamps the element the app
 * renders into with `__SANITY_APP_SCOPE__`, the app's slug, and the Dashboard uses that stamp to find
 * the app's portals too.
 */
export function sanityAppScope(slug: string): Plugin {
  const define = {__SANITY_APP_SCOPE__: JSON.stringify(slug)}

  /**
   * Every stylesheet the app applies is rewritten after Vite's own CSS processing and before it's
   * bundled or injected, so one hook covers both dev and build. CSS imported as text or a URL isn't
   * applied through the page, so it stays as it is.
   */
  return {
    config: () => ({define, optimizeDeps: {rolldownOptions: {transform: {define}}}}),
    name: 'sanity/workbench/app-scope',
    transform: {
      filter: {id: {exclude: NOT_APPLIED, include: CSS}},
      async handler(code, id) {
        const result = await postcss([
          {Once: (root) => scopeAppCss(root, slug), postcssPlugin: 'sanity-app-scope'},
        ]).process(code, {from: id, map: {annotation: false, inline: false}})

        return {code: result.css, map: result.map.toString()}
      },
    },
  }
}

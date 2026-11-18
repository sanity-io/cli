import postcss from 'postcss'
import {type Plugin} from 'vite'

import {scopeAppCss} from '../app-scope-css.js'

const CSS = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/
const NOT_APPLIED = /[?&](inline|raw|url)\b/
const CLIENT_WRAPPER = '\u0000sanity-app-scope/react-dom-client'
const CLIENT_WRAPPER_CODE = `
import * as client from 'react-dom/client'
export * from 'react-dom/client'
function scope(container) {
  if (container instanceof Element && !container.hasAttribute('data-app-scope')) {
    container.setAttribute('data-app-scope', __SANITY_APP_SCOPE__)
    container.setAttribute('data-app-portal', '')
  }
}
export function createRoot(container, options) {
  scope(container)
  return client.createRoot(container, options)
}
export function hydrateRoot(container, ...rest) {
  scope(container)
  return client.hydrateRoot(container, ...rest)
}
export default {...client, createRoot, hydrateRoot}
`

/**
 * Scopes an app's CSS to its own islands and portals, so its rules don't reach the Dashboard or other
 * apps. The render harness stamps the element it renders into with `__SANITY_APP_SCOPE__`.
 */
export function sanityAppScope(slug: string): Plugin[] {
  const define = {__SANITY_APP_SCOPE__: JSON.stringify(slug)}

  /**
   * A React root the app creates outside its island still belongs to the app, so the app's
   * `react-dom/client` imports go through a wrapper that stamps the root's container with the scope.
   * The harness stamps its own root first, which the wrapper leaves alone. Federation resolves shared
   * imports with `order: 'pre'` too: listed ahead of it, the wrapper resolves first, and its own import
   * still reaches the shared module. Federation's modules provide the copy other apps may share, so they
   * get no wrapper.
   */
  const reactRoots: Plugin = {
    enforce: 'pre',
    load: (id) => (id === CLIENT_WRAPPER ? CLIENT_WRAPPER_CODE : undefined),
    name: 'sanity/workbench/app-scope-roots',
    resolveId: {
      handler: (source, importer) =>
        source === 'react-dom/client' &&
        importer !== CLIENT_WRAPPER &&
        !importer?.includes('__mfe_internal__')
          ? CLIENT_WRAPPER
          : undefined,
      order: 'pre',
    },
  }

  /**
   * Every stylesheet the app applies is rewritten after Vite's own CSS processing and before it's
   * bundled or injected, so one hook covers both dev and build. CSS imported as text or a URL isn't
   * applied through the page, so it stays as it is.
   */
  const stylesheets: Plugin = {
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

  return [reactRoots, stylesheets]
}

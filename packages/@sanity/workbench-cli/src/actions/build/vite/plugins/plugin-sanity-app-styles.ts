import {type Plugin} from 'vite'

/** Marks the elements an app inserts, as Workbench marks app iframes. */
const APP_ID_ATTRIBUTE = 'data-application-id'

/**
 * The Vite runtime modules that insert an app's stylesheets into the page, and
 * the call that creates each element. Vite has no hook for these elements, so
 * the call is the anchor: it names no local variables, so it survives more
 * Vite releases than a statement around it would.
 */
const INSERTERS = [
  // Production: `__vitePreload` links the CSS of every dynamic import, such as
  // the remote entry's. Each app bundles its own copy of the helper.
  {create: 'document.createElement("link")', id: /^\0vite\/preload-helper\.js$/},
  // `sanity dev`: each app's server has its own client, which injects every CSS
  // module as a `<style data-vite-dev-id>`. The client adopts an existing
  // element with the same id instead of creating one, so two apps that import
  // the same CSS file share the first app's element and attribute.
  {create: 'document.createElement("style")', id: /\/vite\/dist\/client\/client\.mjs$/},
]

/**
 * Tag every stylesheet element the app's own bundle inserts with the app id,
 * so Workbench can switch an app's CSS off while the app is off stage.
 * The render harness tags shared styled-components' sheets; a local copy
 * (all of `sanity dev`, or a build with sharing off) writes untagged sheets.
 */
export function sanityAppStyles(appId: string): Plugin {
  const tagged = (create: string) =>
    `((el) => (el.setAttribute(${JSON.stringify(APP_ID_ATTRIBUTE)}, ${JSON.stringify(appId)}), el))(${create})`

  return {
    name: 'sanity/workbench/app-styles',
    transform: {
      filter: {id: INSERTERS.map(({id}) => id)},
      handler(code, id) {
        const {create} = INSERTERS.find((inserter) => inserter.id.test(id))!
        // A Vite upgrade that drops the anchor would leave every stylesheet untagged.
        if (!code.includes(create)) {
          this.error(`Could not find \`${create}\` in ${id} to tag the app's stylesheets`)
        }
        // Same-line edits keep the line mappings intact.
        return {code: code.replaceAll(create, tagged(create)), map: null}
      },
    },
  }
}

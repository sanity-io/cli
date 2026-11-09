import {type Plugin} from 'vite'

const APP_ID_ATTRIBUTE = JSON.stringify('data-application-id')

/**
 * Tag every stylesheet element the app's own bundle inserts with the app id,
 * so Workbench can switch an app's CSS off while the app is off stage.
 */
export function sanityAppStyles(appId: string): Plugin {
  const id = JSON.stringify(appId)
  const tagged = (create: string) =>
    `((el) => (el.setAttribute(${APP_ID_ATTRIBUTE}, ${id}), el))(${create})`
  const owned = (element: string) => `${element}.getAttribute(${APP_ID_ATTRIBUTE}) === ${id}`

  const inserters = [
    {
      edits: [
        ['document.createElement("link")', tagged('document.createElement("link")')],
        ['link.rel === "stylesheet"', `link.rel === "stylesheet" && ${owned('link')}`],
      ],
      id: /^\0vite\/preload-helper\.js$/,
    },
    {
      edits: [
        ['document.createElement("style")', tagged('document.createElement("style")')],
        [
          'document.querySelectorAll("style[data-vite-dev-id]")',
          `Array.from(document.querySelectorAll("style[data-vite-dev-id]")).filter((el) => ${owned('el')})`,
        ],
      ],
      id: /\/vite\/dist\/client\/client\.mjs$/,
    },
  ]

  return {
    name: 'sanity/workbench/app-styles',
    transform: {
      filter: {id: inserters.map((inserter) => inserter.id)},
      handler(code, moduleId) {
        const {edits} = inserters.find((inserter) => inserter.id.test(moduleId))!
        let result = code
        for (const [anchor, replacement] of edits) {
          if (!result.includes(anchor)) {
            this.error(`Could not find \`${anchor}\` in ${moduleId} to tag the app's stylesheets`)
          }
          result = result.replaceAll(anchor, replacement)
        }
        return {code: result, map: null}
      },
    },
  }
}

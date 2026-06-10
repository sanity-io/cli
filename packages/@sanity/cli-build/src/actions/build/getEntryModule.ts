const entryModule = `
// This file is auto-generated on 'sanity dev'
// Modifications to this file is automatically discarded
import {renderStudio} from "sanity"
import studioConfig from %STUDIO_CONFIG_LOCATION%

renderStudio(
  document.getElementById("sanity"),
  studioConfig,
  {reactStrictMode: %STUDIO_REACT_STRICT_MODE%, basePath: %STUDIO_BASE_PATH%}
)
`

const noConfigEntryModule = `
// This file is auto-generated on 'sanity dev'
// Modifications to this file is automatically discarded
import {renderStudio} from "sanity"

const studioConfig = {missingConfigFile: true}

renderStudio(
  document.getElementById("sanity"),
  studioConfig,
  {reactStrictMode: %STUDIO_REACT_STRICT_MODE%, basePath: %STUDIO_BASE_PATH%}
)
`

const appEntryModule = `
// This file is auto-generated on 'sanity dev'
// Modifications to this file is automatically discarded
import {createRoot} from 'react-dom/client'
import {createElement} from 'react'
import App from %ENTRY%

const root = createRoot(document.getElementById('root'))
const element = createElement(App)
root.render(element)
`

// A branded app with no \`entry\` (sanity-io/workbench spec 002-workbench-extension-api, US5) has no navigable app view, so there's no
// \`App\` to import or render standalone — it contributes panels/services to the
// workbench instead. The page stays valid (no broken import) for the dev server.
const noAppViewEntryModule = `
// This file is auto-generated on 'sanity dev'
// Modifications to this file is automatically discarded
const root = document.getElementById('root')
if (root) {
  root.textContent = 'This application has no app view.'
}
`

export function getEntryModule(options: {
  basePath?: string
  entry?: string | null
  isApp?: boolean
  reactStrictMode: boolean
  relativeConfigLocation: string | null
}): string {
  const {basePath, entry, isApp, reactStrictMode, relativeConfigLocation} = options

  if (isApp) {
    return entry ? appEntryModule.replace(/%ENTRY%/, JSON.stringify(entry)) : noAppViewEntryModule
  }

  const sourceModule = relativeConfigLocation ? entryModule : noConfigEntryModule

  return sourceModule
    .replace(/%STUDIO_REACT_STRICT_MODE%/, JSON.stringify(Boolean(reactStrictMode)))
    .replace(/%STUDIO_CONFIG_LOCATION%/, JSON.stringify(relativeConfigLocation))
    .replace(/%STUDIO_BASE_PATH%/, JSON.stringify(basePath || '/'))
}

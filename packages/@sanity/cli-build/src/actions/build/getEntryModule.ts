import {RESOURCE_BINDINGS_ENTRY_IMPORT} from '@sanity/workbench-cli/build'

const entryModule = `
// This file is auto-generated on 'sanity dev'
// Modifications to this file is automatically discarded
%RESOURCE_BINDINGS_IMPORT%import {renderStudio} from "sanity"
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
%RESOURCE_BINDINGS_IMPORT%import {renderStudio} from "sanity"

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
%RESOURCE_BINDINGS_IMPORT%import {createRoot} from 'react-dom/client'
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
%RESOURCE_BINDINGS_IMPORT%const root = document.getElementById('root')
if (root) {
  root.textContent = 'This application has no app view.'
}
`

export function getEntryModule(options: {
  basePath?: string
  entry?: string
  isApp?: boolean
  isBlueprints?: boolean
  reactStrictMode: boolean | undefined
  relativeConfigLocation: string | null
}): string {
  const {basePath, entry, isApp, isBlueprints, reactStrictMode, relativeConfigLocation} = options

  // Under Blueprints the entry statically imports the resource-bindings module
  // first (writeSanityRuntime emits it); otherwise the placeholder resolves to
  // nothing so the import — and the module — are absent.
  const withBindings = (module: string): string =>
    module.replace(
      /%RESOURCE_BINDINGS_IMPORT%/,
      isBlueprints ? `${RESOURCE_BINDINGS_ENTRY_IMPORT}\n` : '',
    )

  if (isApp) {
    return withBindings(
      entry ? appEntryModule.replace(/%ENTRY%/, JSON.stringify(entry)) : noAppViewEntryModule,
    )
  }

  const sourceModule = relativeConfigLocation ? entryModule : noConfigEntryModule

  return withBindings(
    sourceModule
      .replace(
        /%STUDIO_REACT_STRICT_MODE%/,
        reactStrictMode === undefined ? 'undefined' : JSON.stringify(reactStrictMode),
      )
      .replace(/%STUDIO_CONFIG_LOCATION%/, JSON.stringify(relativeConfigLocation))
      .replace(/%STUDIO_BASE_PATH%/, JSON.stringify(basePath || '/')),
  )
}

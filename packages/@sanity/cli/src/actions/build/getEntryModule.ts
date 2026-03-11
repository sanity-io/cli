import {type AppResource} from '@sanity/cli-core'

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
import {createElement} from 'react'
import {renderSanityApp} from '@sanity/sdk-react'
import App from %ENTRY%

const resources = %RESOURCES%
const options = {
  reactStrictMode: %REACT_STRICT_MODE%
}

renderSanityApp(
  document.getElementById('root'),
  resources,
  options,
  createElement(App)
)
`

export function getEntryModule(options: {
  appResources?: Record<string, AppResource>
  basePath?: string
  entry?: string
  isApp?: boolean
  reactStrictMode: boolean
  relativeConfigLocation: string | null
}): string {
  const {appResources, basePath, entry, isApp, reactStrictMode, relativeConfigLocation} = options

  if (isApp) {
    return appEntryModule
      .replace(/%ENTRY%/, JSON.stringify(entry || './src/App'))
      .replace(/%RESOURCES%/, JSON.stringify(appResources || {}))
      .replace(/%REACT_STRICT_MODE%/, JSON.stringify(Boolean(reactStrictMode)))
  }

  const sourceModule = relativeConfigLocation ? entryModule : noConfigEntryModule

  return sourceModule
    .replace(/%STUDIO_REACT_STRICT_MODE%/, JSON.stringify(Boolean(reactStrictMode)))
    .replace(/%STUDIO_CONFIG_LOCATION%/, JSON.stringify(relativeConfigLocation))
    .replace(/%STUDIO_BASE_PATH%/, JSON.stringify(basePath || '/'))
}

import path from 'node:path'

import {type ModuleFederationOptions} from '@module-federation/vite'
import {type PackageJson} from '@sanity/cli-core/types'
import {type PluginOption} from 'vite'

import {type WorkbenchExposes} from '../../../resolveWorkbenchApp.js'
import {artifactExposes, workbenchArtifacts} from '../artifact.js'
import {FEDERATION_FILE_NAME, RUNTIME_DIR} from './constants.js'
import {type FederationOptions, sanityModuleFederation} from './plugins/plugin-module-federation.js'
import {sanityEnvironmentPlugin} from './plugins/plugin-sanity-environment.js'
import {sanityExtensionArtifacts} from './plugins/plugin-sanity-extension-artifacts.js'
import {
  type FederationRuntimeOptions,
  sanityFederationRuntime,
} from './plugins/plugin-sanity-federation-runtime.js'

interface FederationPluginOptionsBase extends Omit<Partial<FederationOptions>, 'exposes'> {
  exposes?: WorkbenchExposes
  pkgJson?: PackageJson
  /**
   * Current working directory to read package.json from, defaults to process.cwd()
   */
  workDir?: string
}

interface AppFederationPluginOptions extends FederationPluginOptionsBase {
  isApp: true

  /**
   * Relative path to the App entry from the runtime directory, e.g.
   * `../../src/App.tsx`. Omit it for a dock-only app that declares no `entry`:
   * no `./App` is exposed and the remote serves only its views.
   */
  appEntry?: string
  studioConfigPath?: never
}

interface StudioFederationPluginOptions extends FederationPluginOptionsBase {
  /** relative path to the Studio config file from the runtime directory (e.g. `../../sanity.config.ts`). */
  studioConfigPath: string

  appEntry?: never
  /** @defaultValue false */
  isApp?: false
}

/**
 * Plugin options for the federation vite plugin.
 *
 * Discriminated on `isApp`:
 * - `isApp: true`  → requires `appEntry`
 * - `isApp: false` (default) → requires `studioConfigPath`
 *
 * @internal
 */
type FederationPluginOptions = AppFederationPluginOptions | StudioFederationPluginOptions

/**
 * @internal
 */
export const federation = (options: FederationPluginOptions): PluginOption => {
  const {exposes, name: defaultName, pkgJson, workDir = process.cwd()} = options

  let name = defaultName

  if (!name) {
    name = pkgJson?.name
  }

  if (!name) {
    throw new Error('"name" option is required but could not be inferred from package.json')
  }

  const generatedEntry = `./${RUNTIME_DIR}/${FEDERATION_FILE_NAME}.jsx`

  function resolveEntryPath(entry: string) {
    const resolvedPath = path.resolve(workDir, entry)

    if (!resolvedPath) {
      throw new Error(
        `Could not resolve path for entry "${entry}". Please check that the file exists and the path is correct.`,
      )
    }

    return resolvedPath
  }

  const entryPath = resolveEntryPath(generatedEntry)

  // Each view component (`./views/<view>/<component>`) and each service loader
  // (`./services/<name>`) is exposed straight to the host, pointing at the file
  // the extension-artifacts plugin generates under RUNTIME_DIR. A service's
  // worker bundle carries no expose — the host reaches it through its loader.
  const artifacts = workbenchArtifacts(exposes ?? {})
  const artifactModuleExposes = artifactExposes(artifacts, (artifactPath) =>
    resolveEntryPath(`./${RUNTIME_DIR}/${artifactPath}`),
  )

  // A dock-only app (`isApp` with no `appEntry`) has no navigable full-page
  // view, so it exposes no `./App` — only its views. Studios and apps with an
  // entry expose `./App` (the generated render entry).
  const exposesApp = !options.isApp || options.appEntry !== undefined

  const federationExposes: NonNullable<ModuleFederationOptions['exposes']> = {
    ...(exposesApp ? {'./App': entryPath} : {}),
    ...artifactModuleExposes,
  }

  const runtimeOptions: FederationRuntimeOptions = options.isApp
    ? {appEntry: options.appEntry, isApp: true}
    : {isApp: false, studioConfigPath: options.studioConfigPath}

  return [
    sanityEnvironmentPlugin({input: entryPath}),
    sanityFederationRuntime(runtimeOptions),
    sanityExtensionArtifacts({artifacts}),
    sanityModuleFederation({exposes: federationExposes, name}),
  ]
}

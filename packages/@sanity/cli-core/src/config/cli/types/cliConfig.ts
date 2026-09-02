import {type PluginOptions as BabelReactCompilerOptions} from 'babel-plugin-react-compiler'
import {type ReactCompilerOptions as OxcReactCompilerOptions} from 'oxc-transform-react'

import {type UserViteConfig} from './userViteConfig'

/**
 * An optional peer dependency's options type, or `unknown` when the peer's
 * typings did not resolve.
 *
 * `babel-plugin-react-compiler` and `oxc-transform-react` are optional peer
 * dependencies, so the type-only imports above only resolve in projects that
 * install them. When one is missing, TypeScript degrades its import to `any`
 * (the unresolved-module error is suppressed inside declaration files under
 * `skipLibCheck`), and intersecting `any` into a {@link ReactCompilerConfig}
 * branch would collapse the whole union to `any` — silently disabling type
 * checking of the `reactCompiler` option, including for the compiler that IS
 * installed. Mapping a missing peer's options to `unknown` (the identity
 * under intersection) instead reduces that branch to just its `transform`
 * discriminator, keeping the other branch fully checked.
 *
 * `unknown extends T` is only true when `T` degraded to `any`/`unknown`;
 * resolved options types pass through untouched. (`0 extends 1 & T` — the
 * usual any-detector — does not work here: an unresolved import produces the
 * checker's error type, which that intersection propagates.)
 */
type OptionalPeerOptions<T> = unknown extends T ? unknown : T

/**
 * Configuration for React Compiler.
 *
 * The `transform` field selects which React Compiler transform to run; the
 * remaining options are passed to the selected transform:
 *
 * - `'babel'` (default) - the Babel plugin
 *   ({@link https://www.npmjs.com/package/babel-plugin-react-compiler | babel-plugin-react-compiler}
 *   must be installed in your project)
 * - `'oxc'` (experimental) - the native Rust port
 *   ({@link https://www.npmjs.com/package/oxc-transform-react | oxc-transform-react}
 *   must be installed in your project)
 *
 * Each branch's options are only type-checked when the corresponding package
 * is installed; a missing package reduces its branch to just the `transform`
 * discriminator.
 *
 * @public
 */
export type ReactCompilerConfig =
  | (OptionalPeerOptions<BabelReactCompilerOptions> & {transform?: 'babel'})
  | (OptionalPeerOptions<OxcReactCompilerOptions> & {transform: 'oxc'})

export interface TypeGenConfig {
  formatGeneratedCode: boolean
  generates: string
  overloadClientMethods: boolean
  path: string | string[]
  schema: string
}

/**
 * Dashboard visibility an application can declare. Mirrors Brett's canonical
 * `VISIBILITIES` — the source of truth lives in the application service.
 * @public
 */
export const APP_VISIBILITIES = ['default', 'unlisted', 'disabled'] as const
/** @public */
export type AppVisibility = (typeof APP_VISIBILITIES)[number]

/**
 * @public
 */
export interface CliConfig {
  /** The project ID and dataset the Sanity CLI should use to run its commands */
  api?: {
    dataset?: string
    projectId?: string
  }

  /** Configuration for custom Sanity apps built with the App SDK */
  app?: {
    /** The entrypoint for your custom app. By default, `src/App.tsx` */
    entry?: string
    /**
     * Path to an icon file relative to project root.
     * The file must be an SVG.
     */
    icon?: string
    /** @deprecated Use deployment.appId */
    id?: string
    /** The ID for the Sanity organization that manages this application */
    organizationId?: string
    /** The title of the custom app, as it is seen in Dashboard UI */
    title?: string
    /** Dashboard visibility of the application. Defaults to `default`. */
    visibility?: AppVisibility
  }

  /** @deprecated Use deployment.autoUpdates */
  autoUpdates?: boolean

  /** Options for custom app and Studio deployments */
  deployment?: {
    /**
     * The ID for your custom app or Studio. Generated when deploying your app or Studio for the first time.
     * Get your app ID by either:
     * 1. Checking the output of `sanity deploy`, or
     * 2. Checking your project’s Studio tab at https://sanity.io/manage
     *
     * @remarks This is required for all custom app deployments, and for Studios opting in to fine grained version control.
     * {@link https://www.sanity.io/docs/studio/latest-version-of-sanity#k0896ed4574b7}
     */
    appId?: string
    /**
     * Enable automatic updates for your Studio or custom app’s Sanity dependencies.
     * {@link https://www.sanity.io/docs/studio/latest-version-of-sanity}
     */
    autoUpdates?: boolean
  }

  /** Define the GraphQL APIs that the CLI can deploy and interact with */
  graphql?: Array<{
    filterSuffix?: string
    generation?: 'gen1' | 'gen2' | 'gen3'
    id?: string
    nonNullDocumentFields?: boolean
    playground?: boolean
    source?: string
    tag?: string
    workspace?: string
  }>

  /** Configuration for the Media Library */
  mediaLibrary?: {
    /** The path to the Media Library aspects directory. When using the CLI to manage aspects, this is the directory they will be read from and written to. */
    aspectsPath?: string
  }

  /** Contains the property `basePath` which lets you change the top-level slug for the Studio. You typically need to set this if you embed the Studio in another application where it is one of many routes. Defaults to an empty string. */
  project?: {
    basePath?: string
  }

  /**
   * Configuration options for React Compiler. Pass `true` to enable it with
   * the default (babel) transform, or an object to configure it — see
   * {@link ReactCompilerConfig} for choosing between the babel and the
   * experimental oxc transform.
   */
  reactCompiler?: boolean | ReactCompilerConfig

  /** Wraps the Studio in \<React.StrictMode\> root to aid in flagging potential problems related to concurrent features (startTransition, useTransition, useDeferredValue, Suspense). Can also be enabled by setting SANITY_STUDIO_REACT_STRICT_MODE="true"|"false". It only applies to sanity dev in development mode and is ignored in sanity build and in production. Defaults to true. */
  reactStrictMode?: boolean

  /**
   * Configuration for schema extraction (`sanity schema extract`)
   */
  schemaExtraction?: {
    /**
     * Enable schema extraction as part of sanity dev and sanity build
     */
    enabled?: boolean

    /**
     * When true, schema fields marked as required will be non-optional in the output.
     * Defaults to `false`
     */
    enforceRequiredFields?: boolean

    /**
     * Output path for the extracted schema file.
     * Defaults to `schema.json` in the working directory.
     */
    path?: string

    /**
     * Additional glob patterns to watch for schema changes in watch mode.
     * These extend the default patterns:
     * - `sanity.config.{js,jsx,ts,tsx,mjs}`
     * - `schema*\/**\/*.{js,jsx,ts,tsx,mjs}`
     */
    watchPatterns?: string[]

    /**
     * The name of the workspace to generate a schema for. Required if your Sanity project has more than one
     * workspace.
     */
    workspace?: string
  }

  /** Defines the hostname and port that the development server should run on. hostname defaults to localhost, and port to 3333. */
  server?: {
    hostname?: string
    port?: number
  }

  /** @deprecated Use deployment.appId */
  studioHost?: string

  /**
   * Configuration for Sanity typegen
   */
  typegen?: Partial<TypeGenConfig> & {
    /**
     * Enable typegen as part of sanity dev and sanity build.
     * When enabled, types are generated on startup and when files change.
     * Defaults to `false`
     */
    enabled?: boolean
  }

  /**
   * Enable Vite's experimental bundled dev mode for `sanity dev`. This serves bundled
   * files during development, which can speed up startup and reloads for large projects.
   * Defaults to `false`.
   *
   * Unstable: may change or be removed without notice while the underlying Vite
   * feature (`experimental.bundledDev`) is experimental.
   * {@link https://vite.dev/guide/rolldown#full-bundle-mode}
   */
  unstable_bundledDev?: boolean

  /** Exposes the default Vite configuration for custom apps and the Studio so it can be changed and extended. */
  vite?: UserViteConfig
}

/**
 * A raw key-value store for CLI user configuration.
 * Unlike the typed `getCliUserConfig`/`setCliUserConfig`, this operates on
 * arbitrary keys without schema validation.
 *
 * @public
 */
export interface ConfigStore {
  /** Remove a key from the config file. */
  delete: (key: string) => void
  /** Read a value by key. Returns `undefined` if the key does not exist. */
  get: (key: string) => unknown
  /** Write a value by key, merging it into the existing config. */
  set: (key: string, value: unknown) => void
}

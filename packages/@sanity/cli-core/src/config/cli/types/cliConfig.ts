import {type TypeGenConfig} from '@sanity/codegen'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'

import {type UserViteConfig} from './userViteConfig'

/**
 * A named project/dataset resource that the app will access.
 * @public
 */
export interface AppDatasetResource {
  dataset: string
  projectId: string
}

/**
 * A named canvas resource that the app will access.
 * @public
 */
export interface AppCanvasResource {
  canvasId: string
}

/**
 * A named media library resource that the app will access.
 * @public
 */
export interface AppMediaLibraryResource {
  mediaLibraryId: string
}

/**
 * A named app resource that the app will access.
 * @public
 */
export type AppResource = AppCanvasResource | AppDatasetResource | AppMediaLibraryResource

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
    /** The named project/dataset resources that the app will access */
    resources?: Record<string, AppResource>
    /** The title of the custom app, as it is seen in Dashboard UI */
    title?: string
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

  /** Configuration options for React Compiler */
  reactCompiler?: ReactCompilerConfig

  /** Wraps the Studio in \<React.StrictMode\> root to aid in flagging potential problems related to concurrent features (startTransition, useTransition, useDeferredValue, Suspense). Can also be enabled by setting SANITY_STUDIO_REACT_STRICT_MODE="true"|"false". It only applies to sanity dev in development mode and is ignored in sanity build and in production. Defaults to false. */
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

  /** Exposes the default Vite configuration for custom apps and the Studio so it can be changed and extended. */
  vite?: UserViteConfig
}

import type {ConfigEnv, InlineConfig} from 'vite'

export interface GraphQLAPIConfig {
  /**
   * Suffix to use for generated filter types.
   *
   * Optional, Defaults to `Filter`.
   *
   */
  filterSuffix?: string

  /**
   * Generation of API to auto-generate from schema. New APIs should use the latest (`gen3`).
   *
   * Optional, defaults to `gen3`
   */
  generation?: 'gen1' | 'gen2' | 'gen3'

  /**
   * ID of GraphQL API. Only (currently) required when using the `--api` flag
   * for `sanity graphql deploy`, in order to only deploy a specific API.
   */
  id?: string

  /**
   * Define document interface fields (`_id`, `_type` etc) as non-nullable.
   * If you never use a document type as an object (within other documents) in your schema types,
   * you can (and probably should) set this to `true`. Because a document type _could_ be used
   * inside other documents, it is by default set to `false`, as in these cases these fields
   * _can_ be null.
   *
   * Optional, defaults to `false`
   */
  nonNullDocumentFields?: boolean

  /**
   * Whether or not to deploy a "GraphQL Playground" to the API url - an HTML interface that allows
   * running queries and introspecting the schema from the browser. Note that this interface is not
   * secured in any way, but as the schema definition and API route is generally open, this does not
   * expose any more information than is otherwise available - it only makes it more discoverable.
   *
   * Optional, defaults to `true`
   */
  playground?: boolean

  /**
   * Name of source containing the schema to deploy, within the configured workspace
   *
   * Optional, defaults to `default` (eg the one used if no `name` is defined)
   */
  source?: string

  /**
   * API tag for this API - allows deploying multiple different APIs to a single dataset
   *
   * Optional, defaults to `default`
   */
  tag?: string

  /**
   * Name of workspace containing the schema to deploy
   *
   * Optional, defaults to `default` (eg the one used if no `name` is defined)
   */
  workspace?: string
}

/**
 * Until these types are on npm: https://github.com/facebook/react/blob/0bc30748730063e561d87a24a4617526fdd38349/compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Options.ts#L39-L122
 *
 * @beta
 */
export interface ReactCompilerConfig {
  /**
   * The minimum major version of React that the compiler should emit code for. If the target is 19
   * or higher, the compiler emits direct imports of React runtime APIs needed by the compiler. On
   * versions prior to 19, an extra runtime package react-compiler-runtime is necessary to provide
   * a userspace approximation of runtime APIs.
   * @see https://react.dev/learn/react-compiler#using-react-compiler-with-react-17-or-18
   */
  target: '18' | '19'

  compilationMode?: 'all' | 'annotation' | 'infer' | 'syntax'

  panicThreshold?: 'ALL_ERRORS' | 'CRITICAL_ERRORS' | 'NONE'

  /**
   * @see https://react.dev/learn/react-compiler#existing-projects
   */
  sources?: ((filename: string) => boolean) | Array<string> | null
}

export interface CliApiConfig {
  dataset?: string
  projectId?: string
}

export type UserViteConfig =
  | ((config: InlineConfig, env: ConfigEnv) => InlineConfig | Promise<InlineConfig>)
  | InlineConfig

export interface CliConfig {
  api?: CliApiConfig

  autoUpdates?: boolean

  graphql?: GraphQLAPIConfig[]

  project?: {
    basePath?: string
  }

  /**
   * The React Compiler is currently in beta, and is disabled by default.
   * @see https://react.dev/learn/react-compiler
   * @beta
   */
  reactCompiler?: ReactCompilerConfig

  /**
   * Wraps the Studio in `<React.StrictMode>` root to aid flagging potential problems related to concurrent features (`startTransition`, `useTransition`, `useDeferredValue`, `Suspense`)
   * Can also be enabled by setting `SANITY_STUDIO_REACT_STRICT_MODE="true"|"false"`.
   * It only applies to `sanity dev` in dev mode, it's ignored in `sanity build` and in production.
   * Defaults to `false`
   */
  reactStrictMode?: boolean

  server?: {
    hostname?: string
    port?: number
  }

  studioHost?: string

  vite?: UserViteConfig
}

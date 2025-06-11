import {type z} from 'zod'

import {type cliConfigSchema} from './schemas.js'

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

export type CliConfig = z.infer<typeof cliConfigSchema>

import {type ConfigEnv, type InlineConfig} from 'vite'
import {type z} from 'zod'

import {type cliConfigSchema, type reactCompilerSchema} from './schemas.js'

/**
 * Until these types are on npm: https://github.com/facebook/react/blob/0bc30748730063e561d87a24a4617526fdd38349/compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Options.ts#L39-L122
 *
 * @beta
 */
export type ReactCompilerConfig = z.infer<typeof reactCompilerSchema>

export type UserViteConfig =
  | ((config: InlineConfig, env: ConfigEnv) => InlineConfig | Promise<InlineConfig>)
  | InlineConfig

export type CliConfig = z.infer<typeof cliConfigSchema> & {
  vite: UserViteConfig
}

import {type ConfigEnv, type InlineConfig} from 'vite'

/**
 * @public
 */
export type UserViteConfig =
  | ((config: InlineConfig, env: ConfigEnv) => InlineConfig | Promise<InlineConfig>)
  | InlineConfig

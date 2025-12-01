import {type ConfigEnv, type InlineConfig} from 'vite'

export type UserViteConfig =
  | ((config: InlineConfig, env: ConfigEnv) => InlineConfig | Promise<InlineConfig>)
  | InlineConfig

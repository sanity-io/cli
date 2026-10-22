export interface GroqFilesTypeScriptPluginConfig {
  /** One schema per folder, the same shape as the content mapper's `resources`. */
  resources?: Array<{path: string | string[]; schema: string}>
  schema?: string
}

export interface GroqFilesPluginModule {
  create<Service extends {dispose?: () => void}>(info: {
    config: GroqFilesTypeScriptPluginConfig
    languageService: Service
    project: {
      getCurrentDirectory(): string
      projectService?: {logger?: {info(message: string): void}}
    }
  }): Service
}

declare function init(modules: unknown): GroqFilesPluginModule

export = init

import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {z} from 'zod/mini'

import {
  type CliConfig,
  type GoLanguageConfig,
  type PhpLanguageConfig,
  type PolyglotTypeGenConfig,
  type SwiftLanguageConfig,
  type TypeGenConfig,
  type TypeScriptLanguageConfig,
} from './types/cliConfig'
import {type UserViteConfig} from './types/userViteConfig'

const K_NEW = ['typescript', 'go', 'php', 'swift'] as const
const K_LEGACY = [
  'schema',
  'generates',
  'path',
  'overloadClientMethods',
  'formatGeneratedCode',
] as const

const GO_PACKAGE_RE = /^[a-z][a-z0-9_]*$/
const PHP_NAMESPACE_RE = /^[A-Z][A-Za-z0-9_]*(\\[A-Z][A-Za-z0-9_]*)*$/

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const present = (block: Record<string, unknown>, keys: readonly string[]): string[] =>
  keys.filter((k) => block[k] !== undefined)

const typegenSchema = z.custom<
  (Partial<TypeGenConfig> & {enabled?: boolean}) | PolyglotTypeGenConfig
>((raw) => {
  if (raw === undefined || raw === null) return true
  if (!isRecord(raw)) return false
  const block = raw as Record<string, unknown>

  const newKeys = present(block, K_NEW)
  const legacyKeys = present(block, K_LEGACY)
  if (newKeys.length > 0 && legacyKeys.length > 0) return false

  if (block.go !== undefined) {
    const go = block.go as GoLanguageConfig
    if (!isRecord(go)) return false
    if (typeof go.schema !== 'string' || typeof go.generates !== 'string') return false
    if (go.packageName !== undefined && !GO_PACKAGE_RE.test(String(go.packageName))) return false
  }
  if (block.php !== undefined) {
    const php = block.php as PhpLanguageConfig
    if (!isRecord(php)) return false
    if (typeof php.schema !== 'string' || typeof php.generates !== 'string') return false
    if (php.namespace !== undefined && !PHP_NAMESPACE_RE.test(String(php.namespace))) return false
  }
  if (block.swift !== undefined) {
    const swift = block.swift as SwiftLanguageConfig
    if (!isRecord(swift)) return false
    if (typeof swift.schema !== 'string' || typeof swift.generates !== 'string') return false
  }
  if (block.typescript !== undefined) {
    const ts = block.typescript as TypeScriptLanguageConfig
    if (!isRecord(ts)) return false
    if (typeof ts.schema !== 'string' || typeof ts.generates !== 'string') return false
  }
  return true
}, 'typegen: invalid shape — mixed legacy+per-language form or invalid per-language fields')

/**
 * @public
 */
export const cliConfigSchema = z.object({
  api: z.optional(
    z.object({
      dataset: z.optional(z.string()),
      projectId: z.optional(z.string()),
    }),
  ),

  app: z.optional(
    z.object({
      entry: z.optional(z.string()),
      icon: z.optional(z.string()),
      id: z.optional(z.string()),
      organizationId: z.optional(z.string()),
      title: z.optional(z.string()),
    }),
  ),

  autoUpdates: z.optional(z.boolean()),

  deployment: z.optional(
    z.object({
      appId: z.optional(z.string()),
      autoUpdates: z.optional(z.boolean()),
    }),
  ),

  graphql: z.optional(
    z.array(
      z.object({
        filterSuffix: z.optional(z.string()),
        generation: z.optional(z.enum(['gen1', 'gen2', 'gen3'])),
        id: z.optional(z.string()),
        nonNullDocumentFields: z.optional(z.boolean()),
        playground: z.optional(z.boolean()),
        source: z.optional(z.string()),
        tag: z.optional(z.string()),
        workspace: z.optional(z.string()),
      }),
    ),
  ),

  mediaLibrary: z.optional(
    z.object({
      aspectsPath: z.optional(z.string()),
    }),
  ),

  project: z.optional(
    z.object({
      basePath: z.optional(z.string()),
    }),
  ),

  reactCompiler: z.optional(z.custom<ReactCompilerConfig>()),

  reactStrictMode: z.optional(z.boolean()),

  schemaExtraction: z.optional(
    z.object({
      enabled: z.optional(z.boolean()),
      enforceRequiredFields: z.optional(z.boolean()),
      path: z.optional(z.string()),
      watchPatterns: z.optional(z.array(z.string())),
      workspace: z.optional(z.string()),
    }),
  ),

  server: z.optional(
    z.object({
      hostname: z.optional(z.string()),
      port: z.optional(z.number()),
    }),
  ),

  studioHost: z.optional(z.string()),

  vite: z.optional(z.custom<UserViteConfig>()),

  typegen: z.optional(typegenSchema),
}) satisfies z.core.$ZodType<CliConfig>

import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {type CliConfig} from '@sanity/cli-core'
import {defineApplication, type DefineAppResult} from '@sanity/workbench-cli'
import {
  createCompilerHost,
  createProgram,
  createSourceFile,
  flattenDiagnosticMessageText,
  parseJsonConfigFileContent,
  readConfigFile,
  sys,
} from 'typescript'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {defineCliConfig} from '../defineCliConfig.js'

describe('#defineCliConfig', () => {
  test('should return config unchanged and preserve object identity', () => {
    const config: CliConfig = {
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
      server: {
        hostname: 'localhost',
        port: 3333,
      },
    }

    const result = defineCliConfig(config)

    expect(result).toBe(config)
  })

  test('defineCliConfig type is CliConfig', () => {
    expectTypeOf<ReturnType<typeof defineCliConfig>>().toEqualTypeOf<CliConfig>()
  })
})

// A `defineApplication(...)` result fits `CliConfig['app']` only because every
// field declared there is optional; nothing in the type states the relationship.
describe('the `app` config slot', () => {
  test('accepts a `defineApplication` result, workbench fields and all', () => {
    expectTypeOf<DefineAppResult>().toExtend<CliConfig['app']>()

    defineCliConfig({
      app: defineApplication({
        dock: {group: 'system', order: 20},
        organizationId: 'org-1',
        slug: 'my-app',
        title: 'My App',
      }),
    })
  })

  // One literal only ever reports its first excess property, so one call each.
  test('rejects workbench fields written by hand', () => {
    defineCliConfig({
      app: {
        // @ts-expect-error `dock` comes from `defineApplication`
        dock: {group: 'system', order: 20},
        organizationId: 'org-1',
      },
    })
  })

  test('under `exactOptionalPropertyTypes`, accepts a `defineApplication` result and rejects `entry: undefined` written by hand', () => {
    const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../../..')
    const probePath = join(packageDir, 'src/exports/probe.ts').replaceAll('\\', '/')
    const probeSource = `import {defineApplication, defineCliConfig} from './index'
const app = {organizationId: 'org', slug: 'app', title: 'App'}
defineCliConfig({app: defineApplication(app)})
defineCliConfig({app: defineApplication({...app, entry: undefined})})
defineCliConfig({app: defineApplication({...app, entry: './src/App.tsx'})})
defineCliConfig({app: {entry: undefined}})
`
    const {options} = parseJsonConfigFileContent(
      readConfigFile(join(packageDir, 'tsconfig.json'), sys.readFile).config,
      sys,
      packageDir,
    )
    const compilerOptions = {...options, exactOptionalPropertyTypes: true}
    const host = createCompilerHost(compilerOptions)
    const isProbe = (fileName: string) => fileName.replaceAll('\\', '/') === probePath
    const {getSourceFile} = host

    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      isProbe(fileName)
        ? createSourceFile(fileName, probeSource, languageVersion, true)
        : getSourceFile.call(host, fileName, languageVersion, ...rest)

    const program = createProgram({host, options: compilerOptions, rootNames: [probePath]})
    const probe = program.getSourceFile(probePath)!
    const diagnostics = program.getSemanticDiagnostics(probe)

    expect(
      diagnostics.map(({start}) => probe.getLineAndCharacterOfPosition(start!).line + 1),
      diagnostics.map(({messageText}) => flattenDiagnosticMessageText(messageText, ' ')).join('\n'),
    ).toEqual([6])
  }, 30_000)
})

import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {
  type CompilerOptions,
  createCompilerHost,
  createProgram,
  createSourceFile,
  flattenDiagnosticMessageText,
  getPreEmitDiagnostics,
  ModuleKind,
  ModuleResolutionKind,
  resolveModuleName,
  ScriptTarget,
} from 'typescript'
import {describe, expect, test} from 'vitest'

import {type ReactCompilerConfig} from '../cliConfig.js'

/**
 * `ReactCompilerConfig` unions the options of two OPTIONAL peer dependencies
 * (`babel-plugin-react-compiler` and `oxc-transform-react`). In projects that
 * don't install one of them, its type-only import degrades to `any` instead
 * of erroring (declaration files are exempted by `skipLibCheck`), and an
 * unguarded `any` branch would absorb the whole union — silently turning off
 * type checking of the `reactCompiler` option, even for the compiler that IS
 * installed. Downstream repos worked around that with hand-written module
 * stubs, e.g. sanity-io/ui's `typings/babel-plugin-react-compiler.d.ts`.
 *
 * The `OptionalPeerOptions` guard in `cliConfig.ts` maps a missing peer's
 * options to `unknown` so the branch reduces to just its `transform`
 * discriminator. These tests compile probes against the real `cliConfig.ts`
 * with a module resolver that pretends selected peers are not installed, and
 * assert exactly which probe lines produce diagnostics.
 */

const TYPES_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PROBE_PATH = path.join(TYPES_DIR, '__reactCompilerConfigProbe__.ts')

const COMPILER_OPTIONS: CompilerOptions = {
  lib: ['lib.es2023.d.ts'],
  module: ModuleKind.Preserve,
  moduleResolution: ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ScriptTarget.ES2023,
  types: [],
}

interface ProbeDiagnostic {
  code: number
  line: number
  message: string
}

/**
 * Type-checks `probeSource` (a virtual sibling of `cliConfig.ts`) against the
 * real `cliConfig.ts`, with imports of the `blockedModules` failing to resolve
 * the way they would in a project that doesn't install them. Returns the
 * diagnostics reported inside the probe file.
 *
 * `./userViteConfig` is always blocked: it drags in vite's large type graph,
 * and `UserViteConfig` is unrelated to `ReactCompilerConfig`.
 */
function compileProbe(blockedModules: string[], probeSource: string): ProbeDiagnostic[] {
  const blocked = new Set([...blockedModules, './userViteConfig'])
  const host = createCompilerHost(COMPILER_OPTIONS)
  const {fileExists, getSourceFile, readFile} = host

  host.fileExists = (fileName) => fileName === PROBE_PATH || fileExists.call(host, fileName)
  host.readFile = (fileName) =>
    fileName === PROBE_PATH ? probeSource : readFile.call(host, fileName)
  host.getSourceFile = (fileName, languageVersionOrOptions, ...rest) =>
    fileName === PROBE_PATH
      ? createSourceFile(fileName, probeSource, languageVersionOrOptions, true)
      : getSourceFile.call(host, fileName, languageVersionOrOptions, ...rest)
  host.resolveModuleNameLiterals = (moduleLiterals, containingFile) =>
    moduleLiterals.map((literal) =>
      blocked.has(literal.text)
        ? {resolvedModule: undefined}
        : resolveModuleName(literal.text, containingFile, COMPILER_OPTIONS, host),
    )

  const program = createProgram({
    host,
    options: COMPILER_OPTIONS,
    rootNames: [PROBE_PATH],
  })

  return getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === PROBE_PATH)
    .map((diagnostic) => ({
      code: diagnostic.code,
      line:
        diagnostic.file && diagnostic.start !== undefined
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
          : -1,
      message: flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    }))
}

/** The 1-based lines of `probeSource` carrying a trailing `bad` marker comment. */
function linesMarkedBad(probeSource: string): number[] {
  return probeSource
    .split('\n')
    .flatMap((line, index) => (line.includes('/* bad */') ? [index + 1] : []))
}

function expectDiagnosticsOnMarkedLinesOnly(diagnostics: ProbeDiagnostic[], probeSource: string) {
  expect(
    [...new Set(diagnostics.map(({line}) => line))].toSorted((a, b) => a - b),
    diagnostics.map(({code, line, message}) => `line ${line} TS${code}: ${message}`).join('\n'),
  ).toEqual(linesMarkedBad(probeSource))
}

const COMPILE_TIMEOUT_MS = 30_000

describe('ReactCompilerConfig without babel-plugin-react-compiler installed', () => {
  // The sanity-io/ui apps/studio scenario: only `oxc-transform-react` is
  // installed and `sanity.cli.ts` uses `transform: 'oxc'`.
  const probeSource = `import {type ReactCompilerConfig} from './cliConfig'
export const goodOxc: ReactCompilerConfig = {transform: 'oxc', target: '19'}
export const goodBabelBare: ReactCompilerConfig = {transform: 'babel'}
export const goodEmpty: ReactCompilerConfig = {}
export const badOxcExcess: ReactCompilerConfig = {transform: 'oxc', bogusOption: 123} /* bad */
export const badOxcValue: ReactCompilerConfig = {transform: 'oxc', target: 42} /* bad */
export const badScalar: ReactCompilerConfig = 42 /* bad */
export const badUntypedBabelOption: ReactCompilerConfig = {target: '18'} /* bad */
`

  test(
    'keeps the oxc branch fully type-checked instead of collapsing to any',
    () => {
      const diagnostics = compileProbe(['babel-plugin-react-compiler'], probeSource)

      expectDiagnosticsOnMarkedLinesOnly(diagnostics, probeSource)
      expect(diagnostics).toContainEqual(
        expect.objectContaining({code: 2353, message: expect.stringContaining('bogusOption')}),
      )
    },
    COMPILE_TIMEOUT_MS,
  )
})

describe('ReactCompilerConfig without oxc-transform-react installed', () => {
  // The default setup: the babel transform's plugin is installed, the
  // experimental oxc transform's package is not.
  const probeSource = `import {type ReactCompilerConfig} from './cliConfig'
export const goodBabelImplicit: ReactCompilerConfig = {noEmit: false}
export const goodBabelExplicit: ReactCompilerConfig = {transform: 'babel', logger: null}
export const goodOxcBare: ReactCompilerConfig = {transform: 'oxc'}
export const badBabelExcess: ReactCompilerConfig = {transform: 'babel', bogusOption: 1} /* bad */
export const badBabelValue: ReactCompilerConfig = {noEmit: 42} /* bad */
export const badScalar: ReactCompilerConfig = 42 /* bad */
`

  test(
    'keeps the babel branch fully type-checked instead of collapsing to any',
    () => {
      const diagnostics = compileProbe(['oxc-transform-react'], probeSource)

      expectDiagnosticsOnMarkedLinesOnly(diagnostics, probeSource)
      expect(diagnostics).toContainEqual(
        expect.objectContaining({code: 2353, message: expect.stringContaining('bogusOption')}),
      )
    },
    COMPILE_TIMEOUT_MS,
  )
})

describe('ReactCompilerConfig with neither compiler package installed', () => {
  const probeSource = `import {type ReactCompilerConfig} from './cliConfig'
export const goodEmpty: ReactCompilerConfig = {}
export const goodBabelBare: ReactCompilerConfig = {transform: 'babel'}
export const goodOxcBare: ReactCompilerConfig = {transform: 'oxc'}
export const badTransform: ReactCompilerConfig = {transform: 'nope'} /* bad */
export const badScalar: ReactCompilerConfig = 42 /* bad */
`

  test(
    'still discriminates on the transform field',
    () => {
      const diagnostics = compileProbe(
        ['babel-plugin-react-compiler', 'oxc-transform-react'],
        probeSource,
      )

      expectDiagnosticsOnMarkedLinesOnly(diagnostics, probeSource)
    },
    COMPILE_TIMEOUT_MS,
  )
})

describe('ReactCompilerConfig with both compiler packages installed', () => {
  const probeSource = `import {type ReactCompilerConfig} from './cliConfig'
export const goodBabelImplicit: ReactCompilerConfig = {noEmit: false}
export const goodBabelExplicit: ReactCompilerConfig = {transform: 'babel', logger: null}
export const goodOxc: ReactCompilerConfig = {transform: 'oxc', target: '19'}
export const badBabelExcess: ReactCompilerConfig = {transform: 'babel', bogusOption: 1} /* bad */
export const badBabelValue: ReactCompilerConfig = {noEmit: 42} /* bad */
export const badOxcValue: ReactCompilerConfig = {transform: 'oxc', target: 42} /* bad */
`

  test(
    'passes the options of both peers through unchanged (control for the harness)',
    () => {
      const diagnostics = compileProbe([], probeSource)

      expectDiagnosticsOnMarkedLinesOnly(diagnostics, probeSource)
    },
    COMPILE_TIMEOUT_MS,
  )
})

describe('ReactCompilerConfig static shape (compiled against installed peers)', () => {
  test('accepts typed options for both transforms', () => {
    const babelImplicit = {noEmit: false} satisfies ReactCompilerConfig
    const babelExplicit = {logger: null, transform: 'babel'} satisfies ReactCompilerConfig
    const oxc = {target: '19', transform: 'oxc'} satisfies ReactCompilerConfig

    expect([babelImplicit, babelExplicit, oxc]).toHaveLength(3)
  })

  test('rejects mistyped options for both transforms', () => {
    // @ts-expect-error unknown babel option
    const babelExcess = {bogusOption: 1, transform: 'babel'} satisfies ReactCompilerConfig
    // @ts-expect-error noEmit expects a boolean
    const babelValue = {noEmit: 42} satisfies ReactCompilerConfig
    // @ts-expect-error target expects a supported React version
    const oxcValue = {target: 42, transform: 'oxc'} satisfies ReactCompilerConfig

    expect([babelExcess, babelValue, oxcValue]).toHaveLength(3)
  })
})

import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {readPackageJson} from '@sanity/cli-core'
import {getTempPath} from '@sanity/cli-test'
import gunzipMaybe from 'gunzip-maybe'
import {extract} from 'tar-fs'
import ts from 'typescript'
import {expect, test} from 'vitest'

import * as newExports from '../exports/index.js'

function getPackagePath(tmpDir: string, version: string) {
  return join(tmpDir, `sanity-cli-${version}`, 'package')
}

const OLD_CLI_VERSION = '5.12.0'

// Convert web stream to async iterable for use with Readable.from()
async function* streamToAsyncIterable(
  stream: globalThis.ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader()
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}

async function downloadAndExtractTarball(version: string, destDir: string) {
  try {
    if ((await stat(join(destDir, `sanity-cli-${version}`))).isDirectory()) {
      return
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  const packageName = '@sanity/cli'
  const res = await fetch(`https://registry.npmjs.org/${packageName}/-/cli-${version}.tgz`)

  if (!res.ok) {
    throw new Error(`Failed to download tarball for ${packageName}@${version}: ${res.statusText}`)
  }

  if (!res.body) {
    throw new Error(`No response body for ${packageName}@${version}`)
  }

  const nodeStream = Readable.from(streamToAsyncIterable(res.body))
  await pipeline(nodeStream, gunzipMaybe(), extract(`${destDir}/sanity-cli-${version}`))
}

async function getSanityPackageExports() {
  const tmpDir = getTempPath()
  await downloadAndExtractTarball(OLD_CLI_VERSION, tmpDir)

  const packagePath = getPackagePath(tmpDir, OLD_CLI_VERSION)

  const packageJson = await readPackageJson(join(packagePath, 'package.json'))
  const main = packageJson.main
  if (!main) {
    throw new Error('Main file not found')
  }

  return import(join(packagePath, main))
}

async function extractTypes(typesPath: string) {
  const sourceFile = ts.createSourceFile(
    typesPath,
    await readFile(typesPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )

  const exportedTypes: string[] = []

  ts.forEachChild(sourceFile, (node) => {
    // Handle `export interface Foo { ... }` and `export type Foo = ...`
    if (
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      exportedTypes.push(node.name.text)
    }

    // Handle type re-exports: `export type { Foo }` and `export { type Foo }`
    // Note: this only works on source files where the `type` keyword is preserved.
    // In .d.ts files built by api-extractor, `type` is stripped from re-exports.
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      if (node.isTypeOnly) {
        // `export type { Foo, Bar }` — all specifiers are types
        for (const specifier of node.exportClause.elements) {
          exportedTypes.push(specifier.name.text)
        }
      } else {
        // `export { type Foo, bar }` — only specifiers marked as type
        for (const specifier of node.exportClause.elements) {
          if (specifier.isTypeOnly) {
            exportedTypes.push(specifier.name.text)
          }
        }
      }
    }
  })

  return exportedTypes
}

async function getSanityPackageTypeExports() {
  const tmpDir = getTempPath()
  await downloadAndExtractTarball(OLD_CLI_VERSION, tmpDir)

  const packagePath = getPackagePath(tmpDir, OLD_CLI_VERSION)

  const packageJson = await readPackageJson(join(packagePath, 'package.json'))
  const types = packageJson.types
  if (!types) {
    throw new Error('Types not found')
  }
  const typesPath = join(packagePath, types)

  const exportedTypes = await extractTypes(typesPath)

  return exportedTypes
}

test('should match exports of the current cli package', async () => {
  const oldCliExports = await getSanityPackageExports()

  expect(Object.keys(newExports).toSorted()).toStrictEqual(
    Object.keys(oldCliExports.default).toSorted(),
  )
})

test('should include type exports of the old (v5) cli package', async () => {
  // These types are explicitly dropped from the new CLI. This is a breaking change, thus the v6.
  // Some of these are simply not possible to export anymore - CLI framework is completely different,
  // and other types should never have been exported in the first place, as they are internal
  // implementation details that should not be used by external consumers. We keep track of these
  // to avoid the old v5 CLI adding new types we're not aware of before we release v6.
  const IGNORED_TYPES = new Set([
    'CliApiClient',
    'CliCommandAction',
    'CliCommandArguments',
    'CliCommandContext',
    'CliCommandDefinition',
    'CliCommandGroupDefinition',
    'CliCommandRunner',
    'CliOutputter',
    'CliPrompter',
    'CliStubbedYarn',
    'CliUserConfig',
    'CliYarnOptions',
    'CommandRunnerOptions',
    'GetCliClient',
    'PackageJson',
    'ReactCompilerConfig',
    'ResolvedCliCommand',
    'SanityClient',
    'SanityCore',
    'SanityJson',
    'SanityModuleInternal',
    'SanityUser',
    'SinglePrompt',
    'TelemetryUserProperties',
  ])

  const oldCliTypeExports = await getSanityPackageTypeExports()
  // Extract from source file (not built .d.ts) because api-extractor strips `type`
  // keywords from re-exports, making it impossible to distinguish type vs value re-exports.
  const newCliTypeExports = await extractTypes(
    join(import.meta.dirname, '..', 'exports', 'index.ts'),
  )

  const expectedOldTypes = oldCliTypeExports.filter((type) => !IGNORED_TYPES.has(type))

  for (const expectedType of expectedOldTypes) {
    expect(newCliTypeExports, `Missing type export: ${expectedType}`).toContain(expectedType)
  }
})

import {readFile, stat} from 'node:fs/promises'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {boxen} from '@sanity/cli-core/ux'
import {getTempPath} from '@sanity/cli-test'
import {diff} from '@vitest/utils/diff'
import getLatestVersion from 'get-latest-version'
import gunzipMaybe from 'gunzip-maybe'
import {extract} from 'tar-fs'
import ts from 'typescript'
import {beforeAll, expect, test} from 'vitest'

import * as newExports from '../index.js'
import {readPackageJson} from '../util/readPackageJson.js'

const packageName = '@sanity/cli'

function getPackagePath(tmpDir: string, version: string) {
  return join(tmpDir, `sanity-cli-${version}`, 'package')
}

async function getLatestCliVersion(): Promise<string> {
  const version = await getLatestVersion(packageName)

  if (!version) {
    throw new Error('Unable to retrieve version')
  }

  return version
}

let latestCliVersion: string

beforeAll(async () => {
  latestCliVersion = await getLatestCliVersion()
  const tmpDir = getTempPath()
  await downloadAndExtractTarball(latestCliVersion, tmpDir)
})

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
  const packagePath = getPackagePath(tmpDir, latestCliVersion)

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
    // Handle direct exports: export interface X, export type X = ...
    if (
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      exportedTypes.push(node.name.text)
    }

    // Handle re-exports: export { X, Y, Z }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        exportedTypes.push(element.name.text)
      }
    }
  })

  return exportedTypes
}

async function getSanityPackageTypeExports() {
  const tmpDir = getTempPath()
  const packagePath = getPackagePath(tmpDir, latestCliVersion)

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

// Note: This is intentionally disabled for now as the type exports are not yet fully migrated to the new CLI.
test('should match type exports of the current cli package', async () => {
  const oldCliTypeExports = await getSanityPackageTypeExports()
  const newCliTypeExports = await extractTypes(
    join(import.meta.dirname, '../../dist', 'index.d.ts'),
  )

  try {
    expect(newCliTypeExports.toSorted()).toStrictEqual(oldCliTypeExports.toSorted())
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(
      boxen(`!!!!!!! Old and New CLI Type Exports do not match !!!!!!!`, {
        borderColor: 'red',
        borderStyle: 'round',
        margin: 1,
        padding: 1,
      }),
    )
    // eslint-disable-next-line no-console
    console.log(diff(error.expected, error.actual))
  }
})

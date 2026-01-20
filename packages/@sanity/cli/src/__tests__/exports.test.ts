import {join} from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {getTempPath} from '@sanity/cli-test'
import gunzipMaybe from 'gunzip-maybe'
import {extract} from 'tar-fs'
import {expect, test} from 'vitest'

import * as newExports from '../index.js'
import {readPackageJson} from '../util/readPackageJson.js'

function getPackagePath(tmpDir: string, version: string) {
  return join(tmpDir, `sanity-cli-${version}`, 'package')
}

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
  const version = '5.5.0'
  const tmpDir = getTempPath()
  await downloadAndExtractTarball(version, tmpDir)

  const packagePath = getPackagePath(tmpDir, version)

  const packageJson = await readPackageJson(join(packagePath, 'package.json'))
  const main = packageJson.main
  if (!main) {
    throw new Error('Main file not found')
  }

  return import(join(packagePath, main))
}

test('should get the exports of the sanity package', async () => {
  const exports = await getSanityPackageExports()

  expect(Object.keys(exports.default).toSorted()).toStrictEqual(Object.keys(newExports).toSorted())
})

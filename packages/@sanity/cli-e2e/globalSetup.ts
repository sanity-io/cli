import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {config as loadDotenv} from 'dotenv'

import {findBinaryPath, installFromTarball, packCli, packPackage} from './helpers/packCli.js'

let cleanupDir: string | undefined
let tarballPaths: string[] = []

export async function setup(): Promise<void> {
  // Load .env file into process.env so tests can read SANITY_E2E_* vars.
  // Existing env vars take precedence (CI sets them directly).
  loadDotenv({quiet: true})
  // If E2E_BINARY_PATH is already set (e.g., npm registry mode from CI),
  // skip pack and use the provided binary.
  if (process.env.E2E_BINARY_PATH) {
    console.log(`Using pre-set E2E_BINARY_PATH: ${process.env.E2E_BINARY_PATH}`)
    if (process.env.E2E_CREATE_SANITY_BINARY_PATH) {
      console.log(
        `Using pre-set E2E_CREATE_SANITY_BINARY_PATH: ${process.env.E2E_CREATE_SANITY_BINARY_PATH}`,
      )
    }
    return
  }

  console.log('Packing @sanity/cli...')
  const cliTarball = packCli()

  console.log('Packing create-sanity...')
  const createSanityTarball = packPackage('create-sanity')
  tarballPaths = [cliTarball, createSanityTarball]

  const tmpDir = mkdtempSync(join(tmpdir(), 'cli-e2e-'))
  cleanupDir = tmpDir

  console.log(`Installing tarballs into ${tmpDir}...`)
  const binaryPath = installFromTarball([cliTarball, createSanityTarball], tmpDir, 'sanity')

  process.env.E2E_BINARY_PATH = binaryPath
  console.log(`E2E_BINARY_PATH set to ${binaryPath}`)

  const createSanityBinaryPath = findBinaryPath(tmpDir, 'create-sanity')
  process.env.E2E_CREATE_SANITY_BINARY_PATH = createSanityBinaryPath
  console.log(`E2E_CREATE_SANITY_BINARY_PATH set to ${createSanityBinaryPath}`)
}

export async function teardown(): Promise<void> {
  for (const tarball of tarballPaths) {
    rmSync(tarball, {force: true})
  }
  if (cleanupDir) {
    rmSync(cleanupDir, {force: true, recursive: true})
  }
}

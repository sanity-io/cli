import {rm, writeFile} from 'node:fs/promises'
import path from 'node:path'

const filePath = path.join(import.meta.url, '../../')

/**
 * This is a global setup file that creates a dev file to make sure the CLI runs in dev mode.
 * It is used to avoid the building the CLI before running the tests.
 *
 * It is also used to remove the dev file after the tests are run.
 */

export async function setup() {
  // Create a dev file to make sure the CLI runs in dev mode
  await writeFile(new URL('isDev', filePath), '')
}

export async function teardown() {
  await rm(new URL('isDev', filePath), {force: true})
}

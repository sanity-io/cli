import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {type Output} from '@sanity/cli-core'
import {execa} from 'execa'
import {parse as parseYaml, stringify as stringifyYaml} from 'yaml'

import {getPartialEnvWithNpmPath, type PackageManager} from './packageManagerChoice.js'

/**
 * Dependencies known to ship build scripts that scaffolded Sanity projects need to run.
 * These are automatically approved when configuring pnpm build approval.
 */
export const BUILD_APPROVAL_ALLOWLIST: readonly string[] = ['esbuild']

/**
 * Given combined stdout/stderr of a `pnpm install`, return the deduped package names
 * (without version specifiers) whose build scripts pnpm ignored.
 *
 * Returns an empty array when the output does not contain the `ERR_PNPM_IGNORED_BUILDS`
 * marker.
 *
 * @param output - Combined stdout/stderr from a `pnpm install` invocation
 * @returns Deduped package names whose builds were ignored
 */
export function parseIgnoredBuilds(output: string): string[] {
  if (!output.includes('ERR_PNPM_IGNORED_BUILDS')) {
    return []
  }

  const match = output.match(/Ignored build scripts:\s*([^\n]+)/)
  if (!match) {
    return []
  }

  const names = match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/@[^@/]+$/, ''))
    .filter((entry) => entry.length > 0)

  return [...new Set(names)]
}

/**
 * Resolve the major version of the `pnpm` binary available at the given working directory.
 *
 * @param cwd - The working directory to resolve `pnpm` from
 * @returns The major version, or `undefined` if it could not be determined
 */
export async function getPnpmMajorVersion(cwd: string): Promise<number | undefined> {
  try {
    const result = await execa('pnpm', ['--version'], {
      cwd,
      encoding: 'utf8',
      env: getPartialEnvWithNpmPath(cwd),
      reject: false,
    })

    if (result.exitCode !== 0 || typeof result.stdout !== 'string') {
      return undefined
    }

    const match = result.stdout.trim().match(/^(\d+)\./)
    if (!match) {
      return undefined
    }

    return Number.parseInt(match[1], 10)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/**
 * Write the appropriate pnpm build approval configuration for scaffolded projects.
 *
 * - pnpm 11 and newer: merge `allowBuilds` entries into `pnpm-workspace.yaml`.
 * - pnpm 10: union the allowlist into `pnpm.onlyBuiltDependencies` in `package.json`.
 * - pnpm 9 and older, an unknown version, or an empty allowlist: do nothing.
 *
 * @param projectDir - The project directory to configure
 * @param pnpmMajor - The detected pnpm major version, or `undefined`
 * @param allowlist - The package names whose build scripts should be approved
 */
export async function writePnpmBuildApproval(
  projectDir: string,
  pnpmMajor: number | undefined,
  allowlist: readonly string[],
): Promise<void> {
  if (pnpmMajor === undefined || pnpmMajor < 10 || allowlist.length === 0) {
    return
  }

  if (pnpmMajor >= 11) {
    await writeWorkspaceYamlApproval(projectDir, allowlist)
    return
  }

  // pnpm === 10
  await writePackageJsonApproval(projectDir, allowlist)
}

async function writeWorkspaceYamlApproval(
  projectDir: string,
  allowlist: readonly string[],
): Promise<void> {
  const yamlPath = path.join(projectDir, 'pnpm-workspace.yaml')

  let doc: Record<string, unknown> = {}
  if (existsSync(yamlPath)) {
    const parsed: unknown = parseYaml(await readFile(yamlPath, 'utf8'))
    if (isRecord(parsed)) {
      doc = parsed
    }
  }

  const existingAllowBuilds = doc.allowBuilds
  const allowBuilds: Record<string, unknown> = isRecord(existingAllowBuilds)
    ? {...existingAllowBuilds}
    : {}

  for (const name of allowlist) {
    allowBuilds[name] = true
  }

  doc.allowBuilds = allowBuilds

  await writeFile(yamlPath, stringifyYaml(doc), 'utf8')
}

async function writePackageJsonApproval(
  projectDir: string,
  allowlist: readonly string[],
): Promise<void> {
  const pkgPath = path.join(projectDir, 'package.json')
  // Precondition: a valid `package.json` always exists at this point (it is written during
  // scaffolding before build approval runs). A missing or malformed manifest throwing here is
  // therefore intentional - it signals a broken scaffold rather than something to swallow.
  const parsed: unknown = JSON.parse(await readFile(pkgPath, 'utf8'))

  if (!isRecord(parsed)) {
    return
  }

  const pnpmConfig: Record<string, unknown> = isRecord(parsed.pnpm) ? parsed.pnpm : {}

  const existing = pnpmConfig.onlyBuiltDependencies
  const existingDeps = isStringArray(existing) ? existing : []

  const merged = [...existingDeps]
  for (const name of allowlist) {
    if (!merged.includes(name)) {
      merged.push(name)
    }
  }

  pnpmConfig.onlyBuiltDependencies = merged
  parsed.pnpm = pnpmConfig

  await writeFile(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}

/**
 * Print a notice informing the user that pnpm ignored some build scripts, and how to
 * approve them. No-op for non-pnpm package managers or when no builds were ignored.
 *
 * @param output - The output channel to log to
 * @param packageManager - The package manager that was used
 * @param ignoredBuilds - Package names whose build scripts were ignored
 */
export function printIgnoredBuildsNotice(
  output: Output,
  packageManager: PackageManager,
  ignoredBuilds: string[],
): void {
  if (packageManager !== 'pnpm' || ignoredBuilds.length === 0) {
    return
  }

  output.log(
    `${styleText('yellow', '⚠')} pnpm ignored build scripts for: ${ignoredBuilds.join(', ')}`,
  )
  output.log(
    `Run ${styleText('cyan', 'pnpm approve-builds')} to allow these dependencies to run their build scripts.`,
  )
}

import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {getLocalPackageVersion} from '@sanity/cli-core/package-manager'
import {gtr, intersects, minVersion, satisfies} from 'semver'

import {InitError} from './initError.js'

/**
 * Keep these aligned with `checkStudioDependencyVersions`. An in-place Studio
 * runs on the React in this project, so a version outside the range fails here
 * instead of after files have been written.
 */
const STUDIO_REACT_RANGES = {
  react: '^19.2.2',
  'react-dom': '^19.2.2',
  'styled-components': '^6',
} as const

type StudioReactPackage = keyof typeof STUDIO_REACT_RANGES
type MismatchDirection = 'newer' | 'older'

interface Mismatch {
  direction: MismatchDirection
  name: StudioReactPackage
  range: string
  version: string
}

export async function assertInPlaceStudioReact(workDir: string): Promise<void> {
  const specs = await readDependencySpecs(workDir)
  const mismatches: Mismatch[] = []

  for (const name of Object.keys(STUDIO_REACT_RANGES) as StudioReactPackage[]) {
    const range = STUDIO_REACT_RANGES[name]
    const spec = specs[name]
    const installed = await getLocalPackageVersion(name, workDir)
    const direction = dependencyMismatch(spec, installed, range)
    if (!direction) continue

    mismatches.push({
      direction,
      name,
      range,
      version: installed ?? spec ?? range,
    })
  }

  if (mismatches.length === 0) return
  throw new InitError(formatMismatch(mismatches))
}

function dependencyMismatch(
  spec: string | undefined,
  installed: string | null,
  range: string,
): MismatchDirection | undefined {
  if (installed) {
    try {
      if (satisfies(installed, range)) return undefined
      return gtr(installed, range) ? 'newer' : 'older'
    } catch {
      return undefined
    }
  }

  if (!spec) return undefined

  try {
    if (intersects(spec, range)) return undefined
    const min = minVersion(spec)
    if (min && gtr(min, range)) return 'newer'
    return 'older'
  } catch {
    // catalog:, workspace:, and file: specs have no version to compare.
    return undefined
  }
}

function formatMismatch(mismatches: Mismatch[]): string {
  const lines = mismatches
    .map(
      (mismatch) =>
        `${mismatch.name} ${mismatch.version} is ${mismatch.direction} than Studio supports (${mismatch.range}).`,
    )
    .join('\n')

  return `Couldn't add a Studio to this project.\n${lines}\n\n${advice(mismatches)}`
}

function advice(mismatches: Mismatch[]): string {
  const separate = 'sanity init --no-in-place-studio'
  if (mismatches.some((mismatch) => mismatch.direction === 'newer')) {
    return `Add the Studio in its own folder so this project can keep its current versions:\n\n  ${separate}`
  }

  const upgrades = mismatches.map((mismatch) => `${mismatch.name}@${mismatch.range}`).join(' ')
  return `Upgrade to ${upgrades}, or add the Studio in its own folder:\n\n  ${separate}`
}

async function readDependencySpecs(workDir: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.join(workDir, 'package.json'), 'utf8')
    const pkg: unknown = JSON.parse(raw)
    if (!isRecord(pkg)) return {}

    const specs: Record<string, string> = {}
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const deps = pkg[field]
      if (!isRecord(deps)) continue
      for (const [name, spec] of Object.entries(deps)) {
        if (typeof spec === 'string') specs[name] = spec
      }
    }
    return specs
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

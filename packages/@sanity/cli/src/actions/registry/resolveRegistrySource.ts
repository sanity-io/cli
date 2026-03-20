import {access, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {execa} from 'execa'

import {type ResolvedRegistrySource} from './types.js'

interface ResolveRegistrySourceOptions {
  source: string

  local?: boolean

  ref?: string
  subdir?: string
}

export async function resolveRegistrySource(
  options: ResolveRegistrySourceOptions,
): Promise<ResolvedRegistrySource> {
  const {local, ref, source, subdir} = options
  const parsed = parseInlineSource(source)

  const checkoutRef = ref ?? parsed.ref
  const checkoutPath = subdir ?? parsed.subdir
  if (local) {
    const localRoot = resolveLocalSourcePath(parsed.repoUrl)
    const resolvedDirectory = checkoutPath
      ? join(localRoot, normalizeRegistrySubdir(checkoutPath))
      : localRoot
    await assertPathExists(
      resolvedDirectory,
      `Local registry path "${resolvedDirectory}" does not exist.`,
    )

    return {
      cleanup: async () => {},
      directory: resolvedDirectory,
      sourceLabel: `local:${resolvedDirectory}`,
    }
  }

  const tmpCheckoutDir = await mkdtemp(join(tmpdir(), 'sanity-registry-'))
  const cloneArgs = ['clone', '--depth', '1']
  if (checkoutRef) {
    cloneArgs.push('--branch', checkoutRef)
  }

  cloneArgs.push(parsed.repoUrl, tmpCheckoutDir)
  await execa('git', cloneArgs, {stdio: 'pipe'})

  const resolvedDirectory = checkoutPath
    ? join(tmpCheckoutDir, normalizeRegistrySubdir(checkoutPath))
    : tmpCheckoutDir

  return {
    cleanup: async () => {
      await rm(tmpCheckoutDir, {force: true, recursive: true})
    },
    directory: resolvedDirectory,
    sourceLabel: `${parsed.repoUrl}${checkoutRef ? `#${checkoutRef}` : ''}${checkoutPath ? `:${checkoutPath}` : ''}`,
  }
}

function resolveLocalSourcePath(source: string): string {
  if (source.startsWith('file://')) {
    return fileURLToPath(source)
  }

  return resolve(source)
}

async function assertPathExists(path: string, message: string): Promise<void> {
  try {
    await access(path)
  } catch {
    throw new Error(message)
  }
}

interface ParsedSource {
  repoUrl: string

  ref?: string
  subdir?: string
}

function parseInlineSource(input: string): ParsedSource {
  const [repoPart, fragment] = input.split('#')
  if (!fragment) {
    return {repoUrl: repoPart}
  }

  const [ref, subdir] = fragment.split(':')
  return {
    ref: ref || undefined,
    repoUrl: repoPart,
    subdir: subdir || undefined,
  }
}

function normalizeRegistrySubdir(subdir: string): string {
  const normalized = subdir.replaceAll('\\', '/').replace(/^\/+/, '')

  if (normalized.includes('..')) {
    throw new Error(`Invalid registry path "${subdir}". Relative parent segments are not allowed.`)
  }

  return normalized
}

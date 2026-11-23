import {AsyncLocalStorage} from 'node:async_hooks'
import {randomUUID} from 'node:crypto'
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {dirname, isAbsolute, join} from 'node:path'

import {CLIError} from '@oclif/core/errors'
import {z} from 'zod/mini'

import {getCliExecutionContext} from '../../executionContext.js'
import {exitCodes} from '../../exitCodes.js'
import {getSanityConfigDir} from '../../util/getSanityConfigDir.js'

const profileName = /^[a-z0-9][a-z0-9_-]{0,62}$/
const configValue = z.optional(z.string().check(z.minLength(1)))
const profileSchema = z
  .strictObject({
    blueprintPath: z.optional(z.string().check(z.refine(isAbsolute))),
    dataset: configValue,
    organizationId: configValue,
    projectId: configValue,
    stackId: configValue,
  })
  .check(z.refine((profile) => !profile.dataset || Boolean(profile.projectId)))

type BlueprintProfile = z.infer<typeof profileSchema>

export function isBlueprintMode(): boolean {
  if (getCliExecutionContext()) return false
  const mode = process.env.SANITY_CLI_MODE
  if (mode === 'legacy') return false
  if (mode === 'blueprints') return true
  if (mode) throw usageError('Set SANITY_CLI_MODE to either legacy or blueprints.')
  return Boolean(process.env.SANITY_BLUEPRINT_PROFILE)
}

const invocation = new AsyncLocalStorage<{
  profile?: ReturnType<typeof resolveBlueprintProfile>
}>()

export function runWithBlueprintProfile<T>(run: () => T): T {
  return invocation.run({}, run)
}

export async function getBlueprintProfile() {
  if (!isBlueprintMode()) return
  const current = invocation.getStore()
  if (!current) return resolveBlueprintProfile()
  return (current.profile ??= resolveBlueprintProfile())
}

async function resolveBlueprintProfile() {
  const name = process.env.SANITY_BLUEPRINT_PROFILE
  const profile = name ? await readProfile(name) : undefined
  const projectOverride = process.env.SANITY_PROJECT_ID || undefined
  const organizationOverride = process.env.SANITY_ORGANIZATION_ID || undefined
  const projectId = projectOverride ?? (organizationOverride ? undefined : profile?.projectId)
  const organizationId =
    organizationOverride ??
    (projectOverride && projectOverride !== profile?.projectId
      ? undefined
      : profile?.organizationId)
  const sameScope =
    projectId === profile?.projectId &&
    (projectId !== undefined || organizationId === profile?.organizationId)

  const blueprintPath =
    process.env.SANITY_BLUEPRINT_PATH || (sameScope ? profile?.blueprintPath : undefined)
  if (blueprintPath && !isAbsolute(blueprintPath)) {
    throw usageError('Set SANITY_BLUEPRINT_PATH to the absolute path of your Blueprint manifest.')
  }
  return {
    blueprintPath,
    dataset: process.env.SANITY_DATASET || (sameScope ? profile?.dataset : undefined),
    name,
    organizationId,
    projectId,
    stackId: process.env.SANITY_BLUEPRINT_STACK_ID || (sameScope ? profile?.stackId : undefined),
  }
}

export async function saveBlueprintProfile(
  name: string,
  profile: BlueprintProfile,
): Promise<string> {
  const path = getProfilePath(name)
  const result = profileSchema.safeParse(profile)
  if (!result.success) throw invalidProfile(path)
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  await mkdir(dirname(path), {mode: 0o700, recursive: true})
  try {
    await writeFile(temporaryPath, JSON.stringify(result.data, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, {force: true})
  }
  return path
}

async function readProfile(name: string): Promise<BlueprintProfile> {
  const path = getProfilePath(name)
  try {
    return profileSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (cause) {
    throw invalidProfile(path, cause)
  }
}

function getProfilePath(name: string): string {
  if (!profileName.test(name)) {
    throw usageError(
      'Use a profile name with 1–63 lowercase letters, digits, hyphens or underscores. Start with a letter or digit.',
    )
  }
  const directory =
    process.env.SANITY_BLUEPRINT_CONFIG_DIR || join(getSanityConfigDir(), 'blueprints')
  if (!isAbsolute(directory)) {
    throw usageError('Set SANITY_BLUEPRINT_CONFIG_DIR to an absolute directory path.')
  }
  return join(directory, `${name}.json`)
}

function invalidProfile(path: string, cause?: unknown): CLIError {
  return usageError(
    `Could not load Blueprint profile ${path}. Check the file or run \`sanity blueprints profiles set --help\` to save it again.`,
    cause,
  )
}

function usageError(message: string, cause?: unknown): CLIError {
  return new CLIError(new Error(message, {cause}), {exit: exitCodes.USAGE_ERROR})
}

/**
 * Composition of the pure aspect-sync contract (`./contract.ts`) with the
 * CLI's Media Library API services, for `sanity deploy` of a media-library
 * config app (DAM-1821).
 *
 * Split into a read-only **plan** and a mutating **apply** so the deploy flow
 * can report the plan — including the deletion list — in both dry-run and
 * real mode before anything is written:
 *
 * - {@link planAspectSync}: evaluate + serialize + validate every config
 *   field module, resolve the target media library, and diff against the
 *   stored aspect ids. No mutations.
 * - {@link applyAspectSync}: apply the plan's upserts and deletes as one
 *   mutation transaction.
 */

import path from 'node:path'

import {importModule} from '@sanity/cli-core'
import {validateMediaLibraryAssetAspect} from '@sanity/schema/_internal'

import {
  getMediaLibrariesForOrganization,
  getStoredAspectIds,
  mutateAspects,
} from '../../../services/mediaLibraries.js'
import {
  type AspectDocument,
  buildSyncMutations,
  computeMirrorDiff,
  type FieldEntry,
  serializeField,
} from './contract.js'

/** The read-only sync plan `sanity deploy` reports before mutating. */
export interface AspectSyncPlan {
  /** The documents the sync upserts, one per config field. */
  documents: AspectDocument[]
  mediaLibraryId: string
  /** Stored aspect ids with no matching config field — deleted by the sync. */
  staleIds: string[]
  /** Per-field dot-paths stripped during serialization, for fields that had any. */
  strippedByField: Record<string, string[]>
}

interface AspectSyncFailure {
  message: string

  solution?: string
}

export type AspectSyncPlanResult = {failure: AspectSyncFailure} | {plan: AspectSyncPlan}

/**
 * Build the sync plan: evaluate, serialize, and schema-validate every field
 * module before touching the network, then resolve the target library and
 * diff against its stored aspect ids. Read-only.
 */
export async function planAspectSync(options: {
  fields: readonly FieldEntry[]
  mediaLibraryId?: string
  organizationId: string
  workDir: string
}): Promise<AspectSyncPlanResult> {
  const {fields, mediaLibraryId: explicitMediaLibraryId, organizationId, workDir} = options

  // Evaluate + serialize + validate every field module before touching the
  // network, collecting all failures so one broken module doesn't hide the next.
  const documents: AspectDocument[] = []
  const strippedByField: Record<string, string[]> = {}
  const failures: string[] = []

  for (const entry of fields) {
    try {
      const definition = await importModule(path.resolve(workDir, entry.src))
      const {document, stripped} = serializeField(entry, definition)

      const [valid, validationErrors] = validateMediaLibraryAssetAspect(document.definition)
      if (!valid) {
        const messages = validationErrors.flat().map((problem) => problem.message)
        failures.push(`${entry.name}: schema validation failed: ${messages.join('; ')}`)
        continue
      }

      documents.push(document)
      if (stripped.length > 0) strippedByField[entry.name] = stripped
    } catch (error) {
      failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (failures.length > 0) {
    return {
      failure: {
        message: `${failures.length === 1 ? 'A config field' : `${failures.length} config fields`} cannot sync to stored aspect documents:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`,
        solution: 'Fix the field modules listed above, then deploy again',
      },
    }
  }

  const library = await resolveTargetMediaLibrary(organizationId, explicitMediaLibraryId)
  if ('failure' in library) return library

  const storedIds = await getStoredAspectIds(library.mediaLibraryId)
  const {staleIds} = computeMirrorDiff(documents, storedIds)

  return {plan: {documents, mediaLibraryId: library.mediaLibraryId, staleIds, strippedByField}}
}

/**
 * Apply the plan as one mutation transaction: upsert every config document,
 * delete every stale stored document. Definitions only — asset data under
 * `aspects.<name>` is never touched.
 */
export async function applyAspectSync(plan: AspectSyncPlan): Promise<void> {
  await mutateAspects({
    mediaLibraryId: plan.mediaLibraryId,
    mutations: buildSyncMutations(plan.documents, plan.staleIds),
  })
}

/**
 * The flag wins (validated against the organization's active libraries);
 * otherwise a single active library is unambiguous. Multiple actives fail —
 * deploy can run unattended (CI), so it never prompts, and a sync that
 * guesses the target would mirror the config into the wrong library.
 */
async function resolveTargetMediaLibrary(
  organizationId: string,
  explicitMediaLibraryId: string | undefined,
): Promise<{failure: AspectSyncFailure} | {mediaLibraryId: string}> {
  const libraries = await getMediaLibrariesForOrganization(organizationId)
  const libraryIds = libraries.map((library) => library.id)

  if (explicitMediaLibraryId) {
    if (!libraryIds.includes(explicitMediaLibraryId)) {
      return {
        failure: {
          message:
            `Media library ${explicitMediaLibraryId} is not an active library of organization ` +
            `${organizationId} (found: ${libraryIds.join(', ') || 'none'})`,
          solution: 'Pass --media-library-id with one of the active library ids',
        },
      }
    }
    return {mediaLibraryId: explicitMediaLibraryId}
  }

  if (libraries.length === 0) {
    return {
      failure: {
        message: `Organization ${organizationId} has no active media library to sync the config's aspect definitions to`,
        solution: 'Install the Media Library for the organization before deploying its config',
      },
    }
  }
  if (libraries.length > 1) {
    return {
      failure: {
        message:
          `Organization ${organizationId} has ${libraries.length} active media libraries ` +
          `(${libraryIds.join(', ')}) — the sync needs an explicit target`,
        solution: 'Pass --media-library-id with the library this config belongs to',
      },
    }
  }
  return {mediaLibraryId: libraries[0].id}
}

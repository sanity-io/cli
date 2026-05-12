import {readRevisions, readSpec, writeRevisions, writeSpec} from './cache.js'
import {fetchSpec, fetchSpecIndex, type OpenApiSpecIndexEntry} from './docsClient.js'

interface RevalidateResult {
  /** Live index entries from the docs endpoint. */
  index: OpenApiSpecIndexEntry[]
  /** Slugs that were refetched during this revalidation. */
  updated: string[]
}

/**
 * Revision-keyed revalidation: fetch the index, diff revisions against
 * the local cache, refetch only the specs whose revision changed (or
 * are missing locally). The index fetch is always one network call;
 * a warm cache (no revision diffs) results in zero per-spec fetches.
 *
 * Section 5.2 of the spec is the source of truth for this flow.
 *
 * **Pre-merge fallback:** when the docs endpoint hasn't yet deployed
 * the `revision` contract extension, entries arrive with `revision: ''`.
 * We can't trust cache freshness without a revision, so we refetch on
 * every invocation in that case. Once the upstream PR merges,
 * `revision` populates and the warm-cache fast path kicks in.
 */
export async function revalidateSpecs(options?: {
  /** Limit revalidation to a single slug. Other specs aren't touched. */
  onlySlug?: string
}): Promise<RevalidateResult> {
  const index = await fetchSpecIndex()
  const localRevisions = await readRevisions()
  const nextRevisions = {...localRevisions}
  const updated: string[] = []

  const targets = options?.onlySlug
    ? index.filter((entry) => entry.slug === options.onlySlug)
    : index

  for (const entry of targets) {
    if (!(await shouldRefetch(entry, localRevisions))) continue

    const fetched = await fetchSpec(entry.slug)
    if (fetched === null) continue // 404 — index lied or spec was deleted between calls; skip

    await writeSpec(entry.slug, fetched.content)
    nextRevisions[entry.slug] = entry.revision
    updated.push(entry.slug)
  }

  if (updated.length > 0) {
    await writeRevisions(nextRevisions)
  }

  return {index, updated}
}

async function shouldRefetch(
  entry: OpenApiSpecIndexEntry,
  localRevisions: Record<string, string>,
): Promise<boolean> {
  // No cached YAML on disk: always fetch.
  if ((await readSpec(entry.slug)) === null) return true
  // Upstream doesn't expose a revision yet: can't trust cache, refetch.
  if (entry.revision === '') return true
  // Revisions disagree: upstream advanced, refetch the changed slug.
  return localRevisions[entry.slug] !== entry.revision
}

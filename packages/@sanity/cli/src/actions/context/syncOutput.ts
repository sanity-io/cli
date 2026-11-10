import {type Sync} from '../../services/context.js'
import {pluralize} from '../../util/pluralize.js'

function heldDocuments(count: number | null): string {
  return count === null ? 'some documents' : `${count} ${pluralize('document', count)}`
}

/**
 * Next steps for a sync held for confirmation, or `undefined` for any other sync
 */
export function heldSyncHint(knowledgeBaseId: string, sync: Sync): string | undefined {
  if (sync.status !== 'held') return undefined
  const ids = `${knowledgeBaseId} ${sync.sourceId} ${sync.id}`
  return [
    `Sync held: it would delete ${heldDocuments(sync.heldDeletions)} it didn't find.`,
    `Delete them with: sanity context sources syncs confirm ${ids}`,
    `Keep them with:   sanity context sources syncs discard ${ids}`,
  ].join('\n')
}

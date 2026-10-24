import {type Context} from '@sanity/client'

import {formatKeyValue} from '../debug/output.js'

/**
 * Key-value lines describing a source sync
 */
export function formatSync(sync: Context.Sync): string[] {
  const padTo = 14 // "Held deletions" and "Partial reason" are the longest keys
  return [
    formatKeyValue('ID', sync.id, {padTo}),
    formatKeyValue('Source', sync.sourceId, {padTo}),
    formatKeyValue('Status', sync.status, {padTo}),
    formatKeyValue('Trigger', sync.trigger, {padTo}),
    formatKeyValue('Mode', sync.mode, {padTo}),
    formatKeyValue('Seen', sync.documentsSeen, {padTo}),
    formatKeyValue('Upserted', sync.documentsUpserted, {padTo}),
    formatKeyValue('Unchanged', sync.documentsUnchanged, {padTo}),
    formatKeyValue('Deleted', sync.documentsDeleted, {padTo}),
    formatKeyValue('Missing', sync.documentsMissing, {padTo}),
    formatKeyValue('Held deletions', sync.heldDeletions ?? '-', {padTo}),
    formatKeyValue('Partial reason', sync.partialReason ?? '-', {padTo}),
    formatKeyValue('Error', sync.error ?? '-', {padTo}),
    formatKeyValue('Created', sync.createdAt, {padTo}),
    formatKeyValue('Finished', sync.finishedAt ?? '-', {padTo}),
  ]
}

/**
 * Next steps for a sync held for confirmation, or `undefined` for any other sync
 */
export function heldSyncHint(knowledgeBaseId: string, sync: Context.Sync): string | undefined {
  if (sync.status !== 'held') return undefined
  const ids = `${knowledgeBaseId} ${sync.sourceId} ${sync.id}`
  return [
    `Sync held: it would delete ${sync.heldDeletions ?? 'some'} documents it didn't find.`,
    `Delete them with: sanity context sources syncs confirm ${ids}`,
    `Keep them with:   sanity context sources syncs discard ${ids}`,
  ].join('\n')
}

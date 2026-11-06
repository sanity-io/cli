import {type Context} from '@sanity/client'

import {type Job, type KnowledgeBase, type Sync} from '../../../services/context.js'

export const knowledgeBase: KnowledgeBase = {
  activeJobId: null,
  buildRestriction: null,
  buildStageState: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  createdBy: null,
  description: 'Product docs and troubleshooting guides',
  excludedSourceChunks: 0,
  hasDatasetSource: false,
  hasFileSource: false,
  hasPendingChanges: false,
  hasWebSource: false,
  id: '00000000-0000-0000-0000-000000000001',
  instructionCount: 2,
  isBuilding: false,
  lastChangedAt: null,
  lastCheckedAt: null,
  openIssueCount: 1,
  organizationId: 'org-abc123',
  pendingChanges: null,
  pipelineOutdated: false,
  publicId: 'kb-abc123',
  rebuildRecommended: null,
  refreshInFlight: false,
  sourceChunks: 5,
  sourceUsage: null,
  state: 'ready',
  title: 'Support docs',
  updatedAt: '2026-08-02T00:00:00.000Z',
}

export const latestSync: Sync = {
  createdAt: '2026-08-01T00:00:00.000Z',
  documentsDeleted: 0,
  documentsMissing: 0,
  documentsSeen: 5,
  documentsUnchanged: 1,
  documentsUpserted: 4,
  error: null,
  finishedAt: '2026-08-01T01:00:00.000Z',
  heldDeletions: null,
  id: 'sync-ghi789',
  mode: 'full',
  partialReason: null,
  sourceId: 'source-def456',
  status: 'completed',
  trigger: 'manual',
}

export const heldSync: Sync = {
  ...latestSync,
  finishedAt: null,
  heldDeletions: 12,
  id: 'sync-held',
  status: 'held',
}

const sourceStats = {
  chunkCount: 40,
  convertedDocumentCount: 4,
  createdAt: '2026-08-01T00:00:00.000Z',
  documentCount: 5,
  failedDocumentCount: 0,
  knowledgeBaseId: 'kb-abc123',
  lastSyncedAt: '2026-08-01T01:00:00.000Z',
  latestSync,
  skippedDocumentCount: 1,
  updatedAt: '2026-08-01T01:00:00.000Z',
}

export const webSource: Context.Source = {
  ...sourceStats,
  crawlOptions: {includePaths: ['^/docs/'], pageLimit: 100},
  id: 'source-def456',
  syncFrequency: 'weekly',
  title: 'example.com',
  type: 'web',
  url: 'https://example.com/docs',
}

export const succeededJob: Job = {
  completedAt: '2026-08-01T01:00:00.000Z',
  error: null,
  id: 'job-def456',
  kind: 'build',
  knowledgeBaseId: 'kb-abc123',
  startedAt: '2026-08-01T00:00:00.000Z',
  status: 'succeeded',
}

export const issue: Context.IssueDoc = {
  _createdAt: '2026-08-01T00:00:00Z',
  _id: 'issue.def456',
  _rev: 'rev-1',
  _type: 'sanity.context.issue',
  _updatedAt: '2026-08-01T00:00:00Z',
  content: {
    citedDocumentIds: ['document-def456'],
    issue: 'The refunds entry says 5 days, but the source now says 10 days.',
    kind: 'update_required',
    scopePath: 'billing/refunds',
    severity: 'suggestion',
    suggestedFix: 'Update the refund window to 10 days.',
  },
  fingerprint: 'fingerprint-1',
  knowledgeBaseId: 'kb-abc123',
  resolution: null,
  resolvedAt: null,
  resolvedBy: null,
  revisionId: null,
  schemaVersion: 2,
  status: 'open',
}

export const conflictIssue: Context.IssueDoc = {
  ...issue,
  _id: 'issue.conflict789',
  content: {
    claimKey: 'refunds.window',
    issue: 'Two entries disagree on the refund window.',
    kind: 'conflict',
    scopePath: '*',
    severity: 'critical',
    sides: [
      {claim: 'Refunds are processed within 5 days.', entryPaths: ['billing/refunds']},
      {claim: 'Refunds are processed within 10 days.', entryPaths: ['billing/faq']},
    ],
    suggested: 1,
    suggestedFix: 'Choose the correct refund window.',
  },
}

export const entry: Context.EntryDoc = {
  _createdAt: '2026-08-01T00:00:00Z',
  _id: 'entry.def456',
  _rev: 'rev-1',
  _type: 'sanity.context.entry',
  _updatedAt: '2026-08-01T00:00:00Z',
  body: '# Refunds\nRefunds are processed within 10 days.',
  citations: [
    {
      _key: 'citation-1',
      _type: 'sanity.context.citation',
      chunkId: 'chunk-1',
      claims: ['refunds.window'],
      documentId: 'document-def456',
      lineEnd: 2,
      lineStart: 2,
      prefix: '',
      quote: 'Refunds are processed within 10 days.',
      suffix: '',
      title: 'Refunds',
    },
  ],
  documentIds: ['document-def456'],
  generatedAt: '2026-08-01T01:00:00Z',
  knowledgeBaseId: 'kb-abc123',
  path: 'billing/refunds',
  revisionId: 'revision-1',
  schemaVersion: 1,
  status: 'filled',
  title: 'Refunds',
  tldr: {
    excludes: 'Chargebacks',
    scope: 'How and when refunds are processed',
  },
}

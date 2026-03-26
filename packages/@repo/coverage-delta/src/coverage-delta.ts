/* eslint-disable no-console */
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {format} from 'oxfmt'

import {buildMarkdown, computeDeltas, parseCoverageSummary} from './lib.ts'

const COMMENT_ID = '<!-- coverage-delta-comment -->'

await main()

async function main(): Promise<void> {
  const currentSummaryPath = 'coverage/coverage-summary.json'
  const baselineSummaryPath = 'coverage/baseline/coverage-summary.json'
  const baselineShaPath = 'coverage/baseline/sha.txt'

  if (!existsSync(currentSummaryPath)) {
    console.error(`Coverage summary not found at ${currentSummaryPath}`)
    process.exit(1)
  }

  const current = parseCoverageSummary(currentSummaryPath)

  const hasBaseline = existsSync(baselineSummaryPath)
  const baseline = hasBaseline ? parseCoverageSummary(baselineSummaryPath) : null

  const baselineSha =
    hasBaseline && existsSync(baselineShaPath) ? readFileSync(baselineShaPath, 'utf8').trim() : null

  const changedFiles = getChangedFiles()
  const deltas = computeDeltas(current, baseline, changedFiles)
  const rawMarkdown = buildMarkdown(deltas, current, baseline, baselineSha)
  const {code: formatted} = await format('coverage.md', rawMarkdown)

  const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request'
  if (isPullRequest) {
    postComment(formatted)
  } else {
    // Local / dry-run: print to stdout instead of posting
    process.stdout.write(formatted)
  }
}

function getChangedFiles(): string[] {
  const result = spawnSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim()
    throw new Error(`git diff failed (exit ${result.status}): ${stderr}`)
  }
  return (result.stdout ?? '').trim().split('\n').filter(Boolean)
}

function findExistingCommentId(prNumber: string): string | null {
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) return null

  const jqFilter = '[.[] | select(.body | contains($id))][0].id'
  const result = spawnSync(
    'gh',
    [
      'api',
      `repos/${repo}/issues/${prNumber}/comments`,
      '--jq',
      jqFilter,
      '--arg',
      'id',
      COMMENT_ID,
    ],
    {encoding: 'utf8'},
  )
  if (result.status !== 0) return null

  const id = (result.stdout ?? '').trim()
  return id && id !== 'null' ? id : null
}

function postComment(body: string): void {
  const prNumber = process.env.PR_NUMBER
  if (!prNumber) {
    throw new Error('PR_NUMBER environment variable is required to post comments')
  }

  const bodyWithId = `${COMMENT_ID}\n${body}`
  const tmpFile = join(tmpdir(), `coverage-delta-${Date.now()}.md`)
  writeFileSync(tmpFile, bodyWithId)
  try {
    const existingId = findExistingCommentId(prNumber)

    if (existingId) {
      const repo = process.env.GITHUB_REPOSITORY
      const edit = spawnSync(
        'gh',
        [
          'api',
          '--method',
          'PATCH',
          `repos/${repo}/issues/comments/${existingId}`,
          '-F',
          `body=@${tmpFile}`,
        ],
        {encoding: 'utf8'},
      )
      if (edit.status !== 0) {
        const editStderr = (edit.stderr ?? '').trim()
        throw new Error(
          `Failed to edit coverage comment: ${editStderr || `gh exited with status ${edit.status}`}`,
        )
      }
      return
    }

    // No existing comment — create a new one
    const create = spawnSync('gh', ['pr', 'comment', prNumber, '--body-file', tmpFile], {
      encoding: 'utf8',
      stdio: 'inherit',
    })
    if (create.status !== 0) {
      throw new Error(
        `Failed to post coverage comment: gh exited with status ${create.status ?? 'unknown'}`,
      )
    }
  } finally {
    unlinkSync(tmpFile)
  }
}

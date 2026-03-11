/* eslint-disable no-console */
import {spawnSync} from 'node:child_process'
import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {format} from 'oxfmt'

import {buildMarkdown, computeDeltas, parseCoverageSummary} from './lib.ts'

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

function isNoExistingCommentError(stderr: string): boolean {
  // gh cli reports this when --edit-last finds no comment from the current user
  const normalized = stderr.toLowerCase()
  return normalized.includes('no comments') || normalized.includes('no comment found')
}

function postComment(body: string): void {
  const prNumber = process.env.PR_NUMBER
  if (!prNumber) {
    throw new Error('PR_NUMBER environment variable is required to post comments')
  }

  const tmpFile = join(tmpdir(), `coverage-delta-${Date.now()}.md`)
  writeFileSync(tmpFile, body)
  try {
    // Try to edit existing coverage comment, fall back to creating new one
    const edit = spawnSync(
      'gh',
      ['pr', 'comment', prNumber, '--edit-last', '--body-file', tmpFile],
      {
        encoding: 'utf8',
      },
    )

    if (edit.status === 0) return

    const editStderr = (edit.stderr ?? '').trim()
    if (!isNoExistingCommentError(editStderr)) {
      throw new Error(
        `Failed to edit coverage comment: ${editStderr || `gh exited with status ${edit.status}`}`,
      )
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

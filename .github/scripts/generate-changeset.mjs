/* eslint-disable no-console */
import {execFileSync, spawnSync} from 'node:child_process'
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

// --- Env vars ---
const {GH_TOKEN, GITHUB_REPOSITORY, PR_BODY = '', PR_NUMBER, PR_REPO, PR_TITLE} = process.env

if (!GH_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER || !PR_TITLE || !PR_REPO) {
  throw new Error(
    'Missing required env vars: GH_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, PR_TITLE, PR_REPO',
  )
}

const CHANGESET_FILE = `.changeset/pr-${PR_NUMBER}.md`

// --- Helpers ---

// Use execFileSync to avoid shell interpretation of arguments
function git(...args) {
  return execFileSync('git', args, {encoding: 'utf8'}).trim()
}

let gitConfigured = false
function ensureGitConfigured() {
  if (gitConfigured) return
  git('config', 'user.name', 'ecospark[bot]')
  git('config', 'user.email', 'ecospark[bot]@users.noreply.github.com')
  git('remote', 'set-url', 'origin', `https://x-access-token:${GH_TOKEN}@github.com/${PR_REPO}.git`)
  gitConfigured = true
}

function removeChangeset() {
  if (existsSync(CHANGESET_FILE)) {
    ensureGitConfigured()
    git('rm', CHANGESET_FILE)
    git('commit', '-m', `chore: remove auto-generated changeset for PR #${PR_NUMBER}`)
    git('push', '--force-with-lease')
  }
}

function parseConventionalCommit(title) {
  const match = title.match(/^([a-z]+)(\((.+)\))?(!)?:\s.+/)
  if (!match) return null
  return {breaking: match[4] === '!', type: match[1]}
}

function parseReleaseNotes(body) {
  const lines = body.split('\n')
  const startIdx = lines.findIndex((l) => l.startsWith('### Notes for release'))
  if (startIdx === -1) return ''

  const collected = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('### ')) break
    collected.push(lines[i])
  }

  return collected
    .join('\n')
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .trim()
}

function determineBump(type, breaking, body) {
  if (breaking) return 'major'
  if (body.split('\n').some((l) => l.startsWith('BREAKING CHANGE:'))) return 'major'
  if (type === 'feat') return 'minor'
  if (['fix', 'perf', 'revert'].includes(type)) return 'patch'
  return null
}

// Fetch all changed file paths for the PR, handling pagination.
async function getChangedFiles() {
  const files = []
  let page = 1

  while (true) {
    const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files?per_page=100&page=${page}`
    const res = await fetch(url, {
      headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${GH_TOKEN}`},
    })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    if (data.length === 0) break
    files.push(...data.map((f) => f.filename))
    page++
  }

  return files
}

// Discover non-private workspace packages.
// Returns a Map of dirPrefix -> packageName.
function getWorkspacePackages() {
  const pkgMap = new Map()
  const parentDirs = ['packages']

  // Auto-discover scoped package dirs
  if (existsSync('packages')) {
    for (const entry of readdirSync('packages', {withFileTypes: true})) {
      if (entry.isDirectory() && entry.name.startsWith('@')) {
        parentDirs.push(`packages/${entry.name}`)
      }
    }
  }

  for (const parent of parentDirs) {
    const parentPath = resolve(parent)
    if (!existsSync(parentPath)) continue

    for (const entry of readdirSync(parentPath, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue
      if (parent === 'packages' && entry.name.startsWith('@')) continue

      const pkgJsonPath = join(parentPath, entry.name, 'package.json')
      if (!existsSync(pkgJsonPath)) continue

      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
      if (pkg.private) continue

      const dirPrefix = `${parent}/${entry.name}/`
      pkgMap.set(dirPrefix, pkg.name)
    }
  }

  return pkgMap
}

// --- Main ---

// 1. Parse conventional commit
const parsed = parseConventionalCommit(PR_TITLE)
if (!parsed) {
  console.log('::warning::PR title does not match conventional commit format')
  removeChangeset()
  process.exit(0)
}

// 2. Determine bump
const bump = determineBump(parsed.type, parsed.breaking, PR_BODY)
if (!bump) {
  console.log(`PR type '${parsed.type}' does not require a changeset`)
  removeChangeset()
  process.exit(0)
}

// 3. Extract release notes
let releaseNotes = parseReleaseNotes(PR_BODY)

if (/^N\/A/i.test(releaseNotes)) {
  console.log('Release notes set to N/A')
  removeChangeset()
  process.exit(0)
}

if (!releaseNotes) {
  releaseNotes = PR_TITLE.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, '')
}

// 4. Detect affected packages
const changedFiles = await getChangedFiles()
const pkgMap = getWorkspacePackages()
const affected = new Set()

for (const file of changedFiles) {
  for (const [prefix, name] of pkgMap) {
    if (file.startsWith(prefix)) {
      affected.add(name)
    }
  }
}

if (affected.size === 0) {
  console.log('No public packages affected by changed files')
  removeChangeset()
  process.exit(0)
}

// 5. Write changeset
const frontmatter = [...affected].map((pkg) => `'${pkg}': ${bump}`).join('\n')
const changesetContent = `---\n${frontmatter}\n---\n\n${releaseNotes}\n`

writeFileSync(CHANGESET_FILE, changesetContent)
console.log('Generated changeset:')
console.log(changesetContent)

// 6. Commit and push
ensureGitConfigured()
git('add', CHANGESET_FILE)

const {status} = spawnSync('git', ['diff', '--cached', '--quiet'], {stdio: 'ignore'})
if (status === 0) {
  console.log('No changes to changeset file')
  process.exit(0)
}

git('commit', '-m', `chore: update auto-generated changeset for PR #${PR_NUMBER}`)
git('push', '--force-with-lease')

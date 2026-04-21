import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

const REPO = 'sanity-io/cli'
const REPO_URL = `https://github.com/${REPO}`

const SECTION_MAP = {
  'Major Changes': '⚠ BREAKING CHANGES',
  'Minor Changes': 'Features',
  'Patch Changes': 'Bug Fixes',
}

function discoverPackages() {
  const packages = []
  const packagesDir = resolve('packages')

  if (!existsSync(packagesDir)) return packages

  for (const entry of readdirSync(packagesDir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue

    if (entry.name.startsWith('@')) {
      const scopeDir = join(packagesDir, entry.name)
      for (const sub of readdirSync(scopeDir, {withFileTypes: true})) {
        if (!sub.isDirectory()) continue
        const pkgJsonPath = join(scopeDir, sub.name, 'package.json')
        if (!existsSync(pkgJsonPath)) continue
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
        if (!pkg.private) {
          packages.push({dir: join(scopeDir, sub.name), name: pkg.name, version: pkg.version})
        }
      }
    } else {
      const pkgJsonPath = join(packagesDir, entry.name, 'package.json')
      if (!existsSync(pkgJsonPath)) continue
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
      if (!pkg.private) {
        packages.push({dir: join(packagesDir, entry.name), name: pkg.name, version: pkg.version})
      }
    }
  }

  return packages
}

function getTagPrefix(packageName) {
  if (packageName.startsWith('@')) {
    return packageName.split('/')[1] + '-v'
  }
  return packageName + '-v'
}

function extractDepBlock(section) {
  const marker = '- The following workspace dependencies were updated'
  const idx = section.indexOf(marker)
  if (idx === -1) return {section, depBlock: null}

  const afterMarker = section.slice(idx)
  const lines = afterMarker.split('\n')
  let endLine = 1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '' || lines[i].match(/^\s{2,}/)) {
      endLine = i + 1
    } else {
      break
    }
  }

  const depBlock = lines
    .slice(0, endLine)
    .join('\n')
    .trimEnd()
  const cleaned = section.slice(0, idx) + section.slice(idx + depBlock.length)

  return {section: cleaned, depBlock}
}

function removeEmptySections(text) {
  const parts = text.split(/(^### .*$)/m)
  const result = []
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('### ')) {
      const nextContent = parts[i + 1] || ''
      if (nextContent.trim().length === 0) {
        i++
        continue
      }
    }
    result.push(parts[i])
  }
  return result.join('')
}

function transformChangelog(content, packageName, currentVersion) {
  const tagPrefix = getTagPrefix(packageName)
  const today = new Date().toISOString().split('T')[0]

  const versionRegex = /^## (\d+\.\d+\.\d+)\s*$/m
  const match = content.match(versionRegex)
  if (!match || match[1] !== currentVersion) return content

  const versionStart = match.index
  const afterHeading = content.slice(versionStart + match[0].length)
  const nextVersionMatch = afterHeading.match(/^## /m)
  const sectionEnd = nextVersionMatch
    ? versionStart + match[0].length + nextVersionMatch.index
    : content.length

  const before = content.slice(0, versionStart)
  let section = content.slice(versionStart, sectionEnd)
  const after = content.slice(sectionEnd)

  let previousVersion = null
  if (after) {
    const prevMatch = after.match(/^## \[?(\d+\.\d+\.\d+)/m)
    if (prevMatch) previousVersion = prevMatch[1]
  }

  const compareUrl = previousVersion
    ? `${REPO_URL}/compare/${tagPrefix}${previousVersion}...${tagPrefix}${currentVersion}`
    : `${REPO_URL}/releases/tag/${tagPrefix}${currentVersion}`

  section = section.replace(
    `## ${currentVersion}`,
    `## [${currentVersion}](${compareUrl}) (${today})`,
  )

  for (const [from, to] of Object.entries(SECTION_MAP)) {
    section = section.replace(new RegExp(`^### ${from}$`, 'm'), `### ${to}`)
  }

  const {section: withoutDeps, depBlock} = extractDepBlock(section)
  section = withoutDeps

  section = removeEmptySections(section)

  // Collapse multiple blank lines
  section = section.replace(/\n{3,}/g, '\n\n')

  if (depBlock) {
    section = section.trimEnd() + '\n\n### Dependencies\n\n' + depBlock + '\n\n'
  }

  return before + section + after
}

const packages = discoverPackages()
let transformed = 0

for (const pkg of packages) {
  const changelogPath = join(pkg.dir, 'CHANGELOG.md')
  if (!existsSync(changelogPath)) continue

  const content = readFileSync(changelogPath, 'utf8')
  const result = transformChangelog(content, pkg.name, pkg.version)

  if (result !== content) {
    writeFileSync(changelogPath, result)
    console.log(`  ${pkg.name} CHANGELOG.md transformed`)
    transformed++
  }
}

if (transformed === 0) {
  console.log('No changelogs needed transformation')
} else {
  console.log(`\nTransformed ${transformed} changelog(s)`)
}

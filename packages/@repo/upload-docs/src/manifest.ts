/* eslint-disable no-console */
/**
 * manifest.ts
 *
 * Reads oclif.manifest.json and writes/updates Sanity documents
 * for each CLI command group. All changes are batched into a content release.
 *
 * Usage: npx tsx manifest.ts <path-to-oclif.manifest.json> [--dry-run]
 *
 * Requires: SANITY_DOCS_API_TOKEN env var (unless --dry-run)
 * Pass in SANITY_PROJECT_ID and SANITY_DATASET to use a different project/dataset
 */

import {readFileSync} from 'node:fs'

import {createClient, type SanityClient, type SanityDocument} from '@sanity/client'
import {createPublishedId, createVersionId} from '@sanity/id-utils'

// ── Types ──────────────────────────────────────────────────────────────

interface OclifFlag {
  char?: string
  description?: string
  hidden?: boolean
  name: string
  required?: boolean
  type: 'boolean' | 'option'
}

interface OclifArg {
  description?: string
  hidden?: boolean
  name: string
  options?: string[]
  required?: boolean
}

interface OclifExample {
  command: string
  description?: string
}

interface OclifCommand {
  aliases?: string[]
  args?: Record<string, OclifArg>
  description?: string
  examples?: OclifExample[]
  flags?: Record<string, OclifFlag>
  hidden?: boolean
  id: string
  state?: string
  strict?: boolean
  summary?: string
}

interface OclifManifest {
  commands: Record<string, OclifCommand>
  version?: string
}

interface CommandEntry {
  description: string
  fullCommand: string
  helpText: string
  name: string
  subcommands?: CommandEntry[]
}

interface CommandGroup {
  command: string
  description: string
  subcommands: CommandEntry[]
  fullCommand?: string
  helpText?: string
}

// ── Constants ──────────────────────────────────────────────────────────

const PROJECT_ID = process.env.SANITY_PROJECT_ID || '3do82whm'
const DATASET = process.env.SANITY_DATASET || 'next'
const API_VERSION = '2026-02-25'
const PRIMARY_SECTION_REF = '607f752e-c269-45f4-8250-068a499a888f'

// ── Helpers ────────────────────────────────────────────────────────────

function makeCodeBlock(
  content: string,
  language: string = 'sh',
  filename: string = 'CLI output',
): Record<string, unknown> {
  return {
    _type: 'codeBlock',
    blocks: [
      {
        code: {
          _type: 'code',
          code: content,
          language,
        },
        filename,
      },
    ],
  }
}

function makeHeading(
  text: string,
  style: 'h2' | 'h3' | 'h4',
  codeMark: boolean,
): Record<string, unknown> {
  return {
    _type: 'block',
    children: [
      {
        _type: 'span',
        marks: codeMark ? ['code'] : [],
        text,
      },
    ],
    markDefs: [],
    style,
  }
}

// ── Help Text Generation ───────────────────────────────────────────────

/**
 * Convert an oclif command ID (colon-separated) to a CLI usage string.
 * e.g. "backup:enable" → "sanity backup enable"
 */
function commandIdToUsage(id: string): string {
  return `sanity ${id.replaceAll(':', ' ')}`
}

/**
 * Build a help text string from a structured oclif command definition.
 * Produces output in the same format as `sanity <command> --help`.
 */
function buildHelpText(cmd: OclifCommand): string {
  const lines: string[] = []

  // USAGE
  const args = Object.values(cmd.args ?? {}).filter((a) => !a.hidden)
  const argsPart = args
    .map((a) => (a.required ? a.name.toUpperCase() : `[${a.name.toUpperCase()}]`))
    .join(' ')

  lines.push('USAGE', `  $ ${commandIdToUsage(cmd.id)}${argsPart ? ` ${argsPart}` : ''}`, '')

  // ARGUMENTS
  if (args.length > 0) {
    lines.push('ARGUMENTS')
    for (const arg of args) {
      const label = arg.required ? arg.name.toUpperCase() : `[${arg.name.toUpperCase()}]`
      lines.push(`  ${label.padEnd(22)}${arg.description ?? ''}`)
    }
    lines.push('')
  }

  // FLAGS
  const flags = Object.values(cmd.flags ?? {}).filter((f) => !f.hidden)
  if (flags.length > 0) {
    lines.push('FLAGS')
    for (const flag of flags) {
      const charPart = flag.char ? `-${flag.char},` : '   '
      const valuePart = flag.type === 'option' ? `=<${flag.name.toUpperCase()}>` : ''
      const flagStr = `  ${charPart} --${flag.name}${valuePart}`
      lines.push(flag.description ? `${flagStr.padEnd(36)}${flag.description}` : flagStr)
    }
    lines.push('')
  }

  // DESCRIPTION
  if (cmd.description) {
    lines.push('DESCRIPTION', `  ${cmd.description.trim().replaceAll('\n', '\n  ')}`, '')
  }

  // EXAMPLES
  if (cmd.examples && cmd.examples.length > 0) {
    lines.push('EXAMPLES')
    for (const ex of cmd.examples) {
      if (ex.description) {
        lines.push(`  ${ex.description}`, '')
      }
      lines.push(`    ${ex.command}`, '')
    }
  }

  return lines.join('\n').trimEnd()
}

// ── Manifest Parsing ───────────────────────────────────────────────────

/**
 * Group oclif manifest commands into CommandGroup objects.
 *
 * Command hierarchy uses colon separators in the command ID:
 * - "build"                  → standalone group
 * - "backup:enable"          → group "backup" with subcommand "enable"
 * - "dataset:alias:create"   → group "dataset" → sub-group "alias" → action "create"
 */
function groupManifestCommands(manifest: OclifManifest): CommandGroup[] {
  const groupMap = new Map<string, CommandGroup>()
  const groupOrder: string[] = []

  const commands = Object.values(manifest.commands)
    .filter((cmd) => !cmd.hidden)
    .sort((a, b) => a.id.localeCompare(b.id))

  for (const cmd of commands) {
    const parts = cmd.id.split(':')
    const groupName = parts[0]
    const description = cmd.summary ?? cmd.description ?? ''

    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, {command: groupName, description: '', subcommands: []})
      groupOrder.push(groupName)
    }

    const group = groupMap.get(groupName)!

    if (parts.length === 1) {
      // Root-level command (e.g. "build", "debug", "deploy")
      group.fullCommand = commandIdToUsage(cmd.id)
      group.helpText = buildHelpText(cmd)
      if (!group.description) group.description = description
    } else if (parts.length === 2) {
      // Direct subcommand (e.g. "backup:enable")
      group.subcommands.push({
        description,
        fullCommand: commandIdToUsage(cmd.id),
        helpText: buildHelpText(cmd),
        name: parts[1],
      })
      if (!group.description) group.description = description
    } else {
      // Deep-nested subcommand (e.g. "dataset:alias:create")
      const subGroupName = parts[1]
      const actionName = parts.slice(2).join(' ')

      let subGroup = group.subcommands.find((s) => s.name === subGroupName)
      if (!subGroup) {
        subGroup = {
          description: `${subGroupName} commands for ${groupName}`,
          fullCommand: `sanity ${groupName} ${subGroupName}`,
          helpText: '',
          name: subGroupName,
          subcommands: [],
        }
        group.subcommands.push(subGroup)
      }

      subGroup.subcommands ??= []
      subGroup.subcommands.push({
        description,
        fullCommand: commandIdToUsage(cmd.id),
        helpText: buildHelpText(cmd),
        name: actionName,
      })

      if (!group.description) group.description = description
    }
  }

  return groupOrder.map((name) => groupMap.get(name)!)
}

function parseManifest(content: string): CommandGroup[] {
  const manifest = JSON.parse(content) as OclifManifest
  const groups = groupManifestCommands(manifest)
  console.log(
    `Parsed ${Object.keys(manifest.commands).length} commands into ${groups.length} command groups`,
  )
  return groups
}

// ── Heading Key Preservation ──────────────────────────────────────────

/**
 * Build a lookup map of "style:text" → _key from existing heading blocks.
 * Used to preserve _key values for deep linking on the docs site.
 */
function buildHeadingKeyMap(content: Record<string, unknown>[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const block of content) {
    if (
      block._type === 'block' &&
      typeof block.style === 'string' &&
      (block.style as string).startsWith('h')
    ) {
      const children = block.children as Array<{text?: string}>
      const text = children?.map((c) => c.text || '').join('') || ''
      if (text) {
        map.set(`${block.style}:${text}`, block._key as string)
      }
    }
  }
  return map
}

/**
 * Walk through generated blocks and reuse _key on any heading that
 * matches an existing style:text combo. Preserves deep link anchors.
 */
function applyExistingKeys(
  blocks: Record<string, unknown>[],
  keyMap: Map<string, string>,
): Record<string, unknown>[] {
  return blocks.map((block) => {
    if (
      block._type === 'block' &&
      typeof block.style === 'string' &&
      (block.style as string).startsWith('h')
    ) {
      const children = block.children as Array<{text?: string}>
      const text = children?.map((c) => c.text || '').join('') || ''
      const existingKey = keyMap.get(`${block.style}:${text}`)
      if (existingKey) {
        return {...block, _key: existingKey}
      }
    }
    return block
  })
}

// ── Content Generation ────────────────────────────────────────────────

/**
 * Generate content blocks for a command group.
 * Matches the output structure of index.ts for consistency with existing docs.
 */
function generateCommandContent(group: CommandGroup): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []

  if (group.subcommands.length === 0) {
    if (group.helpText) {
      blocks.push(makeCodeBlock(group.helpText))
    }
    return blocks
  }

  blocks.push(
    makeCodeBlock(`npx sanity ${group.command} --help`, 'sh'),
    makeHeading('Commands', 'h2', false),
  )

  for (const sub of group.subcommands) {
    if (sub.subcommands && sub.subcommands.length > 0) {
      blocks.push(makeHeading(sub.name, 'h3', true))
      if (sub.helpText) {
        blocks.push(makeCodeBlock(sub.helpText))
      }
      for (const nested of sub.subcommands) {
        blocks.push(makeHeading(nested.name, 'h4', true))
        if (nested.helpText) {
          blocks.push(makeCodeBlock(nested.helpText))
        }
      }
    } else {
      blocks.push(makeHeading(sub.name, 'h3', true))
      if (sub.helpText) {
        blocks.push(makeCodeBlock(sub.helpText))
      }
    }
  }

  return blocks
}

/**
 * Merge new content into an existing document's content array.
 * Preserves intro text and heading _key values for deep linking.
 */
function mergeContent(
  existingContent: Record<string, unknown>[],
  newBlocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  const [generatedCodeBlock, ...commandsSection] = newBlocks

  const commandsH2Idx = existingContent.findIndex(
    (b) =>
      b._type === 'block' &&
      b.style === 'h2' &&
      Array.isArray(b.children) &&
      (b.children as Array<{text?: string}>).some((c) => c.text === 'Commands'),
  )

  const firstCodeIdx = existingContent.findIndex(
    (b, i) => b._type === 'codeBlock' && (commandsH2Idx === -1 || i < commandsH2Idx),
  )

  if (firstCodeIdx === -1) {
    if (commandsH2Idx !== -1) {
      return [...existingContent.slice(0, commandsH2Idx), generatedCodeBlock, ...commandsSection]
    }
    return [...existingContent, generatedCodeBlock, ...commandsSection]
  }

  const introBlocks = existingContent.slice(0, firstCodeIdx)
  const middleBlocks =
    commandsH2Idx > firstCodeIdx + 1
      ? existingContent.slice(firstCodeIdx + 1, commandsH2Idx)
      : []

  if (commandsSection.length === 0) {
    if (commandsH2Idx !== -1) {
      return [...introBlocks, generatedCodeBlock, ...middleBlocks]
    }
    return [...introBlocks, generatedCodeBlock, ...existingContent.slice(firstCodeIdx + 1)]
  }

  return [...introBlocks, generatedCodeBlock, ...middleBlocks, ...commandsSection]
}

/**
 * Build a complete new document for a command group without an existing doc.
 */
function buildNewDocument(group: CommandGroup, slug: string): Record<string, unknown> {
  const title = group.command.charAt(0).toUpperCase() + group.command.slice(1)
  return {
    _type: 'article',
    content: generateCommandContent(group),
    description: `Reference documentation for the Sanity CLI ${group.command} command.`,
    layout: 'default',
    primarySection: {_ref: PRIMARY_SECTION_REF, _type: 'reference'},
    slug: {_type: 'slug', current: slug},
    title,
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const manifestPath = args.find((a) => !a.startsWith('--'))

  if (!manifestPath) {
    console.error('Usage: npx tsx manifest.ts <path-to-oclif.manifest.json> [--dry-run]')
    process.exit(1)
  }

  const token = process.env.SANITY_DOCS_API_TOKEN
  if (!token && !dryRun) {
    console.error('Error: SANITY_DOCS_API_TOKEN environment variable is required')
    process.exit(1)
  }

  const groups = parseManifest(readFileSync(manifestPath, 'utf8'))

  const client: SanityClient = createClient({
    apiVersion: API_VERSION,
    dataset: DATASET,
    projectId: PROJECT_ID,
    token: token || 'dry-run-placeholder',
    useCdn: false,
  })

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19)
  const releaseId = `cli-reference-update-${timestamp}`

  if (dryRun) {
    console.log(`\n[DRY RUN] Release: ${releaseId}`)
  } else {
    console.log(`\nCreating release: ${releaseId}`)
    await client.releases.create({
      metadata: {releaseType: 'undecided', title: releaseId},
      releaseId,
    })
    console.log('Release created.')
  }

  let updated = 0
  let created = 0
  let skipped = 0

  const CLI_DOCS_QUERY = /* groq */ `*[_type == "article" && automationId match "cli-*-reference"]`
  const existingDocs: SanityDocument[] = dryRun ? [] : await client.fetch(CLI_DOCS_QUERY)
  const existingDocMap = new Map(existingDocs.map((doc) => [doc.automationId, doc]))

  const tx = client.transaction()

  for (const group of groups) {
    const newBlocks = generateCommandContent(group)

    if (newBlocks.length === 0) {
      console.log(`  SKIP ${group.command} — no helpText or subcommands`)
      skipped++
      continue
    }

    const existingDoc = existingDocMap.get(`cli-${group.command}-reference`)

    if (existingDoc) {
      if (dryRun) {
        console.log(`  UPDATE ${group.command} → ${existingDoc._id} (${newBlocks.length} blocks)`)
      } else {
        const existingContent = (existingDoc.content as Record<string, unknown>[]) || []
        const headingKeyMap = buildHeadingKeyMap(existingContent)
        const mergedContent = applyExistingKeys(mergeContent(existingContent, newBlocks), headingKeyMap)

        const vId = createVersionId(releaseId, existingDoc._id)
        tx.create({...existingDoc, _id: vId})
        tx.patch(vId, {
          set: {
            automationId: `cli-${group.command}-reference`,
            content: mergedContent,
          },
        })
        console.log(
          `  UPDATE ${group.command} → ${existingDoc._id} (${mergedContent.length} blocks)`,
        )
      }
      updated++
    } else {
      const docId = createPublishedId()
      const newDoc = buildNewDocument(group, `cli-${group.command}`)

      if (dryRun) {
        console.log(`  CREATE ${group.command} → ${docId} (${newBlocks.length} blocks)`)
      } else {
        const vId = createVersionId(releaseId, docId)
        tx.create({
          _id: vId,
          _type: 'article',
          automationId: `cli-${group.command}-reference`,
          ...newDoc,
        })
        console.log(`  CREATE ${group.command} → ${docId} (${newBlocks.length} blocks)`)
      }
      created++
    }
  }

  if (!dryRun) {
    try {
      console.log(`Committing transaction...`)
      await tx.commit({autoGenerateArrayKeys: true})
    } catch (error) {
      console.error(`Error committing transaction: ${error}`)
      process.exit(1)
    }
  }

  console.log(`\n── Summary ──`)
  console.log(`Release: ${releaseId}`)
  console.log(`Updated: ${updated} existing documents`)
  console.log(`Created: ${created} new documents`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Total:   ${updated + created + skipped}`)
  if (dryRun) {
    console.log(`\n[DRY RUN] No changes were made to Sanity.`)
  } else {
    console.log(`\nAll changes are in release "${releaseId}". Review and publish in Sanity Studio.`)
  }
}

try {
  await main()
} catch (err) {
  console.error('Fatal error:', err)
  process.exit(1)
}

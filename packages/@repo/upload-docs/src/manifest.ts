/* eslint-disable no-console -- CLI script that logs progress to stdout/stderr */
/**
 * manifest.ts
 *
 * Loads CLI commands via generateCommands() and writes/updates Sanity documents
 * for each CLI command group. All changes are batched into a content release.
 *
 * Usage: npx tsx manifest.ts [--dry-run]
 *
 * Requires: SANITY_DOCS_API_TOKEN env var (unless --dry-run)
 * Pass in SANITY_PROJECT_ID and SANITY_DATASET to use a different project/dataset
 */

import {createClient, type SanityClient, type SanityDocument} from '@sanity/client'
import {createPublishedId, createVersionId} from '@sanity/id-utils'

import {type CommandInfo, generateCommands} from './generateCommands.js'

// ── Types ──────────────────────────────────────────────────────────────

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
 * Build a help text string from a CommandInfo object.
 * Produces output in the same format as `sanity <command> --help`.
 */
function getFlagValue(flag: {helpValue?: string | string[]; type: string}): string {
  if (flag.type === 'boolean') return ''
  if (flag.helpValue) {
    return Array.isArray(flag.helpValue) ? flag.helpValue[0] : flag.helpValue
  }
  return '<value>'
}

function formatUsageFlag(flag: {
  char?: string
  helpValue?: string | string[]
  name: string
  type: string
}): string {
  if (flag.type === 'boolean') {
    return `[--${flag.name}]`
  }
  const val = getFlagValue(flag)
  return flag.char ? `[-${flag.char} ${val}]` : `[--${flag.name} ${val}]`
}

function formatFlagLabel(flag: {
  char?: string
  helpValue?: string | string[]
  name: string
  type: string
}): string {
  const charPart = flag.char ? `-${flag.char},` : '   '
  const valuePart = flag.type === 'option' ? `=${getFlagValue(flag)}` : ''
  return `  ${charPart} --${flag.name}${valuePart}`
}

function renderFlagGroup(
  header: string,
  flags: Array<{
    char?: string
    description?: string
    helpValue?: string | string[]
    name: string
    type: string
  }>,
): string[] {
  const lines: string[] = []
  const labels = flags.map((f) => formatFlagLabel(f))
  const maxWidth = Math.max(...labels.map((l) => l.length)) + 2

  lines.push(header)
  for (const [i, flag] of flags.entries()) {
    const label = labels[i]
    lines.push(flag.description ? `${label.padEnd(maxWidth)}${flag.description}` : label)
  }
  return lines
}

function sortFlags<T extends {char?: string; name: string}>(flags: T[]): T[] {
  return flags.toSorted((a, b) => {
    if (a.char && b.char) return a.char.localeCompare(b.char)
    if (a.char && !b.char) return -1
    if (!a.char && b.char) return 1
    return a.name.localeCompare(b.name)
  })
}

function buildHelpText(cmd: CommandInfo): string {
  const sections: string[] = []

  const visibleFlags = sortFlags(Object.values(cmd.flags).filter((f) => !f.hidden))
  const visibleArgs = Object.values(cmd.args).filter((a) => !a.hidden)

  // USAGE — with flag summary in brackets
  const argsPart = visibleArgs
    .map((a) => (a.required ? a.name.toUpperCase() : `[${a.name.toUpperCase()}]`))
    .join(' ')
  const flagSummary = visibleFlags.map((f) => formatUsageFlag(f)).join(' ')
  const usageParts = [cmd.fullCommand, argsPart, flagSummary].filter(Boolean).join(' ')
  sections.push(`USAGE\n  $ sanity ${usageParts}`)

  // ARGUMENTS — dynamic padding
  if (visibleArgs.length > 0) {
    const argLines: string[] = ['ARGUMENTS']
    const argLabels = visibleArgs.map((a) =>
      a.required ? a.name.toUpperCase() : `[${a.name.toUpperCase()}]`,
    )
    const maxArgWidth = Math.max(...argLabels.map((l) => l.length)) + 2
    for (const [i, arg] of visibleArgs.entries()) {
      const label = argLabels[i]
      argLines.push(`  ${label.padEnd(maxArgWidth)}${arg.description ?? ''}`)
    }
    sections.push(argLines.join('\n'))
  }

  // FLAGS — grouped by helpGroup
  const mainFlags = visibleFlags.filter((f) => !f.helpGroup)
  const groupedFlags = new Map<string, typeof visibleFlags>()
  for (const flag of visibleFlags) {
    if (flag.helpGroup) {
      const group = groupedFlags.get(flag.helpGroup) ?? []
      group.push(flag)
      groupedFlags.set(flag.helpGroup, group)
    }
  }

  if (mainFlags.length > 0) {
    sections.push(renderFlagGroup('FLAGS', mainFlags).join('\n'))
  }
  for (const [groupName, flags] of groupedFlags) {
    sections.push(renderFlagGroup(`${groupName} FLAGS`, flags).join('\n'))
  }

  // DESCRIPTION
  if (cmd.description) {
    sections.push(`DESCRIPTION\n  ${cmd.description.trim().replaceAll('\n', '\n  ')}`)
  }

  // EXAMPLES — with $ prefix on command lines
  if (cmd.examples.length > 0) {
    const exLines: string[] = ['EXAMPLES']
    for (const ex of cmd.examples) {
      if (typeof ex === 'string') {
        exLines.push(`    $ ${ex}`, '')
      } else {
        if (ex.description) {
          exLines.push(`  ${ex.description}`, '')
        }
        exLines.push(`    $ ${ex.command}`, '')
      }
    }
    sections.push(exLines.join('\n').trimEnd())
  }

  return sections.join('\n\n')
}

// ── Command Grouping ──────────────────────────────────────────────────

/**
 * Group CommandInfo[] into CommandGroup objects.
 *
 * Command hierarchy uses colon separators in the command ID:
 * - "build"                  → standalone group
 * - "backup:enable"          → group "backup" with subcommand "enable"
 * - "dataset:alias:create"   → group "dataset" → sub-group "alias" → action "create"
 */
function groupCommands(commands: CommandInfo[]): CommandGroup[] {
  const groupMap = new Map<string, CommandGroup>()
  const groupOrder: string[] = []

  for (const cmd of commands) {
    const parts = cmd.id.split(':')
    const groupName = parts[0]
    const description = cmd.description

    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, {command: groupName, description: '', subcommands: []})
      groupOrder.push(groupName)
    }

    const group = groupMap.get(groupName)!

    if (parts.length === 1) {
      group.fullCommand = `sanity ${cmd.fullCommand}`
      group.helpText = buildHelpText(cmd)
      if (!group.description) group.description = description
    } else if (parts.length === 2) {
      group.subcommands.push({
        description,
        fullCommand: `sanity ${cmd.fullCommand}`,
        helpText: buildHelpText(cmd),
        name: parts[1],
      })
      if (!group.description) group.description = description
    } else {
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
        fullCommand: `sanity ${cmd.fullCommand}`,
        helpText: buildHelpText(cmd),
        name: actionName,
      })

      if (!group.description) group.description = description
    }
  }

  return groupOrder.map((name) => groupMap.get(name)!)
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
    commandsH2Idx > firstCodeIdx + 1 ? existingContent.slice(firstCodeIdx + 1, commandsH2Idx) : []

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

  const token = process.env.SANITY_DOCS_API_TOKEN
  if (!token && !dryRun) {
    console.error('Error: SANITY_DOCS_API_TOKEN environment variable is required')
    process.exit(1)
  }

  const commands = await generateCommands()
  const groups = groupCommands(commands)
  console.log(`Loaded ${commands.length} commands into ${groups.length} command groups`)

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

  const CLI_DOCS_QUERY = /* groq */ `*[_type == "article" && defined(automationId)]`
  const existingDocs = await client.fetch(CLI_DOCS_QUERY)
  const existingDocMap = new Map(existingDocs.map((doc: SanityDocument) => [doc.automationId, doc]))

  const tx = client.transaction()

  for (const group of groups) {
    const newBlocks = generateCommandContent(group)

    if (newBlocks.length === 0) {
      console.log(`  SKIP ${group.command} — no helpText or subcommands`)
      skipped++
      continue
    }

    const existingDoc = existingDocMap.get(`cli-${group.command}-reference`) as SanityDocument

    if (existingDoc) {
      if (dryRun) {
        console.log(`  UPDATE ${group.command} → ${existingDoc._id} (${newBlocks.length} blocks)`)
      } else {
        const existingContent = (existingDoc.content as Record<string, unknown>[]) || []
        const headingKeyMap = buildHeadingKeyMap(existingContent)
        const mergedContent = applyExistingKeys(
          mergeContent(existingContent, newBlocks),
          headingKeyMap,
        )

        const vId = createVersionId(releaseId, existingDoc._id)
        const {_createdAt, _rev, _updatedAt, ...docWithoutSystemFields} = existingDoc
        tx.create({...docWithoutSystemFields, _id: vId})
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

  try {
    console.log(`Committing transaction...`)
    await tx.commit({autoGenerateArrayKeys: true})
  } catch (error) {
    console.error(`Error committing transaction: ${error}`)
    process.exit(1)
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

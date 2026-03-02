/* eslint-disable no-console */
/**
 * index.ts
 *
 * Parses the cli README.md and writes/updates Sanity documents
 * for each CLI command group. All changes are batched into a content release.
 *
 * Usage: pnpm run upload
 *
 *
 * Requires: SANITY_DOCS_API_TOKEN env var (unless --dry-run)
 * Pass in SANITY_PROJECT_ID and SANITY_DATASET to use a different project/dataset
 */

import {readFileSync} from 'node:fs'

import {createClient, type SanityClient, type SanityDocument} from '@sanity/client'
import {createPublishedId, createVersionId} from '@sanity/id-utils'

// ── Types ──────────────────────────────────────────────────────────────

interface CommandEntry {
  description: string
  fullCommand: string
  helpText: string
  name: string

  sourceUrl?: string
  subcommands?: CommandEntry[]
}

interface CommandGroup {
  command: string
  description: string
  subcommands: CommandEntry[]

  fullCommand?: string
  helpText?: string
  sourceUrl?: string
}

interface RawCommand {
  description: string
  fullCommand: string
  helpText: string

  sourceUrl?: string
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

// ── README Parsing ────────────────────────────────────────────────────

/**
 * Split the README into individual command sections.
 * Each section starts with `## sanity ...` and ends before the next `## ` heading.
 */
function splitIntoCommandSections(content: string): string[] {
  const lines = content.split('\n')
  const sections: string[] = []
  let current: string[] | null = null

  for (const line of lines) {
    if (/^## `sanity\s/.test(line)) {
      if (current !== null) {
        sections.push(current.join('\n'))
      }
      current = [line]
    } else if (current !== null) {
      if (line.startsWith('## ') && !/^## `sanity\s/.test(line)) {
        sections.push(current.join('\n'))
        current = null
      } else {
        current.push(line)
      }
    }
  }

  if (current !== null) {
    sections.push(current.join('\n'))
  }

  return sections
}

/**
 * Parse a single command section into a RawCommand.
 */
function parseCommandSection(section: string): RawCommand {
  const lines = section.split('\n')

  // 1. Extract full command from heading: ## `sanity <command> [args]`
  const headingMatch = lines[0].match(/^## `(sanity\s.+?)`\s*$/)
  if (!headingMatch) {
    throw new Error(`Failed to parse heading: ${lines[0]}`)
  }
  const fullCommand = headingMatch[1]

  // 2. Extract description — first non-empty line after the heading
  let description = ''
  let descIdx = 1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      description = lines[i].trim()
      descIdx = i
      break
    }
  }

  // 3. Extract help text from the first fenced code block
  let inCodeBlock = false
  const codeLines: string[] = []
  for (let i = descIdx + 1; i < lines.length; i++) {
    if (!inCodeBlock && lines[i].trim() === '```') {
      inCodeBlock = true
      continue
    }
    if (inCodeBlock) {
      if (lines[i].trim() === '```') {
        break
      }
      codeLines.push(lines[i])
    }
  }
  const helpText = codeLines.join('\n')

  // 4. Extract source URL from _See code: [...]_ line
  let sourceUrl: string | undefined
  for (let i = lines.length - 1; i >= 0; i--) {
    const seeCodeMatch = lines[i].match(/_See code:\s*\[.*?\]\((.*?)\)_/)
    if (seeCodeMatch) {
      sourceUrl = seeCodeMatch[1]
      break
    }
  }

  return {description, fullCommand, helpText, sourceUrl}
}

/**
 * Group raw commands into CommandGroup objects with proper nesting.
 *
 * Command hierarchy:
 * - `sanity <word>` → standalone group
 * - `sanity <group> <action>` → group with subcommand
 * - `sanity <group> <subgroup> <action>` → group with nested subgroup
 */
function groupCommands(rawCommands: RawCommand[]): CommandGroup[] {
  const groupMap = new Map<string, CommandGroup>()
  const groupOrder: string[] = []

  for (const raw of rawCommands) {
    const parts = raw.fullCommand.split(/\s+/)
    const commandParts = parts.slice(1)

    // Separate command words from arguments
    const cmdWords: string[] = []
    for (const part of commandParts) {
      if (
        part.startsWith('[') ||
        part.startsWith('-') ||
        part.startsWith('<') ||
        (part === part.toUpperCase() && part.length > 1 && /^[A-Z]/.test(part))
      ) {
        break
      }
      cmdWords.push(part)
    }

    if (cmdWords.length === 0) {
      throw new Error(`No command words found in: ${raw.fullCommand}`)
    }

    const groupName = cmdWords[0]

    if (cmdWords.length === 1) {
      if (groupMap.has(groupName)) {
        const group = groupMap.get(groupName)!
        group.fullCommand = raw.fullCommand
        group.helpText = raw.helpText
        group.sourceUrl = raw.sourceUrl
        if (!group.description) {
          group.description = raw.description
        }
      } else {
        groupMap.set(groupName, {
          command: groupName,
          description: raw.description,
          fullCommand: raw.fullCommand,
          helpText: raw.helpText,
          sourceUrl: raw.sourceUrl,
          subcommands: [],
        })
        groupOrder.push(groupName)
      }
    } else if (cmdWords.length === 2) {
      const subName = cmdWords[1]

      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, {
          command: groupName,
          description: '',
          subcommands: [],
        })
        groupOrder.push(groupName)
      }

      const group = groupMap.get(groupName)!
      group.subcommands.push({
        description: raw.description,
        fullCommand: raw.fullCommand,
        helpText: raw.helpText,
        name: subName,
        sourceUrl: raw.sourceUrl,
      })

      if (!group.description) {
        group.description = raw.description
      }
    } else {
      const subGroupName = cmdWords[1]
      const actionName = cmdWords.slice(2).join(' ')

      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, {
          command: groupName,
          description: '',
          subcommands: [],
        })
        groupOrder.push(groupName)
      }

      const group = groupMap.get(groupName)!

      let subGroup = group.subcommands.find((s) => s.name === subGroupName)
      if (!subGroup) {
        subGroup = {
          description: '',
          fullCommand: `sanity ${groupName} ${subGroupName}`,
          helpText: '',
          name: subGroupName,
          subcommands: [],
        }
        group.subcommands.push(subGroup)
      }

      if (!subGroup.subcommands) {
        subGroup.subcommands = []
      }

      subGroup.subcommands.push({
        description: raw.description,
        fullCommand: raw.fullCommand,
        helpText: raw.helpText,
        name: actionName,
        sourceUrl: raw.sourceUrl,
      })

      if (!subGroup.description) {
        subGroup.description = `${subGroupName} commands for ${groupName}`
      }

      if (!group.description) {
        group.description = raw.description
      }
    }
  }

  return groupOrder.map((name) => groupMap.get(name)!)
}

function parseReadme(content: string): CommandGroup[] {
  const sections = splitIntoCommandSections(content)
  console.log(`Parsed ${sections.length} README sections`)
  const rawCommands = sections.map((s) => parseCommandSection(s))
  return groupCommands(rawCommands)
}

// ── Heading Key Preservation ──────────────────────────────────────────

/**
 * Build a lookup map of "style:text" → _key from existing heading blocks.
 * Used to preserve _key values for deep linking on the docs site.
 * While we could create predictable keys, this allows for backwards compatibility with existing content.
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
 * Generate the "new content" blocks for a command group.
 *
 * Standalone commands (no subcommands): a single code block with the README
 * help text. mergeContent always replaces the existing code block with this.
 *
 * Groups with subcommands: a starter `npx sanity <command> --help` code block
 * (preserved by mergeContent if one already exists) followed by a "Commands"
 * heading and subcommand sections.
 */
function generateCommandContent(group: CommandGroup) {
  const blocks: Record<string, unknown>[] = []

  if (group.subcommands.length === 0) {
    // Standalone command — use the README help text as the code block
    if (group.helpText) {
      blocks.push(makeCodeBlock(group.helpText))
    }
    return blocks
  }

  // Group with subcommands — starter npx code block + Commands section
  blocks.push(
    makeCodeBlock(`npx sanity ${group.command} --help`, 'sh'),
    makeHeading('Commands', 'h2', false),
  )

  // Each subcommand
  for (const sub of group.subcommands) {
    if (sub.subcommands && sub.subcommands.length > 0) {
      // Deep-nested: sub-group heading (h3) + nested commands (h4)
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
      // Flat subcommand: h3 + code block
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
 *
 * For groups with subcommands:
 *   Always replaces the top-level code block with the generated npx starter.
 *   Preserves intro text and middle blocks.
 *   Replaces the "Commands" h2 and everything after it.
 *   When no top-level code block exists, inserts the generated starter block.
 *
 * For standalone commands (no subcommands):
 *   Always replaces the top-level code block with the generated one (updated
 *   README help text). Preserves intro text and any content after the code block.
 */
function mergeContent(
  existingContent: Record<string, unknown>[],
  newBlocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  // newBlocks always starts with a generated codeBlock, followed by optional Commands section
  const [generatedCodeBlock, ...commandsSection] = newBlocks

  // Find the "Commands" h2 index (needed first to scope code block search)
  const commandsH2Idx = existingContent.findIndex(
    (b) =>
      b._type === 'block' &&
      b.style === 'h2' &&
      Array.isArray(b.children) &&
      (b.children as Array<{text?: string}>).some((c) => c.text === 'Commands'),
  )

  // Find the first codeBlock BEFORE the "Commands" h2.
  // Code blocks inside the Commands section belong to subcommands, not the top-level starter block.
  const firstCodeIdx = existingContent.findIndex(
    (b, i) => b._type === 'codeBlock' && (commandsH2Idx === -1 || i < commandsH2Idx),
  )

  if (firstCodeIdx === -1) {
    // No existing top-level code block — insert the generated one
    if (commandsH2Idx !== -1) {
      // Preserve intro up to the Commands h2, insert code block, replace Commands section
      return [...existingContent.slice(0, commandsH2Idx), generatedCodeBlock, ...commandsSection]
    }
    return [...existingContent, generatedCodeBlock, ...commandsSection]
  }

  // Everything before the first codeBlock is preserved intro
  const introBlocks = existingContent.slice(0, firstCodeIdx)

  // Everything between first codeBlock and Commands h2 is "middle" content to preserve
  let middleBlocks: Record<string, unknown>[] = []
  if (commandsH2Idx > firstCodeIdx + 1) {
    middleBlocks = existingContent.slice(firstCodeIdx + 1, commandsH2Idx)
  }

  if (commandsSection.length === 0) {
    // Standalone command — always replace the code block with updated help text
    if (commandsH2Idx !== -1) {
      return [...introBlocks, generatedCodeBlock, ...middleBlocks]
    }
    // No Commands section existed — replace code block, keep everything after it
    return [...introBlocks, generatedCodeBlock, ...existingContent.slice(firstCodeIdx + 1)]
  }

  // Group with subcommands — replace code block with npx starter, preserve middle, replace Commands section
  return [...introBlocks, generatedCodeBlock, ...middleBlocks, ...commandsSection]
}

/**
 * Build a complete new document for commands without existing docs.
 */
function buildNewDocument(group: CommandGroup, slug: string): Record<string, unknown> {
  const content = generateCommandContent(group)
  const title = group.command.charAt(0).toUpperCase() + group.command.slice(1)

  return {
    _type: 'article',
    content,
    description: `Reference documentation for the Sanity CLI ${group.command} command.`,
    layout: 'default',
    primarySection: {
      _ref: PRIMARY_SECTION_REF,
      _type: 'reference',
    },
    slug: {_type: 'slug', current: slug},
    title,
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const readmePath = args.find((a) => !a.startsWith('--'))

  if (!readmePath) {
    console.error('Usage: npx tsx update-cli-reference.ts <path-to-readme> [--dry-run]')
    process.exit(1)
  }

  const token = process.env.SANITY_DOCS_API_TOKEN
  if (!token && !dryRun) {
    console.error('Error: SANITY_DOCS_API_TOKEN environment variable is required')
    process.exit(1)
  }

  // Phase 1: Parse README
  const readmeContent = readFileSync(readmePath, 'utf8')
  const groups = parseReadme(readmeContent)
  console.log(`Grouped into ${groups.length} command groups`)

  // Create Sanity client
  const client: SanityClient = createClient({
    apiVersion: API_VERSION,
    dataset: DATASET,
    projectId: PROJECT_ID,
    token: token || 'dry-run-placeholder',
    useCdn: false,
  })

  // Phase 2: Create release
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19)
  const releaseId = `cli-reference-update-${timestamp}`

  if (dryRun) {
    console.log(`\n[DRY RUN] Release: ${releaseId}`)
  } else {
    console.log(`\nCreating release: ${releaseId}`)
    await client.releases.create({
      metadata: {
        releaseType: 'undecided',
        title: releaseId,
      },
      releaseId,
    })
    console.log('Release created.')
  }

  // Phase 3: Write documents
  let updated = 0
  let created = 0
  let skipped = 0

  const CLI_DOCS_QUERY = /* groq */ `*[_type == "article" && defined(automationId)]`
  const existingDocs = await client.fetch(CLI_DOCS_QUERY)
  const existingDocMap = new Map(existingDocs.map((doc: SanityDocument) => [doc.automationId, doc]))

  const tx = client.transaction()
  for (const group of groups) {
    const newBlocks = generateCommandContent(group)
    const existingDoc = existingDocMap.get(`cli-${group.command}-reference`) as SanityDocument

    if (newBlocks.length === 0) {
      console.log(`  SKIP ${group.command} — no helpText or subcommands`)
      skipped++
      continue
    }

    if (existingDoc) {
      // ── Update existing document ──
      if (dryRun) {
        console.log(`  UPDATE ${group.command} → ${existingDoc._id} (${newBlocks.length} blocks)`)
      } else {
        const existingContent = (existingDoc.content as Record<string, unknown>[]) || []

        // Preserve heading _key values for deep linking
        const headingKeyMap = buildHeadingKeyMap(existingContent)
        const mergedContent = applyExistingKeys(
          mergeContent(existingContent, newBlocks),
          headingKeyMap,
        )

        // Create version in release (create from published w/ patched content)
        const vId = createVersionId(releaseId, existingDoc._id)
        tx.create({
          ...existingDoc,
          _id: vId,
        })
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
      // ── Create new document ──
      const docId = createPublishedId()
      const slug = `cli-${group.command}`
      const newDoc = buildNewDocument(group, slug)

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

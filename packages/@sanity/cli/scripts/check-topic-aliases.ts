/**
 * Topic Alias Consistency Checker
 *
 * Validates that every CLI topic is declared in the config, and that
 * renamed topics have the correct `hiddenAliases` on each command.
 *
 * Topics not yet renamed are handled at runtime by the command_not_found hook,
 * so the checker only enforces hiddenAliases for topics where the directory
 * has actually been renamed to the canonical name.
 *
 * Run after building / generating the oclif manifest:
 *   tsx scripts/check-topic-aliases.ts
 */

/* eslint-disable no-console */
import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {topicAliases} from '../src/topicAliases.ts'

// ---------------------------------------------------------------------------
// Additional topics that exist in the manifest but don't need aliases.
// Every topic must be accounted for - either in topicAliases (with or without
// aliases) or in this set. This ensures new topics are explicitly acknowledged.
//
// These are kept here rather than in topicAliases to avoid polluting the
// runtime config with topics that will never have aliases.
// ---------------------------------------------------------------------------
const knownTopicsWithoutAliases: Set<string> = new Set([
  'cors',
  'docs',
  'graphql',
  'manifest',
  'mcp',
  'media',
  'openapi',
  'telemetry',
])

// Topics provided by oclif plugins (not in our manifest, but resolved at runtime).
// The checker skips manifest validation for these - the hook handles them.
const pluginTopics: Set<string> = new Set(['blueprints', 'functions'])

// ---------------------------------------------------------------------------
// Manifest types (subset of oclif manifest structure)
// ---------------------------------------------------------------------------
interface ManifestCommand {
  aliases: string[]
  hiddenAliases: string[]
  id: string
}

interface Manifest {
  commands: Record<string, ManifestCommand>
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
  const manifestPath = join(packageDir, 'oclif.manifest.json')

  let manifest: Manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  } catch {
    console.error(`Failed to read manifest at ${manifestPath}`)
    console.error('Run "pnpm build:cli" first to generate the oclif manifest.')
    process.exitCode = 1
    return
  }

  const commandIds = Object.keys(manifest.commands)
  const errors: string[] = []

  // Build set of topics found in the manifest (first segment of command IDs with a colon)
  const manifestTopics = new Set<string>()
  for (const id of commandIds) {
    const colonIndex = id.indexOf(':')
    if (colonIndex !== -1) {
      manifestTopics.add(id.slice(0, colonIndex))
    }
  }

  // Collect all topic names mentioned in topicAliases (both keys and values)
  const allAliasedNames = new Set<string>()
  for (const [canonical, aliases] of Object.entries(topicAliases)) {
    allAliasedNames.add(canonical)
    for (const alias of aliases) {
      allAliasedNames.add(alias)
    }
  }

  // Check 1: Every manifest topic must be declared somewhere
  for (const topic of manifestTopics) {
    if (!allAliasedNames.has(topic) && !knownTopicsWithoutAliases.has(topic)) {
      errors.push(
        `Topic "${topic}" found in manifest but not declared.\n` +
          `  Add it to knownTopicsWithoutAliases in check-topic-aliases.ts,\n` +
          `  or add it to topicAliases in src/topicAliases.ts if it needs aliases.`,
      )
    }
  }

  // Check 2: Every declared topic should have commands in the manifest
  // (either under the canonical name or under one of its aliases)
  // Plugin-provided topics are skipped since their commands aren't in our manifest.
  for (const [canonical, aliases] of Object.entries(topicAliases)) {
    if (pluginTopics.has(canonical) || aliases.some((a) => pluginTopics.has(a))) continue

    const hasCanonicalCommands = commandIds.some((id) => id.startsWith(`${canonical}:`))
    const hasAliasCommands = aliases.some((alias) =>
      commandIds.some((id) => id.startsWith(`${alias}:`)),
    )
    if (!hasCanonicalCommands && !hasAliasCommands) {
      errors.push(
        `Topic "${canonical}" declared in topicAliases but no commands found in manifest\n` +
          `  (checked both "${canonical}" and aliases: ${aliases.join(', ')}).\n` +
          `  Remove it from topicAliases or check if the topic was renamed/deleted.`,
      )
    }
  }

  for (const topic of knownTopicsWithoutAliases) {
    if (!commandIds.some((id) => id.startsWith(`${topic}:`))) {
      errors.push(
        `Topic "${topic}" declared in knownTopicsWithoutAliases but no commands found in manifest.\n` +
          `  Remove it or check if the topic was renamed/deleted.`,
      )
    }
  }

  // Check 3: For topics where the directory HAS been renamed to the canonical name,
  // commands must have hiddenAliases for backwards compatibility.
  // (Topics not yet renamed are handled by the command_not_found hook at runtime.)
  for (const [canonical, aliases] of Object.entries(topicAliases)) {
    if (aliases.length === 0) continue

    // Only enforce hiddenAliases if the canonical topic has commands in the manifest
    // (meaning the directory has been renamed)
    const canonicalCommands = commandIds.filter((id) => id.startsWith(`${canonical}:`))
    if (canonicalCommands.length === 0) continue

    for (const id of canonicalCommands) {
      const command = manifest.commands[id]
      const commandAliases = new Set([...(command.aliases ?? []), ...(command.hiddenAliases ?? [])])

      for (const aliasTopic of aliases) {
        const expectedAlias = id.replace(`${canonical}:`, `${aliasTopic}:`)
        if (!commandAliases.has(expectedAlias)) {
          errors.push(
            `Command "${id}" is missing hiddenAlias "${expectedAlias}".\n` +
              `  Add to the command class: static override hiddenAliases: string[] = ['${expectedAlias}']`,
          )
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\nTopic alias check failed with ${errors.length} error(s):\n`)
    for (const error of errors) {
      console.error(`  ✗ ${error}\n`)
    }
    process.exitCode = 1
  } else {
    console.log('Topic alias check passed.')
  }
}

main()

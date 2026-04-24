/* eslint-disable no-console */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- bundled, not a runtime dep
import wrapAnsi from 'wrap-ansi'

import {
  type FlagDef,
  INIT_DESCRIPTION,
  initFlagDefs,
} from '../../@sanity/cli/src/actions/init/flags.js'
import {getCreateCommand} from './createCommand.js'

/**
 * Print help message and exit
 *
 * This is a custom implementation to avoid pulling in oclif as a dependency,
 * but it follows the same formatting principles to ensure a consistent experience
 * across Sanity CLIs.
 *
 * @internal
 */
export function printHelp(): never {
  const cmd = getCreateCommand({withFlagSeparator: true})
  const maxWidth = getTerminalWidth()
  const indent = 2

  // Build the list of visible flags with their labels
  const entries: Array<{desc: string; label: string}> = []
  for (const [name, def] of Object.entries<FlagDef>(initFlagDefs)) {
    if (def.hidden) continue

    let label: string
    if (def.helpLabel) {
      label = def.helpLabel
    } else {
      const prefix = def.allowNo ? '--[no-]' : '--'
      const flagPart = def.short ? `-${def.short}, ${prefix}${name}` : `    ${prefix}${name}`
      const valPart = def.type === 'string' && def.helpValue ? ` ${def.helpValue}` : ''
      label = flagPart + valPart
    }

    entries.push({desc: def.description || '', label})
  }

  // Add --help as the last entry
  entries.push({desc: 'Show this help message', label: '-h, --help'})

  // Measure the widest label to compute column widths
  let maxLabelWidth = 0
  for (const e of entries) {
    if (e.label.length > maxLabelWidth) maxLabelWidth = e.label.length
  }
  const gap = 2
  const leftColWidth = indent + maxLabelWidth + gap
  const descColWidth = Math.max(maxWidth - leftColWidth, 20)

  // Check if any description wraps to >4 lines - if so, use multiline format
  const useMultiline = entries.some((e) => {
    if (!e.desc) return false
    const wrapped = wrapAnsi(e.desc, descColWidth, {hard: true})
    return wrapped.split('\n').length > 4
  })

  // Usage
  const usageLine = `Usage: ${cmd} [options]`
  console.log(wrapAnsi(usageLine, maxWidth - indent, {hard: true}))
  console.log('')

  // Description
  console.log(wrapAnsi(INIT_DESCRIPTION, maxWidth - indent, {hard: true}))
  console.log('')

  // Flags
  console.log('Options:')
  for (const {desc, label} of entries) {
    if (useMultiline) {
      // Multiline format: label on its own line, description indented below
      console.log(`${' '.repeat(indent)}${label}`)
      if (desc) {
        const wrapped = wrapAnsi(desc, maxWidth - indent * 2, {hard: true})
        for (const line of wrapped.split('\n')) {
          console.log(`${' '.repeat(indent * 2)}${line}`)
        }
      }
      console.log('')
    } else {
      // Two-column format: wrap description, then indent each line to align
      const paddedLabel = `${' '.repeat(indent)}${label.padEnd(maxLabelWidth + gap)}`
      if (desc) {
        const wrapped = wrapAnsi(desc, descColWidth, {hard: true})
        const descLines = wrapped.split('\n')
        // First line sits next to the label
        console.log(`${paddedLabel}${descLines[0]}`)
        // Continuation lines are indented to align with the first description line
        const continuation = ' '.repeat(leftColWidth)
        for (let i = 1; i < descLines.length; i++) {
          console.log(`${continuation}${descLines[i]}`)
        }
      } else {
        console.log(paddedLabel)
      }
    }
  }

  process.exit(0)
}

/**
 * Detect terminal width using the same algorithm as oclif's help formatter
 *
 * @returns The width of the terminal in characters, with a sensible default if it cannot be determined
 * @internal
 */
function getTerminalWidth(): number {
  // OCLIF_COLUMNS overrides everything
  const env = Number.parseInt(process.env.OCLIF_COLUMNS!, 10)
  if (env) return env

  // Non-TTY (piped, redirected, CI) defaults to 80
  if (!process.stdout.isTTY) return 80

  const w = (process.stdout as {getWindowSize?: () => number[]}).getWindowSize?.()[0] ?? 80
  if (w < 1) return 80
  if (w < 40) return 40
  return w
}

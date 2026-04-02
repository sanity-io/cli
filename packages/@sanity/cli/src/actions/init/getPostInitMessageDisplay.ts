import {stripVTControlCharacters} from 'node:util'

import {type TemplateManifest} from './types.js'

function normalizeLines(rawLines: string[]): string[] | null {
  const lines = rawLines
    .map((line) => stripVTControlCharacters(line))
    .filter((line) => line.trim() !== '')

  return lines.length > 0 ? lines : null
}

/**
 * Normalizes the template manifest `postInitMessage` field into lines for the CLI to print.
 * Strips VT/ANSI-style escapes and removes blank-only entries; returns `null` when there is nothing to show.
 * String values are split on newlines so spacing matches an equivalent array of lines.
 */
export function getPostInitMessageDisplay(
  postInitMessage: TemplateManifest['postInitMessage'],
): string[] | null {
  if (!postInitMessage) return null

  if (Array.isArray(postInitMessage)) {
    return normalizeLines(postInitMessage)
  }

  return normalizeLines(postInitMessage.split(/\r?\n/))
}

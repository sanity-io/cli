import {inspect} from 'node:util'

import {ux} from '@oclif/core'

export function formatObject(obj: unknown): string {
  return inspect(obj, {colors: true, depth: +Infinity})
}

export function printKeyValue(obj: Record<string, unknown>): void {
  let printedLines = 0
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      ux.stdout(`  ${key}: ${formatObject(obj[key])}`)
      printedLines++
    }
  }

  if (printedLines > 0) {
    ux.stdout('')
  }
}

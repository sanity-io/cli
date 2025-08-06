
import {ux} from '@oclif/core'

import {formatObject} from './formatObject.js'

export function printKeyValue(obj: Record<string, any>): void {
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

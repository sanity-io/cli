import {inspect} from 'node:util'

export function formatObject(obj: Record<string, any>): string {
  return inspect(obj, {colors: true, depth: +Infinity})
}

import {inspect} from 'node:util'

export function formatObject(obj: unknown): string {
  return inspect(obj, {colors: true, depth: +Infinity})
}

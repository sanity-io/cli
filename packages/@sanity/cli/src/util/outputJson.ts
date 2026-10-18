import {type Output} from '@sanity/cli-core'

export function outputJson(output: Output, value: unknown): void {
  if (output.logJson) {
    output.logJson(value)
    return
  }
  output.log(JSON.stringify(value, null, 2))
}

import {Output} from '@sanity/cli-core'
import dotenv from 'dotenv'

interface ParseAndUpdateEnvVarsOptions {
  envVars: Record<string, string>
  fileContents: string
  log: boolean
  output: Output
}

export function parseAndUpdateEnvVars({
  envVars,
  fileContents,
  log,
  output,
}: ParseAndUpdateEnvVarsOptions): string {
  const existingKeys = dotenv.parse(fileContents) // this will contain all vars
  const updatedKeys: Record<string, string> = {} // this will only contain our vars

  // find and update keys
  for (const [key, value] of Object.entries(envVars)) {
    if (!existingKeys[key]) {
      updatedKeys[key] = value

      if (!log) {
        output.log(`Appended ${key}="${envVars[key]}"`)
      }

      continue
    }

    if (!log) {
      output.log(`Found existing ${key}, replacing value.`)
    }
    updatedKeys[key] = value
  }

  // clone fileContents and replace existing keys by string matching
  let updatedEnv = fileContents
  for (const [key, value] of Object.entries(updatedKeys)) {
    if (existingKeys[key]) {
      const existingValue = existingKeys[key]

      updatedEnv = updatedEnv
        .split('\n')
        .map((line) => {
          if (
            !line.trim().startsWith('#') && // ignore comments
            new RegExp(String.raw`(^\s*${key})((: )|( *=))`).test(line) // match key
          ) {
            return line.replace(existingValue, value)
          }
          return line
        })
        .join('\n')
    } else {
      updatedEnv = `${updatedEnv.trim()}\n${key}="${value}"`
    }
  }

  // if file is empty, add a newline
  return `${updatedEnv}${fileContents === '' ? '\n' : ''}`
}

import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {cwd} from 'node:process'

export const GITIGNORE_FOR_FUNCTIONS = `
# Sanity Functions
functions/**/.env*
functions/**/.build/
functions/**/node_modules/
`
export const GITIGNORE_TEMPLATE = `node_modules
.env
${GITIGNORE_FOR_FUNCTIONS}
`
export type GitignoreResult = {action: 'created' | 'unchanged' | 'updated'}

export function writeGitignoreFile(nearFilePath: string): GitignoreResult {
  const dir = nearFilePath ? dirname(nearFilePath) : cwd()
  const gitignorePath = join(dir, '.gitignore')
  const gitignoreExists = existsSync(gitignorePath)

  let content = GITIGNORE_TEMPLATE
  if (gitignoreExists) {
    // append GITIGNORE_FOR_FUNCTIONS to existing .gitignore
    const existingContent = readFileSync(gitignorePath, 'utf8').toString()
    if (existingContent.includes(GITIGNORE_FOR_FUNCTIONS)) return {action: 'unchanged'}
    content = `${existingContent.trimEnd()}\n${GITIGNORE_FOR_FUNCTIONS}`
  }

  writeFileSync(gitignorePath, content)
  return {action: gitignoreExists ? 'updated' : 'created'}
}

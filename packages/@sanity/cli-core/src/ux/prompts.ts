import * as inquirer from '@inquirer/prompts'

import {NonInteractiveError} from '../errors/NonInteractiveError.js'
import {isInteractive} from '../util/isInteractive.js'
import {roleChecklist as roleChecklistPrompt} from './roleChecklist.js'
import {withPromptStatus} from './terminalStatus.js'

export {Separator} from '@inquirer/prompts'

function assertInteractive(promptName: string): void {
  if (!isInteractive()) {
    throw new NonInteractiveError(promptName)
  }
}

export const checkbox: typeof inquirer.checkbox = (...args) => {
  assertInteractive('checkbox')
  return withPromptStatus('question', args[0].message, () => inquirer.checkbox(...args))
}

export const confirm: typeof inquirer.confirm = (...args) => {
  assertInteractive('confirm')
  return withPromptStatus('permission', args[0].message, () => inquirer.confirm(...args))
}

export const editor: typeof inquirer.editor = (...args) => {
  assertInteractive('editor')
  return withPromptStatus('question', args[0].message, () => inquirer.editor(...args))
}

export const expand: typeof inquirer.expand = (...args) => {
  assertInteractive('expand')
  return withPromptStatus('question', args[0].message, () => inquirer.expand(...args))
}

export const input: typeof inquirer.input = (...args) => {
  assertInteractive('input')
  return withPromptStatus('question', args[0].message, () => inquirer.input(...args))
}

export const number: typeof inquirer.number = (...args) => {
  assertInteractive('number')
  return withPromptStatus('question', args[0].message, () => inquirer.number(...args))
}

export const password: typeof inquirer.password = (...args) => {
  assertInteractive('password')
  return withPromptStatus('auth', args[0].message, () => inquirer.password(...args))
}

export const rawlist: typeof inquirer.rawlist = (...args) => {
  assertInteractive('rawlist')
  return withPromptStatus('question', args[0].message, () => inquirer.rawlist(...args))
}

export const roleChecklist: typeof roleChecklistPrompt = (...args) => {
  assertInteractive('roleChecklist')
  return withPromptStatus('question', args[0].message, () => roleChecklistPrompt(...args))
}

export const search: typeof inquirer.search = (...args) => {
  assertInteractive('search')
  return withPromptStatus('question', args[0].message, () => inquirer.search(...args))
}

export const select: typeof inquirer.select = (...args) => {
  assertInteractive('select')
  return withPromptStatus('question', args[0].message, () => inquirer.select(...args))
}

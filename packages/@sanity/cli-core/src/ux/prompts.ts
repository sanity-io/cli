import * as inquirer from '@inquirer/prompts'

import {NonInteractiveError} from '../errors/NonInteractiveError.js'
import {isInteractive} from '../util/isInteractive.js'

export {Separator} from '@inquirer/prompts'

function assertInteractive(promptName: string): void {
  if (!isInteractive()) {
    throw new NonInteractiveError(promptName)
  }
}

export const checkbox: typeof inquirer.checkbox = (...args) => {
  assertInteractive('checkbox')
  return inquirer.checkbox(...args)
}

export const confirm: typeof inquirer.confirm = (...args) => {
  assertInteractive('confirm')
  return inquirer.confirm(...args)
}

export const editor: typeof inquirer.editor = (...args) => {
  assertInteractive('editor')
  return inquirer.editor(...args)
}

export const expand: typeof inquirer.expand = (...args) => {
  assertInteractive('expand')
  return inquirer.expand(...args)
}

export const input: typeof inquirer.input = (...args) => {
  assertInteractive('input')
  return inquirer.input(...args)
}

export const number: typeof inquirer.number = (...args) => {
  assertInteractive('number')
  return inquirer.number(...args)
}

export const password: typeof inquirer.password = (...args) => {
  assertInteractive('password')
  return inquirer.password(...args)
}

export const rawlist: typeof inquirer.rawlist = (...args) => {
  assertInteractive('rawlist')
  return inquirer.rawlist(...args)
}

export const search: typeof inquirer.search = (...args) => {
  assertInteractive('search')
  return inquirer.search(...args)
}

export const select: typeof inquirer.select = (...args) => {
  assertInteractive('select')
  return inquirer.select(...args)
}

import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Command, Config} from '@oclif/core'
import {type Hook, type Hooks} from '@oclif/core/hooks'

import {captureOutput} from './captureOutput.js'

interface Options {
  Command?: Command.Loadable
  context?: Hook.Context
}

export async function testHook<T extends keyof Hooks>(hook: Hook<T>, options?: Options) {
  const config = await Config.load({
    root: path.resolve(fileURLToPath(import.meta.url), '../../../../cli'),
  })

  const contextDefault = {
    config,
    debug: console.log,
    error: console.error,
    exit: process.exit,
    log: console.log,
    warn: console.warn,
  }

  const {Command, context = contextDefault} = options ?? {}

  const commandInstancePromise = () =>
    hook.call(context, {
      argv: [],
      Command,
      config,
      context,
    })

  return captureOutput(commandInstancePromise)
}

import {startAppDevServer} from './startAppDevServer.js'
import {startStudioDevServer} from './startStudioDevServer.js'
import {type DevActionOptions} from './types.js'

export function devAction(options: DevActionOptions): Promise<{close?: () => Promise<void>}> {
  return options.isApp ? startAppDevServer(options) : startStudioDevServer(options)
}

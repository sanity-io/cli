#!/usr/bin/env node
import {execute, settings} from '@oclif/core'

var err = '\u001B[31m\u001B[1mERROR:\u001B[22m\u001B[39m '
var nodeVersionParts = process.version.replace(/^v/i, '').split('.').map(Number)

var majorVersion = nodeVersionParts[0]
var minorVersion = nodeVersionParts[1]

function isSupportedNodeVersion(major, minor) {
  if (major === 22 && minor >= 12) return true
  if (major > 22) return true
  return false
}

if (!isSupportedNodeVersion(majorVersion, minorVersion)) {
  // eslint-disable-next-line no-console
  console.error(`${err}Node.js version >=22.12 required. You are running ${process.version}`)
  // eslint-disable-next-line no-console
  console.error('')
  process.exit(1)
}

settings.enableAutoTranspile = false

await execute({dir: import.meta.url})

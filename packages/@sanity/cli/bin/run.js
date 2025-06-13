#!/usr/bin/env node

import {execute} from '@oclif/core'

var err = '\u001B[31m\u001B[1mERROR:\u001B[22m\u001B[39m '
var nodeVersionParts = process.version.replace(/^v/i, '').split('.').map(Number)

var majorVersion = nodeVersionParts[0]
var minorVersion = nodeVersionParts[1]
if (majorVersion < 20 || (majorVersion === 20 && minorVersion < 11)) {
  console.error(
    `${err}Node.js version 20.11 or higher required. You are running ${process.version}`,
  )
  console.error('')
  process.exit(1)
}

await execute({dir: import.meta.url})

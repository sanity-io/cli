#!/usr/bin/env node
import {execute} from '@oclif/core'

var err = '\u001B[31m\u001B[1mERROR:\u001B[22m\u001B[39m '
var nodeVersionParts = process.version.replace(/^v/i, '').split('.').map(Number)

var majorVersion = nodeVersionParts[0]
var minorVersion = nodeVersionParts[1]
var patchVersion = nodeVersionParts[2]

function isSupportedNodeVersion(major, minor, patch) {
  if (major === 20) {
    if (minor > 19) return true
    if (minor === 19 && patch >= 1) return true
    return false
  }
  if (major === 21) return true
  if (major === 22 && minor >= 12) return true
  if (major > 22) return true
  return false
}

if (!isSupportedNodeVersion(majorVersion, minorVersion, patchVersion)) {
  console.error(
    `${err}Node.js version >=20.19.1 <22 or >=22.12 required. You are running ${process.version}`,
  )
  console.error('')
  process.exit(1)
}

await execute({dir: import.meta.url})

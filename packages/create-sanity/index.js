#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) {
  // eslint-disable-next-line no-console
  console.error(
    `\u001B[31m\u001B[1mERROR:\u001B[22m\u001B[39m Node.js version >=22.12 required. You are running ${process.version}\n`,
  )
  process.exit(1)
}

const {main} = await import('./dist/index.js')
process.exitCode = await main(process.argv.slice(2))

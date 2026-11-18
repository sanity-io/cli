/* eslint-disable @typescript-eslint/no-require-imports, no-console, no-undef */
const {join} = require('node:path')

console.log(
  JSON.stringify({
    argv: process.argv,
    joined: join('a', 'b'),
    success: true,
  }),
)

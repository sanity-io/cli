#!/usr/bin/env node
import {resolve} from 'node:path'
import {parseArgs} from 'node:util'

const args = process.argv.slice(2)

try {
  const options = getBlueprintOptions(args)
  if (options) {
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- load Blueprint setup after routing
    const {bootstrapBlueprint} = await import('./bootstrapBlueprint.js')
    await bootstrapBlueprint(options, (message) => process.stdout.write(`${message}\n`))
  } else {
    // eslint-disable-next-line eslint-js/no-restricted-syntax -- load the full CLI installer on demand
    const {runInit} = await import('./runInit.js')
    process.exitCode = await runInit(args)
  }
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
}

function getBlueprintOptions(argv) {
  if (!argv.includes('--with-blueprints')) return

  let values
  try {
    values = parseArgs({
      args: argv,
      options: {
        dataset: {type: 'string'},
        organization: {type: 'string'},
        'output-path': {type: 'string'},
        project: {short: 'p', type: 'string'},
        'project-name': {type: 'string'},
        visibility: {type: 'string'},
        'with-blueprints': {type: 'boolean'},
        yes: {short: 'y', type: 'boolean'},
      },
    }).values
  } catch {
    return
  }

  const {dataset, organization, project, visibility} = values
  const projectName = values['project-name']?.trim()
  if (!values['with-blueprints'] || !dataset) return
  if (visibility !== undefined && visibility !== 'public') return
  const existingProject =
    project && values['project-name'] === undefined && organization === undefined
  const newProject = project === undefined && projectName && organization
  if (!existingProject && !newProject) return

  const unattended =
    Boolean(values.yes) ||
    !process.stdin.isTTY ||
    process.env.TERM === 'dumb' ||
    'CI' in process.env
  const path = values['output-path']

  return {
    dataset,
    organization,
    outputPath: path || unattended ? resolve(path ?? '.') : undefined,
    project,
    projectName,
    token: process.env.SANITY_AUTH_TOKEN?.trim(),
    unattended,
    visibility,
  }
}

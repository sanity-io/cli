#!/usr/bin/env node
import {spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {parseArgs} from 'node:util'

import {setupBlueprint} from '@sanity/cli-setup'

const args = process.argv.slice(2)
const blueprintFlags = {
  dataset: {type: 'string'},
  help: {short: 'h', type: 'boolean'},
  organization: {type: 'string'},
  'output-path': {type: 'string'},
  project: {short: 'p', type: 'string'},
  'project-name': {type: 'string'},
  template: {type: 'string'},
  visibility: {type: 'string'},
  yes: {short: 'y', type: 'boolean'},
}

try {
  const {tokens, values} = parseArgs({
    allowPositionals: true,
    args,
    options: blueprintFlags,
    strict: false,
    tokens: true,
  })
  const blueprintArgs = tokens.every(
    (token) => token.kind === 'option' && Object.hasOwn(blueprintFlags, token.name),
  )
  const explicitBlueprint = values.template === 'blueprint'

  if (values.help && (!values.template || explicitBlueprint)) {
    process.stdout.write(`Initialize a Sanity project

  npm create sanity@latest -- --yes --project <id> [--dataset <name>]
  npm create sanity@latest -- --yes --project-name <name> --organization <id>
  npm create sanity@latest -- --template clean

Blueprint options include --output-path and --visibility (public or private).
Use --template clean --help for Studio setup options.\n`)
  } else if (explicitBlueprint || (!values.template && values.yes && blueprintArgs)) {
    const {visibility} = values
    if (!blueprintArgs) throw new Error('Run with --help to see the Blueprint setup options.')
    if (visibility && visibility !== 'private' && visibility !== 'public') {
      throw new Error('Pass --visibility public or --visibility private.')
    }
    await setupBlueprint(
      {
        dataset: values.dataset,
        organization: values.organization,
        outputPath: resolve(values['output-path'] ?? '.'),
        project: values.project,
        projectName: values['project-name'],
        visibility,
      },
      (message) => process.stdout.write(`${message}\n`),
    )
  } else {
    await runStudio(args)
  }
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
}

async function runStudio(argv) {
  const {version} = JSON.parse(
    await readFile(new URL('dist/studio-cli-version.json', import.meta.url), 'utf8'),
  )
  process.stderr.write('Loading Studio setup\n')
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- load the installer after choosing Studio
  const {installDeferredPackage} = await import('@sanity/cli-core/installDeferredPackage')
  const installation = await installDeferredPackage('@sanity/cli', version)
  const manifestPath = join(installation, 'node_modules', '@sanity', 'cli', 'package.json')
  const {bin} = JSON.parse(await readFile(manifestPath, 'utf8'))
  const child = spawn(
    process.execPath,
    [join(dirname(manifestPath), bin.sanity), 'init', ...argv],
    {
      stdio: 'inherit',
    },
  )
  process.exitCode = await new Promise((done, reject) => {
    child.once('error', reject)
    child.once('close', (code) => done(code ?? 1))
  })
}

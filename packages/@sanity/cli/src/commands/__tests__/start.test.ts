import {chmod, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {testCommand} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'
import {testExample} from '~test/helpers/testExample.js'

import {BuildCommand} from '../build.js'
import {StartCommand} from '../start.js'

describe('#start', () => {
  test('should start the "basic-studio" example', async () => {
    const cwd = await testExample('basic-studio')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    // First build the example
    await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    const {error, stdout} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain(`Sanity Studio using vite@`)
    expect(stdout).toContain(`ready in`)
    expect(stdout).toContain(`ms and running at http://localhost:3333/ (production preview mode)`)
  })

  test('should start the "basic-app" example', async () => {
    const cwd = await testExample('basic-app')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    // First build the example
    await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    const {error, stdout} = await testCommand(StartCommand, ['--port', '3334'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain(`Sanity application using vite@`)
    expect(stdout).toContain(`ready in`)
    expect(stdout).toContain(`ms and running at http://localhost:3334/ (production preview mode)`)
  })

  test('should throw an error if the basic-studio example has not been built', async () => {
    const cwd = await testExample('basic-studio')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    const {error, stdout} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to start preview server')
    expect(error?.oclif?.exit).toBe(1)
    expect(stdout).toContain(`Could not find a production build in the '${cwd}/dist' directory.`)
    expect(stdout).toContain(
      `Try building your studio with 'sanity build' before starting the preview server.`,
    )
  })

  test('should throw an error if the basic-app example has not been built', async () => {
    const cwd = await testExample('basic-app')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    const {error, stdout} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to start preview server')
    expect(error?.oclif?.exit).toBe(1)
    expect(stdout).toContain(`Could not find a production build in the '${cwd}/dist' directory.`)
    expect(stdout).toContain(
      `Try building your application with 'sanity build' before starting the preview server.`,
    )
  })

  test('should throw an error if the basepath cannot be resolved from the index.html file', async () => {
    const cwd = await testExample('basic-studio')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    // Replace the script tag in the index.html file with a script tag that does not have a src attribute
    const indexPath = join(cwd, 'dist', 'index.html')
    const index = await readFile(indexPath, 'utf8')

    // Find the script tag that matches <script src="/static/sanity-D_-mPegc.js" type="module"></script>
    const scriptTag = index.match(/<script src="\/static\/sanity-.*\.js" type="module"><\/script>/)
    const newIndex = index.replace(
      scriptTag?.[0] || '',
      '<script src="/custom-base-path/static/sanity-a3cc3d86.js" type="module"></script>',
    )

    await writeFile(indexPath, newIndex)

    const {error, stdout} = await testCommand(StartCommand, ['--port', '3335'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain(`Using resolved base path from static build: /custom-base-path`)
    expect(stdout).toContain(`Sanity Studio using vite@`)
    expect(stdout).toContain(`ready in`)
    expect(stdout).toContain(
      `ms and running at http://localhost:3335/custom-base-path (production preview mode)`,
    )
  })

  test('should throw an error if the basepath cannot be resolved from the index.html file', async () => {
    const cwd = await testExample('basic-studio')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    // Replace the script tag in the index.html file with a script tag that does not have a src attribute
    const indexPath = join(cwd, 'dist', 'index.html')
    const index = await readFile(indexPath, 'utf8')

    // Find the script tag that matches <script src="/static/sanity-D_-mPegc.js" type="module"></script>
    const scriptTag = index.match(/<script src="\/static\/sanity-.*\.js" type="module"><\/script>/)
    const newIndex = index.replace(
      scriptTag?.[0] || '',
      '<script src="/sanity-a3cc3d86.js" type="module"></script>',
    )

    await writeFile(indexPath, newIndex)

    const {error, stderr, stdout} = await testCommand(StartCommand, ['--port', '3336'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stderr).toContain(`Could not determine base path from index.html, using "/" as default`)
    expect(stdout).toContain(`Sanity Studio using vite@`)
    expect(stdout).toContain(`ready in`)
    expect(stdout).toContain(`ms and running at http://localhost:3336/ (production preview mode)`)
  })

  test('should throw an error if the index.html file is not found', async () => {
    const cwd = await testExample('basic-studio')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    // Make the index.html not readable
    await chmod(join(cwd, 'dist', 'index.html'), 0)

    const {error} = await testCommand(StartCommand, ['--port', '3337'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain(
      'The studio server does not have access to listen to given port - do you have access to listen to the given host (localhost)',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should throw an error if port is already in use', async () => {
    const cwd = await testExample('basic-studio')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    // First build the example
    await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    await testCommand(StartCommand, ['--port', '3333'], {
      config: {root: cwd},
    })

    const {error} = await testCommand(StartCommand, ['--port', '3333'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Port 3333 is already in use')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should allow using vite config from sanity.cli.ts', async () => {
    const cwd = await testExample('basic-app')
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    const existingSanityCli = await readFile(join(cwd, 'sanity.cli.ts'), 'utf8')

    // Create a vite.config.ts file
    await writeFile(
      join(cwd, 'sanity.cli.ts'),
      `
      import {defineCliConfig} from '@sanity/cli'

      export default defineCliConfig({
        app: {
          entry: './src/App.tsx',
          organizationId: 'organizationId',
        },
        vite: {
          preview: {
            port: 1335,
          },
        },
      })
    `,
    )

    await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    const {stdout} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    expect(stdout).toContain(`ms and running at http://localhost:1335/ (production preview mode)`)

    await writeFile(join(cwd, 'sanity.cli.ts'), existingSanityCli)
  })
})

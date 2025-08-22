import {readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {join} from 'node:path'

import {testCommand} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'
import {testExample} from '~test/helpers/testExample.js'

import {StartCommand} from '../start.js'

describe('#start', () => {
  test('should start the "basic-studio" example', async () => {
    const cwd = await testExample('basic-studio', {shouldBuild: true})
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    const {error, stdout} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain(`Sanity Studio using vite@`)
    expect(stdout).toContain(`ready in`)
    expect(stdout).toContain(`ms and running at http://localhost:3333/ (production preview mode)`)
  })

  test('should start the "basic-app" example', async () => {
    const cwd = await testExample('basic-app', {shouldBuild: true})
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    const {error, stdout} = await testCommand(StartCommand, ['--port', '3334'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain(`Sanity application using vite@`)
    expect(stdout).toContain(`ready in`)
    expect(stdout).toContain(`ms and running at http://localhost:3334/ (production preview mode)`)
  })

  test('should throw an error if the basic-studio example has not been built', async () => {
    const cwd = await testExample('basic-studio', {shouldBuild: false})
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
    const cwd = await testExample('basic-app', {shouldBuild: false})
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

  test('should use resolved base path from index.html file', async () => {
    const cwd = await testExample('basic-studio', {shouldBuild: true})
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

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

  test('should fallback to default basepath when cannot resolve from index.html', async () => {
    const cwd = await testExample('basic-studio', {shouldBuild: true})
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

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
    const cwd = await testExample('basic-studio', {shouldBuild: true})
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    // Remove the index.html file
    await rm(join(cwd, 'dist', 'index.html'))

    const {error} = await testCommand(StartCommand, ['--port', '3337'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to start preview server')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should throw an error if port is already in use', async () => {
    const cwd = await testExample('basic-studio', {shouldBuild: true})
    // Mock the process.cwd() to the example directory
    process.cwd = () => cwd

    // Create a server on port 3338 to block it
    const server = createServer()
    await new Promise<void>((resolve) => {
      server.listen(3338, 'localhost', resolve)
    })

    try {
      const {error} = await testCommand(StartCommand, ['--port', '3338'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Port 3338 is already in use')
      expect(error?.oclif?.exit).toBe(1)
    } finally {
      // Clean up the server
      server.close()
    }
  })

  test('should allow using vite config from sanity.cli.ts', async () => {
    const cwd = await testExample('basic-app', {shouldBuild: true})
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

    const {stdout} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    expect(stdout).toContain(`ms and running at http://localhost:1335/ (production preview mode)`)

    await writeFile(join(cwd, 'sanity.cli.ts'), existingSanityCli)
  })
})

import {readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {join} from 'node:path'

import {runCommand} from '@oclif/test'
import {convertToSystemPath, testCommand, testExample} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'
import {buildExample} from '~test/helpers/buildExample.js'

import {PreviewCommand} from '../preview.js'

describe('#start', () => {
  test('help works', async () => {
    const {stdout} = await runCommand(['start', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Starts a server to preview a production build

      USAGE
        $ sanity start [OUTPUTDIR] [--host <value>] [--port <value>]

      ARGUMENTS
        [OUTPUTDIR]  Output directory

      FLAGS
        --host=<value>  [default: localhost] The local network interface at which to
                        listen.
        --port=<value>  [default: 3333] TCP port to start server on.

      DESCRIPTION
        Starts a server to preview a production build

      ALIASES
        $ sanity start

      EXAMPLES
        $ sanity start --host=0.0.0.0

        $ sanity start --port=1942

        $ sanity start some/build-output-dir

      "
    `)
  })

  describe('basic-app', () => {
    test('should start the  example', async () => {
      const cwd = await testExample('basic-app')
      // Build the example
      await buildExample(cwd)
      // Change to the example directory
      process.chdir(cwd)

      const {error, stdout} = await testCommand(PreviewCommand, ['--port', '3334'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain(`Sanity application using vite@`)
      expect(stdout).toContain(`ready in`)
      expect(stdout).toContain(`ms and running at http://localhost:3334/ (production preview mode)`)
    })

    test('should throw an error if the example has not been built', async () => {
      const cwd = await testExample('basic-app')
      // Change to the example directory
      process.chdir(cwd)

      const {error, stdout} = await testCommand(PreviewCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to start preview server')
      expect(error?.oclif?.exit).toBe(1)
      expect(stdout).toContain(
        `Could not find a production build in the '${convertToSystemPath(`${cwd}/dist`)}' directory.`,
      )
      expect(stdout).toContain(
        `Try building your application with 'sanity build' before starting the preview server.`,
      )
    })
  })

  describe('basic-studio', () => {
    test('should start the example', async () => {
      const cwd = await testExample('basic-studio')
      // Build the example
      await buildExample(cwd)
      // Change to the example directory
      process.chdir(cwd)

      const {error, stdout} = await testCommand(PreviewCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain(`Sanity Studio using vite@`)
      expect(stdout).toContain(`ready in`)
      expect(stdout).toContain(`ms and running at http://localhost:3333/ (production preview mode)`)
    })

    test('should throw an error if the example has not been built', async () => {
      const cwd = await testExample('basic-studio')
      // Change to the example directory
      process.chdir(cwd)

      const {error, stdout} = await testCommand(PreviewCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to start preview server')
      expect(error?.oclif?.exit).toBe(1)
      expect(stdout).toContain(
        `Could not find a production build in the '${convertToSystemPath(`${cwd}/dist`)}' directory.`,
      )
      expect(stdout).toContain(
        `Try building your studio with 'sanity build' before starting the preview server.`,
      )
    })
  })

  test('should use resolved base path from index.html file', async () => {
    const cwd = await testExample('basic-studio')
    // Build the example
    await buildExample(cwd)
    // Change to the example directory
    process.chdir(cwd)

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

    const {error, stdout} = await testCommand(PreviewCommand, ['--port', '3335'], {
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
    const cwd = await testExample('basic-studio')
    // Build the example
    await buildExample(cwd)
    // Change to the example directory
    process.chdir(cwd)

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

    const {error, stderr, stdout} = await testCommand(PreviewCommand, ['--port', '3336'], {
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
    // Build the example
    await buildExample(cwd)
    // Change to the example directory
    process.chdir(cwd)

    // Remove the index.html file
    await rm(join(cwd, 'dist', 'index.html'))

    const {error} = await testCommand(PreviewCommand, ['--port', '3337'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to start preview server')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should throw an error if port is already in use', async () => {
    const cwd = await testExample('basic-studio')
    // Build the example
    await buildExample(cwd)
    // Change to the example directory
    process.chdir(cwd)

    // Create a server on port 3338 to block it
    const server = createServer()
    await new Promise<void>((resolve) => {
      server.listen(3338, 'localhost', resolve)
    })

    try {
      const {error} = await testCommand(PreviewCommand, ['--port', '3338'], {
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
    const cwd = await testExample('basic-app')
    // Build the example
    await buildExample(cwd)
    // Change to the example directory
    process.chdir(cwd)

    // Create a vite.config.ts file
    await writeFile(
      join(cwd, 'sanity.cli.ts'),
      `
      import {defineCliConfig} from 'sanity/cli'

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

    const {stdout} = await testCommand(PreviewCommand, [], {
      config: {root: cwd},
    })

    expect(stdout).toContain(`ms and running at http://localhost:1335/ (production preview mode)`)
  })
})

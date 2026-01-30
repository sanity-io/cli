import {readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {platform} from 'node:os'
import {join} from 'node:path'

import {convertToSystemPath, testCommand, testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {closeServer, tryCloseServer} from '../../../test/testUtils.js'
import {PreviewCommand} from '../preview.js'

describe(
  '#preview (studio)',
  {
    concurrent: false,
    timeout: (platform() === 'win32' ? 60 : 30) * 1000,
  },
  () => {
    test('should preview a valid build', async () => {
      const cwd = await testFixture('prebuilt-studio')

      // Change to the example directory
      process.chdir(cwd)

      const {error, result, stdout} = await testCommand(PreviewCommand, ['--port', '4333'], {
        config: {root: cwd},
      })

      await tryCloseServer(result)

      expect(error).toBeUndefined()
      expect(stdout).toContain(`Sanity Studio using vite@`)
      expect(stdout).toContain(`ready in`)
      expect(stdout).toContain(`ms and running at http://localhost:4333/ (production preview mode)`)
    })

    test('should throw an error if the studio has not been built', async () => {
      const cwd = await testFixture('basic-studio')
      // Change to the example directory
      process.chdir(cwd)

      // Explicitly make sure the dist directory is missing/empty
      await rm(join(cwd, 'dist'), {force: true, recursive: true})
      const {error, result} = await testCommand(PreviewCommand, [], {
        config: {root: cwd},
      })

      await tryCloseServer(result)

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to start preview server')
      expect(error?.message).toContain(
        `Could not find a production build in the '${convertToSystemPath(`${cwd}/dist`)}' directory.`,
      )
      expect(error?.suggestions).toContain('`sanity build` to create a production build')
      expect(error?.suggestions).toContain('`sanity dev` to run a development server')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should use resolved base path from index.html file', async () => {
      const cwd = await testFixture('prebuilt-studio')

      // Change to the example directory
      process.chdir(cwd)

      // Replace the script tag in the index.html file with a script tag that does not have a src attribute
      const indexPath = join(cwd, 'dist', 'index.html')
      const index = await readFile(indexPath, 'utf8')

      // Find the script tag that matches <script src="/static/sanity-D_-mPegc.js" type="module"></script>
      const scriptTag = index.match(
        /<script src="\/static\/sanity-.*\.js" type="module"><\/script>/,
      )
      const newIndex = index.replace(
        scriptTag?.[0] || '',
        '<script src="/custom-base-path/static/sanity-a3cc3d86.js" type="module"></script>',
      )

      await writeFile(indexPath, newIndex)

      const {error, result, stdout} = await testCommand(PreviewCommand, ['--port', '4335'], {
        config: {root: cwd},
      })

      await tryCloseServer(result)

      expect(error).toBeUndefined()
      expect(stdout).toContain(`Using resolved base path from static build: /custom-base-path`)
      expect(stdout).toContain(`Sanity Studio using vite@`)
      expect(stdout).toContain(`ready in`)
      expect(stdout).toContain(
        `ms and running at http://localhost:4335/custom-base-path (production preview mode)`,
      )
    })

    test('should fallback to default basepath when cannot resolve from index.html', async () => {
      const cwd = await testFixture('prebuilt-studio')

      // Change to the example directory
      process.chdir(cwd)

      // Replace the script tag in the index.html file with a script tag that does not have a src attribute
      const indexPath = join(cwd, 'dist', 'index.html')
      const index = await readFile(indexPath, 'utf8')

      // Find the script tag that matches <script src="/static/sanity-D_-mPegc.js" type="module"></script>
      const scriptTag = index.match(
        /<script src="\/static\/sanity-.*\.js" type="module"><\/script>/,
      )
      const newIndex = index.replace(
        scriptTag?.[0] || '',
        '<script src="/sanity-a3cc3d86.js" type="module"></script>',
      )

      await writeFile(indexPath, newIndex)

      const {error, result, stderr, stdout} = await testCommand(
        PreviewCommand,
        ['--port', '4336'],
        {config: {root: cwd}},
      )

      await tryCloseServer(result)

      expect(error).toBeUndefined()
      expect(stderr).toContain(
        `Could not determine base path from index.html, using "/" as default`,
      )
      expect(stdout).toContain(`Sanity Studio using vite@`)
      expect(stdout).toContain(`ready in`)
      expect(stdout).toContain(`ms and running at http://localhost:4336/ (production preview mode)`)
    })

    test('should throw an error if the index.html file is not found', async () => {
      const cwd = await testFixture('prebuilt-studio')

      // Change to the example directory
      process.chdir(cwd)

      // Remove the index.html file
      await rm(join(cwd, 'dist', 'index.html'))

      const {error, result} = await testCommand(PreviewCommand, ['--port', '4337'], {
        config: {root: cwd},
      })

      await tryCloseServer(result)

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to start preview server')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should throw an error if port is already in use', async () => {
      const cwd = await testFixture('prebuilt-studio')

      // Change to the example directory
      process.chdir(cwd)

      // Create a server on port 4338 to block it
      const server = createServer()
      await new Promise<void>((resolve) => {
        server.listen(4338, 'localhost', resolve)
      })

      try {
        const {error, result} = await testCommand(PreviewCommand, ['--port', '4338'], {
          config: {root: cwd},
        })

        await tryCloseServer(result)

        expect(error).toBeDefined()
        expect(error?.message).toContain('Port 4338 is already in use')
        expect(error?.oclif?.exit).toBe(1)
      } finally {
        // Clean up the server
        await closeServer(server)
      }
    })
  },
)

import {rm, writeFile} from 'node:fs/promises'
import {platform} from 'node:os'
import {join} from 'node:path'

import {convertToSystemPath, testCommand, testFixture} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {tryCloseServer} from '../../../test/testUtils.js'
import {PreviewCommand} from '../preview.js'

describe(
  '#preview (app)',
  {
    concurrent: false,
    timeout: (platform() === 'win32' ? 60 : 30) * 1000,
  },
  () => {
    test('should preview a valid build', async () => {
      const cwd = await testFixture('prebuilt-app')

      // Change to the example directory
      process.chdir(cwd)

      const {error, result, stdout} = await testCommand(PreviewCommand, ['--port', '4334'], {
        config: {root: cwd},
      })

      await tryCloseServer(result)

      if (error) throw error
      expect(stdout).toContain(`Sanity application using vite@`)
      expect(stdout).toContain(`ready in`)
      expect(stdout).toContain(`ms and running at http://localhost:4334/ (production preview mode)`)
    })

    test('should throw an error if the example has not been built', async () => {
      const cwd = await testFixture('basic-app')
      // Change to the example directory
      process.chdir(cwd)

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

    test('should allow using vite config from sanity.cli.ts', async () => {
      const cwd = await testFixture('prebuilt-app')
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
            port: 4339,
          },
        },
      })
    `,
      )

      const {result, stdout} = await testCommand(PreviewCommand, [], {
        config: {root: cwd},
      })

      await tryCloseServer(result)

      expect(stdout).toContain(`ms and running at http://localhost:4339/ (production preview mode)`)
    })
  },
)

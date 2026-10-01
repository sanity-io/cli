import {spawn} from 'node:child_process'
import {mkdir, readdir, readFile, rm} from 'node:fs/promises'
import {join, resolve, sep} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

import {FIXTURE_TOKEN, type FixtureOptions} from './apiFixture.ts'
import {cleanEnv, entryCommand, type EntryPoint} from './measure.ts'
import {visibleText} from './output.ts'

export interface SetupOptions extends FixtureOptions {
  template: 'blog' | 'clean' | 'moviedb'
}

export function setupArgs(options: SetupOptions, outputPath: string): string[] {
  return [
    '--yes',
    '--project',
    options.project,
    '--dataset',
    options.dataset,
    '--output-path',
    outputPath,
    '--template',
    options.template,
    '--typescript',
    '--package-manager',
    'npm',
    '--install',
    '--no-import-dataset',
    '--no-git',
    '--no-mcp',
    '--no-skills',
    '--no-auto-updates',
  ]
}

/** Expected assets are read before timing, from the checkout being benchmarked. */
export async function templateFiles(repoRoot: string, template: string): Promise<string[]> {
  const dir = join(repoRoot, 'packages/@sanity/cli/templates', template)
  const files = await readdir(dir, {recursive: true, withFileTypes: true})
  return [
    ...files
      .filter((entry) => entry.isFile())
      .map((entry) =>
        join(entry.parentPath, entry.name)
          .slice(dir.length + 1)
          .replace(/\.js$/, '.ts'),
      ),
    'package.json',
    'sanity.config.ts',
    'sanity.cli.ts',
    'tsconfig.json',
    'eslint.config.mjs',
    '.gitignore',
  ]
}

export async function filesGenerated(
  dir: string,
  files: string[],
  options: FixtureOptions,
): Promise<boolean> {
  try {
    const contents = await Promise.all(files.map((file) => readFile(join(dir, file), 'utf8')))
    if (contents.some((content) => content.length === 0)) return false
    const pkg = JSON.parse(contents[files.indexOf('package.json')])
    const config = contents[files.indexOf('sanity.config.ts')]
    return Boolean(
      pkg.dependencies?.sanity &&
      pkg.scripts?.dev &&
      config.includes(options.project) &&
      config.includes(options.dataset),
    )
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT')
      return false
    throw error
  }
}

/** Resolve only the installed project's bin. Never fall back to a global CLI or npx. */
export async function projectCli(dir: string): Promise<string> {
  const root = join(dir, 'node_modules/sanity')
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.sanity
  if (typeof bin !== 'string') throw new Error('Installed sanity package has no CLI bin')
  const path = resolve(root, bin)
  if (!path.startsWith(`${root}${sep}`))
    throw new Error('Installed CLI bin is outside sanity package')
  return path
}

export interface SetupRun {
  end: 'completed' | 'failed'
  filesGeneratedMs: number | null
  setupCompleteMs: number | null
  studioRunningMs: number | null

  error?: string
  output?: string
}

export async function measureSetup(
  options: SetupOptions & {
    dir: string
    entry: EntryPoint
    env: Record<string, string>
    expectedFiles: string[]
    registryUrl: string
    timeoutMs: number
  },
): Promise<SetupRun> {
  const project = join(options.dir, 'project')
  await mkdir(project, {recursive: true})
  await mkdir(join(options.dir, 'home'), {recursive: true})
  const env = {
    ...cleanEnv(options),
    ...options.env,
    CI: 'true',
    DO_NOT_TRACK: '1',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    SANITY_AUTH_TOKEN: FIXTURE_TOKEN,
  }
  const started = performance.now()
  const deadline = started + options.timeoutMs
  const elapsed = () => Math.round(performance.now() - started)
  let output = ''
  let child: ReturnType<typeof launch> | undefined
  const result: SetupRun = {
    end: 'failed',
    filesGeneratedMs: null,
    setupCompleteMs: null,
    studioRunningMs: null,
  }

  const capture = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-64_000)
  }
  function launch(command: string, args: string[]) {
    const proc = spawn(command, args, {
      cwd: project,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const state = {
      code: null as number | null,
      done: false,
      error: undefined as Error | undefined,
      proc,
    }
    proc.stdout.on('data', capture)
    proc.stderr.on('data', capture)
    proc.on('error', (error) => {
      state.error = error
      state.done = true
    })
    proc.on('exit', (code) => {
      state.code = code
      state.done = true
    })
    return state
  }
  function checkDeadline() {
    if (performance.now() >= deadline)
      throw new Error(`Setup did not reach Studio readiness within ${options.timeoutMs}ms`)
    if (child?.error) throw child.error
  }
  async function stop() {
    if (!child?.proc.pid) return
    // Kill the process group even if npm exited; dev servers can be grandchildren.
    try {
      if (process.platform === 'win32') child.proc.kill('SIGKILL')
      else process.kill(-child.proc.pid, 'SIGKILL')
    } catch {
      /* already exited */
    }
    if (!child.done) await new Promise<void>((resolve) => child!.proc.once('exit', () => resolve()))
  }
  try {
    const [command, args] = entryCommand(options.entry, setupArgs(options, project))
    child = launch(command, args)
    while (!child.done) {
      checkDeadline()
      if (
        result.filesGeneratedMs === null &&
        (await filesGenerated(project, options.expectedFiles, options))
      )
        result.filesGeneratedMs = elapsed()
      await delay(25)
    }
    if (child.error) throw child.error
    if (child.code !== 0) throw new Error(`Initialization exited with code ${child.code}`)
    if (result.filesGeneratedMs === null) {
      if (!(await filesGenerated(project, options.expectedFiles, options)))
        throw new Error('Initialization exited without complete project files')
      result.filesGeneratedMs = elapsed()
    }
    result.setupCompleteMs = elapsed()
    await stop()
    output = ''
    child = launch(process.execPath, [
      await projectCli(project),
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ])
    while (true) {
      checkDeadline()
      if (child.done) throw new Error(`Studio exited before readiness with code ${child.code}`)
      const text = visibleText([{at: 0, data: output}])
      const url = text.match(/http:\/\/127\.0\.0\.1:(\d+)\/?/)?.[0]
      if (url && !url.endsWith(':0')) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(Math.min(2000, Math.max(1, deadline - performance.now()))),
          })
          const html = await response.text()
          if (response.ok && html.includes('id="sanity"')) {
            result.studioRunningMs = elapsed()
            result.end = 'completed'
            break
          }
        } catch {
          /* server printed its URL but is not serving yet */
        }
      }
      await delay(50)
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    result.output = visibleText([{at: 0, data: output}]).slice(-8000)
  } finally {
    await stop()
    await rm(options.dir, {force: true, maxRetries: 10, recursive: true, retryDelay: 200})
  }
  return result
}

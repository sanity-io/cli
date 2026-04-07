import {spawn} from 'node:child_process'

export interface NonInteractiveResult {
  exitCode: number
  stderr: string
  stdout: string

  error?: Error
}

interface SpawnProcessOptions {
  command: string

  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export function spawnProcess({
  args = [],
  command,
  cwd,
  env,
}: SpawnProcessOptions): Promise<NonInteractiveResult> {
  return new Promise<NonInteractiveResult>((resolve, reject) => {
    const proc = spawn(command, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']})

    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString())
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString())
    })

    proc.on('error', reject)

    proc.on('close', (code) => {
      // eslint-disable-next-line unicorn/prefer-default-parameters -- close callback type is (number | null), default param doesn't narrow for TS
      const exitCode = code ?? 1
      const stdout = stdoutChunks.join('')
      const stderr = stderrChunks.join('')

      resolve({
        error: exitCode === 0 ? undefined : new Error(stderr || `CLI exited with code ${exitCode}`),
        exitCode,
        stderr,
        stdout,
      })
    })
  })
}

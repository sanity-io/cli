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
    // Interleaved view of both streams, appended in the order the chunks arrived.
    // stdout and stderr are separate pipes, so this reflects the order *this* process
    // received them rather than a guarantee the child wrote them that way — in practice
    // it lands very close to what you would see running the command in a terminal.
    // `spawnPty.ts` already produces a single merged `output` string from one `onData`
    // handler, so the two helpers now present failures the same way.
    const outputChunks: string[] = []

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdoutChunks.push(text)
      outputChunks.push(text)
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrChunks.push(text)
      outputChunks.push(text)
    })

    proc.on('error', reject)

    proc.on('close', (code) => {
      // eslint-disable-next-line unicorn/prefer-default-parameters -- close callback type is (number | null), default param doesn't narrow for TS
      const exitCode = code ?? 1
      const stdout = stdoutChunks.join('')
      const stderr = stderrChunks.join('')

      resolve({
        // The CLI writes the actionable diagnostic (package manager output, stack traces)
        // to stdout via oclif's `log`, while stderr often only carries a summary line like
        // "Dependency installation failed". Carry the interleaved output into the error so a
        // thrown failure explains itself and reads in emission order.
        error:
          exitCode === 0
            ? undefined
            : new Error(outputChunks.join('').trim() || `CLI exited with code ${exitCode}`),
        exitCode,
        stderr,
        stdout,
      })
    })
  })
}

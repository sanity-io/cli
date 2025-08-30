import {ChildProcess, spawn} from 'node:child_process'

import {type CommandResult} from './types.js'

export async function executeCommand(command: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn('npx', command.split(' ').slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code: number | null) => {
      resolve({code, stderr, stdout})
    })

    proc.on('error', (error: Error) => {
      reject(error)
    })
  })
}

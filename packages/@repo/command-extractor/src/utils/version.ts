import {type CommandResult} from '../types.js'

function extractVersion(output: string): string | null {
  const cliVersionMatch = output.match(/@sanity\/cli\/(\d+\.\d+\.\d+)/)
  if (cliVersionMatch) {
    return cliVersionMatch[1]
  }

  const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
  return versionMatch ? versionMatch[1] : null
}

export async function detectVersion(
  executeCommand: (cmd: string) => Promise<CommandResult>,
): Promise<string> {
  try {
    const result = await executeCommand('npx sanity --version')
    if (result.code === 0) {
      let version = extractVersion(result.stdout)

      if (!version) {
        const packageResult = await executeCommand('npx sanity --help')
        version = extractVersion(packageResult.stdout)
      }

      if (version) {
        console.log(`📦 Detected Sanity CLI version: ${version}`)
        return version
      }
    }
  } catch (error) {
    console.error('Could not determine Sanity CLI version:', (error as Error).message)
  }

  console.log('⚠️  Could not determine version, using: unknown')
  return 'unknown'
}

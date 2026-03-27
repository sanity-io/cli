import fs from 'node:fs'
import path from 'node:path'

export function setup(): void {
  const envFile = path.resolve(process.cwd(), 'e2e/.env.e2e')

  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
    }
  }

  const missing = ['SANITY_E2E_TOKEN', 'SANITY_E2E_PROJECT_ID'].filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}\nCreate e2e/.env.e2e with these values.`,
    )
  }
}

import {fileURLToPath} from 'node:url'

import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {getErrorMessage, toError} from '../../util/getErrorMessage.js'
import {detectAvailableEditors} from '../mcp/detectAvailableEditors.js'
import {getSkillsCliAgent} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'
import {promptForSkillsSetup} from './promptForSkillsSetup.js'

const skillsDebug = subdebug('skills:setup')

/** Source repo for the bundled `skills` CLI. See https://www.sanity.io/docs/ai/skills. */
export const SANITY_SKILLS_REPO = 'sanity-io/agent-toolkit'

/**
 * Absolute path to the bundled `skills` CLI bin. Resolved once at module load
 * via `import.meta.resolve` so we run the version pinned in our package.json
 * instead of paying the `npx -y` registry lookup at runtime.
 */
export const SKILLS_BIN_PATH = fileURLToPath(
  import.meta.resolve('skills/bin/cli.mjs', import.meta.url),
)

interface SetupSkillsOptions {
  /** Working directory for the `skills add` invocation. Must already exist. */
  cwd: string

  /** Pre-detected editors. When omitted, `detectAvailableEditors()` is called. */
  editors?: Editor[]

  /**
   * Whether the user explicitly requested skills install (e.g. via
   * `sanity skills add`). When true, surfaces status messages even when
   * there's nothing to do. When false (e.g. called from `sanity init`),
   * stays quiet.
   */
  explicit?: boolean

  /**
   * - `'auto'`: install for all eligible editors without prompting
   * - `'prompt'`: ask the user with a single yes/no
   * - `'skip'`: skip skills installation entirely
   */
  mode?: 'auto' | 'prompt' | 'skip'
}

interface SetupSkillsResult {
  /** `--agent` values passed to `skills add` */
  installedAgents: string[]
  installedForEditors: string[]
  skipped: boolean

  error?: Error
}

/**
 * Runs the bundled `skills add` for every detected editor with a mapped
 * skills agent, scoped to the project (`--project`). Failures are surfaced
 * as warnings and do not throw — skills install is best-effort and must
 * never abort `sanity init`.
 */
export async function setupSkills(options: SetupSkillsOptions): Promise<SetupSkillsResult> {
  const {cwd, explicit = false, mode = 'prompt'} = options
  const empty: SetupSkillsResult = {installedAgents: [], installedForEditors: [], skipped: true}

  if (mode === 'skip') {
    skillsDebug('Skipping skills setup (mode: skip)')
    return empty
  }

  const editors = options.editors ?? (await detectAvailableEditors())

  const eligible = editors.flatMap((editor) => {
    const agent = getSkillsCliAgent(editor.name)
    return agent ? [{agent, editor}] : []
  })

  if (eligible.length === 0) {
    skillsDebug('No detected editors have a skills agent mapping — skipping')
    if (explicit) {
      ux.warn(
        "Couldn't detect any AI editors with skills support. Skills are installed alongside detected editor configs (Claude Code, Cursor, Codex, etc.).",
      )
    }
    return empty
  }

  const uniqueAgents = [...new Set(eligible.map((e) => e.agent))]
  const editorLabels = [...new Set(eligible.map((e) => e.editor.name))]

  if (mode === 'prompt') {
    const confirmed = await promptForSkillsSetup()
    if (!confirmed) {
      ux.stdout('Agent skills installation skipped')
      return empty
    }
  }

  const args = [
    SKILLS_BIN_PATH,
    'add',
    SANITY_SKILLS_REPO,
    '--project',
    ...uniqueAgents.flatMap((agent) => ['-a', agent]),
    '-y',
  ]

  skillsDebug('Running: %s %s (cwd: %s)', process.execPath, args.join(' '), cwd)

  try {
    const result = await execa(process.execPath, args, {cwd, stdio: 'pipe', timeout: 90_000})
    skillsDebug('skills stdout: %s', result.stdout)
    skillsDebug('skills stderr: %s', result.stderr)
    ux.stdout(`${logSymbols.success} Installed Sanity agent skills for ${editorLabels.join(', ')}`)
    return {
      installedAgents: uniqueAgents,
      installedForEditors: editorLabels,
      skipped: false,
    }
  } catch (error) {
    skillsDebug('Error installing skills %O', error)
    const err = toError(error)
    ux.warn(`Could not install Sanity agent skills: ${getErrorMessage(error)}`)
    if (error && typeof error === 'object') {
      const {stderr, stdout} = error as {stderr?: string; stdout?: string}
      if (stdout) ux.warn(stdout)
      if (stderr) ux.warn(stderr)
    }
    return {
      error: err,
      installedAgents: [],
      installedForEditors: [],
      skipped: false,
    }
  }
}

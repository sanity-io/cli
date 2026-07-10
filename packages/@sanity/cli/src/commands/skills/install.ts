import {subdebug} from '@sanity/cli-core/debug'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'

import {configureSkills} from '../../actions/skills/configureSkills.js'
import {SkillsInstallTrace} from '../../telemetry/skills.telemetry.js'
import {getErrorMessage, toError} from '../../util/getErrorMessage.js'

const debug = subdebug('skills:install')

export class InstallSkillsCommand extends SanityCommand<typeof InstallSkillsCommand> {
  static override description =
    'Install Sanity agent skills for detected AI editors (Antigravity, Claude Code, Cline, Cline CLI, Codex CLI, Cursor, Gemini CLI, GitHub Copilot CLI, OpenCode, VS Code, VS Code Insiders)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Install Sanity agent skills for detected AI editors',
    },
  ]

  public async run(): Promise<void> {
    const trace = this.telemetry.trace(SkillsInstallTrace)
    trace.start()

    try {
      const result = await configureSkills({output: this.output})

      trace.log({
        detectedEditors: result.detectedEditors,
        installedAgents: result.installedAgents,
      })

      if (result.error) {
        trace.error(result.error)
      } else {
        trace.complete()
      }
    } catch (error) {
      debug('Skills installation failed: %O', error)
      trace.error(toError(error))
      this.error(getErrorMessage(error), {exit: 1})
    }
  }
}

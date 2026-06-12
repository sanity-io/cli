import {isInteractive, SanityCommand, subdebug} from '@sanity/cli-core'

import {configureSkills} from '../../actions/skills/configureSkills.js'
import {SkillsConfigureTrace} from '../../telemetry/skills.telemetry.js'
import {getErrorMessage, toError} from '../../util/getErrorMessage.js'

const debug = subdebug('skills:configure')

export class ConfigureSkillsCommand extends SanityCommand<typeof ConfigureSkillsCommand> {
  static override description =
    'Install Sanity agent skills for detected AI editors (Antigravity, Claude Code, Cline, Cline CLI, Codex CLI, Cursor, Gemini CLI, GitHub Copilot CLI, OpenCode, VS Code, VS Code Insiders)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Install Sanity agent skills for detected AI editors',
    },
  ]

  public async run(): Promise<void> {
    const trace = this.telemetry.trace(SkillsConfigureTrace)
    trace.start()

    try {
      const result = await configureSkills({
        mode: isInteractive() ? 'prompt' : 'auto',
      })

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
      debug('Skills configuration failed: %O', error)
      trace.error(toError(error))
      this.error(getErrorMessage(error), {exit: 1})
    }
  }
}

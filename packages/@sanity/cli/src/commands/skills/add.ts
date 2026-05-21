import {isInteractive, SanityCommand, subdebug} from '@sanity/cli-core'

import {setupSkills} from '../../actions/skills/setupSkills.js'
import {SkillsAddTrace} from '../../telemetry/skills.telemetry.js'
import {getErrorMessage, toError} from '../../util/getErrorMessage.js'

const debug = subdebug('skills:add')

export class AddSkillsCommand extends SanityCommand<typeof AddSkillsCommand> {
  static override description =
    'Install Sanity agent skills into the current project for detected AI editors (Antigravity, Claude Code, Cline, Cline CLI, Codex CLI, Cursor, Gemini CLI, GitHub Copilot CLI, OpenCode, VS Code, VS Code Insiders)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Install Sanity agent skills for detected AI editors',
    },
  ]

  public async run(): Promise<void> {
    const trace = this.telemetry.trace(SkillsAddTrace)
    trace.start()

    try {
      const result = await setupSkills({
        cwd: process.cwd(),
        explicit: true,
        mode: isInteractive() ? 'prompt' : 'auto',
      })

      trace.log({
        installedAgents: result.installedAgents,
        installedForEditors: result.installedForEditors,
      })

      if (result.error) {
        trace.error(result.error)
      } else {
        trace.complete()
      }
    } catch (error) {
      debug('Unexpected error in skills add: %O', error)
      trace.error(toError(error))
      this.error(getErrorMessage(error), {exit: 1})
    }
  }
}

import {SanityCommand, subdebug} from '@sanity/cli-core'

import {runSkillsUpdate} from '../../actions/skills/runSkillsUpdate.js'
import {SkillsUpdateTrace} from '../../telemetry/skills.telemetry.js'
import {getErrorMessage, toError} from '../../util/getErrorMessage.js'

const debug = subdebug('skills:update')

export class UpdateSkillsCommand extends SanityCommand<typeof UpdateSkillsCommand> {
  static override description = 'Update Sanity agent skills in the current project to the latest'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Refresh installed Sanity agent skills using the bundled skills CLI',
    },
  ]

  public async run(): Promise<void> {
    const trace = this.telemetry.trace(SkillsUpdateTrace)
    trace.start()

    try {
      const result = await runSkillsUpdate({cwd: process.cwd()})

      trace.log({succeeded: result.succeeded})

      if (result.error) {
        trace.error(result.error)
      } else {
        trace.complete()
      }
    } catch (error) {
      debug('Unexpected error in skills update: %O', error)
      trace.error(toError(error))
      this.error(getErrorMessage(error), {exit: 1})
    }
  }
}

import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import open from 'open'

export class LearnCommand extends Command {
  static override description = 'Opens Sanity Learn in your web browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(LearnCommand)

    const url = 'https://www.sanity.io/learn'

    this.log(`Opening ${url}`)
    await open(url)
  }
}

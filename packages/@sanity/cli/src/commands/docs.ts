import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import open from 'open'

export class DocsCommand extends Command {
  static override description = 'Opens Sanity Studio documentation in your web browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(DocsCommand)

    const url = 'https://www.sanity.io/docs'

    this.log(`Opening ${url}`)
    await open(url)
  }
}

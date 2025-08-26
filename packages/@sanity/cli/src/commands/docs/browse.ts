import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import open from 'open'

export class DocsBrowseCommand extends Command {
  static override description = 'Open Sanity docs in a web browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(DocsBrowseCommand)

    const url = 'https://www.sanity.io/docs'

    this.log(`Opening ${url}`)
    await open(url)
  }
}
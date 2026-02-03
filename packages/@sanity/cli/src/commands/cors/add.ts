import fs from 'node:fs'
import path from 'node:path'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm, logSymbols} from '@sanity/cli-core/ux'
import {oneline} from 'oneline'

import {filterAndValidateOrigin} from '../../actions/cors/filterAndValidateOrigin.js'
import {createCorsOrigin} from '../../services/cors.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const addCorsDebug = subdebug('cors:add')

export class Add extends SanityCommand<typeof Add> {
  static override args = {
    origin: Args.string({
      description: 'Origin to allow (e.g., https://example.com)',
      required: true,
    }),
  }

  static override description = 'Allow a new origin to use your project API through CORS'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively add a CORS origin',
    },
    {
      command: '<%= config.bin %> <%= command.id %> http://localhost:3000 --no-credentials',
      description: 'Add a localhost origin without credentials',
    },
    {
      command: '<%= config.bin %> <%= command.id %> https://myapp.com --credentials',
      description: 'Add a production origin with credentials allowed',
    },
  ]

  static override flags = {
    credentials: Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Allow credentials (token/cookie) to be sent from this origin',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Add)
    const {origin} = args

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    // Check if the origin argument looks like a file path and warn
    try {
      const isFile = fs.existsSync(path.join(process.cwd(), args.origin))
      if (isFile) {
        this.warn(`Origin "${args.origin}?" Remember to quote values (sanity cors add "*")`)
      }
    } catch {
      // Ignore errors checking if it's a file
    }

    const filteredOrigin = await filterAndValidateOrigin(origin, this.output)
    const hasWildcard = origin.includes('*')

    if (hasWildcard) {
      const confirmed = await this.promptForWildcardConfirmation(origin)
      if (!confirmed) {
        this.error('Operation cancelled', {exit: 1})
      }
    }

    const allowCredentials =
      flags.credentials === undefined
        ? await this.promptForCredentials(hasWildcard)
        : Boolean(flags.credentials)

    if (filteredOrigin !== origin) {
      this.log(`Normalized origin to: ${filteredOrigin}`)
    }

    try {
      const response = await createCorsOrigin({
        allowCredentials,
        origin: filteredOrigin,
        projectId,
      })

      addCorsDebug(`CORS origin added successfully`, response)

      this.log('CORS origin added successfully')
    } catch (error) {
      const err = error as Error

      addCorsDebug(`Error adding CORS origin`, err)
      this.error(`CORS origin addition failed:\n${err.message}`, {exit: 1})
    }
  }

  /**
   * Prompt the user for credentials
   *
   * @param hasWildcard - Whether the origin contains a wildcard
   * @returns - Whether to allow credentials
   */
  private async promptForCredentials(hasWildcard: boolean) {
    this.log('')
    if (hasWildcard) {
      this.log(oneline`
      ${styleText('yellow', `${logSymbols.warning} Warning:`)}
      We ${styleText(['red', 'underline'], 'HIGHLY')} recommend NOT allowing credentials
      on origins containing wildcards. If you are logged in to a studio, people will
      be able to send requests ${styleText('underline', 'on your behalf')} to read and modify
      data, from any matching origin. Please tread carefully!
    `)
    } else {
      this.log(oneline`
      ${styleText('yellow', `${logSymbols.warning} Warning:`)}
      Should this origin be allowed to send requests using authentication tokens or
      session cookies? Be aware that any script on this origin will be able to send
      requests ${styleText('underline', 'on your behalf')} to read and modify data if you
      are logged in to a Sanity studio. If this origin hosts a studio, you will need
      this, otherwise you should probably answer "No" (n).
    `)
    }

    this.log('')

    return confirm({
      default: false,
      message: oneline`
      Allow credentials to be sent from this origin? Please read the warning above.
    `,
    })
  }

  /**
   * Prompt the user for wildcard confirmation
   *
   * @param origin - The origin to check for wildcards
   * @returns - Whether to allow the origin
   */
  private async promptForWildcardConfirmation(origin: string) {
    this.log('')
    this.log(styleText('yellow', `${logSymbols.warning} Warning: Examples of allowed origins:`))

    if (origin === '*') {
      this.log('- http://www.some-malicious.site')
      this.log('- https://not.what-you-were-expecting.com')
      this.log('- https://high-traffic-site.com')
      this.log('- http://192.168.1.1:8080')
    } else {
      this.log(`- ${origin.replace(/:\*/, ':1234').replaceAll('*', 'foo')}`)
      this.log(`- ${origin.replace(/:\*/, ':3030').replaceAll('*', 'foo.bar')}`)
    }

    this.log('')

    return confirm({
      default: false,
      message: oneline`
      Using wildcards can be ${styleText('red', 'risky')}.
      Are you ${styleText('underline', 'absolutely sure')} you want to allow this origin?`,
    })
  }
}

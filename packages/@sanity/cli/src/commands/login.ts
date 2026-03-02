import {Command, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand} from '@sanity/cli-core'

import {login} from '../actions/auth/login/login.js'

export class LoginCommand extends SanityCommand<typeof LoginCommand> {
  static override description = 'Authenticates the CLI for access to Sanity projects'
  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Log in using default settings',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sso my-organization',
      description: 'Log in using Single Sign-On with the "my-organization" slug',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --provider github --no-open',
      description: 'Login with GitHub provider, but do not open a browser window automatically',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --vercel',
      description: 'Login with the Vercel SSO integration',
    },
  ]
  static override flags = {
    experimental: Flags.boolean({
      default: false,
      hidden: true,
    }),
    open: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Open a browser window to log in (`--no-open` only prints URL)',
    }),
    provider: Flags.string({
      description: 'Log in using the given provider',
      helpValue: '<providerId>',
    }),
    sso: Flags.string({
      description: 'Log in using Single Sign-On, using the given organization slug',
      helpValue: '<slug>',
    }),
    vercel: Flags.boolean({
      default: false,
      description: 'Log in using the Vercel provider',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {flags} = await this.parse(LoginCommand)

    try {
      await login({...flags, output: this.output, telemetry: this.telemetry})
      this.log('Login successful')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Login failed: ${message}`, {exit: 1})
    }
  }
}

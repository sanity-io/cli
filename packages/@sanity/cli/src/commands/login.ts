import {text} from 'node:stream/consumers'

import {Command, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand} from '@sanity/cli-core'

import {login} from '../actions/auth/login/login.js'
import {LOGIN_PROVIDER_IDS} from '../actions/auth/login/loginInstructions.js'

export class LoginCommand extends SanityCommand<typeof LoginCommand> {
  static override description = 'Log in to your Sanity account'
  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Log in using default settings',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --with-token < token.txt',
      description: 'Log in using a token from standard input',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --provider github --no-open',
      description: 'Login with GitHub provider, but do not open a browser window automatically',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --sso my-organization',
      description: 'Log in using Single Sign-On with the "my-organization" slug',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --sso my-organization --sso-provider "Okta SSO"',
      description: 'Log in using a specific SSO provider within an organization',
    },
  ]
  static override flags = {
    'with-token': Flags.boolean({
      description: 'Read token from standard input',
      exclusive: ['provider', 'sso'],
    }),
    // eslint-disable-next-line perfectionist/sort-objects -- Keep token login first in generated usage.
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
      description: `Log in using a provider ID (${LOGIN_PROVIDER_IDS.join(', ')})`,
      exclusive: ['sso', 'with-token'],
      helpValue: '<providerId>',
    }),
    sso: Flags.string({
      description: 'Log in using Single Sign-On, using the given organization slug',
      exclusive: ['provider', 'with-token'],
      helpValue: '<slug>',
    }),
    'sso-provider': Flags.string({
      dependsOn: ['sso'],
      description: 'Select a specific SSO provider by name (use with --sso)',
      helpValue: '<name>',
    }),
  } satisfies FlagInput

  public async run(): Promise<void> {
    const {flags} = await this.parse(LoginCommand)
    const {'sso-provider': ssoProvider, 'with-token': withToken, ...loginFlags} = flags

    try {
      const token = withToken ? await readTokenFromStdin() : undefined

      await login({
        ...loginFlags,
        output: this.output,
        ssoProvider,
        telemetry: this.telemetry,
        token,
      })
      this.log('Login successful')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Login failed: ${message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}

async function readTokenFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(
      'Token is required on standard input. Run `sanity login --with-token < token.txt`.',
    )
  }

  return text(process.stdin)
}

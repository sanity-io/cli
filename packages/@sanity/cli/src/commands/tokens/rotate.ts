import {Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

import {rotateToken} from '../../services/tokens.js'
import {readTokenFromStdin} from '../../util/readTokenFromStdin.js'

const tokensRotateDebug = subdebug('tokens:rotate')

const TOKEN_USAGE_HINT =
  'Token is required. Pipe it on standard input (`echo "$SANITY_TOKEN" | sanity tokens rotate`) to keep it out of shell history, or pass it with `--token`.'

export class RotateTokenCommand extends SanityCommand<typeof RotateTokenCommand> {
  static override description = 'Rotate an API token, replacing its secret with a new one'

  static override examples = [
    {
      command: 'echo "$SANITY_TOKEN" | <%= config.bin %> <%= command.id %>',
      description: 'Rotate the token piped on standard input',
    },
    {
      command: '<%= config.bin %> <%= command.id %> < token.txt',
      description: 'Rotate a token read from a file',
    },
    {
      command: 'echo "$SANITY_TOKEN" | <%= config.bin %> <%= command.id %> --json',
      description: 'Output the rotated token as JSON',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    token: Flags.string({
      char: 't',
      description: 'Token to rotate (prefer standard input to keep it out of shell history)',
      helpValue: '<token>',
    }),
  }

  static override hiddenAliases: string[] = ['token:rotate']

  public async run(): Promise<void> {
    const {flags} = await this.parse(RotateTokenCommand)
    const {json} = flags

    const token = flags.token?.trim() || (await this.readTokenArg())

    try {
      tokensRotateDebug('Rotating API token')
      const robot = await rotateToken(token)

      if (json) {
        this.log(JSON.stringify(robot, null, 2))
        return
      }

      this.log('API token rotated')
      this.log(`Label: ${robot.label}`)
      this.log(`ID: ${robot.id}`)
      if (robot.expiresAt) {
        this.log(`Expires: ${robot.expiresAt}`)
      }
      this.log(`Token: ${robot.token}`)
      this.log('')
      this.log("Copy the token now. It won't be shown again.")
      this.log('The previous token was revoked and no longer works.')
    } catch (error) {
      tokensRotateDebug('Error rotating token', error)

      if (isHttpError(error) && error.statusCode === 401) {
        this.error(
          'Token is invalid, expired, or was already rotated or revoked. Check that you are passing the current token.',
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }
      if (isHttpError(error) && error.statusCode === 403) {
        this.error(
          'The token is not an API token and cannot be rotated. Personal tokens are renewed by logging in again.',
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }

      const err = error as Error
      this.error(`Token rotation failed:\n${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private async readTokenArg(): Promise<string> {
    let token: string
    try {
      token = await readTokenFromStdin(TOKEN_USAGE_HINT)
    } catch (error) {
      const err = error as Error
      return this.error(err.message, {exit: exitCodes.USAGE_ERROR})
    }

    if (!token) {
      this.error(TOKEN_USAGE_HINT, {exit: exitCodes.USAGE_ERROR})
    }

    return token
  }
}

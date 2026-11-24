import {join} from 'node:path'

import input from '@inquirer/input'
import select from '@inquirer/select'
import {absolutify, validateEmptyPath} from '@sanity/cli-setup'
import {
  AUTH_API_VERSION,
  canLaunchBrowser,
  exchangeLoginSession,
  getLoginProviders,
  getSamlLoginProviders,
  selectInteractiveLoginProvider,
  selectSamlLoginProvider,
  startServerForTokenCallback,
} from '@sanity/cli-setup/auth'
import open from 'open'

export async function loginForBlueprint(client, staging, log) {
  const authClient = client.withConfig({apiVersion: AUTH_API_VERSION})
  const {providers} = await getLoginProviders(authClient)
  const provider = await selectInteractiveLoginProvider(
    providers,
    (choices) =>
      select({
        choices: choices.map((choice) => ({name: choice.title, value: choice})),
        message: 'Log in or create an account',
      }),
    async () => {
      const slug = await input({message: 'Organization slug:'})
      const samlProviders = await getSamlLoginProviders(authClient, slug)
      return selectSamlLoginProvider(samlProviders, {
        interactive: true,
        select: (choices) =>
          select({
            choices: choices.map((choice) => ({name: choice.name, value: choice})),
            message: 'Select SSO provider',
          }),
      })
    },
  )
  if (!provider)
    throw new Error(
      'No sign-in providers found. Check your organization settings or set SANITY_AUTH_TOKEN.',
    )

  const {loginUrl, server, token} = await startServerForTokenCallback(provider.url, {
    getTokenDetails: (query) => exchangeLoginSession(authClient, query),
    sanityUrl: staging ? 'https://www.sanity.work' : 'https://www.sanity.io',
  })

  try {
    log(`Open this link to sign in: ${loginUrl.href}`)
    if (canLaunchBrowser()) {
      // Keep the printed link usable even if the default browser fails to open.
      void open(loginUrl.href).catch(() => {})
    }
    return (await token).token
  } finally {
    await new Promise((resolve) => server.close(() => resolve()))
  }
}

export async function promptBlueprintOutputPath(projectId) {
  return absolutify(
    await input({
      default: join(process.cwd(), projectId),
      message: 'Project output path:',
      validate: validateEmptyPath,
    }),
  )
}

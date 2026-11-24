import {getSanityUrl} from '@sanity/cli-core'
import {startServerForTokenCallback as startAuthServer} from '@sanity/cli-setup/auth'

import {getTokenDetails} from '../../services/auth.js'

export function startServerForTokenCallback(providerUrl: string) {
  return startAuthServer(providerUrl, {getTokenDetails, sanityUrl: getSanityUrl()})
}

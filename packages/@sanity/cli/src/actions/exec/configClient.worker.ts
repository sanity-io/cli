import {getCliToken} from '@sanity/cli-core'

import {getCliClient} from '../../util/cliClient.js'

const token = await getCliToken()
if (!token) {
  throw new Error(
    '--with-user-token specified, but no auth token could be found. Run `sanity login`',
  )
}

getCliClient.__internal__getToken = () => token

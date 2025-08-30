import {createClient} from '@sanity/client'

import {SANITY_CONFIG} from './constants.js'

export const client = createClient({
  ...SANITY_CONFIG,
  token: process.env.SANITY_API_TOKEN,
})

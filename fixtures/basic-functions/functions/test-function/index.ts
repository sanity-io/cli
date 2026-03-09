import {documentEventHandler} from '@sanity/functions'

export const handler = documentEventHandler(async () => {
  const time = new Date().toLocaleTimeString()
  // eslint-disable-next-line no-console
  console.log(`👋 Your Sanity Function was called at ${time}`)
})

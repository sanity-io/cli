import {createClient} from '@sanity/client'

export function getEmptyAuth() {
  return {
    authenticated: false,
    client: createClient({
      apiHost: 'http://localhost',
      apiVersion: '2025-02-01',
      projectId: 'unused',
      requestTagPrefix: 'sanity.cli',
      useCdn: false,
    }),
    currentUser: null,
  }
}

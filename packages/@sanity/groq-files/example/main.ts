import {createClient} from '@sanity/client'
import {type GroqParams, type GroqResult} from '@sanity/groq-files/types'

import getPostBySlug from './postBySlug.groq'
import getPosts, {type Result as Posts} from './posts.groq'
import getPostsByRole from './postsByRole.groq'
import getPostsByTags from './postsByTags.groq'

const client = createClient({
  apiVersion: '2026-01-01',
  dataset: 'production',
  projectId: 'demo',
  useCdn: true,
})

// The default export is the query string. Its type carries the result and params types along,
// so `GroqResult<typeof getPosts>` and the module's `Result` type are the same thing.
export async function listPosts(): Promise<Posts> {
  return client.fetch<GroqResult<typeof getPosts>>(getPosts)
}

export async function postBySlug(
  params: GroqParams<typeof getPostBySlug>,
): Promise<GroqResult<typeof getPostBySlug>> {
  return client.fetch<GroqResult<typeof getPostBySlug>>(getPostBySlug, params, {
    perspective: 'published',
  })
}

export async function postsByRole(role: 'admin' | 'member') {
  return client.fetch<GroqResult<typeof getPostsByRole>>(getPostsByRole, {role})
}

export async function postsByTags(tags: string[]) {
  return client.fetch<GroqResult<typeof getPostsByTags>>(getPostsByTags, {tags})
}

// The query is still a plain string: a client that reads the brand can infer from it directly.
export const postsQueryText: string = getPosts

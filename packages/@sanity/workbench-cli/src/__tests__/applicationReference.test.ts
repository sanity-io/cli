import {describe, expect, test} from 'vitest'

import {applicationReference} from '../applicationReference.js'

describe('applicationReference', () => {
  test('renders singletons under the sanity alias', () => {
    expect(
      applicationReference({isSingleton: true, name: 'media-library', organizationId: 'org-123'}),
    ).toBe('sanity/media-library')
  })

  test('renders non-singletons under their owning org id', () => {
    expect(
      applicationReference({isSingleton: false, name: 'reviews', organizationId: 'org-123'}),
    ).toBe('org-123/reviews')
  })
})

import {createPresetsRegistry} from '@sanity/presets'

import hero from './hero'

const {defineCta, defineImage, definePage, defineRichText} = createPresetsRegistry({
  link: {internalTypes: ['page']},
})

const page = definePage({
  name: 'page',
  title: 'Page',
  pageBuilderBlocks: ['hero', 'imageBlock', 'cta', 'richText'],
})

export const schemaTypes = [
  page,
  hero,
  defineImage({name: 'imageBlock', title: 'Image'}),
  defineCta({name: 'cta', title: 'Call to action'}),
  defineRichText({name: 'richText', title: 'Rich text'}),
]

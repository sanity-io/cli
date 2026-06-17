import {createPresetsRegistry} from '@sanity/presets'

import hero from './hero'

const {defineCta, defineImage, definePage, defineRichText} = createPresetsRegistry({
  link: {to: ['page']},
})

export const schemaTypes = [
  definePage({
    name: 'page',
    title: 'Page',
    pageBuilderBlocks: ['hero', 'imageBlock', 'cta', 'richText'],
  }),
  hero,
  defineImage({name: 'imageBlock', title: 'Image'}),
  defineCta({name: 'cta', title: 'Call to action'}),
  defineRichText({name: 'richText', title: 'Rich text'}),
]

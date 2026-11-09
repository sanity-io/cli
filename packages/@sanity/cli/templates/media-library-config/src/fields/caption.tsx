import {defineField} from 'sanity'

/**
 * A plain field: no custom input component, so the Media Library renders it
 * with its standard aspect-form controls. Start here — most fields never
 * need a custom component. The definition uses the same `defineField` API as
 * Sanity Studio; validation rules and initial values run in the Media
 * Library's own runtime.
 */
export default defineField({
  name: 'caption',
  title: 'Caption',
  type: 'object',
  fields: [
    defineField({
      name: 'text',
      title: 'Text',
      type: 'string',
      validation: (Rule) => Rule.required().error('A caption is required'),
    }),
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      options: {list: ['en', 'de', 'no']},
      initialValue: 'en',
    }),
  ],
})

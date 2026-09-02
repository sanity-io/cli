import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'shop',
  title: 'Shop',
  type: 'object',
  readOnly: true,
  fields: [
    // Domain
    defineField({
      name: 'domain',
      title: 'Domain',
      type: 'string',
    }),
  ],
})

import {defineField} from 'sanity'

export default defineField({
  name: 'description',
  title: 'Description',
  type: 'text',
  validation: (Rule) => Rule.required(),
})

import {defineArrayMember, defineType} from 'sanity'

/**
 * This is the schema definition for the rich text fields used for
 * for this blog studio. When you import it in schemas.js it can be
 * reused in other parts of the studio with:
 * ```ts
 * {
 *    name: 'someName',
 *    title: 'Some title',
 *    type: 'blockContent'
 *  }
 * ```
 */
export default defineType({
  name: 'blockContent',
  title: 'Block Content',
  type: 'array',

  of: [
    defineArrayMember({
      lists: [{title: 'Bullet', value: 'bullet'}],
      // Marks let you mark up inline text in the block editor.
      marks: {
        // Annotations can be any object structure – e.g. a link or a footnote.
        annotations: [
          {
            fields: [
              {
                name: 'href',
                title: 'URL',
                type: 'url',
              },
            ],
            name: 'link',
            title: 'URL',
            type: 'object',
          },
        ],
        // Decorators usually describe a single property – e.g. a typographic
        // preference or highlighting by editors.
        decorators: [
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
        ],
      },
      // Styles let you set what your user can mark up blocks with. These
      // correspond with HTML tags, but you can set any title or value
      // you want and decide how you want to deal with it where you want to
      // use your content.
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'H1', value: 'h1'},
        {title: 'H2', value: 'h2'},
        {title: 'H3', value: 'h3'},
        {title: 'H4', value: 'h4'},
        {title: 'Quote', value: 'blockquote'},
      ],
      title: 'Block',
      type: 'block',
    }),
    // You can add additional types here. Note that you can't use
    // primitive types such as 'string' and 'number' in the same array
    // as a block type.
    defineArrayMember({
      options: {hotspot: true},
      type: 'image',
    }),
  ],
})

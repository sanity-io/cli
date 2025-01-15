import blockContent from './blockContent.js'
import category from './category.js'
import product from './product.js'
import vendor from './vendor.js'
import productVariant from './productVariant.js'

import localeString from './locale/localeString.js'
import localeText from './locale/localeText.js'
import localeBlockContent from './locale/localeBlockContent.js'

export const schemaTypes = [
  // Document types
  product,
  vendor,
  category,

  // Other types
  blockContent,
  localeText,
  localeBlockContent,
  localeString,
  productVariant,
]

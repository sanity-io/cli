// document types
import collection from './documents/collection.js'
import product from './documents/product.js'
import productVariant from './documents/productVariant.js'

// objects
import accordion from './objects/accordion.js'
import accordionGroup from './objects/accordionGroup.js'
import callout from './objects/callout.js'
import inventory from './objects/inventory.js'
import option from './objects/option.js'
import priceRange from './objects/priceRange.js'
import proxyString from './objects/proxyString.js'
import shopifyCollection from './objects/shopifyCollection.js'
import shopifyCollectionRule from './objects/shopifyCollectionRule.js'
import shopifyProduct from './objects/shopifyProduct.js'
import shopifyProductVariant from './objects/shopifyProductVariant.js'

// block content
import blockContent from './blocks/blockContent.js'

export const schemaTypes = [
  // document types
  collection,
  product,
  productVariant,

  // objects
  accordion,
  accordionGroup,
  callout,
  inventory,
  option,
  priceRange,
  proxyString,
  shopifyCollection,
  shopifyCollectionRule,
  shopifyProduct,
  shopifyProductVariant,

  // block content
  blockContent,
]

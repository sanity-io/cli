// document types
import collection from './documents/collection'
import product from './documents/product'
import productVariant from './documents/productVariant'

// objects
import accordion from './objects/accordion'
import accordionGroup from './objects/accordionGroup'
import callout from './objects/callout'
import inventory from './objects/inventory'
import option from './objects/option'
import priceRange from './objects/priceRange'
import shop from './objects/shop'
import proxyString from './objects/proxyString'
import shopifyCollection from './objects/shopifyCollection'
import shopifyCollectionRule from './objects/shopifyCollectionRule'
import shopifyMetafield from './objects/shopifyMetafield'
import shopifyProduct from './objects/shopifyProduct'
import shopifyProductVariant from './objects/shopifyProductVariant'

// block content
import blockContent from './blocks/blockContent'

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
  shop,
  shopifyCollection,
  shopifyCollectionRule,
  shopifyMetafield,
  shopifyProduct,
  shopifyProductVariant,

  // block content
  blockContent,
]

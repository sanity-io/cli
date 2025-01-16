import {accordionGroupType} from './objects/module/accordionGroupType.js'
import {accordionType} from './objects/module/accordionType.js'
import {calloutType} from './objects/module/calloutType.js'
import {callToActionType} from './objects/module/callToActionType.js'
import {collectionGroupType} from './objects/collection/collectionGroupType.js'
import {collectionLinksType} from './objects/collection/collectionLinksType.js'
import {collectionReferenceType} from './objects/module/collectionReferenceType.js'
import {collectionRuleType} from './objects/shopify/collectionRuleType.js'
import {customProductOptionColorObjectType} from './objects/customProductOption/customProductOptionColorObjectType.js'
import {customProductOptionColorType} from './objects/customProductOption/customProductOptionColorType.js'
import {customProductOptionSizeObjectType} from './objects/customProductOption/customProductOptionSizeObjectType.js'
import {customProductOptionSizeType} from './objects/customProductOption/customProductOptionSizeType.js'
import {footerType} from './objects/global/footerType.js'
import {gridItemType} from './objects/module/gridItemType.js'
import {gridType} from './objects/module/gridType.js'
import {heroType} from './objects/module/heroType.js'
import {imageCallToActionType} from './objects/module/imageCallToActionType.js'
import {imageFeaturesType} from './objects/module/imageFeaturesType.js'
import {imageFeatureType} from './objects/module/imageFeatureType.js'
import {imageWithProductHotspotsType} from './objects/hotspot/imageWithProductHotspotsType.js'
import {instagramType} from './objects/module/instagramType.js'
import {inventoryType} from './objects/shopify/inventoryType.js'
import {linkEmailType} from './objects/link/linkEmailType.js'
import {linkExternalType} from './objects/link/linkExternalType.js'
import {linkInternalType} from './objects/link/linkInternalType.js'
import {linkProductType} from './objects/link/linkProductType.js'
import {menuLinksType} from './objects/global/menuLinksType.js'
import {menuType} from './objects/global/menuType.js'
import {notFoundPageType} from './objects/global/notFoundPageType.js'
import {optionType} from './objects/shopify/optionType.js'
import {placeholderStringType} from './objects/shopify/placeholderStringType.js'
import {priceRangeType} from './objects/shopify/priceRangeType.js'
import {productFeaturesType} from './objects/module/productFeaturesType.js'
import {productHotspotsType} from './objects/hotspot/productHotspotsType.js'
import {productReferenceType} from './objects/module/productReferenceType.js'
import {productWithVariantType} from './objects/shopify/productWithVariantType.js'
import {proxyStringType} from './objects/shopify/proxyStringType.js'
import {seoType} from './objects/seoType.js'
import {shopifyCollectionType} from './objects/shopify/shopifyCollectionType.js'
import {shopifyProductType} from './objects/shopify/shopifyProductType.js'
import {shopifyProductVariantType} from './objects/shopify/shopifyProductVariantType.js'
import {spotType} from './objects/hotspot/spotType.js'

// Objects used as annotations must be imported first
const annotations = [linkEmailType, linkExternalType, linkInternalType, linkProductType]

const objects = [
  accordionGroupType,
  accordionType,
  calloutType,
  callToActionType,
  collectionGroupType,
  collectionLinksType,
  collectionReferenceType,
  collectionRuleType,
  customProductOptionColorObjectType,
  customProductOptionColorType,
  customProductOptionSizeObjectType,
  customProductOptionSizeType,
  footerType,
  gridItemType,
  gridType,
  heroType,
  imageCallToActionType,
  imageFeaturesType,
  imageFeatureType,
  imageWithProductHotspotsType,
  instagramType,
  inventoryType,
  menuLinksType,
  menuType,
  notFoundPageType,
  optionType,
  placeholderStringType,
  priceRangeType,
  productFeaturesType,
  productHotspotsType,
  productReferenceType,
  productWithVariantType,
  proxyStringType,
  seoType,
  shopifyCollectionType,
  shopifyProductType,
  shopifyProductVariantType,
  spotType,
]

import {portableTextType} from './portableText/portableTextType.js'
import {portableTextSimpleType} from './portableText/portableTextSimpleType.js'

const blocks = [portableTextType, portableTextSimpleType]

import {collectionType} from './documents/collection.js'
import {colorThemeType} from './documents/colorTheme.js'
import {pageType} from './documents/page.js'
import {productType} from './documents/product.js'
import {productVariantType} from './documents/productVariant.js'

const documents = [collectionType, colorThemeType, pageType, productType, productVariantType]

import {homeType} from './singletons/homeType.js'
import {settingsType} from './singletons/settingsType.js'

const singletons = [homeType, settingsType]

export const schemaTypes = [...annotations, ...objects, ...singletons, ...blocks, ...documents]

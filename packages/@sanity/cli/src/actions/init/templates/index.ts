import {type ProjectTemplate} from '../types'
import appTemplate from './appQuickstart'
import appSanityUiTemplate from './appSanityUi'
import blog from './blog'
import clean from './clean'
import getStartedTemplate from './getStarted'
import moviedb from './moviedb'
import quickstart from './quickstart'
import shopify from './shopify'
import shopifyOnline from './shopifyOnline'

const templates: Record<string, ProjectTemplate | undefined> = {
  'app-quickstart': appTemplate,
  'app-sanity-ui': appSanityUiTemplate,
  blog,
  clean,
  'get-started': getStartedTemplate,
  moviedb,
  quickstart, // empty project that dynamically imports its own schema
  shopify,
  'shopify-online-storefront': shopifyOnline,
}

export default templates

import {type ProjectTemplate} from '../types.js'
import appTemplate from './appQuickstart.js'
import appSanityUiTemplate from './appSanityUi.js'
import blog from './blog.js'
import clean from './clean.js'
import getStartedTemplate from './getStarted.js'
import moviedb from './moviedb.js'
import quickstart from './quickstart.js'
import shopify from './shopify.js'
import shopifyOnline from './shopifyOnline.js'

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

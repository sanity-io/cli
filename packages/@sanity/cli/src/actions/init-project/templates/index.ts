import {type ProjectTemplate} from '../initProject.js'
import blog from './blog.js'
import clean from './clean.js'
import getStartedTemplate from './getStarted.js'
import moviedb from './moviedb.js'
import quickstart from './quickstart.js'
import shopify from './shopify.js'
import shopifyOnline from './shopifyOnline.js'

const templates: Record<string, ProjectTemplate | undefined> = {
  blog,
  clean,
  'get-started': getStartedTemplate,
  moviedb,
  shopify,
  'shopify-online-storefront': shopifyOnline,
  quickstart, // empty project that dynamically imports its own schema
}

export default templates

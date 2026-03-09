import author from './author'
import blockContent from './blockContent'
import category from './category'
import event from './event'
import post from './post'

// Both workspaces share post, author, category, blockContent
// Staging additionally includes event
export const productionSchemaTypes = [post, author, category, blockContent]
export const stagingSchemaTypes = [post, author, category, event, blockContent]

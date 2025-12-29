import {isIndexSegment, isIndexTuple, isKeySegment, type Path} from '@sanity/types'

// FIXME: de-dupe this
// copy/paste of `pathToString` from 'sanity' to prevent circular imports
function pathToString(path: Path): string {
  if (!Array.isArray(path)) {
    throw new TypeError('Path is not an array')
  }

  let target = ''
  let i = 0
  for (const segment of path) {
    if (isIndexSegment(segment)) {
      target = `${target}[${segment}]`
    } else if (isKeySegment(segment) && segment._key) {
      target = `${target}[_key=="${segment._key}"]`
    } else if (isIndexTuple(segment)) {
      const [from, to] = segment
      target = `${target}[${from}:${to}]`
    } else if (typeof segment === 'string') {
      const separator = i === 0 ? '' : '.'
      target = `${target}${separator}${segment}`
    } else {
      throw new TypeError(`Unsupported path segment \`${JSON.stringify(segment)}\``)
    }
    i++
  }
  return target
}

interface BaseNode {
  path: Path
}

export interface Tree<Node extends BaseNode> {
  children?: Record<string, Tree<Node>>
  nodes?: Node[]
}

/**
 * Recursively calculates the max length of all the keys in the given validation
 * tree respecting extra length due to indentation depth. Used to calculate the
 * padding for the rest of the tree.
 */
export const maxKeyLength = (children: Record<string, Tree<BaseNode>> = {}, depth = 0): number => {
  let max = 0
  for (const [key, child] of Object.entries(children)) {
    const currentMax = Math.max(key.length + depth * 2, maxKeyLength(child.children, depth + 1))
    max = Math.max(max, currentMax)
  }
  return max
}

interface Options<Node extends BaseNode> {
  getMessage: (node: Node) => string
  paddingLength: number

  getNodes?: (node: Tree<Node>) => Node[] | undefined
  indent?: string
  node?: Record<string, Tree<Node>>
}

/**
 * Recursively formats a given tree into a printed user-friendly tree structure
 */
export const formatTree = <Node extends BaseNode>({
  getMessage,
  getNodes: getLeaves = ({nodes}) => nodes,
  indent = '',
  node = {},
  paddingLength,
}: Options<Node>): string => {
  const entries = Object.entries(node)

  return entries
    .map(([key, child], index) => {
      const isLast = index === entries.length - 1
      const nextIndent = `${indent}${isLast ? '  ' : '│ '}`
      const leaves = getLeaves(child)

      const nested = formatTree({
        getMessage,
        getNodes: getLeaves,
        indent: nextIndent,
        node: child.children,
        paddingLength,
      })

      if (!leaves?.length) {
        const current = `${indent}${isLast ? '└' : '├'}─ ${key}`
        return [current, nested].filter(Boolean).join('\n')
      }

      const [first, ...rest] = leaves
      const firstPadding = '.'.repeat(paddingLength - indent.length - key.length)
      const elbow = isLast ? '└' : '├'
      const subsequentPadding = ' '.repeat(paddingLength - indent.length + 2)

      const firstMessage = `${indent}${elbow}─ ${key} ${firstPadding} ${getMessage(first)}`
      const subsequentMessages = rest
        .map((marker) => `${nextIndent}${subsequentPadding} ${getMessage(marker)}`)
        .join('\n')

      const current = [firstMessage, subsequentMessages].filter(Boolean).join('\n')
      return [current, nested].filter(Boolean).join('\n')
    })
    .join('\n')
}

/**
 * Converts a set of markers with paths into a tree of markers where the paths
 * are embedded in the tree
 */
export function convertToTree<const Node extends BaseNode>(nodes: Node[]): Tree<Node> {
  const root: Tree<Node> = {}

  // add the markers to the tree
  function addNode(node: Node, tree: Tree<Node> = root) {
    // if we've traversed the whole path
    if (node.path.length === 0) {
      if (!tree.nodes) tree.nodes = [] // ensure markers is defined

      // then add the marker to the front
      tree.nodes.push(node)
      return
    }

    const [current, ...rest] = node.path
    const key = pathToString([current])

    // ensure the current node has children and the next node
    if (!tree.children) tree.children = {}
    if (!(key in tree.children)) tree.children[key] = {}

    addNode({...node, path: rest}, tree.children[key])
  }

  for (const node of nodes) addNode(node)
  return root
}

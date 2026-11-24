// jscodeshift runs transforms from its own install; `Collection#find(j.X)` reads as an array call
/* oxlint-disable n-js/no-unpublished-import, unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument */
import {
  type API,
  type ASTPath,
  type CallExpression,
  type Collection,
  type ExportDefaultDeclaration,
  type FileInfo,
  type ImportDeclaration,
  type ImportSpecifier,
  type JSCodeshift,
  type Options,
} from 'jscodeshift'

interface Import {
  kind: 'type' | 'value'
  name: string
  source: string
}

const VIEWS: Partial<Record<string, {hook: string; name: string}>> = {
  asset_source: {hook: 'useAssetSource', name: 'AssetSource'},
  tile: {hook: 'useTile', name: 'Tile'},
}

function uniqueName(j: JSCodeshift, root: Collection, base: string): string {
  const used = new Set(
    [...root.find(j.Identifier).nodes(), ...root.find(j.JSXIdentifier).nodes()].map(
      (node) => node.name,
    ),
  )
  let name = base
  for (let index = 2; used.has(name); index++) name = `${base}${index}`

  return name
}

function migrateView(
  j: JSCodeshift,
  root: Collection,
  api: API,
  exportDefault: ExportDefaultDeclaration,
  call: CallExpression,
): boolean {
  const [surface, components] = call.arguments
  const surfaceName = j.StringLiteral.check(surface) ? surface.value : ''
  const view = VIEWS[surfaceName]
  const slot =
    view && j.ObjectExpression.check(components)
      ? components.properties.find(
          (property) =>
            j.ObjectProperty.check(property) &&
            ((j.Identifier.check(property.key) && property.key.name === surfaceName) ||
              (j.StringLiteral.check(property.key) && property.key.value === surfaceName)),
        )
      : undefined
  const fn = j.ObjectProperty.check(slot) ? slot.value : undefined
  const isFunction = j.ArrowFunctionExpression.check(fn) || j.FunctionExpression.check(fn)
  const [props, ...rest] = isFunction ? fn.params : []

  if (
    !view ||
    !isFunction ||
    rest.length > 0 ||
    (props && !j.Identifier.check(props) && !j.ObjectPattern.check(props))
  ) {
    api.report(
      'Left `unstable_defineView` unchanged: only tile and asset_source views with an inline component are migrated.',
    )
    return false
  }

  const name = j.FunctionExpression.check(fn) && j.Identifier.check(fn.id) ? fn.id.name : ''
  const isNameFree = name && !root.find(j.Program).paths()[0]?.scope?.declares(name)
  const id = j.identifier(isNameFree ? name : uniqueName(j, root, view.name))
  const body = j.BlockStatement.check(fn.body)
    ? fn.body
    : j.blockStatement([j.returnStatement(fn.body)])
  if (props) {
    body.body.unshift(
      j.variableDeclaration('const', [
        j.variableDeclarator(props, j.callExpression(j.identifier(view.hook), [])),
      ]),
    )
    addImport(j, root, {kind: 'value', name: view.hook, source: '@sanity/sdk-react/dashboard'})
  }

  exportDefault.declaration = j.functionDeclaration(id, [], body)

  return true
}

function migrateWebWorker(
  j: JSCodeshift,
  root: Collection,
  api: API,
  exportDefault: ExportDefaultDeclaration,
  call: CallExpression,
  isTypeScript: boolean,
  sdkPackage: string,
): boolean {
  const [, fn] = call.arguments
  if (!j.ArrowFunctionExpression.check(fn) && !j.FunctionExpression.check(fn)) {
    api.report('Left `unstable_defineService` unchanged: only an inline function is migrated.')
    return false
  }

  const [param] = fn.params
  const props = j.AssignmentPattern.check(param) ? param.left : param
  if (j.ObjectPattern.check(props)) {
    for (const property of props.properties) {
      if (j.ObjectProperty.check(property) && j.Identifier.check(property.key)) {
        if (property.key.name !== 'service') continue

        property.key = j.identifier('worker')
        property.shorthand = false
      }
    }
  } else if (j.Identifier.check(props)) {
    const members = j(fn.body)
      .find(j.MemberExpression, {
        computed: false,
        object: {name: props.name},
        property: {name: 'service'},
      })
      .nodes()
    for (const member of members) member.property = j.identifier('worker')
  }

  exportDefault.declaration = fn

  if (isTypeScript && (j.ObjectPattern.check(props) || j.Identifier.check(props))) {
    props.typeAnnotation = j.tsTypeAnnotation(j.tsTypeReference(j.identifier('WebWorkerProps')))
    addImport(j, root, {kind: 'type', name: 'WebWorkerProps', source: `${sdkPackage}/dashboard`})
  }

  return true
}

function addImport(j: JSCodeshift, root: Collection, {kind, name, source}: Import): void {
  const declarations = root
    .find(j.ImportDeclaration, {source: {value: source}})
    .filter((path) => (path.node.importKind ?? 'value') === kind)
  if (declarations.find(j.ImportSpecifier, {imported: {name}}).size() > 0) return

  const specifier = j.importSpecifier(j.identifier(name))
  const existing = declarations.nodes()[0]
  if (existing?.specifiers) {
    existing.specifiers.push(specifier)
    return
  }

  const declaration = j.importDeclaration([specifier], j.stringLiteral(source), kind)
  root.find(j.ImportDeclaration).paths().at(-1)?.insertAfter(declaration)
}

function removeUnusedImport(j: JSCodeshift, root: Collection, path: ASTPath<ImportSpecifier>) {
  const {local} = path.node
  const isUsed =
    j.Identifier.check(local) &&
    root
      .find(j.Identifier, {name: local.name})
      .filter((identifier) => identifier.parent.node !== path.node)
      .size() > 0
  if (isUsed) return

  const declaration: ASTPath<ImportDeclaration> = path.parent
  path.prune()
  if (declaration.node.specifiers?.length) return

  // The parser attaches a file header comment to the first import
  const body = root.find(j.Program).nodes()[0]?.body ?? []
  const next = body[body.indexOf(declaration.node) + 1]
  if (next && declaration.node.comments) {
    next.comments = [...declaration.node.comments, ...(next.comments ?? [])]
  }

  declaration.prune()
}

export default function dashboardViewsV1(
  file: FileInfo,
  api: API,
  {sdkPackage = '@sanity/sdk-react'}: Options,
): string | undefined {
  const j = api.jscodeshift
  const root = j(file.source)
  const isTypeScript = /\.tsx?$/.test(file.path)

  const defines = ['unstable_defineService', 'unstable_defineView'].flatMap((defineName) =>
    root
      .find(j.ImportSpecifier, {imported: {name: defineName}})
      .paths()
      .map((specifier) => ({defineName, specifier})),
  )

  const migrated = defines.flatMap(({defineName, specifier}) => {
    const {local} = specifier.node
    if (!j.Identifier.check(local)) return []

    return root
      .find(j.CallExpression, {callee: {name: local.name}})
      .paths()
      .map((path) => {
        const exportDefault = path.parent.node
        if (!j.ExportDefaultDeclaration.check(exportDefault)) {
          api.report(
            `Left \`${defineName}\` unchanged: only \`export default ${defineName}(...)\` is migrated.`,
          )
          return false
        }

        return defineName === 'unstable_defineView'
          ? migrateView(j, root, api, exportDefault, path.node)
          : migrateWebWorker(j, root, api, exportDefault, path.node, isTypeScript, sdkPackage)
      })
  })
  if (!migrated.includes(true)) return undefined

  for (const {specifier} of defines) removeUnusedImport(j, root, specifier)

  return root.toSource()
}

export const parser = 'tsx'

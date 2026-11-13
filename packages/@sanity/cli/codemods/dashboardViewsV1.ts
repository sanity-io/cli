import {
  type API,
  type ArrowFunctionExpression,
  type ASTPath,
  type CallExpression,
  type Collection,
  type ExportDefaultDeclaration,
  type FileInfo,
  type FunctionDeclaration,
  type FunctionExpression,
  type Identifier,
  type ImportSpecifier,
  type JSCodeshift,
  type ObjectPattern,
  type VariableDeclaration,
} from 'jscodeshift'

type ComponentFunction = ArrowFunctionExpression | FunctionDeclaration | FunctionExpression

interface DefineCall {
  call: CallExpression
  exportPath: ASTPath<ExportDefaultDeclaration>
  specifier: ImportSpecifier
}

interface ViewMigration {
  hook: string
  name: string
}

const SANITY_DASHBOARD = 'sanity/dashboard'

const VIEWS: Partial<Record<string, ViewMigration>> = {
  asset_source: {hook: 'useAssetSource', name: 'AssetSource'},
  panel: {hook: 'usePanel', name: 'Panel'},
  tile: {hook: 'useTile', name: 'Tile'},
}

function keyName(j: JSCodeshift, node: unknown): string | undefined {
  if (!j.ObjectProperty.check(node) && !j.Property.check(node)) return undefined
  if (j.Identifier.check(node.key)) return node.key.name

  return j.StringLiteral.check(node.key) ? node.key.value : undefined
}

function findDefineCall(j: JSCodeshift, root: Collection, name: string): DefineCall | undefined {
  const specifier = root.find(j.ImportSpecifier, {imported: {name}}).nodes()[0]
  if (!specifier) return undefined

  const local = specifier.local?.name ?? name
  const exportPath = root
    .find(j.ExportDefaultDeclaration, {
      declaration: {callee: {name: local}, type: 'CallExpression'},
    })
    .paths()[0]
  const call = exportPath?.node.declaration
  if (!exportPath || !j.CallExpression.check(call)) return undefined

  return {call, exportPath, specifier}
}

function findFunction(
  j: JSCodeshift,
  root: Collection,
  node: unknown,
): ComponentFunction | undefined {
  if (j.ArrowFunctionExpression.check(node) || j.FunctionExpression.check(node)) return node
  if (!j.Identifier.check(node)) return undefined

  const declaration = root.find(j.FunctionDeclaration, {id: {name: node.name}}).nodes()[0]
  if (declaration) return declaration

  const init = root.find(j.VariableDeclarator, {id: {name: node.name}}).nodes()[0]?.init

  return init ? findFunction(j, root, init) : undefined
}

function readsProps(
  j: JSCodeshift,
  fn: ComponentFunction,
  param: Identifier | ObjectPattern,
): boolean {
  const names = j.Identifier.check(param)
    ? [param.name]
    : j(param)
        .find(j.Identifier)
        .nodes()
        .map((node) => node.name)

  return names.some((name) => j(fn.body).find(j.Identifier, {name}).size() > 0)
}

function readPropsFromHook(j: JSCodeshift, fn: ComponentFunction | undefined, hook: string): void {
  const [param] = fn?.params ?? []
  if (!fn || (!j.Identifier.check(param) && !j.ObjectPattern.check(param))) return

  if (!readsProps(j, fn, param)) {
    fn.params = []
    return
  }

  param.typeAnnotation = null
  const declaration = j.variableDeclaration('const', [
    j.variableDeclarator(param, j.callExpression(j.identifier(hook), [])),
  ])
  fn.params = []
  fn.body = j.BlockStatement.check(fn.body)
    ? j.blockStatement([declaration, ...fn.body.body])
    : j.blockStatement([declaration, j.returnStatement(fn.body)])
}

function localName(j: JSCodeshift, root: Collection, source: string, name: string): string {
  const imported = root
    .find(j.ImportDeclaration, {source: {value: source}})
    .find(j.ImportSpecifier, {imported: {name}})
    .nodes()[0]?.local
  if (j.Identifier.check(imported)) return imported.name

  const isBound =
    root
      .find(j.Identifier, {name})
      .filter((path) => Boolean(path.scope?.lookup(name)))
      .size() > 0

  return isBound ? uniqueName(j, root, name) : name
}

function addImport(
  j: JSCodeshift,
  root: Collection,
  source: string,
  name: string,
  local: string,
  kind: 'type' | 'value' = 'value',
): void {
  const declarations = root.find(j.ImportDeclaration, {source: {value: source}})
  if (declarations.find(j.ImportSpecifier, {imported: {name}}).size() > 0) return

  const specifier = j.importSpecifier(j.identifier(name), j.identifier(local))
  const existing = declarations
    .filter((path) => (path.node.importKind ?? 'value') === kind)
    .nodes()[0]
  if (existing) {
    existing.specifiers = [...(existing.specifiers ?? []), specifier]
    return
  }

  const declaration = j.importDeclaration([specifier], j.stringLiteral(source))
  declaration.importKind = kind
  const lastImport = root.find(j.ImportDeclaration).paths().at(-1)

  if (lastImport) {
    lastImport.insertAfter(declaration)
  } else {
    root.find(j.Program).nodes()[0]?.body.unshift(declaration)
  }
}

function removeImportIfUnused(j: JSCodeshift, root: Collection, specifier: ImportSpecifier): void {
  if (!j.Identifier.check(specifier.local)) return

  const {name} = specifier.local
  const used = root
    .find(j.Identifier, {name})
    .filter((path) => path.node !== specifier.local && path.node !== specifier.imported)
    .size()
  if (used > 0) return

  const declarations = root
    .find(j.ImportDeclaration)
    .filter((path) => (path.node.specifiers ?? []).includes(specifier))
    .paths()

  for (const path of declarations) {
    const specifiers = (path.node.specifiers ?? []).filter((node) => node !== specifier)

    if (specifiers.length > 0) {
      path.node.specifiers = specifiers
      continue
    }

    const body = root.find(j.Program).nodes()[0]?.body ?? []
    const next = body[body.indexOf(path.node) + 1]
    if (next && path.node.comments)
      next.comments = [...path.node.comments, ...(next.comments ?? [])]
    path.prune()
  }
}

function uniqueName(j: JSCodeshift, root: Collection, base: string): string {
  const used = new Set([
    ...root
      .find(j.Identifier)
      .nodes()
      .map((node) => node.name),
    ...root
      .find(j.JSXIdentifier)
      .nodes()
      .map((node) => node.name),
  ])
  let name = base
  for (let index = 2; used.has(name); index++) name = `${base}${index}`

  return name
}

function hoistComponent(
  j: JSCodeshift,
  root: Collection,
  define: DefineCall,
  component: unknown,
  hook: string,
  base: string,
): {declaration?: FunctionDeclaration | VariableDeclaration; name: string} {
  readPropsFromHook(j, findFunction(j, root, component), hook)
  if (j.Identifier.check(component)) return {name: component.name}

  if (j.FunctionExpression.check(component) && j.Identifier.check(component.id)) {
    const declaration = j.functionDeclaration(component.id, component.params, component.body)
    define.exportPath.insertBefore(declaration)

    return {declaration, name: component.id.name}
  }

  if (!j.ArrowFunctionExpression.check(component) && !j.FunctionExpression.check(component)) {
    throw new Error(`Expected the \`${base}\` component to be a function or a component name.`)
  }

  const name = uniqueName(j, root, base)
  const declaration = j.variableDeclaration('const', [
    j.variableDeclarator(j.identifier(name), component),
  ])
  define.exportPath.insertBefore(declaration)

  return {declaration, name}
}

function inlineSlot(
  j: JSCodeshift,
  component: unknown,
): {element: string; properties: string[]} | undefined {
  if (!j.ArrowFunctionExpression.check(component) && !j.FunctionExpression.check(component)) {
    return undefined
  }

  const [param, ...rest] = component.params
  const isPattern =
    j.ObjectPattern.check(param) &&
    !param.properties.some((property) => j.RestElement.check(property))
  if (rest.length > 0 || (param && !isPattern)) return undefined

  const [statement, ...statements] = j.BlockStatement.check(component.body)
    ? component.body.body
    : [j.returnStatement(component.body)]
  if (statements.length > 0 || !j.ReturnStatement.check(statement) || !statement.argument) {
    return undefined
  }

  const source = j(statement.argument).toSource()
  const isJSX = j.JSXElement.check(statement.argument) || j.JSXFragment.check(statement.argument)

  return {
    element: isJSX ? source.replace(/^\(([\s\S]*)\)$/, '$1') : `{${source}}`,
    properties:
      param && readsProps(j, component, param)
        ? param.properties.map((property) => j(property).toSource())
        : [],
  }
}

function migratePanel(
  j: JSCodeshift,
  root: Collection,
  define: DefineCall,
  slot: (name: string) => unknown,
): void {
  const imports = [
    ['@sanity/ui', 'Box'],
    ['@sanity/ui', 'Button'],
    ['@sanity/ui', 'Flex'],
    ['@sanity/ui', 'ThemeProvider'],
    ['@sanity/ui', 'usePrefersDark'],
    ['@sanity/ui/theme', 'buildTheme'],
    ['@sanity/icons', 'CloseIcon'],
    [SANITY_DASHBOARD, 'usePanel'],
  ] as const
  const locals = imports.map(([source, name]) => localName(j, root, source, name))
  const [box, button, flex, themeProvider, usePrefersDark, buildTheme, closeIcon, usePanel] = locals
  const properties = new Set(['onClose'])
  const [title, body] = [
    ['title', 'Title'],
    ['panel', 'Body'],
  ].map(([name, base]) => {
    const inlined = inlineSlot(j, slot(name))
    if (!inlined) return `<${hoistComponent(j, root, define, slot(name), usePanel, base).name} />`

    for (const property of inlined.properties) properties.add(property)

    return inlined.element.replaceAll('\n', '\n          ')
  })
  const theme = uniqueName(j, root, 'theme')

  const statements = j(`const ${theme} = ${buildTheme}();

export default function ${uniqueName(j, root, 'Panel')}() {
  const { ${[...properties].join(', ')} } = ${usePanel}();
  const prefersDark = ${usePrefersDark}();

  return (
    <${themeProvider} scheme={prefersDark ? "dark" : "light"} theme={${theme}}>
      <${flex} direction="column" height="fill" paddingY={2}>
        <${flex} align="center" gap={2} justify="space-between" paddingX={3} paddingY={2}>
          ${title}
          <${button}
            aria-label="Close panel"
            fontSize={1}
            icon={${closeIcon}}
            mode="bleed"
            onClick={onClose}
            padding={2}
          />
        </${flex}>
        <${box} flex={1} overflow="auto" paddingX={3}>
          ${body}
        </${box}>
      </${flex}>
    </${themeProvider}>
  );
}`)
    .find(j.Program)
    .nodes()[0]?.body
  if (!statements) return

  statements[0].comments = define.exportPath.node.comments
  define.exportPath.replace(...statements)

  for (const [index, [source, name]] of imports.entries()) {
    addImport(j, root, source, name, locals[index])
  }
}

function migrateView(j: JSCodeshift, root: Collection): boolean {
  const define = findDefineCall(j, root, 'unstable_defineView')
  if (!define) return false

  const [surface, components] = define.call.arguments
  const view = j.StringLiteral.check(surface) ? VIEWS[surface.value] : undefined

  if (!view || !j.StringLiteral.check(surface) || !j.ObjectExpression.check(components)) {
    throw new Error(
      'Expected `unstable_defineView` with a panel, tile or asset_source surface and an object of components.',
    )
  }

  const slot = (name: string) => {
    const property = components.properties.find((node) => keyName(j, node) === name)

    return j.ObjectProperty.check(property) || j.Property.check(property)
      ? property.value
      : undefined
  }

  if (surface.value === 'panel') {
    migratePanel(j, root, define, slot)
  } else {
    const hook = localName(j, root, SANITY_DASHBOARD, view.hook)
    const {declaration, name} = hoistComponent(
      j,
      root,
      define,
      slot(surface.value),
      hook,
      view.name,
    )
    define.exportPath.node.declaration = j.identifier(name)

    if (declaration) {
      declaration.comments = define.exportPath.node.comments
      define.exportPath.node.comments = null
    }

    if (root.find(j.CallExpression, {callee: {name: hook}}).size() > 0) {
      addImport(j, root, SANITY_DASHBOARD, view.hook, hook)
    }
  }

  removeImportIfUnused(j, root, define.specifier)

  return true
}

function renameServiceToWorker(j: JSCodeshift, root: Collection, fn: ComponentFunction): void {
  const [param] = fn.params

  if (j.Identifier.check(param)) {
    const members = j(fn.body)
      .find(j.MemberExpression, {
        computed: false,
        object: {name: param.name},
        property: {name: 'service'},
      })
      .nodes()

    for (const member of members) member.property = j.identifier('worker')
    return
  }

  if (!j.ObjectPattern.check(param)) return

  const property = param.properties.find((node) => keyName(j, node) === 'service')
  if (!(j.ObjectProperty.check(property) || j.Property.check(property))) return

  const body = root
    .find(j.Function)
    .filter((path) => path.node === fn)
    .paths()[0]
    ?.get('body')
  const scope = body?.scope.lookup('service')
  const references = j(body)
    .find(j.Identifier, {name: 'service'})
    .filter((reference) => reference.scope.lookup('service') === scope)
    .paths()

  property.key = j.identifier('worker')
  if (!property.shorthand) return

  if (j(fn.body).find(j.Identifier, {name: 'worker'}).size() > 0) {
    property.shorthand = false
    return
  }

  if (j.AssignmentPattern.check(property.value)) {
    property.value.left = j.identifier('worker')
  } else {
    property.value = j.identifier('worker')
  }

  for (const reference of references) {
    const parent: unknown = reference.parent?.node
    const isComputed =
      (j.MemberExpression.check(parent) ||
        j.ObjectProperty.check(parent) ||
        j.Property.check(parent)) &&
      parent.computed
    const isKey = (reference.name === 'key' || reference.name === 'property') && !isComputed

    if (!isKey) {
      reference.node.name = 'worker'
      continue
    }

    if ((j.ObjectProperty.check(parent) || j.Property.check(parent)) && parent.shorthand) {
      parent.shorthand = false
      parent.value = j.identifier('worker')
    }
  }
}

function migrateWebWorker(j: JSCodeshift, root: Collection, isTypeScript: boolean): boolean {
  const define = findDefineCall(j, root, 'unstable_defineService')
  if (!define) return false

  const [, run] = define.call.arguments
  const fn = findFunction(j, root, run)

  if (
    !fn ||
    !(
      j.ArrowFunctionExpression.check(run) ||
      j.FunctionExpression.check(run) ||
      j.Identifier.check(run)
    )
  ) {
    throw new Error('Expected `unstable_defineService` with a function.')
  }

  renameServiceToWorker(j, root, fn)
  const [param] = fn.params

  if (isTypeScript && (j.Identifier.check(param) || j.ObjectPattern.check(param))) {
    const props = localName(j, root, SANITY_DASHBOARD, 'WebWorkerProps')
    param.typeAnnotation = j.tsTypeAnnotation(j.tsTypeReference(j.identifier(props)))
    addImport(j, root, SANITY_DASHBOARD, 'WebWorkerProps', props, 'type')
  }

  define.exportPath.node.declaration = run
  removeImportIfUnused(j, root, define.specifier)

  return true
}

export default function dashboardViewsV1(fileInfo: FileInfo, api: API): string | undefined {
  const j = api.jscodeshift
  const root = j(fileInfo.source)
  const migratedView = migrateView(j, root)
  const migratedWebWorker = migrateWebWorker(j, root, /\.tsx?$/.test(fileInfo.path))

  return migratedView || migratedWebWorker ? root.toSource() : undefined
}

export const parser = 'tsx'

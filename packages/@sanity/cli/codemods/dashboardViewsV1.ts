import {
  type API,
  type ArrowFunctionExpression,
  type ASTPath,
  type CallExpression,
  type Collection,
  type FileInfo,
  type FunctionDeclaration,
  type FunctionExpression,
  type Identifier,
  type JSCodeshift,
  type ObjectPattern,
  type ObjectProperty,
  type Program,
  type Property,
  type Statement,
} from 'jscodeshift'

type ProgramStatement = Program['body'][number]

type ComponentFunction = ArrowFunctionExpression | FunctionDeclaration | FunctionExpression

type Component = FunctionExpression | ObjectProperty['value'] | Property['value']

interface DefineCall {
  callPath: ASTPath<CallExpression>
  expressionPath: ASTPath
  statementPath: ASTPath<Statement>
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
  if (!j.ObjectProperty.check(node) && !j.Property.check(node) && !j.ObjectMethod.check(node)) {
    return undefined
  }

  if (j.Identifier.check(node.key)) return node.key.name

  return j.StringLiteral.check(node.key) ? node.key.value : undefined
}

function unwrap(j: JSCodeshift, node: unknown): unknown {
  return j.TSAsExpression.check(node) || j.TSSatisfiesExpression.check(node)
    ? unwrap(j, node.expression)
    : node
}

function resolve(j: JSCodeshift, root: Collection, node: unknown): unknown {
  const value = unwrap(j, node)
  if (!j.Identifier.check(value)) return value

  const init = root.find(j.VariableDeclarator, {id: {name: value.name}}).nodes()[0]?.init

  return init ? resolve(j, root, init) : value
}

function declaration(j: JSCodeshift, source: string): ProgramStatement | undefined {
  const [statement] = j(source).find(j.Program).nodes()[0]?.body ?? []
  if (statement) statement.loc = null

  return statement
}

function findDefineCalls(
  j: JSCodeshift,
  root: Collection,
  name: string,
  sources: Set<string>,
): DefineCall[] {
  const locals: string[] = []

  for (const declaration of root.find(j.ImportDeclaration).nodes()) {
    for (const specifier of declaration.specifiers ?? []) {
      const isNamed = j.ImportSpecifier.check(specifier) && specifier.imported.name === name
      if (!(isNamed || j.ImportNamespaceSpecifier.check(specifier))) continue
      if (!j.Identifier.check(specifier.local)) continue

      locals.push(specifier.local.name)
      if (isNamed) sources.add(String(declaration.source.value))
    }
  }

  return root
    .find(j.CallExpression)
    .filter(({node: {callee}}) =>
      j.MemberExpression.check(callee)
        ? j.Identifier.check(callee.object) &&
          locals.includes(callee.object.name) &&
          j.Identifier.check(callee.property) &&
          callee.property.name === name
        : j.Identifier.check(callee) && locals.includes(callee.name),
    )
    .paths()
    .map((callPath) => {
      let expressionPath: ASTPath = callPath
      while (
        j.TSAsExpression.check(expressionPath.parent?.node) ||
        j.TSSatisfiesExpression.check(expressionPath.parent?.node)
      ) {
        expressionPath = expressionPath.parent
      }

      let statementPath: ASTPath<Statement> = callPath.parent
      while (!j.Program.check(statementPath.parent?.node)) statementPath = statementPath.parent

      return {callPath, expressionPath, statementPath}
    })
}

function isComponentWrapper(j: JSCodeshift, call: CallExpression): boolean {
  const callee = j.MemberExpression.check(call.callee) ? call.callee.property : call.callee

  return j.Identifier.check(callee) && ['forwardRef', 'memo'].includes(callee.name)
}

function findFunction(
  j: JSCodeshift,
  root: Collection,
  node: unknown,
): ComponentFunction | undefined {
  const value = unwrap(j, node)
  if (j.ArrowFunctionExpression.check(value) || j.FunctionExpression.check(value)) return value
  if (j.CallExpression.check(value) && isComponentWrapper(j, value)) {
    return findFunction(j, root, value.arguments[0])
  }

  if (!j.Identifier.check(value)) return undefined

  const declaration = root.find(j.FunctionDeclaration, {id: {name: value.name}}).nodes()[0]
  if (declaration) return declaration

  const init = root.find(j.VariableDeclarator, {id: {name: value.name}}).nodes()[0]?.init

  return init ? findFunction(j, root, init) : undefined
}

function propsPattern(j: JSCodeshift, param: unknown): Identifier | ObjectPattern | undefined {
  const pattern = j.AssignmentPattern.check(param) ? param.left : param

  return j.Identifier.check(pattern) || j.ObjectPattern.check(pattern) ? pattern : undefined
}

function readsProps(
  j: JSCodeshift,
  fn: ComponentFunction,
  pattern: Identifier | ObjectPattern,
): boolean {
  const names = j.Identifier.check(pattern)
    ? [pattern.name]
    : j(pattern)
        .find(j.Identifier)
        .nodes()
        .map((node) => node.name)

  return names.some((name) => j(fn.body).find(j.Identifier, {name}).size() > 0)
}

function localType(j: JSCodeshift, root: Collection, pattern: Identifier | ObjectPattern): string {
  const reference = pattern.typeAnnotation?.typeAnnotation
  if (!j.TSTypeReference.check(reference) || !j.Identifier.check(reference.typeName)) return ''

  const name = reference.typeName.name
  const isLocal =
    root.find(j.TSTypeAliasDeclaration, {id: {name}}).size() > 0 ||
    root.find(j.TSInterfaceDeclaration, {id: {name}}).size() > 0

  return isLocal ? `: ${j(reference).toSource()}` : ''
}

function readPropsFromHook(
  j: JSCodeshift,
  root: Collection,
  fn: ComponentFunction,
  hook: string,
): boolean {
  if (fn.params.length === 0) return true
  if (fn.params.length > 1) return false

  const pattern = propsPattern(j, fn.params[0])
  if (!pattern) return false

  fn.params = []
  if (!readsProps(j, fn, pattern)) return true

  const props = j.Identifier.check(pattern)
    ? pattern.name
    : `{ ${pattern.properties.map((property) => j(property).toSource()).join(', ')} }`
  const hookCall = declaration(j, `const ${props}${localType(j, root, pattern)} = ${hook}();`)
  if (!hookCall) return false

  fn.body = j.BlockStatement.check(fn.body)
    ? j.blockStatement([hookCall, ...fn.body.body])
    : j.blockStatement([hookCall, j.returnStatement(fn.body)])

  return true
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
    .filter(
      (path) =>
        (path.node.importKind ?? 'value') === kind &&
        !path.node.specifiers?.some((node) => j.ImportNamespaceSpecifier.check(node)),
    )
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

function removeUnusedImports(j: JSCodeshift, root: Collection, sources: Set<string>): void {
  const isUsed = (name: string, specifier: unknown) =>
    root
      .find(j.Identifier, {name})
      .filter((path) => path.parent?.node !== specifier)
      .size() +
      root.find(j.JSXIdentifier, {name}).size() >
    0

  const declarations = root
    .find(j.ImportDeclaration)
    .filter((path) => sources.has(String(path.node.source.value)))
    .paths()

  for (const path of declarations) {
    if (!path.node.specifiers?.length) continue

    const specifiers = path.node.specifiers.filter(
      (specifier) =>
        !j.Identifier.check(specifier.local) || isUsed(specifier.local.name, specifier),
    )

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

function hoistComponent(
  j: JSCodeshift,
  root: Collection,
  define: DefineCall,
  component: Component,
  base: string,
): {declaration?: ProgramStatement; name: string} {
  if (j.Identifier.check(component)) return {name: component.name}

  if (j.FunctionExpression.check(component)) {
    const id = j.Identifier.check(component.id)
      ? component.id
      : j.identifier(uniqueName(j, root, base))
    const declaration = j.functionDeclaration(id, component.params, component.body)
    define.statementPath.insertBefore(declaration)

    return {declaration, name: id.name}
  }

  const name = uniqueName(j, root, base)
  const hoisted = declaration(j, `const ${name} = ${j(component).toSource()};`)
  if (hoisted) define.statementPath.insertBefore(hoisted)

  return {declaration: hoisted, name}
}

function inlineSlot(
  j: JSCodeshift,
  component: unknown,
): {element: string; node: unknown; properties: string[]} | undefined {
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
    node: statement.argument,
    properties:
      param && readsProps(j, component, param)
        ? param.properties.map((property) => j(property).toSource())
        : [],
  }
}

function slotComponent(j: JSCodeshift, components: unknown, name: string): Component | undefined {
  if (!j.ObjectExpression.check(components)) return undefined

  const property = components.properties.find((node) => keyName(j, node) === name)
  if (j.ObjectMethod.check(property)) {
    return j.functionExpression(null, property.params, property.body)
  }

  return j.ObjectProperty.check(property) || j.Property.check(property) ? property.value : undefined
}

function prepareSlot(
  j: JSCodeshift,
  root: Collection,
  api: API,
  component: Component,
  hook: string,
): void {
  const fn = findFunction(j, root, component)
  const isMigrated = fn ? readPropsFromHook(j, root, fn, hook) : false
  if (isMigrated) return

  const name = j.Identifier.check(component) ? `\`${component.name}\`` : 'A component'
  api.report(`${name} no longer receives props. Read them with \`${hook}()\` instead.`)
}

function wrapperOf(
  j: JSCodeshift,
  node: unknown,
): {children: string; close: string; open: string} | undefined {
  if (!j.JSXElement.check(node) || !node.closingElement || !node.children?.length) return undefined

  const {name} = node.openingElement
  if (j.JSXIdentifier.check(name) && /^[a-z]/.test(name.name)) return undefined

  const [first = '', ...rest] = node.children
    .map((child) => j(child).toSource())
    .join('')
    .trim()
    .split('\n')
  const indent = Math.min(
    ...rest.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length),
  )

  return {
    children: [first, ...rest.map((line) => line.slice(Number.isFinite(indent) ? indent : 0))].join(
      '\n',
    ),
    close: j(node.closingElement).toSource(),
    open: j(node.openingElement).toSource(),
  }
}

function migratePanel(
  j: JSCodeshift,
  root: Collection,
  api: API,
  define: DefineCall,
  components: unknown,
): void {
  const imports = [
    ['@sanity/ui', 'Box'],
    ['@sanity/ui', 'Button'],
    ['@sanity/ui', 'Flex'],
    ['@sanity/icons/Close', 'CloseIcon'],
    [SANITY_DASHBOARD, 'usePanel'],
  ] as const
  const locals = imports.map(([source, name]) => localName(j, root, source, name))
  const [box, button, flex, closeIcon, usePanel] = locals
  const properties = new Set(['onClose'])
  const [title, body] = [
    ['title', 'Title'],
    ['panel', 'Body'],
  ].map(([name, base]) => {
    const component = slotComponent(j, components, name)
    if (!component) return {element: '', wrapper: undefined}

    const inlined = inlineSlot(j, component)
    if (!inlined) {
      prepareSlot(j, root, api, component, usePanel)
      const {name: hoisted} = hoistComponent(j, root, define, component, base)
      if (/^[A-Z]/.test(hoisted)) return {element: `<${hoisted} />`, wrapper: undefined}

      const alias = uniqueName(j, root, base)
      const aliasDeclaration = declaration(j, `const ${alias} = ${hoisted};`)
      if (aliasDeclaration) define.statementPath.insertBefore(aliasDeclaration)

      return {element: `<${alias} />`, wrapper: undefined}
    }

    for (const property of inlined.properties) properties.add(property)

    return {element: inlined.element, wrapper: wrapperOf(j, inlined.node)}
  })
  const wrapper = body.wrapper ?? {children: body.element, close: '</>', open: '<>'}
  if (!body.wrapper) {
    api.report(
      'The migrated panel renders its header outside your views wrappers. Make sure a @sanity/ui ThemeProvider is above it.',
    )
  }

  const panel = uniqueName(j, root, 'Panel')
  const [panelExport] =
    j(`export default function ${panel}() {
  const { ${[...properties].join(', ')} } = ${usePanel}();

  return (
    ${wrapper.open}
      <${flex} direction="column" height="fill">
        <${flex} align="center" gap={2} justify="space-between" paddingX={3} paddingY={2}>
          ${title.element.replaceAll('\n', '\n          ')}
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
          ${wrapper.children.replaceAll('\n', '\n          ')}
        </${box}>
      </${flex}>
    ${wrapper.close}
  );
}`)
      .find(j.Program)
      .nodes()[0]?.body ?? []
  if (
    !j.ExportDefaultDeclaration.check(panelExport) ||
    !j.FunctionDeclaration.check(panelExport.declaration)
  ) {
    return
  }

  if (j.ExportDefaultDeclaration.check(define.expressionPath.parent?.node)) {
    panelExport.comments = define.statementPath.node.comments
    define.statementPath.replace(panelExport)
  } else {
    define.statementPath.insertBefore(panelExport.declaration)
    define.expressionPath.replace(j.identifier(panel))
  }

  for (const [index, [source, name]] of imports.entries()) {
    addImport(j, root, source, name, locals[index])
  }
}

function removeUnusedDeclarator(j: JSCodeshift, root: Collection, node: unknown): void {
  if (!j.Identifier.check(node) || root.find(j.Identifier, {name: node.name}).size() > 1) return

  const declarators = root
    .find(j.VariableDeclarator, {id: {name: node.name}})
    .filter((path) => !j.ExportNamedDeclaration.check(path.parent?.parent?.node))
    .paths()

  for (const path of declarators) path.prune()
}

function migrateView(j: JSCodeshift, root: Collection, api: API, define: DefineCall): boolean {
  const [surfaceArg, componentsArg] = define.callPath.node.arguments
  const surface = resolve(j, root, surfaceArg)
  const components = resolve(j, root, componentsArg)
  const view = j.StringLiteral.check(surface) ? VIEWS[surface.value] : undefined

  if (!view || !j.StringLiteral.check(surface) || !j.ObjectExpression.check(components)) {
    api.report(
      'Left `unstable_defineView` unchanged: expected a panel, tile or asset_source surface and an object of components.',
    )
    return false
  }

  if (surface.value === 'panel') {
    migratePanel(j, root, api, define, components)
    removeUnusedDeclarator(j, root, componentsArg)

    return true
  }

  const component = slotComponent(j, components, surface.value)
  if (!component) {
    api.report(`Left \`unstable_defineView\` unchanged: it has no \`${surface.value}\` component.`)
    return false
  }

  const hook = localName(j, root, SANITY_DASHBOARD, view.hook)
  prepareSlot(j, root, api, component, hook)
  const {declaration, name} = hoistComponent(j, root, define, component, view.name)
  define.expressionPath.replace(j.identifier(name))

  if (declaration) {
    declaration.comments = define.statementPath.node.comments
    define.statementPath.node.comments = null
  }

  if (root.find(j.CallExpression, {callee: {name: hook}}).size() > 0) {
    addImport(j, root, SANITY_DASHBOARD, view.hook, hook)
  }

  removeUnusedDeclarator(j, root, componentsArg)

  return true
}

function renameServiceToWorker(j: JSCodeshift, root: Collection, fn: ComponentFunction): void {
  const pattern = propsPattern(j, fn.params[0])

  if (j.Identifier.check(pattern)) {
    const members = j(fn.body)
      .find(j.MemberExpression, {
        computed: false,
        object: {name: pattern.name},
        property: {name: 'service'},
      })
      .nodes()

    for (const member of members) member.property = j.identifier('worker')
    return
  }

  const property = pattern?.properties.find((node) => keyName(j, node) === 'service')
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

function migrateWebWorker(
  j: JSCodeshift,
  root: Collection,
  api: API,
  define: DefineCall,
  isTypeScript: boolean,
): boolean {
  const [, run] = define.callPath.node.arguments
  if (!run || j.SpreadElement.check(run)) {
    api.report('Left `unstable_defineService` unchanged: expected a function.')
    return false
  }

  const fn = findFunction(j, root, run)
  if (!fn) {
    api.report(
      `Rename \`service\` to \`worker\` where \`${j(run).toSource()}\` reads its props; it now receives \`{bus, worker}\`.`,
    )
  }

  const pattern = fn && propsPattern(j, fn.params[0])
  if (fn) renameServiceToWorker(j, root, fn)

  if (isTypeScript && pattern) {
    const props = localName(j, root, SANITY_DASHBOARD, 'WebWorkerProps')
    pattern.typeAnnotation = j.tsTypeAnnotation(j.tsTypeReference(j.identifier(props)))
    addImport(j, root, SANITY_DASHBOARD, 'WebWorkerProps', props, 'type')
  }

  define.expressionPath.replace(run)

  return true
}

function isAtModuleScope(api: API, define: DefineCall, name: string): boolean {
  if (define.callPath.scope?.isGlobal) return true

  api.report(`Left \`${name}\` unchanged: it is called inside a function.`)

  return false
}

export default function dashboardViewsV1(fileInfo: FileInfo, api: API): string | undefined {
  const j = api.jscodeshift

  try {
    const root = j(fileInfo.source)
    const sources = new Set<string>()
    const views = findDefineCalls(j, root, 'unstable_defineView', sources)
    const webWorkers = findDefineCalls(j, root, 'unstable_defineService', sources)
    const isTypeScript = /\.tsx?$/.test(fileInfo.path)

    const migrated = [
      ...views.map(
        (define) =>
          isAtModuleScope(api, define, 'unstable_defineView') && migrateView(j, root, api, define),
      ),
      ...webWorkers.map(
        (define) =>
          isAtModuleScope(api, define, 'unstable_defineService') &&
          migrateWebWorker(j, root, api, define, isTypeScript),
      ),
    ]
    if (!migrated.includes(true)) return undefined

    removeUnusedImports(j, root, sources)

    return root.toSource()
  } catch (error) {
    api.report(`Left the file unchanged: ${error instanceof Error ? error.message : String(error)}`)

    return undefined
  }
}

export const parser = 'tsx'

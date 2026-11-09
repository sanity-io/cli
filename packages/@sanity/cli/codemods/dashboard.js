// @ts-check
/* eslint-disable unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument */
const APP_VALUE_KEYS = new Set(['organizationId', 'slug', 'title'])

function keyName(property) {
  return property.key?.name ?? property.key?.value
}

function importedName(specifier) {
  return specifier.type === 'ImportSpecifier' && specifier.imported.name
}

function findConfigObject(j, root) {
  const defineCall = root.find(j.CallExpression, {callee: {name: 'defineCliConfig'}}).paths()[0]
  const configArg = defineCall?.node.arguments[0]
  if (configArg?.type === 'ObjectExpression') {
    return configArg
  }

  const defaultExport = root.find(j.ExportDefaultDeclaration).paths()[0]?.node.declaration
  return defaultExport?.type === 'ObjectExpression' ? defaultExport : undefined
}

function addDefineApplicationImport(j, root) {
  const cliImport = root
    .find(j.ImportDeclaration, {source: {value: 'sanity/cli'}})
    .filter((path) => path.node.importKind !== 'type')
    .paths()[0]

  if (!cliImport) {
    root
      .get()
      .node.program.body.unshift(
        j.importDeclaration(
          [j.importSpecifier(j.identifier('defineApplication'))],
          j.stringLiteral('sanity/cli'),
        ),
      )
    return
  }

  const specifiers = cliImport.node.specifiers
  if (specifiers.some((specifier) => importedName(specifier) === 'defineApplication')) {
    return
  }

  const index = specifiers.findIndex((specifier) => importedName(specifier) > 'defineApplication')
  specifiers.splice(
    index === -1 ? specifiers.length : index,
    0,
    j.importSpecifier(j.identifier('defineApplication')),
  )
}

function dashboard(fileInfo, api, options) {
  const {organizationId, slug, title} = options
  if (!organizationId || !slug || !title) {
    throw new Error(
      'Missing organizationId, slug or title. Run this codemod with `sanity codemod dashboard`.',
    )
  }

  const j = api.jscodeshift
  const root = j(fileInfo.source)

  const config = findConfigObject(j, root)
  if (!config) {
    throw new Error(
      'Could not find the CLI config. Expected `export default defineCliConfig({...})`.',
    )
  }

  const values = [
    ['title', title],
    ['slug', slug],
    ['organizationId', organizationId],
  ].map(([key, value]) => j.objectProperty(j.identifier(key), j.stringLiteral(value)))

  const appProperty = config.properties.find((property) => keyName(property) === 'app')
  if (appProperty) {
    if (appProperty.value.type !== 'ObjectExpression') {
      throw new Error('`app` must be an object literal to be wrapped in `defineApplication`.')
    }

    const rest = appProperty.value.properties.filter(
      (property) => !APP_VALUE_KEYS.has(keyName(property)),
    )
    appProperty.value = j.callExpression(j.identifier('defineApplication'), [
      j.objectExpression([...values, ...rest]),
    ])
  } else {
    // Keep `app` next to `api`, matching the shape `sanity init` scaffolds
    const apiIndex = config.properties.findIndex((property) => keyName(property) === 'api')
    config.properties.splice(
      apiIndex + 1,
      0,
      j.objectProperty(
        j.identifier('app'),
        j.callExpression(j.identifier('defineApplication'), [j.objectExpression(values)]),
      ),
    )
  }

  addDefineApplicationImport(j, root)

  return root.toSource({objectCurlySpacing: false, quote: 'single', trailingComma: true})
}

// jscodeshift reads the parser from a named export, not a property on the default export
export const parser = 'tsx'
export default dashboard

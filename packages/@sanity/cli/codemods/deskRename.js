// @ts-check
/* eslint-disable unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument */
const renamed = {
  deskTool: 'structureTool',
  DeskToolContextValue: 'StructureToolContextValue',
  DeskToolFeatures: 'StructureToolFeatures',
  DeskToolMenuItem: 'StructureToolMenuItem',
  DeskToolOptions: 'StructureToolOptions',
  DeskToolPaneActionHandler: 'StructureToolPaneActionHandler',
  DeskToolProvider: 'StructureToolProvider',
  DeskToolProviderProps: 'StructureToolProviderProps',
  useDeskTool: 'useStructureTool',
}

function isFunction(renamedThing) {
  return renamedThing === 'deskTool' || renamedThing === 'useDeskTool'
}

function isComponent(renamedThing) {
  return renamedThing === 'DeskToolProvider'
}

function deskRename(fileInfo, api) {
  const j = api.jscodeshift
  const root = j(fileInfo.source)

  const renamedFunctions = new Set()
  const renamedComponents = new Set()

  // Imports
  // from: import {deskTool} from 'sanity/desk'
  //   to: import {structureTool} from 'sanity/structure'
  //
  // from: import {StructureBuilder} from 'sanity/desk'
  //   to: import {StructureBuilder} from 'sanity/structure'
  const allImportDeclarations = root.find(j.ImportDeclaration)
  const importDeclarations = []
  for (const path of allImportDeclarations.paths()) {
    if (path.node.source.value.startsWith('sanity/desk')) {
      importDeclarations.push(path)
    }
  }

  for (const path of importDeclarations) {
    const newSpecifiers = []

    const allImportSpecifiers = j(path).find(j.ImportSpecifier)
    for (const specifier of allImportSpecifiers.paths()) {
      const oldName = specifier.node.imported.name
      const aliasName = specifier.node.local.name
      const isAliased = oldName !== aliasName
      if (!(oldName in renamed)) {
        newSpecifiers.push(specifier.node)
        continue
      }

      const newName = renamed[oldName]
      const targetName = isAliased ? aliasName : newName
      if (newName === targetName) {
        newSpecifiers.push(j.importSpecifier(j.identifier(newName)))
        if (isComponent(oldName)) {
          renamedComponents.add(oldName)
        } else if (isFunction(oldName)) {
          renamedFunctions.add(oldName)
        }
      } else {
        newSpecifiers.push(j.importSpecifier(j.identifier(newName), j.identifier(targetName)))
      }
    }

    j(path).replaceWith(j.importDeclaration(newSpecifiers, j.literal('sanity/structure')))
  }

  // Requires
  // from: const {deskTool} = require('sanity/desk')
  //   to: const {structureTool} = require('sanity/structure')
  //
  // from: const {StructureBuilder} = require('sanity/desk')
  //   to: const {StructureBuilder} = require('sanity/structure')
  const allVariableDeclarators = root.find(j.VariableDeclarator, {
    id: {type: 'ObjectPattern'},
    init: {callee: {name: 'require'}},
  })
  const variableDeclarators = []
  for (const path of allVariableDeclarators.paths()) {
    if (path.value.init.arguments[0].value.startsWith('sanity/desk')) {
      variableDeclarators.push(path)
    }
  }

  for (const path of variableDeclarators) {
    const newProperties = []
    const allObjectProperties = j(path).find(j.ObjectProperty)

    for (const prop of allObjectProperties.paths()) {
      const oldName = prop.node.key.name
      const aliasName = prop.node.value.name
      const isAliased = oldName !== aliasName
      const newName = renamed[oldName]
      if (!newName) {
        newProperties.push(prop.node)
        continue
      }

      const targetName = isAliased ? aliasName : newName
      const newProp = j.objectProperty(j.identifier(newName), j.identifier(targetName), false, true)

      if (newName === targetName) {
        newProp.shorthand = true
      }
      newProperties.push(newProp)

      if (!isAliased) {
        if (isComponent(oldName)) {
          renamedComponents.add(oldName)
        } else if (isFunction(oldName)) {
          renamedFunctions.add(oldName)
        }
      }
    }

    j(path).replaceWith(
      j.variableDeclarator(
        j.objectPattern(newProperties),
        j.callExpression(j.identifier('require'), [j.stringLiteral('sanity/structure')]),
      ),
    )
  }

  // Replace all remapped instances on a best-effort basis
  for (const oldName of renamedComponents) {
    const newName = renamed[oldName]
    const allJsxIdentifiers = root.find(j.JSXIdentifier)
    const jsxIdentifiers = []
    for (const path of allJsxIdentifiers.paths()) {
      if (path.node.name === oldName) {
        jsxIdentifiers.push(path)
      }
    }
    for (const path of jsxIdentifiers) {
      j(path).replaceWith(j.jsxIdentifier(newName))
    }
  }

  for (const oldName of renamedFunctions) {
    const newName = renamed[oldName]
    const allCallExpressions = root.find(j.CallExpression)
    const callExpressions = []
    for (const path of allCallExpressions.paths()) {
      if (path.node.callee && path.node.callee.name === oldName) {
        callExpressions.push(path)
      }
    }
    for (const path of callExpressions) {
      j(path).replaceWith(j.callExpression(j.identifier(newName), path.node.arguments))
    }
  }

  return root.toSource()
}

deskRename.parser = 'tsx'
export default deskRename

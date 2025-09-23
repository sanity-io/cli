// @ts-check
/* eslint-disable unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument */

const splitRegexp = [/([a-z0-9])([A-Z])/g, /([A-Z])([A-Z][a-z])/g]
const stripRegexp = /[^A-Z0-9]+/gi

function fixIcons(fileInfo, api) {
  const j = api.jscodeshift
  const root = j(fileInfo.source)

  // Imports
  // from: import {MdPerson} from 'react-icons/lib/md'
  //   to: import {MdPerson} from 'react-icons/md'
  //
  // from: import PersonIcon from 'react-icons/lib/md/person'
  //   to: import {MdPerson as PersonIcon} from 'react-icons/md'
  const allImportDeclarations = root.find(j.ImportDeclaration)
  const reactIconsImports = []
  for (const path of allImportDeclarations.paths()) {
    if (path.node.source.value.startsWith('react-icons/') && isLegacyPath(path.node.source.value)) {
      reactIconsImports.push(path)
    }
  }

  for (const path of reactIconsImports) {
    const node = path.value
    const icon = iconSpecFromPath(node.source.value)

    if (!icon) {
      // import {MdPerson} from 'react-icons/lib/md' => import {MdPerson} from 'react-icons/md'
      node.source.value = node.source.value.replace(/react-icons\/lib/, 'react-icons')
      continue
    }

    // import MdPerson from 'react-icons/lib/md/person' => import {MdPerson} from 'react-icons/md'
    const oldName = path.value.specifiers[0].local.name
    j(path).replaceWith(
      j.importDeclaration(
        [j.importSpecifier(j.identifier(icon.name), j.identifier(oldName))],
        j.literal(`react-icons/${icon.pack}`),
      ),
    )
  }

  // Requires
  // from: const PersonIcon = require('react-icons/lib/md/person'
  //   to: const {MdPerson: PersonIcon} = require('react-icons/md')
  //
  // from: const {MdPerson} = require('react-icons/lib/md')
  //   to: const {MdPerson} = require('react-icons/md')
  const allVariableDeclarators = root.find(j.VariableDeclarator, {
    id: {type: 'Identifier'},
    init: {callee: {name: 'require'}},
  })
  const legacyRequires = []
  for (const path of allVariableDeclarators.paths()) {
    if (isLegacyPath(path.value.init.arguments[0].value)) {
      legacyRequires.push(path)
    }
  }

  for (const path of legacyRequires) {
    const oldName = path.value.id.name
    const filePath = path.value.init.arguments[0].value
    const icon = iconSpecFromPath(filePath)

    if (!icon) {
      continue
    }

    const prop = j.objectProperty(j.identifier(icon.name), j.identifier(oldName), false, true)
    if (oldName === icon.name) {
      prop.shorthand = true
    }

    j(path).replaceWith(
      j.variableDeclarator(
        j.objectPattern([prop]),
        j.callExpression(j.identifier('require'), [j.stringLiteral(`react-icons/${icon.pack}`)]),
      ),
    )
  }

  return root.toSource()
}

function pascalCase(input) {
  const inner = replace(input, splitRegexp, '$1\0$2')
  const result = replace(inner, stripRegexp, '\0')
  const parts = result.split('\0')
  let output = ''
  for (const part of parts) {
    output += pascalCaseTransform(part)
  }
  return output
}

function replace(input, re, value) {
  if (re instanceof RegExp) return input.replace(re, value)
  let result = input
  for (const pattern of re) {
    result = result.replace(pattern, value)
  }
  return result
}

function pascalCaseTransform(input) {
  const firstChar = input.charAt(0)
  const lowerChars = input.slice(1).toLowerCase()
  return `${firstChar.toUpperCase()}${lowerChars}`
}

function iconSpecFromPath(path) {
  const [, pack, icon] =
    path.match(/(ai|bi|bs|cg|di|fa|fc|fi|gi|go|gr|hi|im|io|md|ri|si|src|ti|vsc|wi)\/(.*)/) || []

  if (!pack) {
    return null
  }

  const prefix = pack[0].toUpperCase() + pack.slice(1)
  const suffix = pascalCase(icon.replace(/\.jsx?$/, ''))
  return {name: prefix + suffix, pack}
}

function isLegacyPath(path) {
  return /^react-icons\/(lib\/)?(ai|bi|bs|cg|di|fa|fc|fi|gi|go|gr|hi|im|io|md|ri|si|src|ti|vsc|wi)/.test(
    path,
  )
}

fixIcons.parser = 'tsx'
export default fixIcons

import {
  type ConvertedDocumentType,
  type ConvertedInterface,
  type ConvertedType,
  type ConvertedUnion,
} from './types.js'

export function isUnion(
  type: ConvertedInterface | ConvertedType | ConvertedUnion,
): type is ConvertedUnion {
  return type.kind === 'Union'
}

export function isNonUnion(
  type: ConvertedInterface | ConvertedType | ConvertedUnion,
): type is ConvertedType {
  return !isUnion(type) && 'type' in type
}

export function isDocumentType(
  type: ConvertedInterface | ConvertedType | ConvertedUnion,
): type is ConvertedDocumentType {
  return (
    isNonUnion(type) &&
    type.type === 'Object' &&
    Array.isArray(type.interfaces) &&
    type.interfaces.includes('Document')
  )
}

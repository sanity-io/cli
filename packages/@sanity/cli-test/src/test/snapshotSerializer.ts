/**
 * Serializer for snapshot tests to normalize line endings and Windows ^ to Unix `\`
 * @public
 */
export const snapshotSerializer = {
  serialize: (val: string) => {
    const normalized = val.replaceAll(/(\^|\\)(\s*\n)/g, '\\\n')
    return `"${normalized}"`
  },
  test: (val: unknown) => typeof val === 'string',
}

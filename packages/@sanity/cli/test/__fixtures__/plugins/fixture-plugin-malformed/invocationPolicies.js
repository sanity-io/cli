// `validate` is missing, so this is not a usable policy table. Resolution
// must treat the whole plugin as undeclared rather than reading `kind`
// on its own and letting the command through.
export const invocationPolicies = {
  mcp: {
    'malformed:run': {kind: 'allow'},
  },
}

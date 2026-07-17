export const LOGIN_PROVIDER_IDS = ['google', 'github', 'sanity', 'vercel'] as const

export const LOGIN_REQUIRED_MESSAGE = [
  'No valid authentication credentials found.',
  '',
  'Authenticate with one of these commands:',
  '  echo "$TOKEN" | sanity login --with-token',
  '  sanity login --provider <providerId> --no-open',
  `    Provider IDs: ${LOGIN_PROVIDER_IDS.join(', ')}`,
  '  sanity login --sso <organizationSlug> --no-open',
  '',
  '`--no-open` prints a login URL instead of opening a browser.',
].join('\n')

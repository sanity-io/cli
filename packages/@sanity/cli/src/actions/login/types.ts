/**
 * @internal
 */
export interface LoginProvider {
  name: string
  title: string
  url: string
}

/**
 * @internal
 */
export interface SamlLoginProvider {
  callbackUrl: string
  disabled: boolean
  id: string
  loginUrl: string
  name: string
  organizationId: string
  type: 'saml'
}

/**
 * @internal
 */
export interface ProvidersResponse {
  providers: LoginProvider[]
}

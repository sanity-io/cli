import { SanityClient } from "@sanity/client"

interface IntentFilter {
  dataset?: string
  projectId?: string
  types?: string[]
}

export interface Intent {
  _system: {
    createdBy: string
  }
  _updatedAt: string
  action: 'create' | 'delete' | 'edit' | 'view'
  applicationId: string
  filters: IntentFilter[]
  id: string
  title: string

  description?: string
}

export interface GetDashboardStoreIdOptions {
  client: SanityClient
  organizationId: string
}

export interface QueryDashboardStoreOptions {
  client: SanityClient
  dashboardStoreId: string
  query: string
}

export interface DashboardStoreResource {
  id: string
  organizationId: string
  status: 'active' | 'provisioning'
}
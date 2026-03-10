import {Separator} from '@sanity/cli-core/ux'

export type OrganizationChoices = Array<
  Separator | {disabled?: boolean | string; name: string; value: string}
>

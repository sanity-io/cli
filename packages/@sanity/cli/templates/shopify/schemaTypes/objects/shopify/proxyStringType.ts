import {defineField} from 'sanity'

import ProxyStringInput from '../../../components/inputs/ProxyString.js'

export const proxyStringType = defineField({
  name: 'proxyString',
  title: 'Title',
  type: 'string',
  components: {
    input: ProxyStringInput,
  },
})

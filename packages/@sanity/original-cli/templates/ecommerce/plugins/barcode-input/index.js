import {definePlugin} from 'sanity'
import {barcodeSchemaType} from './schemaType.js'

export const barcodeInput = definePlugin({
  name: 'barcode-input',
  schema: {
    types: [barcodeSchemaType],
  },
})

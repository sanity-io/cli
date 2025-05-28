import {register} from 'esbuild-register/dist/node'

register({
  jsx: 'automatic',
  supported: {'dynamic-import': true},
})

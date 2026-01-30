import {createRoot as e} from 'react-dom/client'
import {createElement as o} from 'react'
import {jsx as t} from 'react/jsx-runtime'
import {SanityApp as n} from '@sanity/sdk-react'
function r() {
  return t('div', {
    className: 'app-container',
    children: t(n, {
      config: [{dataset: 'dataset-name', projectId: 'project-id'}],
      fallback: t('div', {children: 'Loading...'}),
      children: t('div', {}),
    }),
  })
}
const i = e(document.getElementById('root')),
  a = o(r)
i.render(a)

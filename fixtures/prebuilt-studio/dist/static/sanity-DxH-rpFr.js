import {renderStudio as t} from 'sanity'
const e = {
  title: 'Basic Studio',
  dataset: 'test',
  projectId: 'ppsg7ml5',
  plugins: [],
  schema: {types: []},
}
t(document.getElementById('sanity'), e, {reactStrictMode: !1, basePath: '/'})

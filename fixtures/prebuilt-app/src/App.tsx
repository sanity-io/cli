import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'

import './App.css'

function App() {
  // apps can access many different projects or other sources of data
  const sanityConfigs: SanityConfig[] = [
    {
      dataset: 'dataset-name',
      projectId: 'project-id',
    },
  ]

  return (
    <div className="app-container">
      <SanityApp config={sanityConfigs} fallback={<div>Loading...</div>}>
        <div />
      </SanityApp>
    </div>
  )
}

export default App

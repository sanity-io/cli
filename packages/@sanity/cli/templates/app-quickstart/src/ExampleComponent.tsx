import {useCurrentUser, type CurrentUser} from '@sanity/sdk-react'
import './ExampleComponent.css'

export function ExampleComponent() {
  const user: CurrentUser | null = useCurrentUser()

  return (
    <div className="example-container">
      {user?.profileImage ? (
        <div className="example-avatar-container">
          <img src={user.profileImage} alt="" className="example-avatar" />
        </div>
      ) : (
        ''
      )}
      <h1 className="example-heading">
        Welcome to your Sanity App{user?.name ? `, ${user.name}` : ''}!
      </h1>
      <p className="example-text">
        This is an example component, rendered with the <code>useCurrentUser</code> hook from the
        App SDK. Replace it with your own components by importing them in App.tsx.
      </p>
      <div className="code-hint">
        <p>
          A good next step is fetching content. Data hooks like <code>useDocuments</code> suspend
          while loading, so render them inside a <code>{'<Suspense>'}</code> boundary:
        </p>
        <pre>{`import {Suspense} from 'react'
import {useDocuments} from '@sanity/sdk-react'

function DocumentList() {
  // useDocuments returns handles you can pass to other hooks
  const {data} = useDocuments({documentType: 'yourType'})
  return <ul>{data.map((doc) => <li key={doc.documentId}>{doc.documentId}</li>)}</ul>
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DocumentList />
    </Suspense>
  )
}`}</pre>
      </div>
      <ul className="example-links">
        <li>
          <a href="https://www.sanity.io/docs/app-sdk">App SDK documentation</a>
        </li>
        <li>
          <a href="https://reference.sanity.io/_sanity/sdk-react/">API reference</a>
        </li>
        <li>
          <a href="https://sdk-explorer.sanity.io">SDK Explorer with example apps</a>
        </li>
      </ul>
    </div>
  )
}

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
          A good next step is fetching content. The <code>useDocuments</code> hook returns document
          handles you can pass to other hooks for display and editing:
        </p>
        <pre>{`import {useDocuments} from '@sanity/sdk-react'

const {data} = useDocuments({documentType: 'yourType'})`}</pre>
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

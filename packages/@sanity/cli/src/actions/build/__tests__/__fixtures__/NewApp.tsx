// This is a test fixture file for detectLegacySanityApp tests
// It demonstrates the new pattern that should NOT be detected
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck - This is a test fixture file
// New pattern - no SanityApp wrapper needed!
function NewApp() {
  return (
    <div>
      <div>New App Content</div>
    </div>
  )
}

export default NewApp

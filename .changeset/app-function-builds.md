---
'@sanity/cli': minor
---

Build functions from `functions/` or `src/functions/` alongside SDK apps. Each function can be a JavaScript or TypeScript file, or a directory with an entry point. Compiled functions are stored in `.sanity/functions/<name>/index.js`, outside the frontend bundle.

Before building or deploying an app with functions, validate its organization and find or create an organization-scoped Blueprint stack. New apps are registered as needed, and the app and stack IDs are saved in `.sanity/app-functions.json`. Deploy dry runs only report the required setup.

Deploy the compiled functions to that stack before uploading the app. Function ZIPs are created in memory, and deployment waits for the stack operation to complete. `--no-build` uses the saved function build manifest; rebuilding records function removals. Deploy dry runs validate the function build without uploading or deploying it.

Generate an app entry that supplies the function stack and organization to SDK useClient calls during build and local development. Authentication remains with the SDK session.

Generate sanity.functions.d.ts and browser-safe validators from function handler input and return types. useFunctions exposes the discovered functions with inferred contracts, and compiled handlers validate inputs and outputs without a schema-library dependency.

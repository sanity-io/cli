# Error Message Templates

Copy-paste templates for every error type in Sanity's taxonomy, with variants for each audience.

## How to use

Pick the error type, pick the audience, fill in the brackets. The structure is always:
`[What happened]. [Why, if known]. [How to fix]. [Reference].`

---

## validation_error

Input doesn't meet schema requirements.

**Developer (API/CLI):**

```
Validation error: [field] [constraint violated]. [Specific value that failed]. [How to fix].
Docs: https://www.sanity.io/docs/validation
```

Example:

```
Validation error: 'slug' must be unique. 'about-us' is already in use.
Change the slug and retry.
Docs: https://www.sanity.io/docs/slug-type
```

**Editor (Studio):**

```
[Field label] [what's wrong in plain language]. [What to do].
```

Example:

```
This slug is already taken. Choose a different one.
```

**Structured (API response):**

```json
{
  "error": {
    "type": "validation_error",
    "code": "[SPECIFIC_CODE]",
    "message": "[Human-readable message with fix]",
    "param": "[field name]",
    "doc_url": "https://www.sanity.io/docs/errors/[CODE]",
    "request_id": "[req_id]"
  }
}
```

---

## authentication_error

Missing or invalid API token.

**Developer:**

```
Authentication failed: [reason]. [How to fix].
```

Examples:

```
Authentication failed: API token expired. Generate a new token in Settings > API.
Authentication failed: No token provided. Add a bearer token to your request headers.
Authentication failed: Token is not valid for project '[projectId]'. Check your project configuration.
```

**Editor (Studio):**

```
You've been signed out. Sign in again to continue.
```

---

## permission_error

Valid token, insufficient permissions.

**Developer:**

```
Permission denied: [what was attempted]. [What permission is needed]. [Who to contact].
```

Examples:

```
Permission denied: Cannot publish to dataset 'production'. Your token has read-only access. Use a token with write permissions.
Permission denied: Cannot delete documents. This requires the 'editor' role or higher. Contact your project admin.
```

**Editor (Studio):**

```
You don't have permission to [action]. Contact your project admin.
```

Example:

```
You don't have permission to publish in this dataset. Contact your project admin.
```

---

## not_found_error

Document, dataset, or project doesn't exist.

**Developer:**

```
Not found: [resource type] '[identifier]' [doesn't exist / was deleted]. [Suggestion].
```

Examples:

```
Not found: Document 'post-abc123' does not exist in dataset 'production'. Check the document ID and dataset name.
Not found: Dataset 'staging' does not exist in project 'xyz'. Available datasets: production, development.
```

**Editor (Studio):**

```
This document was deleted or moved. [What to do].
```

Example:

```
This document no longer exists. It may have been deleted by another team member.
```

---

## conflict_error

Concurrent edit conflict or duplicate resource.

**Developer:**

```
Conflict: [what conflicted]. [Current state]. [How to resolve].
```

Examples:

```
Conflict: Document 'post-abc123' was modified since your last read. Fetch the latest revision and retry your mutation.
Conflict: A document with slug 'about-us' already exists. Use a different slug or update the existing document.
```

**Editor (Studio):**

```
Someone else edited this document. Your changes are safe. Reload to see the latest version.
```

---

## rate_limit_error

Too many requests.

**Developer:**

```
Rate limited: [limit details]. Retry after [duration]. [How to reduce request volume].
```

Example:

```
Rate limited: Exceeded 25 requests/second for project 'xyz'. Retry after 2 seconds. Consider batching mutations.
Docs: https://www.sanity.io/docs/rate-limits
```

**Editor (Studio):**

```
Too many changes at once. Wait a moment and try again.
```

---

## connection_error

Network or service unavailability.

**Developer:**

```
Connection failed: [what couldn't connect]. [Likely cause]. [What to try].
```

Examples:

```
Connection failed: Could not reach api.sanity.io. Check your network connection and try again.
Connection failed: Request timed out after 30s. The operation may still complete. Check document status before retrying.
```

**Editor (Studio):**

```
Couldn't save. Connection lost. Your changes are preserved locally. They'll sync when you're back online.
```

---

## schema_error

Schema configuration problem.

**Developer:**

```
Schema error: [what's wrong]. [Where in the schema]. [How to fix].
```

Examples:

```
Schema error: Field 'author' references type 'person', which is not defined. Add a 'person' type to your schema or update the reference.
Schema error: Duplicate field name 'title' in type 'post'. Field names must be unique within a type.
```

**Editor (Studio):**
Schema errors should not surface to editors. If they do, show:

```
Something is wrong with this document's configuration. Contact your developer.
```

---

## query_error

GROQ syntax or execution error.

**Developer:**

```
GROQ error at position [N]: [what's wrong]. [Suggestion]. [Doc link].
```

Examples:

```
GROQ error at position 23: Unexpected token 'where'. Did you mean to use a filter? Example: *[_type == 'post']
Docs: https://www.sanity.io/docs/groq

GROQ error: Unknown function 'similarity()'. Did you mean 'text::semanticSimilarity()'?
Docs: https://www.sanity.io/docs/groq-functions
```

**Editor (Studio):**
Query errors should not surface to editors. If they do (e.g., in a custom tool), show:

```
Couldn't load content. Try refreshing the page. If this keeps happening, contact your developer.
```

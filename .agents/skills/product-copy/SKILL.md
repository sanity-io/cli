---
name: product-copy
description: >
  Use this for writing or reviewing Sanity product UI copy: Studio UI text, error/validation messages, empty states, tooltips, buttons, status/confirmation dialogs, onboarding flows, CLI output, and API error responses. Trigger whenever you see UX writing, product copy, or interface text for Sanity (Studio, CLI, API), especially errors or system messages.
version: 2026-04-01
category:
  - writing
  - engineering
  - design
visibility: shareable
owner: Knut Melvær
---

# Product Copy

How to write UI text for Sanity products. This skill nudges you away from common mistakes and teaches Sanity-specific patterns. It doesn't reteach UX writing basics.

You already know clarity, active voice, sentence case, verb-first buttons, and "don't blame the user." This skill corrects the specific mistakes you make anyway, and teaches the Sanity-specific patterns you can't know without being told.

## Layering

This skill sits in a stack:

- **style-guide** → mechanics (AP Stylebook, punctuation, capitalization)
- **authentic-content** → voice (anti-slop, Sanity personality, tone)
- **product-copy** (this skill) → patterns (component-specific UI writing)
- **sanity-messaging** → positioning (what to say about Sanity as a product)
- **platform-terminology** → naming (what things are called)

This skill covers how to write UI text. Not what things are called (platform-terminology), not marketing copy (sanity-messaging), not blog posts (authentic-content), not punctuation rules (style-guide).

Load this skill when writing or reviewing text that appears in: Sanity Studio UI, CLI output, API error responses, validation messages, onboarding flows, admin panels, or developer-facing documentation UI.

## Loading reference files

Load these based on what the task requires. You don't need both for every task.

| Need                                                              | Load                                |
| ----------------------------------------------------------------- | ----------------------------------- |
| Writing error messages or API responses                           | `references/error-templates.md`     |
| Writing for a specific audience or unsure which vocabulary to use | `references/audience-vocabulary.md` |
| Quick nudge on common mistakes                                    | This file is enough                 |

---

## Where you get product copy wrong

These are the specific failure modes to watch for.

### Marketing voice leaks into UI

Product UI text is functional, not promotional. Tooltips shouldn't sell. Error messages shouldn't inspire. Empty states shouldn't pitch. Strip every adjective that doesn't add information.

```
❌ Tooltip: "Unlock the power of real-time collaboration"
✅ Tooltip: "See who else is editing this document"

❌ Empty state: "Experience the seamless content creation workflow"
✅ Empty state: "Create your first document"

❌ Error: "We're working hard to resolve this issue for you"
✅ Error: "Couldn't save. Connection lost. Changes preserved locally."
```

### Over-apologizing and hedging

Don't add "Sorry," "Unfortunately," "We apologize," or "Please" reflexively. State what happened and what to do. No apologies in routine errors. Reserve "please" for when the system is genuinely inconveniencing the user (e.g., "Indexing may take a few minutes. Please wait.").

```
❌ "Sorry, we couldn't publish your document. Please try again."
✅ "Couldn't publish document. The 'title' field is required."

❌ "Unfortunately, an error occurred while saving."
✅ "Couldn't save. Connection timed out. Try again."
```

### Stopping at "what went wrong" without "how to fix"

This is the single most common failure in AI-generated error messages. Every error message must answer: what happened AND how to fix it. If you can't provide a specific fix, provide a link to docs or support. "Try again" only counts as a fix if retrying might actually work (e.g., network errors).

```
❌ "Schema validation failed."
✅ "Schema validation failed: 'slug' must be unique. 'about-us' is already in use. Change the slug and try again."

❌ "Authentication error."
✅ "API token expired. Generate a new token in Settings → API."
```

### Same tone for every audience

Always identify the audience before writing. Context determines audience:

- **Studio UI** → content editors (plain language, reassurance, "what to do next")
- **CLI / API responses** → developers (technical precision, error codes, doc links)
- **Admin dashboards / onboarding** → technical leaders (outcomes, team impact)

Same error, three audiences:

| Audience  | Context           | Copy                                                                                                     |
| --------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Editor    | Studio validation | "The publish date doesn't look right. Use the date picker to select a valid date."                       |
| Developer | API response      | `Validation error: Field 'publishDate' expects 'datetime', received 'string'. Update your input format.` |
| Leader    | Admin dashboard   | "Content validation caught 23 formatting errors this week before they reached production."               |

### Empty states that describe absence instead of enabling action

Every empty state must include: (1) what the user can do, and (2) why they'd want to. Lead with the action, not the absence.

```
❌ "No documents"
✅ "Create your first document. Documents are the building blocks of your content."

❌ "No results found"
✅ "No documents match 'quarterly report'. Try different keywords or check your filters."

❌ "No webhooks configured"
✅ "Set up webhooks to notify external services when content changes."
```

### Vague confirmation dialogs

Confirmation dialog titles should name the action and the target. Buttons should use specific verbs, not Yes/No.

```
❌ Title: "Are you sure?"
   Buttons: [No] [Yes]

✅ Title: "Delete 'About us'?"
   Body: "This document and its revision history will be permanently deleted."
   Buttons: [Cancel] [Delete permanently]
```

### Exclamation marks and false enthusiasm

No exclamation marks in product copy. "Document published" not "Document published!" Success messages should be the shortest, most understated copy in the product.

```
❌ "Your document has been successfully published! 🎉"
✅ "Document published"

❌ "Welcome to Sanity Studio! Let's get started!"
✅ "Welcome to Sanity Studio. Create your first document to get started."
```

### "Successfully" as a verbal tic

Use short past-tense form. "Document published" not "Successfully published document." Reserve "successfully" for cases where the success needs emphasis (e.g., after a retry or a complex multi-step operation).

```
❌ "Successfully saved document"
✅ "Document saved"

❌ "Successfully generated API key"
✅ "API key generated. Copy it now — it won't be shown again."
```

---

## Sanity's three audiences

Sanity serves three audiences. Copy must adapt to who's reading it. The voice stays the same; the vocabulary and detail level change.

### Developers (primary audience)

Developers build with Sanity: schemas, GROQ queries, custom components, functions, framework integrations. They interact through code, CLI, API, and Studio configuration.

What they need: technical precision, specific identifiers (field names, error codes, request IDs), copy-paste solutions, doc links. They scan aggressively. Front-load the critical information.

Vocabulary:

- "Schema" not "content structure"
- "Field" not "input" or "box"
- "Document type" not "content kind"
- "Query" not "search" (for GROQ)
- "Deploy" for functions, "publish" for content
- "Mutation" not "change" (for API operations)

Error pattern: `[What failed]: [Specific cause]. [Fix]. [Doc link]`

### Content editors (secondary audience)

Editors use Studio daily: creating, editing, publishing, collaborating. Often non-technical. They care about getting work done, not how the system works.

What they need: plain language, reassurance in errors ("your changes are safe"), explanation of why things matter ("this helps with SEO"), names matching what they see in Studio.

Vocabulary:

- "Save" not "persist"
- "Image" not "asset"
- "Required" not "mandatory"
- "Published" / "Draft" not "live" / "staged"
- Use Studio field labels, not schema field names

Error pattern: `[What happened, plain language]. [What to do next]. [Help link if needed]`

### Technical leaders (tertiary audience)

Leaders evaluate Sanity, plan implementations, make purchasing decisions. They appear in admin panels, onboarding, usage dashboards, and marketing-adjacent product pages.

What they need: outcomes over features, quantified impact, honest trade-offs, team-level framing.

Their copy is about outcomes: "Your team published 47 documents this week" not "47 mutations processed."

---

## The meta-language trap

Sanity is a CMS. Its UI text describes tools for managing text and content. Users are simultaneously creating their own text and content. This creates confusion when system copy and user content blur together.

Always make it obvious whether text is from the system or from the user's content.

```
❌ "Content" (as a nav label — is this the user's content or a section about content?)
✅ "Documents" (unambiguous system label)

❌ "Text" (as a field type label)
✅ "Rich text" or "Plain text" (specific, distinguishable from user's text)
```

When writing help text for content fields, don't describe the field in terms that could be the content itself:

```
❌ Label: "Description"
   Help text: "A description of the content."
✅ Label: "Description"
   Help text: "Appears in search results below the page title. Keep under 160 characters."
```

---

## Sanity-specific patterns

### Publishing workflow language

Sanity has specific states for content. Use them consistently:

| State         | Meaning                                                 | Use in copy                                                                    |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Draft**     | Saved but not published                                 | "Save as draft," "Draft saved," "This document is a draft"                     |
| **Published** | Live and visible                                        | "Publish," "Document published," "Currently published"                         |
| **Scheduled** | Set to publish at a future time                         | "Schedule for [date]," "Scheduled to publish [date]"                           |
| **Release**   | Grouped with other documents for coordinated publishing | "Add to release," "Part of [release name]"                                     |
| **Changed**   | Published but has unpublished edits                     | "Unpublished changes," "This document has changes since it was last published" |

Rules:

- "Publish" means making content live. Never use "deploy," "push," or "release" as synonyms.
- "Release" is a specific Sanity feature (coordinated publishing). Don't use it generically.
- "Draft" is the default state. Don't say "create a draft." Just "create a document" (it starts as a draft).

### Error taxonomy for Sanity

When writing API errors, use this taxonomy:

- `validation_error` — Input doesn't meet schema requirements
- `authentication_error` — Missing or invalid API token
- `permission_error` — Valid token, insufficient permissions
- `not_found_error` — Document, dataset, or project doesn't exist
- `conflict_error` — Concurrent edit conflict, duplicate resource
- `rate_limit_error` — Too many requests
- `connection_error` — Network or service unavailability
- `schema_error` — Schema configuration problem
- `query_error` — GROQ syntax or execution error

Structured error template (Stripe-inspired):

```json
{
  "error": {
    "type": "validation_error",
    "code": "DUPLICATE_SLUG",
    "message": "The slug 'about-us' is already in use. Slugs must be unique within a document type.",
    "param": "slug",
    "doc_url": "https://www.sanity.io/docs/errors/DUPLICATE_SLUG",
    "request_id": "req_abc123def456"
  }
}
```

### Studio-specific copy patterns

- Validation messages should reference field labels as they appear in Studio, not schema field names. If the field is labeled "Featured Image" in Studio, the error says "Featured Image is required" not "'featuredImage' is required."
- Document actions (Publish, Unpublish, Discard changes, Delete) should be consistent across all document types. Don't customize the verb per type.
- Real-time collaboration indicators should be brief. "[Name] is editing" not "[Name] is currently making changes to this document."

### GROQ error messages

GROQ errors are developer-facing. They should reference the specific position in the query, suggest correct syntax when possible, and link to GROQ documentation.

```
✅ "GROQ syntax error at position 23: unexpected token 'where'.
   Did you mean to use a filter? Example: *[_type == 'post']
   Docs: https://www.sanity.io/docs/groq"

❌ "Query error"
❌ "Invalid GROQ query"
```

---

## Error message anatomy

Every error must answer at least questions 1 and 3:

1. **What happened?** — Specific, not vague.
2. **Why?** — If known. If unknown, say so.
3. **How to fix?** — The most important part. Always include this.
4. **More help?** — Error code, request ID, doc link. For complex errors.

Template: `[What happened]. [Why, if known]. [How to fix]. [Reference].`

| AI does this                            | Do this instead                                                       |
| --------------------------------------- | --------------------------------------------------------------------- |
| "Something went wrong"                  | State the specific problem                                            |
| "Error: Publication failed."            | "Couldn't publish. The 'title' field is required."                    |
| "Invalid input"                         | "Slug must be URL-safe. Use lowercase letters, numbers, and hyphens." |
| "Sorry, we couldn't save your document" | "Couldn't save. Connection timed out. Changes preserved locally."     |
| "Please try again" (alone)              | Explain what to change before retrying                                |
| "Error 0x0000000643"                    | Human-readable message first, code as reference                       |
| Toast for errors                        | Inline errors near the source field                                   |
| "Oops! Something broke!"                | Direct, helpful language. No humor in errors.                         |

---

## Inclusive language catches

You know the basics (they/them, avoid "crazy"). These are the catches specific to Sanity's context or that you still miss.

### The "sanity check" problem

"Sanity check" is ableist (trivializes mental health). It's also awkward given the company name. Use "confidence check," "quick review," or "verification" instead.

### Terms you still default to

| You write                 | Write instead                          | Why                                              |
| ------------------------- | -------------------------------------- | ------------------------------------------------ |
| "Blacklist" / "whitelist" | "Blocklist" / "allowlist"              | You still default to these in technical contexts |
| "Master branch"           | "Main branch"                          | Git moved on; copy should too                    |
| "It's easy to..."         | "In a few steps..." or "To do this..." | Dismisses people who find it difficult           |
| "Simply"                  | (delete it)                            | Same problem as "easy," and it's a padding word  |
| "Dummy data"              | "Sample data," "test data"             | Ableist connotation                              |
| "Crippled" / "crippling"  | "Severely limited," "broken"           | You use these in technical descriptions          |

### Content platform-specific

- Don't say "content is king." It's a cliché and it's gendered.
- Don't use "content creator" when you mean "editor." In Sanity's context, editors use Studio; "content creator" implies social media.
- "Author" is a document field in Sanity, not a role description. Use "editor" or "team member" for the person.

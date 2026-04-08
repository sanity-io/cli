# Audience Vocabulary and Tone Guide

Detailed vocabulary, tone, and copy patterns for Sanity's three audiences. Load this when you need to write the same concept for different audiences or when you're unsure which vocabulary to use.

---

## Vocabulary comparison

The same concept, three ways:

| Concept                | Developer                               | Editor                            | Leader                       |
| ---------------------- | --------------------------------------- | --------------------------------- | ---------------------------- |
| Saving content         | Mutation, patch, create                 | Save, update                      | Content operations           |
| Content structure      | Schema, document type, field            | Document, section, field          | Content model                |
| Finding content        | GROQ query, filter, projection          | Search, browse, filter            | Content discovery            |
| Making content live    | Publish mutation                        | Publish (button)                  | Content delivery             |
| Content versions       | Draft/published document, revision      | Draft, published version          | Version control              |
| Coordinated publishing | Release, scheduled publishing           | Release (named group)             | Coordinated launch           |
| Content relationships  | Reference, array of references          | Related content, linked documents | Connected content            |
| Media                  | Asset, image/file document              | Image, file, upload               | Media library                |
| Access control         | Token, role, dataset ACL                | Permissions, access               | Governance                   |
| Real-time updates      | Listener, subscription, real-time query | Live updates, collaboration       | Real-time collaboration      |
| Content delivery       | CDN, API endpoint, GROQ query           | (not visible to editors)          | API, omnichannel delivery    |
| AI features            | Agent API, Content Agent, prompt()      | AI suggestions, AI tools          | AI automation, AI operations |
| Customization          | Custom component, plugin, tool          | (experienced as the UI itself)    | Customizable platform        |
| Errors                 | Error code, stack trace, request ID     | Something went wrong + fix        | (aggregated in dashboards)   |

---

## Tone by audience

### Developer tone

- **Direct and technical.** Don't simplify terminology they already know.
- **Scannable.** Front-load the important information. Developers read the first line and skip the rest if it's not relevant.
- **Actionable.** Every message should tell them what to do or what went wrong.
- **Respectful of expertise.** Don't explain what an API token is. Do explain what's specific to Sanity.

Example tones:

```
Good: "Field 'slug' expects type 'slug', received 'string'."
Bad: "It looks like there might be an issue with the slug field. The system expected a slug type but received a string type instead."
```

### Editor tone

- **Warm but not chatty.** Friendly without being performative.
- **Reassuring in errors.** Always mention if their work is safe.
- **Outcome-focused.** Tell them what will happen, not how it works.
- **Uses their vocabulary.** Match Studio field labels, not schema names.

Example tones:

```
Good: "Your changes are saved. Publish when you're ready."
Bad: "Document mutation persisted to Content Lake. Execute publish action to make changes live."
```

### Leader tone

- **Outcome-driven.** Frame everything in terms of team impact and business results.
- **Quantified when possible.** Numbers over adjectives.
- **Honest about trade-offs.** Leaders respect candor more than optimism.
- **Forward-looking.** What this enables, not just what it does.

Example tones:

```
Good: "Your team published 47 documents this week, up 23% from last week."
Bad: "47 publish mutations were executed across the production dataset."
```

---

## Context-to-audience mapping

When you're unsure which audience you're writing for, use the context:

| Context                        | Primary audience | Secondary                     |
| ------------------------------ | ---------------- | ----------------------------- |
| Studio field validation        | Editor           | —                             |
| Studio document action         | Editor           | —                             |
| Studio empty state             | Editor           | —                             |
| Studio tooltip                 | Editor           | Developer (if config-related) |
| API error response             | Developer        | —                             |
| CLI output                     | Developer        | —                             |
| GROQ error                     | Developer        | —                             |
| Webhook configuration          | Developer        | —                             |
| Admin dashboard                | Leader           | Developer                     |
| Usage/billing page             | Leader           | —                             |
| Onboarding flow                | Leader           | Editor                        |
| Documentation UI               | Developer        | Editor                        |
| Schema validation (build time) | Developer        | —                             |
| Runtime validation (Studio)    | Editor           | —                             |
| Deployment status              | Developer        | Leader                        |

---

## Common mistakes by audience

### Writing for developers but sounding like editor copy

```
Bad: "Something went wrong with your query. Please try a different search."
Good: "GROQ error at position 12: unexpected '}'. Check for unmatched brackets."
```

### Writing for editors but sounding like developer copy

```
Bad: "Validation error: Field 'publishedAt' expects 'datetime', received null."
Good: "The publish date is required. Pick a date to continue."
```

### Writing for leaders but sounding like marketing

```
Bad: "Unlock the power of AI-driven content operations with Sanity's innovative platform."
Good: "Content Agent handled 340 translation updates this month. Previously, this took your team about 2 weeks."
```

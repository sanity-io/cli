---
'@sanity/cli': minor
---

feat(deploy): add a `--title` flag to name a new application or studio, unblocking non-interactive coreApp deploys

Creating a coreApp always prompted "Enter a title for your application:", which no unattended run (CI, agents, piped stdin) could answer — so the first deploy was impossible without a TTY. `--title` supplies the name up front, letting `sanity deploy --yes --title "My App"` create and deploy in one shot. For studios it sets the title on a newly registered hostname. Interactive app runs still prompt when no `--title` is given; unattended runs with existing apps still require `deployment.appId`.

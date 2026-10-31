# Names to create and reserve (owner action)

Decided 2026-10-31. These need an account owner; the integration code can't create them. Do them before the first release so no example ever changes.

## Create (used in every example)

| Platform | Name | How |
|---|---|---|
| GitHub | org `nandee-ai`, repo `scan-action` (public) | github.com/organizations/new. Later: Marketplace listing "Nandee-AI Mobile Application Security Scan" from the repo's Releases page |
| GitLab | group `nandee-ai`, project `scan` (public) | gitlab.com/groups/new. The release pipeline mirrors the monorepo into it |
| npm | scope `@nandee-ai` | npmjs.com → create organization `nandee-ai` (the scope comes with it) |
| ghcr.io | `ghcr.io/nandee-ai/scan` | created on first push from the GitHub org; set the package to public |

## Reserve (plain `nandee`, where free)

| Platform | Name | Status on 2026-10-31 | What to put there |
|---|---|---|---|
| GitHub | user/org `nandee` | taken by a personal account since 2014 | nothing to do; can't be reserved |
| GitLab | group `nandee` | no public group found | create it, private, empty, with a description pointing to `nandee-ai` |
| npm | package `nandee` | not published | the release pipeline publishes a one-file package whose only action is to print "use @nandee-ai/cli" |
| npm | scope `@nandee` | no packages | create org `nandee` on npm if the name is free at signup; otherwise skip |
| ghcr.io | namespace `nandee` | belongs to the GitHub user `nandee` | can't be reserved |

## Checklist

- [ ] GitHub org `nandee-ai` created, 2FA required for members
- [ ] Repo `nandee-ai/scan-action` created, empty, public
- [ ] GitLab group `nandee-ai` and project `scan` created
- [ ] GitLab group `nandee` created and left empty
- [ ] npm org `nandee-ai` created; `@nandee-ai` scope confirmed
- [ ] npm org `nandee` created if available
- [ ] `security@nandee.ai` confirmed as a monitored mailbox (Q14)

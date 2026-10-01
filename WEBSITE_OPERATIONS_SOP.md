# Website Operations SOP

**Status:** Draft handover guide for a static website. Production account names, owners, project IDs, domain details, and final approval roles are not yet supplied. Do not place passwords, API tokens, recovery codes, or private member information in this file or Git.

## 1. Purpose and current status
cd /d "C:\Users\Maryam\Documents\Codex\2026-09-30\i-x20"
git --version
This guide is intended to help a future volunteer understand the site, maintain content, and connect the repository to GitHub and Cloudflare Pages. The current site is a local first-build draft. It is not connected to a production repository, domain, form service, CMS, database, or member system.

The supplied requirements select Cloudflare Pages and GitHub with deploy-on-push. The original MVP requires pre-rendered content. Repository content files are the temporary editing approach until the church chooses editors and confirms whether they need a browser-based CMS.

## 2. Site contents

- `index.html` — home page, navigation, and featured module links.
- `visit.html`, `teaching.html`, `church-life.html`, `care.html`, `serving.html`, `families.html`, `community.html`, `operations.html` — separate navigable pages for public content and module previews.
- `styles.css` — responsive layout, colors, typography and reduced-motion behavior.
- `script.js` — small, local-only interactions; no network requests or data storage.
- `content/` — starter structured content schemas (JSON). They are not yet wired into the page templates; content integration is a next build step.
- `assets/` — approved local media, including the supplied logo.
- `CONTENT_NEEDED.md` — details still required from the church.
- `DECISIONS.md` — assumptions, scope boundaries, risks, and approvals needed.

## 3. Safe content-editing procedure (repository files)

1. Get the latest approved site files from the church-owned GitHub repository once one exists.
2. Edit the relevant content file in `content/` after the templates are connected to that data; for now, page text is in `index.html`. Keep unknown values visibly marked as placeholders.
3. Check spelling, dates, links, image rights, and approval status with the content owner.
4. Preview the site locally in a browser by opening `index.html`.
5. Ask another authorized person to review public-facing content and mobile display.
6. Commit changes with a short factual message and push a branch or approved change for review.
7. Publish only after the church’s chosen approver authorizes the update.

Do not insert real contact submissions, pastoral-care details, member records, children’s data, credentials, or confidential operational documents into repository content.

## 4. GitHub connection (future church-owned setup)

1. The church creates or selects an organization-owned GitHub account/organization and names at least two administrators.
2. Create a private repository initially if any unpublished/private material may be present; review all public content and remove secrets before making code public.
3. Add maintainers with least privilege; use individual accounts and MFA. Do not share one login.
4. Add the project files, including this SOP, content checklist, decisions log, and approved public assets.
5. Protect the production branch with review requirements appropriate to the church’s team.
6. Keep credentials in the service’s secret manager/settings, never in source files, issues, or commit history.
7. Document organization/repository names and owners in an approved church password manager or account inventory, not in this public repository.

## 5. Cloudflare Pages connection (future setup)

1. A church-controlled Cloudflare account owner creates/selects the account and confirms billing and recovery contacts.
2. From Cloudflare Pages, create a project connected to the church GitHub repository and authorize only the required repository access.
3. For the current plain static draft, select no framework, use the production branch selected by the church, set build command to `exit 0` (no-op; it may also be left blank if accepted), and set output directory to `.` at the repository root. No build environment variables are required.
4. Review the first preview deployment on desktop and mobile. Confirm only approved public content is present.
5. Configure production deployment rules and preview deployments, then verify a test change through the agreed review process.
6. Add the custom domain only after explicit launch approval and confirmation of DNS ownership. Record rollback steps and the previous DNS configuration.
7. Confirm HTTPS, canonical domain behavior, sitemap/robots policy, and monitoring before announcing the site.

Cloudflare’s dashboard labels and setup screens may change. The owner should follow the current official Cloudflare Pages and GitHub connection instructions during setup. No account creation or production connection has been performed by this build.

## 6. Content publishing and rollback

- Keep approved content changes small and reviewable.
- A GitHub-connected Pages project normally deploys after a push to its configured production branch; confirm the actual project settings before relying on this behavior.
- For an incorrect release, revert the responsible commit or select the prior successful deployment in Pages, according to the church’s approved rollback procedure.
- Verify the home page, visit details, sermon links, and all changed pages after publishing.
- Record significant changes and the person who approved them in the repository history or church-approved change log.

## 7. Forms, accounts, and sensitive workflows

The current preview forms are disabled and do not submit or save information. Before enabling any form or account module, the church must approve the destination, purpose, consent text, access roles, data minimization, retention/deletion, security controls, notification rules, and incident contact. Pastoral care and children’s data require a specific restricted-access design and review. Never test with real sensitive submissions.

Do not enable payment processing, reminders, public member accounts, prayer submissions, or children’s check-in until the church has reviewed and approved the proposed service configuration and safeguards.

## 8. CMS decision

The current choice is repository-based content files because the editing team and browser-editor requirement are unknown. Reassess when the church names the editors. If nontechnical volunteers need a form-based publishing interface, compare Decap CMS and Sanity against account ownership, editing ease, preview, access control, backups, and handover needs. Configure a CMS only after the church approves a specific option and account owners.

## 9. Handover checklist

- [ ] GitHub organization/repository has church ownership and at least two admins.
- [ ] Cloudflare account and Pages project have church ownership and at least two admins.
- [ ] Domain registrar/DNS access and renewal owner are documented securely.
- [ ] MFA and recovery methods are set up and stored in the church password manager.
- [ ] Content editors, approvers, and technical maintainers are named.
- [ ] Form, member, pastoral-care, and child-data services remain disabled until their approvals are documented.
- [ ] Current deploy and rollback steps have been verified by a second maintainer.
- [ ] All placeholders in `CONTENT_NEEDED.md` are resolved or intentionally retained before public launch.

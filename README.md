# Winnipeg Christian Assembly website — first build

This is a static, responsive multi-page first draft for Winnipeg Christian Assembly. It uses only confirmed church information and visibly labels unresolved content and nonfunctional workflows. No form submission, account access, storage, payment, notification, member system, CMS, or production hosting connection is active.

## Preview locally

Open `index.html` in a browser and use the expandable menu to navigate between separate pages: `visit.html`, `teaching.html`, `church-life.html`, `care.html`, `serving.html`, `families.html`, `community.html`, and `operations.html`. The supplied logo is in `assets/wca-logo.jpg`. The site has no build step or package installation. The menu is interactive; the visitor/contact, search, member, pastoral-care, volunteer, family, media, and operations modules remain previews. JSON files in `content/` are starter schemas and are not yet wired to render the page; connect them to templates when content entry is implemented.

## Build sequence

1. **Foundation and content model (current):** static site shell, responsive navigation, provisional visual system, editable JSON content files, and documentation. Can proceed with supplied name, logo, service times, and address.
2. **Public MVP content:** populate YouTube-linked sermon records, devotionals, verse of the day, music, associated ministries, Bible studies/books/message summaries, and static giving information when the church supplies/approves them. The original requirements keep sermon archive migration, R2 playback, and push notifications out of this build.
3. **Visitor details and contact:** confirm parking/transit, expectations, children, accessibility, visitor/contact destination, consent, retention, and handling. Until approved, the page has explicit placeholders and the form remains disabled.
4. **Congregation and event modules:** add bulletin, announcements, calendar, registration, groups, and teams after receiving approved content. Define identity provider, member fields, roles, and visibility before enabling a dashboard or accounts.
5. **Sensitive modules:** specify pastoral-care roles/security/retention and children’s registration/check-in safeguards before connecting services or accepting information. Build and review the permission model first.
6. **Teaching/media workflows:** add live-service links, transcript/search/saved-message/service-companion structures and media review workflow when sources, rights, owners, and human approval stages are known. Label all generated material as draft until approved; assistant must cite approved church sources.
7. **Serving, community, and operations:** populate roles/outreach/assistance/booking/document workflows after ownership, recipients, permissions, retention, and notification rules are approved.
8. **Launch operations:** choose content editor/CMS, set up church-owned GitHub and Cloudflare accounts, verify preview and rollback, then request launch approval before domain/DNS connection or public deployment.

For missing details and implementation decisions, see [CONTENT_NEEDED.md](CONTENT_NEEDED.md) and [DECISIONS.md](DECISIONS.md). The future access proposal is [ACCESS_MODEL_DRAFT.md](ACCESS_MODEL_DRAFT.md). The account/deployment handover draft is [WEBSITE_OPERATIONS_SOP.md](WEBSITE_OPERATIONS_SOP.md).

For the exact GitHub and Cloudflare Pages preparation settings, see [CLOUDFLARE_PAGES_SETUP.md](CLOUDFLARE_PAGES_SETUP.md).

# Decisions and assumptions

## Scope authority
- The supplied “Fellowship in Winnipeg — Website Rebuild” document remains the authority for the original one-week MVP, Cloudflare/GitHub stack, and Phase 2 boundaries.
- The user’s current first-build request expands this build to include all listed church-platform areas as pages/modules. Features without approved content, recipients, policies, or integrations are draft/prototype/disabled only; their inclusion here does not mean they are live services.
- The original MVP sermon experience remains YouTube links/embeds only. The 400 GB archive migration, R2 audio playback, and push notifications are explicitly not started.
- No deployment, live domain connection, CMS configuration, real accounts, live data collection, outbound notifications, payments, or sensitive-data processing is authorized by this build request.

## Confirmed information
- Approved public name: Winnipeg Christian Assembly (WCA).
- Logo image supplied in chat; included locally as `assets/wca-logo.jpg`.
- Sunday service: 10:00 a.m.–1:00 p.m.; Wednesday Bible study: 6:30–8:30 p.m.
- Address: 90 Ashland Avenue, Winnipeg, Manitoba, R3L 1K6.
- Reference direction: Liberty Church London and Cities Church Winnipeg for broad site structure/visitor onboarding/sermon and event patterns; Heaven’s Gate Academy for an infinite photo strip. Soft cinematic fade from hero to content is requested.
- Sermon, devotional, music, Bible study, books, message summary, and giving content will be supplied later.

## Implementation choices
- **Who We Are page:** add a separate page in the main navigation and footer Quick Links. Use a beliefs-page structure inspired by the reference, but do not reuse its doctrinal claims. WCA has not supplied approved belief wording, so the page labels each topic as draft placeholder content pending leadership approval.
- **Static, modular first draft:** use plain HTML, CSS, JavaScript, and repository content files; no framework/build dependency is needed to preview this draft. This is reversible and supports Cloudflare Pages static hosting.
- **Content editing:** repository-based Markdown/data files are sufficient for this first build because editor identities and browser-editor needs are undecided. This is maintainable/versioned but less friendly for nontechnical editors. Keep the content model CMS-ready; do not configure Decap, Sanity, or another CMS until the church confirms editor roles and workflow.
- **Information architecture:** separate static pages for Home, Visit, Teaching, Church life, Care, Serving, Families, Community, and Give. Per user direction, the church-operations draft is removed from the public Give page; a separate destination for those operations modules remains to be decided.
- **Giving presentation:** use the supplied visual reference’s bordered hero, phone-style illustration, and prominent call to action, followed by giving-method cards. The phone visual is illustrative only. User-selected methods are Interac e-Transfer, QR code, and cash or envelope in person. The actual Interac recipient/instructions and WCA QR asset are still needed; no payment links or processing are configured. [Liberty Church London Giving](https://thelibertychurchlondon.com/give/)
- **Footer contact/social section:** include YouTube, Instagram, and Contact Us labels, but keep them as non-clickable placeholders until official URLs and the church email are supplied.
- **Visual style:** use the supplied logo’s orange, charcoal, and muted teal as provisional palette cues. This is an implementation choice pending brand approval. No unsupplied photography or church-specific copy will be invented.
- **Visitor form and every other submission UI:** disabled prototype only. No backend, storage, or email delivery exists. This avoids collecting data before recipient, consent, retention, access, and handling are approved.
- **Sensitive modules:** pastoral care, member dashboard, child check-in, and staff operations show structure and proposed boundaries only. The prayer request form is a disabled preview with optional contact fields; no real requests or records are collected or stored.
- **Generated media/assistant:** prototype steps only. Any future outputs must be labeled drafts/recommendations, cite approved sources, and require human approval before publishing.
- **Footer photo carousel:** continuously scrolling strip is enabled with labeled gradient placeholders until approved congregation photos are supplied. It includes a pause/resume control, hides the duplicated loop from assistive technology, and remains static with horizontal scroll available for reduced-motion preference.
- **Home hero:** use a full-bleed three-slide background carousel with soft cross-fades, manual controls, pause/play, and no auto-advance when reduced motion is requested. The navigation overlays the hero and gains an opaque background after scrolling. Current background gradients are placeholders until approved WCA photos/video arrive; no church images have been fabricated or borrowed from references.
- **Hero-to-content transition:** use a bottom gradient dissolve into the service-information strip to echo the requested soft transition. No autoplay video is installed until approved media and performance/accessibility choices are available.

## Reference-site observations
- Liberty Church London uses prominent New Here/Belong, ministries, events, locations, and giving paths. WCA’s draft adapts the visitor-first entry and clear module grouping without importing Liberty’s church-specific copy or claims. [Liberty Church London](https://thelibertychurchlondon.com/)
- Cities Church Winnipeg puts Plan Your Visit, service information, events, groups, and a latest message near the top of its home page. WCA’s draft brings visit details, teaching, and church-life modules forward in that order. [Cities Church Winnipeg](https://citieswinnipeg.church/)
- Heaven’s Gate Academy presents a visual photo strip alongside a resource library. WCA’s footer strip uses the continuous-scroll presentation, with labeled placeholders until church-approved photography is supplied. [Heaven’s Gate Academy](https://heavensgateacademy.com/)
- These references guide information architecture and presentation only. Their statements, images, service information, and forms are not reused.

## Risks and approvals needed
- Verify all service/address details and the final logo asset before public launch.
- Confirm visitor/general-contact recipient and form consent, retention, and security before enabling forms.
- Confirm who may access, assign, and retain pastoral-care and member data before implementing authentication or storage.
- Confirm children’s information/check-in process and safeguards before any collection.
- Confirm approved giving text; payment integration is out of scope.
- Confirm content rights and human review owners before publishing media or generated content.
- Confirm GitHub/Cloudflare ownership, domain/DNS, and approvers before deployment.
- Validate the SOP against the church’s final account setup before handing credentials or changing production settings.

# Draft access model for future review

**Not implemented.** No accounts, private records, or access controls are active in this static preview. This document is a least-privilege starting point for church review, not a church policy.

## Proposed role boundaries

| Role | Possible access | Explicit boundary |
|---|---|---|
| Public visitor | Approved public pages, published sermons/resources, public events | No member or staff records; no unpublished content |
| Signed-in member | Public content plus approved member-only bulletin/events and their own saved items/profile | No other member’s profile, giving record, pastoral-care record, or children’s record |
| Volunteer | Their own approved schedule/availability and role instructions | No broad member directory, pastoral-care data, or other teams’ private schedules |
| Team coordinator | Scheduling for the assigned team and minimum information needed to coordinate it | No pastoral-care records unless separately authorized for a specific assignment |
| Content editor | Create and revise draft public content and media assets | Cannot publish sensitive modules or change permissions by default |
| Content approver/publisher | Review and publish approved public material | Generated outputs remain drafts until human approval; source and rights are checked |
| Pastoral responder | Only assigned care requests, if approved by church leadership | No general access to all care records unless explicitly assigned and approved |
| Care coordinator | Assign/track care requests only if leadership approves that role | Keep access limited to the operational minimum; never expose care content publicly |
| Site administrator | Technical configuration and account support | Administrative access should not automatically grant routine access to pastoral or child records |
| Child check-in worker | Minimum child/guardian information needed for an approved check-in window | No general child roster export or unrelated family data |

## Safeguards to decide before implementation

- Approve an identity provider, MFA requirements, account invitation/removal process, and periodic role review.
- Decide what personal information is truly necessary for each workflow; avoid collecting optional sensitive details by default.
- Define consent, who can assign/see records, retention/deletion, export controls, and incident response before enabling submissions.
- Separate pastoral-care and child check-in data from public content and ordinary member/volunteer tools.
- Restrict each case to the smallest approved set of people; log access and administrative changes where appropriate.
- Select and review vendors, storage locations, encryption, backups, and breach notification responsibilities.
- Test authorization using non-sensitive test accounts before any real data is entered.

## Open approval questions

1. Which church leaders approve roles and access to sensitive records?
2. Who may see, assign, and close prayer/pastoral requests? Is access case-by-case or team-wide?
3. What member data and child/guardian data are necessary, and when should it be deleted?
4. Who can publish public content, event registrations, schedules, and generated media?
5. Which authentication and storage services are acceptable to the church?

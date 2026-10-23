---
title: FAQ and troubleshooting
description: Common questions and fixes.
order: 15
section: Help
---

# FAQ and troubleshooting

**Does the AI send emails by itself?**
No. It only drafts. A person always reviews and presses send. Follow-up *agents* send
only if their action control is set to automatic.

**The AI quoted a wrong price.**
Check [Master Data](./master-data.md): the AI only uses values that are in the catalogue and
linked to the right item. If the product is not listed, it will say it will confirm.
A missing or unlinked rate is the usual cause.

**A client email did not appear in the Inbox.**
Confirm the forwarding rule in your mail account points at your `@inbound.bloomgard.co`
address, and that the address is saved in **Email Settings**. Mail sent to an address that
belongs to no workspace is rejected.

**A client reply was not attached to the right quote.**
Replies are matched by the quote number in the subject, then by the sender's address on a
client record. Keep `QN-…` in the subject when you send, and make sure the client's email
is on the client record.

**Sending fails with "Sender domain is not verified".**
Verify the sending domain (SPF + DKIM) in the Resend dashboard, or send from a verified
address.

**A quote does not show in Follow ups.**
Approved and Lost quotes are excluded. Lower the days filter (0 shows everything), or
clear the search.

**I changed a catalogue parent value and the other fields did not update.**
Choose the parent again from the suggestions. Choosing a parent re-syncs every linked
child field.

**Who can see which quotes?**
Managers and Admins see all quotes in the workspace; Agents see only the ones they created.

## Quality assurance

The product ships with an automated test suite (Playwright) that exercises email
routing, receiving and sending, Master Data (API, grid, Excel import, cascade), the quote
form, quote-from-email, AI drafts (grounding, signature, never auto-sent), the Inbox,
Follow-ups, settings, authentication and the landing page. Run it with `npm run e2e` from
the `web` folder. Test fixtures are created and removed automatically.

---
title: Lead generation
description: Turning inbound enquiries into leads and quotes.
order: 9
section: Sales
---

# Lead generation

**Lead Gen** shows records whose status is **Lead**: enquiries that are not yet quotes.

## From an email to a quote

1. A client you do not know yet emails your inbound address. It lands in the [Inbox](./inbox.md), attached to no quote.
2. Open it and choose **Generate AI Actions**.
3. The AI extracts the client's details and the items they asked about, matching them to your [Master Data](./master-data.md) (code → name → unit → rate).
4. Choose **Create Quote Now** to create everything in one click, or **Review in Form** to adjust first.

## What "Create Quote Now" builds

- A **client** record: company name from the email's signature or, if absent, from the sender's domain (for example `buyer@acme-steel.co.in` becomes *Acme Steel*), falling back to the sender's name. Existing clients with the same name are updated rather than duplicated.
- A **quotation** with status **Inquiry**, the next quote number, a follow-up due date three days out, and a link back to the source email.
- **Line items** with code, name, unit and rate filled from the catalogue. If a client names a code, the rest of the row is completed from the catalogue; if the text is ambiguous, blanks are left for a person rather than guessed.
- A thread in the Inbox so the conversation continues against the new quote, and a status-log entry noting it was auto-created from email.

## Converting a Lead

A record with the **Lead** status can be moved to **Draft** once it has items, and from
there it follows the normal [pipeline](./quotes.md#statuses).

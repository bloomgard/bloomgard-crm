---
title: Quotes and the pipeline
description: Creating, tracking, exporting and sending quotations.
order: 3
section: Sales
---

# Quotes and the pipeline

## The Quotes view

**Quotes** lists the workspace's quotations (Managers see all; agents see their own).
You can search ("Search quotes…"), see who created each one, change its status, open
it to review, **Import** records, and **Export** the list as JSON or CSV. Each quote has a number in the form `QN-YYYY-NNN`
(for example `QN-2026-014`), assigned automatically when you save.

## Creating a quote

Choose **+ New Entry** to open the quote form. The form is made of **sections** (for
example *Client Information* and *Products*) whose fields are defined by your workspace's
[Field Configurator](./settings.md#field-configurator). Fields can be text, number,
dropdown, paragraph, attachment or formula.

- **Quote ID** is shown as *Auto-generated on Save*.
- **Assign Agent** lets you give the quote to a follow-up agent, or leave it as *None (Manual Follow-up)*.
- **Catalogue-assisted fields.** Fields that come from [Master Data](./master-data.md) suggest values as you type. Choosing a parent value (such as an item code) fills every child field (name, unit, rate). Choosing a different parent re-syncs all of them, so values can never drift apart. Typing the parent again reopens the suggestions.
- **Formula fields** calculate from other fields (for example line totals and subtotal).
- **Save** stores the quote and its line items. **Discard** abandons the form.

## Statuses

A quote moves through a status pipeline. The statuses used by the product are:

| Status | Meaning |
|---|---|
| **Lead** | An enquiry that has not been turned into a quote yet (see [Lead generation](./lead-gen.md)). |
| **Inquiry** | A quote created from an inbound email, waiting to be worked. |
| **Draft** | Being prepared. |
| **Pending** | Sent / awaiting the client's decision. |
| **Approved** | Accepted. Approved quotes also appear in the Document Library. |
| **Rejected** | Declined. |
| **Lost** | Deal lost. Approved and Lost quotes never appear in Follow ups. |

Every change is recorded in the **Manifest Audit Log** (who moved it and when), shown on
the quote.

## Reviewing a quote

Opening a quote shows its items, the conversation with the client, attachments, the
status **Transition** control and the audit log. **Save Edits** stores changes.

## PDF export and the Document Library

- **Preview PDF** renders the quote with your [quote template](./settings.md#quote-template) before you export.
- **Export PDF / Download PDF** produces the document. Generated PDFs are added to **Docs → Document Library**, where you can view or download them again or delete them.

## Emailing a quote

**Deploy Email** opens the send dialog: choose **Send As** (your personal address or the
workspace address), recipient, optional CC/BCC, subject, message body, and an attachment
(the quote PDF or another CRM document). The email goes out through Resend; replies come
back to the matching inbound address and appear in the [Inbox](./inbox.md), logged on the
quote's conversation. Sent mail is recorded and counted for usage.

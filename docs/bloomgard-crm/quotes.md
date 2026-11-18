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

A quote moves through **your workspace's own pipeline**. The stages are whatever the
**Master Status** field lists in the [Field Configurator](./settings.md#master-status) — the
buttons on an open quote, the Quotes filter, the Status Log and Bloomgard AI all offer those
same stages and nothing else. A new workspace starts with *Inquiry, Quotation Given,
Approved, Lost*.

Two names mean something to the product wherever they appear:

| Status | Meaning |
|---|---|
| **Lead** | An enquiry that has not been turned into a quote yet (see [Lead generation](./lead-gen.md)). Leads live in Lead Gen, not Quotes. |
| **Approved** | Accepted. Approved quotes also appear in the Document Library. |

**Approved** and **Lost** quotes never appear in Follow ups.

Every change is recorded in the **Status Log** on the quote: who moved it, when, from what to
what, and any note. It is a log module like the ones you configure yourself — filter it by
status, and use **Add entry** to move the quote and write the reason in one step — except that
every workspace has it from the start and it cannot be renamed or removed.

## Reviewing a quote

Opening a quote shows its items, the conversation with the client, attachments, the
status **Transition** control and the audit log. **Save Edits** stores changes.

## PDF export and the Document Library

- **Preview PDF** renders the quote with your [quote template](./settings.md#quote-template) before you export.
- **Export PDF / Download PDF** produces the document. Generated PDFs are added to **Docs → Document Library**, where you can view or download them again or delete them.

## The client link

**Client link** on an open quote makes a page your client can open in any browser, with no login
and no attachment: the quote, its items and total, and two buttons.

- **Accept this quote** moves it to your accepted stage (Approved, Accepted, Won or PO Received,
  whichever your pipeline has) and tells you and the managers.
- **Ask for changes** keeps the status and gives the quote's owner a task with the client's request.

Both go in the Status Log with the client's name, and the first time the client opens the link is
logged too. The link is copied for you to paste into an email or WhatsApp; making a new link
retires the old one. Bloomgard AI can make one as well: "send Rohit a link to accept QN-2026-014".

## Emailing a quote

**Deploy Email** opens the send dialog: choose **Send As** (your personal address or the
workspace address), recipient, optional CC/BCC, subject, message body, and an attachment
(the quote PDF or another CMA document). The email goes out through Resend; replies come
back to the matching inbound address and appear in the [Inbox](./inbox.md), logged on the
quote's conversation. Sent mail is recorded and counted for usage.

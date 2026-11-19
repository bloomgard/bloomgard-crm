---
title: Quotes and the pipeline
description: Creating, tracking, exporting and sending quotations.
order: 3
section: Sales
---

# Quotes and the pipeline

## The Quotes view

**Quotes** lists the workspace's quotations (managers see all; agents see their own). Each quote
has a number in the form `QN-YYYY-NNN` (for example `QN-2026-014`), assigned automatically when
you save.

- **Search** looks inside every quote, not just the client name: line items, notes, any field,
  log entries. "flange" finds every quote with a flange in it.
- **Status chips** under the search show how many quotes are at each stage. Click one to show only
  those; click more to combine them; click again to clear.
- **Filters** narrows by owner, client name, quote date, amount range and how long a quote has gone
  without contact. Each filter in use shows as a chip you can remove on its own.
- **Columns** chooses what the table shows and in what order. Tick a column to add it (any field of
  your quote form is available, grouped by module), untick to hide it, and drag or use the arrows
  to reorder. **Default** puts the standard set back. Your choice is remembered in this browser.
- Click a **column heading** to sort by it; click again to reverse.

### Views

A **view** is a saved list: the search, filters, columns and sort you have set, kept as a tab
above the table. Set the list up the way you want it, choose **+ Save as view** and give it a name
("My open quotes", "Big and quiet"). Click the tab any time to get exactly that list back;
**All quotes** clears it.

Change an open view and **Save changes** updates it; **Delete view** removes it (the quotes are
not touched). Your views are private. A manager can share one with the whole team from
[Studio](/crm/platform/studio), and Bloomgard AI can make one for you: "save a view of open quotes
over ₹5,00,000, biggest first".

### Finding something inside a quote

An open quote has a **Find in this quote** box at the top. Type and every match is highlighted,
with the first scrolled into view; **Enter** and **Shift+Enter** step through them. **Ctrl+F**
(**Cmd+F** on a Mac) jumps to the box while a quote is open.

### Import and export

Exporting and importing quotes is under **Settings → Import & export**:

- **Download spreadsheet (CSV)**: every quote you can see, with a column for every field.
- **Download backup (JSON)**: everything, line items and logs included. It can be imported again.
- **Import quotes** adds the quotes from a backup file as new quotes owned by you.

For a particular slice ("approved quotes this month, as Excel"), ask Bloomgard AI.

## Creating a quote

Choose **+ New Entry** to open the quote form. The form is made of **sections** (for
example *Client Information* and *Products*) whose fields are defined by your workspace's
[Field Configurator](/crm/configuration/settings#field-configurator). Fields can be text, number,
dropdown, paragraph, attachment or formula.

- **Quote ID** is shown as *Auto-generated on Save*.
- **Assign Agent** lets you give the quote to a follow-up agent, or leave it as *None (Manual Follow-up)*.
- **Catalogue-assisted fields.** Fields that come from [Master Data](/crm/sales/master-data) suggest values as you type. Choosing a parent value (such as an item code) fills every child field (name, unit, rate). Choosing a different parent re-syncs all of them, so values can never drift apart. Typing the parent again reopens the suggestions.
- **Formula fields** calculate from other fields (for example line totals and subtotal).
- **Save** stores the quote and its line items. **Discard** abandons the form.

## Statuses

A quote moves through **your workspace's own pipeline**. The stages are whatever the
**Master Status** field lists in the [Field Configurator](/crm/configuration/settings#master-status) — the
buttons on an open quote, the Quotes filter, the Status Log and Bloomgard AI all offer those
same stages and nothing else. A new workspace starts with *Inquiry, Quotation Given,
Approved, Lost*.

Two names mean something to the product wherever they appear:

| Status | Meaning |
|---|---|
| **Lead** | An enquiry that has not been turned into a quote yet (see [Lead generation](/crm/sales/lead-gen)). Leads live in Lead Gen, not Quotes. |
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

- **Preview PDF** renders the quote with your [quote template](/crm/configuration/settings#quote-template) before you export.
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
back to the matching inbound address and appear in the [Inbox](/crm/email/inbox), logged on the
quote's conversation. Sent mail is recorded and counted for usage.

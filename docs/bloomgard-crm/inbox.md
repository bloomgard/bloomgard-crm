---
title: Inbox
description: Receiving, reading, replying to and composing client email.
order: 5
section: Email
---

# Inbox

The Inbox shows every client email delivered to your workspace's inbound addresses
(see [Email setup](./email-setup.md)). It is where enquiries arrive and where you
reply.

## What you can do

- **Search** ("Search emails…") across sender, subject and body.
- **Refresh** to fetch new mail.
- **Open** a message to read its full body (this marks it read).
- **Star** a message so it stays easy to find.
- **Delete** a message (it is flagged as deleted and hidden).
- **Reply** from the workspace address. Replies are sent through Resend, recorded in sent mail, and counted for usage.
- **Compose** a new email.

## How incoming email is filed

When a message arrives, the app stores it and then tries to attach it to a quote:

1. If the subject contains a quote number (for example `Re: Quote QN-2026-014`) it is filed against that quote.
2. Otherwise, if the sender is a known client (their address is on a client record), it is filed against that client's **most recent quote**.
3. Otherwise it is kept in the Inbox as a new enquiry and attached to nothing. It is **never** attached to an unrelated quote.

When a message is attached to a quote, the client's text is added to that quote's
conversation history, the quote's last-contact date is updated, the conversation's
status becomes **incoming** (so the quote is *Hot* in [Follow-ups](./follow-ups.md)), and
any older AI draft is cleared so a stale draft is never shown for a new message. If AI is
enabled for the workspace, a fresh [draft reply](./ai-assistant.md) is prepared for review.

## AI actions on an email

Select an email and choose **Generate AI Actions**. You get:

- **Summary** – a short summary of what the client wants (with **Approve Summary**).
- **Lead Gen Quote Extracted** – client details and line items found in the email, matched against Master Data.
- **Drafted Auto-Reply** – a reply written for you to edit and send (**Approve & Open Draft**).

From the extracted quote you can **Create Quote Now** (one click: the client and quote are
created, items are filled from the catalogue, and the email is linked) or **Review in Form**
to adjust it first. See [Lead generation](./lead-gen.md).

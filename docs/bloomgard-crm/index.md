---
title: Bloomgard CMA overview
description: What Bloomgard CMA is, who it is for, and everything it can do.
order: 1
section: Introduction
---

# Bloomgard CMA

Bloomgard CMA is a quotation-led sales workspace for B2B teams. It turns incoming
client email into quotations, keeps every conversation attached to the right quote,
drafts replies with AI (always for a human to approve), and chases quiet leads so
nothing goes cold.

It is multi-tenant: each company gets its own isolated **workspace** with its own
users, catalogue (Master Data), email addresses, AI behaviour and quote template.

## Capabilities at a glance

| Area | What you can do |
|---|---|
| [Quotes](./quotes.md) | Build quotations from a configurable form, fill line items from your catalogue, move them through a status pipeline, export a PDF, and email it to the client. |
| [Master Data](./master-data.md) | Maintain your product catalogue in an Excel-style grid, import it from Excel, and link columns parent → child (code → name → unit → rate) so one choice fills the rest. |
| [Inbox](./inbox.md) | Receive client email (via forwarding), read, search, star, reply and compose. Every message is filed against the right quote. |
| [AI actions](./ai-assistant.md) | One click summarises an enquiry, extracts a draft quote, and writes a reply grounded in your catalogue. Replies are drafts; nothing is auto-sent. |
| [Follow-ups](./follow-ups.md) | See quotes that have gone quiet, scored Hot / Warm / Cold, with AI-suggested follow-up emails waiting for approval. Optional autonomous follow-up agents. |
| [Lead generation](./lead-gen.md) | Turn inbound enquiries from people you do not know yet into leads, then into quotes. |
| [Dashboard & Bloomgard AI](./dashboard-and-copilot.md) | Pipeline analytics, AI-built charts from a sentence, and a chat assistant that reads your pipeline, inbox and catalogue. |
| [Settings](./settings.md) | Profile, users and roles, field configurator, email addresses, personalisation, AI behaviour, quote template. |
| [Platform admin](./platform-admin.md) | Provision workspaces, toggle features per workspace, and meter usage for billing. |

## How the pieces fit

```
Client email ──► inbound address ──► Inbox ──► matched to a Quote ──► AI draft (for review)
                                        │                                   │
                                        └─► Generate AI Actions ──► Quote   └─► you review ► send
Quote ──► PDF ──► email to client ──► client replies ──► back into the Inbox
```

## Where to go next

- New to the product? Start with [Getting started](./getting-started.md).
- Setting up email? See [Email setup](./email-setup.md).
- Integrating or debugging? See the [API reference](./api-reference.md) and [Data model](./data-model.md).

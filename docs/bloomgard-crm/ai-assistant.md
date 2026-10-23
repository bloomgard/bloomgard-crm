---
title: AI replies and settings
description: How AI drafts, extracts and learns your tone, and how to control it.
order: 7
section: AI
---

# AI replies and settings

The AI in Bloomgard **drafts; it never sends on its own.** Every AI reply waits for a
person to review and press send.

## What the AI does

| Feature | Where | Result |
|---|---|---|
| **Draft reply** to a client message | Prepared automatically when a client email is attached to a quote (if AI is enabled for the workspace) | A draft appears on the quote's thread in Follow ups / Inbox, ready to edit and send. |
| **Generate AI Actions** | [Inbox](./inbox.md) | Summary, extracted quote (client + items) and a drafted reply. |
| **Create Quote Now** | Inbox | Builds a real quote from the extracted data. |
| **Follow-up suggestions** | [Follow-ups](./follow-ups.md) | Suggested follow-up email snippets awaiting approval. |
| **Bloomgard AI chat** and **AI charts** | [Dashboard & Bloomgard AI](./dashboard-and-copilot.md) | Answers and charts over your own data. |

## Grounded in your catalogue

To stop the AI inventing prices, every prompt includes your [Master Data](./master-data.md):

- a digest of each catalogue column with sample values, and
- the **exact linked rows** (code, name, unit, rate) for the products the client's email actually mentions.

The AI is instructed to use only values that appear there. If a client asks for something
that is not in the catalogue, the reply says the team will confirm and follow up, rather
than guessing a name, spec or price. If the workspace has no catalogue at all, the AI is
told not to quote any price.

## Signed as you

Replies are signed with the sending agent's **profile** (**Settings → Your Profile**): full
name, job title, phone and company. There are no "[Your Name]" placeholders. You can
override the sign-off with your own exact wording (**Email Sign-Off (optional)**).

## Learns your tone

The AI looks at past messages you have actually sent and uses them as style examples, in
addition to the tone you choose below, so drafts sound like you.

## AI Settings (Managers/Admins)

**Settings → AI Settings** controls how the AI writes for the whole workspace:

| Setting | Options |
|---|---|
| **Tone** | Professional, Friendly, Casual, Corporate Jargon, Aggressive |
| **English level** | Native, Simple / Basic |
| **Desperation level** | Low (Confident), Medium (Eager), High (Need the deal) |
| **System instructions** | Free text: how to write, the objective, constraints, policies |
| **Email routing rules** | Forward certain kinds of mail to a teammate ([Email setup](./email-setup.md)) |

## Turning AI on and off

AI is a per-workspace feature. A platform admin enables it from the [Platform admin](./platform-admin.md)
console. When it is off, no drafts are generated and AI buttons do not run.

## Usage metering

Each AI call records its token usage against the workspace and the feature (for example
draft reply, analyse email, ask-AI), which feeds billing.

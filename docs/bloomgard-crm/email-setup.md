---
title: Email setup
description: Forwarding, inbound addresses, sending, and how email is routed.
order: 6
section: Email
---

# Email setup

Bloomgard uses one email provider, **Resend**, for both receiving and sending.

## Your addresses

Open **Settings → Email Settings**:

| Address | What it is |
|---|---|
| **Your personal email** | The address quotes are sent from by default ("Send As → Personal"). Replies are tied to your identity. |
| **Your unique forwarding address** | A personal `@inbound.bloomgard.co` address. Email delivered here is filed to *you* and the conversation is assigned to you. |
| **Common workspace email** | A verified company address (set by your admin) that any agent can send from. |
| **Workspace inbound address** | A tenant-level `@inbound.bloomgard.co` address, used when mail should belong to the workspace rather than one agent. |

## Receiving email (forwarding)

1. In **Email Settings**, choose your forwarding address (for example `your-name@inbound.bloomgard.co`) and save.
2. In your own Gmail or Outlook, add an auto-forwarding rule that forwards client mail to that address.
3. Mail now appears in the [Inbox](./inbox.md) within seconds.

Routing rule when mail arrives (first match wins):

1. a **personal** forwarding address → that user's workspace, assigned to that user;
2. a **workspace** routing id or slug → that workspace;
3. a raw workspace id as the local part → that workspace.

Unknown addresses are rejected. Addresses are matched case-insensitively and
display-name formats such as `"Bloomgard Inbound" <id@inbound.bloomgard.co>` are accepted.

## Sending email

Quotes and replies are sent through Resend from your chosen **Send As** address. The
`Reply-To` is set to your inbound address, so the client's reply returns to Bloomgard
automatically.

If a sending domain is not yet verified, sending fails with a clear error that names the
domain. Verify the domain in the Resend dashboard (SPF and DKIM records). For
sandbox testing only, a deployment can set `RESEND_FALLBACK_TO` to route unverified mail to
test recipients; it is off by default.

## Email routing rules

In **AI Settings → Email Routing Rules** you can forward specific kinds of mail to
a teammate. Each rule has a **condition** (what to look for, such as "invoices, support,
urgent complaints"), a **route-to** address, and an optional message to prepend.

## Automation behind the scenes

Resend delivers inbound mail to a webhook (`POST /api/inbound-email`). The handler
responds immediately and does the quote-matching and AI drafting in the background, so
Resend never times out.

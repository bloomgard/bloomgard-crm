---
title: Email setup
description: Forwarding, inbound addresses, sending, and how email is routed.
order: 6
section: Email
---

# Email setup

Bloomgard uses one email provider, **Resend**, for both receiving and sending.

## Your company domain

When you create an account with your company email, Bloomgard registers your domain (e.g. `acme.com`) for
sending and gives your workspace its own receiving address (e.g. `acme-steel@inbound.bloomgard.co`).
Open **Settings → Email Settings** to finish:

1. **Add the DNS records.** Every record is listed with its type, host, value and priority, each with a copy
   button. Bloomgard detects your DNS host (Cloudflare, GoDaddy, Namecheap, Route 53, …) and shows where to add
   them. On Cloudflare you can paste an API token ("Edit zone DNS" for that domain) and Bloomgard adds the records
   for you; the token is used once and never stored.
2. **Watch them verify.** Each record shows two checks: *Our provider* (Resend's verification) and *At your host*
   (Bloomgard's own DNS lookup). The page re-checks every 30 seconds; **Check now** forces it.
3. **Choose your sender**, e.g. `sales@acme.com`, once the domain is verified. Until then mail goes out from
   `support@bloomgard.co`.
4. **Receiving needs no DNS.** Everything Bloomgard sends has Reply-To set to your workspace address, so replies
   arrive in the Inbox automatically. To also bring in mail sent to your existing mailbox, forward it there
   (steps for Google Workspace and Microsoft 365 are on the page), and use **Send a test** to watch a real email
   make the round trip.
5. **Branded replies (optional).** Receive on `reply.acme.com` instead, with one MX record on that subdomain. Your
   main mailbox is not affected.

If your domain was already verified with Bloomgard before this screen existed, it is picked up automatically and
shown as verified: you are not asked to set it up again.

The records never change your main MX, so Google Workspace or Microsoft 365 keep working. You can also ask
Bloomgard AI "which DNS records are still missing?" and it checks live.

Sign-up is for organisations: personal addresses (Gmail, Outlook, Yahoo, …) are refused, and a company domain
can have one workspace; colleagues are added by its admin.

## Your addresses

Open **Settings → Email Settings**:

| Address | What it is |
|---|---|
| **Your personal email** | The address quotes are sent from by default ("Send As → Personal"). Replies are tied to your identity. |
| **Workspace inbound address** | The shared `@inbound.bloomgard.co` address, created with the workspace. Every quote and reply Bloomgard sends sets Reply-To to it, so client replies come back with no DNS work. Mail arriving here is filed to the workspace and lands in the Inbox **unassigned**. |
| **Your own address (optional)** | A second `@inbound.bloomgard.co` address, personal to you. Nobody has one until they ask for it under **Give me my own address**. It behaves exactly like the workspace one, except mail sent to it is **assigned to you** automatically. |
| **Common workspace email** | A verified company address (set by your admin) that any agent can send from. |

Most workspaces need only the first. The personal address earns its keep when several
people each forward their own client mail into the same workspace and you want each
person's threads to land on their own plate instead of a shared pile.

## Receiving email (forwarding)

1. In your own Gmail or Outlook, add an auto-forwarding rule that forwards client mail to
   the workspace address shown in **Settings → Email Settings**.
2. Mail now appears in the [Inbox](./inbox.md) within seconds.
3. Optional: in the same screen choose **Give me my own address**, pick a name and save,
   then forward to that address instead. Everything works the same way; the threads are
   assigned to you. **Remove** puts you back on the shared address.

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

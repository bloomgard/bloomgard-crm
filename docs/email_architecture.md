# Bloomgard ERP — Email Infrastructure & Architecture

## Overview
Bloomgard runs a single-provider email pipeline on **Resend** for both inbound
parsing and outbound transactional mail. There is no SMTP relay and no
provider switching — every code path goes through `web/lib/email.ts`.

## 1. Inbound Pipeline
**Flow:** Client domain forwarding rule → `*@inbound.bloomgard.co` → Resend
inbound parsing → webhook `POST /api/inbound-email`.

1. **Forwarding rule** — the client forwards (or BCCs) their corporate inbox to
   a per-user alias, e.g. `jeevanecotex-sales@inbound.bloomgard.co`. The alias
   maps to a `profiles.inbound_email` row.
2. **Resend inbound parsing** catches the message and fires a webhook.
3. **`/api/inbound-email`** resolves the routing alias to `tenant_id` + `agent_id`,
   pulls the full message via `resend.emails.receiving.get`, extracts threading
   headers, stores it in `inbound_emails`, and (via `after()`) links it to the
   matching quotation by `QN-YYYY-NNN` subject match.
4. If the tenant has `ai_enabled`, the AI auto-reply pipeline
   (`lib/ai-reply.ts`) may draft and send a response.

## 2. Outbound Pipeline
**Flow:** Vercel serverless function → `lib/email.ts` (`sendEmail`) → Resend API → recipient.

- `getDynamicSender(companyName, customEmail, tenantDomain)` builds the `From`
  header. Preference order: tenant `custom_email_sender` → `billing@<tenantDomain>`
  → `info@bloomgard.co`.
- `Reply-To` is set to the sender's `inbound_email` alias (or the tenant-level
  `<routing_id>@inbound.bloomgard.co`) so replies re-enter the inbound pipeline.
- **Unverified-domain fallback:** if Resend rejects the `From` domain (403 /
  validation error), `sendEmail` retries from `onboarding@resend.dev`, preserving
  the display name and setting `Reply-To` to the original address.

## Domain verification
Custom sending domains are verified in the Resend dashboard (SPF + DKIM +
optional custom return-path). Until a domain shows as verified in Resend, the
fallback above keeps mail flowing.

---
title: API reference
description: The HTTP endpoints the app exposes, with their inputs and behaviour.
order: 13
section: Developers
---

# API reference

All endpoints are Next.js route handlers under `/api`. Request and response bodies are JSON.
They are designed for the Bloomgard web app (and its Android wrapper, which is why some
send CORS headers); there is no separate public API key scheme.

## Email

### `POST /api/inbound-email` (webhook)
Called by Resend when mail arrives at an `@inbound.bloomgard.co` address.

- Body: Resend's `email.received` payload (`data.from`, `data.to[]`, `data.subject`, `data.email_id`, `data.text`, …).
- `200 {message:"No from address"}` if there is no sender; `400` if there is no recipient or the address belongs to no workspace (`Routing not found`).
- On success: stores the message in `inbound_emails`, returns `200 {success:true}` immediately, then in the background links it to a quote, updates the thread, and generates an AI draft if AI is enabled.

### `POST /api/send-quote`
Sends a quote email. Body: `to`, `cc`, `bcc`, `subject`, `message`, `attachments`, `agentEmail`, `agentId`, `senderPreference`, `tenantId`, `companyName`, `customSender`. Returns `{success}`; `400` if `to`, `subject` or `message` is missing.

### `POST /api/send-email`
General outbound email via Resend.

### `GET /api/inbox`
Lists inbound email for a workspace (query parameters select the tenant and filters).

### `POST /api/inbox/reply`
Replies to an inbox email from the workspace address. Logs the sent email and usage.

### `POST /api/inbox/update`
Body: `{ emailId, updates, tenantId }`. Updates flags such as read, starred, deleted.

### `POST /api/inbox/auto-pilot`
Body: `{ tenantId, threadId, isAutoPilot }`. Stores per-thread auto-pilot state.

## AI

### `POST /api/ai/analyze-email`
Body: `{ email, blueprint, agent, companyName }` where `email` has `tenant_id`, `sender_email`, `subject`, `body_text`.
Returns `{ data: { summary, lead_gen_quote, auto_reply, … } }`, grounded in Master Data. Token usage is logged.

### `POST /api/quote-from-email`
Body: `{ tenantId, emailId?, analysis: { lead_gen_quote, summary }, agentEmail? }`.
Creates the client, quote (status `Inquiry`), line items, thread and status log. Returns `{ success, quoteId, qn_number, itemCount }`. `400` if `tenantId` or `analysis.lead_gen_quote` is missing.

### `POST /api/ai-auto-reply`
Body: `{ threadId, tenantId }`. Generates a draft reply for the thread (never sends).

### `POST /api/ask-ai`
Body: `{ query, data, context, tenantId, userId }`. Powers Bloomgard AI chat and chart intents.

## Follow-ups and agents

### `POST /api/agent-coordinator`
Body: `{ tenantId }`. Finds quotes assigned to autonomous agents that are due, ranks agents by importance, and dispatches follow-ups.

### `POST /api/trigger-agent`
Body: `{ quoteId, tenantId, agentEmail, agentId, customMessage }`. Triggers a follow-up for one quote.

### `POST /api/agent/reply`
Body: `{ threadId, quoteId, tenantId, agentId, message }`. Sends an agent's reply on a thread.

## Master Data

### `POST /api/master-data`
Body: `{ action, payload }`. Actions: `createMasterKey`, `addValueOption`, `editValueOption`, `editMasterKeyName`, `updateAIDescription`, `toggleAutoExtractable`, `deleteValueOption`, `deleteMasterKey`, `bulkAddValues`, `bulkImport`.

`bulkImport` payload: `{ tenant_id, tab_type: "manual", columns: [{ key_name }], rows: [[...]] }` builds the parent → child chain from left to right.

## Users

### `POST /api/create-user`
Body: `{ email, password, role, tenantId }`. Creates an auth user and profile (`agent`, `manager` or `admin`).

### `POST /api/reset-password`
Body: `{ userId, tenantId, requesterId }`. The requester must be an Admin or Manager in the same workspace.

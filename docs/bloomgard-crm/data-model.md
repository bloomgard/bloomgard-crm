---
title: Data model
description: The main tables and how they relate.
order: 14
section: Developers
---

# Data model

The database is Postgres (Supabase). Every operational table carries a `tenant_id` and is
protected by row-level security.

| Table | Purpose |
|---|---|
| `tenants` | A workspace: company name, `custom_email_sender`, `inbound_routing_id` / `routing_slug`, `ai_enabled`, feature flags, billing formula. |
| `profiles` | A user: role (`agent`, `manager`, `admin`, `super_admin`), `full_name`, `job_title`, `phone`, `signature`, personal `inbound_email`. |
| `clients` | Customers: company name, contact person, `email_id`, phone, billing address, `source_ref`. |
| `quotations` | A quote: `qn_number`, status, `client_id`, `created_by_email`, dates, `follow_up_due_date`, `last_contact_date`, `custom_metadata` (form values, agent conversation, source email). |
| `quotation_items` | Line items: code, name, quantity, unit, rate, display order. |
| `status_logs` | Audit trail of status changes and system events per quote. |
| `inbound_emails` | Every received message: sender, subject, text/html body, read/starred/deleted flags, thread id. |
| `email_threads` | The triage state of a quote's conversation: `triage_status` (`incoming` / `outgoing`), `ai_draft_text`, assigned agent. |
| `thread_states` | Per-thread flags such as auto-pilot. |
| `sent_emails` | Log of outbound email, used for usage metering. |
| `master_data_entries` | Catalogue **keys** (columns), their parent key, and an AI description. |
| `master_data_values` | Catalogue **values**; `parent_value_id` links a child value to its parent value. |
| `tenant_schemas` | Per-workspace configuration JSON: the quote form blueprint, AI settings, follow-up agents. |
| `tenant_token_usage` | AI token usage per tenant, user and feature. |
| `usage_metrics` | Monthly quotes, emails and tokens, for billing. |

## Quote numbers

`QN-YYYY-NNN`, where `NNN` is one more than the highest existing number in the workspace.
Revisions use a `-Rev-N` suffix.

## Email routing columns

`profiles.inbound_email` (personal address) takes priority over `tenants.inbound_routing_id`
and `tenants.routing_slug` (workspace addresses) when a message arrives.

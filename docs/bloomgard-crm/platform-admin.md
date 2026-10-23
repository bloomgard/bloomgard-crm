---
title: Platform admin (Boss portal)
description: Provisioning workspaces, feature toggles and usage-based billing.
order: 12
section: Administration
---

# Platform admin (Boss portal)

The **Boss portal** (`/boss/login`) is for Bloomgard operators, not for client users. It
requires a platform administrator account.

## What operators can do

- **New Workspace**: provision a tenant and its first admin (workspace name, admin email and password).
- **Select a workspace** from the sidebar to administer it.
- **Feature toggles**: enable or disable features per workspace (for example AI email, analytics) and mark each as **Billable**.
- **Usage metrics**: **Quotes Generated**, **Emails Sent**, **AI Tokens Used**.
- **Dynamic billing formula**: write a math expression using `quotes`, `tokens`, `emails` and `base_fee`; the portal evaluates it against the workspace's usage to produce the bill. The default is `(quotes * 0.5) + (tokens * 0.001) + (emails * 0.1) + 50`.
- **Sync Master**: save the workspace's changes (toggles and billing formula).
- **Terminate Workspace**: remove a workspace.

## Isolation

Each workspace's data is isolated by tenant id using database row-level security: users
only ever see their own workspace. Server-side routes use a service key and always scope
queries by tenant.

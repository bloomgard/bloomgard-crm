---
title: Platform admin (Boss portal)
description: Provisioning workspaces, feature toggles and usage-based billing.
order: 12
section: Administration
---

# Platform administration

The separate Boss portal has been retired. Everything a workspace needs is now managed from inside it:

- **New workspaces** are created by signing up (*Create account*); the person signing up becomes the admin.
- **Users** are added by Admins and Managers in Settings → User Access, or by asking Bloomgard AI. Passwords are
  generated and shown once. Only an Admin can create another Admin.
- **The quote form** (modules, fields, log modules) is edited in the Field Configurator or by asking Bloomgard AI.

## Isolation

Each workspace's data is isolated by tenant id. Every server action takes the workspace from the signed-in
session, never from the request, and is re-checked against the user's role.

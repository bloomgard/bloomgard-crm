---
title: Settings
description: Every configuration screen in the workspace.
order: 11
section: Configuration
---

# Settings

**Settings** (titled *Workspace Settings*) is a list of screens. Click one to open it, and
use back to return to the list. Some screens are for Managers/Admins only.

| Screen | For | Purpose |
|---|---|---|
| Your Profile | Everyone | Identity the AI signs with. |
| Master Data | Managers/Admins | The [product catalogue](./master-data.md). |
| User Access | Managers/Admins | Add users, set roles, reset passwords. |
| Field Configurator | Managers/Admins | Design the quote form. |
| Email Settings | Everyone | Personal and workspace email addresses; forwarding. |
| Personalization | Everyone | Theme and wallpaper. |
| AI Settings | Managers/Admins | Tone and instructions ([AI](./ai-assistant.md)). |
| Quote Template | Managers/Admins | The PDF layout. |

## Your Profile

Full name, job title and phone, plus an optional **Email Sign-Off**. These are what
the AI uses to sign emails "as you" and they are saved to your profile.

## User Access

- **Onboard User**: enter an email and password and pick a role: **Agent**, **Manager** or **Admin**. The user can sign in immediately.
- Change a user's role from the list.
- **Reset password** (Managers/Admins only, within the same workspace) generates a new password you can **Copy Password** and share securely.
- **Revoke** removes a user's access.

## Field Configurator

Design the quote form without code. Define **sections** (such as *Client Information*,
*Products*) and **fields** with a label, a database key (`db_key`) and a type:
**Text, Number, Dropdown, Paragraph (long text), Attachment, Formula**. Fields can pull their
values from [Master Data](./master-data.md). **Save Blueprint Schema** applies your design to
the new-quote form.

## Email Settings

Your personal email, your unique forwarding address, and the common workspace email. See
[Email setup](./email-setup.md).

## Personalization

**UI & Personalization**: Light or Dark mode, Legacy UI (solid background) or glass UI,
and a **Workspace Wallpaper** (several built-in options) plus **Brand Identity**: **Company Name**
and **Company Logo URL**.

## AI Settings

See [AI replies and settings](./ai-assistant.md#ai-settings-managersadmins).

## Quote Template

The **Quotation Template Editor** lets you paste your own HTML for the quote PDF, with an
**A4 Live Preview** that renders as you type (**Live Document Engine**). Insert quote values with `{{field_name}}` placeholders (the field's name from the
[Field Configurator](#field-configurator)); `{{company_logo}}` inserts your company logo.
Placeholders are replaced when a PDF is generated.

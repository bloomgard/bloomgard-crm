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
| Personalization | Everyone | Light or dark theme. |
| AI Settings | Managers/Admins | Tone and instructions ([AI](./ai-assistant.md)). |
| Quote Template | Managers/Admins | The PDF layout. |

## Your Profile

Full name, job title and phone, plus an optional **Email Sign-Off**. These are what
the AI uses to sign emails "as you" and they are saved to your profile.

## User Access

- **Add someone**: enter their email, optionally their name, and pick a role: **Agent**, **Manager** or **Admin**.
  Leave the password empty and a strong one is generated. It is shown **once**, on the screen, for you to copy and
  share privately. Only an Admin can add another Admin.
- **People** lists everyone with their role, which you can change inline, and their forwarding address.
- **Reset password** generates a new one, shown once in the same way.
- **Remove** takes someone out of the workspace.

You can also ask Bloomgard AI, for example "add priya@acme.com as a manager"; the password appears on the
confirmation card.

## Field Configurator

Design the quote form without code. The form is made of **modules** (sections such as *Client Information*,
*Products*). Each module has fields with a **label**, a **key** (filled in from the label automatically) and a **type**:
**Text, Paragraph, Number, Date, Dropdown, Master Status, Attachment, Formula, Logged In User**.

- **Multiple rows** turns a module into a table, like Products.
- **Log?** turns a module into a timeline kept on each quote (see below).
- Drag the handles to reorder modules and fields. Problems such as duplicate keys or a dropdown without options are
  shown before you save, and the save bar stays at the top of the screen. Saving changes only the form: AI settings,
  follow-up agents and branding are kept.
- **Add module** offers templates: a blank module, a **Status log**, an **Action log** and a **Remark log**.

### Master Status

A dropdown whose options are your pipeline stages (for example *Inquiry, Quotation Given, PO Received, Lost*).
Whatever it is set to **becomes the quote's status**, the one Quotes, Follow ups, the Home stats and the AI all use.
Changing it records a line in the quote's status history. Keep one in the quote form. A Status log module can hold one
too, so every logged entry moves the status.

### Log modules

A module with **Log?** turned on is not filled in the quote form. Each quote keeps a list of entries instead, and every
entry records **who** added it and **when** automatically. Typical logs:

| Log | Fields | Use |
|---|---|---|
| Status log | Status (Master Status), Remark | Every entry moves the quote's status. |
| Action log | Action, Outcome, Next step, Follow-up on | Calls, visits, samples, meetings. |
| Remark log | Category, Remark | Free notes. |

Open a quote to see each log as a table (newest first), filter it by any dropdown, and use **Add entry**. You can
also ask Bloomgard AI, for example "log a call on QN-2026-014, positive, sending samples"; it prepares the entry for
your OK. On [Home](../ai/ai-home/), the **Logs** stat counts entries: pick a module in the big dropdown, then narrow it
with a small dropdown for each of its dropdown fields, who logged it, and a period.

## Email Settings

Your personal email, your unique forwarding address, and the common workspace email. See
[Email setup](./email-setup.md).

## Personalization

**UI & Personalization**: choose **Light Mode** (Kora, warm paper) or **Dark Mode** (Raat, deep blue).

## AI Settings

See [AI replies and settings](./ai-assistant.md#ai-settings-managersadmins).

## Quote Template

Set your **Company Logo URL** (available in the template as `{{company_logo}}`), then edit the HTML your quote
PDFs are built from. The **A4 Live Preview** renders as you type.

### Starter templates

**Start from a template** offers four ready-made layouts: **Classic** (logo, address block, clean item table),
**Minimal** (typographic and quiet), **GST (India)** (HSN and GST columns for a tax-style quotation) and
**Editorial** (serif headings with a vermilion rule).

They are a choice, never applied for you:

- **Preview** opens a full-size view without touching anything.
- **Use this** loads it into the editor. Your saved template is unchanged until you press **Save Template & Logo**.
- If the editor already has work in it, you are asked before it is replaced, and **Put my own template back**
  restores what was there.

### Placeholders

Insert quote values with the field keys from the [Field Configurator](#field-configurator), for example
`{{client_name}}`, `{{qn_number}}`, `{{date}}` and `{{subtotal}}`. Line items repeat inside
`{{#each quotation_items}} … {{/each}}`, where `{{item_code}}`, `{{item_name}}`, `{{quantity}}`, `{{uom}}`,
`{{item_rate}}` and `{{item_br}}` are available.

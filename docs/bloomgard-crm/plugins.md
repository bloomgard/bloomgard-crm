---
title: Plugins
description: Webhook, Slack, an inbound API for your website, and an accounting export.
order: 30
section: Automation & teamwork
---

# Plugins


**Settings → Plugins** connects Bloomgard to the rest of your tools. Managers and admins switch
them on; everyone can see what is connected.

| Plugin | What it does |
|---|---|
| **Webhook** | Sends each chosen event as JSON to your own system: an ERP, a script, Zapier or Make. |
| **Slack** | Posts a one-line note to a channel when a quote is created or changes status. |
| **Inbound API** | Lets your website enquiry form or another system create quotes here. |
| **Accounting export** | Approved quotes, line by line, as CSV for Tally, Zoho Books or a spreadsheet. |
| **WhatsApp**, **Calls** | Listed, but need your own WhatsApp Business (Meta-verified, via Gupshup or WATI) and Bland AI accounts before they can be switched on. |

## Webhook

Enter an https address and pick the events. Each request carries `X-Bloomgard-Event` and
`X-Bloomgard-Signature: sha256=…`, an HMAC of the raw body with your signing secret (shown once,
then as its last four characters). **Test** sends a sample and shows the response.

## Inbound API

**Generate token** shows a private token once. Send enquiries to `/api/public/quotes`:

```bash
curl -X POST https://cma.bloomgard.co/api/public/quotes \
  -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"client_name":"Vardhman Textiles","client_email":"rohit@example.com","items":[{"item_code":"CP-6060","quantity":2000}]}'
```

The quote is created as an Inquiry, its items matched to your catalogue, and your automations hear
about it. **Rotate** replaces the token; the old one stops working at once.

## Accounting export

Pick a date range and **Download**: one line per item of every approved quote.

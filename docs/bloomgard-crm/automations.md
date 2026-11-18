---
title: Automations
description: Rules that act on quotes by themselves, with every run on record.
order: 20
section: Automation & teamwork
---

# Automations


**Studio → Automations** (also reachable from Settings → Automations) holds rules of the form *when something happens, if these conditions
hold, do these steps*. Managers and admins create and change them; everyone can see them.

## Start from a ready-made one

| Automation | What it does |
|---|---|
| Chase quiet quotes | After 7 quiet days, drafts an AI follow-up for the owner to approve. |
| Approved → raise the PO | Gives the owner a task to raise the PO or invoice, and tells managers. |
| Big quote check | A quote over ₹5,00,000 needs a manager's OK. |
| New enquiry | A client email that matches no quote becomes a task. |
| Lost → ask why | Asks the owner to note why the quote was lost. |
| Follow-up due | Tells the owner when a follow-up date arrives. |
| Daily digest | Every morning, a summary for managers. |

## When

A quote is created · its status moves (optionally from or to a stage) · it has been quiet for N
days · its follow-up date is reached · a log entry is added · a client email arrives · someone adds
a team note · every morning · only when run by hand.

## Only if

Conditions on the status, amount, client, owner, days quiet, quote number, or any field of your
[quote form](./settings.md) (for example *Quote Details › Payment Terms*).

## Then

Change the status · add a log entry · create a task · notify people · send an email · draft an AI
follow-up · hand the quote to someone · post to Slack · call a webhook · add a team note.

Text can use `{{client}}`, `{{contact}}`, `{{qn}}`, `{{amount}}`, `{{status}}`, `{{days_quiet}}`
and `{{owner}}`.

## The promises

- **Nothing reaches a client without an OK.** *Send an email* and *AI follow-up* always go to the
  [OK list](./ok-list.md). Other steps can be set to wait there too.
- **Try before you trust it.** **Dry run** shows which quotes match today and what each step
  would do, and changes nothing.
- **No loops.** A rule never runs twice in one chain of events, and a chain stops after three hops.
- **Every run is recorded**, step by step, under **Recent runs**.

Time-based rules (quiet, due, every morning) run once a day at 09:00 IST.

You can also describe one to Bloomgard AI ("when a quote over 5 lakh is created, ask a manager to
check the price"); it drafts it in [Studio](./studio.md) for you to apply.

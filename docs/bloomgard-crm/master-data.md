---
title: Master Data (product catalogue)
description: The Excel-style catalogue that feeds quotes and AI replies.
order: 4
section: Sales
---

# Master Data

Master Data is your workspace's source of truth for products, units, prices and any
other list your quotes draw from. It is used in three places:

1. the **quote form** (suggestions and auto-fill),
2. **quote-from-email** (matching what a client asked for to real catalogue rows),
3. **AI replies and analysis** (so the model quotes real codes and rates instead of guessing).

Open it from **Settings → Master Data**.

## The grid

Master Data is shown as an Excel-style grid. Each **column** is a *key* (for example
`item_code`, `item_name`, `uom`, `item_rate`) and each row is one catalogue entry.

- **Type to add a row.** Typing in the empty bottom row creates it. Cells fill left to right.
- **Edit in place.** Click a cell to change it.
- **Delete.** Deleting a value removes it and its linked children.

## Linked columns: parent → child

Columns can be linked in a chain, for example **item code → item name → unit → rate**.
Each value in a child column belongs to one value in its parent column. This is what lets
one choice fill the rest on a quote, and it correctly handles repeated values (for example
"PCS" can exist under many items; the one that belongs to *your* item is the one used).

Values are identified by their position in the chain, not by their text alone, so identical
text under different parents stays distinct.

## Importing from Excel

Use **Import** and upload an `.xlsx` sheet.

1. Columns are **auto-matched** to existing keys by name; unmatched columns become new keys.
2. You can **ignore** a column you do not want.
3. The chain is built left to right, so the first matched column becomes the parent of the next.
4. Existing rows are updated, new ones are added.

## Tips

- Put the most unique identifier (item code) first; it becomes the root of the chain.
- Keep units and rates in their own columns so quotes and AI replies can read them exactly.
- Add an **AI description** to a key to tell the AI what it means (for example "rate in INR, excluding GST").

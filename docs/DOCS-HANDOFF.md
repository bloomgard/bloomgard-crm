# Handoff: CMA docs in the Bloomgard Docs project

Written for whoever picks up `/Users/anshagarwal/Bloomgard/Docs` next.

## What was done

`content/crm/**` in the Docs project was regenerated from the canonical source in this repo,
`docs/bloomgard-crm/*.md`, and `content/products.json` now calls the product **Bloomgard CMA**
(slug and URLs stay `/crm`, so nothing links rot). `npm run check:content` reports 28 pages,
0 errors; `npm run build` passes.

New or rewritten pages:

| Page | Covers |
|---|---|
| `ai/ai-home.mdx` (new) | The Home command centre: stats strip, **Status & logs**, briefing pills, suggestions drop-up, exports |
| `email/email-setup.mdx` | Company email domain: DNS records, live checks, Cloudflare one-click, sender, routing address, branded replies |
| `configuration/settings.mdx` | Field Configurator, **Master Status**, log modules, starter quote templates, rebuilt User Access |
| `administration/platform-admin.mdx` | Boss portal retired; everything is managed inside the workspace |
| `getting-started.mdx` | Create account (organisation-only sign-up), roles, the seven sidebar views |
| `index.mdx`, `sales/quotes.mdx`, `ai/*`, `help/*` | Refreshed to match |

## How to keep them in step

The canonical copy lives in **this** repo at `docs/bloomgard-crm/*.md` (plain Markdown, with
`title` / `description` / `order` frontmatter). The Docs project holds the MDX rendering of the
same content. When the product changes:

1. Edit the Markdown here first.
2. Port it across. Links convert from `./settings.md#log-modules` to `/crm/configuration/settings#log-modules`,
   and any `{{handlebars}}` placeholder must be wrapped in backticks or MDX will read it as an expression.
   A YAML `title:` containing a colon must be quoted.
3. In the Docs project run `npm run check:content` and `npm run build`.

## Still worth doing

- **Screenshots.** Every page is text only. `public/media/crm/` is the place for them, and the authoring
  guide documents the screenshot component.
- **"Open CRM" button.** If the docs chrome still labels the app link "CRM", it should read "CMA".
  I did not find it in `content/` or `src/`; it may be in the site shell or `site.json`.
- **A page for log modules** of its own, if the Field Configurator section grows further.

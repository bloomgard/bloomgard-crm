# Bloomgard CMA docs (for docs.bloomgard.co)

Plain Markdown, one page per file, each with YAML frontmatter:

```yaml
title:       page title
description: one-line summary (meta description / search snippet)
order:       sort order within the whole set
section:     sidebar group
```

`docs.json` lists the sidebar sections and the page order. Internal links are relative
(`./quotes.md`, `./settings.md#field-configurator`); if your docs site routes without the
`.md` extension, strip it with a link-rewrite step. No images or custom components are used,
so the files render in any Markdown pipeline (Docusaurus, Nextra, MkDocs, Mintlify, Astro Starlight, etc.).

To add them: copy this folder into the docs project's content directory.

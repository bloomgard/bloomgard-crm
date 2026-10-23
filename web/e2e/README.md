# End-to-end tests & feature walkthrough (Playwright)

Playwright is installed as a dev dependency. Chromium is already downloaded
(`npx playwright install chromium` if you move machines).

## One-time setup

Add test credentials to `web/.env.local` (a **Sales Manager** account shows every
settings screen):

```
E2E_EMAIL=you@yourcompany.com
E2E_PASSWORD=your-password
```

Optional:

| var | purpose |
|---|---|
| `E2E_BASE_URL` | Test a deployed URL instead of localhost. When unset, Playwright runs `npm run dev` for you. |
| `VERCEL_PROTECTION_BYPASS` | Bypass token, sent as a header, when `E2E_BASE_URL` points at a protected Vercel preview. |
| `E2E_SLOWMO` | ms of delay between actions, e.g. `250`, for calmer screen-recording videos. |

## Run

```bash
cd web
npx playwright test walkthrough           # the 9-scene walkthrough
npx playwright test                        # everything
npx playwright test --headed               # watch it run
E2E_SLOWMO=250 npx playwright test walkthrough
npx playwright show-report                 # HTML report after a run
```

## Videos

Every test records to `test-results/<scene>/video.webm`. That's the
screen-recording deliverable — drop the on-screen caption text and voiceover
from `docs`/the client walkthrough over each clip.

## Safety

The `walkthrough` spec is read-only: it never sends an email or creates a
quote. The two mutating actions (`Save Profile`, `Create Quote Now`) are left
commented with a `NOTE` in `walkthrough.spec.ts` — only enable them against a
throwaway workspace.

## Files

- `playwright.config.ts` — config (video on, single worker, local dev server)
- `e2e/auth.setup.ts` — logs in once, saves the session to `e2e/.auth/user.json`
- `e2e/walkthrough.spec.ts` — one test per feature scene


## Test suites

| command | what it covers |
|---|---|
| `npm run e2e:api` | Email routing/receiving/sending, Master Data API, quote-from-email, AI endpoints, real Resend chain. No browser. |
| `npm run e2e:ui` | Landing, auth, workspace, settings, Master Data grid + Excel import, quote form cascade, inbox, follow-ups, inbox AI actions. |
| `npm run e2e` | Both of the above. Demo videos (`--project=demo`) are separate. |

Secrets (`RESEND_API_KEY`, `OPENROUTER_API_KEY`, Supabase keys, `E2E_*`) are read from the gitignored `web/.env.local`; never put them in code.
AI tests need a valid `OPENROUTER_API_KEY`; the preflight spec fails fast if it is not. Test emails go to `delivered@resend.dev` and all fixtures are removed afterwards.

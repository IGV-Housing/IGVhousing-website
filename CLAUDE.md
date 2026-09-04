# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

igvhousing.com — a static, self-contained HTML site. No build step, no bundler, no `package.json`; files are served exactly as authored. Deployed as a Cloudflare Worker (`igvhousing-website`), plus a separate Worker for contact-form verification. See `README.md` for the repo layout.

## Commands

- **Local preview**: `npx serve public -l 4173` (there's a `.claude/launch.json` config named `static-preview` that wraps this for the Browser pane's `preview_start`)
- **No install/build/lint/test step exists** — there is nothing to run beyond serving the static files
- **Deploy the contact-verify worker**: from `workers/igvhousing-contact-verify/`, `wrangler deploy` (the reCAPTCHA secret is set once via `wrangler secret put RECAPTCHA_SECRET_IGVHOUSING`, not committed)
- **The `igvhousing-website` Worker** (serves `public/`) deploys as a Worker-with-static-assets, defined by the root `wrangler.jsonc` (`assets.directory` points at `public`) — if you change the repo's structure (e.g. move `public/`), update that path too. Cloudflare's build runs `npx wrangler versions upload` on push; without this file at the repo root, that command fails with "Missing entry-point to Worker script or to assets directory".

## Architecture

**Every page is a fully self-contained HTML file** — `public/<slug>/index.html` (or `public/index.html` for home) — with its own inline `<style>` and `<script>`. There is no shared CSS/JS file and no template/include system. The header nav, mega dropdown menus, footer, and the full design-token `:root` block are copy-pasted independently into all 10 pages (`/`, `/about/`, `/accessibility/`, `/careers/`, `/contact/`, `/esg/`, `/media/`, `/municipalities/`, `/privacy/`, `/terms/`).

The practical consequence: a fix to the nav, footer, or a design token has to be applied to every page's HTML file individually — there is nowhere to make the change once. Pages have drifted from each other over time (stale links, old branding copy, missing accessibility attributes). When editing shared chrome, treat `public/about/index.html`'s header/footer as the canonical, up-to-date reference and diff other pages against it rather than assuming any given page is current.

Design tokens (CSS custom properties on `:root`, redeclared per page): `--evergreen` (dark teal-green, primary brand color), `--cream` (off-white), `--coral` (orange accent), `--ink`, `--line`. Body font is Montserrat; serif accents use Bitter; both loaded per-page via a Google Fonts `<link>` with `display=optional` — that value is intentional (it fixes a CLS regression caused by the nav reflowing when the font swapped in late), so it can silently fall back to a system font on an uncached first load; that's an accepted trade-off, not a bug.

Google Analytics (GA4, measurement ID `G-ZQCZQ9ZGE8`) is wired in via a `gtag.js` snippet duplicated at the top of every page's `<head>` — same caveat as the fonts link: it has to be copied into any new page, and isn't recoverable by looking at a shared file if it's ever missing from one.

Asset references are root-absolute (`/assets/img/...`, `/assets/docs/...`), never relative, since pages live at `/slug/` paths rather than as flat files. Page slugs under `public/` match the nav links used across the site and intentionally differ from their original working-folder names (e.g. `/accessibility/` was `accessibility-statement`, `/media/` was `media-resources`) — don't rename them back.

### Known cross-page issues to watch for

- Some pages still carry pre-restructure chrome: relative `.html` links (`about.html`), in-page `#anchor` links to sections that no longer exist (`#investors`, `#media`, `#municipalities`), and old-caps division branding ("IGV Housing" / "IGV Build Systems" / "IGV HOPE" / "IGV Capital" instead of the current `IGVhousing` / `IGVbuild systems` / `IGVhope` / `IGVcapital`, each with a `brand-name` class). These are stale leftovers, not intentional variation — fix them to match `about/index.html` when found.
- The footer's ENQUIRIES column should read a single "Contact The Team" link to `/contact/` (this was a deliberate simplification away from separate Investors/Developer Partners/Press links).

### Contact form flow

`public/contact/index.html`'s form posts to the `igvhousing-contact-verify` Worker (`workers/igvhousing-contact-verify/worker.js`), which verifies a reCAPTCHA v3 token server-side (score threshold `0.5`, expected action `contact`), then forwards the submission to a hardcoded HubSpot form (portal `342997618`) via the HubSpot Forms API. CORS is locked to `https://www.igvhousing.com` and `https://igvhousing.com`. A honeypot field (`company_website`) silently no-ops on submission instead of erroring, so bots aren't tipped off.

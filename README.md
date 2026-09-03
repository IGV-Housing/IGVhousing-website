# IGV Housing — igvhousing.com

Static site (self-contained HTML) served by a Cloudflare Worker
(`igvhousing-website`), with a separate Worker for contact-form
verification.

No build step, no bundler — files are served as authored.

---

## Repository layout

```
igvhousing/
├── public/                     ← web root
│   ├── index.html
│   ├── about/index.html
│   ├── accessibility/index.html
│   ├── careers/index.html
│   ├── contact/index.html
│   ├── esg/index.html
│   ├── media/index.html
│   ├── municipalities/index.html
│   ├── privacy/index.html
│   ├── terms/index.html
│   ├── robots.txt
│   ├── sitemap.xml
│   └── assets/
│       └── img/
├── workers/
│   └── igvhousing-contact-verify/
├── .gitignore
└── README.md
```

All asset references are root-absolute (`/assets/img/logo.svg`), never
relative. Page slugs under `public/` match the nav links used across the
site (`/accessibility/`, `/media/`, `/municipalities/`, `/privacy/`) —
these differ from their original working-folder names
(`accessibility-statement`, `media-resources`, `municipality`,
`privacy-policy`), so don't rename them back.

The `igvhousing-website` Worker's build/deploy settings (build output
directory, etc.) are configured in the Cloudflare dashboard rather than a
committed `wrangler.toml` — confirm the **Build output directory** is set
to `public` after any structural change like this one.

---

## Crawling / AI indexing

`robots.txt` allows all crawlers, with explicit entries for known AI
crawlers (GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web,
anthropic-ai, Google-Extended, PerplexityBot, CCBot, Bingbot) so the site
can be crawled and cited by AI search/assistants as well as ranked by
regular search engines. `sitemap.xml` lists the site's indexable pages.
If Cloudflare's AI Crawl Control is enabled on this zone, check it isn't
injecting conflicting `Disallow` rules for the same bots ahead of this
file's `Allow` rules — that happened on igvhope.com and needed a
dashboard change, not a repo change.

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

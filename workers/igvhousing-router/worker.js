/**
 * igvhousing-router
 * ---------------------------------------------------------------------------
 * Path-based router that fronts every IGV Housing Cloudflare Pages project
 * behind the single canonical hostname www.igvhousing.com.
 *
 *   igvhousing.com/*     -> 301 -> www.igvhousing.com/*   (apex to www)
 *   www.igvhousing.com/       -> igvhousing.pages.dev
 *   www.igvhousing.com/about  -> igvhousing-about.pages.dev
 *   ...and so on, see ROUTES below.
 *
 * Section pages are served under a trailing slash (/about/) so that any
 * relative asset the page requests (images/foo.jpg) resolves inside its own
 * prefix (/about/images/foo.jpg) and is proxied back to the correct Pages
 * project. Without that, every section would pull assets from the root
 * project and 404. See ENFORCE_TRAILING_SLASH.
 */

const CANONICAL_HOST = 'www.igvhousing.com';

/** First path segment -> Pages origin. '' is the site root. */
const ROUTES = {
  '': 'https://igvhousing.pages.dev',
  'about': 'https://igvhousing-about.pages.dev',
  'privacy': 'https://igvhousing-privacy.pages.dev',
  'accessibility': 'https://igvhousing-accessibility.pages.dev',
  'contact': 'https://igvhousing-contact.pages.dev',
  'esg': 'https://igvhousing-esg.pages.dev',
  'media': 'https://igvhousing-media.pages.dev',
  'terms': 'https://igvhousing-terms.pages.dev',
  'municipalities': 'https://igvhousing-municipality.pages.dev',
  'careers': 'https://igvhousing-careers.pages.dev',
};

/**
 * Legacy .html filenames still hardcoded in the page markup, mapped to their
 * clean router paths. Used for redirects (so old links keep working) and,
 * when REWRITE_LEGACY_LINKS is on, for rewriting hrefs in flight.
 */
const LEGACY_PATHS = {
  '/index.html': '/',
  '/about.html': '/about/',
  '/privacy.html': '/privacy/',
  '/accessibility.html': '/accessibility/',
  '/contact.html': '/contact/',
  '/esg-impact.html': '/esg/',
  '/esg.html': '/esg/',
  '/media.html': '/media/',
  '/terms.html': '/terms/',
  '/municipalities.html': '/municipalities/',
  '/careers.html': '/careers/',
};

/* --------------------------------- flags --------------------------------- */

// Canonicalise the hostname inside the Worker (301 apex -> www).
//
// Set this to FALSE if apex -> www is already handled upstream by a Cloudflare
// Redirect Rule, Bulk Redirect, or Page Rule. Those all run BEFORE Workers in
// the request pipeline, so apex traffic never reaches this code and the check
// below is dead weight.
//
// If you set this false, also remove the "igvhousing.com/*" route from
// wrangler.toml. Otherwise, should the upstream rule ever be disabled, apex
// requests would fall through and be served directly on igvhousing.com,
// producing a duplicate of the whole site on the wrong hostname.
const CANONICALIZE_HOST = true;

// Send /about to /about/ so relative assets resolve within the section prefix.
// Leave this ON unless every page is switched to root-absolute asset paths.
const ENFORCE_TRAILING_SLASH = true;

// Rewrite legacy "privacy.html" style hrefs to "/privacy/" in the HTML as it
// passes through. This is a safety net so the nav and footer work before the
// source files are updated. Turn OFF once the markup uses clean paths.
const REWRITE_LEGACY_LINKS = true;

// Pages projects are reachable at their own *.pages.dev hostnames. Strip any
// noindex the origin sets, and let the canonical host own indexing instead.
const STRIP_ORIGIN_NOINDEX = true;

/* -------------------------------- helpers -------------------------------- */

function redirect(url, status = 301) {
  return new Response(null, { status, headers: { Location: url, 'Cache-Control': 'no-cache' } });
}

/** Resolve a request pathname to { origin, path } on the upstream Pages project. */
function resolveTarget(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] || '';

  if (first !== '' && Object.prototype.hasOwnProperty.call(ROUTES, first)) {
    // /about/images/x.jpg -> origin igvhousing-about, path /images/x.jpg
    const rest = '/' + segments.slice(1).join('/');
    return {
      origin: ROUTES[first],
      path: rest === '/' ? '/' : rest + (pathname.endsWith('/') && rest !== '/' ? '/' : ''),
      section: first,
    };
  }

  // Everything else (including root assets) goes to the root project as-is.
  return { origin: ROUTES[''], path: pathname, section: '' };
}

/** Rewrite an upstream redirect back onto the canonical host. */
function rewriteLocation(location, section, requestUrl) {
  if (!location) return null;
  let abs;
  try {
    abs = new URL(location, requestUrl);
  } catch {
    return null;
  }

  const isUpstream = Object.values(ROUTES).some((o) => abs.origin === o);
  if (!isUpstream && abs.origin !== requestUrl.origin) return location; // external, leave alone

  const prefix = section ? `/${section}` : '';
  const path = abs.pathname === '/' && prefix ? `${prefix}/` : `${prefix}${abs.pathname}`;
  return `https://${CANONICAL_HOST}${path}${abs.search}${abs.hash}`;
}

/** HTMLRewriter handler that maps legacy .html hrefs onto clean router paths. */
class LegacyLinkRewriter {
  element(el) {
    const attr = el.hasAttribute('href') ? 'href' : 'src';
    const value = el.getAttribute(attr);
    if (!value) return;

    // Only touch same-site relative links, never absolute URLs or anchors.
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(value)) return;

    const clean = value.split(/[?#]/)[0];
    const key = clean.startsWith('/') ? clean : `/${clean}`;
    if (Object.prototype.hasOwnProperty.call(LEGACY_PATHS, key)) {
      const suffix = value.slice(clean.length); // keep ?query / #hash
      el.setAttribute(attr, LEGACY_PATHS[key] + suffix);
    }
  }
}

/* --------------------------------- worker -------------------------------- */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1. Force the canonical host, unless a Redirect Rule upstream already did.
    if (CANONICALIZE_HOST && url.hostname !== CANONICAL_HOST) {
      return redirect(`https://${CANONICAL_HOST}${url.pathname}${url.search}`);
    }

    // 2. Legacy .html paths -> clean paths, so old links and bookmarks survive.
    const legacy = LEGACY_PATHS[url.pathname.toLowerCase()];
    if (legacy) {
      return redirect(`https://${CANONICAL_HOST}${legacy}${url.search}`);
    }

    // 3. Section root without a trailing slash -> add one, so that relative
    //    assets inside the page resolve under the section prefix.
    if (ENFORCE_TRAILING_SLASH) {
      const segments = url.pathname.split('/').filter(Boolean);
      if (
        segments.length === 1 &&
        Object.prototype.hasOwnProperty.call(ROUTES, segments[0]) &&
        !url.pathname.endsWith('/')
      ) {
        return redirect(`https://${CANONICAL_HOST}/${segments[0]}/${url.search}`);
      }
    }

    // 4. Proxy to the right Pages project.
    const { origin, path, section } = resolveTarget(url.pathname);
    const upstream = new URL(origin);
    upstream.pathname = path;
    upstream.search = url.search;

    const proxied = new Request(upstream.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });

    let response;
    try {
      response = await fetch(proxied);
    } catch (err) {
      return new Response('Upstream request failed.', { status: 502 });
    }

    const headers = new Headers(response.headers);

    // Keep upstream redirects on the canonical host.
    if (response.status >= 300 && response.status < 400) {
      const location = rewriteLocation(headers.get('Location'), section, url);

      // Loop guard: if the rewritten target is the URL we are already serving,
      // sending it back would bounce the browser forever. Resolve it upstream
      // instead and return the final document.
      if (location && new URL(location).toString() === url.toString()) {
        try {
          const followed = await fetch(new Request(upstream.toString(), {
            method: request.method,
            headers: request.headers,
            redirect: 'follow',
          }));
          const followedHeaders = new Headers(followed.headers);
          if (STRIP_ORIGIN_NOINDEX) followedHeaders.delete('X-Robots-Tag');
          return new Response(followed.body, {
            status: followed.status,
            headers: followedHeaders,
          });
        } catch {
          return new Response('Upstream redirect loop.', { status: 508 });
        }
      }

      if (location) headers.set('Location', location);
      return new Response(null, { status: response.status, headers });
    }

    if (STRIP_ORIGIN_NOINDEX) headers.delete('X-Robots-Tag');

    const isHtml = (headers.get('Content-Type') || '').includes('text/html');
    const out = new Response(response.body, { status: response.status, headers });

    if (REWRITE_LEGACY_LINKS && isHtml) {
      return new HTMLRewriter()
        .on('a[href]', new LegacyLinkRewriter())
        .on('link[href]', new LegacyLinkRewriter())
        .transform(out);
    }

    return out;
  },
};

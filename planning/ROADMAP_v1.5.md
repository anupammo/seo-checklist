# SEO Checklist v1.5 Roadmap – Goal: 250 → 500+ users

**Base branch:** `v1.4` (which was branched from `v1.2.9` at `896edc5`)
**Target:** at least 500 weekly users on the Chrome Web Store (CWS) within ~8 weeks of the v1.5 release
**Plan date:** November 2026

---

## 1. Where we stand

| Item | Status in v1.4 | Why it matters for growth |
|---|---|---|
| Users | **222** (CWS listing, Nov 2026) | Need +278 net to reach 500 |
| Rating | **4.3★ from only 6 ratings** | With so few ratings, one bad review drops the average a lot. More reviews is the cheapest way to raise both trust and ranking |
| Publisher | Verified (anupammondal.in), category Developer Tools | Good trust signals already in place |
| Install warning | `host_permissions: http://*/*, https://*/*` + `notifications` → Chrome shows **"Read and change all your data on all websites"** | Biggest install-conversion killer for a tool that claims to be privacy-first |
| Update behavior | Opens a new tab **and** shows a system notification on every update | Users who didn't ask for it often uninstall right away |
| v1.2.9 fixes | v1.2.9 removed notifications and host permissions, but **v1.4 never got those commits** | v1.4 undid the permission cleanup |
| CWS "Featured" badge | Already on the listing (confirmed) | A strong trust signal. Use it in marketing and protect it |
| Listing text | Overview still says **"SEO Checklist v1.3"** | Looks out of date to visitors. Update it with every release |
| Screenshot claim | One screenshot says **"No Permissions Needed"**, but v1.4 asks for access to all websites | The listing doesn't match the install warning. T1 fixes this; otherwise remove that screenshot |
| Media | 1 video + 6 screenshots | Good start; refresh them for v1.5 features |
| Store description | Says *"Featured in 'Top SEO Tools' by Search Engine Land"* | This is a different claim from the CWS badge. If there's no Search Engine Land article to link, replace it with "Featured on the Chrome Web Store" (true and checkable) |
| Feature depth | Good basic on-page checks, social preview, PDF report, tool launcher | Missing several checks that every top competitor has (see §2) |

---

## 2. Competitor research

Numbers come from third-party trackers (ExtScope, review roundups), so treat them as approximate.

| Extension | Users (approx.) | Rating | What it does well | What we can learn |
|---|---|---|---|---|
| **SEO META in 1 CLICK** | 800k–900k | ~4.8 (1,200+ reviews) | One click shows meta, headings, images, links, social tags, and a Tools tab | This is almost exactly our feature set. They win on **clean tabbed layout, copy buttons, and years of reviews**. Some trackers report a "may soon no longer be supported" warning on it; its users are looking for a modern MV3 replacement |
| **Detailed SEO Extension** | 400k–600k | ~4.9 (~230 reviews) | Overview tab (title, desc, canonical, robots, lang, word count), headings tree, schema viewer, hreflang, quick links to robots.txt/sitemap | **Robots / indexability, hreflang, lang, schema viewer, robots.txt + sitemap links.** Simple tabbed UI and fast |
| **SEO Minion** | (Chrome count not found) | high | On-page analysis, broken links, hreflang checker, SERP preview | **SERP snippet preview**, hreflang |
| **Ahrefs SEO Toolbar** | (Chrome count not found) | high | On-page report, broken link checker, **redirect tracer**, SERP country changer | **Redirect chain + HTTP status** |
| **SEOquake** | large (Firefox ~19k) | mixed | SERP overlay, keyword density, page compare | **Keyword density** |
| **MozBar** | large | mixed | Domain/Page Authority (needs Moz account) | Not something we should copy; needs a backend |

**Takeaways**
1. The leaders win on **speed, clean tabs, and one-click copy**, not on having the most checks.
2. Every leader shows **indexability** (robots meta, X-Robots-Tag, canonical target), **hreflang/lang**, and a **schema viewer**. We only check "schema exists" and "canonical exists".
3. None of them do a **clear score + fix list + PDF report** well. That's our edge: we're the "checklist that tells you what to fix", not another raw tag viewer.
4. Our edge: **privacy-first + minimal permissions + modern MV3**. That only works if the install warning matches the claim.

**Positioning for v1.5:** *"The fastest on-page SEO checklist: score, fix list and PDF report in one click. No sign-up, no data collection."*

---

## 3. v1.5 scope

### P0 – Fixes to existing features (do these first)

**Status:** T1–T11 implemented (manifest 1.5). Still to do before release: test on real sites in Chrome, then update the store listing text and screenshots.

| # | Tweak | Detail |
|---|---|---|
| T1 | **Remove broad host permissions + notifications** | Bring the v1.2.9 manifest changes forward. Keep only `activeTab` + `scripting`. Install warning drops from "all your data on all websites" to none at install time |
| T2 | **Bring back broken-link + image-size checks without host permissions** | Run the `fetch(HEAD)` checks **inside the page** with `chrome.scripting.executeScript`. Internal links and same-site images are same-origin, so this works with `activeTab` alone. For external links, add an opt-in "Check external links" button that asks for `optional_host_permissions` at that moment |
| T3 | **Quieter update flow** | Drop the notification. Show a small "What's new in v1.5" banner inside the popup (stored in `chrome.storage.local`). Only open the update page for **major** versions, not every patch |
| T4 | **Fix GA detection** | `meta[name="google-site-verification"]` is a Search Console tag, not Analytics, so it should not count. Replace the loose `innerHTML.includes('gtag')` check with real `gtag/js?id=G-…`, `GTM-…`, and `dataLayer` checks. Report which ID was found |
| T5 | **Pixel-based title/description length** | Google truncates titles at ~580px and descriptions at ~920px (desktop), not at a fixed character count. Measure with canvas `measureText` (Arial 20px / 14px). Keep character counts as a secondary number |
| T6 | **Smarter word-count rule** | "500+ words" is wrong for home, contact and product pages. Change it to a warning only below 300 words, and add an info note ("thin content?") instead of failing |
| T7 | **Word count should ignore scripts/styles/nav** | Leave out `script, style, noscript, nav, footer` text when there's no `<main>`/`<article>` |
| T8 | **Lazy-loaded images** | Read `data-src`, `srcset`, and `currentSrc` too, so lazy images aren't skipped |
| T9 | **Replace `alert()` (6 places)** | Show errors inside the popup instead of browser alerts |
| T10 | **Rename "Test Recent URL"** | Rename it to "Test this page in…" so it's clear what it does |
| T11 | **Store listing cleanup** | Replace "Featured in 'Top SEO Tools' by Search Engine Land" with "Featured on the Chrome Web Store" (unless there's a Search Engine Land article to link) and the vague "Updated for 2026 ranking factors". Fix the README's privacy/permissions text to match the new manifest. Update the upload-ZIP file list (it's missing `background.js`, `popup.css`, `report-print.js`) |

### P1 – New features (pick 5–6 for v1.5, rest for v1.6)

Ordered by impact on reviews and installs:

| # | Feature | Why | Effort |
|---|---|---|---|
| F1 | **Indexability panel** – robots meta, `X-Robots-Tag` header, canonical target (self vs other URL), `noindex`/`nofollow` warnings | #1 thing SEOs check. Detailed SEO's most-used tab | S |
| F2 | **Google SERP snippet preview** (desktop + mobile, pixel-accurate truncation) | Very visual, great for screenshots, and pairs with T5 | S |
| F3 | **Copy buttons + "Copy report as text/Markdown"** | Top-rated tools are loved for one-click copy. Makes it easy to paste into tickets and client emails | S |
| F4 | **Schema viewer** – list JSON-LD/microdata types (Article, Product, FAQ…), flag invalid JSON, link to Rich Results Test | Upgrades our "schema exists" check into something useful | M |
| F5 | **Headings tree view** (indented H1–H6 outline, with skipped levels highlighted) | Builds on the heading-order check we already have | S |
| F6 | **Quick links: robots.txt, sitemap.xml, Google `site:` search, cached/Wayback** | Cheap and used a lot (Detailed SEO has this) | XS |
| F7 | **hreflang + `<html lang>` check** | Expected by international SEOs | S |
| F8 | **Keyword density / top phrases (1–3 words)** + "Is your focus keyword in title/H1/description/URL?" | SEOquake-style. Big for content writers, a large audience | M |
| F9 | **CSV export** (links, images, issues) | Agencies want it | S |
| F10 | **Dark mode + keyboard shortcut** (`Alt+Shift+S` via `commands`) | Small polish that reviewers mention | XS |
| F11 | **Open-in-side-panel mode** (`sidePanel` API) | Lets the panel stay open while you browse. A modern MV3 feature that stands out in screenshots | M |

**Suggested v1.5 cut:** all P0 tweaks + F1, F2, F3, F5, F6, F10. F4, F7, F8, F9 and F11 go to v1.5.x/v1.6.

### P2 – Growth hooks built into the product

| # | Hook | Detail |
|---|---|---|
| G1 | **Review prompt** | After the **3rd successful analysis**, show one small card: "Is SEO Checklist helping? ★ Rate it". Show it once, and once more after 30 days if dismissed. Link to the CWS reviews page. Never block the UI |
| G2 | **Onboarding page on first install** | Uses `onInstalled` with `reason === 'install'`. A 3-step "how to use" page on anupammondal.in with UTM tags |
| G3 | **Uninstall survey** | `chrome.runtime.setUninstallURL()` pointing to a 1-question form, so we learn why people leave |
| G4 | **"Made with SEO Checklist" footer in the PDF report** | Every report sent to a client acts as an ad, with an install link |
| G5 | **Share button** | "Share this tool" copies the CWS link with a short message |

---

## 4. Plan to reach 500 users

The goal needs about **+250 net users** (installs minus uninstalls). Most installs for extensions come from **Chrome Web Store search**, so the listing matters most. Outside channels then add bursts of installs, and reviews help both.

### A. Store listing optimization (week 1, alongside the release)

- **Title (≤ 45 chars, keyword first):** `SEO Checklist – On-Page SEO Checker & Audit`
- **Short description (132 chars):** lead with the main keywords: *"Free on-page SEO checker: meta tags, headings, SERP preview, broken links, schema and PDF reports. No sign-up, no data collected."*
- **Long description:** answer the questions people have before installing: What does it check? Is it free? What permissions does it need? Does it send data? Use real keywords people search for: *seo checker, meta tag checker, seo audit, on-page seo, heading checker, broken link checker, schema checker, serp preview*. No keyword lists, no fake badges.
- **Update the overview text** (it still says v1.3) and drop or fix the "No Permissions Needed" screenshot until T1 ships.
- **5 screenshots at 1280×800** with a caption on each: (1) score + checklist, (2) SERP preview, (3) indexability, (4) PDF report, (5) links/images panel. **Small promo tile at 440×280.**
- **Localize** the listing (title + descriptions) into es, pt-BR, de, fr, hi, id, ja. The store has built-in localization, and it's a cheap way to show up in more searches.
- **Use the "Featured" badge we already have:** the listing already shows Google's Chrome Web Store "Featured" badge. Mention it in the first screenshot, on the landing page and in launch posts ("Featured on the Chrome Web Store"). To keep it, stay within Google's best practices (minimal permissions, clear privacy disclosures, an accurate listing). T1 and T11 also protect the badge.

### B. Launch channels (weeks 2–4)

| Channel | Action | Expected (rough) |
|---|---|---|
| **Microsoft Edge Add-ons** | Publish the same MV3 build (no code changes needed). Less competition in search | +30–80 over 2 months |
| **Firefox Add-ons** | Port (MV3 works with minor changes) | +20–50 |
| **Product Hunt** | Launch v1.5 on a Tuesday–Thursday with a short GIF/demo. Ask existing users to leave feedback | +50–150 burst |
| **Reddit** | r/SEO, r/bigseo, r/juststart, r/webdev, r/chrome_extensions, r/SideProject. Share a useful post (e.g. "I built a free on-page checklist, here's what I learned about pixel title truncation"), not just a link. Follow each subreddit's self-promo rules | +40–100 |
| **Dev/SEO communities** | Indie Hackers, dev.to / Hashnode article, Hacker News "Show HN", LinkedIn post with a 30-sec screen recording | +30–80 |
| **Directories** | AlternativeTo (list as alternative to *SEO META in 1 CLICK* and *Detailed SEO*), SaaSHub, Chrome-Stats, ExtScope | slow, steady trickle |
| **Listicle outreach** | Email authors of the "Best SEO Chrome extensions 2026" posts (TheeDigital, ShaneBarker, SEOProfy, Alphonso Labs, Optimum7, MageComp…) with a short pitch + screenshots | Each listing = ongoing traffic |
| **Own site (anupammondal.in)** | Landing page targeting "seo checklist chrome extension" / "free on-page seo checker" with a demo GIF and install button. Use the extension on its own landing page | long-term search traffic |
| **YouTube / Shorts** | 60-sec "check any page's SEO in 1 click" video. Link it in the CWS listing | +20–60 |
| **GitHub** | Install badge + GIF at the top of the README; add the `chrome-extension` and `seo` topics | small |

### C. Reviews (ongoing)

- Target **20+ ratings total (from 6)** by week 8, at 4.5★+ average (G1 does most of this). Ask the people who already use it (colleagues, clients, your network) for honest reviews in week 1. Never offer rewards for reviews; that breaks CWS rules.
- Reply to **every** review within 48h. Fix and reply to every 1–3★ review.

### D. Retention (to keep the net growth)

- T1 and T3 cut early uninstalls (fewer warnings and fewer pop-ups).
- G3 tells us why people still uninstall. Review it every 2 weeks.
- Track in the CWS dashboard every week: **impressions → page views → installs (conversion %)**, weekly users, and uninstalls.

### Weekly milestones

| Week | Milestone | Target users |
|---|---|---|
| 0 | Branch `v1.5` from `v1.4`; finish P0 tweaks | 222 |
| 1 | Ship v1.5 + new listing, screenshots, localization | 270 |
| 2 | Edge Add-ons live; Reddit/LinkedIn posts; landing page | 310 |
| 3 | Product Hunt + Show HN; listicle outreach (10 emails) | 370 |
| 4 | Firefox live; dev.to article; YouTube short | 410 |
| 5–6 | v1.5.1 (F4 schema viewer, F7 hreflang); answer feedback | 460 |
| 7–8 | v1.5.2 (F8 keyword density, F9 CSV); 2nd outreach round | **500+** |

If week 3 is below 330, check the listing conversion rate first. If it's under ~20% of page views, redo the screenshots and short description before spending more time on outside channels.

---

## 5. What to postpone

The existing `planning/TODO.md` / `LAUNCH_CHECKLIST.md` describe a 12-week premium build (accounts, billing, crawler, GSC/GA4). **Wait until ~2,000 weekly users and a 4.5★+ rating.** With < 500 users, the paid conversion would be too small to pay back the work. Asking free users for sign-up or payment too early also leads to bad reviews. Keep the plan, just run it after growth.

---

## 6. Release checklist for v1.5

- [ ] Create branch `v1.5` from `v1.4`
- [ ] T1–T11 done; manifest has only `activeTab`, `scripting` (+ `storage`, `sidePanel` if F11), `optional_host_permissions` for external link checks
- [ ] Selected P1 features done and tested on 10 sample sites (WordPress, Shopify, Next.js SPA, news site, a `noindex` page)
- [ ] G1–G4 in place
- [ ] README + changelog + `marketing/description.txt` + privacy policy updated to match the new permissions
- [ ] New screenshots + promo tile + localized listings
- [ ] CWS privacy practices form updated (no data collected)
- [ ] Submit; prepare Edge package the same day

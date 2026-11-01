# Chrome Web Store submission – SEO Checklist v1.5

Checked: November 2026, against the Chrome Web Store program policies, including the data-practice rules enforced since August 1, 2026.

## 1. Package

- Build: `./scripts/build-zip.sh` → `dist/seo-checklist-v1.5.zip` (about 72 KB, 10 files)
- Contains only: `manifest.json`, `background.js`, `popup.html`, `popup.css`, `popup.js`, `report-print.js`, `LICENSE`, `icons/` (16, 48, 128)
- Before uploading, check that the version in the dashboard is lower than **1.5**. Chrome rejects an upload whose version is not higher than the published one.

## 2. Validation results

| Check | Result |
|---|---|
| Manifest V3, valid JSON | Pass |
| Name ≤ 75 chars / manifest description ≤ 132 chars | Pass (13 / 116) |
| Icons 16, 48, 128 px are real PNGs at the right sizes | Pass |
| No remotely hosted code (no remote scripts, no `eval`, no `new Function`) | Pass. Only two remote **images** (promo logo, report logo); images are allowed |
| No inline scripts or inline event handlers (MV3 CSP) | Pass |
| Every declared permission is used | Pass (`scripting`, `activeTab`, `storage`; `notifications` removed) |
| No permission requested that isn't needed | Pass. Host access is optional and requested only on a user click |
| Page content written into the popup is escaped | Pass. Links limited to http/https |
| Clean install in Chromium: no host access granted at install | Pass |
| Real-Chrome run of the packaged ZIP: analysis, link and image checks, storage, no errors | Pass |
| Listing description: no keyword lists, no store-status claims, no testimonials | Pass after this update (removed "Keywords:" line and "Featured" claim) |

## 3. Listing fields (copy into the dashboard)

**Title:** SEO Checklist

**Summary (short description, from the manifest):**
One-click on-page SEO audit: score, fix list, Google search preview, broken links, images, headings and PDF reports.

**Description:** use `marketing/description.txt`.

**Category:** Developer Tools (current). **Language:** English.

**Graphics (ready in `marketing/store-assets/`, all 24-bit RGB PNG):**
- 5 screenshots at **1280×800**, uploaded in this order: `screenshot-1-overview.png`, `screenshot-2-search-preview.png`, `screenshot-3-checklist.png`, `screenshot-4-links-images.png`, `screenshot-5-dark-tools.png`. Remove the old orange screenshots.
- Small promo tile **440×280**: `promo-tile-440x280.png`
- Marquee **1400×560** (optional): `marquee-1400x560.png`
- The promo video still shows the old design. Remove it, or replace it with a new screen recording.
- Keep them truthful: no "#1", "Editor's choice", "Featured" or rating claims in images or text. The store shows the Featured badge on its own.

## 4. Privacy tab answers

**Single purpose:**
Audit the on-page SEO of the web page the user is viewing and show what to fix.

**Permission justifications:**
- `activeTab`: Reads the page the user is viewing, only after they open the extension, to run the SEO checks.
- `scripting`: Runs the analysis code in that tab: reads the HTML, and checks the page's own links and images for errors and file size.
- `storage`: Saves the user's score history, theme and "What's new" state on their device, so they can see their progress between checks.
- Optional host permissions (`http://*/*`, `https://*/*`): Only requested when the user clicks "Check external links and images", to test links and images on other domains. Not granted at install.

**Remote code:** No, I am not using remote code.

**Data usage:** The extension does not send any user data off the device. Analysis happens in the browser. The score history (page URL, score, date, failed checks) is stored only in `chrome.storage.local` and is deleted on uninstall or with "Clear history".
- Recommended answers: tick **no** data types as collected, and tick all three certifications (not sold, not used for unrelated purposes, not used for creditworthiness or lending).
- If you want the most conservative setup, you could also tick "Web history" with a note that it is stored locally only. This is optional; Google counts data as collected when it is sent off the device. Either way, the privacy policy already describes the local storage.

**Privacy policy URL:** the hosted copy of `marketing/privacy.html`. **Update the live page with the v1.5 text before submitting**, so the policy matches the new permissions and the local score history.

## 5. Data changes users must be told about (2026 rules)

v1.5 changes how data is handled compared with v1.4, so it is disclosed in three places:
1. The privacy policy (updated: permissions and local score history)
2. The in-popup "What's new" banner, which mentions that score history is saved on the device and can be cleared
3. The "Clear history" button in the Overview tab

## 6. Final manual test in Chrome (about 15 minutes)

1. `chrome://extensions` → Developer mode → Load unpacked → select the unzipped `dist/seo-checklist-v1.5.zip`.
2. Confirm there's no warning about reading data on all websites.
3. Open 5 real sites (WordPress, Shopify, a news site, a single-page app, your own site) and press **Alt+Shift+S**. Check that the score, all 7 tabs, the PDF export and Copy summary work.
4. On a page with external links, click **Check external links and images**. Accept the prompt, then confirm external links get checked.
5. Open the popup on `chrome://extensions` and confirm the friendly "Open a website" message.
6. Re-check a page after changing something and confirm the score change appears.
7. Toggle dark mode, then close and reopen the popup to confirm it's remembered.

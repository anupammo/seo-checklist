
# SEO Checklist v1.2.9 – On-Page SEO Analyzer Chrome Extension

SEO Checklist is a modern, privacy-friendly Chrome extension that provides instant, client-side on-page SEO analysis for any website you visit. It gives you a clear, actionable checklist and visual feedback to help you optimize your pages for search engines—no server, no data collection, no permissions beyond what’s needed.

---

## Install from Chrome Web Store

[**Install SEO Checklist from the Chrome Web Store**](https://chromewebstore.google.com/detail/seo-checklist/jgigdhidhmgikfnccdnehcpgoggmagfh?hl=en-GB&authuser=0)

---

## What’s New in v1.2.9 (March 2026)

- **Permission Reduction Update**: Removed `notifications` and broad `host_permissions` access to reduce extension permission footprint.
- **Network-Based Audits Disabled**: Broken internal link status checks and image file-size optimization checks are disabled in this version due to host permission removal.
- **More Exact SEO Score (Web-Vitals-Inspired Signals)**: Scoring remains granular with additional technical quality signals such as heading order, discernible link names, and image dimension checks.
- **Heading Order Validation**: Detects skipped heading levels (for example H2 to H4) to catch structural issues.
- **Internal / External Link Insights**: Added dedicated internal and external link breakdown with detailed lists in the analysis panel.
- **Printable SEO Report / PDF Export**: Export analysis to a printable report and save as PDF.
- **Discernible Link Names Check**: Flags links without visible text or accessible labels.
- **GA Tag + Image Optimization Scope**: Improved technical scoring with analytics tag detection and image-size based optimization scope classification.
- **Image Optimization Panel Retained**: Section remains visible in UI, with network-based size checks disabled in this version.
- **Restricted URL Guard**: Prevents analysis attempts on non-injectable pages like `chrome://`, extension pages, and other protected URLs.
- **Safer Social Preview Loading**: Social preview now skips restricted tabs and falls back to a placeholder without runtime errors.
- **Improved Popup Stability**: Added explicit Chrome API error handling for safer execution.

---

## Changelog

### v1.2.9 (March 2026)

- Removed `notifications` permission and update-toast notification dependency.
- Removed broad `host_permissions` (`http://*/*`, `https://*/*`).
- Disabled network-dependent broken-link status checks.
- Disabled network-dependent image optimization size checks.

### v1.4 (March 2026)

- Added more exact SEO scoring with expanded technical checks and weighted warning handling.
- Added heading order validation for skipped heading levels.
- Added discernible link name detection for accessibility-focused SEO quality.
- Added internal and external link overview panels with detailed lists.
- Added printable report export flow (Print / Save as PDF).
- Added image optimization opportunities with scope and recommendations.
- Added image attribute issue reporting (missing alt and width/height).
- Improved GA tag and technical signal coverage in score inputs.
- Added guarded analysis for supported page types (`http/https` only).
- Fixed popup error flow for restricted URLs.
- Improved social preview fallback behavior on protected pages.

### v1.3 (March 2026)

- **Social Preview Analyzer**: Instantly preview Open Graph and Twitter-style title, description, image, and URL metadata.
- **Quick SEO Testing Tool Launcher**: Open Rich Results Test, PageSpeed Insights, Facebook Sharing Debugger, and LinkedIn Post Inspector with one click.
- **Broken Link Visibility**: Better internal-link quality checks with status feedback in the popup.
- **Performance + Workflow Benefits**:
  - Reduce manual QA time for technical SEO checks.
  - Catch metadata and sharing-preview issues before publishing.
  - Validate on-page SEO and off-page sharing readiness from one extension.

---

## Features

- **Minimal, Purpose-Built Permissions**: Uses `activeTab` + `scripting` for on-page analysis. All analysis remains client-side.
- **One-Click Analysis**: Instantly analyze the current tab’s HTML with a single click.
- **Visual SEO Score**: Get a color-coded SEO score and feedback summary using expanded technical checks (web-vitals-inspired scoring signals).
- **Detailed Checklist**: Checks for:
  - Title tag length (50–60 chars)
  - Meta description length (120–160 chars)
  - Heading structure (1 H1, multiple H2s)
  - Heading order (no skipped heading levels)
  - Content length (500+ words)
  - Image alt texts
  - Internal links
  - External links
  - Discernible link names
  - Mobile viewport tag
  - Canonical tag
  - Schema markup
  - Google Analytics / GA Tag implementation
  - Image dimensions and optimization scope
- **Color-Coded Status**: Good, Warning, and Needs Work indicators for each check.
- **Tooltips**: Hover for actual content and recommendations.
- **Accordion UI**: Expand/collapse categories for a clean, modern look.
- **Loading Indicator**: See when analysis is running.
- **Google Analytics Detection**: Detects if Google Analytics or Google Tag Manager is installed on your page
- **Social Preview Card**: Preview social metadata (title, description, image, URL) directly in the extension popup.
- **Internal / External Link Overview**: Review separated internal and external link lists directly in the popup.
- **Broken Link Check Status**: Temporarily disabled in v1.2.9 after host permission removal.
- **Discernible Link Names Audit**: Detects links with missing visible text or accessible naming.
- **Image Attribute Issues Panel**: Lists images missing alt text and/or width/height attributes.
- **Image Optimization Opportunities**: Temporarily disabled in v1.2.9 after host permission removal.
- **Printable Report Export**: Open a dedicated report view and print or save as PDF.
- **Test Recent URL Tools**: Quick access to external SEO testing tools:
  - **Structured Data / Rich Results** – Test with Google's Rich Result Testing Tool
  - **Google PageSpeed Insights** – Analyze page performance and loading speed
  - **Facebook Sharing Debugger** – Preview how your page appears when shared on Facebook
  - **LinkedIn Post Inspector** – Preview how your page appears when shared on LinkedIn
  - Each tool opens in a new tab with your current page URL automatically pre-filled
- **Works on Most Pages**: (Not available on Chrome Web Store, extensions, or `chrome://` pages due to browser restrictions.)

---


## Manual Installation (Development)

1. **Clone or Download this Repository**
2. **Open Chrome and go to** `chrome://extensions/`
3. **Enable "Developer mode"** (top right)
4. **Click "Load unpacked"** and select the extension folder (containing `manifest.json`)

---

## Usage

1. Visit any website you want to analyze.
2. Click the SEO Checklist extension icon in your Chrome toolbar.
3. Choose your action:
   - **Analyze Current Page** – Perform a detailed on-page SEO analysis with scoring and checklist
   - **Test Recent URL** – Use external SEO tools to test your page:
     - Click **Structured Data** to test rich snippets and schema markup with Google's tool
     - Click **PageSpeed Insights** to check performance metrics and optimization suggestions
     - Click **Facebook Debugger** to preview page sharing appearance on Facebook
     - Click **LinkedIn Inspector** to preview page sharing appearance on LinkedIn
4. Review detailed technical panels including heading order and link quality. Broken-link status and image-optimization size checks are marked disabled in this version.
5. Click **Export PDF Report** to open the printable report view, then print or save as PDF.

## Screenshots

<p align="center">
  <img src="screenshots/screenshot1.jpg" alt="SEO Checklist Screenshot 1" width="400" />
  <img src="screenshots/screenshot2.jpg" alt="SEO Checklist Screenshot 2" width="400" />
  <img src="screenshots/screenshot3.jpg" alt="SEO Checklist Screenshot 3" width="400" />
  <img src="screenshots/screenshot4.jpg" alt="SEO Checklist Screenshot 4" width="400" />
  <img src="screenshots/screenshot5.jpg" alt="SEO Checklist Screenshot 5" width="400" />
</p>

---

## How It Works

- Uses the [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) API.
- Injects a script into the active tab to fetch the page’s HTML.
- Parses and analyzes the HTML in the popup—**no data is sent anywhere**.
- Displays results in a modern, interactive UI.

---

## File & Folder Structure for Chrome Web Store Upload

Only include the following files/folders in your upload ZIP:

```
SEO Checklist/
│   LICENSE
│   manifest.json
│   popup.html
│   popup.js
│   README.md*
│
└───icons
  icon16.png
  icon48.png
  icon128.png
```

Do **not** include `marketing/` or `screenshots/` folders in the upload ZIP. Upload screenshots and promo images separately in the Chrome Web Store dashboard.

---

### Key Files

- **manifest.json** – Extension configuration and permissions
- **popup.html** – Extension popup UI
- **popup.js** – Main logic for fetching and analyzing the page
- **icons/** – Extension icons

### Permissions

```json
"permissions": [
  "scripting",
  "activeTab"
]
```

---

## Limitations

- **Cannot analyze Chrome Web Store, extensions, or `chrome://` pages** (browser security restriction).
- **Some sites may block script injection** (e.g., with CSP headers).
- **SEO checks are basic and for guidance only**—always combine with manual review and other tools.

---

## Privacy

SEO Checklist does **not** collect, store, or transmit any data. All analysis is performed locally in your browser.

---

## License

MIT License

---

## Credits

- UI inspired by modern design aspects.
- Built with [Chrome Extensions API](https://developer.chrome.com/docs/extensions/).

- **Developer:** [Anupam Mondal](https://anupammondal.in)




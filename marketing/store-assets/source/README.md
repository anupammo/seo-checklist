# Store graphics source

The screenshots are real captures of the extension UI (`popup.html` / `popup.css` / `popup.js`), run against a demo page on the reserved `trailrunner.example` domain, so no real site or brand appears.

- `demo.html`, `og.svg`, `favicon.svg`: the demo page
- `demo-fakechrome.js`: a stand-in for the Chrome APIs, used only for the capture (seeds a few days of score history so the progress feature is visible)
- `capture.js`: takes the raw popup screenshots (780x590 at 2x)
- `compose.js`: lays them out as the 1280x800 screenshots, the 440x280 promo tile and the 1400x560 marquee

To regenerate, copy the extension files into `<work>/site/ext/` (with `demo-fakechrome.js` saved as `fakechrome.js` and loaded before `popup.js`), put the demo files in `<work>/site/`, then run `node capture.js <work>` and `node compose.js <work>`. Convert the outputs to 24-bit RGB PNG before uploading.

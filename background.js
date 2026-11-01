const UPDATE_PAGE_URL = 'https://anupammondal.in/chrome-extension/seo-checklist';

// "1.5.2" -> "1.5". Patch releases share a release line and don't open the update page.
function getReleaseLine(version) {
  return String(version || '').split('.').slice(0, 2).join('.');
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'update') {
    return;
  }

  const currentVersion = chrome.runtime.getManifest().version;
  if (getReleaseLine(details.previousVersion) === getReleaseLine(currentVersion)) {
    return;
  }

  // Shown once as a small banner inside the popup.
  chrome.storage.local.set({ whatsNewVersion: currentVersion });

  chrome.tabs.create({
    url: `${UPDATE_PAGE_URL}?updated=true&version=${encodeURIComponent(currentVersion)}`
  });
});

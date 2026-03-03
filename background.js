const UPDATE_PAGE_URL = 'https://anupammondal.in/chrome-extension/seo-checklist';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'update') {
    return;
  }

  const currentVersion = chrome.runtime.getManifest().version;

  chrome.tabs.create({
    url: `${UPDATE_PAGE_URL}?updated=true&version=${encodeURIComponent(currentVersion)}`
  });

  chrome.notifications.create('seo-checklist-update', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'SEO Checklist updated',
    message: `Version ${currentVersion} is now live. Check what\'s new.`
  });
});

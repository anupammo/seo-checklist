const reportState = {
  pageUrl: '',
  generatedAt: '',
  seoData: null,
  scorePercent: 0,
  feedback: '',
  brokenLinks: {
    items: [],
    meta: null
  },
  imageOptimization: {
    items: [],
    meta: null
  }
};

// Bumped on every analysis so late results from an earlier run are ignored.
let analysisRunId = 0;

const linkCheckState = {
  pageData: null,
  internal: [],
  internalMeta: null,
  external: null,
  externalMeta: null
};

// Only needed for the optional "check external links and images" step.
const HOST_ACCESS_ORIGINS = ['http://*/*', 'https://*/*'];

// Google cuts off titles and descriptions by pixel width, not character count.
const TITLE_MAX_PX = 580;
const TITLE_MIN_CHARS = 30;
const DESCRIPTION_MAX_PX = 920;
const DESCRIPTION_MIN_CHARS = 100;
const THIN_CONTENT_WORDS = 300;

function showPopupError(message) {
  const el = document.getElementById('popupError');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function clearPopupError() {
  const el = document.getElementById('popupError');
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
}

function initWhatsNewBanner() {
  const banner = document.getElementById('whatsNew');
  if (!banner || !chrome.storage || !chrome.storage.local) return;

  chrome.storage.local.get('whatsNewVersion', (items) => {
    if (chrome.runtime.lastError || !items || !items.whatsNewVersion) return;
    const versionEl = document.getElementById('whatsNewVersion');
    if (versionEl) versionEl.textContent = items.whatsNewVersion;
    banner.classList.remove('hidden');
  });

  const dismissBtn = document.getElementById('whatsNewDismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      banner.classList.add('hidden');
      chrome.storage.local.remove('whatsNewVersion');
    });
  }
}

function isInjectablePageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  return url.startsWith('http://') || url.startsWith('https://');
}

const STORE_URL = 'https://chromewebstore.google.com/detail/jgigdhidhmgikfnccdnehcpgoggmagfh';
const STORE_REVIEW_URL = `${STORE_URL}/reviews`;
const REVIEW_PROMPT_AFTER_ANALYSES = 3;
const REVIEW_PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_PER_URL = 10;
const HISTORY_MAX_URLS = 200;
const HISTORY_MERGE_MS = 10 * 60 * 1000;
const THEME_STORAGE_KEY = 'seoChecklistTheme';
const SCORE_RING_LENGTH = 2 * Math.PI * 52;

const VIEWS = ['overview', 'checklist', 'serp', 'headings', 'links', 'images', 'tools'];

// Which checklist items feed each sidebar badge.
const VIEW_CHECKS = {
  serp: ['titleTagStatus', 'metaDescStatus', 'socialTagsStatus'],
  headings: ['headingsStatus', 'headingOrderStatus'],
  links: ['brokenLinksStatus', 'linkNamesStatus', 'internalLinksStatus'],
  images: ['imageAltsStatus', 'imageDimensionsStatus', 'imageOptimizationStatus']
};

const TOOL_URLS = {
  richResults: url => `https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`,
  pageSpeed: url => `https://pagespeed.web.dev/report?url=${encodeURIComponent(url)}`,
  facebook: url => `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(url)}`,
  linkedin: url => `https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(url)}`,
  schemaValidator: url => `https://validator.schema.org/#url=${encodeURIComponent(url)}`,
  wayback: url => `https://web.archive.org/web/*/${url}`,
  robots: url => new URL('/robots.txt', url).href,
  sitemap: url => new URL('/sitemap.xml', url).href,
  siteSearch: url => `https://www.google.com/search?q=${encodeURIComponent(`site:${new URL(url).hostname}`)}`
};

let currentTab = null;
let toastTimer = null;

const serpState = {
  device: 'desktop',
  title: '',
  description: '',
  original: { title: '', description: '' }
};

/* ---------- Small helpers ---------- */

function $(id) {
  return document.getElementById(id);
}

function storageGet(keys) {
  return new Promise(resolve => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get(keys, items => {
      resolve(chrome.runtime.lastError ? {} : (items || {}));
    });
  });
}

function storageSet(items) {
  return new Promise(resolve => {
    if (!chrome.storage || !chrome.storage.local) {
      resolve();
      return;
    }
    chrome.storage.local.set(items, () => resolve());
  });
}

function showToast(message) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showToast(message || 'Copied');
}

function timeAgo(timestamp) {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [name, size] of units) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return `${value} ${name}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function getCheckState(check) {
  if (check.pending) return 'pending';
  if (check.good) return 'good';
  if (check.warning) return 'warning';
  return 'bad';
}

/* ---------- Startup ---------- */

document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  initNavigation();
  initActions();
  initKeyboard();
  initSerpEditor();
  initWhatsNewBanner();

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    currentTab = tabs && tabs[0] ? tabs[0] : null;
    renderPageChip(currentTab ? currentTab.title : '', currentTab ? currentTab.url : '');

    if (!currentTab || !isInjectablePageUrl(currentTab.url || '')) {
      showRestrictedState();
      return;
    }
    startAnalysis();
  });
});

function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    stored = null;
  }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = stored || (prefersDark ? 'dark' : 'light');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (error) {
    // Theme still applies for this session.
  }
}

function initNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => showView(item.dataset.view));
  });

  document.querySelectorAll('[data-goto-filter]').forEach(button => {
    button.addEventListener('click', () => {
      setChecklistFilter(button.dataset.gotoFilter);
      showView('checklist');
    });
  });

  document.querySelectorAll('#view-checklist .seg[data-filter]').forEach(button => {
    button.addEventListener('click', () => setChecklistFilter(button.dataset.filter));
  });

  document.querySelectorAll('.links-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const targetPanelId = tab.getAttribute('data-tab');
      if (!targetPanelId) return;

      document.querySelectorAll('.links-tab').forEach(tabButton => {
        const isActive = tabButton === tab;
        tabButton.classList.toggle('active', isActive);
        tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      document.querySelectorAll('.links-panel').forEach(panel => {
        panel.classList.toggle('hidden', panel.id !== targetPanelId);
      });
    });
  });
}

function showView(view) {
  if (!VIEWS.includes(view)) return;
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.viewPanel === view);
  });
  const main = $('main');
  if (main) main.scrollTop = 0;
}

function setChecklistFilter(filter) {
  const list = $('checklist');
  if (list) list.dataset.filter = filter;
  document.querySelectorAll('#view-checklist .seg[data-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
}

function initActions() {
  document.querySelectorAll('.sidebar-promo-logo').forEach(img => {
    img.addEventListener('error', () => img.classList.add('hidden'));
    if (img.complete && img.naturalWidth === 0) img.classList.add('hidden');
  });

  $('analyzeBtn').addEventListener('click', startAnalysis);
  $('exportPdfBtn').addEventListener('click', exportReportAsPdf);
  $('copySummaryBtn').addEventListener('click', copySummary);
  $('themeToggleBtn').addEventListener('click', toggleTheme);

  document.querySelectorAll('[data-tool]').forEach(button => {
    button.addEventListener('click', () => openTool(button.dataset.tool));
  });

  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', () => copyList(button.dataset.copy));
  });

  const checkExternalBtn = $('checkExternalLinksBtn');
  checkExternalBtn.addEventListener('click', function() {
    // permissions.request must run directly inside the click handler.
    chrome.permissions.request({ origins: HOST_ACCESS_ORIGINS }, (granted) => {
      if (chrome.runtime.lastError || !granted) {
        showPopupError('Permission not granted. External links and images were not checked.');
        return;
      }
      clearPopupError();
      checkExternalBtn.classList.add('hidden');
      runExternalChecks(analysisRunId);
    });
  });

  $('clearHistoryBtn').addEventListener('click', async () => {
    if (!window.confirm('Delete all saved scores from this device?')) return;
    if (chrome.storage && chrome.storage.local) {
      await new Promise(resolve => chrome.storage.local.remove('scoreHistory', resolve));
    }
    $('scoreDelta').textContent = 'Score history cleared.';
    $('historyCaption').textContent = 'Your score history starts now';
    $('historySpark').innerHTML = '';
    showToast('History cleared');
  });

  $('reviewRateBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: STORE_REVIEW_URL });
    setReviewPromptState('rated');
  });
  $('reviewLaterBtn').addEventListener('click', async () => {
    const { reviewPrompt } = await storageGet('reviewPrompt');
    setReviewPromptState(reviewPrompt && reviewPrompt.state === 'later' ? 'never' : 'later');
  });
}

function initKeyboard() {
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    const key = event.key.toLowerCase();
    const index = Number.parseInt(key, 10);
    if (index >= 1 && index <= VIEWS.length && !document.querySelector('.app.is-restricted')) {
      showView(VIEWS[index - 1]);
    } else if (key === 'r') {
      startAnalysis();
    } else if (key === 'c' && !$('copySummaryBtn').disabled) {
      copySummary();
    } else if (key === 'e' && !$('exportPdfBtn').disabled) {
      exportReportAsPdf();
    } else if (key === 'd') {
      toggleTheme();
    } else {
      return;
    }
    event.preventDefault();
  });
}

function openTool(tool) {
  const build = TOOL_URLS[tool];
  if (!build || !currentTab || !isInjectablePageUrl(currentTab.url || '')) return;
  try {
    chrome.tabs.create({ url: build(currentTab.url) });
  } catch (error) {
    showPopupError('Could not open this tool for the current page.');
  }
}

function renderPageChip(title, url, faviconUrl) {
  let host = '';
  try {
    host = url ? new URL(url).hostname : '';
  } catch (error) {
    host = '';
  }
  $('pageTitle').textContent = title || host || 'Current page';
  $('pageHost').textContent = host || (url || '-');
  $('pageChip').title = url || '';

  const favicon = $('pageFavicon');
  if (faviconUrl) {
    favicon.onerror = () => favicon.classList.add('hidden');
    favicon.src = faviconUrl;
    favicon.classList.remove('hidden');
  }
}

function showRestrictedState() {
  const app = $('app');
  app.classList.remove('is-loading');
  app.classList.add('is-restricted');
  $('restrictedState').classList.remove('hidden');
  $('analyzeBtn').disabled = true;
  document.querySelectorAll('.nav-item, [data-tool]').forEach(el => {
    el.disabled = true;
  });
}

/* ---------- Analysis ---------- */

function startAnalysis() {
  if (!currentTab || !isInjectablePageUrl(currentTab.url || '')) {
    showPopupError('This page cannot be analyzed. Open a regular website (http or https) and try again.');
    return;
  }
  if (!chrome.scripting) {
    showPopupError('Page analysis is not available in this browser. Please update Chrome and try again.');
    return;
  }

  analysisRunId += 1;
  const runId = analysisRunId;
  const tab = currentTab;

  clearPopupError();
  setExternalCheckButtonVisible(false);
  resetReportState();
  setExportButtonState(false);
  $('copySummaryBtn').disabled = true;
  $('app').classList.add('is-loading');
  reportState.pageUrl = tab.url || '';

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.outerHTML
  }, (results) => {
    if (runId !== analysisRunId) return;
    $('app').classList.remove('is-loading');

    if (chrome.runtime.lastError || !results || !results[0] || !results[0].result) {
      showPopupError('Unable to read this page. Refresh the page and try again.');
      return;
    }

    try {
      const doc = new DOMParser().parseFromString(results[0].result, 'text/html');
      const data = getPageSEOData(doc, tab.url);
      displayResults(data);
      runResourceChecks(tab.id, data, runId);
      afterAnalysis(data, runId);
    } catch (e) {
      showPopupError('Error analyzing this page: ' + e.message);
    }
  });
}

async function afterAnalysis(data, runId) {
  const checks = getChecks(data).filter(check => !check.async);
  const failing = checks.filter(check => !check.good).map(check => check.id);
  const history = await recordHistory(reportState.pageUrl, reportState.scorePercent, failing);
  if (runId !== analysisRunId) return;
  renderHistory(history, failing, checks);
  maybeShowReviewPrompt();
}

/* ---------- Results rendering ---------- */

function displayResults(data) {
  const checks = getChecks(data);
  const scored = checks.filter(check => !check.async);

  let score = 0;
  scored.forEach(check => {
    if (check.good) score += 1;
    else if (check.warning) score += 0.5;
  });
  const percent = Math.round((score / scored.length) * 100);

  let feedback = '';
  if (percent === 100) {
    feedback = 'Excellent! Your page is well-optimized. 🎉';
  } else if (percent >= 80) {
    feedback = 'Great! Just a few improvements needed.';
  } else if (percent >= 60) {
    feedback = 'Good, but there are several areas to improve.';
  } else {
    feedback = 'Needs significant SEO improvements.';
  }

  reportState.seoData = data;
  reportState.generatedAt = new Date().toISOString();
  reportState.scorePercent = percent;
  reportState.feedback = feedback;
  setExportButtonState(true);
  $('copySummaryBtn').disabled = false;

  renderPageChip(data.title.text || (currentTab && currentTab.title), reportState.pageUrl, data.favicon);
  renderScore(percent, feedback);
  renderCategoryBars(scored);
  renderChecklist(checks);
  renderFacts(data);
  renderSerp(data);
  renderSocial(data);
  renderHeadings(data);

  setBrokenLinksStatus('Checking...', 'warning', 'Checking links for errors');
  resetBrokenLinksUI(data.links.internalUrls.length, data.links.externalCount);
  resetImageOptimizationUI(data.images.auditItems.length);
  renderLinksOverview(data.links.internalUrls, data.links.externalUrls);
  renderUnnamedLinks(data.links.unnamedLinks);
  renderImageAttributeIssues(data.images.attributeIssueItems);
  renderImageStats(data);

  refreshDerivedUI();
}

function getScoreColor(percent) {
  if (percent >= 80) return 'var(--good)';
  if (percent >= 50) return 'var(--warn)';
  return 'var(--bad)';
}

function renderScore(percent, feedback) {
  const card = document.querySelector('.score-card');
  updateSpeedometer(card, percent);
  $('scoreFeedback').textContent = feedback;

  const valueEl = $('seoScore');
  const start = performance.now();
  const duration = 700;
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    valueEl.textContent = String(Math.round(percent * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// The circular gauge replaces the old semicircle speedometer.
function updateSpeedometer(card, percent) {
  if (!card) return;
  const clamped = Math.max(0, Math.min(100, percent));
  card.style.setProperty('--score-color', getScoreColor(clamped));
  const ring = card.querySelector('.score-ring-value');
  if (ring) {
    ring.style.strokeDasharray = String(SCORE_RING_LENGTH);
    // Start empty, then animate to the score on the next frame.
    ring.style.strokeDashoffset = String(SCORE_RING_LENGTH);
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(SCORE_RING_LENGTH * (1 - clamped / 100));
    });
  }
}

function renderCategoryBars(scoredChecks) {
  const container = $('categoryBars');
  container.innerHTML = '';
  CHECK_CATEGORIES.forEach(category => {
    const items = scoredChecks.filter(check => (CHECK_META[check.id] || {}).category === category.id);
    if (items.length === 0) return;
    const points = items.reduce((sum, check) => sum + (check.good ? 1 : (check.warning ? 0.5 : 0)), 0);
    const percent = Math.round((points / items.length) * 100);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="cat-bar-label"><span>${escapeHtml(category.label)}</span><strong>${percent}%</strong></div>
      <div class="bar"><span></span></div>`;
    const fill = wrap.querySelector('.bar > span');
    fill.style.background = getScoreColor(percent);
    container.appendChild(wrap);
    requestAnimationFrame(() => {
      fill.style.width = `${percent}%`;
    });
  });
}

function renderChecklist(checks) {
  const container = $('checklist');
  container.innerHTML = '';

  CHECK_CATEGORIES.forEach(category => {
    const items = checks.filter(check => (CHECK_META[check.id] || {}).category === category.id);
    if (items.length === 0) return;

    const group = document.createElement('div');
    group.className = 'check-group';
    group.innerHTML = `<div class="check-group-title"><span>${escapeHtml(category.label)}</span></div><div class="check-rows"></div>`;
    const rows = group.querySelector('.check-rows');

    items.forEach(check => {
      const meta = CHECK_META[check.id] || {};
      const state = getCheckState(check);
      const row = document.createElement('details');
      row.className = 'check-row';
      row.dataset.state = state;
      row.dataset.checkId = check.id;
      row.innerHTML = `
        <summary>
          <span class="check-icon" aria-hidden="true"></span>
          <span class="check-label">${escapeHtml(check.label)}</span>
          <span id="${check.id}" class="status ${state === 'pending' ? 'warning' : state}">${escapeHtml(check.text)}</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="check-detail">
          <div class="detail-current">${escapeHtml(check.tooltip || '')}</div>
          ${meta.why ? `<div><strong>Why it matters:</strong> ${escapeHtml(meta.why)}</div>` : ''}
          ${meta.fix ? `<div><strong>How to fix:</strong> ${escapeHtml(meta.fix)}</div>` : ''}
        </div>`;
      rows.appendChild(row);
    });

    container.appendChild(group);
  });
}

// Keeps a checklist row, its pill and the sidebar badges in sync after async checks.
function updateCheckRow(id, text, statusClass, tooltip) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status ${statusClass}`;
  const row = el.closest('.check-row');
  if (row) {
    row.dataset.state = /\.\.\.$/.test(text) ? 'pending' : statusClass;
    const detail = row.querySelector('.detail-current');
    if (detail && tooltip) detail.textContent = tooltip;
  }
}

function refreshDerivedUI() {
  if (!reportState.seoData) return;
  const checks = getChecks(reportState.seoData);
  const states = checks.map(check => ({ check, state: getCheckState(check) }));

  const count = state => states.filter(item => item.state === state).length;
  const bad = count('bad');
  const warning = count('warning');
  $('countBad').textContent = bad;
  $('countWarning').textContent = warning;
  $('countGood').textContent = count('good');

  setNavBadge('checklist', bad ? bad : warning, bad ? 'bad' : (warning ? 'warning' : 'good'));
  Object.keys(VIEW_CHECKS).forEach(view => {
    const relevant = states.filter(item => VIEW_CHECKS[view].includes(item.check.id));
    const viewBad = relevant.filter(item => item.state === 'bad').length;
    const viewWarn = relevant.filter(item => item.state === 'warning').length;
    setNavBadge(view, viewBad + viewWarn, viewBad ? 'bad' : (viewWarn ? 'warning' : 'good'));
  });

  renderTopFixes(states);
}

function setNavBadge(view, value, tone) {
  const badge = $(`navBadge-${view}`);
  if (!badge) return;
  badge.className = `nav-badge ${tone}`;
  badge.textContent = value ? String(value) : '✓';
}

function renderTopFixes(states) {
  const list = $('topFixes');
  list.innerHTML = '';

  const fixes = states
    .filter(item => item.state === 'bad' || item.state === 'warning')
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === 'bad' ? -1 : 1;
      return ((CHECK_META[b.check.id] || {}).impact || 1) - ((CHECK_META[a.check.id] || {}).impact || 1);
    })
    .slice(0, 5);

  if (fixes.length === 0) {
    list.innerHTML = '<li class="all-good">Nothing to fix. Every check passed! 🎉</li>';
    return;
  }

  fixes.forEach(({ check, state }) => {
    const meta = CHECK_META[check.id] || {};
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="fix-item">
        <span class="fix-dot ${state}"></span>
        <span class="fix-body">
          <span class="fix-title">${escapeHtml(check.label)} <span>· ${escapeHtml(check.text)}</span></span>
          <span class="fix-text">${escapeHtml(meta.fix || check.tooltip || '')}</span>
        </span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => goToCheck(check.id));
    list.appendChild(li);
  });
}

function goToCheck(id) {
  setChecklistFilter('all');
  showView('checklist');
  const el = $(id);
  const row = el ? el.closest('.check-row') : null;
  if (!row) return;
  row.open = true;
  row.scrollIntoView({ block: 'center' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}

function renderFacts(data) {
  const rows = [];
  const add = (key, valueHtml) => rows.push(`<div class="fact-key">${key}</div><div class="fact-value">${valueHtml}</div>`);
  const tag = (text, tone) => `<span class="tag ${tone || ''}">${escapeHtml(text)}</span>`;

  add('Title', escapeHtml(data.title.text) || tag('Not found', 'bad'));
  add('Description', escapeHtml(data.metaDescription.text) || tag('Not found', 'bad'));
  add('H1', escapeHtml(data.headings.firstH1) || tag('Not found', 'bad'));
  add('Content', `${data.content.wordCount} words`);
  add('Canonical', data.canonical
    ? (data.canonicalIsSelf ? tag('Self', 'good') : `${tag('Other URL', 'warning')} ${escapeHtml(data.canonicalUrl || '')}`)
    : tag('Missing', 'bad'));
  add('Robots', data.robots.content ? escapeHtml(data.robots.content) : `${tag('Default', 'good')} index, follow`);
  add('Language', data.lang ? escapeHtml(data.lang) : tag('Not set', 'warning'));
  add('Schema', data.schemaTypes.length ? escapeHtml(data.schemaTypes.join(', ')) : tag('None', 'bad'));
  add('Analytics', data.gaTag ? `${tag('Yes', 'good')} ${escapeHtml(data.analyticsIds.join(', '))}` : tag('No'));
  add('Images', `${data.images.total} total · ${data.images.withAlt} with alt`);
  add('Links', `${data.links.internal} internal · ${data.links.externalCount} external`);

  $('detailedResults').innerHTML = rows.join('');
}

/* ---------- Search preview ---------- */

function truncateToWidth(text, maxPx, font) {
  if (measureTextWidth(text, font) <= maxPx) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measureTextWidth(`${text.slice(0, mid)} ...`, font) <= maxPx) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()} ...`;
}

function initSerpEditor() {
  const titleInput = $('serpTitleInput');
  const descInput = $('serpDescInput');

  titleInput.addEventListener('input', () => {
    serpState.title = titleInput.value;
    renderSerpPreview();
  });
  descInput.addEventListener('input', () => {
    serpState.description = descInput.value;
    renderSerpPreview();
  });

  $('serpResetBtn').addEventListener('click', () => {
    serpState.title = serpState.original.title;
    serpState.description = serpState.original.description;
    titleInput.value = serpState.title;
    descInput.value = serpState.description;
    renderSerpPreview();
  });

  $('serpCopyBtn').addEventListener('click', () => {
    copyText(`<title>${serpState.title}</title>\n<meta name="description" content="${serpState.description.replace(/"/g, '&quot;')}">`, 'Copied as HTML tags');
  });

  document.querySelectorAll('[data-device]').forEach(button => {
    button.addEventListener('click', () => {
      serpState.device = button.dataset.device;
      document.querySelectorAll('[data-device]').forEach(other => {
        other.classList.toggle('active', other === button);
      });
      renderSerpPreview();
    });
  });
}

function renderSerp(data) {
  serpState.original = { title: data.title.text, description: data.metaDescription.text };
  serpState.title = data.title.text;
  serpState.description = data.metaDescription.text;
  $('serpTitleInput').value = serpState.title;
  $('serpDescInput').value = serpState.description;

  let url;
  try {
    url = new URL(reportState.pageUrl);
  } catch (error) {
    url = null;
  }
  const siteName = data.social.siteName || (url ? url.hostname.replace(/^www\./, '') : '');
  const crumbs = url ? [url.origin].concat(url.pathname.split('/').filter(Boolean).slice(0, 3)).join(' › ') : '';
  $('serpSiteName').textContent = siteName;
  $('serpUrl').textContent = crumbs;

  const faviconHolder = $('serpFavicon');
  faviconHolder.textContent = siteName ? siteName.charAt(0).toUpperCase() : '';
  if (data.favicon) {
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('load', () => {
      faviconHolder.textContent = '';
      faviconHolder.appendChild(img);
    });
    img.src = data.favicon;
  }

  renderSerpPreview();
}

function updateMeter(fillId, textId, widthPx, maxPx, chars, minChars) {
  const fill = $(fillId);
  const text = $(textId);
  const ratio = maxPx ? widthPx / maxPx : 0;
  fill.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
  let tone = 'good';
  if (widthPx > maxPx || chars === 0) tone = 'bad';
  else if (chars < minChars) tone = 'warning';
  fill.className = `meter-fill ${tone === 'good' ? '' : tone}`;
  text.textContent = `${chars} chars · ${widthPx}px / ${maxPx}px`;
  text.classList.toggle('over', widthPx > maxPx);
}

function renderSerpPreview() {
  const preview = $('serpPreview');
  const isDesktop = serpState.device === 'desktop';
  preview.className = `serp ${isDesktop ? 'serp-desktop' : 'serp-mobile'}`;

  const title = serpState.title.trim() || 'Untitled page';
  const description = serpState.description.trim();
  $('serpTitle').textContent = isDesktop ? truncateToWidth(title, TITLE_MAX_PX, '20px Arial') : title;

  const descEl = $('serpDesc');
  if (description) {
    descEl.textContent = isDesktop ? truncateToWidth(description, DESCRIPTION_MAX_PX, '14px Arial') : description;
    descEl.classList.remove('missing');
  } else {
    descEl.textContent = 'No meta description. Google will pick a snippet from the page text, which may not sell your page well.';
    descEl.classList.add('missing');
  }

  updateMeter('titleMeter', 'titleMeterText', measureTextWidth(serpState.title, '20px Arial'), TITLE_MAX_PX, serpState.title.length, TITLE_MIN_CHARS);
  updateMeter('descMeter', 'descMeterText', measureTextWidth(serpState.description, '14px Arial'), DESCRIPTION_MAX_PX, serpState.description.length, DESCRIPTION_MIN_CHARS);
}

/* ---------- Social preview ---------- */

function displaySocialPreview(preview) {
  const container = $('socialPreview');
  if (!container) return;
  container.innerHTML = '';

  if (!preview || !(preview.title || preview.description || preview.image)) {
    container.innerHTML = '<div class="social-preview-placeholder">No social preview available</div>';
    return;
  }

  const card = document.createElement('div');
  card.className = 'social-preview-card';

  if (preview.image) {
    const img = document.createElement('img');
    img.className = 'social-image';
    img.alt = 'Social preview image';
    img.addEventListener('error', () => {
      const fallback = document.createElement('div');
      fallback.className = 'image-error';
      fallback.textContent = 'Image not available';
      img.replaceWith(fallback);
    });
    img.src = preview.image;
    card.appendChild(img);
  } else {
    const noImage = document.createElement('div');
    noImage.className = 'image-error';
    noImage.textContent = 'No og:image set';
    card.appendChild(noImage);
  }

  const content = document.createElement('div');
  content.className = 'social-preview-content';
  const small = document.createElement('small');
  let host = preview.url || '';
  try {
    host = new URL(preview.url).hostname;
  } catch (error) {
    // Keep the raw value.
  }
  small.textContent = host;
  const heading = document.createElement('h4');
  heading.textContent = preview.title || 'No title';
  const paragraph = document.createElement('p');
  paragraph.textContent = preview.description || 'No description';
  content.append(small, heading, paragraph);
  card.appendChild(content);
  container.appendChild(card);
}

function renderSocial(data) {
  const s = data.social;
  displaySocialPreview({
    title: s.ogTitle || s.twitterTitle || data.title.text,
    description: s.ogDescription || s.twitterDescription || data.metaDescription.text,
    image: s.ogImage || s.twitterImage,
    url: s.ogUrl || reportState.pageUrl
  });

  const tags = [
    ['og:title', s.ogTitle, 'bad'],
    ['og:description', s.ogDescription, 'warning'],
    ['og:image', s.ogImage, 'bad'],
    ['og:url', s.ogUrl, 'warning'],
    ['og:type', s.ogType, 'warning'],
    ['twitter:card', s.twitterCard, 'warning']
  ];
  $('socialTags').innerHTML = tags.map(([name, value, missingTone]) => `
    <li><code>${name}</code>${value
      ? `<span class="tag good" title="${escapeHtml(value)}">Set</span>`
      : `<span class="tag ${missingTone}">Missing</span>`}</li>`).join('');
}

/* ---------- Headings ---------- */

function renderHeadings(data) {
  const outline = data.headings.outline;
  const counts = data.headings.counts;

  $('headingCounts').innerHTML = [1, 2, 3, 4, 5, 6].map(level => `
    <div class="heading-count"><strong>${counts[`h${level}`] || 0}</strong><span>H${level}</span></div>`).join('');

  const issueIndexes = new Map(data.headingOrder.issues.map(issue => [issue.index, issue]));
  $('headingsSummary').textContent = `${outline.length} heading(s) · ${counts.h1 || 0} H1 · ${data.headingOrder.issuesCount} order issue(s)`;

  const list = $('headingsOutline');
  list.innerHTML = '';
  if (outline.length === 0) {
    list.innerHTML = '<li class="empty">No headings found on this page.</li>';
    return;
  }

  outline.forEach(heading => {
    const level = Number(heading.tag.slice(1));
    const li = document.createElement('li');
    li.className = `lvl-${level}`;
    li.style.paddingLeft = `${6 + (level - 1) * 16}px`;
    const issue = issueIndexes.get(heading.index);
    if (issue) li.classList.add('skip');
    li.innerHTML = `
      <span class="h-tag">${heading.tag.toUpperCase()}</span>
      <span class="h-text">${escapeHtml(heading.text) || '<em>(empty)</em>'}</span>
      ${issue ? `<span class="h-note">skips from ${escapeHtml(issue.from)}</span>` : ''}`;
    list.appendChild(li);
  });
}

/* ---------- Links & images extras ---------- */

function renderUnnamedLinks(items) {
  const list = $('unnamedLinksList');
  list.innerHTML = '';
  if (!items || items.length === 0) {
    list.innerHTML = '<li class="empty">All links have a visible name or label.</li>';
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item.href || '(no href)';
    list.appendChild(li);
  });
}

function renderImageStats(data) {
  const images = data.images;
  const stats = [
    ['Images', images.total, ''],
    ['With alt text', images.withAlt, images.total && images.withAlt === images.total ? 'good' : ''],
    ['Missing alt', images.missingAlt, images.missingAlt ? 'bad' : 'good'],
    ['Missing size', images.missingDimensions, images.missingDimensions ? 'bad' : 'good']
  ];
  $('imageStats').innerHTML = stats.map(([label, value, tone]) => `
    <div class="stat ${tone}"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

/* ---------- Copy ---------- */

function buildSummaryText() {
  const data = reportState.seoData;
  const checks = getChecks(data);
  const lines = [
    `SEO Checklist report for ${reportState.pageUrl}`,
    `Score: ${reportState.scorePercent}/100 (${reportState.feedback})`,
    `Checked: ${formatReportDate(reportState.generatedAt)}`,
    ''
  ];
  const sections = [['bad', 'Issues', '✕'], ['warning', 'Warnings', '!'], ['good', 'Passed', '✓']];
  sections.forEach(([state, title, mark]) => {
    const items = checks.filter(check => getCheckState(check) === state);
    if (items.length === 0) return;
    lines.push(`${title} (${items.length}):`);
    items.forEach(check => lines.push(`${mark} ${check.label}: ${check.text}`));
    lines.push('');
  });
  lines.push(`Made with SEO Checklist for Chrome: ${STORE_URL}`);
  return lines.join('\n');
}

function copySummary() {
  if (!reportState.seoData) return;
  copyText(buildSummaryText(), 'Summary copied');
}

function copyList(kind) {
  const data = reportState.seoData;
  if (!data) return;
  if (kind === 'headings') {
    const text = data.headings.outline
      .map(heading => `${'  '.repeat(Number(heading.tag.slice(1)) - 1)}${heading.tag.toUpperCase()} ${heading.text}`)
      .join('\n');
    copyText(text || 'No headings', 'Outline copied');
  } else if (kind === 'links') {
    const externalActive = !$('externalLinksPanel').classList.contains('hidden');
    const urls = Array.from(new Set(externalActive ? data.links.externalUrls : data.links.internalUrls));
    copyText(urls.join('\n'), `${urls.length} link(s) copied`);
  }
}

/* ---------- Score history ---------- */

function getHistoryKey(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname + parsed.search;
  } catch (error) {
    return url;
  }
}

// Stored only on this device (chrome.storage.local).
async function recordHistory(url, score, failing) {
  const key = getHistoryKey(url);
  const { scoreHistory = {} } = await storageGet('scoreHistory');
  const entries = Array.isArray(scoreHistory[key]) ? scoreHistory[key] : [];
  const now = Date.now();
  const entry = { t: now, s: score, f: failing };

  // Re-checking without changes shouldn't flood the history, but a re-check
  // after a fix should always show the change.
  let previous = null;
  const last = entries[entries.length - 1];
  const sameResult = last && last.s === score && (last.f || []).join() === failing.join();
  if (last && sameResult && now - last.t < HISTORY_MERGE_MS) {
    previous = entries[entries.length - 2] || null;
    entries[entries.length - 1] = entry;
  } else {
    previous = last || null;
    entries.push(entry);
  }
  scoreHistory[key] = entries.slice(-HISTORY_PER_URL);

  const keys = Object.keys(scoreHistory);
  if (keys.length > HISTORY_MAX_URLS) {
    keys
      .sort((a, b) => scoreHistory[a][scoreHistory[a].length - 1].t - scoreHistory[b][scoreHistory[b].length - 1].t)
      .slice(0, keys.length - HISTORY_MAX_URLS)
      .forEach(oldKey => delete scoreHistory[oldKey]);
  }

  await storageSet({ scoreHistory });
  return { entries: scoreHistory[key], previous };
}

function renderHistory(history, failingNow, scoredChecks) {
  const { entries, previous } = history;
  const deltaEl = $('scoreDelta');
  const labelById = new Map(scoredChecks.map(check => [check.id, check.label]));

  if (previous) {
    const diff = reportState.scorePercent - previous.s;
    const fixed = (previous.f || []).filter(id => !failingNow.includes(id)).map(id => labelById.get(id)).filter(Boolean);
    const sign = diff > 0 ? `<span class="up">▲ +${diff}</span>` : (diff < 0 ? `<span class="down">▼ ${diff}</span>` : 'No change');
    const fixedText = fixed.length ? ` · Fixed: ${escapeHtml(fixed.slice(0, 3).join(', '))}${fixed.length > 3 ? '…' : ''}` : '';
    deltaEl.innerHTML = `${sign} since ${escapeHtml(timeAgo(previous.t))}${fixedText}`;
  } else {
    deltaEl.textContent = 'First check on this page. Fix an issue and re-check to track your progress.';
  }

  const best = Math.max(...entries.map(item => item.s));
  $('historyCaption').textContent = entries.length > 1
    ? `${entries.length} checks · best ${best}`
    : 'Your score history starts now';
  renderSparkline(entries.map(item => item.s));
}

function renderSparkline(values) {
  const svg = $('historySpark');
  const width = 120;
  const height = 40;
  const pad = 4;
  if (values.length === 0) {
    svg.innerHTML = '';
    return;
  }
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - pad - (value / 100) * (height - pad * 2);
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = points[points.length - 1];
  svg.innerHTML = `${values.length > 1 ? `<path class="area" d="${area}"/><path class="line" d="${line}"/>` : ''}<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3"/>`;
}

/* ---------- Review prompt ---------- */

async function maybeShowReviewPrompt() {
  const { reviewPrompt = { count: 0, state: 'none' } } = await storageGet('reviewPrompt');
  reviewPrompt.count = (reviewPrompt.count || 0) + 1;
  await storageSet({ reviewPrompt });

  const snoozeOver = reviewPrompt.state === 'later' && Date.now() - (reviewPrompt.laterAt || 0) > REVIEW_PROMPT_SNOOZE_MS;
  const eligible = reviewPrompt.count >= REVIEW_PROMPT_AFTER_ANALYSES && (reviewPrompt.state === 'none' || snoozeOver);
  $('reviewCard').classList.toggle('hidden', !eligible);
}

async function setReviewPromptState(state) {
  const { reviewPrompt = { count: 0 } } = await storageGet('reviewPrompt');
  reviewPrompt.state = state;
  if (state === 'later') reviewPrompt.laterAt = Date.now();
  await storageSet({ reviewPrompt });
  $('reviewCard').classList.add('hidden');
}

function getHeadingOrderIssues(headings) {
  const issues = [];
  let previousLevel = null;

  headings.forEach((heading) => {
    const level = Number(heading.tag.replace('h', ''));
    if (!Number.isInteger(level)) {
      return;
    }

    if (previousLevel !== null && level > previousLevel + 1) {
      issues.push({
        from: `H${previousLevel}`,
        to: `H${level}`,
        text: heading.text,
        index: heading.index
      });
    }

    previousLevel = level;
  });

  return issues;
}

function hasDiscernibleLinkName(anchor) {
  const text = anchor.textContent ? anchor.textContent.trim() : '';
  if (text) return true;

  const ariaLabel = anchor.getAttribute('aria-label')?.trim() || '';
  if (ariaLabel) return true;

  const title = anchor.getAttribute('title')?.trim() || '';
  if (title) return true;

  const imageAlt = Array.from(anchor.querySelectorAll('img')).some(img => (img.getAttribute('alt') || '').trim());
  return imageAlt;
}

function parsePositiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeUrl(url, pageUrl) {
  if (!url) return null;
  try {
    return new URL(url, pageUrl).toString();
  } catch (error) {
    return null;
  }
}

let measureCanvas = null;

function measureTextWidth(text, font) {
  if (!text) return 0;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const context = measureCanvas.getContext('2d');
  context.font = font;
  return Math.round(context.measureText(text).width);
}

function getFirstSrcsetUrl(srcset) {
  if (!srcset) return '';
  return srcset.split(',')[0].trim().split(/\s+/)[0] || '';
}

// Lazy-loading scripts often leave a placeholder in src and put the real URL elsewhere.
function getImageSource(img) {
  const candidates = [
    img.getAttribute('src'),
    img.getAttribute('data-src'),
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-original'),
    getFirstSrcsetUrl(img.getAttribute('srcset')),
    getFirstSrcsetUrl(img.getAttribute('data-srcset'))
  ];
  return candidates
    .map(value => (value || '').trim())
    .find(value => value && !value.startsWith('data:')) || '';
}

function getMainContentText(doc) {
  const main = doc.querySelector('main, article, .main-content, .post-content');
  const root = main || doc.body;
  if (!root) return '';

  const clone = root.cloneNode(true);
  const nonContent = main
    ? 'script, style, noscript, template, svg, iframe'
    : 'script, style, noscript, template, svg, iframe, nav, header, footer, aside';
  clone.querySelectorAll(nonContent).forEach(node => node.remove());
  return clone.textContent || '';
}

const ANALYTICS_SRC_PATTERN = /googletagmanager\.com\/(gtag\/js|gtm\.js|ns\.html)|google-analytics\.com\/(analytics|ga)\.js/i;
const ANALYTICS_INLINE_PATTERN = /gtag\(\s*['"](config|js)['"]|googletagmanager\.com\/gtm\.js|GoogleAnalyticsObject|\bga\(\s*['"]create['"]/;
const ANALYTICS_ID_PATTERN = /\b(G-[A-Z0-9]{6,12}|UA-\d{4,10}-\d{1,4}|GTM-[A-Z0-9]{4,9})\b/g;

// Search Console verification tags are not analytics, so they are not counted here.
function detectGoogleAnalytics(doc) {
  const ids = new Set();
  let found = false;

  doc.querySelectorAll('script[src], iframe[src]').forEach(el => {
    const src = el.getAttribute('src') || '';
    if (!ANALYTICS_SRC_PATTERN.test(src)) return;
    found = true;
    (src.match(ANALYTICS_ID_PATTERN) || []).forEach(id => ids.add(id));
  });

  doc.querySelectorAll('script:not([src])').forEach(script => {
    const code = script.textContent || '';
    if (!ANALYTICS_INLINE_PATTERN.test(code)) return;
    found = true;
    (code.match(ANALYTICS_ID_PATTERN) || []).forEach(id => ids.add(id));
  });

  return { found, ids: Array.from(ids) };
}

function stripHash(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch (error) {
    return url || '';
  }
}

function getSchemaTypes(doc) {
  const types = new Set();
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node['@type']) [].concat(node['@type']).forEach(type => types.add(String(type)));
    if (node['@graph']) visit(node['@graph']);
  };

  doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      visit(JSON.parse(script.textContent));
    } catch (error) {
      types.add('Invalid JSON-LD');
    }
  });
  doc.querySelectorAll('[itemtype]').forEach(el => {
    const type = (el.getAttribute('itemtype') || '').split('/').pop();
    if (type) types.add(type);
  });
  return Array.from(types);
}

function getMetaContent(doc, selector) {
  const el = doc.querySelector(selector);
  return el ? (el.getAttribute('content') || '').trim() : '';
}

function getPageSEOData(doc, pageUrl) {
  function countWords(text) {
    const trimmed = (text || '').trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  const title = doc.title || '';
  const metaDesc = doc.querySelector('meta[name="description"]')?.content || '';
  const h1 = doc.querySelectorAll('h1');
  const h2 = doc.querySelectorAll('h2');
  const headingSequence = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading, index) => ({
    tag: heading.tagName.toLowerCase(),
    text: (heading.textContent || '').trim().slice(0, 120),
    index
  }));
  const headingOrderIssues = getHeadingOrderIssues(headingSequence);

  const wordCount = countWords(getMainContentText(doc));
  const images = doc.querySelectorAll('img');
  const imagesWithAlt = Array.from(images).filter(img => img.alt && img.alt.trim()).length;

  const imageAuditItems = Array.from(images)
    .map((img, index) => {
      const src = getImageSource(img);
      const normalizedSrc = normalizeUrl(src, pageUrl);
      const widthAttr = parsePositiveInt(img.getAttribute('width'));
      const heightAttr = parsePositiveInt(img.getAttribute('height'));
      const alt = (img.getAttribute('alt') || '').trim();

      return {
        index,
        src: normalizedSrc,
        rawSrc: src,
        alt,
        hasValidAlt: !!alt,
        width: widthAttr,
        height: heightAttr,
        hasExplicitDimensions: !!(widthAttr && heightAttr)
      };
    })
    .filter(item => item.src);

  const missingDimensionItems = imageAuditItems.filter(item => !item.hasExplicitDimensions);
  const missingAltItems = imageAuditItems.filter(item => !item.hasValidAlt);
  const attributeIssueItems = imageAuditItems.filter(item => !item.hasValidAlt || !item.hasExplicitDimensions);

  const linkElements = Array.from(doc.querySelectorAll('a[href]'));
  const unnamedLinks = linkElements
    .filter(anchor => !hasDiscernibleLinkName(anchor))
    .map(anchor => ({
      href: normalizeUrl(anchor.getAttribute('href'), pageUrl) || anchor.getAttribute('href') || '',
      text: (anchor.textContent || '').trim().slice(0, 80)
    }));

  const baseOrigin = pageUrl ? new URL(pageUrl).origin : null;
  const resolvedLinks = linkElements
    .map(a => a.getAttribute('href'))
    .filter(href => href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:'))
    .map(href => {
      try {
        const parsed = new URL(href, pageUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        const url = parsed.toString();
        return { url, isExternal: baseOrigin ? parsed.origin !== baseOrigin : false };
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);

  const internalUrls = resolvedLinks.filter(link => !link.isExternal).map(link => link.url);
  const externalUrls = resolvedLinks.filter(link => link.isExternal).map(link => link.url);
  const externalCount = externalUrls.length;
  const viewport = doc.querySelector('meta[name="viewport"]');
  const canonical = doc.querySelector('link[rel="canonical"]');
  const schema = doc.querySelector('script[type="application/ld+json"]');
  const analytics = detectGoogleAnalytics(doc);
  const canonicalUrl = canonical ? normalizeUrl(canonical.getAttribute('href'), pageUrl) : null;
  const robotsContent = [
    getMetaContent(doc, 'meta[name="robots" i]'),
    getMetaContent(doc, 'meta[name="googlebot" i]')
  ].filter(Boolean).join(', ');
  const robotsLower = robotsContent.toLowerCase();
  const schemaTypes = getSchemaTypes(doc);
  const faviconEl = doc.querySelector('link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]');
  const headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  headingSequence.forEach(heading => {
    headingCounts[heading.tag] += 1;
  });

  return {
    title: {
      text: title,
      length: title.length,
      pixelWidth: measureTextWidth(title, '20px Arial')
    },
    metaDescription: {
      text: metaDesc,
      length: metaDesc.length,
      pixelWidth: measureTextWidth(metaDesc, '14px Arial')
    },
    headings: {
      h1: h1.length,
      h2: h2.length,
      firstH1: h1.length ? (h1[0].textContent || '').trim().slice(0, 160) : '',
      outline: headingSequence,
      counts: headingCounts
    },
    headingOrder: {
      issuesCount: headingOrderIssues.length,
      issues: headingOrderIssues
    },
    content: { wordCount },
    images: {
      total: images.length,
      withAlt: imagesWithAlt,
      missingDimensions: missingDimensionItems.length,
      missingDimensionItems,
      missingAlt: missingAltItems.length,
      missingAltItems,
      attributeIssueItems,
      auditItems: imageAuditItems
    },
    links: {
      internal: internalUrls.length,
      internalUrls,
      externalUrls,
      externalCount,
      unnamedCount: unnamedLinks.length,
      unnamedLinks
    },
    viewport: !!viewport,
    canonical: !!canonical,
    canonicalUrl,
    canonicalIsSelf: !!canonicalUrl && stripHash(canonicalUrl) === stripHash(pageUrl),
    robots: {
      content: robotsContent,
      noindex: /\b(noindex|none)\b/.test(robotsLower),
      nofollow: /\b(nofollow|none)\b/.test(robotsLower)
    },
    lang: (doc.documentElement.getAttribute('lang') || '').trim(),
    schema: !!schema || schemaTypes.length > 0,
    schemaTypes,
    favicon: faviconEl
      ? normalizeUrl(faviconEl.getAttribute('href'), pageUrl)
      : (pageUrl ? normalizeUrl('/favicon.ico', pageUrl) : null),
    social: {
      ogTitle: getMetaContent(doc, 'meta[property="og:title"]'),
      ogDescription: getMetaContent(doc, 'meta[property="og:description"]'),
      ogImage: normalizeUrl(getMetaContent(doc, 'meta[property="og:image"]'), pageUrl) || '',
      ogUrl: getMetaContent(doc, 'meta[property="og:url"]'),
      ogType: getMetaContent(doc, 'meta[property="og:type"]'),
      siteName: getMetaContent(doc, 'meta[property="og:site_name"]'),
      twitterCard: getMetaContent(doc, 'meta[name="twitter:card"]'),
      twitterTitle: getMetaContent(doc, 'meta[name="twitter:title"]'),
      twitterDescription: getMetaContent(doc, 'meta[name="twitter:description"]'),
      twitterImage: normalizeUrl(getMetaContent(doc, 'meta[name="twitter:image"]'), pageUrl) || ''
    },
    gaTag: analytics.found,
    analyticsIds: analytics.ids
  };
}

function setExportButtonState(isEnabled) {
  const exportButton = document.getElementById('exportPdfBtn');
  if (!exportButton) return;
  exportButton.disabled = !isEnabled;
}

function resetReportState() {
  reportState.pageUrl = '';
  reportState.generatedAt = '';
  reportState.seoData = null;
  reportState.scorePercent = 0;
  reportState.feedback = '';
  reportState.brokenLinks = { items: [], meta: null };
  reportState.imageOptimization = { items: [], meta: null };
}

function getLengthTooltip(field, minChars, maxPx, name) {
  if (!field.length) return `No ${name} found`;
  if (field.pixelWidth > maxPx) {
    return `About ${field.pixelWidth}px wide. Google shows about ${maxPx}px, so this ${name} may be cut off: "${field.text}"`;
  }
  if (field.length < minChars) {
    return `Short ${name} (under ${minChars} characters). Add more detail: "${field.text}"`;
  }
  return `Fits in Google results (${field.pixelWidth}px of about ${maxPx}px): "${field.text}"`;
}

const CHECK_CATEGORIES = [
  { id: 'basic', label: 'Basic SEO' },
  { id: 'content', label: 'Content' },
  { id: 'indexing', label: 'Indexing & Social' },
  { id: 'technical', label: 'Technical' }
];

// impact: 3 = high, 2 = medium, 1 = low. Used to order "Top fixes".
const CHECK_META = {
  titleTagStatus: {
    category: 'basic', impact: 3,
    why: 'The title is the clickable headline in Google results and one of the strongest on-page ranking signals.',
    fix: 'Write a unique title of about 50-60 characters with the main keyword near the start, so it fits without being cut off.'
  },
  metaDescStatus: {
    category: 'basic', impact: 2,
    why: 'The description is often used as the snippet under your title and strongly affects click-through rate.',
    fix: 'Write a unique 120-160 character summary that matches search intent and ends with a reason to click.'
  },
  headingsStatus: {
    category: 'basic', impact: 2,
    why: 'One clear H1 tells search engines and readers what the page is about; H2s structure the sections.',
    fix: 'Use exactly one H1 for the main topic and break the content into sections with H2s.'
  },
  headingOrderStatus: {
    category: 'basic', impact: 1,
    why: 'Skipped heading levels make the outline harder to understand for screen readers and crawlers.',
    fix: 'Nest headings in order (H2 then H3, not H2 then H4). See the Headings tab for where levels are skipped.'
  },
  wordCountStatus: {
    category: 'content', impact: 2,
    why: 'Pages with very little text give search engines little to understand or rank.',
    fix: 'For articles and guides, add helpful detail that answers the searcher\'s question. Short is fine for contact or product pages.'
  },
  imageAltsStatus: {
    category: 'content', impact: 2,
    why: 'Alt text helps image search, accessibility, and context when images fail to load.',
    fix: 'Add a short, descriptive alt attribute to every meaningful image (use alt="" for purely decorative ones).'
  },
  internalLinksStatus: {
    category: 'content', impact: 2,
    why: 'Internal links help Google discover pages and pass authority between them.',
    fix: 'Link to at least 3 related pages on your site using descriptive anchor text.'
  },
  externalLinksStatus: {
    category: 'content', impact: 1,
    why: 'Linking to trustworthy sources can add context and credibility.',
    fix: 'Where it helps the reader, cite at least one relevant, authoritative source.'
  },
  linkNamesStatus: {
    category: 'content', impact: 1,
    why: 'Links without text or a label are meaningless to crawlers and screen readers.',
    fix: 'Give every link visible text, an aria-label, or an image with alt text. See the Links tab for the list.'
  },
  indexabilityStatus: {
    category: 'indexing', impact: 3,
    why: 'A noindex tag keeps the page out of Google completely; nofollow stops links on it from being followed.',
    fix: 'Remove noindex / nofollow from the robots meta tag if this page should rank.'
  },
  canonicalStatus: {
    category: 'indexing', impact: 3,
    why: 'The canonical tag tells Google which URL is the main version and prevents duplicate-content issues.',
    fix: 'Add <link rel="canonical" href="..."> pointing to this page\'s preferred URL (or the main version if this is a duplicate).'
  },
  langStatus: {
    category: 'indexing', impact: 1,
    why: 'The lang attribute helps search engines serve the page to the right language audience.',
    fix: 'Add a lang attribute to the <html> tag, for example <html lang="en">.'
  },
  socialTagsStatus: {
    category: 'indexing', impact: 1,
    why: 'Open Graph tags control how your page looks when shared on Facebook, LinkedIn, X and messaging apps.',
    fix: 'Add og:title, og:description and og:image (1200x630). Check the Search & Social tab for a preview.'
  },
  viewportStatus: {
    category: 'technical', impact: 3,
    why: 'Google uses mobile-first indexing; without a viewport tag the page renders badly on phones.',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.'
  },
  schemaStatus: {
    category: 'technical', impact: 2,
    why: 'Structured data can earn rich results (stars, FAQs, prices) and helps Google understand the page.',
    fix: 'Add JSON-LD for your page type (Article, Product, LocalBusiness, FAQ...). Test it with the Rich Results tool.'
  },
  gaTagStatus: {
    category: 'technical', impact: 1,
    why: 'Analytics lets you measure traffic and the effect of your SEO changes.',
    fix: 'Install Google Analytics 4 (gtag.js) or Google Tag Manager on every page.'
  },
  imageDimensionsStatus: {
    category: 'technical', impact: 2,
    why: 'Images without width and height cause layout shift, which hurts Core Web Vitals (CLS).',
    fix: 'Add width and height attributes to every <img> that match its aspect ratio.'
  },
  imageOptimizationStatus: {
    category: 'technical', impact: 2,
    why: 'Large images slow the page down, which hurts Core Web Vitals (LCP) and rankings.',
    fix: 'Compress images, resize them to their display size, and serve WebP or AVIF. See the Images tab.'
  },
  brokenLinksStatus: {
    category: 'technical', impact: 2,
    why: 'Broken links waste crawl budget and frustrate visitors.',
    fix: 'Fix or remove links that return errors. See the Links tab for the list.'
  }
};

function getImageOptimizationCheckState(data) {
  const result = reportState.imageOptimization;
  if (data.images.auditItems.length === 0) {
    return { good: true, warning: false, text: 'No images', tooltip: 'No images to optimize' };
  }
  if (result.meta && result.meta.unavailable) {
    return { good: false, warning: true, text: 'Unavailable', tooltip: 'This check could not run on this page' };
  }
  if (!result.meta) {
    return { pending: true, good: false, warning: false, text: 'Scanning...', tooltip: 'Checking image file sizes' };
  }
  const high = result.items.filter(item => item.scope === 'High').length;
  const needsReview = result.items.filter(item => item.scope === 'Medium' || item.scope === 'Unknown' || item.missingDimensions).length;
  if (high) return { good: false, warning: false, text: `${high} high`, tooltip: 'High-impact image optimization opportunities found' };
  if (needsReview) return { good: false, warning: true, text: 'Needs review', tooltip: 'Some images can be optimized further' };
  return { good: true, warning: false, text: 'Good', tooltip: 'No significant image optimization issues detected' };
}

function getBrokenLinksCheckState(data) {
  const result = reportState.brokenLinks;
  if (result.meta && result.meta.unavailable) {
    return { good: false, warning: true, text: 'Unavailable', tooltip: 'This check could not run on this page' };
  }
  if (!result.meta) {
    if (data.links.internalUrls.length === 0) {
      return { good: true, warning: false, text: '0 links', tooltip: 'No internal links to check' };
    }
    return { pending: true, good: false, warning: false, text: 'Checking...', tooltip: 'Checking links for errors' };
  }
  const broken = result.items.length;
  return broken
    ? { good: false, warning: false, text: `${broken} broken`, tooltip: 'Broken links detected' }
    : { good: true, warning: false, text: '0 broken', tooltip: 'No broken links detected' };
}

function getChecks(data) {
  return [
    {
      id: 'titleTagStatus',
      label: 'Title Tag',
      good: data.title.length >= TITLE_MIN_CHARS && data.title.pixelWidth <= TITLE_MAX_PX,
      warning: data.title.length > 0 && (data.title.length < TITLE_MIN_CHARS || data.title.pixelWidth > TITLE_MAX_PX),
      text: data.title.length ? `${data.title.length} chars · ${data.title.pixelWidth}px` : 'Missing',
      tooltip: getLengthTooltip(data.title, TITLE_MIN_CHARS, TITLE_MAX_PX, 'title')
    },
    {
      id: 'metaDescStatus',
      label: 'Meta Description',
      good: data.metaDescription.length >= DESCRIPTION_MIN_CHARS && data.metaDescription.pixelWidth <= DESCRIPTION_MAX_PX,
      warning: data.metaDescription.length > 0 && (data.metaDescription.length < DESCRIPTION_MIN_CHARS || data.metaDescription.pixelWidth > DESCRIPTION_MAX_PX),
      text: data.metaDescription.length ? `${data.metaDescription.length} chars · ${data.metaDescription.pixelWidth}px` : 'Missing',
      tooltip: getLengthTooltip(data.metaDescription, DESCRIPTION_MIN_CHARS, DESCRIPTION_MAX_PX, 'description')
    },
    {
      id: 'headingsStatus',
      label: 'Heading Structure',
      good: data.headings.h1 === 1 && data.headings.h2 >= 1,
      warning: data.headings.h1 === 1 && data.headings.h2 === 0,
      text: `H1: ${data.headings.h1}, H2: ${data.headings.h2}`,
      tooltip: `H1: ${data.headings.h1}, H2: ${data.headings.h2}`
    },
    {
      id: 'headingOrderStatus',
      label: 'Heading Order',
      good: data.headingOrder.issuesCount === 0,
      warning: data.headingOrder.issuesCount > 0 && data.headingOrder.issuesCount <= 2,
      text: data.headingOrder.issuesCount === 0 ? 'Pass' : `${data.headingOrder.issuesCount} issue(s)`,
      tooltip: data.headingOrder.issuesCount === 0 ? 'No heading level skips detected' : 'Heading levels are being skipped in parts of the page'
    },
    {
      id: 'wordCountStatus',
      label: 'Content Length',
      good: data.content.wordCount >= THIN_CONTENT_WORDS,
      warning: data.content.wordCount > 0 && data.content.wordCount < THIN_CONTENT_WORDS,
      text: `${data.content.wordCount} words`,
      tooltip: data.content.wordCount >= THIN_CONTENT_WORDS
        ? 'Enough content for search engines to understand the page'
        : `Thin content? Under ${THIN_CONTENT_WORDS} words is fine for contact or product pages, but articles usually need more`
    },
    {
      id: 'imageAltsStatus',
      label: 'Image Alt Texts',
      good: data.images.total === 0 || (data.images.withAlt / data.images.total) >= 0.8,
      warning: data.images.total > 0 && (data.images.withAlt / data.images.total) >= 0.5,
      text: `${data.images.withAlt}/${data.images.total}`,
      tooltip: ''
    },
    {
      id: 'internalLinksStatus',
      label: 'Internal Links',
      good: data.links.internal >= 3,
      warning: data.links.internal > 0 && data.links.internal < 3,
      text: `${data.links.internal} links`,
      tooltip: ''
    },
    {
      id: 'externalLinksStatus',
      label: 'External Links',
      good: data.links.externalCount >= 1,
      warning: false,
      text: `${data.links.externalCount} links`,
      tooltip: ''
    },
    {
      id: 'linkNamesStatus',
      label: 'Discernible Link Names',
      good: data.links.unnamedCount === 0,
      warning: data.links.unnamedCount > 0 && data.links.unnamedCount <= 2,
      text: data.links.unnamedCount === 0 ? 'Pass' : `${data.links.unnamedCount} issue(s)`,
      tooltip: data.links.unnamedCount === 0 ? 'All links have discernible names' : 'Some links have no visible text or accessible label'
    },
    {
      id: 'viewportStatus',
      label: 'Mobile Viewport',
      good: data.viewport,
      warning: false,
      text: data.viewport ? 'Found' : 'Missing',
      tooltip: data.viewport ? 'Viewport meta tag found' : 'No viewport meta tag'
    },
    {
      id: 'canonicalStatus',
      label: 'Canonical Tag',
      good: data.canonical && data.canonicalIsSelf,
      warning: data.canonical && !data.canonicalIsSelf,
      text: data.canonical ? (data.canonicalIsSelf ? 'Self' : 'Other URL') : 'Missing',
      tooltip: data.canonical
        ? (data.canonicalIsSelf
          ? `Points to this page: ${data.canonicalUrl}`
          : `Points to a different URL, so Google may index that one instead: ${data.canonicalUrl || '(invalid URL)'}`)
        : 'No canonical tag'
    },
    {
      id: 'indexabilityStatus',
      label: 'Indexable by Google',
      good: !data.robots.noindex && !data.robots.nofollow,
      warning: !data.robots.noindex && data.robots.nofollow,
      text: data.robots.noindex ? 'noindex' : (data.robots.nofollow ? 'nofollow' : 'Indexable'),
      tooltip: data.robots.content
        ? `Robots meta: ${data.robots.content}`
        : 'No robots meta tag, so the default (index, follow) applies'
    },
    {
      id: 'langStatus',
      label: 'Page Language',
      good: !!data.lang,
      warning: !data.lang,
      text: data.lang || 'Not set',
      tooltip: data.lang ? `<html lang="${data.lang}">` : 'No lang attribute on <html>'
    },
    {
      id: 'socialTagsStatus',
      label: 'Social Share Tags',
      good: !!(data.social.ogTitle && data.social.ogImage),
      warning: !(data.social.ogTitle && data.social.ogImage) && !!(data.social.ogTitle || data.social.ogImage || data.social.twitterCard),
      text: data.social.ogTitle && data.social.ogImage ? 'Set' : ((data.social.ogTitle || data.social.ogImage || data.social.twitterCard) ? 'Partial' : 'Missing'),
      tooltip: `og:title ${data.social.ogTitle ? 'set' : 'missing'} · og:image ${data.social.ogImage ? 'set' : 'missing'} · twitter:card ${data.social.twitterCard ? 'set' : 'missing'}`
    },
    {
      id: 'schemaStatus',
      label: 'Schema Markup',
      good: data.schema,
      warning: false,
      text: data.schema ? 'Found' : 'Missing',
      tooltip: data.schema ? `Found: ${data.schemaTypes.join(', ') || 'JSON-LD'}` : 'No schema markup'
    },
    {
      id: 'gaTagStatus',
      label: 'Google Analytics Tag',
      good: data.gaTag,
      warning: false,
      text: data.gaTag ? 'Found' : 'Missing',
      tooltip: data.gaTag
        ? (data.analyticsIds.length ? `Found: ${data.analyticsIds.join(', ')}` : 'Google Analytics / Tag Manager script found')
        : 'No Google Analytics or Tag Manager script detected'
    },
    {
      id: 'imageDimensionsStatus',
      label: 'Image Dimensions',
      good: data.images.total === 0 || data.images.missingDimensions === 0,
      warning: data.images.total > 0 && data.images.missingDimensions > 0 && (data.images.missingDimensions / data.images.total) <= 0.4,
      text: data.images.total === 0 ? 'No images' : `${data.images.total - data.images.missingDimensions}/${data.images.total}`,
      tooltip: data.images.missingDimensions === 0 ? 'All images have explicit width and height' : `${data.images.missingDimensions} image(s) missing width/height`
    },
    Object.assign({ id: 'imageOptimizationStatus', label: 'Image Optimization', async: true }, getImageOptimizationCheckState(data)),
    Object.assign({ id: 'brokenLinksStatus', label: 'Broken Links', async: true }, getBrokenLinksCheckState(data))
  ];
}


const LINK_CHECK_LIMIT = 50;
const LINK_CHECK_CONCURRENCY = 6;
const IMAGE_CHECK_LIMIT = 30;
const IMAGE_CHECK_CONCURRENCY = 4;

function resetBrokenLinksUI(totalLinks, externalCount) {
  const summary = document.getElementById('brokenLinksSummary');
  const list = document.getElementById('brokenLinksList');
  if (summary) {
    const externalNote = externalCount ? ` External links: ${externalCount}.` : '';
    summary.textContent = totalLinks > 0 ? `Checking ${totalLinks} internal link(s)...${externalNote}` : `No internal links found.${externalNote}`;
  }
  if (list) {
    list.innerHTML = '';
  }
  if (totalLinks === 0) {
    setBrokenLinksStatus('0 links', 'good', 'No internal links to check');
  }
}

function setBrokenLinksStatus(text, statusClass, tooltip) {
  updateCheckRow('brokenLinksStatus', text, statusClass, tooltip);
  const pill = document.getElementById('brokenLinksPill');
  if (pill) {
    pill.textContent = text;
    pill.className = `pill ${statusClass}`;
  }
}

function setImageOptimizationStatus(text, statusClass, tooltip) {
  updateCheckRow('imageOptimizationStatus', text, statusClass, tooltip);
  const pill = document.getElementById('imageOptimizationPill');
  if (pill) {
    pill.textContent = text;
    pill.className = `pill ${statusClass}`;
  }
}

function resetImageOptimizationUI(totalImages) {
  const summary = document.getElementById('imageOptimizationSummary');
  const list = document.getElementById('imageOptimizationList');

  if (summary) {
    summary.textContent = totalImages > 0
      ? `Analyzing ${totalImages} image(s) for size and optimization opportunities...`
      : 'No images found on page.';
  }

  if (list) {
    list.innerHTML = '';
  }

  if (totalImages === 0) {
    setImageOptimizationStatus('No images', 'good', 'No images to optimize');
  } else {
    setImageOptimizationStatus('Scanning...', 'warning', 'Checking image file sizes and optimization scope');
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function parseContentLength(value) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getImageExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot === -1) return '';
    return pathname.slice(lastDot + 1);
  } catch (error) {
    return '';
  }
}

function classifyImageOpportunity(sizeBytes, extension, missingDimensions) {
  let scope = 'Low';
  let recommendation = 'Keep current image settings.';

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    scope = missingDimensions ? 'Medium' : 'Unknown';
    recommendation = missingDimensions
      ? 'Add explicit width and height attributes and review compression manually.'
      : 'Unable to determine image size from headers; review manually.';
    return { scope, recommendation };
  }

  const sizeKb = sizeBytes / 1024;
  const modernFormatCandidate = ['jpg', 'jpeg', 'png'].includes(extension);

  if (sizeKb >= 500) {
    scope = 'High';
    recommendation = 'Large image detected. Compress aggressively, resize to rendered dimensions, and use WebP/AVIF.';
  } else if (sizeKb >= 200) {
    scope = 'Medium';
    recommendation = modernFormatCandidate
      ? 'Compress and convert to WebP/AVIF where possible.'
      : 'Compress and resize to appropriate display dimensions.';
  } else if (sizeKb >= 100 || missingDimensions) {
    scope = 'Low';
    recommendation = missingDimensions
      ? 'Add explicit width/height to reduce layout shift and review compression.'
      : 'Consider light compression or responsive sizing.';
  }

  return { scope, recommendation };
}

function describeImage(image, sizeBytes, error) {
  const classification = classifyImageOpportunity(sizeBytes, getImageExtension(image.src), !image.hasExplicitDimensions);
  const result = {
    url: image.src,
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    scope: classification.scope,
    recommendation: classification.recommendation,
    missingDimensions: !image.hasExplicitDimensions
  };
  if (error) result.error = error;
  return result;
}

// Runs from the popup, so it needs the optional host permission.
async function checkSingleImageOptimization(image) {
  try {
    let response = await fetch(image.src, {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(image.src, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow'
      });
    }

    return describeImage(image, parseContentLength(response.headers.get('content-length')));
  } catch (error) {
    return describeImage(image, null, error.message);
  }
}

function renderImageOptimizationResults(results, meta) {
  const summary = document.getElementById('imageOptimizationSummary');
  const list = document.getElementById('imageOptimizationList');
  if (!summary || !list) return;

  list.innerHTML = '';

  const sorted = results.slice().sort((a, b) => {
    const sizeA = Number.isFinite(a.sizeBytes) ? a.sizeBytes : -1;
    const sizeB = Number.isFinite(b.sizeBytes) ? b.sizeBytes : -1;
    return sizeB - sizeA;
  });

  const high = sorted.filter(item => item.scope === 'High').length;
  const medium = sorted.filter(item => item.scope === 'Medium').length;
  const unknown = sorted.filter(item => item.scope === 'Unknown').length;
  const missingDimensions = sorted.filter(item => item.missingDimensions).length;
  const skippedText = meta.skipped ? ` ${meta.skipped} skipped.` : '';

  const unknownHint = meta.unknownBecauseExternal
    ? ' Unknown sizes are for images on other domains; use "Check external links and images" to measure them.'
    : '';
  summary.textContent = `Checked ${meta.checked} image(s). High: ${high}, Medium: ${medium}, Missing width/height: ${missingDimensions}, Unknown size: ${unknown}.${skippedText}${unknownHint}`;

  if (high > 0) {
    setImageOptimizationStatus(`${high} high`, 'bad', 'High-impact image optimization opportunities found');
  } else if (medium > 0 || missingDimensions > 0 || unknown > 0) {
    setImageOptimizationStatus('Needs review', 'warning', 'Some images can be optimized further');
  } else {
    setImageOptimizationStatus('Good', 'good', 'No significant image optimization issues detected');
  }

  sorted.forEach(item => {
    const li = document.createElement('li');

    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.url;
    li.appendChild(link);

    const metaSpan = document.createElement('div');
    const dimensionsNote = item.missingDimensions ? ' | Missing width/height' : '';
    metaSpan.textContent = `Size: ${item.sizeLabel} | Scope: ${item.scope}${dimensionsNote}`;
    li.appendChild(metaSpan);

    const recommendation = document.createElement('div');
    recommendation.textContent = item.recommendation;
    li.appendChild(recommendation);

    list.appendChild(li);
  });

  reportState.imageOptimization = {
    items: sorted,
    meta
  };
  refreshDerivedUI();
}

function isHttpUrl(url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function runLinkChecks(urls, concurrency) {
  return runPool(urls, concurrency, checkSingleLink);
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

function hasHostAccess() {
  return new Promise(resolve => {
    if (!chrome.permissions) {
      resolve(false);
      return;
    }
    chrome.permissions.contains({ origins: HOST_ACCESS_ORIGINS }, granted => {
      resolve(!chrome.runtime.lastError && !!granted);
    });
  });
}

function runInPage(tabId, func, args) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, func, args }, results => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!results || !results[0]) {
        reject(new Error('No result from page'));
        return;
      }
      resolve(results[0].result);
    });
  });
}

// Injected into the analyzed page. Requests from here count as the page's own
// same-site requests, so they work with activeTab alone (no host permission).
// Must stay self-contained: it is serialized and run in the page.
async function pageContextResourceCheck(linkUrls, imageUrls, linkConcurrency, imageConcurrency) {
  async function pool(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index]);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async function headOrGet(url) {
    let response = await fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'follow' });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: 'GET', cache: 'no-store', redirect: 'follow' });
    }
    return response;
  }

  async function checkLink(url) {
    try {
      const response = await headOrGet(url);
      return { url, broken: response.status >= 400, status: response.status };
    } catch (error) {
      // A same-site link that redirects to another domain is blocked by CORS.
      // A no-cors request can't read the status, but it shows the server answered.
      try {
        await fetch(url, { mode: 'no-cors', cache: 'no-store' });
        return { url, broken: false, status: 'opaque' };
      } catch (secondError) {
        return { url, broken: true, status: 0, error: secondError.message };
      }
    }
  }

  // Images the page already loaded have their size in Resource Timing
  // (cross-origin ones only if the server sends Timing-Allow-Origin).
  const loadedSizes = new Map();
  performance.getEntriesByType('resource').forEach(entry => {
    // transferSize can be just the headers for cached files, so only body sizes count.
    const size = entry.encodedBodySize || entry.decodedBodySize || 0;
    if (size > 0) loadedSizes.set(entry.name, size);
  });

  async function checkImage(url) {
    if (loadedSizes.has(url)) {
      return { url, sizeBytes: loadedSizes.get(url) };
    }
    try {
      if (new URL(url).origin === location.origin) {
        const response = await headOrGet(url);
        const length = Number.parseInt(response.headers.get('content-length') || '', 10);
        return { url, sizeBytes: Number.isFinite(length) && length > 0 ? length : null };
      }
    } catch (error) {
      // Fall through to "unknown".
    }
    return { url, sizeBytes: null };
  }

  const [links, images] = await Promise.all([
    pool(linkUrls, linkConcurrency, checkLink),
    pool(imageUrls, imageConcurrency, checkImage)
  ]);
  return { links, images };
}

function getUniqueHttpImages(imageItems) {
  const uniqueMap = new Map();
  imageItems.forEach(item => {
    if (isHttpUrl(item.src) && !uniqueMap.has(item.src)) {
      uniqueMap.set(item.src, item);
    }
  });
  return Array.from(uniqueMap.values());
}

function setRemoteChecksUnavailable(reason) {
  const message = `Could not run this check: ${reason}. Refresh the page and try again.`;
  setBrokenLinksStatus('Unavailable', 'warning', message);
  setImageOptimizationStatus('Unavailable', 'warning', message);
  const brokenSummary = document.getElementById('brokenLinksSummary');
  const imageSummary = document.getElementById('imageOptimizationSummary');
  if (brokenSummary) brokenSummary.textContent = message;
  if (imageSummary) imageSummary.textContent = message;
  reportState.brokenLinks = { items: [], meta: { unavailable: true } };
  reportState.imageOptimization = { items: [], meta: { unavailable: true } };
  refreshDerivedUI();
}

async function runResourceChecks(tabId, data, runId) {
  const internalUrls = Array.from(new Set(data.links.internalUrls)).filter(isHttpUrl);
  const linkTargets = internalUrls.slice(0, LINK_CHECK_LIMIT);
  const images = getUniqueHttpImages(data.images.auditItems);
  const imageTargets = images.slice(0, IMAGE_CHECK_LIMIT);

  linkCheckState.pageData = data;
  linkCheckState.internal = [];
  linkCheckState.internalMeta = {
    checked: linkTargets.length,
    skipped: internalUrls.length - linkTargets.length,
    total: internalUrls.length,
    external: data.links.externalCount
  };
  linkCheckState.external = null;
  linkCheckState.externalMeta = null;

  const imageMeta = {
    checked: imageTargets.length,
    skipped: images.length - imageTargets.length,
    total: images.length
  };

  let pageResults;
  try {
    pageResults = await runInPage(tabId, pageContextResourceCheck, [
      linkTargets,
      imageTargets.map(image => image.src),
      LINK_CHECK_CONCURRENCY,
      IMAGE_CHECK_CONCURRENCY
    ]);
  } catch (error) {
    if (runId === analysisRunId) setRemoteChecksUnavailable(error.message);
    return;
  }
  if (runId !== analysisRunId) return;

  const canFetchAnywhere = await hasHostAccess();
  if (runId !== analysisRunId) return;

  linkCheckState.internal = pageResults.links || [];
  renderBrokenLinks();

  const sizeByUrl = new Map((pageResults.images || []).map(item => [item.url, item.sizeBytes]));
  const imageResults = await runPool(imageTargets, IMAGE_CHECK_CONCURRENCY, async image => {
    const size = sizeByUrl.get(image.src);
    if (Number.isFinite(size) && size > 0) return describeImage(image, size);
    if (canFetchAnywhere) return checkSingleImageOptimization(image);
    return describeImage(image, null);
  });
  if (runId !== analysisRunId) return;

  imageMeta.unknownBecauseExternal = !canFetchAnywhere && imageResults.some(item => !Number.isFinite(item.sizeBytes));
  if (imageTargets.length > 0) {
    renderImageOptimizationResults(imageResults, imageMeta);
  } else {
    reportState.imageOptimization = { items: [], meta: imageMeta };
  }

  const needsExternalAccess = data.links.externalCount > 0 || imageMeta.unknownBecauseExternal;
  if (canFetchAnywhere) {
    if (data.links.externalCount > 0) runExternalChecks(runId);
  } else {
    setExternalCheckButtonVisible(needsExternalAccess);
  }
}

function setExternalCheckButtonVisible(isVisible) {
  const button = document.getElementById('checkExternalLinksBtn');
  const note = document.getElementById('checkExternalLinksNote');
  if (button) button.classList.toggle('hidden', !isVisible);
  if (note) note.classList.toggle('hidden', !isVisible);
}

// Needs the optional host permission (requested by the "check external" button).
async function runExternalChecks(runId) {
  const data = linkCheckState.pageData;
  if (!data || runId !== analysisRunId) return;
  setExternalCheckButtonVisible(false);

  const externalUrls = Array.from(new Set(data.links.externalUrls)).filter(isHttpUrl);
  const targets = externalUrls.slice(0, LINK_CHECK_LIMIT);

  const imagesToRecheck = (reportState.imageOptimization.items || []).filter(item => !Number.isFinite(item.sizeBytes));
  const imageItemsByUrl = new Map(getUniqueHttpImages(data.images.auditItems).map(image => [image.src, image]));

  if (targets.length > 0) {
    setBrokenLinksStatus('Checking...', 'warning', 'Checking external links');
  }

  const [externalResults, recheckedImages] = await Promise.all([
    runLinkChecks(targets, LINK_CHECK_CONCURRENCY),
    runPool(imagesToRecheck, IMAGE_CHECK_CONCURRENCY, item => checkSingleImageOptimization(imageItemsByUrl.get(item.url) || {
      src: item.url,
      hasExplicitDimensions: !item.missingDimensions
    }))
  ]);
  if (runId !== analysisRunId) return;

  linkCheckState.external = externalResults;
  linkCheckState.externalMeta = {
    checked: targets.length,
    skipped: externalUrls.length - targets.length,
    total: externalUrls.length
  };
  renderBrokenLinks();

  if (recheckedImages.length > 0) {
    const recheckedByUrl = new Map(recheckedImages.map(item => [item.url, item]));
    const merged = reportState.imageOptimization.items.map(item => recheckedByUrl.get(item.url) || item);
    const meta = Object.assign({}, reportState.imageOptimization.meta, { unknownBecauseExternal: false });
    renderImageOptimizationResults(merged, meta);
  }
}

async function checkSingleLink(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (response.type === 'opaque') {
      return { url, broken: false, status: 'opaque' };
    }

    if (response.status === 405 || response.status === 501) {
      return checkSingleLinkWithGet(url);
    }

    return { url, broken: response.status >= 400, status: response.status };
  } catch (error) {
    return { url, broken: true, status: 0, error: error.message };
  }
}

async function checkSingleLinkWithGet(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (response.type === 'opaque') {
      return { url, broken: false, status: 'opaque' };
    }

    return { url, broken: response.status >= 400, status: response.status };
  } catch (error) {
    return { url, broken: true, status: 0, error: error.message };
  }
}

function renderBrokenLinks() {
  const summary = document.getElementById('brokenLinksSummary');
  const list = document.getElementById('brokenLinksList');
  if (!summary || !list) return;

  const { internal, internalMeta, external, externalMeta } = linkCheckState;
  const brokenLinks = internal
    .filter(item => item.broken)
    .map(item => Object.assign({ external: false }, item))
    .concat((external || []).filter(item => item.broken).map(item => Object.assign({}, item, { external: true })));

  const parts = [];
  if (internalMeta) {
    const skipped = internalMeta.skipped ? `, ${internalMeta.skipped} skipped` : '';
    parts.push(`Internal: ${internalMeta.checked} checked${skipped}.`);
  }
  if (externalMeta) {
    const skipped = externalMeta.skipped ? `, ${externalMeta.skipped} skipped` : '';
    parts.push(`External: ${externalMeta.checked} checked${skipped}.`);
  } else if (internalMeta && internalMeta.external) {
    parts.push(`External: ${internalMeta.external} not checked.`);
  }

  const headline = brokenLinks.length === 0
    ? 'No broken links found.'
    : `${brokenLinks.length} broken link(s) found.`;
  summary.textContent = `${headline} ${parts.join(' ')}`.trim();

  if (brokenLinks.length === 0) {
    setBrokenLinksStatus('0 broken', 'good', 'No broken links detected');
  } else {
    setBrokenLinksStatus(`${brokenLinks.length} broken`, 'bad', 'Broken links detected');
  }

  list.innerHTML = '';
  brokenLinks.forEach(item => {
    const li = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = item.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = item.url;
    li.appendChild(anchor);

    const notes = [];
    if (item.external) notes.push('external');
    if (item.status && item.status !== 'opaque') notes.push(`status: ${item.status}`);
    if (notes.length) {
      const status = document.createElement('span');
      status.textContent = ` (${notes.join(', ')})`;
      li.appendChild(status);
    }

    list.appendChild(li);
  });

  reportState.brokenLinks = {
    items: brokenLinks,
    meta: {
      internal: internalMeta,
      external: externalMeta
    }
  };
  refreshDerivedUI();
}

function getStatusLabel(check) {
  if (check.good) return 'Good';
  if (check.warning) return 'Needs improvement';
  return 'Issue';
}

function formatReportDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  return date.toLocaleString();
}

function buildReportHtmlList(items, emptyText, mapper) {
  if (!items || items.length === 0) {
    return `<li>${escapeHtml(emptyText)}</li>`;
  }

  return items.map(mapper).join('');
}

function exportReportAsPdf() {
  if (!reportState.seoData) {
    showPopupError('Run an analysis first, then export your PDF report.');
    return;
  }

  const checks = getChecks(reportState.seoData);
  const manifest = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : {
    name: 'SEO Checklist',
    version: 'N/A',
    description: ''
  };
  const extensionRuntimeUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('popup.html') : 'N/A';
  const developerName = 'Anupam Mondal';
  const developerWebsite = 'https://anupammondal.in/chrome-extension/seo-checklist';
  const otherExtensionUrl = 'https://chrome.google.com/webstore/detail/website-framework-detector/ebkogcpaeaofidbegiadlfcfhlnaccnn';
  const reportBrandLogo = 'https://lh3.googleusercontent.com/8We9a29usM_2xGFax2OqRYwoC5TZjn_S6uBp5hyO0EZelom1pxA3JSplJZkuGwSwCv0qX9vQI_22m5uDipxt4YMGiw=s120';
  const extensionNameForFile = (manifest.name || 'SEO Checklist').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  const timestampForFile = new Date(reportState.generatedAt || Date.now())
    .toISOString()
    .replace(/[:]/g, '-')
    .replace(/\.\d{3}Z$/, 'Z');
  const reportFileName = `${extensionNameForFile}-${timestampForFile}`;
  const reportScriptUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('report-print.js') : '';
  const reportTitle = escapeHtml(reportState.seoData.title.text || 'Untitled Page');
  const reportUrlRaw = reportState.pageUrl || '';
  let websiteUrlRaw = '';
  try {
    websiteUrlRaw = reportUrlRaw ? new URL(reportUrlRaw).origin : '';
  } catch (error) {
    websiteUrlRaw = '';
  }
  const reportUrl = escapeHtml(reportUrlRaw || 'N/A');
  const reportUrlHref = escapeHtml(reportUrlRaw || '#');
  const websiteUrl = escapeHtml(websiteUrlRaw || 'N/A');
  const websiteUrlHref = escapeHtml(websiteUrlRaw || '#');
  const generatedOn = escapeHtml(formatReportDate(reportState.generatedAt));

  const auditRows = checks.map(check => {
    const statusLabel = getStatusLabel(check);
    const statusClass = check.good ? 'good' : (check.warning ? 'warning' : 'bad');
    return `
      <tr>
        <td>${escapeHtml(check.label)}</td>
        <td><span class="chip ${statusClass}">${statusLabel}</span></td>
        <td>${escapeHtml(check.text)}</td>
      </tr>
    `;
  }).join('');

  const internalLinks = Array.from(new Set(reportState.seoData.links.internalUrls)).slice(0, 25);
  const externalLinks = Array.from(new Set(reportState.seoData.links.externalUrls)).slice(0, 25);
  const imageIssues = reportState.seoData.images.attributeIssueItems.slice(0, 25);
  const brokenLinks = (reportState.brokenLinks.items || []).slice(0, 25);
  const imageOpportunities = (reportState.imageOptimization.items || []).slice(0, 25);

  const printableHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(reportFileName)}</title>
  <style>
    :root {
      --bg: #f2f5fb;
      --card: #ffffff;
      --text: #0b1220;
      --muted: #5f6b82;
      --brand: #0f172a;
      --accent: #3b82f6;
      --accent-2: #8b5cf6;
      --good: #15803d;
      --warn: #b45309;
      --bad: #b91c1c;
      --line: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
    }
    .toolbar {
      position: sticky;
      top: 0;
      background: var(--bg);
      padding-bottom: 16px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .toolbar-note {
      font-size: 12px;
      color: var(--muted);
    }
    .btn {
      border: none;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
    }
    .btn:hover {
      filter: brightness(1.05);
    }
    .container {
      max-width: 1080px;
      margin: 0 auto;
      display: grid;
      gap: 14px;
    }
    .hero {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 22px;
      position: relative;
      overflow: hidden;
    }
    .hero::after {
      content: '';
      position: absolute;
      width: 220px;
      height: 220px;
      border-radius: 999px;
      right: -90px;
      top: -90px;
      background: radial-gradient(circle, rgba(59,130,246,.12) 0%, rgba(139,92,246,.06) 55%, rgba(255,255,255,0) 80%);
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      position: relative;
      z-index: 1;
    }
    .hero-brand {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .hero-logo {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid #dbeafe;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
      background: #fff;
      flex-shrink: 0;
    }
    .badge {
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #fff;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .hero h1 {
      margin: 0 0 6px 0;
      font-size: 25px;
    }
    .cover-note {
      margin-top: 8px;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.6;
      max-width: 720px;
      position: relative;
      z-index: 1;
    }
    .cover-meta-grid {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      position: relative;
      z-index: 1;
    }
    .cover-meta-item {
      background: #f8fbff;
      border: 1px solid #dbeafe;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.5;
      word-break: break-all;
    }
    .cover-meta-item strong {
      color: #1e3a8a;
    }
    .meta {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.7;
      word-break: break-all;
      margin-top: 8px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
    }
    .label { color: var(--muted); font-size: 12px; }
    .value { margin-top: 6px; font-size: 22px; font-weight: 800; }
    .section {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 16px;
    }
    h2 {
      margin: 0 0 12px 0;
      font-size: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      text-align: left;
      padding: 10px 8px;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .chip {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 11px;
      font-weight: 700;
      color: white;
    }
    .chip.good { background: var(--good); }
    .chip.warning { background: var(--warn); }
    .chip.bad { background: var(--bad); }
    ol {
      margin: 0;
      padding-left: 20px;
      font-size: 12px;
      line-height: 1.6;
      display: grid;
      gap: 6px;
      word-break: break-all;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .info-item {
      background: #f8fbff;
      border: 1px solid #dce8ff;
      border-radius: 10px;
      padding: 10px;
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
    }
    .info-item strong {
      color: #1e3a8a;
      display: block;
      margin-bottom: 3px;
    }
    a.link {
      color: #1d4ed8;
      text-decoration: none;
    }
    a.link:hover {
      text-decoration: underline;
    }
    .footer {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.6;
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none; }
      .container { max-width: none; }
      .section, .card, .hero { break-inside: avoid; }
      .footer { break-inside: avoid; }
    }
    @media (max-width: 900px) {
      .cards,
      .grid,
      .info-grid,
      .cover-meta-grid {
        grid-template-columns: 1fr;
      }
      .footer {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-note" id="printHint">Use this button to print or save the report as PDF.</div>
    <button class="btn" id="printPdfBtn" type="button">Print / Save as PDF</button>
  </div>
  <div class="container">
    <section class="hero">
      <div class="hero-top">
        <div class="hero-brand">
          <img class="hero-logo" src="${escapeHtml(reportBrandLogo)}" alt="SEO Checklist logo">
          <div>
            <h1>SEO Checklist Report</h1>
            <div style="font-size:13px;color:var(--muted);">Report generated by the Chrome extension</div>
          </div>
        </div>
        <div class="badge">Professional SEO Audit</div>
      </div>
      <div class="cover-note">
        This professional technical SEO report is generated by skilled resources using automated checks and structured insights to support faster optimization decisions.
      </div>
      <div class="cover-meta-grid">
        <div class="cover-meta-item"><strong>Page Title:</strong> ${reportTitle}</div>
        <div class="cover-meta-item"><strong>Generated On:</strong> ${generatedOn}</div>
        <div class="cover-meta-item"><strong>Website URL:</strong> <a class="link" href="${websiteUrlHref}">${websiteUrl}</a></div>
        <div class="cover-meta-item"><strong>Page URL:</strong> <a class="link" href="${reportUrlHref}">${reportUrl}</a></div>
      </div>
    </section>

    <section class="cards">
      <article class="card">
        <div class="label">SEO Score</div>
        <div class="value">${reportState.scorePercent}%</div>
      </article>
      <article class="card">
        <div class="label">Feedback</div>
        <div class="value" style="font-size: 14px; font-weight: 700; line-height: 1.4;">${escapeHtml(reportState.feedback)}</div>
      </article>
      <article class="card">
        <div class="label">Key Issues</div>
        <div class="value">${reportState.seoData.links.unnamedCount + reportState.seoData.images.missingDimensions + reportState.seoData.headingOrder.issuesCount}</div>
      </article>
    </section>

    <section class="section">
      <h2>Audit Results</h2>
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>${auditRows}</tbody>
      </table>
    </section>

    <section class="section">
      <h2>Internal / External Links</h2>
      <div class="grid">
        <div>
          <h3 style="margin:0 0 8px 0;font-size:13px;">Internal Links (Top 25)</h3>
          <ol>${buildReportHtmlList(internalLinks, 'No internal links found.', (url) => `<li>${escapeHtml(url)}</li>`)}</ol>
        </div>
        <div>
          <h3 style="margin:0 0 8px 0;font-size:13px;">External Links (Top 25)</h3>
          <ol>${buildReportHtmlList(externalLinks, 'No external links found.', (url) => `<li>${escapeHtml(url)}</li>`)}</ol>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Broken Links</h2>
      <ol>
        ${buildReportHtmlList(
          brokenLinks,
          'No broken links found.',
          (item) => `<li>${escapeHtml(item.url)}${item.external ? ' (external)' : ''}${item.status && item.status !== 'opaque' ? ` (status: ${escapeHtml(String(item.status))})` : ''}</li>`
        )}
      </ol>
    </section>

    <section class="section">
      <h2>Image Attribute Issues</h2>
      <ol>
        ${buildReportHtmlList(
          imageIssues,
          'No images missing alt/width/height detected.',
          (item) => {
            const issueParts = [];
            if (!item.hasValidAlt) issueParts.push('Missing alt');
            if (!item.hasExplicitDimensions) issueParts.push('Missing width/height');
            return `<li>${escapeHtml(item.src)} - ${escapeHtml(issueParts.join(', '))}</li>`;
          }
        )}
      </ol>
    </section>

    <section class="section">
      <h2>Image Optimization Opportunities</h2>
      <ol>
        ${buildReportHtmlList(
          imageOpportunities,
          'No image optimization opportunities found.',
          (item) => `<li>${escapeHtml(item.url)} - ${escapeHtml(item.sizeLabel)} | ${escapeHtml(item.scope)} | ${escapeHtml(item.recommendation)}</li>`
        )}
      </ol>
    </section>

    <section class="section">
      <h2>Extension & Developer Details</h2>
      <div class="info-grid">
        <div class="info-item">
          <strong>Extension Details</strong>
          Name: ${escapeHtml(manifest.name || 'SEO Checklist')}<br>
          Version: ${escapeHtml(manifest.version || 'N/A')}<br>
          Description: ${escapeHtml(manifest.description || 'On-page SEO audit report')}
        </div>
        <div class="info-item">
          <strong>Extension URL</strong>
          Runtime URL: <a class="link" href="${escapeHtml(extensionRuntimeUrl)}">${escapeHtml(extensionRuntimeUrl)}</a><br>
          Audit Target URL: <a class="link" href="${reportUrlHref}">${reportUrl}</a>
        </div>
        <div class="info-item">
          <strong>Developer Details</strong>
          Developer: ${escapeHtml(developerName)}<br>
          Website: <a class="link" href="${escapeHtml(developerWebsite)}">${escapeHtml(developerWebsite)}</a>
        </div>
        <div class="info-item">
          <strong>More Products & Services</strong>
          Explore: <a class="link" href="${escapeHtml(otherExtensionUrl)}">Website Framework Detector</a><br>
          Services: SEO consulting, technical audits, performance optimization, and custom extensions.
        </div>
      </div>
    </section>

    <div class="footer">
      <div>
        Report generated by : Google Chrome Extension (<a class="link" href="https://chromewebstore.google.com/detail/jgigdhidhmgikfnccdnehcpgoggmagfh?utm_source=item-share-cb">SEO Checklist</a>) on ${generatedOn}.
      </div>
      <div>
        Developed by : <a class="link" href="https://anupammondal.in/">Anupam Mondal</a>
      </div>
    </div>
  </div>
  <script src="${escapeHtml(reportScriptUrl)}"></script>
</body>
</html>`;

  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    showPopupError('Unable to open the report window. Please allow pop-ups and try again.');
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(printableHtml);
  reportWindow.document.close();
}

// Utility to escape HTML for safe display
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, function(m) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m];
  });
}


function renderLinksOverview(internalUrls, externalUrls) {
  const summary = document.getElementById('linksOverviewSummary');
  const internalList = document.getElementById('internalLinksList');
  const externalList = document.getElementById('externalLinksList');
  if (!summary || !internalList || !externalList) return;

  internalList.innerHTML = '';
  externalList.innerHTML = '';

  const uniqueInternal = Array.from(new Set(internalUrls || []));
  const uniqueExternal = Array.from(new Set(externalUrls || []));

  summary.textContent = `Internal: ${uniqueInternal.length}, External: ${uniqueExternal.length}`;

  if (uniqueInternal.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No internal links found.';
    internalList.appendChild(li);
  } else {
    uniqueInternal.forEach(url => {
      const li = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = url;
      li.appendChild(anchor);
      internalList.appendChild(li);
    });
  }

  if (uniqueExternal.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No external links found.';
    externalList.appendChild(li);
  } else {
    uniqueExternal.forEach(url => {
      const li = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = url;
      li.appendChild(anchor);
      externalList.appendChild(li);
    });
  }
}

function renderImageAttributeIssues(items) {
  const summary = document.getElementById('imageAttributesSummary');
  const list = document.getElementById('imageAttributesList');
  if (!summary || !list) return;

  list.innerHTML = '';

  const issueItems = items || [];
  if (issueItems.length === 0) {
    summary.textContent = 'All images have valid alt and explicit width/height attributes.';
    return;
  }

  const missingAlt = issueItems.filter(item => !item.hasValidAlt).length;
  const missingDimensions = issueItems.filter(item => !item.hasExplicitDimensions).length;
  summary.textContent = `Found ${issueItems.length} image(s) with attribute issues. Missing alt: ${missingAlt}, missing width/height: ${missingDimensions}.`;

  issueItems.forEach(item => {
    const li = document.createElement('li');

    const anchor = document.createElement('a');
    anchor.href = item.src;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = item.src;
    li.appendChild(anchor);

    const issueParts = [];
    if (!item.hasValidAlt) {
      issueParts.push('Missing valid alt');
    }
    if (!item.hasExplicitDimensions) {
      issueParts.push('Missing width/height');
    }

    const meta = document.createElement('div');
    meta.textContent = issueParts.join(' | ');
    li.appendChild(meta);

    list.appendChild(li);
  });
}
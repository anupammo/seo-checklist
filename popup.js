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

const REMOTE_AUDITS_ENABLED = false;

let socialPreviewEl = null;

function isInjectablePageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  return url.startsWith('http://') || url.startsWith('https://');
}

document.addEventListener('DOMContentLoaded', function() {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const loading = document.getElementById('loading');
  const resultsContainer = document.getElementById('resultsContainer');
  const detailedResults = document.getElementById('detailedResults');
  const seoScore = document.getElementById('seoScore');
  const scoreCard = document.querySelector('.score-card');
  const scoreFeedback = document.getElementById('scoreFeedback');
  socialPreviewEl = document.getElementById('socialPreview');

  // Test Tools Button Handlers
  const structuredDataBtn = document.getElementById('structuredDataBtn');
  const pageSpeedBtn = document.getElementById('pageSpeedBtn');
  const facebookDebugBtn = document.getElementById('facebookDebugBtn');
  const linkedinInspectorBtn = document.getElementById('linkedinInspectorBtn');

  structuredDataBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentUrl = encodeURIComponent(tabs[0].url);
      const testUrl = `https://search.google.com/test/rich-results?url=${currentUrl}`;
      chrome.tabs.create({url: testUrl});
    });
  });

  pageSpeedBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentUrl = encodeURIComponent(tabs[0].url);
      const testUrl = `https://pagespeed.web.dev/report?url=${currentUrl}`;
      chrome.tabs.create({url: testUrl});
    });
  });

  facebookDebugBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentUrl = encodeURIComponent(tabs[0].url);
      const testUrl = `https://developers.facebook.com/tools/debug/?q=${currentUrl}`;
      chrome.tabs.create({url: testUrl});
    });
  });

  linkedinInspectorBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentUrl = encodeURIComponent(tabs[0].url);
      const testUrl = `https://www.linkedin.com/post-inspector/inspect/${currentUrl}`;
      chrome.tabs.create({url: testUrl});
    });
  });

  analyzeBtn.addEventListener('click', function() {
    resetReportState();
    setExportButtonState(false);
    loading.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    detailedResults.innerHTML = '';
    seoScore.textContent = '0%';
    updateSpeedometer(scoreCard, 0);
    scoreFeedback.textContent = 'Initializing analysis...';

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      reportState.pageUrl = tab.url || '';
      if (!isInjectablePageUrl(reportState.pageUrl)) {
        alert('This page cannot be analyzed. Open a regular website (http or https) and try again.');
        loading.classList.add('hidden');
        return;
      }
      if (!chrome.scripting) {
        alert('chrome.scripting API not available. Make sure you are using Manifest V3 and have the correct permissions.');
        loading.classList.add('hidden');
        return;
      }
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => document.documentElement.outerHTML
      }, (results) => {
        if (chrome.runtime.lastError || !results || !results[0] || !results[0].result) {
          alert('Unable to fetch page HTML. Try refreshing the page or check permissions.');
          loading.classList.add('hidden');
          return;
        }
        try {
          const html = results[0].result;
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const data = getPageSEOData(doc, tab.url);
          displayResults(data);
          resultsContainer.classList.remove('hidden');
        } catch (e) {
          alert('Error analyzing HTML: ' + e.message);
        } finally {
          loading.classList.add('hidden');
        }
      });
    });
  });

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', exportReportAsPdf);
  }

  // Load social preview on popup open
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
    if (!tab || !isInjectablePageUrl(tab.url || '')) {
      displaySocialPreview(null);
      return;
    }

    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => {
        const title = document.querySelector('meta[property="og:title"]')?.content || document.querySelector('meta[name="twitter:title"]')?.content || document.title || '';
        const description = document.querySelector('meta[property="og:description"]')?.content || document.querySelector('meta[name="twitter:description"]')?.content || document.querySelector('meta[name="description"]')?.content || '';
        const image = document.querySelector('meta[property="og:image"]')?.content || document.querySelector('meta[name="twitter:image"]')?.content || '';
        const url = document.querySelector('meta[property="og:url"]')?.content || window.location.href;
        return { title, description, image, url };
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        displaySocialPreview(null);
        return;
      }

      if (results && results[0] && results[0].result) {
        const data = results[0].result;
        displaySocialPreview(data);
      } else {
        displaySocialPreview(null);
      }
    });
  });

  // Accordion UI for categories
  document.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', function() {
      const cat = header.parentElement;
      cat.classList.toggle('open');
    });
  });

  document.querySelectorAll('.analysis-toggle').forEach(toggle => {
    toggle.addEventListener('click', function() {
      const targetId = toggle.getAttribute('data-target');
      const content = document.getElementById(targetId);
      if (!content) return;

      const currentlyExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', currentlyExpanded ? 'false' : 'true');
      content.classList.toggle('hidden', currentlyExpanded);
    });
  });

  document.querySelectorAll('.detailed-toggle').forEach(toggle => {
    toggle.addEventListener('click', function() {
      const targetId = toggle.getAttribute('data-target');
      const content = document.getElementById(targetId);
      if (!content) return;

      const currentlyExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', currentlyExpanded ? 'false' : 'true');
      content.classList.toggle('hidden', currentlyExpanded);
    });
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
});

function displaySocialPreview(data) {
  if (!socialPreviewEl) {
    return;
  }

  if (data && (data.title || data.description || data.image)) {
    socialPreviewEl.innerHTML = `
      <div class="social-preview-card">
        ${data.image ? `<img src="${data.image}" alt="Social Preview Image" onerror="this.parentElement.innerHTML='<div class=\\'image-error\\'>Image not available</div>'">` : '<div class="image-error">No image</div>'}
        <div class="social-preview-content">
          <h4>${data.title || 'No Title'}</h4>
          <p>${data.description || 'No Description'}</p>
          <small>${data.url}</small>
        </div>
      </div>
    `;
  } else {
    socialPreviewEl.innerHTML = `
      <div class="social-preview-placeholder">
        No Social Preview Available
      </div>
    `;
  }
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

function getPageSEOData(doc, pageUrl) {
  function countWords(text) {
    return text ? text.trim().split(/\s+/).length : 0;
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

  const mainContent = doc.querySelector('main, article, .main-content, .post-content') || doc.body;
  const wordCount = countWords(mainContent.textContent);
  const images = doc.querySelectorAll('img');
  const imagesWithAlt = Array.from(images).filter(img => img.alt && img.alt.trim()).length;

  const imageAuditItems = Array.from(images)
    .map((img, index) => {
      const src = img.getAttribute('src') || '';
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
        const url = new URL(href, pageUrl).toString();
        const origin = new URL(url).origin;
        return { url, isExternal: baseOrigin ? origin !== baseOrigin : false };
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
  const gaTag = doc.querySelector('script[src*="googletagmanager"], script[src*="google-analytics"], meta[name="google-site-verification"]') || 
                 doc.body.innerHTML.includes('gtag') || 
                 doc.body.innerHTML.includes('GA_MEASUREMENT_ID');

  return {
    title: { text: title, length: title.length },
    metaDescription: { text: metaDesc, length: metaDesc.length },
    headings: { h1: h1.length, h2: h2.length },
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
    schema: !!schema,
    gaTag: !!gaTag
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

function getChecks(data) {
  return [
    {
      id: 'titleTagStatus',
      label: 'Title Tag',
      good: data.title.length >= 50 && data.title.length <= 60,
      warning: data.title.length > 0 && (data.title.length < 50 || data.title.length > 60),
      text: `${data.title.length} chars`,
      tooltip: data.title.text
    },
    {
      id: 'metaDescStatus',
      label: 'Meta Description',
      good: data.metaDescription.length >= 120 && data.metaDescription.length <= 160,
      warning: data.metaDescription.length > 0 && (data.metaDescription.length < 120 || data.metaDescription.length > 160),
      text: `${data.metaDescription.length} chars`,
      tooltip: data.metaDescription.text
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
      good: data.content.wordCount >= 500,
      warning: data.content.wordCount > 0 && data.content.wordCount < 500,
      text: `${data.content.wordCount} words`,
      tooltip: ''
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
      good: data.canonical,
      warning: false,
      text: data.canonical ? 'Found' : 'Missing',
      tooltip: data.canonical ? 'Canonical tag found' : 'No canonical tag'
    },
    {
      id: 'schemaStatus',
      label: 'Schema Markup',
      good: data.schema,
      warning: false,
      text: data.schema ? 'Found' : 'Missing',
      tooltip: data.schema ? 'Schema markup found' : 'No schema markup'
    },
    {
      id: 'gaTagStatus',
      label: 'Google Analytics Tag',
      good: data.gaTag,
      warning: false,
      text: data.gaTag ? 'Found' : 'Missing',
      tooltip: data.gaTag ? 'Google Analytics tag found' : 'No Google Analytics tag detected'
    },
    {
      id: 'imageDimensionsStatus',
      label: 'Image Dimensions',
      good: data.images.total === 0 || data.images.missingDimensions === 0,
      warning: data.images.total > 0 && data.images.missingDimensions > 0 && (data.images.missingDimensions / data.images.total) <= 0.4,
      text: data.images.total === 0 ? 'No images' : `${data.images.total - data.images.missingDimensions}/${data.images.total}`,
      tooltip: data.images.missingDimensions === 0 ? 'All images have explicit width and height' : `${data.images.missingDimensions} image(s) missing width/height`
    },
    {
      id: 'imageOptimizationStatus',
      label: 'Image Optimization',
      good: !REMOTE_AUDITS_ENABLED || data.images.auditItems.length === 0,
      warning: REMOTE_AUDITS_ENABLED && data.images.auditItems.length > 0,
      text: REMOTE_AUDITS_ENABLED
        ? (data.images.auditItems.length === 0 ? 'No images' : 'Scanning...')
        : 'Disabled',
      tooltip: REMOTE_AUDITS_ENABLED
        ? (data.images.auditItems.length === 0 ? 'No images to optimize' : 'Analyzing image sizes and optimization scope')
        : 'Disabled in v1.2.9 after host permission removal'
    }
  ];
}

function displayResults(data) {
  // Status checks
  const checks = getChecks(data);

  // Score calculation
  let score = 0;
  let total = checks.length;
  let goodCount = 0;
  let warnCount = 0;

  checks.forEach(check => {
    let statusClass = 'bad';
    if (check.good) {
      statusClass = 'good';
      score += 1;
      goodCount += 1;
    } else if (check.warning) {
      statusClass = 'warning';
      score += 0.5;
      warnCount += 1;
    }
    const el = document.getElementById(check.id);
    if (el) {
      el.textContent = check.text;
      el.className = `status ${statusClass}`;
      el.setAttribute('data-tooltip', check.tooltip || '');
    }
  });

  // Show score
  const percent = Math.round((score / total) * 100);
  document.getElementById('seoScore').textContent = percent + '%';
  updateSpeedometer(document.querySelector('.score-card'), percent);

  // Feedback
  let feedback = '';
  if (percent === 100) {
    feedback = 'Excellent! Your page is well-optimized.';
  } else if (percent >= 80) {
    feedback = 'Great! Just a few improvements needed.';
  } else if (percent >= 60) {
    feedback = 'Good, but there are several areas to improve.';
  } else {
    feedback = 'Needs significant SEO improvements.';
  }
  document.getElementById('scoreFeedback').textContent = feedback;

  reportState.seoData = data;
  reportState.generatedAt = new Date().toISOString();
  reportState.scorePercent = percent;
  reportState.feedback = feedback;
  setExportButtonState(true);

  if (REMOTE_AUDITS_ENABLED) {
    setBrokenLinksStatus('Checking...', 'warning', 'Checking links for errors');
    resetBrokenLinksUI(data.links.internalUrls.length, data.links.externalCount);
    resetImageOptimizationUI(data.images.auditItems.length);
    checkBrokenLinks(data.links.internalUrls, data.links.externalCount);
    checkImageOptimization(data.images.auditItems);
  } else {
    disableRemoteAuditSections(data);
  }
  renderLinksOverview(data.links.internalUrls, data.links.externalUrls);
  renderImageAttributeIssues(data.images.attributeIssueItems);

  // Detailed results
  const detailedResults = document.getElementById('detailedResults');
  detailedResults.innerHTML = `
    <div class="detailed-item"><strong>Title:</strong> ${escapeHtml(data.title.text) || '<span class="tag">Not found</span>'}</div>
    <div class="detailed-item"><strong>Meta Description:</strong> ${escapeHtml(data.metaDescription.text) || '<span class="tag">Not found</span>'}</div>
    <div class="detailed-item"><strong>Content Words:</strong> ${data.content.wordCount}</div>
    <div class="detailed-item"><strong>Images with Alt:</strong> ${data.images.withAlt} / ${data.images.total}</div>
    <div class="detailed-item"><strong>Images Missing Alt:</strong> ${data.images.missingAlt}</div>
    <div class="detailed-item"><strong>Heading Order Issues:</strong> ${data.headingOrder.issuesCount}</div>
    <div class="detailed-item"><strong>Links Without Discernible Name:</strong> ${data.links.unnamedCount}</div>
    <div class="detailed-item"><strong>Images Missing Width/Height:</strong> ${data.images.missingDimensions}</div>
    <div class="detailed-item"><strong>Internal Links:</strong> ${data.links.internal}</div>
    <div class="detailed-item"><strong>External Links:</strong> ${data.links.externalCount}</div>
    <div class="detailed-item"><strong>Viewport:</strong> ${data.viewport ? '<span class="tag">Yes</span>' : '<span class="tag">No</span>'}</div>
    <div class="detailed-item"><strong>Canonical:</strong> ${data.canonical ? '<span class="tag">Yes</span>' : '<span class="tag">No</span>'}</div>
    <div class="detailed-item"><strong>Schema:</strong> ${data.schema ? '<span class="tag">Yes</span>' : '<span class="tag">No</span>'}</div>
    <div class="detailed-item"><strong>Google Analytics:</strong> ${data.gaTag ? '<span class="tag">Yes</span>' : '<span class="tag">No</span>'}</div>
  `;
}

const LINK_CHECK_LIMIT = 50;
const LINK_CHECK_CONCURRENCY = 6;
const IMAGE_CHECK_LIMIT = 30;
const IMAGE_CHECK_CONCURRENCY = 4;

function resetBrokenLinksUI(totalLinks, externalCount) {
  const summary = document.getElementById('brokenLinksSummary');
  const list = document.getElementById('brokenLinksList');
  if (summary) {
    const externalNote = externalCount ? ` External links skipped: ${externalCount}.` : '';
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
  const el = document.getElementById('brokenLinksStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `status ${statusClass}`;
  if (tooltip) {
    el.setAttribute('data-tooltip', tooltip);
  }
}

function setImageOptimizationStatus(text, statusClass, tooltip) {
  const el = document.getElementById('imageOptimizationStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `status ${statusClass}`;
  if (tooltip) {
    el.setAttribute('data-tooltip', tooltip);
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

async function checkImageOptimization(imageItems) {
  const uniqueMap = new Map();
  imageItems.forEach(item => {
    if (!uniqueMap.has(item.src)) {
      uniqueMap.set(item.src, item);
    }
  });

  const uniqueImages = Array.from(uniqueMap.values()).filter(item => isHttpUrl(item.src));
  if (uniqueImages.length === 0) {
    setImageOptimizationStatus('No images', 'good', 'No HTTP(S) images to optimize');
    reportState.imageOptimization = {
      items: [],
      meta: { checked: 0, skipped: 0, total: 0 }
    };
    return;
  }

  const limitedImages = uniqueImages.slice(0, IMAGE_CHECK_LIMIT);
  const skippedCount = Math.max(0, uniqueImages.length - limitedImages.length);
  const results = await runImageOptimizationChecks(limitedImages, IMAGE_CHECK_CONCURRENCY);

  renderImageOptimizationResults(results, {
    checked: limitedImages.length,
    skipped: skippedCount,
    total: uniqueImages.length
  });
}

async function runImageOptimizationChecks(images, concurrency) {
  const results = [];
  let currentIndex = 0;

  const workers = new Array(Math.min(concurrency, images.length)).fill(null).map(async () => {
    while (currentIndex < images.length) {
      const image = images[currentIndex];
      currentIndex += 1;
      const result = await checkSingleImageOptimization(image);
      results.push(result);
    }
  });

  await Promise.all(workers);
  return results;
}

async function checkSingleImageOptimization(image) {
  const extension = getImageExtension(image.src);

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

    const sizeBytes = parseContentLength(response.headers.get('content-length'));
    const classification = classifyImageOpportunity(sizeBytes, extension, !image.hasExplicitDimensions);

    return {
      url: image.src,
      sizeBytes,
      sizeLabel: formatBytes(sizeBytes),
      scope: classification.scope,
      recommendation: classification.recommendation,
      missingDimensions: !image.hasExplicitDimensions
    };
  } catch (error) {
    const classification = classifyImageOpportunity(null, extension, !image.hasExplicitDimensions);
    return {
      url: image.src,
      sizeBytes: null,
      sizeLabel: 'Unknown',
      scope: classification.scope,
      recommendation: classification.recommendation,
      missingDimensions: !image.hasExplicitDimensions,
      error: error.message
    };
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

  summary.textContent = `Checked ${meta.checked} image(s). High: ${high}, Medium: ${medium}, Missing width/height: ${missingDimensions}, Unknown size: ${unknown}.${skippedText}`;

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
}

function isHttpUrl(url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function checkBrokenLinks(urls, externalCount) {
  const uniqueUrls = Array.from(new Set(urls)).filter(isHttpUrl);
  if (uniqueUrls.length === 0) {
    reportState.brokenLinks = {
      items: [],
      meta: { checked: 0, skipped: 0, total: 0, external: externalCount }
    };
    return;
  }

  const limitedUrls = uniqueUrls.slice(0, LINK_CHECK_LIMIT);
  const skippedCount = Math.max(0, uniqueUrls.length - limitedUrls.length);

  const results = await runLinkChecks(limitedUrls, LINK_CHECK_CONCURRENCY);
  const broken = results.filter(result => result.broken);
  renderBrokenLinks(broken, {
    checked: limitedUrls.length,
    skipped: skippedCount,
    total: uniqueUrls.length,
    external: externalCount
  });
}

async function runLinkChecks(urls, concurrency) {
  const results = [];
  let currentIndex = 0;

  const workers = new Array(Math.min(concurrency, urls.length)).fill(null).map(async () => {
    while (currentIndex < urls.length) {
      const url = urls[currentIndex];
      currentIndex += 1;
      const result = await checkSingleLink(url);
      results.push(result);
    }
  });

  await Promise.all(workers);
  return results;
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

function renderBrokenLinks(brokenLinks, meta) {
  const summary = document.getElementById('brokenLinksSummary');
  const list = document.getElementById('brokenLinksList');

  if (!summary || !list) return;

  list.innerHTML = '';

  if (brokenLinks.length === 0) {
    const skippedNote = meta.skipped ? ` (${meta.skipped} skipped)` : '';
    const externalNote = meta.external ? ` External links skipped: ${meta.external}.` : '';
    summary.textContent = `No broken internal links found. Checked ${meta.checked}.${skippedNote}${externalNote}`;
    setBrokenLinksStatus('0 broken', 'good', 'No broken links detected');
    reportState.brokenLinks = {
      items: brokenLinks,
      meta
    };
    return;
  }

  const skippedText = meta.skipped ? `, ${meta.skipped} skipped` : '';
  const externalText = meta.external ? `. External links skipped: ${meta.external}.` : '.';
  summary.textContent = `${brokenLinks.length} broken internal link(s) found. Checked ${meta.checked}${skippedText}${externalText}`;
  setBrokenLinksStatus(`${brokenLinks.length} broken`, 'bad', 'Broken internal links detected');

  brokenLinks.forEach(item => {
    const li = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = item.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = item.url;
    li.appendChild(anchor);

    if (item.status && item.status !== 'opaque') {
      const status = document.createElement('span');
      status.textContent = ` (status: ${item.status})`;
      li.appendChild(status);
    }

    list.appendChild(li);
  });

  reportState.brokenLinks = {
    items: brokenLinks,
    meta
  };
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
    alert('Run an analysis first, then export your PDF report.');
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
      <h2>Broken Internal Links</h2>
      <ol>
        ${buildReportHtmlList(
          brokenLinks,
          'No broken internal links found.',
          (item) => `<li>${escapeHtml(item.url)}${item.status && item.status !== 'opaque' ? ` (status: ${escapeHtml(String(item.status))})` : ''}</li>`
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
    alert('Unable to open report window. Please allow pop-ups and try again.');
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

function updateSpeedometer(card, percent) {
  if (!card) return;
  const clamped = Math.max(0, Math.min(100, percent));
  const angle = (clamped / 100) * 180;
  const rotate = angle - 90;
  
  // Arc length of semicircle with radius 110: π * 110 ≈ 345.575
  const arcLength = Math.PI * 110;
  const dashoffset = arcLength * (1 - clamped / 100);
  
  // Set CSS variables
  card.style.setProperty('--score-angle', `${angle}deg`);
  card.style.setProperty('--score-rotate', `${rotate}deg`);
  
  // Update SVG stroke-dashoffset
  const ringElement = card.querySelector('.speedometer-ring');
  if (ringElement) {
    ringElement.style.strokeDashoffset = dashoffset;
  }
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

function disableRemoteAuditSections(data) {
  const disableMessage = 'Disabled in v1.2.9 due to host permission removal.';

  setBrokenLinksStatus('Disabled', 'warning', disableMessage);
  const brokenSummary = document.getElementById('brokenLinksSummary');
  const brokenList = document.getElementById('brokenLinksList');
  if (brokenSummary) {
    brokenSummary.textContent = disableMessage;
  }
  if (brokenList) {
    brokenList.innerHTML = '';
  }

  setImageOptimizationStatus('Disabled', 'warning', disableMessage);
  const imageSummary = document.getElementById('imageOptimizationSummary');
  const imageList = document.getElementById('imageOptimizationList');
  if (imageSummary) {
    imageSummary.textContent = disableMessage;
  }
  if (imageList) {
    imageList.innerHTML = '';
  }

  reportState.brokenLinks = {
    items: [],
    meta: {
      checked: 0,
      skipped: data.links.internalUrls.length,
      total: data.links.internalUrls.length,
      external: data.links.externalCount,
      disabled: true
    }
  };

  reportState.imageOptimization = {
    items: [],
    meta: {
      checked: 0,
      skipped: data.images.auditItems.length,
      total: data.images.auditItems.length,
      disabled: true
    }
  };
}

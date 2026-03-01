document.addEventListener('DOMContentLoaded', function() {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const loading = document.getElementById('loading');
  const resultsContainer = document.getElementById('resultsContainer');
  const detailedResults = document.getElementById('detailedResults');
  const seoScore = document.getElementById('seoScore');
  const scoreCard = document.querySelector('.score-card');
  const scoreFeedback = document.getElementById('scoreFeedback');
  const socialPreview = document.getElementById('socialPreview');

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
    loading.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    detailedResults.innerHTML = '';
    seoScore.textContent = '0%';
    updateSpeedometer(scoreCard, 0);
    scoreFeedback.textContent = 'Initializing analysis...';

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
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
          checkBrokenLinks(data.links.internalUrls, data.links.externalCount);
        } catch (e) {
          alert('Error analyzing HTML: ' + e.message);
        } finally {
          loading.classList.add('hidden');
        }
      });
    });
  });

  // Load social preview on popup open
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tab = tabs[0];
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
});

function displaySocialPreview(data) {
  if (data && (data.title || data.description || data.image)) {
    socialPreview.innerHTML = `
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
    socialPreview.innerHTML = `
      <div class="social-preview-placeholder">
        No Social Preview Available
      </div>
    `;
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
  const mainContent = doc.querySelector('main, article, .main-content, .post-content') || doc.body;
  const wordCount = countWords(mainContent.textContent);
  const images = doc.querySelectorAll('img');
  const imagesWithAlt = Array.from(images).filter(img => img.alt && img.alt.trim()).length;
  const baseOrigin = pageUrl ? new URL(pageUrl).origin : null;
  const resolvedLinks = Array.from(doc.querySelectorAll('a[href]'))
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
  const externalCount = resolvedLinks.filter(link => link.isExternal).length;
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
    content: { wordCount },
    images: { total: images.length, withAlt: imagesWithAlt },
    links: { internal: internalUrls.length, internalUrls, externalCount },
    viewport: !!viewport,
    canonical: !!canonical,
    schema: !!schema,
    gaTag: !!gaTag
  };
}

function displayResults(data) {
  // Status checks
  const checks = [
    {
      id: 'titleTagStatus',
      good: data.title.length >= 50 && data.title.length <= 60,
      warning: data.title.length > 0 && (data.title.length < 50 || data.title.length > 60),
      text: `${data.title.length} chars`,
      tooltip: data.title.text
    },
    {
      id: 'metaDescStatus',
      good: data.metaDescription.length >= 120 && data.metaDescription.length <= 160,
      warning: data.metaDescription.length > 0 && (data.metaDescription.length < 120 || data.metaDescription.length > 160),
      text: `${data.metaDescription.length} chars`,
      tooltip: data.metaDescription.text
    },
    {
      id: 'headingsStatus',
      good: data.headings.h1 === 1 && data.headings.h2 >= 1,
      warning: data.headings.h1 === 1 && data.headings.h2 === 0,
      text: `H1: ${data.headings.h1}, H2: ${data.headings.h2}`,
      tooltip: `H1: ${data.headings.h1}, H2: ${data.headings.h2}`
    },
    {
      id: 'wordCountStatus',
      good: data.content.wordCount >= 500,
      warning: data.content.wordCount > 0 && data.content.wordCount < 500,
      text: `${data.content.wordCount} words`,
      tooltip: ''
    },
    {
      id: 'imageAltsStatus',
      good: data.images.total === 0 || (data.images.withAlt / data.images.total) >= 0.8,
      warning: data.images.total > 0 && (data.images.withAlt / data.images.total) >= 0.5,
      text: `${data.images.withAlt}/${data.images.total}`,
      tooltip: ''
    },
    {
      id: 'internalLinksStatus',
      good: data.links.internal >= 3,
      warning: data.links.internal > 0 && data.links.internal < 3,
      text: `${data.links.internal} links`,
      tooltip: ''
    },
    {
      id: 'externalLinksStatus',
      good: data.links.externalCount >= 1,
      warning: false,
      text: `${data.links.externalCount} links`,
      tooltip: ''
    },
    {
      id: 'viewportStatus',
      good: data.viewport,
      warning: false,
      text: data.viewport ? 'Found' : 'Missing',
      tooltip: data.viewport ? 'Viewport meta tag found' : 'No viewport meta tag'
    },
    {
      id: 'canonicalStatus',
      good: data.canonical,
      warning: false,
      text: data.canonical ? 'Found' : 'Missing',
      tooltip: data.canonical ? 'Canonical tag found' : 'No canonical tag'
    },
    {
      id: 'schemaStatus',
      good: data.schema,
      warning: false,
      text: data.schema ? 'Found' : 'Missing',
      tooltip: data.schema ? 'Schema markup found' : 'No schema markup'
    },
    {
      id: 'gaTagStatus',
      good: data.gaTag,
      warning: false,
      text: data.gaTag ? 'Found' : 'Missing',
      tooltip: data.gaTag ? 'Google Analytics tag found' : 'No Google Analytics tag detected'
    }
  ];

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

  setBrokenLinksStatus('Checking...', 'warning', 'Checking links for errors');
  resetBrokenLinksUI(data.links.internalUrls.length, data.links.externalCount);

  // Detailed results
  const detailedResults = document.getElementById('detailedResults');
  detailedResults.innerHTML = `
    <div class="detailed-item"><strong>Title:</strong> ${escapeHtml(data.title.text) || '<span class="tag">Not found</span>'}</div>
    <div class="detailed-item"><strong>Meta Description:</strong> ${escapeHtml(data.metaDescription.text) || '<span class="tag">Not found</span>'}</div>
    <div class="detailed-item"><strong>Content Words:</strong> ${data.content.wordCount}</div>
    <div class="detailed-item"><strong>Images with Alt:</strong> ${data.images.withAlt} / ${data.images.total}</div>
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

function isHttpUrl(url) {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function checkBrokenLinks(urls, externalCount) {
  const uniqueUrls = Array.from(new Set(urls)).filter(isHttpUrl);
  if (uniqueUrls.length === 0) {
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
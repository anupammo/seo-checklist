document.addEventListener('DOMContentLoaded', function() {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const loading = document.getElementById('loading');
  const resultsContainer = document.getElementById('resultsContainer');
  const detailedResults = document.getElementById('detailedResults');
  const seoScore = document.getElementById('seoScore');
  const scoreProgress = document.getElementById('scoreProgress');
  const scoreFeedback = document.getElementById('scoreFeedback');

  // Test Tools Button Handlers
  const structuredDataBtn = document.getElementById('structuredDataBtn');
  const pageSpeedBtn = document.getElementById('pageSpeedBtn');
  const facebookDebugBtn = document.getElementById('facebookDebugBtn');

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
      const testUrl = `https://pagespeed.web.dev/?url=${currentUrl}`;
      chrome.tabs.create({url: testUrl});
    });
  });

  facebookDebugBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentUrl = encodeURIComponent(tabs[0].url);
      const testUrl = `https://developers.facebook.com/tools/debug/?url=${currentUrl}`;
      chrome.tabs.create({url: testUrl});
    });
  });

  analyzeBtn.addEventListener('click', function() {
    loading.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    detailedResults.innerHTML = '';
    seoScore.textContent = '0%';
    scoreProgress.style.width = '0%';
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
          const data = getPageSEOData(doc);
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

  // Accordion UI for categories
  document.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', function() {
      const cat = header.parentElement;
      cat.classList.toggle('open');
    });
  });
});

function getPageSEOData(doc) {
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
  const internalLinks = Array.from(doc.querySelectorAll('a')).filter(a => {
    const href = a.getAttribute('href');
    return href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:');
  }).length;
  const viewport = doc.querySelector('meta[name="viewport"]');
  const canonical = doc.querySelector('link[rel="canonical"]');
  const schema = doc.querySelector('script[type="application/ld+json"]');

  return {
    title: { text: title, length: title.length },
    metaDescription: { text: metaDesc, length: metaDesc.length },
    headings: { h1: h1.length, h2: h2.length },
    content: { wordCount },
    images: { total: images.length, withAlt: imagesWithAlt },
    links: { internal: internalLinks },
    viewport: !!viewport,
    canonical: !!canonical,
    schema: !!schema
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
  document.getElementById('scoreProgress').style.width = percent + '%';

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

  // Detailed results
  const detailedResults = document.getElementById('detailedResults');
  detailedResults.innerHTML = `
    <div class="detailed-item"><strong>Title:</strong> ${escapeHtml(data.title.text) || '<span class="tag">Not found</span>'}</div>
    <div class="detailed-item"><strong>Meta Description:</strong> ${escapeHtml(data.metaDescription.text) || '<span class="tag">Not found</span>'}</div>
    <div class="detailed-item"><strong>Content Words:</strong> ${data.content.wordCount}</div>
    <div class="detailed-item"><strong>Images with Alt:</strong> ${data.images.withAlt} / ${data.images.total}</div>
    <div class="detailed-item"><strong>Internal Links:</strong> ${data.links.internal}</div>
    <div class="detailed-item"><strong>Viewport:</strong> ${data.viewport ? '<span class="tag">Yes</span>' : '<span class="tag">No</span>'}</div>
    <div class="detailed-item"><strong>Canonical:</strong> ${data.canonical ? '<span class="tag">Yes</span>' : '<span class="tag">No</span>'}</div>
    <div class="detailed-item"><strong>Schema:</strong> ${data.schema ? '<span class="tag">Yes</span>' : '<span class="tag">No</span>'}</div>
  `;
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
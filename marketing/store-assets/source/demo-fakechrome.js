const PAGE = 'https://trailrunner.example/guides/best-trail-running-shoes';
const day = 86400000;
const now = Date.now();
const keep = ['headingOrderStatus', 'imageAltsStatus', 'linkNamesStatus', 'imageDimensionsStatus'];
const store = {
  reviewPrompt: { count: 12, state: 'rated' },
  scoreHistory: {
    [PAGE]: [
      { t: now - 12 * day, s: 47, f: keep.concat(['canonicalStatus', 'metaDescStatus', 'socialTagsStatus', 'schemaStatus', 'titleTagStatus']) },
      { t: now - 8 * day, s: 56, f: keep.concat(['canonicalStatus', 'metaDescStatus', 'socialTagsStatus', 'schemaStatus']) },
      { t: now - 5 * day, s: 61, f: keep.concat(['canonicalStatus', 'metaDescStatus', 'socialTagsStatus']) },
      { t: now - 2 * day, s: 72, f: keep.concat(['canonicalStatus', 'metaDescStatus']) }
    ]
  }
};
window.chrome = {
  runtime: { lastError: null, getManifest: () => ({ version: '1.5', name: 'SEO Checklist', description: '' }), getURL: p => p },
  storage: { local: {
    get: (k, cb) => { const out = {}; [].concat(k).forEach(x => { if (x in store) out[x] = JSON.parse(JSON.stringify(store[x])); }); cb(out); },
    set: (o, cb) => { Object.assign(store, o); cb && cb(); },
    remove: (k, cb) => { delete store[k]; cb && cb(); }
  } },
  permissions: { contains: (q, cb) => cb(false), request: (q, cb) => cb(false) },
  tabs: { query: (q, cb) => cb([{ id: 1, url: PAGE, title: 'Best Trail Running Shoes of 2026, Tested on Real Trails' }]), create() {} },
  scripting: {
    executeScript: async (opts, cb) => {
      if (opts.func.toString().includes('outerHTML')) {
        cb([{ result: await (await fetch(PAGE)).text() }]);
        return;
      }
      cb([{ result: await opts.func(...(opts.args || [])) }]);
    }
  }
};

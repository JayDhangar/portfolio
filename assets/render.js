// Shared HTML renderer: build.js uses it to pre-render index.html, app.js uses it for dynamic views.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JayRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var STATUS_LABEL = { production: 'production', live: 'live', 'open-source': 'open source', project: 'project' };
  var KIND_LABEL = { incident: 'Observed failure', risk: 'Designed against' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function sysKey(l) { return l.systemId || l.system.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

  function linkActions(links) {
    var out = '';
    if (links && links.github) out += '<a class="link-btn" href="' + esc(links.github) + '" target="_blank" rel="noopener">GitHub <span aria-hidden="true">↗</span></a>';
    if (links && links.demo) out += '<a class="link-btn" href="' + esc(links.demo) + '" target="_blank" rel="noopener">Live demo <span aria-hidden="true">↗</span></a>';
    return out;
  }
  function stackHTML(items, limit) {
    var shown = limit ? items.slice(0, limit) : items;
    var extra = limit && items.length > limit ? '<span class="more">+' + (items.length - limit) + '</span>' : '';
    return '<div class="stack">' + shown.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + extra + '</div>';
  }
  function badge(status) {
    return '<span class="badge ' + esc(status) + '">' + esc(STATUS_LABEL[status] || status) + '</span>';
  }
  function kindTag(kind) {
    return '<span class="xp-kind ' + (kind === 'incident' ? 'incident' : 'risk') + '">' + KIND_LABEL[kind === 'incident' ? 'incident' : 'risk'] + '</span>';
  }
  function secHead(n, sec) {
    return '<div class="sec-head"><span class="sec-n mono">' + n + '</span><h2>' + esc(sec.title) + '</h2>'
      + (sec.intro ? '<p>' + esc(sec.intro) + '</p>' : '') + '</div>';
  }

  /* ---------- <head> ---------- */
  function head(d, ctx) {
    var s = d.site, url = ctx.siteUrl;
    var image = url ? url + '/' + s.image : s.image;
    var person = {
      '@context': 'https://schema.org', '@type': 'Person', name: d.profile.name, jobTitle: d.profile.role,
      description: s.description, sameAs: [d.contact.github]
    };
    if (url) person.url = url;
    var current = d.experience.filter(function (e) { return e.current; })[0];
    if (current) person.worksFor = { '@type': 'Organization', name: current.company };
    var m = [
      '<title>' + esc(s.title) + '</title>',
      '<meta name="description" content="' + esc(s.description) + '">',
      '<meta name="robots" content="index, follow">',
      '<meta name="author" content="' + esc(d.profile.name) + '">',
      url ? '<link rel="canonical" href="' + esc(url) + '/">' : '',
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="JAY.OS">',
      '<meta property="og:title" content="' + esc(s.title) + '">',
      '<meta property="og:description" content="' + esc(s.description) + '">',
      url ? '<meta property="og:url" content="' + esc(url) + '/">' : '',
      '<meta property="og:image" content="' + esc(image) + '">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="' + esc(s.imageAlt) + '">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="' + esc(s.title) + '">',
      '<meta name="twitter:description" content="' + esc(s.description) + '">',
      '<meta name="twitter:image" content="' + esc(image) + '">',
      '<meta name="twitter:image:alt" content="' + esc(s.imageAlt) + '">',
      '<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">',
      '<link rel="icon" href="assets/favicon-32.png" sizes="32x32" type="image/png">',
      '<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">',
      '<script type="application/ld+json">' + JSON.stringify(person).replace(/</g, '\\u003c') + '</script>'
    ];
    return m.filter(Boolean).join('\n');
  }

  /* ---------- hero ---------- */
  function hero(d, ctx) {
    var p = d.profile;
    var chips = d.suggestions.slice(0, 4).map(function (q) {
      return '<button class="chip ask-chip" type="button" disabled>' + esc(q) + '</button>';
    }).join('');
    return '<section id="overview" class="sec hero">'
      + '<div class="hero-grid">'
      + '<div class="hero-copy">'
      + '<p class="eyebrow mono"><span>' + esc(p.current) + '</span><span>' + esc(p.location) + '</span></p>'
      + '<h1>' + esc(p.headline) + '</h1>'
      + '<p class="hero-sub">' + esc(p.sub) + '</p>'
      + '<div class="hero-cta">'
      + '<a class="btn btn-primary" href="#systems">Explore Systems <span aria-hidden="true">→</span></a>'
      + '<button class="btn btn-ghost" type="button" data-ask>Ask Jay.OS <kbd class="kbd-hint">Ctrl K</kbd></button>'
      + '</div></div>'
      + '<div class="panel hero-ask" role="region" aria-labelledby="ha-title">'
      + '<div class="ha-head"><span class="ha-brand mono">Ask Jay.OS</span>' + statusBadge() + '</div>'
      + '<h2 class="ha-title" id="ha-title">What do you want to know about my work?</h2>'
      + '<form class="ha-form" id="ha-form" autocomplete="off">'
      + '<label class="sr-only" for="ha-input">Question about Jay\'s work</label>'
      + '<input id="ha-input" name="q" maxlength="300" placeholder="Ask about systems, RAG, or failures" disabled>'
      + '<button type="submit" class="ha-submit" disabled>Ask</button>'
      + '</form>'
      + '<div class="ha-body" id="ha-body"><div class="ha-intro"><div class="chips">' + chips + '</div></div></div>'
      + '<p class="ha-foot mono"><span>RAG over this portfolio</span><span><span data-index-count>' + ctx.passages + '</span> passages</span><span>BM25 retrieval</span></p>'
      + '</div>'
      + '</div>'
      + '<div class="stats">' + d.stats.map(function (s) {
        return '<div class="stat"><b>' + esc(s.value) + '</b><span>' + esc(s.label) + '</span></div>';
      }).join('') + '</div>'
      + '</section>';
  }

  function statusBadge() {
    return '<span class="status mono" data-status data-state="checking"><span class="status-dot" aria-hidden="true"></span>'
      + '<span data-status-text>Checking assistant</span></span>';
  }

  /* ---------- systems ---------- */
  function sysActions(s) {
    return '<div class="sys-actions">'
      + '<button class="link-btn primary" type="button" data-console="' + esc(s.id) + '">Open console <span aria-hidden="true">→</span></button>'
      + (s.architecture ? '<button class="link-btn" type="button" data-arch="' + esc(s.architecture) + '">Architecture</button>' : '')
      + linkActions(s.links) + '</div>';
  }

  function featuredSystem(d, s) {
    var dec = (s.decisions || [])[0];
    var fail = (s.failures || []).map(function (id) { return byId(d.lab, id); }).filter(Boolean)[0];
    return '<article class="panel sys-feature reveal" data-console="' + esc(s.id) + '" tabindex="0" aria-label="' + esc(s.name) + ': open system console">'
      + '<div class="sf-main">'
      + '<div class="sys-top">' + badge(s.status) + '<span class="sys-meta">' + esc(s.role) + '</span></div>'
      + '<h3>' + esc(s.name) + '</h3>'
      + '<p class="sys-summary">' + esc(s.summary) + '</p>'
      + '<div class="sf-result"><span class="sf-k">Result</span><p>' + esc(s.result) + '</p></div>'
      + sysActions(s)
      + '</div>'
      + '<dl class="sf-facts">'
      + '<div><dt>Problem</dt><dd>' + esc(s.problem) + '</dd></div>'
      + (dec ? '<div><dt>Key decision</dt><dd><b>' + esc(dec.title) + '.</b> ' + esc(dec.why) + '</dd></div>' : '')
      + (fail ? '<div><dt>Failure case</dt><dd><button class="xp-link" type="button" data-xp="' + esc(fail.id) + '">' + esc(fail.title) + '</button> ' + kindTag(fail.kind) + '</dd></div>' : '')
      + '<div><dt>Stack</dt><dd>' + stackHTML(s.stack, 8) + '</dd></div>'
      + '</dl>'
      + '</article>';
  }

  function compactSystem(s) {
    return '<article class="panel sys-card reveal" data-console="' + esc(s.id) + '" tabindex="0" aria-label="' + esc(s.name) + ': open system console">'
      + '<div class="sys-top">' + badge(s.status) + (s.period ? '<span class="sys-meta">' + esc(s.period) + '</span>' : '') + '</div>'
      + '<h3>' + esc(s.name) + '</h3><p class="sys-role">' + esc(s.role) + '</p>'
      + '<p class="sys-summary">' + esc(s.summary) + '</p>'
      + stackHTML(s.stack, 5)
      + sysActions(s)
      + '</article>';
  }

  function systems(d) {
    var featured = d.systems.filter(function (s) { return s.status === 'production'; });
    var rest = d.systems.filter(function (s) { return s.status !== 'production'; });
    return '<section id="systems" class="sec">' + secHead('01', d.sections.systems)
      + '<div class="sys-featured">' + featured.map(function (s) { return featuredSystem(d, s); }).join('') + '</div>'
      + '<div class="sys-grid">' + rest.map(compactSystem).join('') + '</div>'
      + '</section>';
  }

  /* ---------- experiments (AI Lab + console) ---------- */
  function chainHTML(l) {
    var steps = [
      ['Problem', l.problem, ''],
      [l.kind === 'incident' ? 'Failure' : 'Failure mode', l.failure, 'fail'],
      ['Root cause', l.rootCause, ''],
      ['Fix', l.fix, 'fix'],
      ['Lesson', l.lesson, 'lesson']
    ];
    return '<ol class="xp-chain">' + steps.map(function (st) {
      return '<li class="' + st[2] + '"><span class="k">' + st[0] + '</span><p>' + esc(st[1]) + '</p></li>';
    }).join('') + '</ol>';
  }

  function xpFoot(d, l, withConsole) {
    var sys = l.systemId ? byId(d.systems, l.systemId) : null;
    var out = '';
    if (l.link) out += '<a class="link-btn" href="' + esc(l.link) + '" target="_blank" rel="noopener">Evidence <span aria-hidden="true">↗</span></a>';
    if (withConsole && sys) out += '<button class="link-btn" type="button" data-console="' + esc(sys.id) + '">Open ' + esc(sys.name) + ' console</button>';
    return out ? '<div class="xp-foot">' + out + '</div>' : '';
  }

  function labItem(d, l) {
    return '<details class="xp" id="xp-' + esc(l.id) + '" data-kind="' + esc(l.kind) + '" data-sys="' + esc(sysKey(l)) + '">'
      + '<summary class="xp-sum">'
      + '<span class="xp-meta">' + kindTag(l.kind) + '<span class="lab-type mono">' + esc(l.type) + '</span><span class="xp-sys">' + esc(l.system) + '</span></span>'
      + '<h3 class="xp-title">' + esc(l.title) + '</h3>'
      + '<span class="xp-summary">' + esc(l.failure) + '</span>'
      + '<span class="xp-chev" aria-hidden="true"></span>'
      + '</summary>'
      + '<div class="xp-body">' + chainHTML(l) + xpFoot(d, l, true) + '</div>'
      + '</details>';
  }

  // Always-expanded version used inside the system console.
  function experimentCard(d, l) {
    return '<article class="xp-card">'
      + '<div class="xp-meta">' + kindTag(l.kind) + '<span class="lab-type mono">' + esc(l.type) + '</span></div>'
      + '<h3 class="xp-title">' + esc(l.title) + '</h3>'
      + chainHTML(l) + xpFoot(d, l, false)
      + '</article>';
  }

  function lab(d) {
    var systemsSeen = [], sysLabel = {};
    d.lab.forEach(function (l) {
      var k = sysKey(l);
      if (!sysLabel[k]) { systemsSeen.push(k); var s = l.systemId ? byId(d.systems, l.systemId) : null; sysLabel[k] = s ? s.name : l.system; }
    });
    var count = function (kind) { return d.lab.filter(function (l) { return kind === 'all' || l.kind === kind; }).length; };
    var seg = [['all', 'All'], ['incident', 'Observed failures'], ['risk', 'Designed against']].map(function (f, i) {
      return '<button type="button" class="seg-btn" data-filter-kind="' + f[0] + '" aria-pressed="' + (i ? 'false' : 'true') + '">'
        + f[1] + ' <span class="seg-n mono">' + count(f[0]) + '</span></button>';
    }).join('');
    var select = '<label class="sys-filter"><span class="sr-only">Filter by system</span><select data-filter-sys>'
      + '<option value="all">All systems</option>'
      + systemsSeen.map(function (k) { return '<option value="' + esc(k) + '">' + esc(sysLabel[k]) + '</option>'; }).join('')
      + '</select></label>';
    return '<section id="lab" class="sec">' + secHead('02', d.sections.lab)
      + '<div class="lab-tools" data-lab-tools hidden>'
      + '<div class="seg" role="group" aria-label="Filter by outcome">' + seg + '</div>' + select
      + '<span class="lab-count mono" data-lab-count aria-live="polite">' + d.lab.length + ' experiments</span>'
      + '</div>'
      + '<div class="panel lab-list">' + d.lab.map(function (l) { return labItem(d, l); }).join('') + '</div>'
      + '</section>';
  }

  /* ---------- engineering ---------- */
  function archFlow(a, selected) {
    return '<div class="arch-flow">' + a.stages.map(function (st, si) {
      return (si ? '<div class="connector" style="--i:' + si + '" aria-hidden="true"></div>' : '')
        + '<div class="stage"><div class="stage-label mono">' + pad(si + 1) + ' ' + esc(st.label) + '</div>'
        + st.nodes.map(function (n, ni) {
          var key = si + '-' + ni, on = key === selected;
          return '<button type="button" class="stage-node' + (on ? ' selected' : '') + (n.xp ? ' has-xp' : '') + '" data-node="' + key + '" aria-pressed="' + on + '">'
            + esc(n.label) + '</button>';
        }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function nodeDetail(d, a, key) {
    var parts = key.split('-'), si = +parts[0], ni = +parts[1];
    var st = a.stages[si], n = st && st.nodes[ni];
    if (!n) return '';
    var related = (n.xp || []).map(function (id) { return byId(d.lab, id); }).filter(Boolean);
    return '<div class="nd-head mono">Component <span>' + pad(si + 1) + ' ' + esc(st.label) + '</span></div>'
      + '<h3 class="nd-title">' + esc(n.label) + '</h3><p class="nd-what">' + esc(n.what) + '</p>'
      + '<dl class="nd-grid">'
      + '<div><dt>Why it exists</dt><dd>' + esc(n.why) + '</dd></div>'
      + '<div><dt>Input</dt><dd class="io">' + esc(n.in) + '</dd></div>'
      + '<div><dt>Output</dt><dd class="io">' + esc(n.out) + '</dd></div>'
      + '<div class="nd-fails"><dt>Failure modes</dt><dd><ul>' + n.fails.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></dd></div>'
      + '</dl>'
      + (related.length ? '<div class="nd-related"><span class="nd-related-k">Related failure case</span>' + related.map(function (l) {
        return '<button class="xp-link" type="button" data-xp="' + esc(l.id) + '">' + esc(l.title) + '</button>' + kindTag(l.kind);
      }).join('') + '</div>' : '');
  }

  function archPanel(d, a, key) {
    return '<p class="arch-caption">' + esc(a.caption) + '</p>'
      + '<div class="arch-scroll" data-scroll-region aria-label="' + esc(a.tab) + ' architecture diagram">' + archFlow(a, key) + '</div>'
      + '<div class="node-detail" data-node-detail aria-live="polite">' + nodeDetail(d, a, key) + '</div>';
  }

  function engineering(d) {
    var first = d.architectures[0];
    var tabs = d.architectures.map(function (a, i) {
      return '<button type="button" role="tab" id="arch-tab-' + esc(a.id) + '" aria-controls="arch-tabpanel" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-tab="' + esc(a.id) + '">' + esc(a.tab) + '</button>';
    }).join('');
    return '<section id="engineering" class="sec">' + secHead('03', d.sections.engineering)
      + '<div class="panel arch-panel">'
      + '<div class="arch-tabs" role="tablist" aria-label="System architectures">' + tabs + '</div>'
      + '<div class="arch-body" id="arch-tabpanel" role="tabpanel" aria-labelledby="arch-tab-' + esc(first.id) + '">' + archPanel(d, first, '0-0') + '</div>'
      + '</div></section>';
  }

  /* ---------- experience ---------- */
  function experience(d) {
    var jobs = d.experience.map(function (e) {
      return '<div class="job reveal' + (e.current ? ' current' : '') + '">'
        + '<div class="job-period mono">' + esc(e.period) + (e.current ? '<span class="now">Current</span>' : '') + '</div>'
        + '<h3>' + esc(e.role) + '</h3><div class="job-co">' + esc(e.company) + (e.location ? '<span class="job-loc">' + esc(e.location) + '</span>' : '') + '</div>'
        + '<ul>' + e.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    var edu = d.education.map(function (e) {
      return '<div class="edu"><b>' + esc(e.degree) + '</b><div>' + esc(e.school) + '</div><div class="edu-meta mono"><span>' + esc(e.period) + '</span><span>' + esc(e.score) + '</span></div></div>';
    }).join('');
    var skills = d.skills.map(function (s) {
      return '<div class="skill-row"><div class="g">' + esc(s.group) + '</div>' + stackHTML(s.items) + '</div>';
    }).join('');
    return '<section id="experience" class="sec">' + secHead('04', d.sections.experience)
      + '<div class="exp-grid"><div class="timeline">' + jobs + '</div>'
      + '<div class="exp-side">'
      + '<div class="panel side-block"><h3 class="block-title">Education</h3>' + edu + '</div>'
      + '<div class="panel side-block"><h3 class="block-title">Stack</h3>' + skills + '</div>'
      + '</div></div></section>';
  }

  /* ---------- thinking ---------- */
  function thinking(d) {
    var items = d.thinking.map(function (t, i) {
      var related = (t.related || []).map(function (id) { return byId(d.lab, id); }).filter(Boolean);
      return '<details class="principle reveal">'
        + '<summary class="pr-sum">'
        + '<span class="idx mono">' + pad(i + 1) + '</span>'
        + '<span class="pr-main"><h3 class="pr-title">' + esc(t.title) + '</h3><span class="pr-text">' + esc(t.body) + '</span></span>'
        + '<span class="ev"><span class="ev-k">In practice</span>' + [].concat(t.evidence).map(function (e) { return '<span class="ev-item">' + esc(e) + '</span>'; }).join('') + '</span>'
        + '<span class="pr-chev" aria-hidden="true"></span>'
        + '</summary>'
        + '<div class="pr-body">' + (t.reasoning || []).map(function (r) { return '<p>' + esc(r) + '</p>'; }).join('')
        + (related.length ? '<div class="pr-related"><span class="pr-related-k">Related experiments</span>' + related.map(function (l) {
          return '<button class="chip" type="button" data-xp="' + esc(l.id) + '">' + esc(l.title) + '</button>';
        }).join('') + '</div>' : '')
        + '</div></details>';
    }).join('');
    return '<section id="thinking" class="sec">' + secHead('05', d.sections.thinking) + '<div class="thinking">' + items + '</div></section>';
  }

  /* ---------- contact + footer ---------- */
  function contact(d) {
    var c = d.contact, sc = d.sections.contact;
    var rows = [
      ['Email', '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>'],
      ['GitHub', '<a href="' + esc(c.github) + '" target="_blank" rel="noopener">' + esc(c.github.replace(/^https?:\/\//, '')) + '</a>'],
      ['Phone', '<a href="tel:' + esc(c.phone.replace(/\s/g, '')) + '">' + esc(c.phone) + '</a>'],
      ['Location', esc(c.location)],
      ['Languages', esc(c.languages.join(', '))]
    ];
    return '<section id="contact" class="sec contact">' + secHead('06', { title: sc.title })
      + '<div class="panel contact-panel"><div class="contact-copy">'
      + '<h3>' + esc(sc.heading) + '</h3><p>' + esc(sc.body) + '</p>'
      + '<div class="hero-cta">'
      + '<a class="btn btn-primary" href="mailto:' + esc(c.email) + '">Email me <span aria-hidden="true">→</span></a>'
      + '<a class="btn btn-ghost" href="' + esc(c.github) + '" target="_blank" rel="noopener">GitHub</a>'
      + '</div></div>'
      + '<dl class="contact-meta">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>'
      + '</div></section>';
  }

  function footer(d, ctx) {
    return '<footer class="foot"><span>© ' + ctx.year + ' ' + esc(d.profile.name) + '</span><span class="dim">' + esc(d.sections.footer) + '</span></footer>';
  }

  function askChips(d) {
    return d.suggestions.map(function (q) { return '<button class="chip ask-chip" type="button" disabled>' + esc(q) + '</button>'; }).join('');
  }

  /* ---------- system console ---------- */
  function miniFlow(a) {
    return '<div class="mini-flow" data-scroll-region aria-label="' + esc(a.tab) + ' pipeline overview">' + a.stages.map(function (st, i) {
      return (i ? '<span class="mini-arrow" aria-hidden="true">→</span>' : '')
        + '<div class="mini-stage"><div class="stage-label mono">' + esc(st.label) + '</div>'
        + st.nodes.map(function (n) { return '<div class="mini-node">' + esc(n.label) + '</div>'; }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function consoleBody(d, s) {
    var arch = byId(d.architectures, s.architecture);
    var fails = (s.failures || []).map(function (id) { return byId(d.lab, id); }).filter(Boolean);
    var sections = [['Problem', '<p class="con-text">' + esc(s.problem) + '</p>']];
    if (arch) {
      sections.push(['Architecture', '<p class="con-text dimtext">' + esc(arch.caption) + '</p>' + miniFlow(arch)
        + '<button class="link-btn" type="button" data-arch="' + esc(arch.id) + '">Inspect each component in Engineering <span aria-hidden="true">→</span></button>']);
    }
    sections.push(['My contribution', '<ul class="sys-points">' + s.highlights.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>']);
    sections.push(['Technologies', stackHTML(s.stack)]);
    if (s.decisions && s.decisions.length) {
      sections.push(['Engineering decisions', '<div class="decisions">' + s.decisions.map(function (dec) {
        return '<div class="decision"><b>' + esc(dec.title) + '</b><p>' + esc(dec.why) + '</p></div>';
      }).join('') + '</div>']);
    }
    if (fails.length) {
      sections.push(['Challenges and failures', '<div class="con-xps">' + fails.map(function (f) { return experimentCard(d, f); }).join('') + '</div>']);
    }
    sections.push(['Result', '<p class="con-text">' + esc(s.result) + '</p>']);
    return '<header class="con-head">'
      + '<div class="sys-top">' + badge(s.status) + '<span class="sys-meta">' + esc(s.role) + '</span>' + (s.period ? '<span class="sys-meta">' + esc(s.period) + '</span>' : '') + '</div>'
      + '<h2 id="console-title">' + esc(s.name) + '</h2><p class="sys-summary">' + esc(s.summary) + '</p>'
      + '<div class="sys-actions">' + linkActions(s.links)
      + '<button class="link-btn" type="button" data-ask-q="Tell me about ' + esc(s.name) + '.">Ask Jay.OS about this</button></div>'
      + '</header>'
      + sections.map(function (sec, i) {
        return '<section class="con-sec"><div class="con-label mono">' + pad(i + 1) + ' ' + esc(sec[0]) + '</div>' + sec[1] + '</section>';
      }).join('');
  }

  return {
    esc: esc, pad: pad, byId: byId, kindTag: kindTag,
    head: head, hero: hero, systems: systems, lab: lab, engineering: engineering, experience: experience,
    thinking: thinking, contact: contact, footer: footer, askChips: askChips,
    archPanel: archPanel, archFlow: archFlow, nodeDetail: nodeDetail, consoleBody: consoleBody
  };
});

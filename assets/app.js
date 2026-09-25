(function () {
  'use strict';

  var R = window.JayRender, RAG = window.JayRAG;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = R.esc, pad = R.pad;
  var DATA = null, INDEX = null, CHUNKS = {};
  var SYS = {}, LAB = {}, ARCH = {};

  // Read live, so turning on reduced motion mid-visit takes effect immediately.
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = motionQuery.matches;
  function onMotionPreference(e) {
    reduceMotion = e.matches;
    if (reduceMotion) $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionPreference);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionPreference);

  var EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  // Opacity only; capped at 150ms under reduced motion.
  function fadeIn(el, ms) {
    if (el && el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduceMotion ? Math.min(ms, 150) : ms, easing: EASE_OUT });
  }
  // Tint where a jump landed. Colour, not movement, so it stays under reduced motion.
  function landingHighlight(el, ms) {
    if (!el || !el.animate) return;
    el.getAnimations().forEach(function (a) { a.cancel(); });
    el.animate([
      { backgroundColor: 'rgba(122, 162, 255, 0.10)' },
      { backgroundColor: 'rgba(122, 162, 255, 0.10)', offset: 0.35 },
      { backgroundColor: 'rgba(122, 162, 255, 0)' }
    ], { duration: ms, easing: 'ease' });
  }

  function scrollToEl(node) { node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
  function fmtMs(v) { return v == null ? null : (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' ms'; }

  /* ---------------- assistant status (real state only) ---------------- */
  var STATUS_TEXT = { checking: 'Checking assistant', online: 'Assistant online', local: 'Local retrieval mode' };
  function setStatus(state) {
    $$('[data-status]').forEach(function (el) {
      el.setAttribute('data-state', state);
      el.querySelector('[data-status-text]').textContent = STATUS_TEXT[state];
    });
    var mode = $('#ask-mode');
    if (mode) { mode.textContent = state === 'online' ? 'LLM online' : state === 'local' ? 'Local retrieval' : 'Checking'; mode.classList.toggle('llm', state === 'online'); }
  }
  function checkHealth() {
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    fetch('api/ask', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (h) { setStatus(h && h.llm ? 'online' : 'local'); })
      .catch(function () { setStatus('local'); })
      .then(function () { clearTimeout(timer); });
  }

  /* ---------------- system console ---------------- */
  // The card a console was opened from keeps an accent while its console is open.
  var consoleOrigin = null;
  function setConsoleOrigin(card) {
    if (consoleOrigin && consoleOrigin !== card) consoleOrigin.classList.remove('is-origin');
    consoleOrigin = card || null;
    if (consoleOrigin) consoleOrigin.classList.add('is-origin');
  }
  function openConsole(id, trigger) {
    var s = SYS[id];
    if (!s) return;
    var card = trigger && trigger.closest ? trigger.closest('.sys-card, .sys-feature') : null;
    $('#console-crumb').textContent = s.id;
    var body = $('#console-body');
    body.innerHTML = R.consoleBody(DATA, s);
    body.scrollTop = 0;
    setConsoleOrigin(card);
    openOverlay($('#console'), $('#console .ask-close'), card);
    syncScrollRegions();
  }

  /* ---------------- AI Lab: filters + expansion ---------------- */
  var labFilter = { kind: 'all', sys: 'all' };
  function applyLabFilter() {
    var items = $$('#lab .xp'), shown = 0;
    items.forEach(function (el) {
      var ok = (labFilter.kind === 'all' || el.getAttribute('data-kind') === labFilter.kind)
        && (labFilter.sys === 'all' || el.getAttribute('data-sys') === labFilter.sys);
      el.hidden = !ok;
      if (ok) shown++;
    });
    $$('[data-filter-kind]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter-kind') === labFilter.kind)); });
    var sel = $('[data-filter-sys]');
    if (sel) sel.value = labFilter.sys;
    $('[data-lab-count]').textContent = (shown === items.length ? shown : shown + ' of ' + items.length) + ' experiments';
  }
  function initLab() {
    var tools = $('[data-lab-tools]');
    if (!tools) return;
    tools.hidden = false;
    tools.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter-kind]');
      if (b) { labFilter.kind = b.getAttribute('data-filter-kind'); applyLabFilter(); }
    });
    $('[data-filter-sys]').addEventListener('change', function (e) { labFilter.sys = e.target.value; applyLabFilter(); });
  }
  function focusExperiment(id) {
    var card = document.getElementById('xp-' + id);
    if (!card) return;
    if (card.hidden) { labFilter = { kind: 'all', sys: 'all' }; applyLabFilter(); }
    card.open = true;
    scrollToEl(card);
    landingHighlight(card, 1600);
    var sum = $('summary', card);
    if (sum) sum.focus({ preventScroll: true });
  }

  /* ---------------- engineering: tabs + component inspector ---------------- */
  var currentArch = null;
  function selectArch(id, focusTab) {
    var a = ARCH[id];
    if (!a) return;
    currentArch = a;
    var tabs = $$('#engineering [role="tab"]');
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === a.id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focusTab) t.focus();
    });
    var panel = $('#arch-tabpanel');
    panel.setAttribute('aria-labelledby', 'arch-tab-' + a.id);
    panel.innerHTML = R.archPanel(DATA, a, '0-0');   // data switches immediately; no entrance animation
    runPackets(a.id, focusTab);
    reserveInspectorHeight();
    syncScrollRegions();
  }

  var detailSeq = 0;
  function selectNode(key, instant) {
    $$('#arch-tabpanel .stage-node').forEach(function (b) {
      var on = b.getAttribute('data-node') === key;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
    var detail = $('#arch-tabpanel [data-node-detail]');
    var html = R.nodeDetail(DATA, currentArch, key);
    var seq = ++detailSeq;
    var running = detail.animate ? detail.getAnimations() : [];
    running.forEach(function (a) { a.cancel(); });
    // Keyboard activation (and rapid re-clicks) swap instantly; a pointer click gets a short opacity fade out/in.
    if (instant || !detail.animate || running.length) { detail.innerHTML = html; return; }
    var out = detail.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 60, easing: 'ease-out', fill: 'forwards' });
    out.onfinish = function () {
      if (seq !== detailSeq) return;
      detail.innerHTML = html;
      out.cancel();
      fadeIn(detail, 150);
    };
  }

  // Reserve the tallest inspector height for the current diagram so switching components never shifts the page.
  // One batched layout read: render every component's detail into a hidden probe, then measure them together.
  function reserveInspectorHeight() {
    var detail = $('#arch-tabpanel [data-node-detail]');
    if (!detail || !currentArch) return;
    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:' + detail.getBoundingClientRect().width + 'px';
    var html = '';
    currentArch.stages.forEach(function (st, si) {
      st.nodes.forEach(function (n, ni) { html += '<div class="node-detail">' + R.nodeDetail(DATA, currentArch, si + '-' + ni) + '</div>'; });
    });
    probe.innerHTML = html;
    detail.parentNode.appendChild(probe);
    var max = 0;
    $$('.node-detail', probe).forEach(function (el) { max = Math.max(max, el.offsetHeight); });
    probe.remove();
    detail.style.minHeight = max + 'px';
  }

  // Packets run once per diagram, on its first pointer-initiated (or scroll-into-view) display. They show the
  // direction data flows; replaying them on every switch, or on keyboard navigation, would only slow things down.
  var packetsShown = {};
  function runPackets(archId, viaKeyboard) {
    if (packetsShown[archId]) return;
    packetsShown[archId] = true;
    if (reduceMotion || viaKeyboard) return;
    var flow = $('#arch-tabpanel .arch-flow');
    if (flow) flow.classList.add('run');
  }
  function initEngineering() {
    currentArch = ARCH[$('#engineering [role="tab"][aria-selected="true"]').getAttribute('data-tab')];
    reserveInspectorHeight();
    var resizeTimer = null;
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(reserveInspectorHeight, 150); });
    if ('IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        runPackets(currentArch.id, false);
        seen.disconnect();
      }, { threshold: 0.4 });
      seen.observe($('#arch-tabpanel'));
    }
    var list = $('#engineering [role="tablist"]');
    list.addEventListener('click', function (e) {
      var t = e.target.closest('[role="tab"]');
      // e.detail is 0 when a click is synthesised from the keyboard (Enter / Space).
      if (t) selectArch(t.getAttribute('data-tab'), e.detail === 0);
    });
    list.addEventListener('keydown', function (e) {
      var tabs = $$('[role="tab"]', list);
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      next = (next + tabs.length) % tabs.length;
      selectArch(tabs[next].getAttribute('data-tab'), true);
    });
    $('#arch-tabpanel').addEventListener('click', function (e) {
      var b = e.target.closest('[data-node]');
      if (b) selectNode(b.getAttribute('data-node'), e.detail === 0);
    });
  }

  // Horizontally scrollable diagrams must be keyboard-reachable when (and only when) they actually scroll.
  function syncScrollRegions() {
    $$('[data-scroll-region]').forEach(function (el) {
      if (el.scrollWidth > el.clientWidth + 1) { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'region'); }
      else { el.removeAttribute('tabindex'); el.removeAttribute('role'); }
    });
  }

  /* ---------------- chrome ---------------- */
  function initNav() {
    var nav = $('#nav'), links = {};
    $$('a', nav).forEach(function (a) { links[a.getAttribute('data-sec')] = a; });
    var crumb = $('#crumb');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        Object.keys(links).forEach(function (k) {
          links[k].classList.toggle('active', k === id);
          if (k === id) links[k].setAttribute('aria-current', 'true'); else links[k].removeAttribute('aria-current');
        });
        crumb.textContent = id;
        // On the mobile scrolling nav, keep the active item in view.
        if (nav.scrollWidth > nav.clientWidth && links[id]) {
          nav.scrollTo({ left: Math.max(0, links[id].offsetLeft - 24), behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    $$('main .sec').forEach(function (s) { io.observe(s); });

    function edges() {
      nav.classList.toggle('fade-left', nav.scrollLeft > 4);
      nav.classList.toggle('fade-right', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
    }
    nav.addEventListener('scroll', edges, { passive: true });
    window.addEventListener('resize', function () { edges(); syncScrollRegions(); });
    edges();
  }

  function initReveal() {
    var els = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var i = Array.prototype.indexOf.call(en.target.parentNode.children, en.target);
        en.target.style.transitionDelay = Math.min(i, 5) * 50 + 'ms';
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.1 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------------- overlays (Ask + system console) ---------------- */
  // Ask Jay.OS opens and closes instantly (it is a keyboard-first command surface).
  // The system console uses CSS transitions driven by [data-open], so an interrupted open/close reverses
  // from wherever it is; `hidden` is applied only after the exit transition (200ms) has finished.
  var overlay = { current: null, lastFocus: null, hideTimer: null };
  var CONSOLE_EXIT_MS = 220;
  function isConsole(node) { return !!node && node.id === 'console'; }
  function showOverlayNode(node) {
    if (isConsole(node)) clearTimeout(overlay.hideTimer);
    node.hidden = false;
    if (isConsole(node)) node.setAttribute('data-open', '');
  }
  function hideOverlayNode(node, animated) {
    node.removeAttribute('data-open');
    if (!isConsole(node) || !animated) { node.hidden = true; return; }
    clearTimeout(overlay.hideTimer);
    overlay.hideTimer = setTimeout(function () { if (!node.hasAttribute('data-open')) node.hidden = true; }, CONSOLE_EXIT_MS);
  }
  function openOverlay(node, focusEl, returnTo) {
    if (overlay.current && overlay.current !== node) hideOverlayNode(overlay.current, false);
    else if (!overlay.current) overlay.lastFocus = returnTo || document.activeElement;
    overlay.current = node;
    showOverlayNode(node);
    document.body.style.overflow = 'hidden';
    if (focusEl) focusEl.focus();
  }
  function closeOverlay() {
    if (!overlay.current) return;
    var node = overlay.current;
    overlay.current = null;
    hideOverlayNode(node, true);
    document.body.style.overflow = '';
    if (isConsole(node)) setConsoleOrigin(null);   // the card's accent fades out over 300ms (CSS)
    if (overlay.lastFocus && overlay.lastFocus.focus) overlay.lastFocus.focus();
  }

  /* ---------------- Ask Jay.OS: engine ---------------- */
  var ask = { busy: false, history: [] };

  var FAILURE_REASON = {
    llm_not_configured: 'LLM not configured on this deployment',
    rate_limited: 'Rate limit reached',
    daily_budget_exhausted: 'Daily LLM budget reached',
    upstream_rate_limited: 'LLM provider rate limit',
    model_unavailable: 'Configured LLM model is unavailable',
    generation_timeout: 'LLM request timed out',
    generation_failed: 'LLM request failed',
    empty_completion: 'LLM returned an empty answer'
  };
  function failureReason(res) {
    if (res.error === 'timeout') return 'Request timed out';
    if (res.status === 0) return 'API unreachable';
    if (res.status === 404 || res.status === 405 || res.status === 501) return 'API not available on this host';
    var code = res.body && res.body.error;
    var text = FAILURE_REASON[code] || ('API error ' + res.status);
    if (code === 'rate_limited' && res.body.retryAfter) text += ' (retry in ' + res.body.retryAfter + ' s)';
    return text;
  }

  // Retrieval runs in the browser first (same BM25, same passages as the server) so the pipeline can show its
  // real result and measured time immediately, before the generation request returns.
  function prepareRetrieval(q) {
    var history = ask.history.slice(-2);
    var cq = RAG.contextualQuery(q, history);
    var r0 = performance.now();
    var hits = RAG.search(INDEX, cq, 6);
    return { history: history, cq: cq, hits: hits, retrievalMs: performance.now() - r0 };
  }

  function askEngine(q, prep, t0) {
    var history = prep.history, hits = prep.hits, localRetrievalMs = prep.retrievalMs;
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 18000);
    var base = { question: q, contextual: prep.cq !== q ? prep.cq : null };

    return fetch('api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, history: history }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        return (r.ok && body && body.answer) ? { ok: true, body: body } : { ok: false, status: r.status, body: body };
      });
    }, function (err) {
      return { ok: false, status: 0, error: err && err.name === 'AbortError' ? 'timeout' : 'network' };
    }).then(function (res) {
      clearTimeout(timer);
      if (res.ok) {
        setStatus('online');
        var t = res.body.timings || {};
        return Object.assign(base, {
          mode: 'llm', answer: res.body.answer, model: res.body.model, sources: res.body.sources || [],
          timings: { retrievalMs: t.retrievalMs, generationMs: t.generationMs, totalMs: performance.now() - t0 }
        });
      }
      var reason = failureReason(res);
      if (res.status === 0 || res.status === 404 || (res.body && res.body.error === 'llm_not_configured')) setStatus('local');
      return Object.assign(base, {
        mode: 'local', reason: reason, hits: hits,
        sources: hits.map(function (h) { return { id: h.chunk.id, title: h.chunk.title, system: h.chunk.system, score: +h.score.toFixed(2) }; }),
        timings: { retrievalMs: localRetrievalMs }
      });
    });
  }

  /* ---------------- Ask Jay.OS: rendering ---------------- */
  function formatAnswer(text, sources, cites) {
    function cite(n) {
      var s = sources[n - 1];
      if (!s) { cites.invalid.push(n); return '<span class="cite invalid" title="Source ' + n + ' was not among the returned passages">' + n + '?</span>'; }
      if (cites.valid.indexOf(n) < 0) cites.valid.push(n);
      return '<button type="button" class="cite" data-cite="' + n + '" aria-label="Source ' + n + ': ' + esc(s.title) + '">' + n + '</button>';
    }
    // Models differ in citation syntax: [1], [1, 2], 【1】, ［1］, or OpenAI-style 【1†source】. Normalise all of them.
    var normalized = String(text)
      .replace(/[【［]\s*(\d+(?:\s*[,，]\s*\d+)*)\s*(?:†[^】］\]]*)?[】］\]]/g, '[$1]')
      .replace(/\s*[—–]\s*/g, ' - ');
    return esc(normalized).split(/\n{2,}/).map(function (block) {
      var lines = block.split('\n');
      var inline = function (s) {
        return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d+(?:\s*[,，]\s*\d+)*)\]/g, function (m, list) {
          return list.split(/\s*[,，]\s*/).map(function (n) { return cite(+n); }).join('');
        });
      };
      if (lines.every(function (l) { return /^\s*[-*]\s+/.test(l); })) {
        return '<ul>' + lines.map(function (l) { return '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      }
      return '<p>' + inline(lines.join('<br>')) + '</p>';
    }).join('');
  }

  function localAnswer(question, hits) {
    if (!hits.length) {
      return '<p>I couldn\'t find that in Jay\'s portfolio. Try asking about his systems, RAG work, or failures, or email him at '
        + esc(DATA.contact.email) + '.</p>';
    }
    var seen = {}, items = [], qTerms = RAG.tokenize(question);
    hits.slice(0, 4).forEach(function (h, i) {
      if (seen[h.chunk.title] || items.length >= 3) return;
      seen[h.chunk.title] = true;
      var sentences = h.chunk.text.match(/[^.!?]+[.!?]+/g) || [h.chunk.text];
      var best = sentences.map(function (s) {
        var toks = RAG.tokenize(s);
        return { s: s.trim(), n: qTerms.filter(function (t) { return toks.indexOf(t) > -1; }).length };
      }).sort(function (a, b) { return b.n - a.n; }).slice(0, 2).map(function (x) { return x.s; }).join(' ');
      if (best.length > 240) best = best.slice(0, 237).replace(/\s+\S*$/, '') + '…';
      items.push('<li><b>' + esc(h.chunk.title) + '</b> <button type="button" class="cite" data-cite="' + (i + 1) + '" aria-label="Source ' + (i + 1) + '">' + (i + 1) + '</button>: ' + esc(best) + '</li>');
    });
    return '<p>Closest passages in Jay\'s portfolio:</p><ul>' + items.join('') + '</ul>';
  }

  function traceHTML(res, cites) {
    var t = res.timings || {};
    var passages = res.sources.map(function (s, i) {
      var chunk = CHUNKS[s.id];
      var excerpt = chunk ? chunk.text : '';
      if (excerpt.length > 320) excerpt = excerpt.slice(0, 317).replace(/\s+\S*$/, '') + '…';
      return '<li><details class="ts-passage" data-src="' + (i + 1) + '"><summary><span class="ts-n">[' + (i + 1) + ']</span>'
        + '<span class="ts-title">' + esc(s.title) + '</span><span class="ts-score" title="BM25 score">' + (+s.score).toFixed(2) + '</span></summary>'
        + (excerpt ? '<p class="ts-excerpt">' + esc(excerpt) + '</p>' : '') + '</details></li>';
    }).join('');

    var generation = res.mode === 'llm'
      ? 'Groq ' + esc(res.model || '') + (t.generationMs != null ? ', ' + fmtMs(t.generationMs) : '') + '. Prompt limited to the passages above.'
      : 'No LLM call: ' + esc(res.reason) + '. Showing extracted sentences from the top passages instead.';

    var citations;
    if (res.mode === 'llm') {
      citations = cites.valid.length
        ? cites.valid.map(function (n) { return '[' + n + '] ' + esc(res.sources[n - 1].title); }).join('<br>')
        : 'The answer cites no passages.';
      if (cites.invalid.length) citations += '<br><span class="ts-warn">' + cites.invalid.map(function (n) { return '[' + n + ']'; }).join(' ') + ' did not match a returned passage.</span>';
    } else {
      citations = 'Excerpts are labelled with the passage they came from.';
    }

    return '<details class="trace"><summary>Retrieval trace</summary><ol class="trace-steps">'
      + '<li><span class="ts-k mono">01 Query</span><div class="ts-v">' + esc(res.question)
      + (res.contextual ? '<small>Follow-up: retrieval also used the previous question.</small>' : '') + '</div></li>'
      + '<li><span class="ts-k mono">02 Retrieved passages</span><div class="ts-v"><ol class="ts-passages">' + (passages || '<li>No passage matched.</li>') + '</ol></div></li>'
      + '<li><span class="ts-k mono">03 Generation</span><div class="ts-v">' + generation + '</div></li>'
      + '<li><span class="ts-k mono">04 Citations</span><div class="ts-v">' + citations + '</div></li>'
      + '</ol></details>';
  }

  function usedHTML(sources) {
    var ids = [];
    sources.forEach(function (s) { if (s.system && SYS[s.system] && ids.indexOf(s.system) < 0) ids.push(s.system); });
    if (!ids.length) return '';
    return '<div class="used"><span class="used-k">Systems used</span>' + ids.map(function (id) {
      return '<button class="sys-chip" type="button" data-console="' + esc(id) + '">' + esc(SYS[id].name) + ' <span aria-hidden="true">→</span></button>';
    }).join('') + '</div>';
  }

  function setBusy(on) {
    ask.busy = on;
    $$('#ha-form button, #ask-form button, .ask-chip').forEach(function (b) { b.disabled = on; });
    $$('.hero-ask, .ask-panel').forEach(function (p) { p.setAttribute('aria-busy', String(on)); });
  }

  /* Live pipeline. Only real stages of this system: query, BM25 retrieval, Groq generation, citation check.
     Rows are not in an aria-live region; the finished answer is announced once via #ask-announcer. */
  var STATE_SR = { done: 'complete', active: 'in progress', pending: 'pending', warn: 'needs attention', skipped: 'skipped' };
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function pipelineRow(step, label, value, state) {
    return '<li class="pl-row" data-step="' + step + '" data-state="' + state + '">'
      + '<span class="pl-k">' + label + '</span><span class="pl-v mono">' + value + '</span>'
      + '<span class="pl-mark" aria-hidden="true"></span><span class="sr-only" data-sr-state>' + STATE_SR[state] + '</span></li>';
  }
  function pipelineHTML(prep) {
    return '<ol class="pipeline" aria-label="Answer pipeline">'
      + pipelineRow('query', 'Query', prep.cq !== prep.q ? 'with previous question' : '', 'done')
      + pipelineRow('retrieve', 'Retrieved ' + plural(prep.hits.length, 'passage'), fmtMs(prep.retrievalMs), 'done')
      + pipelineRow('generate', 'Generating', '<span data-elapsed aria-hidden="true">0.0 s</span>', 'active')
      + pipelineRow('cite', 'Citations', 'pending', 'pending')
      + '</ol>';
  }
  function setRow(msg, step, label, value, state) {
    var row = $('.pl-row[data-step="' + step + '"]', msg);
    if (!row) return;
    row.setAttribute('data-state', state);
    $('.pl-k', row).textContent = label;
    $('.pl-v', row).textContent = value;
    $('[data-sr-state]', row).textContent = STATE_SR[state];
  }
  // Elapsed time of the in-flight request, measured, updated every 100ms, stopped on completion.
  function startElapsed(nodes, t0) {
    var stopped = false;
    (function tick() {
      if (stopped) return;
      var text = ((performance.now() - t0) / 1000).toFixed(1) + ' s';
      nodes.forEach(function (n) { if (n.textContent !== text) n.textContent = text; });
      setTimeout(tick, 100);
    })();
    return function () { stopped = true; };
  }
  function resolvePipeline(msg, res, cites) {
    var t = res.timings || {};
    if (res.mode === 'llm') {
      setRow(msg, 'retrieve', 'Retrieved ' + plural(res.sources.length, 'passage'), fmtMs(t.retrievalMs), 'done');
      setRow(msg, 'generate', 'Generated', (t.generationMs != null ? fmtMs(t.generationMs) : '') + (t.totalMs != null ? ', total ' + fmtMs(t.totalMs) : ''), 'done');
      if (cites.invalid.length) setRow(msg, 'cite', 'Citations', cites.valid.length + ' valid, ' + cites.invalid.length + ' unmatched', 'warn');
      else if (cites.valid.length) setRow(msg, 'cite', 'Citations', cites.valid.length + ' of ' + cites.valid.length + ' valid', 'done');
      else setRow(msg, 'cite', 'Citations', 'none cited', 'done');
    } else {
      setRow(msg, 'generate', 'Generation skipped', res.reason, 'warn');
      setRow(msg, 'cite', 'Citations', 'not generated', 'skipped');
    }
  }
  function announce(text) {
    var live = $('#ask-announcer');
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 50);
  }

  function messageShell(q, prep) {
    var m = document.createElement('div');
    m.className = 'msg';
    m.innerHTML = '<div class="msg-q mono">' + esc(q) + '</div><div class="msg-a">' + pipelineHTML(prep) + '</div>';
    return m;
  }

  function runQuestion(q, surface) {
    q = String(q || '').trim().slice(0, 300);
    if (!q || ask.busy || !INDEX) return;
    setBusy(true);

    var prep = prepareRetrieval(q);
    prep.q = q;
    var t0 = performance.now();
    var targets = [];
    var modalIntro = $('#ask-log .ask-intro');
    if (modalIntro) modalIntro.remove();
    var modalMsg = messageShell(q, prep);
    $('#ask-log').appendChild(modalMsg);
    targets.push(modalMsg);
    if (surface === 'hero') {
      var heroMsg = messageShell(q, prep);
      heroMsg.classList.add('hero-msg');
      $('#ha-body').innerHTML = '';
      $('#ha-body').appendChild(heroMsg);
      targets.push(heroMsg);
      $('#ha-input').value = '';
    } else {
      $('#ask-input').value = '';
      $('#ask-log').scrollTop = $('#ask-log').scrollHeight;
    }
    var stopElapsed = startElapsed(targets.map(function (m) { return $('[data-elapsed]', m); }), t0);

    askEngine(q, prep, t0).then(function (res) {
      stopElapsed();
      var cites = { valid: [], invalid: [] };
      var answerHTML = res.mode === 'llm' ? formatAnswer(res.answer, res.sources, cites) : localAnswer(q, res.hits);
      var modeNote = res.mode === 'local' ? '<p class="mode-note mono">' + esc(res.reason) + '. Answered from retrieved passages.</p>' : '';
      var extras = traceHTML(res, cites) + usedHTML(res.sources);
      targets.forEach(function (m, i) {
        resolvePipeline(m, res, cites);
        var a = document.createElement('div');
        a.className = 'answer';
        a.innerHTML = modeNote + answerHTML + extras
          + (i === targets.length - 1 && surface === 'hero' ? '<button type="button" class="link-btn continue" data-ask>Continue in Ask Jay.OS <kbd class="kbd-hint">' + kbdLabel() + '</kbd></button>' : '');
        $('.msg-a', m).appendChild(a);
        fadeIn(a, 180);   // the answer is in the DOM immediately; the fade never delays it
      });
      var finished = targets[targets.length - 1].querySelector('.answer');
      var answerText = Array.prototype.map.call(finished.querySelectorAll(':scope > p:not(.mode-note), :scope > ul'), function (n) { return n.textContent; }).join(' ');
      announce((res.mode === 'local' ? res.reason + '. ' : '') + 'Answer: ' + answerText.slice(0, 700));
      ask.history.push({ q: q, a: String(res.mode === 'llm' ? res.answer : res.sources.slice(0, 3).map(function (s) { return s.title; }).join('; ')).slice(0, 600) });
      if (ask.history.length > 4) ask.history.shift();
      $('#ask-log').scrollTop = $('#ask-log').scrollHeight;
      if (surface === 'hero') $('#ha-body').scrollTop = 0;
      setBusy(false);
    }).catch(function () {
      stopElapsed();
      targets.forEach(function (m) { setRow(m, 'generate', 'Generation failed', 'unexpected error', 'warn'); });
      setBusy(false);
    });
  }

  function showCitation(btn) {
    var msg = btn.closest('.msg');
    if (!msg) return;
    var n = btn.getAttribute('data-cite');
    var trace = $('.trace', msg), passage = $('.ts-passage[data-src="' + n + '"]', msg);
    if (!trace || !passage) return;
    trace.open = true;
    passage.open = true;
    passage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    landingHighlight($('summary', passage), 1400);
  }

  function kbdLabel() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'; }

  function openAsk(question) {
    openOverlay($('#ask'), $('#ask-input'));
    if (question) runQuestion(question, 'modal');
  }

  function initAsk() {
    $('#ask-form').addEventListener('submit', function (e) { e.preventDefault(); runQuestion($('#ask-input').value, 'modal'); });
    $('#ha-form').addEventListener('submit', function (e) { e.preventDefault(); runQuestion($('#ha-input').value, 'hero'); });
    $$('#ha-input, #ha-form button, .ask-chip').forEach(function (el) { el.disabled = false; });
    $$('.kbd-hint').forEach(function (k) { k.textContent = kbdLabel(); });
  }

  /* ---------------- global interactions ---------------- */
  function initInteractions() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      var cite = t.closest('[data-cite]');
      if (cite) { showCitation(cite); return; }
      var q = t.closest('[data-ask-q]');
      if (q) { openAsk(q.getAttribute('data-ask-q')); return; }
      if (t.closest('[data-ask]')) { openAsk(); return; }
      var chip = t.closest('.ask-chip');
      if (chip) { runQuestion(chip.textContent, chip.closest('.hero-ask') ? 'hero' : 'modal'); return; }

      var arch = t.closest('[data-arch]');
      if (arch) {
        closeOverlay();
        selectArch(arch.getAttribute('data-arch'), false);
        scrollToEl($('#engineering'));
        return;
      }
      var xp = t.closest('[data-xp]');
      if (xp) { e.preventDefault(); closeOverlay(); focusExperiment(xp.getAttribute('data-xp')); return; }

      // A whole system card opens its console, except for its own links and buttons.
      var con = t.closest('[data-console]');
      if (con && !(con.matches('.sys-card, .sys-feature') && t.closest('a, button'))) {
        openConsole(con.getAttribute('data-console'), con);
        return;
      }
      if (t.closest('[data-close]') || (overlay.current && t === overlay.current)) closeOverlay();
    });

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.current && overlay.current.id === 'ask') closeOverlay();
        else openAsk();
        return;
      }
      if (!overlay.current) {
        var card = e.target.closest && e.target.closest('.sys-card, .sys-feature');
        if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openConsole(card.getAttribute('data-console'), card);
        }
        return;
      }
      if (e.key === 'Escape') { closeOverlay(); return; }
      if (e.key === 'Tab') {
        var f = $$('a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]', overlay.current);
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------------- boot ---------------- */
  // Content is already in the HTML. These run immediately; data-dependent features wait for the JSON.
  initNav();
  initReveal();
  initInteractions();
  syncScrollRegions();
  checkHealth();

  fetch('data/portfolio.json')
    .then(function (r) { if (!r.ok) throw new Error('data ' + r.status); return r.json(); })
    .then(function (d) {
      DATA = d;
      d.systems.forEach(function (s) { SYS[s.id] = s; });
      d.lab.forEach(function (l) { LAB[l.id] = l; });
      d.architectures.forEach(function (a) { ARCH[a.id] = a; });
      var chunks = RAG.buildChunks(d);
      chunks.forEach(function (c) { CHUNKS[c.id] = c; });
      INDEX = RAG.createIndex(chunks);
      $$('[data-index-count]').forEach(function (n) { n.textContent = String(INDEX.N); });
      initLab();
      initEngineering();
      initAsk();
    })
    .catch(function () {
      var body = $('#ha-body');
      if (body) body.innerHTML = '<p class="mode-note mono">The assistant\'s data failed to load. The rest of the page still works.</p>';
    });
})();

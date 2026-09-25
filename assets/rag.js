(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JayRAG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var STOP = new Set(('a an and are as at be by can do does for from has have he his how i in is it its me of on or show '
    + 'tell that the their them this to was what when where which who why with jay jays dhangar about did any some you your '
    + 'give list explain describe work worked know knows like would could should my we our they').split(' '));

  // Query-side expansion so natural phrasing hits the vocabulary used in the content.
  var ALIASES = {
    rag: ['rag', 'retrieval', 'grounded', 'grounding', 'search', 'faiss', 'embedding'],
    llm: ['llm', 'gpt', 'openai', 'groq', 'model'],
    agent: ['agent', 'agentic', 'langgraph', 'crewai', 'agno', 'orchestration'],
    agents: ['agent', 'agentic', 'langgraph', 'crewai', 'agno', 'orchestration'],
    project: ['system', 'project', 'production'],
    projects: ['system', 'project', 'production'],
    built: ['built', 'build', 'developed', 'designed', 'architected'],
    job: ['experience', 'trainee', 'intern', 'role'],
    experience: ['experience', 'trainee', 'intern', 'role', 'company'],
    now: ['current', 'present', 'trainee', 'solulab'],
    currently: ['current', 'present', 'trainee', 'solulab'],
    failure: ['failure', 'retry', 'backoff', 'fallback', 'limit', 'fail', 'root', 'fix'],
    failures: ['failure', 'retry', 'backoff', 'fallback', 'limit', 'fail', 'root', 'fix'],
    wrong: ['failure', 'root', 'cause', 'fix', 'lesson'],
    broke: ['failure', 'root', 'cause', 'fix', 'lesson'],
    fixed: ['failure', 'root', 'cause', 'fix', 'lesson'],
    decision: ['decision', 'why', 'tradeoff'],
    decisions: ['decision', 'why', 'tradeoff'],
    github: ['github', 'repository', 'open', 'source', 'link'],
    demo: ['demo', 'live', 'link'],
    result: ['result', 'production', 'users'],
    voice: ['voice', 'tts', 'whisper', 'narration', 'audio'],
    vision: ['vision', 'image', 'ocr', 'photo', 'poster'],
    contact: ['contact', 'email', 'phone', 'github', 'reach'],
    study: ['education', 'tech', 'cgpa', 'degree'],
    education: ['education', 'tech', 'cgpa', 'degree'],
    skills: ['skills', 'languages', 'python', 'stack'],
    architecture: ['architecture', 'pipeline']
  };

  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function tokenize(text) {
    return String(text).toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter(function (w) { return w.length > 1 && !STOP.has(w); })
      .map(stem);
  }

  // Returns term -> weight. The visitor's own words count fully; alias expansions count less
  // so they broaden recall without outranking an exact entity match.
  function expandQuery(query) {
    var weights = {};
    function put(t, w) { if (!weights[t] || weights[t] < w) weights[t] = w; }
    String(query).toLowerCase().split(/[^a-z0-9+#]+/).forEach(function (w) {
      if (w.length < 2 || STOP.has(w)) return;
      var s = stem(w);
      put(s, 1);
      if (ALIASES[w]) ALIASES[w].forEach(function (a) { put(stem(a), 0.45); });
    });
    return weights;
  }

  var STATUS_TEXT = { production: 'production AI system', live: 'live system', 'open-source': 'open-source project', project: 'personal project' };

  function buildChunks(d) {
    var chunks = [];
    function add(id, title, text, ref, system) {
      chunks.push({ id: id, title: title, text: text, ref: ref || null, system: system || null });
    }
    var sysName = {};
    d.systems.forEach(function (s) { sysName[s.id] = s.name; });

    var p = d.profile;
    add('profile', 'About ' + p.name, p.name + ' is an ' + p.role + ' focused on ' + p.focus + ', based in ' + p.location
      + '. Currently ' + p.current + '. ' + p.headline + ' ' + p.sub + ' Capabilities: ' + (p.capabilities || []).join(', ') + '. ' + p.summary, 'overview');

    d.systems.forEach(function (s) {
      var links = [];
      if (s.links && s.links.github) links.push('GitHub: ' + s.links.github);
      if (s.links && s.links.demo) links.push('Live demo: ' + s.links.demo);
      add(s.id, s.name + ': overview', s.name + ' (' + (STATUS_TEXT[s.status] || s.status) + ', ' + s.role + '). '
        + s.summary + ' Stack: ' + s.stack.join(', ') + '.' + (links.length ? ' ' + links.join('. ') + '.' : ''), 'systems', s.id);
      if (s.problem) add(s.id + '-problem', s.name + ': problem', 'The problem ' + s.name + ' solves: ' + s.problem, 'systems', s.id);
      if (s.result) add(s.id + '-result', s.name + ': result', s.name + ' result: ' + s.result, 'systems', s.id);
      for (var i = 0; i < s.highlights.length; i += 2) {
        add(s.id + '-' + i, s.name + ': contribution', s.highlights.slice(i, i + 2).join(' '), 'systems', s.id);
      }
      (s.decisions || []).forEach(function (dec, j) {
        add(s.id + '-dec-' + j, s.name + ': decision', 'Engineering decision in ' + s.name + ': ' + dec.title + '. Why: ' + dec.why, 'systems', s.id);
      });
    });

    d.architectures.forEach(function (a) {
      var sys = sysName[a.id] ? a.id : null;
      add('arch-' + a.id, a.name + ': architecture', a.caption + ' Stages: ' + a.stages.map(function (st) {
        return st.label + ' (' + st.nodes.map(function (n) { return n.label; }).join(', ') + ')';
      }).join(' → ') + '.', 'engineering', sys);
      a.stages.forEach(function (st, si) {
        st.nodes.forEach(function (n, ni) {
          add('node-' + a.id + '-' + si + '-' + ni, (sysName[a.id] || a.name) + ': ' + n.label,
            n.label + ' (' + st.label + ' stage of ' + a.name + '): ' + n.what + ' Why it exists: ' + n.why
            + ' Input: ' + n.in + '. Output: ' + n.out + '. Failure modes: ' + n.fails.join('; ') + '.', 'engineering', sys);
        });
      });
    });

    d.lab.forEach(function (l) {
      add('lab-' + l.id, 'Failure case: ' + l.title, l.system + ' (' + l.type + ', '
        + (l.kind === 'incident' ? 'observed failure' : 'failure mode designed against') + '). Problem: ' + l.problem
        + ' Failure: ' + l.failure + ' Root cause: ' + l.rootCause + ' Fix: ' + l.fix + ' Lesson: ' + l.lesson, 'lab', l.systemId);
    });

    d.experience.forEach(function (e, i) {
      add('exp-' + i, e.role + ' at ' + e.company, e.role + ' at ' + e.company + (e.location ? ' (' + e.location + ')' : '')
        + ', ' + e.period + (e.current ? ' (current role)' : '') + '. ' + e.bullets.join(' '), 'experience');
    });

    add('education', 'Education', d.education.map(function (e) {
      return e.degree + ', ' + e.school + ', ' + e.period + ', ' + e.score;
    }).join('. ') + '.', 'experience');

    add('skills', 'Skills', d.skills.map(function (s) { return s.group + ': ' + s.items.join(', '); }).join('. ') + '.', 'experience');

    d.thinking.forEach(function (t, i) {
      add('think-' + i, 'Principle: ' + t.title, t.title + '. ' + t.body + ' ' + (t.reasoning || []).join(' ')
        + ' In practice: ' + [].concat(t.evidence).join('; ') + '.', 'thinking');
    });

    var c = d.contact;
    add('contact', 'Contact', 'Reach Jay by email at ' + c.email + ', phone ' + c.phone + ', GitHub ' + c.github
      + '. Based in ' + c.location + '. Languages: ' + c.languages.join(', ') + '. Interests: ' + c.interests.join(', ') + '.', 'contact');

    return chunks;
  }

  function createIndex(chunks) {
    var df = {}, totalLen = 0;
    var docs = chunks.map(function (c) {
      var toks = tokenize(c.title + ' ' + c.text);
      var titleToks = new Set(tokenize(c.title));
      var tf = {};
      toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      Object.keys(tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
      totalLen += toks.length;
      return { chunk: c, tf: tf, len: toks.length, titleToks: titleToks };
    });
    return { docs: docs, df: df, N: docs.length, avgdl: totalLen / Math.max(docs.length, 1) };
  }

  function search(index, query, k) {
    var weights = expandQuery(query);
    var terms = Object.keys(weights);
    if (!terms.length) return [];
    var K1 = 1.4, B = 0.75;
    var scored = index.docs.map(function (d) {
      var score = 0;
      terms.forEach(function (t) {
        var f = d.tf[t];
        if (!f) return;
        var idf = Math.log(1 + (index.N - index.df[t] + 0.5) / (index.df[t] + 0.5));
        var s = idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / index.avgdl));
        if (d.titleToks.has(t)) s += idf * 0.9;
        score += s * weights[t];
      });
      return { chunk: d.chunk, score: score };
    }).filter(function (r) { return r.score > 0.5; });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, k || 5);
  }

  // Follow-ups like "what went wrong there?" carry no entity, so borrow the previous question's terms.
  var REFERENTIAL = /\b(it|its|that|this|there|they|them|those|these|same|more)\b/i;
  function contextualQuery(question, history) {
    var prev = history && history.length ? history[history.length - 1].q : '';
    if (!prev) return question;
    return (tokenize(question).length <= 1 || REFERENTIAL.test(question)) ? question + ' ' + prev : question;
  }

  return { tokenize: tokenize, buildChunks: buildChunks, createIndex: createIndex, search: search, contextualQuery: contextualQuery };
});

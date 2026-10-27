/* R&W Practice — app UI. Plain JS, no build step. */
(function () {
  const DOMAIN_ORDER = ['Information and Ideas', 'Craft and Structure', 'Expression of Ideas', 'Standard English Conventions'];
  const DOMAIN_SKILLS = {
    'Information and Ideas': ['Central Ideas and Details', 'Command of Evidence', 'Inferences'],
    'Craft and Structure': ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'],
    'Expression of Ideas': ['Rhetorical Synthesis', 'Transitions'],
    'Standard English Conventions': ['Boundaries', 'Form, Structure, and Sense'],
  };
  // Order questions appear in on the real test
  const SKILL_ORDER = ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections', 'Central Ideas and Details', 'Command of Evidence', 'Inferences', 'Boundaries', 'Form, Structure, and Sense', 'Transitions', 'Rhetorical Synthesis'];
  const ALL_SKILLS = SKILL_ORDER.slice();
  const DIFFS = ['Easy', 'Medium', 'Hard'];
  const MODULE_N = 27, MODULE_SEC = 32 * 60;
  const LETTERS = ['A', 'B', 'C', 'D'];

  const S = { bank: [], byId: new Map(), progress: {}, sessions: [], active: null, tab: 'practice', resultId: null, run: null, bankQuery: '', bankSkill: '', bankDiff: '', bankStatus: '', bankLimit: 100, wrongSkill: '', wrongDiff: '' };
  const app = document.getElementById('app');

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = (sec) => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const diffBars = (d) => { const n = DIFFS.indexOf(d) + 1; return `<span class="diff" title="${esc(d)}">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`; };
  const dateStr = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const plain = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

  function loadPrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('rw-prefs') || '{}'); } catch (e) { /* storage blocked */ }
    return Object.assign({ mode: 'test', source: 'all', order: 'test', skills: ALL_SKILLS.slice(), diffs: DIFFS.slice(), elimOn: false }, p);
  }
  const prefs = loadPrefs();
  const savePrefs = () => { try { localStorage.setItem('rw-prefs', JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  function toast(msg, ms = 2600) {
    const root = document.getElementById('toast-root');
    root.innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { root.innerHTML = ''; }, ms);
  }

  function modal({ title, body, buttons }) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      root.innerHTML = `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">
        ${title ? `<h3>${esc(title)}</h3>` : ''}<div>${body || ''}</div>
        <div class="actions">${(buttons || [{ label: 'OK', value: true }]).map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
      </div></div>`;
      root.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => {
        const b = buttons ? buttons[+el.dataset.i] : { value: true };
        root.innerHTML = '';
        resolve(b.value);
      }));
    });
  }

  const ICON = {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l3 3"/><path d="M13 20h7" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    bookmark: '<svg viewBox="0 0 16 20"><path d="M2 1.5h12v17l-6-4.5-6 4.5z" fill="none" stroke="#1e1e1e" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    flag: '<svg class="flag" viewBox="0 0 16 20"><path d="M2 1.5h12v17l-6-4.5-6 4.5z" fill="#c3332f" stroke="#fff" stroke-width="1.5"/></svg>',
    chevUp: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    chevDown: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    clock: '<svg class="clock" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    google: '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  };

  // ---------- data ----------
  function indexBank() {
    S.byId = new Map(S.bank.map((q) => [q.id, q]));
  }
  const prog = (id) => S.progress[id] || null;
  const inFolder = (id) => !!(S.progress[id] && S.progress[id].w) && S.byId.has(id);
  const folderIds = () => S.bank.filter((q) => inFolder(q.id)).map((q) => q.id);

  function recordAnswer(qid, ans) {
    const q = S.byId.get(qid);
    if (!q) return false;
    const ok = ans === q.answer;
    const r = Object.assign({ n: 0, c: 0, wn: 0, w: false }, S.progress[qid]);
    r.n++; if (ok) r.c++;
    r.last = ans || ''; r.ok = ok; r.t = Date.now();
    if (!ok) { r.w = true; r.wn++; r.wt = Date.now(); }
    S.progress[qid] = r;
    return ok;
  }
  async function persistProgress(ids) {
    try { await Store.saveProgress(S.progress, ids); } catch (e) { console.error(e); toast('Could not save progress — check your connection.'); }
  }
  async function removeFromFolder(id) {
    if (!S.progress[id]) return;
    S.progress[id].w = false;
    await persistProgress([id]);
  }

  let activeTimer = null;
  function saveActiveSoon() {
    clearTimeout(activeTimer);
    activeTimer = setTimeout(() => { Store.saveActive(S.active).catch((e) => console.error(e)); }, 1200);
  }

  // ---------- boot ----------
  async function boot() {
    await Store.init(async () => { await loadData(); render(); });
    if (Store.cloudConfigured && !Store.user && !Store.error) return renderGate();
    await loadData();
    if (!S.bank.length) S.tab = 'bank';
    render();
  }

  async function loadData() {
    app.innerHTML = '<div class="boot">Loading your questions…</div>';
    try {
      S.bank = await Store.getBank();
      indexBank();
      S.progress = await Store.getProgress();
      S.sessions = await Store.listSessions();
      S.active = await Store.getActive();
    } catch (e) {
      console.error(e);
      Store.error = 'Could not load your data: ' + e.message;
    }
  }

  function renderGate() {
    app.innerHTML = `<div class="gate"><div class="card">
      <div class="brand" style="justify-content:center;margin-bottom:14px"><div class="logo">RW</div>R&amp;W Practice</div>
      <p class="muted">Sign in so your questions, wrong-answer folder, and history sync between your computers.</p>
      <button class="gbtn" id="signin">${ICON.google} Sign in with Google</button>
    </div></div>`;
    document.getElementById('signin').onclick = async () => {
      try { await Store.signIn(); } catch (e) { toast('Sign-in failed: ' + (e.code || e.message), 5000); }
    };
  }

  // ---------- render root ----------
  function render() {
    if (S.run) return renderRunner();
    const wrongN = folderIds().length;
    const tabs = [['practice', 'Practice'], ['wrong', `Wrong Answers ${wrongN ? `<span class="badge">${wrongN}</span>` : ''}`], ['history', 'History'], ['bank', 'Question Bank']];
    const acct = Store.user
      ? `<span class="sync"><span class="dot ok"></span>Synced</span>${Store.user.photo ? `<img class="avatar" src="${esc(Store.user.photo)}" alt="">` : ''}<span>${esc(Store.user.name)}</span><button class="link" data-act="signout">Sign out</button>`
      : `<span class="sync" title="Data is saved in this browser only. See SETUP.md to turn on cloud sync."><span class="dot warn"></span>Local only (not syncing)</span>`;
    let body = '';
    if (S.tab === 'practice') body = viewPractice();
    else if (S.tab === 'wrong') body = viewWrong();
    else if (S.tab === 'history') body = viewHistory();
    else if (S.tab === 'bank') body = viewBank();
    else if (S.tab === 'results') body = viewResults();
    app.innerHTML = `<div class="shell">
      <header class="topbar">
        <div class="brand"><div class="logo">RW</div><span class="txt">R&amp;W Practice</span></div>
        <nav class="tabs">${tabs.map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
        <div class="account">${acct}</div>
      </header>
      <main class="page">${Store.error ? `<div class="notice">${esc(Store.error)}</div>` : ''}${body}</main>
    </div>`;
    if (S.tab === 'bank') wireDrop();
  }

  // ---------- Practice tab ----------
  function poolFor({ skills = prefs.skills, diffs = prefs.diffs, source = prefs.source } = {}) {
    return S.bank.filter((q) => skills.includes(q.skill) && diffs.includes(q.difficulty) &&
      (source === 'all' || (source === 'unseen' && !prog(q.id)) || (source === 'wrong' && inFolder(q.id))));
  }

  function viewPractice() {
    if (!S.bank.length) return `<div class="card empty"><h2>No questions yet</h2><p>Import your Question Bank PDF export to get started.</p><button class="btn" data-act="tab" data-tab="bank">Import questions</button></div>`;
    const pool = poolFor();
    const n = Math.min(MODULE_N, pool.length);
    const secs = Math.round((MODULE_SEC * n) / MODULE_N);
    const countSkill = (sk) => poolFor({ skills: [sk] }).length;
    const countDiff = (d) => poolFor({ diffs: [d] }).length;
    const countSrc = (src) => poolFor({ source: src }).length;
    const a = S.active;
    const resume = a ? `<div class="notice info row"><div><b>Unfinished ${a.mode === 'test' ? 'test' : 'practice'} module</b> — question ${a.cur + 1} of ${a.qids.length}, ${Object.keys(a.answers).length} answered${a.timeLimit ? `, ${fmt(a.timeLimit - a.elapsed)} left` : ''}. Started ${dateStr(a.createdAt)}.</div><div class="spacer"></div><button class="btn small" data-act="resume">Resume</button><button class="btn small danger" data-act="discard">Discard</button></div>` : '';
    return `${resume}
    <h1>Practice</h1>
    <p class="sub">Build a module from your question bank. Test mode works like test day; practice mode shows the answer after each question.</p>
    <div class="grid2">
      <div>
        <div class="card">
          <div class="field"><label>Mode</label>
            <div class="seg">
              <button class="tile ${prefs.mode === 'test' ? 'on' : ''}" data-act="pref" data-k="mode" data-v="test"><b>Test mode</b><span>Timed module like the real test. Results at the end.</span></button>
              <button class="tile ${prefs.mode === 'practice' ? 'on' : ''}" data-act="pref" data-k="mode" data-v="practice"><b>Practice mode</b><span>Untimed. Check each answer and read the explanation.</span></button>
            </div></div>
          <div class="field"><label>Questions from</label>
            <div class="chips">
              ${[['all', 'All questions'], ['unseen', 'Not yet attempted'], ['wrong', 'Wrong-answer folder']].map(([k, l]) => `<button class="chip ${prefs.source === k ? 'on' : ''}" data-act="pref" data-k="source" data-v="${k}">${l}<span class="n">${countSrc(k)}</span></button>`).join('')}
            </div></div>
          <div class="field" style="margin-bottom:0"><div class="row" style="margin-bottom:8px"><span class="label" style="margin:0">Content</span><div class="spacer"></div><button class="link small" data-act="skills-all">Select all</button><button class="link small" data-act="skills-none">Clear</button></div>
            ${DOMAIN_ORDER.map((d) => {
              const sk = DOMAIN_SKILLS[d];
              const on = sk.filter((s) => prefs.skills.includes(s)).length;
              return `<div class="domain"><label class="domain-head check"><input type="checkbox" data-act="domain" data-d="${esc(d)}" ${on === sk.length ? 'checked' : ''} ${on && on < sk.length ? 'data-ind="1"' : ''}>${esc(d)}</label>
                <div class="domain-body">${sk.map((s) => `<label class="check"><input type="checkbox" data-act="skill" data-s="${esc(s)}" ${prefs.skills.includes(s) ? 'checked' : ''}>${esc(s)}<span class="n">${countSkill(s)}</span></label>`).join('')}</div></div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="field"><label>Difficulty</label>
            <div class="chips">${DIFFS.map((d) => `<button class="chip ${prefs.diffs.includes(d) ? 'on' : ''}" data-act="diff" data-v="${d}">${diffBars(d)} ${d}<span class="n">${countDiff(d)}</span></button>`).join('')}</div></div>
          <div class="field" style="margin-bottom:0"><label>Question order</label>
            <div class="seg">
              <button class="tile ${prefs.order === 'test' ? 'on' : ''}" data-act="pref" data-k="order" data-v="test"><b>Test order</b><span>Grouped by question type, like the real module.</span></button>
              <button class="tile ${prefs.order === 'scramble' ? 'on' : ''}" data-act="pref" data-k="order" data-v="scramble"><b>Scramble</b><span>Random mix of everything selected.</span></button>
            </div></div>
        </div>
        <div class="card">
          <div class="summary-line"><div><div class="big-num">${pool.length}</div><div class="muted small">matching questions</div></div><div class="spacer"></div>
          <div style="text-align:right"><b>${n} question${n === 1 ? '' : 's'}</b><div class="muted small">${prefs.mode === 'test' ? `${fmt(secs)} time limit` : 'Untimed'}</div></div></div>
          ${n && n < MODULE_N ? `<p class="small muted" style="margin:12px 0 0">Fewer than ${MODULE_N} questions match, so this module is shorter${prefs.mode === 'test' ? ' and the timer is scaled to keep test pace (about 71 seconds per question)' : ''}.</p>` : ''}
          ${prefs.source === 'all' ? '<p class="small muted" style="margin:12px 0 0">Questions you haven\'t attempted yet are picked first.</p>' : ''}
          <button class="btn big" style="width:100%;margin-top:16px" data-act="start" ${n ? '' : 'disabled'}>${a ? 'Start new module' : 'Start module'}</button>
        </div>
      </div>
    </div>`;
  }

  function buildModule() {
    let pool = poolFor();
    if (prefs.source === 'all') pool = shuffle(pool).sort((x, y) => (prog(x.id) ? 1 : 0) - (prog(y.id) ? 1 : 0));
    else pool = shuffle(pool);
    let pick = pool.slice(0, MODULE_N);
    if (prefs.order === 'test') pick.sort((x, y) => SKILL_ORDER.indexOf(x.skill) - SKILL_ORDER.indexOf(y.skill) || DIFFS.indexOf(x.difficulty) - DIFFS.indexOf(y.difficulty));
    else pick = shuffle(pick);
    const n = pick.length;
    const label = [prefs.source === 'wrong' ? 'Wrong-answer folder' : prefs.source === 'unseen' ? 'New questions' : null,
      prefs.skills.length === ALL_SKILLS.length ? 'All question types' : prefs.skills.length <= 2 ? prefs.skills.join(', ') : `${prefs.skills.length} question types`,
      prefs.diffs.length === 3 ? null : prefs.diffs.join(' + '), prefs.order === 'scramble' ? 'Scrambled' : null].filter(Boolean).join(' · ');
    return {
      id: uid(), mode: prefs.mode, createdAt: Date.now(), qids: pick.map((q) => q.id), answers: {}, marked: {}, elim: {}, checked: {}, notes: {},
      timeLimit: prefs.mode === 'test' ? Math.round((MODULE_SEC * n) / MODULE_N) : null, elapsed: 0, cur: 0, onReview: false, label,
    };
  }

  // ---------- Wrong answers tab ----------
  function viewWrong() {
    let ids = folderIds();
    const total = ids.length;
    ids = ids.filter((id) => { const q = S.byId.get(id); return (!S.wrongSkill || q.skill === S.wrongSkill) && (!S.wrongDiff || q.difficulty === S.wrongDiff); });
    ids.sort((a, b) => (S.progress[b].wt || 0) - (S.progress[a].wt || 0));
    S.wrongList = ids;
    if (!total) return `<h1>Wrong Answers</h1><p class="sub">Every question you miss is saved here until you remove it.</p><div class="card empty"><h2>Nothing here yet</h2><p>Questions you get wrong (or leave blank in test mode) will show up here.</p></div>`;
    return `<h1>Wrong Answers</h1><p class="sub">Every question you miss is saved here until you remove it. Review the explanation, then practice them again.</p>
    <div class="card">
      <div class="row" style="margin-bottom:14px">
        <select class="sel" data-act="wrong-skill"><option value="">All question types</option>${SKILL_ORDER.map((s) => `<option ${S.wrongSkill === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <select class="sel" data-act="wrong-diff"><option value="">All difficulties</option>${DIFFS.map((d) => `<option ${S.wrongDiff === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <span class="muted small">${ids.length} of ${total}</span>
        <div class="spacer"></div>
        <button class="btn ghost small" data-act="wrong-review" ${ids.length ? '' : 'disabled'}>Review these</button>
        <button class="btn small" data-act="wrong-practice">Practice folder</button>
      </div>
      <table class="list"><thead><tr><th>Question type</th><th>Difficulty</th><th>Question</th><th>Missed</th><th>Last try</th><th></th></tr></thead><tbody>
      ${ids.map((id, i) => { const q = S.byId.get(id), r = S.progress[id]; return `<tr class="click" data-act="wrong-open" data-i="${i}">
        <td>${esc(q.skill)}</td><td>${diffBars(q.difficulty)}</td><td><div class="snippet">${esc(q.text)}</div></td>
        <td>${r.wn}×</td><td>${r.ok ? '<span class="pill ok">Correct</span>' : '<span class="pill bad">Wrong</span>'} <span class="muted small" style="white-space:nowrap">${new Date(r.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></td>
        <td><button class="link small" data-act="wrong-remove" data-id="${id}">Remove</button></td></tr>`; }).join('')}
      </tbody></table>
    </div>`;
  }

  // ---------- History tab ----------
  function viewHistory() {
    const recs = Object.entries(S.progress).filter(([id]) => S.byId.has(id)).map(([, r]) => r);
    const att = recs.reduce((a, r) => a + r.n, 0), cor = recs.reduce((a, r) => a + r.c, 0);
    const bySkill = SKILL_ORDER.map((s) => {
      let n = 0, c = 0, seen = 0;
      S.bank.forEach((q) => { if (q.skill !== s) return; const r = prog(q.id); if (r) { n += r.n; c += r.c; seen++; } });
      return { s, n, c, seen, total: S.bank.filter((q) => q.skill === s).length };
    });
    const byDiff = DIFFS.map((d) => { let n = 0, c = 0; S.bank.forEach((q) => { if (q.difficulty !== d) return; const r = prog(q.id); if (r) { n += r.n; c += r.c; } }); return { d, n, c }; });
    return `<h1>History</h1><p class="sub">Your accuracy across every question you've answered.</p>
    <div class="stat-grid">
      <div class="stat"><div class="v">${recs.length}<span class="muted small"> / ${S.bank.length}</span></div><div class="k">Questions attempted</div></div>
      <div class="stat"><div class="v">${att ? pct(cor, att) + '%' : '—'}</div><div class="k">Overall accuracy</div></div>
      <div class="stat"><div class="v">${S.sessions.length}</div><div class="k">Modules completed</div></div>
      <div class="stat"><div class="v">${folderIds().length}</div><div class="k">In wrong-answer folder</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>By question type</h2><table class="list"><thead><tr><th>Type</th><th>Seen</th><th>Accuracy</th><th></th></tr></thead><tbody>
        ${bySkill.map((x) => `<tr><td>${esc(x.s)}</td><td class="muted">${x.seen}/${x.total}</td><td style="width:40%"><div class="bar"><div style="width:${pct(x.c, x.n)}%;${x.n && pct(x.c, x.n) < 60 ? 'background:var(--red)' : ''}"></div></div></td><td>${x.n ? pct(x.c, x.n) + '%' : '—'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="card"><h2>By difficulty</h2><table class="list"><tbody>
        ${byDiff.map((x) => `<tr><td>${diffBars(x.d)} ${x.d}</td><td style="width:45%"><div class="bar"><div style="width:${pct(x.c, x.n)}%"></div></div></td><td>${x.n ? pct(x.c, x.n) + '%' : '—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="card"><h2>Completed modules</h2>
      ${S.sessions.length ? `<table class="list"><thead><tr><th>Date</th><th>Mode</th><th>Content</th><th>Score</th><th>Time</th></tr></thead><tbody>
      ${S.sessions.map((s) => `<tr class="click" data-act="open-result" data-id="${s.id}"><td>${dateStr(s.finishedAt)} <span class="muted small">${timeStr(s.finishedAt)}</span></td><td>${s.mode === 'test' ? 'Test' : 'Practice'}</td><td class="muted">${esc(s.label || '')}</td><td><b>${s.correct}/${s.total}</b> <span class="muted small">${pct(s.correct, s.total)}%</span></td><td>${fmt(s.elapsed)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">No modules yet.</div>'}
      <div class="row" style="margin-top:16px"><div class="spacer"></div><button class="link small" style="color:var(--red)" data-act="reset">Reset all progress…</button></div>
    </div>`;
  }

  // ---------- Results ----------
  function viewResults() {
    const s = S.sessions.find((x) => x.id === S.resultId);
    if (!s) return '<div class="empty">Result not found.</div>';
    const qs = s.qids.map((id) => S.byId.get(id)).filter(Boolean);
    const p = pct(s.correct, s.total);
    const byDom = DOMAIN_ORDER.map((d) => { const list = qs.filter((q) => q.domain === d); return { d, n: list.length, c: list.filter((q) => s.answers[q.id] === q.answer).length }; }).filter((x) => x.n);
    return `<div class="row" style="margin-bottom:8px"><button class="link" data-act="tab" data-tab="history">← History</button></div>
    <h1>${s.mode === 'test' ? 'Test' : 'Practice'} results</h1><p class="sub">${dateStr(s.finishedAt)} · ${esc(s.label || '')}</p>
    <div class="card"><div class="score-hero">
      <div class="ring" style="background:conic-gradient(var(--blue) ${p * 3.6}deg,#e6e8ee 0)"><div>${s.correct}/${s.total}<small>${p}% correct</small></div></div>
      <div style="flex:1;min-width:240px">
        ${byDom.map((x) => `<div class="row" style="margin-bottom:10px"><span style="width:240px">${esc(x.d)}</span><div class="bar" style="flex:1"><div style="width:${pct(x.c, x.n)}%"></div></div><b style="width:52px;text-align:right">${x.c}/${x.n}</b></div>`).join('')}
        <div class="muted small">Time used: ${fmt(s.elapsed)}${s.timeLimit ? ` of ${fmt(s.timeLimit)}` : ''}. ${s.correct === s.total ? 'Perfect module!' : s.flagged ? `${s.flagged} missed question${s.flagged === 1 ? '' : 's'} saved to your wrong-answer folder.` : ''}</div>
      </div>
      <div><button class="btn" data-act="review-session" data-i="0">Review questions</button></div>
    </div></div>
    <div class="card"><table class="list"><thead><tr><th>#</th><th>Question type</th><th>Difficulty</th><th>Your answer</th><th>Correct</th><th></th></tr></thead><tbody>
      ${qs.map((q, i) => { const a = s.answers[q.id]; const ok = a === q.answer; return `<tr class="click" data-act="review-session" data-i="${i}"><td><b>${i + 1}</b></td><td>${esc(q.skill)}</td><td>${diffBars(q.difficulty)}</td><td>${a ? `<span class="${ok ? 'ok' : 'bad'}">${a}</span>` : s.mode === 'practice' ? '<span class="muted">—</span>' : '<span class="bad">Omitted</span>'}</td><td>${q.answer}</td><td>${ok ? '<span class="pill ok">Correct</span>' : !a && s.mode === 'practice' ? '<span class="pill">Skipped</span>' : '<span class="pill bad">Incorrect</span>'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  }

  // ---------- Question Bank tab ----------
  function viewBank() {
    const dropzone = `<div class="drop" id="drop">
      <div class="big-icon">📄</div>
      <p style="margin:8px 0 4px"><b>Drop your Question Bank PDF export here</b></p>
      <p class="muted small" style="margin:0 0 14px">Export from the SAT Suite Question Bank with answers and explanations included. Re-importing is safe: questions are matched by ID and your progress is kept.</p>
      <label class="btn ghost" style="display:inline-block">Choose file<input type="file" accept="application/pdf,.pdf" id="file" hidden></label>
      <div id="import-status" class="hidden"><div class="progress"><div id="import-bar"></div></div><div class="small muted" id="import-msg"></div></div>
    </div>`;
    if (!S.bank.length) return `<h1>Question Bank</h1><p class="sub">Import your question bank once — it's saved to your account, so you won't need the file on your other computer.</p>${!Store.user ? '<div class="notice">Cloud sync is off, so the questions will only be saved in this browser. See SETUP.md to connect Firebase.</div>' : ''}${dropzone}`;
    const q = S.bankQuery.toLowerCase();
    const list = S.bank.filter((x) => (!S.bankSkill || x.skill === S.bankSkill) && (!S.bankDiff || x.difficulty === S.bankDiff) &&
      (!S.bankStatus || (S.bankStatus === 'unseen' && !prog(x.id)) || (S.bankStatus === 'seen' && prog(x.id)) || (S.bankStatus === 'wrong' && inFolder(x.id))) &&
      (!q || x.text.toLowerCase().includes(q) || x.id.includes(q)))
      .sort((a, b) => SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill) || DIFFS.indexOf(a.difficulty) - DIFFS.indexOf(b.difficulty));
    S.bankList = list.map((x) => x.id);
    const counts = DOMAIN_ORDER.map((d) => `${esc(d)}: <b>${S.bank.filter((x) => x.domain === d).length}</b>`).join(' · ');
    return `<h1>Question Bank</h1><p class="sub">${S.bank.length} Reading and Writing questions. ${counts}</p>
    <div class="card">
      <div class="row" style="margin-bottom:14px">
        <input class="search" placeholder="Search passages or question ID" value="${esc(S.bankQuery)}" data-act="bank-q">
        <select class="sel" data-act="bank-skill"><option value="">All types</option>${SKILL_ORDER.map((s) => `<option ${S.bankSkill === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <select class="sel" data-act="bank-diff"><option value="">All difficulties</option>${DIFFS.map((d) => `<option ${S.bankDiff === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <select class="sel" data-act="bank-status"><option value="">Any status</option>${[['unseen', 'Not attempted'], ['seen', 'Attempted'], ['wrong', 'In wrong folder']].map(([k, l]) => `<option value="${k}" ${S.bankStatus === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="muted small">${list.length} shown</span>
      </div>
      <table class="list"><thead><tr><th>ID</th><th>Question type</th><th>Difficulty</th><th>Passage</th><th>Status</th></tr></thead><tbody>
      ${list.slice(0, S.bankLimit).map((x, i) => { const r = prog(x.id); return `<tr class="click" data-act="bank-open" data-i="${i}"><td class="muted small">${x.id}</td><td>${esc(x.skill)}</td><td>${diffBars(x.difficulty)}</td><td><div class="snippet">${x.figure ? '📊 ' : ''}${esc(x.text)}</div></td><td>${!r ? '<span class="muted small">New</span>' : inFolder(x.id) ? '<span class="pill bad">In folder</span>' : `<span class="pill ok">${r.c}/${r.n}</span>`}</td></tr>`; }).join('')}
      </tbody></table>
      ${list.length > S.bankLimit ? `<div style="text-align:center;margin-top:14px"><button class="btn ghost small" data-act="bank-more">Show more</button></div>` : ''}
    </div>
    <div class="card"><h2>Import another export</h2>${dropzone}</div>`;
  }

  function wireDrop() {
    const drop = document.getElementById('drop'), file = document.getElementById('file');
    if (!drop) return;
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0]); });
    file.addEventListener('change', () => { if (file.files[0]) importFile(file.files[0]); });
  }

  let importing = false;
  async function importFile(f) {
    if (importing) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return toast('Please choose a PDF file.');
    importing = true;
    const st = document.getElementById('import-status'), bar = document.getElementById('import-bar'), msg = document.getElementById('import-msg');
    st.classList.remove('hidden');
    const set = (text, frac) => { msg.textContent = text; bar.style.width = Math.round(frac * 100) + '%'; };
    try {
      set('Opening PDF…', 0.02);
      const data = new Uint8Array(await f.arrayBuffer());
      const res = await QBParser.parse(data, (p, n, found) => set(`Reading page ${p} of ${n} — ${found} questions found`, (p / n) * 0.8));
      const rw = res.questions.filter((q) => SKILL_ORDER.includes(q.skill));
      const skipped = res.questions.length - rw.length;
      if (!rw.length) throw new Error('No Reading and Writing questions were found in this file.');
      const fresh = rw.filter((q) => !S.byId.has(q.id)).length;
      set(`Saving ${rw.length} questions${Store.user ? ' to your account' : ''}…`, 0.82);
      S.bank = await Store.saveBank(rw, S.bank, (i, n) => set(`Saving questions… ${i}/${n}`, 0.82 + (i / n) * 0.18));
      indexBank();
      importing = false;
      await modal({
        title: 'Import complete',
        body: `<p>Imported <b>${rw.length}</b> questions (${fresh} new, ${rw.length - fresh} updated). ${rw.filter((q) => q.figure).length} include a graph or table.</p>
          ${skipped ? `<p class="muted">${skipped} non–Reading and Writing questions were skipped.</p>` : ''}
          ${res.warnings.length ? `<p class="muted">${res.warnings.length} question(s) couldn't be read: ${esc(res.warnings.slice(0, 5).join('; '))}</p>` : ''}`,
        buttons: [{ label: 'Start practicing', value: true }],
      });
      S.tab = 'practice';
      render();
    } catch (e) {
      console.error(e);
      importing = false;
      set('Import failed: ' + e.message, 0);
      toast('Import failed: ' + e.message, 6000);
    }
  }

  // ============ Bluebook-style runner ============
  // S.run = { kind: 'live' | 'review', s (session for live), list, answers, idx, title, source, revealed:Set }
  let tick = null;

  function openLive(s) {
    S.active = s;
    S.run = { kind: 'live', s, timerHidden: false, warned: s.timeLimit && s.timeLimit - s.elapsed <= 300 };
    startTick();
    saveActiveSoon();
    render();
  }

  function openReview({ list, answers, idx, title, source }) {
    S.run = { kind: 'review', list, answers: answers || {}, idx: idx || 0, title, source, revealed: new Set(), notes: {} };
    render();
  }

  function closeRunner() {
    stopTick();
    hideHlBar();
    S.run = null;
    render();
  }

  function startTick() {
    stopTick();
    tick = setInterval(() => {
      const r = S.run;
      if (!r || r.kind !== 'live') return;
      const s = r.s;
      s.elapsed++;
      if (s.elapsed % 15 === 0) saveActiveSoon();
      if (s.timeLimit) {
        const left = s.timeLimit - s.elapsed;
        if (left === 300 && !r.warned) { r.warned = true; r.timerHidden = false; toast('5 minutes remaining in this module.', 4000); }
        if (left <= 0) { stopTick(); timeUp(); return; }
      }
      updateTimer();
    }, 1000);
  }
  function stopTick() { clearInterval(tick); tick = null; }

  function updateTimer() {
    const el = document.getElementById('bb-timer');
    if (!el || !S.run || S.run.kind !== 'live') return;
    const s = S.run.s;
    const shown = s.timeLimit ? s.timeLimit - s.elapsed : s.elapsed;
    el.innerHTML = S.run.timerHidden ? ICON.clock : fmt(shown);
    el.classList.toggle('warn', !!s.timeLimit && s.timeLimit - s.elapsed <= 300);
  }

  async function timeUp() {
    await modal({ title: "Time's up", body: '<p>This module has ended. Your answers have been submitted.</p>', buttons: [{ label: 'See results', value: true }] });
    finishLive();
  }

  const curList = () => (S.run.kind === 'live' ? S.run.s.qids : S.run.list);
  const curIdx = () => (S.run.kind === 'live' ? S.run.s.cur : S.run.idx);
  function setIdx(i) {
    hideHlBar();
    if (S.run.kind === 'live') { S.run.s.cur = i; S.run.s.onReview = false; saveActiveSoon(); } else S.run.idx = i;
    S.run.popOpen = false;
    renderRunner();
  }

  function renderRunner() {
    const r = S.run;
    const live = r.kind === 'live';
    const s = r.s;
    const list = curList(), idx = curIdx();
    const onReviewPage = live && s.onReview;
    const q = S.byId.get(list[idx]);
    const title = live ? (s.mode === 'test' ? 'Section 1, Module 1: Reading and Writing' : 'Reading and Writing: Practice') : r.title;
    const name = (Store.user && Store.user.name) || 'Student';

    const top = `<header class="bb-top">
      <div><div class="bb-title">${esc(title)}</div>${live ? `<button class="bb-directions" data-act="directions">Directions ${ICON.chevDown}</button>` : `<button class="bb-directions" data-act="exit-review">← Exit review</button>`}</div>
      <div class="bb-center">${live ? `<div class="bb-timer" id="bb-timer"></div>${s.timeLimit ? `<button class="bb-hide" data-act="hide-timer">${r.timerHidden ? 'Show' : 'Hide'}</button>` : '<div class="small muted">Time elapsed</div>'}` : ''}</div>
      <div class="bb-right">
        <button class="bb-tool" data-act="hl-tool">${ICON.pen}<span>Highlights &amp; Notes</span></button>
        <button class="bb-tool ${r.menuOpen ? 'on' : ''}" data-act="menu">${ICON.more}<span>More</span></button>
      </div>
      ${r.menuOpen ? `<div class="menu">${live ? `<button data-act="save-exit">Save and exit</button><button data-act="submit-now">Submit module now</button>` : `<button data-act="exit-review">Exit review</button>`}<button data-act="shortcuts">Keyboard shortcuts</button></div>` : ''}
    </header><div class="bb-dash"></div>`;

    let main;
    if (onReviewPage) {
      main = `<main class="bb-main" style="overflow:auto;display:block"><div class="bb-review">
        <h2>Check Your Work</h2>
        <p>On test day, you won't be able to move on to the next module until time expires.</p>
        <p>For these practice questions, you can click <b>Next</b> when you're ready to submit.</p>
        <div class="card">${navGrid(true)}</div>
      </div></main>`;
    } else {
      const ann = live ? s.notes[q.id] : r.notes[q.id];
      const hasPassage = !!(q.passage || q.figure);
      const passage = ann && ann.p != null ? ann.p : `${q.figure ? `<div class="figure"><img src="${q.figure.src}" alt="Figure for this question" style="width:${Math.round(q.figure.w * 1.25)}px"></div>` : ''}${q.passage || ''}`;
      const stem = ann && ann.s != null ? ann.s : q.stem;
      main = `<main class="bb-main ${hasPassage ? '' : 'bb-single'}">
        <section class="bb-pane bb-passage" id="bb-passage"${r.split ? ` style="flex-basis:${r.split}%"` : ''}><div class="content" data-hl="p">${passage}</div></section>
        <div class="bb-divider" data-drag="1"><span class="bb-grip">⇔</span></div>
        <section class="bb-pane bb-question">
          ${questionPane(q, idx)}
          <div class="bb-stem content" data-hl="s">${stem}</div>
          ${choicesHTML(q)}
          ${afterChoices(q)}
        </section>
      </main>`;
    }

    const isLast = idx === list.length - 1;
    const bottom = `<div class="bb-dash"></div><footer class="bb-bottom">
      <div class="bb-name">${esc(name)}</div>
      <div style="position:relative">${onReviewPage ? '' : `<button class="bb-qnav ${r.popOpen ? 'open' : ''}" data-act="qnav">Question ${idx + 1} of ${list.length} ${ICON.chevUp}</button>`}</div>
      <div class="bb-navbtns">
        ${onReviewPage ? `<button class="bb-btn" data-act="back">Back</button><button class="bb-btn" data-act="submit">Next</button>`
          : `${idx > 0 ? '<button class="bb-btn" data-act="back">Back</button>' : ''}${live ? `<button class="bb-btn" data-act="next">Next</button>` : (isLast ? '<button class="bb-btn" data-act="exit-review">Done</button>' : '<button class="bb-btn" data-act="next">Next</button>')}`}
      </div>
    </footer>
    ${r.popOpen ? `<div class="qpop"><div class="qpop-head">${esc(title)} Questions<button class="qpop-x" data-act="qnav" aria-label="Close">×</button></div>
      <div class="legend"><span>${pinSvg()} Current</span><span><i class="lg-un"></i> ${live ? 'Unanswered' : 'Not answered'}</span>${live ? `<span>${ICON.flag.replace('class="flag"', 'width="11" height="14"')} For Review</span>` : '<span><i class="lg-un" style="background:var(--green);border:0"></i> Correct</span><span><i class="lg-un" style="background:var(--red);border:0"></i> Incorrect</span>'}</div>
      ${navGrid(false)}
      ${live ? `<div class="qpop-foot"><button class="btn ghost" data-act="go-review">Go to Review Page</button></div>` : ''}</div>` : ''}`;

    app.innerHTML = `<div class="bb">${top}${main}${bottom}</div>`;
    updateTimer();
    const pane = app.querySelector('.bb-question');
    if (pane) pane.scrollTop = 0;
  }

  function pinSvg() { return '<svg width="12" height="14" viewBox="0 0 12 14"><path d="M6 0a5 5 0 0 1 5 5c0 3.5-5 9-5 9S1 8.5 1 5a5 5 0 0 1 5-5z" fill="#1e1e1e"/><circle cx="6" cy="5" r="2" fill="white"/></svg>'; }

  function navGrid(fromReviewPage) {
    const r = S.run, live = r.kind === 'live', list = curList(), idx = curIdx();
    return `<div class="qgrid">${list.map((id, i) => {
      const q = S.byId.get(id);
      let cls = '';
      if (live) { if (r.s.answers[id]) cls = 'ans'; } else if (r.answers[id]) cls = r.answers[id] === q.answer ? 'right' : 'wrong';
      if (i === idx && !fromReviewPage) cls += ' cur';
      return `<button class="qcell ${cls}" data-act="goto" data-i="${i}">${i + 1}${live && r.s.marked[id] ? ICON.flag : ''}</button>`;
    }).join('')}</div>`;
  }

  function questionPane(q) {
    const r = S.run, live = r.kind === 'live';
    const idx = curIdx();
    const marked = live && r.s.marked[q.id];
    return `<div class="bb-qbar"><span class="bb-qnum">${idx + 1}</span>
      ${live ? `<button class="bb-mark ${marked ? 'on' : ''}" data-act="mark">${ICON.bookmark} Mark for Review</button>` : `<span class="bb-mark" style="cursor:default">${esc(q.skill)} ${diffBars(q.difficulty)}</span>`}
      ${live && !isLocked(q) ? `<button class="bb-abc ${prefs.elimOn ? 'on' : ''}" data-act="elim-toggle" title="Cross out answer choices">ABC</button>` : ''}</div>`;
  }

  // In practice mode a checked question is locked; review mode is always locked.
  function isLocked(q) {
    const r = S.run;
    return r.kind === 'review' || (r.s.mode === 'practice' && r.s.checked[q.id]);
  }

  function choicesHTML(q) {
    const r = S.run, live = r.kind === 'live';
    const locked = isLocked(q);
    const sel = live ? r.s.answers[q.id] : r.answers[q.id];
    const reveal = locked && (live || sel || r.revealed.has(q.id));
    const elim = (live && r.s.elim[q.id]) || [];
    return `<div class="choices">${q.choices.map((c, i) => {
      const L = LETTERS[i];
      let cls = '', tag = '';
      if (reveal) {
        if (L === q.answer) { cls = 'right'; tag = sel === L ? 'Your answer ✓' : 'Correct answer'; } else if (sel === L) { cls = 'wrong'; tag = 'Your answer'; }
      } else {
        if (sel === L) cls = 'sel';
        if (elim.includes(L)) cls += ' out';
      }
      const side = live && !locked && prefs.elimOn ? (elim.includes(L) ? `<button class="undo" data-act="elim" data-c="${L}">Undo</button>` : `<button class="elim" data-act="elim" data-c="${L}" aria-label="Cross out ${L}">${L}</button>`) : '';
      return `<div class="choice-row"><button class="choice ${cls}" data-act="choose" data-c="${L}" ${locked ? 'disabled' : ''}><span class="letter">${L}</span><span>${c}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</button>${side}</div>`;
    }).join('')}</div>`;
  }

  function afterChoices(q) {
    const r = S.run, live = r.kind === 'live';
    if (live && r.s.mode === 'practice' && !r.s.checked[q.id]) {
      return `<div class="check-row"><button class="btn" data-act="check" ${r.s.answers[q.id] ? '' : 'disabled'}>Check answer</button><span class="muted small">Select an answer, then check it.</span></div>`;
    }
    const locked = isLocked(q);
    if (!locked) return '';
    const sel = live ? r.s.answers[q.id] : r.answers[q.id];
    if (!live && !sel && !r.revealed.has(q.id)) {
      return `<div class="check-row">${r.source === 'session' ? '<span class="bad">You didn’t answer this question.</span>' : ''}<button class="btn ghost" data-act="reveal">Show answer &amp; explanation</button></div>${metaRow(q)}`;
    }
    const ok = sel === q.answer;
    const head = sel ? (ok ? '<span class="ok">Correct</span>' : `<span class="bad">Incorrect</span> <span class="muted small">Correct answer: ${q.answer}</span>`) : `<span>Correct answer: ${q.answer}</span>`;
    return `<div class="explain"><h4>${head}</h4><div class="content">${q.rationale || '<p>No explanation included.</p>'}</div></div>${metaRow(q)}`;
  }

  function metaRow(q) {
    const r = prog(q.id);
    return `<div class="qmeta"><span>${esc(q.domain)} · ${esc(q.skill)} · ${diffBars(q.difficulty)} ${q.difficulty}</span><span>ID ${q.id}</span>
      ${r ? `<span>Answered ${r.c}/${r.n} correctly</span>` : ''}
      ${inFolder(q.id) ? `<span class="spacer"></span><span class="pill bad">In wrong-answer folder</span><button class="btn small danger" data-act="unfolder" data-id="${q.id}">Remove from folder</button>` : ''}</div>`;
  }

  async function liveNext() {
    const s = S.run.s;
    if (s.cur < s.qids.length - 1) setIdx(s.cur + 1);
    else { s.onReview = true; S.run.popOpen = false; hideHlBar(); saveActiveSoon(); renderRunner(); }
  }

  async function confirmSubmit() {
    const s = S.run.s;
    const blank = s.qids.filter((id) => !s.answers[id]).length;
    const ok = await modal({
      title: 'Submit this module?',
      body: blank ? `<p>You have <b>${blank}</b> unanswered question${blank === 1 ? '' : 's'}.${s.mode === 'test' ? ' Unanswered questions count as wrong and go to your wrong-answer folder.' : ''}</p>` : '<p>You answered every question.</p>',
      buttons: [{ label: 'Keep working', cls: 'ghost', value: false }, { label: 'Submit', value: true }],
    });
    if (ok) finishLive();
  }

  async function finishLive() {
    stopTick();
    hideHlBar();
    const s = S.run.s;
    const changed = [];
    for (const id of s.qids) {
      if (s.checked[id]) continue; // practice mode: already recorded when checked
      const a = s.answers[id];
      if (!a && s.mode === 'practice') continue; // skipped practice questions aren't counted
      recordAnswer(id, a);
      changed.push(id);
    }
    const correct = s.qids.filter((id) => s.answers[id] && s.answers[id] === (S.byId.get(id) || {}).answer).length;
    const flagged = s.qids.filter((id) => inFolder(id) && S.progress[id].wt >= s.createdAt).length;
    const rec = { id: s.id, mode: s.mode, flagged, label: s.label || '', createdAt: s.createdAt, finishedAt: Date.now(), qids: s.qids, answers: s.answers, correct, total: s.qids.length, elapsed: s.elapsed, timeLimit: s.timeLimit || null };
    S.sessions = [rec, ...S.sessions.filter((x) => x.id !== rec.id)];
    S.active = null;
    S.run = null;
    S.tab = 'results'; S.resultId = rec.id;
    render();
    try {
      await persistProgress(changed);
      await Store.saveSession(rec);
      await Store.saveActive(null);
    } catch (e) { console.error(e); toast('Could not save results — check your connection.', 5000); }
  }

  // ---------- highlighting ----------
  let hlBar = null, hlTarget = null;
  function hideHlBar() { if (hlBar) { hlBar.remove(); hlBar = null; } const n = document.querySelector('.note-pop'); if (n) n.remove(); hlTarget = null; }

  function selectionInContent() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const host = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode).closest('[data-hl]');
    if (!host || !sel.toString().trim()) return null;
    return { range, host };
  }

  function showHlBar(rect, items) {
    hideHlBar();
    hlBar = document.createElement('div');
    hlBar.className = 'hl-bar';
    hlBar.innerHTML = items;
    document.body.appendChild(hlBar);
    const w = hlBar.offsetWidth;
    hlBar.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px';
    hlBar.style.top = Math.max(8, rect.top - 50) + 'px';
    hlBar.addEventListener('mousedown', (e) => e.preventDefault());
  }

  const swatches = '<button data-hl-act="yellow" title="Yellow"><span class="hl-sw" style="background:var(--hl-yellow)"></span></button><button data-hl-act="blue" title="Blue"><span class="hl-sw" style="background:var(--hl-blue)"></span></button><button data-hl-act="pink" title="Pink"><span class="hl-sw" style="background:var(--hl-pink)"></span></button><button data-hl-act="ul" title="Underline"><u>U</u></button>';

  function wrapRange(range, cls) {
    const rootEl = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!range.intersectsNode(n) || !n.nodeValue.length) continue;
      const start = n === range.startContainer ? range.startOffset : 0;
      const end = n === range.endContainer ? range.endOffset : n.nodeValue.length;
      if (end > start && n.nodeValue.slice(start, end).trim()) parts.push({ n, start, end });
    }
    const id = 'h' + uid();
    for (const { n, start, end } of parts) {
      let mid = n;
      if (start > 0) mid = n.splitText(start);
      if (end - start < mid.nodeValue.length) mid.splitText(end - start);
      const m = document.createElement('mark');
      m.className = 'hl ' + cls;
      m.dataset.h = id;
      mid.parentNode.insertBefore(m, mid);
      m.appendChild(mid);
    }
    return id;
  }

  function saveAnnotations() {
    const r = S.run;
    const q = S.byId.get(curList()[curIdx()]);
    const p = app.querySelector('[data-hl="p"]'), st = app.querySelector('[data-hl="s"]');
    const store = r.kind === 'live' ? r.s.notes : r.notes;
    store[q.id] = { p: p ? p.innerHTML : null, s: st ? st.innerHTML : null };
    if (r.kind === 'live') saveActiveSoon();
  }

  function applyHl(color) {
    if (hlTarget) {
      app.querySelectorAll(`mark[data-h="${hlTarget}"]`).forEach((m) => { m.className = 'hl ' + (color === 'yellow' ? '' : color); });
    } else {
      const got = selectionInContent();
      if (!got) return;
      wrapRange(got.range, color === 'yellow' ? '' : color);
      window.getSelection().removeAllRanges();
    }
    hideHlBar();
    saveAnnotations();
  }

  function deleteHl(id) {
    app.querySelectorAll(`mark[data-h="${id}"]`).forEach((m) => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
    hideHlBar();
    saveAnnotations();
  }

  function editNote(id) {
    const marks = app.querySelectorAll(`mark[data-h="${id}"]`);
    if (!marks.length) return;
    const rect = marks[0].getBoundingClientRect();
    hideHlBar();
    const pop = document.createElement('div');
    pop.className = 'note-pop';
    pop.innerHTML = `<div class="label">Note</div><textarea placeholder="Type a note…">${esc(marks[0].dataset.note || '')}</textarea><div class="row" style="margin-top:8px"><div class="spacer"></div><button class="btn ghost small" data-n="cancel">Cancel</button><button class="btn small" data-n="save">Save</button></div>`;
    document.body.appendChild(pop);
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 296, rect.left)) + 'px';
    pop.style.top = Math.min(window.innerHeight - 190, rect.bottom + 8) + 'px';
    pop.querySelector('textarea').focus();
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      if (b.dataset.n === 'save') {
        const v = pop.querySelector('textarea').value.trim();
        marks.forEach((m) => { if (v) { m.dataset.note = v; m.title = v; } else { delete m.dataset.note; m.removeAttribute('title'); } });
        saveAnnotations();
      }
      pop.remove();
    });
  }

  document.addEventListener('mouseup', (e) => {
    if (!S.run || !(e.target instanceof Element) || e.target.closest('.hl-bar, .note-pop')) return;
    setTimeout(() => {
      const got = selectionInContent();
      if (got) { hlTarget = null; showHlBar(got.range.getBoundingClientRect(), swatches); }
      else if (!e.target.closest('mark.hl')) hideHlBar();
    }, 0);
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hl-act]');
    if (b) {
      const a = b.dataset.hlAct;
      if (a === 'del') deleteHl(hlTarget);
      else if (a === 'note') editNote(hlTarget);
      else applyHl(a);
      return;
    }
    const m = e.target.closest('mark.hl');
    if (m && S.run && window.getSelection().isCollapsed) {
      const id = m.dataset.h;
      showHlBar(m.getBoundingClientRect(), swatches + '<button data-hl-act="note">Note</button><button data-hl-act="del">Delete</button>');
      hlTarget = id;
    }
  });

  // ---------- divider drag ----------
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('[data-drag]')) return;
    const main = app.querySelector('.bb-main'), pane = document.getElementById('bb-passage');
    if (!main || !pane) return;
    e.preventDefault();
    const move = (ev) => {
      const r = main.getBoundingClientRect();
      const p = Math.min(75, Math.max(25, ((ev.clientX - r.left) / r.width) * 100));
      pane.style.flexBasis = p + '%';
      S.run.split = p;
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  // ---------- actions ----------
  const ACT = {
    tab: (el) => { S.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    signout: async () => { await Store.signOut(); location.reload(); },
    pref: (el) => { prefs[el.dataset.k] = el.dataset.v; savePrefs(); render(); },
    diff: (el) => { const d = el.dataset.v; prefs.diffs = prefs.diffs.includes(d) ? prefs.diffs.filter((x) => x !== d) : [...prefs.diffs, d]; savePrefs(); render(); },
    'skills-all': () => { prefs.skills = ALL_SKILLS.slice(); savePrefs(); render(); },
    'skills-none': () => { prefs.skills = []; savePrefs(); render(); },
    start: async () => {
      if (S.active) {
        const ok = await modal({ title: 'Start a new module?', body: '<p>Your unfinished module will be discarded.</p>', buttons: [{ label: 'Cancel', cls: 'ghost', value: false }, { label: 'Start new', value: true }] });
        if (!ok) return;
      }
      openLive(buildModule());
    },
    resume: () => openLive(S.active),
    discard: async () => {
      const ok = await modal({ title: 'Discard unfinished module?', body: '<p>Answers in it won\'t be scored.</p>', buttons: [{ label: 'Cancel', cls: 'ghost', value: false }, { label: 'Discard', cls: 'danger', value: true }] });
      if (!ok) return;
      S.active = null; await Store.saveActive(null); render();
    },
    'wrong-open': (el, e) => { if (e.target.closest('[data-act="wrong-remove"]')) return; openReview({ list: S.wrongList.slice(), answers: lastAnswers(S.wrongList), idx: +el.dataset.i, title: 'Wrong Answers Review', source: 'folder' }); },
    'wrong-review': () => openReview({ list: S.wrongList.slice(), answers: lastAnswers(S.wrongList), idx: 0, title: 'Wrong Answers Review', source: 'folder' }),
    'wrong-remove': async (el, e) => { e.stopPropagation(); await removeFromFolder(el.dataset.id); toast('Removed from your wrong-answer folder.'); render(); },
    'wrong-practice': () => { prefs.source = 'wrong'; savePrefs(); S.tab = 'practice'; render(); },
    'open-result': (el) => { S.resultId = el.dataset.id; S.tab = 'results'; render(); },
    'review-session': (el) => { const s = S.sessions.find((x) => x.id === S.resultId); openReview({ list: s.qids.filter((id) => S.byId.has(id)), answers: s.answers, idx: +el.dataset.i, title: 'Review: ' + (s.mode === 'test' ? 'Test' : 'Practice') + ' module', source: 'session' }); },
    'bank-open': (el) => openReview({ list: S.bankList.slice(), answers: {}, idx: +el.dataset.i, title: 'Question Bank', source: 'bank' }),
    'bank-more': () => { S.bankLimit += 200; render(); },
    reset: async () => {
      const ok = await modal({ title: 'Reset all progress?', body: '<p>This clears your history, accuracy stats, and wrong-answer folder on every device. Your imported questions stay.</p>', buttons: [{ label: 'Cancel', cls: 'ghost', value: false }, { label: 'Reset everything', cls: 'danger', value: true }] });
      if (!ok) return;
      await Store.resetProgress(); S.progress = {}; S.sessions = []; render(); toast('Progress reset.');
    },
    // runner
    next: () => { if (S.run.kind === 'live') liveNext(); else setIdx(Math.min(curList().length - 1, curIdx() + 1)); },
    back: () => {
      if (S.run.kind === 'live' && S.run.s.onReview) { S.run.s.onReview = false; renderRunner(); return; }
      setIdx(Math.max(0, curIdx() - 1));
    },
    goto: (el) => setIdx(+el.dataset.i),
    qnav: () => { S.run.popOpen = !S.run.popOpen; S.run.menuOpen = false; renderRunner(); },
    'go-review': () => { S.run.s.onReview = true; S.run.popOpen = false; hideHlBar(); saveActiveSoon(); renderRunner(); },
    submit: () => confirmSubmit(),
    'submit-now': () => { S.run.menuOpen = false; confirmSubmit(); },
    choose: (el) => {
      const s = S.run.s, q = S.byId.get(s.qids[s.cur]), L = el.dataset.c;
      s.answers[q.id] = L;
      if (s.elim[q.id]) s.elim[q.id] = s.elim[q.id].filter((x) => x !== L);
      saveActiveSoon(); renderRunnerKeepScroll();
    },
    elim: (el) => {
      const s = S.run.s, q = S.byId.get(s.qids[s.cur]), L = el.dataset.c;
      const cur = s.elim[q.id] || [];
      s.elim[q.id] = cur.includes(L) ? cur.filter((x) => x !== L) : [...cur, L];
      if (s.answers[q.id] === L && s.elim[q.id].includes(L)) delete s.answers[q.id];
      saveActiveSoon(); renderRunnerKeepScroll();
    },
    'elim-toggle': () => { prefs.elimOn = !prefs.elimOn; savePrefs(); renderRunnerKeepScroll(); },
    mark: () => { const s = S.run.s, id = s.qids[s.cur]; if (s.marked[id]) delete s.marked[id]; else s.marked[id] = true; saveActiveSoon(); renderRunnerKeepScroll(); },
    check: async () => {
      const s = S.run.s, id = s.qids[s.cur];
      if (!s.answers[id]) return;
      s.checked[id] = true;
      const ok = recordAnswer(id, s.answers[id]);
      if (!ok) toast('Added to your wrong-answer folder.');
      saveActiveSoon(); renderRunnerKeepScroll();
      await persistProgress([id]);
    },
    reveal: () => { S.run.revealed.add(curList()[curIdx()]); renderRunnerKeepScroll(); },
    unfolder: async (el) => { await removeFromFolder(el.dataset.id); toast('Removed from your wrong-answer folder.'); renderRunnerKeepScroll(); },
    'hide-timer': () => { S.run.timerHidden = !S.run.timerHidden; renderRunnerKeepScroll(); },
    directions: () => modal({ title: 'Directions', body: '<p>The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).</p><p>All questions in this section are multiple-choice with four answer choices. Each question has a single best answer.</p>', buttons: [{ label: 'Close', value: true }] }),
    menu: () => { S.run.menuOpen = !S.run.menuOpen; S.run.popOpen = false; renderRunnerKeepScroll(); },
    'save-exit': async () => { S.run.menuOpen = false; await Store.saveActive(S.active).catch(() => {}); toast('Saved. Resume it from the Practice tab.'); closeRunner(); S.tab = 'practice'; render(); },
    'exit-review': () => { closeRunner(); },
    'hl-tool': () => {
      const got = selectionInContent();
      if (got) { hlTarget = null; applyHl('yellow'); } else toast('Select text in the passage or question to highlight it. Click a highlight to add a note.');
    },
    shortcuts: () => { S.run.menuOpen = false; renderRunnerKeepScroll(); modal({ title: 'Keyboard shortcuts', body: '<p><b>A–D</b> select an answer · <b>→</b> Next · <b>←</b> Back · <b>M</b> mark for review · <b>Esc</b> close popups</p><p class="muted small">Shortcuts are an extra in this app; the real test doesn\'t have them.</p>', buttons: [{ label: 'Close', value: true }] }); },
  };

  function lastAnswers(ids) { const a = {}; ids.forEach((id) => { const r = prog(id); if (r && r.last) a[id] = r.last; }); return a; }

  function renderRunnerKeepScroll() {
    const qp = app.querySelector('.bb-question'), pp = app.querySelector('.bb-passage');
    const a = qp ? qp.scrollTop : 0, b = pp ? pp.scrollTop : 0;
    renderRunner();
    const qp2 = app.querySelector('.bb-question'), pp2 = app.querySelector('.bb-passage');
    if (qp2) qp2.scrollTop = a;
    if (pp2) pp2.scrollTop = b;
  }

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const fn = ACT[el.dataset.act];
    if (fn) fn(el, e);
    if (S.run && S.run.menuOpen && el.dataset.act !== 'menu' && !e.target.closest('.menu')) { S.run.menuOpen = false; renderRunnerKeepScroll(); }
  });

  app.addEventListener('change', (e) => {
    const el = e.target;
    const act = el.dataset.act;
    if (act === 'skill') { const s = el.dataset.s; prefs.skills = el.checked ? [...new Set([...prefs.skills, s])] : prefs.skills.filter((x) => x !== s); savePrefs(); render(); }
    else if (act === 'domain') { const sk = DOMAIN_SKILLS[el.dataset.d]; prefs.skills = el.checked ? [...new Set([...prefs.skills, ...sk])] : prefs.skills.filter((x) => !sk.includes(x)); savePrefs(); render(); }
    else if (act === 'wrong-skill') { S.wrongSkill = el.value; render(); }
    else if (act === 'wrong-diff') { S.wrongDiff = el.value; render(); }
    else if (act === 'bank-skill') { S.bankSkill = el.value; S.bankLimit = 100; render(); }
    else if (act === 'bank-diff') { S.bankDiff = el.value; S.bankLimit = 100; render(); }
    else if (act === 'bank-status') { S.bankStatus = el.value; S.bankLimit = 100; render(); }
  });

  let searchT = null;
  app.addEventListener('input', (e) => {
    if (e.target.dataset.act !== 'bank-q') return;
    clearTimeout(searchT);
    searchT = setTimeout(() => {
      S.bankQuery = e.target.value; S.bankLimit = 100; render();
      const inp = app.querySelector('[data-act="bank-q"]');
      inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    }, 250);
  });

  // indeterminate domain checkboxes after each render
  new MutationObserver(() => { app.querySelectorAll('input[data-ind]').forEach((i) => { i.indeterminate = true; }); }).observe(app, { childList: true });

  document.addEventListener('keydown', (e) => {
    if (!S.run || e.target.closest('textarea, input') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.getElementById('modal-root').children.length) return;
    const k = e.key;
    if (k === 'Escape') { hideHlBar(); if (S.run.popOpen || S.run.menuOpen) { S.run.popOpen = S.run.menuOpen = false; renderRunnerKeepScroll(); } return; }
    if (k === 'ArrowRight') { const b = app.querySelector('[data-act="next"]'); if (b) b.click(); }
    else if (k === 'ArrowLeft') { const b = app.querySelector('[data-act="back"]'); if (b) b.click(); }
    else if (/^[a-dA-D]$/.test(k)) { const b = app.querySelector(`.choice[data-c="${k.toUpperCase()}"]:not(:disabled)`); if (b) b.click(); }
    else if (k === 'm' || k === 'M') { const b = app.querySelector('[data-act="mark"]'); if (b) b.click(); }
  });

  window.addEventListener('beforeunload', () => { if (S.active && Store.mode !== 'cloud') Store.saveActive(S.active); });

  boot();
  window.__S = S; // for debugging in the console
})();

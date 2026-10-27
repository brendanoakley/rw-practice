/* Storage layer. Cloud mode keeps everything under users/{uid}/ in Firestore (private to the signed-in
   account); local mode keeps it in this browser's IndexedDB. The question bank is also cached locally so
   it isn't re-downloaded on every visit. */
(function () {
  const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

  // --- tiny IndexedDB key/value wrapper ---
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('rw-practice', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const idb = {
    async get(k) { const d = await db(); return new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async set(k, v) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  };

  const Store = {
    mode: 'local',
    user: null,
    ready: false,
    error: null,
    fb: null,

    get cloudConfigured() { return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey); },
    get key() { return this.user ? this.user.uid : 'local'; },

    // Resolves once we know whether someone is signed in. onChange fires on later sign-in/out.
    async init(onChange) {
      if (!this.cloudConfigured) { this.ready = true; return; }
      try {
        const [app, auth, fs] = await Promise.all([
          import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
        ]);
        const fbApp = app.initializeApp(window.FIREBASE_CONFIG);
        this.fb = { auth, fs, authObj: auth.getAuth(fbApp), db: fs.getFirestore(fbApp) };
        let first = true;
        await new Promise((resolve) => {
          auth.onAuthStateChanged(this.fb.authObj, (u) => {
            this.user = u ? { uid: u.uid, name: u.displayName || u.email || 'Student', email: u.email, photo: u.photoURL } : null;
            this.mode = u ? 'cloud' : 'local';
            if (first) { first = false; resolve(); } else if (onChange) onChange();
          });
        });
      } catch (e) {
        console.error(e);
        this.error = 'Could not connect to Firebase: ' + e.message;
      }
      this.ready = true;
    },

    async signIn() {
      const { auth, authObj } = this.fb;
      await auth.signInWithPopup(authObj, new auth.GoogleAuthProvider());
    },
    async signOut() { await this.fb.auth.signOut(this.fb.authObj); },

    _ref(...path) { return this.fb.fs.doc(this.fb.db, 'users', this.user.uid, ...path); },
    _col(name) { return this.fb.fs.collection(this.fb.db, 'users', this.user.uid, name); },

    // ---- question bank ----
    async getBank() {
      const cache = await idb.get('bank:' + this.key);
      if (this.mode !== 'cloud') return cache ? cache.questions : [];
      const { getDoc, getDocs } = this.fb.fs;
      const meta = (await getDoc(this._ref('meta', 'bank'))).data();
      if (!meta) return [];
      if (cache && cache.updatedAt === meta.updatedAt) return cache.questions;
      const snap = await getDocs(this._col('questions'));
      const questions = snap.docs.map((d) => d.data());
      await idb.set('bank:' + this.key, { updatedAt: meta.updatedAt, questions });
      return questions;
    },

    // Adds/updates questions (keyed by Question ID) and returns the merged bank.
    async saveBank(incoming, existing, onProgress) {
      const byId = new Map(existing.map((q) => [q.id, q]));
      incoming.forEach((q) => byId.set(q.id, q));
      const merged = [...byId.values()];
      const updatedAt = Date.now();
      if (this.mode === 'cloud') {
        const { writeBatch, doc, setDoc } = this.fb.fs;
        const CHUNK = 20;
        for (let i = 0; i < incoming.length; i += CHUNK) {
          const b = writeBatch(this.fb.db);
          incoming.slice(i, i + CHUNK).forEach((q) => b.set(doc(this._col('questions'), q.id), q));
          await b.commit();
          if (onProgress) onProgress(Math.min(i + CHUNK, incoming.length), incoming.length);
        }
        await setDoc(this._ref('meta', 'bank'), { updatedAt, count: merged.length });
      }
      await idb.set('bank:' + this.key, { updatedAt, questions: merged });
      return merged;
    },

    // ---- per-question progress: { [qid]: {n, c, last, ok, t, w, wn, wt} } ----
    async getProgress() {
      if (this.mode === 'cloud') {
        const d = (await this.fb.fs.getDoc(this._ref('meta', 'progress'))).data();
        return (d && d.q) || {};
      }
      return (await idb.get('progress:local')) || {};
    },
    async saveProgress(all, changedIds) {
      if (this.mode === 'cloud') {
        const patch = {};
        changedIds.forEach((id) => { patch[id] = all[id]; });
        await this.fb.fs.setDoc(this._ref('meta', 'progress'), { q: patch }, { merge: true });
      } else await idb.set('progress:local', all);
    },
    async resetProgress() {
      if (this.mode === 'cloud') {
        await this.fb.fs.setDoc(this._ref('meta', 'progress'), { q: {} });
        const snap = await this.fb.fs.getDocs(this._col('sessions'));
        for (const d of snap.docs) await this.fb.fs.deleteDoc(d.ref);
      } else { await idb.set('progress:local', {}); await idb.set('sessions:local', []); }
    },

    // ---- completed sessions ----
    async listSessions() {
      if (this.mode === 'cloud') {
        const { getDocs, query, orderBy, limit } = this.fb.fs;
        const snap = await getDocs(query(this._col('sessions'), orderBy('finishedAt', 'desc'), limit(200)));
        return snap.docs.map((d) => d.data());
      }
      return (await idb.get('sessions:local')) || [];
    },
    async saveSession(s) {
      if (this.mode === 'cloud') await this.fb.fs.setDoc(this.fb.fs.doc(this._col('sessions'), s.id), s);
      else {
        const all = (await idb.get('sessions:local')) || [];
        await idb.set('sessions:local', [s, ...all.filter((x) => x.id !== s.id)]);
      }
    },

    // ---- the module in progress (so you can resume on another computer) ----
    async getActive() {
      if (this.mode === 'cloud') {
        const d = (await this.fb.fs.getDoc(this._ref('meta', 'active'))).data();
        return d && d.session ? JSON.parse(d.session) : null;
      }
      return (await idb.get('active:local')) || null;
    },
    async saveActive(s) {
      if (this.mode === 'cloud') await this.fb.fs.setDoc(this._ref('meta', 'active'), { session: s ? JSON.stringify(s) : null });
      else await idb.set('active:local', s);
    },
  };

  window.Store = Store;
})();

// Data layer: Firebase Firestore when configured, otherwise this browser's localStorage (demo mode).
// Collections: accounts {balance}, transactions, reminders, messages.
window.DB = (() => {
  const fb = window.CONFIG.firebase || {};
  const useFirebase = fb.apiKey && !fb.apiKey.startsWith("YOUR_") && window.firebase;

  if (useFirebase) {
    firebase.initializeApp(fb);
    const fs = firebase.firestore();
    return {
      mode: "firebase",
      watch(col, cb) {
        return fs.collection(col).onSnapshot(
          (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => window.dispatchEvent(new CustomEvent("db-error", { detail: err }))
        );
      },
      async add(col, obj) {
        const ref = await fs.collection(col).add(obj);
        return { id: ref.id, ...obj };
      },
      async pay({ from, to, amount, ...rest }) {
        const txRef = fs.collection("transactions").doc();
        const tx = { from, to, amount, ...rest, ts: Date.now() };
        await fs.runTransaction(async (t) => {
          const fromRef = fs.collection("accounts").doc(from);
          const toRef = fs.collection("accounts").doc(to);
          const fromSnap = from === "abm" ? null : await t.get(fromRef);
          const toSnap = to === "abm" ? null : await t.get(toRef);
          if (fromSnap) {
            const bal = fromSnap.exists ? fromSnap.data().balance || 0 : 0;
            if (bal < amount) throw new Error("NO_BALANCE");
            t.set(fromRef, { balance: bal - amount }, { merge: true });
          }
          if (toSnap) {
            const bal = toSnap.exists ? toSnap.data().balance || 0 : 0;
            t.set(toRef, { balance: bal + amount }, { merge: true });
          }
          t.set(txRef, tx);
        });
        return { id: txRef.id, ...tx };
      },
    };
  }

  // ---------- Demo mode (localStorage) ----------
  const KEY = "abm_demo_db";
  const empty = () => ({ accounts: {}, transactions: [], reminders: [], messages: [] });
  const load = () => {
    try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
    catch { return empty(); }
  };
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));
  const listeners = {};
  const view = (db, col) =>
    col === "accounts"
      ? Object.entries(db.accounts).map(([id, v]) => ({ id, ...v }))
      : db[col].slice();
  const emit = () => {
    const db = load();
    for (const col in listeners) listeners[col].forEach((cb) => cb(view(db, col)));
  };
  window.addEventListener("storage", (e) => e.key === KEY && emit());
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  return {
    mode: "demo",
    watch(col, cb) {
      (listeners[col] ||= []).push(cb);
      cb(view(load(), col));
      return () => (listeners[col] = listeners[col].filter((f) => f !== cb));
    },
    async add(col, obj) {
      const db = load();
      const doc = { id: newId(), ...obj };
      db[col].push(doc);
      save(db); emit();
      return doc;
    },
    async pay({ from, to, amount, ...rest }) {
      const db = load();
      if (from !== "abm") {
        const bal = db.accounts[from]?.balance || 0;
        if (bal < amount) throw new Error("NO_BALANCE");
        db.accounts[from] = { balance: bal - amount };
      }
      if (to !== "abm") db.accounts[to] = { balance: (db.accounts[to]?.balance || 0) + amount };
      const tx = { id: newId(), from, to, amount, ...rest, ts: Date.now() };
      db.transactions.push(tx);
      save(db); emit();
      return tx;
    },
  };
})();

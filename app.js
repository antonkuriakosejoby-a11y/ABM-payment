(() => {
  "use strict";

  // ============================================================
  //  Setup & helpers
  // ============================================================
  const C = window.CONFIG;
  const ACC = window.ACCOUNTS;
  const byId = Object.fromEntries(ACC.map((a) => [a.id, a]));
  const CUSTOMERS = ACC.filter((a) => !a.company);
  const CUR = "Ⱥ̶";
  const FEE = C.FEE_AMOUNT;
  const DAY = 86400000;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => `${CUR} ${Number(n).toLocaleString("en-IN")}`;
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const fmtDate = (ts) => new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const fmtDay = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  function avatar(acc, size = "") {
    if (!acc) return `<div class="avatar initials ${size}">?</div>`;
    if (acc.photo) return `<img class="avatar ${size} ${acc.company ? "contain" : ""}" src="${acc.photo}" alt="">`;
    return `<div class="avatar initials ${size}">${initials(acc.name)}</div>`;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  const checkPin = async (id, pin) => (await sha256(`ABM|${id}|${pin}`)) === byId[id].pinHash;
  async function findByPin(pin) {
    const hashes = await Promise.all(ACC.map((a) => sha256(`ABM|${a.id}|${pin}`)));
    return ACC.find((a, i) => hashes[i] === a.pinHash) || null;
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  // Fees are due every two months: Jan–Feb, Mar–Apr, ... Nov–Dec
  function feePeriod(d = new Date()) {
    const y = d.getFullYear(), p = Math.floor(d.getMonth() / 2);
    return { key: `${y}-P${p + 1}`, label: `${MONTHS[p * 2]}–${MONTHS[p * 2 + 1]} ${y}` };
  }
  function monthInfo(d = new Date()) {
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` };
  }

  // ============================================================
  //  State & derived data
  // ============================================================
  const S = {
    user: null,
    view: "home",
    data: { transactions: [], reminders: [], messages: [], accounts: {} },
    unsub: [],
    balanceShown: false,
    chatWith: null,
  };

  let pendingPayTo = new URLSearchParams(location.search).get("pay");
  if (!byId[pendingPayTo]) pendingPayTo = null;

  const balanceOf = (id) => S.data.accounts[id]?.balance || 0;
  const feeTx = (id, key) => S.data.transactions.filter((t) => t.from === id && t.to === "abm" && t.purpose === "fees" && t.feePeriod === key);
  const feePaid = (id, key = feePeriod().key) => feeTx(id, key).reduce((a, t) => a + t.amount, 0);
  const salaryPaid = (id, key = monthInfo().key) =>
    S.data.transactions.filter((t) => t.from === "abm" && t.to === id && t.purpose === "salary" && t.month === key).reduce((a, t) => a + t.amount, 0);
  const activeReminders = (id) => {
    const now = Date.now();
    return S.data.reminders
      .filter((r) => r.to === id && r.expiresAt > now && feePaid(id, r.feePeriod) < FEE)
      .sort((a, b) => b.createdAt - a.createdAt);
  };
  const myTx = () => S.data.transactions.filter((t) => t.from === S.user.id || t.to === S.user.id).sort((a, b) => b.ts - a.ts);
  const threadOf = (id) => S.data.messages.filter((m) => m.thread === id).sort((a, b) => a.ts - b.ts);
  const seenKey = (thread) => `abm_seen_${S.user.id}_${thread}`;
  const unreadIn = (thread) => {
    const seen = Number(store.get(seenKey(thread)) || 0);
    return threadOf(thread).filter((m) => m.from !== S.user.id && m.ts > seen).length;
  };
  const unreadTotal = () => (S.user.company ? CUSTOMERS.reduce((a, c) => a + unreadIn(c.id), 0) : unreadIn(S.user.id));

  const emailReady = () => window.emailjs && C.emailjs.publicKey && !C.emailjs.publicKey.startsWith("YOUR_");

  // ============================================================
  //  Modal
  // ============================================================
  function modal(html) {
    $("#modal-root").innerHTML = `<div class="overlay"><div class="modal" role="dialog" aria-modal="true"><button class="close" aria-label="Close">×</button>${html}</div></div>`;
    const ov = $("#modal-root .overlay");
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.closest(".close")) closeModal();
    });
    const auto = $("[autofocus]", ov);
    if (auto) setTimeout(() => auto.focus(), 30);
    return $(".modal", ov);
  }
  function closeModal() {
    $("#modal-root").innerHTML = "";
    P = null;
    if (S.quick) {           // finished a QR payment → back to the start page
      S.quick = false;
      renderLogin();
    }
  }
  document.addEventListener("keydown", (e) => e.key === "Escape" && $("#modal-root .overlay") && closeModal());

  // Number boxes (PIN, OTP, phone, amount) accept digits only — letters are removed as you type
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.matches && el.matches('input[inputmode="numeric"]')) {
      const clean = el.value.replace(/\D/g, "");
      if (clean !== el.value) el.value = clean;
    }
  });
  document.addEventListener("beforeinput", (e) => {
    const el = e.target;
    if (el.matches && el.matches('input[inputmode="numeric"]') && e.data && /\D/.test(e.data)) e.preventDefault();
  });

  window.addEventListener("db-error", (e) => {
    console.error(e.detail);
    toast("Database error — check Firebase setup and rules.");
  });

  // ============================================================
  //  Login
  // ============================================================
  let fails = 0, lockUntil = 0;

  function demoNote() {
    const notes = [];
    if (DB.mode === "demo") notes.push("<b>Demo mode:</b> Firebase is not set up yet, so data is saved only in this browser.");
    if (!emailReady()) notes.push("EmailJS is not set up, so the ABM OTP is shown on screen instead of emailed.");
    return notes.length ? `<div class="demo-note">${notes.join("<br>")}</div>` : "";
  }

  function renderLogin() {
    S.unsub.forEach((f) => f && f());
    S.unsub = [];
    S.user = null;
    closeModal();
    $("#app").innerHTML = `
      <div class="login-wrap"><div class="login">
        <img class="login-logo" src="images/abm-logo.png" alt="ABM">
        <h1>WELCOME TO<br><span>ABM PAYMENT MANAGEMENT</span></h1>
        <form id="pinForm" autocomplete="off">
          <label class="muted" for="pin">Enter your PIN</label>
          <input id="pin" class="input pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off">
          <button class="btn primary big block" type="submit">Enter</button>
          <p class="err" id="loginErr"></p>
        </form>
        ${pendingPayTo ? `<p class="muted small">Log in to pay <b>${esc(byId[pendingPayTo].name)}</b></p>` : ""}
        ${demoNote()}
      </div></div>`;
    $("#pin").focus();
    $("#pinForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("#loginErr");
      const pin = $("#pin").value.trim();
      if (Date.now() < lockUntil) return (err.textContent = `Too many tries. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`);
      if (!/^\d{4}$/.test(pin)) return (err.textContent = "Enter your 4-digit PIN.");
      const acc = await findByPin(pin);
      if (!acc) {
        fails++;
        if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
        $("#pin").value = "";
        return (err.textContent = "Wrong PIN.");
      }
      fails = 0;
      if (acc.company) renderOtp();
      else login(acc);
    };
  }

  // ---------- ABM OTP ----------
  let otp = null;
  const maskEmail = (e) => { const [u, d] = e.split("@"); return `${u.slice(0, 3)}•••@${d}`; };

  async function sendOtp() {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const code = String(100000 + (r[0] % 900000));
    otp = { code, exp: Date.now() + C.OTP_MINUTES * 60000, tries: 0 };
    if (!emailReady()) return code; // demo: show on screen
    await emailjs.send(
      C.emailjs.serviceId,
      C.emailjs.templateId,
      {
        to_email: C.OTP_EMAIL,
        email: C.OTP_EMAIL,       // name used by EmailJS's One-Time Password template
        user_email: C.OTP_EMAIL,
        otp_code: code,
        passcode: code,
        expires_in: `${C.OTP_MINUTES} minutes`,
        time: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
      },
      { publicKey: C.emailjs.publicKey }
    );
    return null;
  }

  function renderOtp() {
    $("#app").innerHTML = `
      <div class="login-wrap"><div class="login">
        <img class="login-logo" src="images/abm-logo.png" alt="ABM">
        <h1>ABM Account<br><span>Verification</span></h1>
        <p class="muted" id="otpInfo">Sending a code to ${esc(maskEmail(C.OTP_EMAIL))}…</p>
        <form id="otpForm" autocomplete="off">
          <input id="otp" class="input pin-input" style="letter-spacing:8px;max-width:260px" type="text" inputmode="numeric" maxlength="6" placeholder="••••••">
          <button class="btn primary big block" type="submit">Verify</button>
          <p class="err" id="otpErr"></p>
        </form>
        <div class="row" style="justify-content:center">
          <button class="btn ghost small" id="resend">Resend code</button>
          <button class="btn ghost small" id="otpBack">Back</button>
        </div>
      </div></div>`;
    const info = $("#otpInfo"), err = $("#otpErr");
    const doSend = async () => {
      err.textContent = "";
      info.textContent = `Sending a code to ${maskEmail(C.OTP_EMAIL)}…`;
      try {
        const demo = await sendOtp();
        info.innerHTML = demo
          ? `Demo mode — your code is <b>${demo}</b>`
          : `We sent a 6-digit code to <b>${esc(maskEmail(C.OTP_EMAIL))}</b>. It expires in ${C.OTP_MINUTES} minutes.`;
      } catch (e) {
        console.error(e);
        otp = null;
        info.textContent = "";
        err.textContent = "Could not send the OTP email. Check EmailJS settings and try Resend.";
      }
    };
    doSend();
    $("#otp").focus();
    $("#resend").onclick = doSend;
    $("#otpBack").onclick = renderLogin;
    $("#otpForm").onsubmit = (e) => {
      e.preventDefault();
      const v = $("#otp").value.trim();
      if (!otp) return (err.textContent = "No code sent yet. Tap Resend.");
      if (Date.now() > otp.exp || otp.tries >= 5) { otp = null; return (err.textContent = "Code expired. Tap Resend."); }
      otp.tries++;
      if (v !== otp.code) return (err.textContent = "Wrong code.");
      otp = null;
      login(byId.abm);
    };
  }

  // ============================================================
  //  App shell
  // ============================================================
  function login(acc) {
    S.user = acc;
    S.view = "home";
    S.balanceShown = false;
    S.chatWith = null;
    renderShell();
    S.unsub = ["transactions", "reminders", "messages", "accounts"].map((col) =>
      DB.watch(col, (docs) => {
        if (col === "accounts") S.data.accounts = Object.fromEntries(docs.map((d) => [d.id, d]));
        else S.data[col] = docs;
        onData(col);
      })
    );
    if (pendingPayTo) {
      const to = pendingPayTo;
      pendingPayTo = null;
      try { history.replaceState(null, "", location.pathname); } catch { /* file:// */ }
      if (to !== acc.id) openPay(to);
    }
  }

  function navItems() {
    const items = [["home", "🏠", "Home"], ["tx", "🧾", "Check Transactions"], ["qr", "🔳", "Show QR Code"]];
    if (S.user.company) items.push(["fees", "📋", "Fees Status"], ["salary", "💼", "Salary"], ["messages", "💬", "Inbox"]);
    else items.push(["balance", "💰", "Balance"], ["messages", "💬", "Message ABM"]);
    return items;
  }

  function renderShell() {
    $("#app").innerHTML = `
      <header class="topbar">
        <div class="brand"><img src="images/abm-logo.png" alt=""><span>ABM Payment Management</span>${DB.mode === "demo" ? '<span class="mode-pill">DEMO</span>' : ""}</div>
        <div class="me">${avatar(S.user)}<span class="name">${esc(S.user.name)}</span><button class="btn small logout" id="logout">Log out</button></div>
      </header>
      <div class="shell">
        <aside class="side"><nav id="nav"></nav></aside>
        <main><div id="banners"></div><div id="main"></div></main>
      </div>`;
    $("#logout").onclick = renderLogin;
    $("#nav").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "pay") openPay();
      else go(b.dataset.view);
    };
    renderNav();
    renderBanners();
    renderMain();
  }

  function renderNav() {
    const nav = $("#nav");
    if (!nav) return;
    const unread = unreadTotal();
    nav.innerHTML =
      `<button class="nav-btn pay" data-act="pay"><span class="ico">➤</span>Pay</button>` +
      navItems()
        .map(([id, ico, label]) =>
          `<button class="nav-btn ${S.view === id ? "active" : ""}" data-view="${id}"><span class="ico">${ico}</span>${label}${id === "messages" && unread ? `<span class="badge">${unread}</span>` : ""}</button>`)
        .join("");
  }

  function go(view) {
    S.view = view;
    if (view !== "balance") S.balanceShown = false;
    renderNav();
    renderMain();
    window.scrollTo(0, 0);
  }

  function onData() {
    if (!S.user || !$("#main")) return;
    if (S.view === "messages") updateChat();
    renderNav();
    renderBanners();
    if (S.view === "balance") return updateBalance();
    if (["home", "tx", "fees", "salary"].includes(S.view)) renderMain();
  }

  // ---------- Reminder banners ----------
  const banner = (color, icon, html, btnLabel, key) =>
    `<div class="banner ${color}"><span class="b-ico">${icon}</span><div class="b-text">${html}</div>${btnLabel ? `<button class="btn small ${color === "red" ? "primary" : "dark"}" data-banner="${key}">${btnLabel}</button>` : ""}</div>`;

  function renderBanners() {
    const el = $("#banners");
    if (!el) return;
    const u = S.user, out = [];
    if (!u.company) {
      const p = feePeriod(), paid = feePaid(u.id, p.key);
      const rems = activeReminders(u.id);
      if (rems.length) {
        const r = rems[0];
        out.push(banner("red", "🔔",
          `<b>Reminder from ABM:</b> please pay your fees of <b>${fmt(FEE)}</b> for ${esc(r.feeLabel || p.label)}.${r.text ? ` “${esc(r.text)}”` : ""} <span class="small">(sent ${fmtDay(r.createdAt)})</span>`,
          "Pay fees", "fees"));
      } else if (paid < FEE) {
        out.push(banner("amber", "⏰",
          `<b>Fees due:</b> ${fmt(FEE - paid)} for ${p.label}${paid ? ` (paid ${fmt(paid)} so far)` : ""}.`,
          "Pay fees", "fees"));
      }
    } else {
      const m = monthInfo();
      const pending = CUSTOMERS.filter((c) => !salaryPaid(c.id, m.key));
      if (pending.length)
        out.push(banner("amber", "💼",
          `<b>Salary reminder — ${m.label}:</b> not paid yet to ${pending.map((c) => esc(c.name)).join(", ")}.`,
          "Pay salary", "salary"));
    }
    el.innerHTML = out.join("");
    $$("[data-banner]", el).forEach((b) =>
      (b.onclick = () => (b.dataset.banner === "salary" ? go("salary") : openPay("abm", { purpose: "fees" }))));
  }

  // ============================================================
  //  Views
  // ============================================================
  function renderMain() {
    const el = $("#main");
    if (!el) return;
    const views = { home: viewHome, tx: viewTx, qr: viewQr, balance: viewBalance, messages: viewMessages, fees: viewFees, salary: viewSalary };
    (views[S.view] || viewHome)(el);
  }

  function viewHome(el) {
    const u = S.user;
    el.innerHTML = `
      <div class="card home">
        ${avatar(u, "xl")}
        <h2>${esc(u.name)}</h2>
        <p class="phone">${u.company ? "Company account · Balance: <b>Unlimited ∞</b>" : `📞 ${esc(u.phone)}`}</p>
        <button class="btn primary big" id="homePay">➤ Pay</button>
      </div>`;
    $("#homePay").onclick = () => openPay();
  }

  const purposeLabel = (p) => ({ fees: "Fees", salary: "Salary" }[p] || "Payment");
  const purposeTag = (p) => `<span class="tag ${p || ""}">${purposeLabel(p)}</span>`;

  function viewTx(el) {
    const list = myTx();
    const row = (t) => {
      const out = t.from === S.user.id;
      const other = byId[out ? t.to : t.from];
      return `<div class="list-item" data-tx="${esc(t.id)}">
        ${avatar(other)}
        <div class="li-main">
          <div class="li-title">${out ? "Paid to" : "Received from"} ${esc(other?.name || "Unknown")}</div>
          <div class="li-sub">${purposeTag(t.purpose)} ${t.note ? esc(t.note) + " · " : ""}${fmtDate(t.ts)}</div>
        </div>
        <div class="amt ${out ? "minus" : "plus"}">${out ? "−" : "+"} ${fmt(t.amount)}</div>
      </div>`;
    };
    el.innerHTML = `
      <div class="card">
        <h2>Transactions</h2>
        <p class="sub">Everyone you paid and everyone who paid you. Tap one to see the receipt.</p>
        <div class="list" id="txList">${list.length ? list.map(row).join("") : `<div class="empty">No transactions yet.</div>`}</div>
      </div>`;
    $("#txList").onclick = (e) => {
      const it = e.target.closest("[data-tx]");
      if (it) showReceipt(S.data.transactions.find((t) => t.id === it.dataset.tx));
    };
  }

  function viewQr(el) {
    const u = S.user;
    const url = `${location.origin}${location.pathname}?pay=${u.id}`;
    el.innerHTML = `
      <div class="card"><div class="qr-box">
        <h2>Scan to pay me</h2>
        <div class="row" style="justify-content:center">${avatar(u, "lg")}<div style="text-align:left"><b>${esc(u.name)}</b>${u.phone ? `<div class="muted small">📞 ${esc(u.phone)}</div>` : ""}</div></div>
        <div id="qrcode"></div>
        <div class="qr-url">${esc(url)}</div>
        ${location.protocol === "file:" ? `<p class="err">The QR code only works after the site is online (GitHub Pages). Opened as a file on this computer, phones can't reach it.</p>` : ""}
        <button class="btn ghost" id="qrSave">⬇ Download QR</button>
      </div></div>`;
    if (!window.QRCode) return ($("#qrcode").textContent = "QR library failed to load.");
    new QRCode($("#qrcode"), { text: url, width: 480, height: 480, colorDark: "#16161a", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    $("#qrSave").onclick = () => {
      const c = $("#qrcode canvas");
      if (!c) return;
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `ABM-QR-${u.name.replace(/\s+/g, "-")}.png`;
      a.click();
    };
  }

  function viewBalance(el) {
    if (!S.balanceShown) {
      el.innerHTML = `
        <div class="card" style="max-width:420px;margin:0 auto;text-align:center">
          <h2>Check balance</h2>
          <p class="sub">Enter your PIN to see your balance.</p>
          <form id="balForm" autocomplete="off">
            <input id="balPin" class="input pin-input" type="password" inputmode="numeric" maxlength="4">
            <button class="btn primary block" style="margin-top:14px">Show balance</button>
            <p class="err" id="balErr"></p>
          </form>
        </div>`;
      $("#balPin").focus();
      $("#balForm").onsubmit = async (e) => {
        e.preventDefault();
        if (await checkPin(S.user.id, $("#balPin").value.trim())) {
          S.balanceShown = true;
          renderMain();
        } else {
          $("#balErr").textContent = "Wrong PIN.";
          $("#balPin").value = "";
        }
      };
      return;
    }
    el.innerHTML = `
      <div class="card" style="max-width:420px;margin:0 auto;text-align:center">
        <h2>Your balance</h2>
        <div class="balance-big" id="balAmt">${fmt(balanceOf(S.user.id))}</div>
        <button class="btn ghost" id="hideBal">Hide balance</button>
      </div>`;
    $("#hideBal").onclick = () => { S.balanceShown = false; renderMain(); };
  }
  function updateBalance() {
    const e = $("#balAmt");
    if (e) e.textContent = fmt(balanceOf(S.user.id));
  }

  // ---------- Messages ----------
  function viewMessages(el) {
    const u = S.user;
    const chat = `
      <div class="chat">
        <div class="chat-msgs" id="chatMsgs"></div>
        <form class="chat-form" id="chatForm">
          <textarea class="input" id="chatText" maxlength="1000" placeholder="${u.company ? "Write a reply…" : "Can't pay the fees? Tell ABM why…"}"></textarea>
          <button class="btn primary">Send</button>
        </form>
      </div>`;
    if (u.company) {
      if (!S.chatWith) {
        const withMsgs = CUSTOMERS.filter((c) => threadOf(c.id).length)
          .sort((a, b) => (threadOf(b.id).at(-1)?.ts || 0) - (threadOf(a.id).at(-1)?.ts || 0));
        S.chatWith = (withMsgs[0] || CUSTOMERS[0]).id;
      }
      el.innerHTML = `
        <div class="card">
          <h2>Inbox</h2>
          <p class="sub">Messages from members who can't pay their fees. Reply here.</p>
          <div class="chat-layout">
            <div class="list thread-list" id="threadList"></div>
            <div><div class="row" style="margin-bottom:10px" id="chatHead"></div>${chat}</div>
          </div>
        </div>`;
      $("#threadList").onclick = (e) => {
        const it = e.target.closest("[data-thread]");
        if (it) { S.chatWith = it.dataset.thread; updateChat(true); renderNav(); }
      };
    } else {
      el.innerHTML = `
        <div class="card">
          <h2>Message ABM</h2>
          <p class="sub">Don't have money to pay the fees? Send a message to ABM — they can reply here.</p>
          ${chat}
        </div>`;
    }
    const send = async () => {
      const ta = $("#chatText");
      const text = ta.value.trim();
      if (!text) return;
      ta.value = "";
      try {
        await DB.add("messages", { thread: u.company ? S.chatWith : u.id, from: u.id, text, ts: Date.now() });
      } catch (e) {
        console.error(e);
        ta.value = text;
        toast("Message not sent. Try again.");
      }
    };
    $("#chatForm").onsubmit = (e) => { e.preventDefault(); send(); };
    $("#chatText").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
    updateChat(true);
  }

  function updateChat(forceScroll) {
    const box = $("#chatMsgs");
    if (!box) return;
    const u = S.user;
    const thread = u.company ? S.chatWith : u.id;
    if (u.company) {
      $("#threadList").innerHTML = CUSTOMERS.map((c) => {
        const last = threadOf(c.id).at(-1);
        const n = c.id === thread ? 0 : unreadIn(c.id);
        return `<div class="list-item ${c.id === thread ? "active" : ""}" data-thread="${c.id}">
          ${avatar(c)}
          <div class="li-main"><div class="li-title">${esc(c.name)}</div><div class="li-sub">${last ? esc(last.text) : "No messages"}</div></div>
          ${n ? `<span class="badge">${n}</span>` : ""}
        </div>`;
      }).join("");
      const c = byId[thread];
      $("#chatHead").innerHTML = `${avatar(c)}<div><b>${esc(c.name)}</b><div class="muted small">📞 ${esc(c.phone)}</div></div>`;
    }
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const msgs = threadOf(thread);
    box.innerHTML = msgs.length
      ? msgs.map((m) => `<div class="msg ${m.from === u.id ? "me" : "them"}">${esc(m.text)}<span class="t">${m.from === u.id ? "You" : esc(byId[m.from]?.name || "")} · ${fmtDate(m.ts)}</span></div>`).join("")
      : `<div class="empty">No messages yet.</div>`;
    if (forceScroll || nearBottom) box.scrollTop = box.scrollHeight;
    if (msgs.length) store.set(seenKey(thread), String(msgs.at(-1).ts));
  }

  // ---------- ABM: fees ----------
  function viewFees(el) {
    const p = feePeriod();
    let paidCount = 0;
    const rows = CUSTOMERS.map((c) => {
      const paid = feePaid(c.id, p.key);
      const last = feeTx(c.id, p.key).sort((a, b) => b.ts - a.ts)[0];
      const rem = activeReminders(c.id)[0];
      if (paid >= FEE) paidCount++;
      const status = paid >= FEE ? `<span class="pill ok">✓ Paid</span>` : paid > 0 ? `<span class="pill part">Part paid</span>` : `<span class="pill no">✗ Not paid</span>`;
      return `<tr>
        <td><div class="row">${avatar(c)}<div><b>${esc(c.name)}</b><div class="muted small">${esc(c.phone)}</div></div></div></td>
        <td class="num">${fmt(paid)} / ${fmt(FEE)}</td>
        <td>${status}</td>
        <td>${last ? fmtDay(last.ts) : "—"}</td>
        <td>${rem ? `<span class="small">Active till ${fmtDay(rem.expiresAt)}</span>` : "—"}</td>
      </tr>`;
    }).join("");
    el.innerHTML = `
      <div class="card">
        <div class="row">
          <div><h2>Fees — ${p.label}</h2><p class="sub" style="margin:0">${fmt(FEE)} per person, every two months.</p></div>
          <div class="spacer"></div>
          <button class="btn primary" id="sendRem">🔔 Send reminder for fees</button>
        </div>
        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead><tr><th>Name</th><th>Paid</th><th>Status</th><th>Last paid</th><th>Reminder</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="muted small" style="margin-bottom:0">Paid: <b>${paidCount}</b> · Not paid: <b>${CUSTOMERS.length - paidCount}</b></p>
      </div>`;
    $("#sendRem").onclick = openReminder;
  }

  function openReminder() {
    const p = feePeriod();
    const m = modal(`
      <h3>Send reminder to who?</h3>
      <p class="muted small" style="margin-top:-8px">The reminder stays on their screen for ${C.REMINDER_DAYS} days, or until they pay.</p>
      <div id="remList">${CUSTOMERS.map((c) => {
        const paid = feePaid(c.id, p.key) >= FEE;
        return `<label class="check-row">
          <input type="checkbox" value="${c.id}" ${paid ? "" : "checked"}>
          ${avatar(c)}
          <div class="li-main"><div class="li-title">${esc(c.name)}</div><div class="li-sub">${paid ? "Already paid" : "Not paid"}</div></div>
        </label>`;
      }).join("")}</div>
      <div class="field" style="margin-top:14px"><label for="remText">Message (optional)</label>
        <textarea class="input" id="remText" maxlength="300" placeholder="e.g. Please pay before Friday"></textarea></div>
      <button class="btn primary block" id="remSend">Send reminder</button>
      <p class="err" id="remErr"></p>`);
    $("#remSend", m).onclick = async () => {
      const ids = $$("#remList input:checked", m).map((i) => i.value);
      if (!ids.length) return ($("#remErr", m).textContent = "Choose at least one person.");
      const now = Date.now(), text = $("#remText", m).value.trim();
      $("#remSend", m).disabled = true;
      try {
        await Promise.all(ids.map((to) =>
          DB.add("reminders", { to, from: "abm", text, feePeriod: p.key, feeLabel: p.label, createdAt: now, expiresAt: now + C.REMINDER_DAYS * DAY })));
        closeModal();
        toast(`Reminder sent to ${ids.map((id) => byId[id].name).join(", ")}`);
      } catch (e) {
        console.error(e);
        $("#remSend", m).disabled = false;
        $("#remErr", m).textContent = "Could not send. Try again.";
      }
    };
  }

  // ---------- ABM: salary ----------
  function viewSalary(el) {
    const m = monthInfo();
    const rows = CUSTOMERS.map((c) => {
      const paid = salaryPaid(c.id, m.key);
      return `<tr>
        <td><div class="row">${avatar(c)}<div><b>${esc(c.name)}</b><div class="muted small">${esc(c.phone)}</div></div></div></td>
        <td class="num">${fmt(paid)}</td>
        <td>${paid ? `<span class="pill ok">✓ Paid</span>` : `<span class="pill no">✗ Not paid</span>`}</td>
        <td><button class="btn small ${paid ? "ghost" : "primary"}" data-pay="${c.id}">Pay salary</button></td>
      </tr>`;
    }).join("");
    el.innerHTML = `
      <div class="card">
        <h2>Salary — ${m.label}</h2>
        <p class="sub">The salary reminder shows every month until everyone is paid.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Paid this month</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
    $$("[data-pay]", el).forEach((b) => (b.onclick = () => openPay(b.dataset.pay, { purpose: "salary" })));
  }

  // ============================================================
  //  Pay flow:  number → amount + message → PIN → receipt
  // ============================================================
  let P = null;

  function openPay(toId = null, opts = {}) {
    if (toId === S.user.id) toId = null;
    P = { to: toId, amount: "", note: "", purpose: opts.purpose || null, step: toId ? "amount" : "to" };
    renderPay();
  }

  function purposesFor(from, to) {
    if (from.company) return [["salary", "Salary"], ["other", "Other"]];
    if (to.company) return [["fees", "Fees"], ["other", "Other"]];
    return [];
  }

  function renderPay() {
    const me = S.user;
    if (P.step === "to") {
      const others = ACC.filter((a) => a.id !== me.id);
      const m = modal(`
        <h3>Pay</h3>
        <form id="numForm" autocomplete="off">
          <div class="field"><label for="num">Enter phone number</label>
            <input class="input" id="num" inputmode="numeric" placeholder="Phone number" autofocus></div>
          <button class="btn primary block">Continue</button>
          <p class="err" id="payErr"></p>
        </form>
        <p class="muted small" style="margin:4px 0 10px">Or choose who to pay</p>
        <div class="contacts">${others.map((a) => `<button class="contact" type="button" data-to="${a.id}">${avatar(a)}${esc(a.name)}</button>`).join("")}</div>`);
      $("#numForm", m).onsubmit = (e) => {
        e.preventDefault();
        const digits = $("#num", m).value.replace(/\D/g, "");
        const acc = others.find((a) => a.phone && a.phone === digits);
        if (!digits) return ($("#payErr", m).textContent = "Enter a phone number.");
        if (!acc) return ($("#payErr", m).textContent = "No account with this number.");
        P.to = acc.id; P.step = "amount"; renderPay();
      };
      $(".contacts", m).onclick = (e) => {
        const b = e.target.closest("[data-to]");
        if (b) { P.to = b.dataset.to; P.step = "amount"; renderPay(); }
      };
      return;
    }

    const to = byId[P.to];

    if (P.step === "amount") {
      const purposes = purposesFor(me, to);
      if (purposes.length && !purposes.some(([k]) => k === P.purpose)) P.purpose = "other";
      if (!purposes.length) P.purpose = "other";
      if (P.purpose === "fees" && !P.amount) {
        const due = FEE - feePaid(me.id);
        if (due > 0) P.amount = String(due);
      }
      const m = modal(`
        <button class="back" type="button" id="back">← Back</button>
        <h3>Pay ${esc(to.name)}</h3>
        <div class="to-head">${avatar(to)}<div><b>${esc(to.name)}</b><div class="muted small">${to.phone ? "📞 " + esc(to.phone) : "Company account"}</div></div></div>
        <form id="amtForm" autocomplete="off">
          <div class="field"><label for="amt">How much to pay? (${CUR} Aurex)</label>
            <input class="input amount-input" id="amt" inputmode="numeric" placeholder="${CUR} 0" value="${esc(P.amount)}" autofocus></div>
          ${purposes.length ? `<div class="field"><label>Paying for</label><div class="chips" id="chips">${purposes.map(([k, l]) => `<button type="button" class="chip ${P.purpose === k ? "on" : ""}" data-p="${k}">${l}</button>`).join("")}</div></div>` : ""}
          <div class="field"><label for="note">Message</label>
            <input class="input" id="note" maxlength="120" value="${esc(P.note)}" placeholder="${P.purpose === "fees" ? "e.g. For fees" : P.purpose === "salary" ? "e.g. Salary for " + monthInfo().label : "Add a message"}"></div>
          <button class="btn primary block big">Continue</button>
          <p class="err" id="payErr"></p>
        </form>`);
      $("#back", m).onclick = () => { P.step = "to"; P.to = null; renderPay(); };
      const chips = $("#chips", m);
      if (chips) chips.onclick = (e) => {
        const c = e.target.closest("[data-p]");
        if (!c) return;
        P.amount = $("#amt", m).value;
        P.note = $("#note", m).value;
        P.purpose = c.dataset.p;
        if (P.purpose === "fees") P.amount = "";
        renderPay();
      };
      $("#amtForm", m).onsubmit = (e) => {
        e.preventDefault();
        const err = $("#payErr", m);
        const raw = $("#amt", m).value.replace(/[,\s]/g, "").replace(CUR, "");
        const amount = Number(raw);
        if (!raw || !Number.isInteger(amount) || amount <= 0) return (err.textContent = "Enter a whole amount above 0.");
        if (amount > 1e12) return (err.textContent = "That amount is too big.");
        if (!me.company && amount > balanceOf(me.id)) return (err.textContent = "Not enough money.");
        P.amount = String(amount);
        P.note = $("#note", m).value.trim();
        P.step = "pin";
        renderPay();
      };
      return;
    }

    if (P.step === "pin") {
      const amount = Number(P.amount);
      const m = modal(`
        <button class="back" type="button" id="back">← Back</button>
        <h3>Enter PIN to pay</h3>
        <div class="to-head">${avatar(to)}<div>Paying <b>${fmt(amount)}</b> to <b>${esc(to.name)}</b>${P.note ? `<div class="muted small">“${esc(P.note)}”</div>` : ""}</div></div>
        <form id="pinPay" autocomplete="off" style="text-align:center">
          <input class="input pin-input" id="ppin" type="password" inputmode="numeric" maxlength="4" autofocus>
          <button class="btn primary block big" id="payBtn" style="margin-top:16px">Pay ${fmt(amount)}</button>
          <p class="err" id="payErr"></p>
        </form>`);
      $("#back", m).onclick = () => { P.step = "amount"; renderPay(); };
      $("#pinPay", m).onsubmit = async (e) => {
        e.preventDefault();
        const err = $("#payErr", m), btn = $("#payBtn", m);
        if (!(await checkPin(me.id, $("#ppin", m).value.trim()))) {
          $("#ppin", m).value = "";
          return (err.textContent = "Wrong PIN.");
        }
        btn.disabled = true;
        btn.textContent = "Paying…";
        try {
          const tx = await DB.pay({
            from: me.id,
            to: to.id,
            amount,
            purpose: P.purpose || "other",
            note: P.note,
            feePeriod: P.purpose === "fees" ? feePeriod().key : null,
            month: monthInfo().key,
          });
          showReceipt(tx, true);
        } catch (ex) {
          console.error(ex);
          btn.disabled = false;
          btn.textContent = `Pay ${fmt(amount)}`;
          err.textContent = ex.message === "NO_BALANCE" ? "Not enough money." : "Payment failed. Try again.";
        }
      };
    }
  }

  // ---------- Receipt + screenshot ----------
  function showReceipt(tx, fresh = false) {
    if (!tx) return;
    P = null;
    const from = byId[tx.from], to = byId[tx.to];
    const out = tx.from === S.user.id;
    const m = modal(`
      <div id="receipt" class="receipt">
        <div class="tick">✓</div>
        <div class="muted small" style="font-weight:600;letter-spacing:.5px">${out ? "PAID" : "RECEIVED"}</div>
        <div class="r-amount">${fmt(tx.amount)}</div>
        <div class="r-to">${out ? `to <b>${esc(to?.name)}</b>` : `from <b>${esc(from?.name)}</b>`}</div>
        ${avatar(out ? to : from, "lg")}
        ${tx.note ? `<div class="r-note">“${esc(tx.note)}”</div>` : ""}
        <dl>
          <div><dt>From</dt><dd>${esc(from?.name)}</dd></div>
          <div><dt>To</dt><dd>${esc(to?.name)}${to?.phone ? ` · ${esc(to.phone)}` : ""}</dd></div>
          <div><dt>For</dt><dd>${purposeLabel(tx.purpose)}</dd></div>
          <div><dt>Date</dt><dd>${fmtDate(tx.ts)}</dd></div>
          <div><dt>Transaction ID</dt><dd>${esc(String(tx.id).toUpperCase())}</dd></div>
        </dl>
        <div class="r-brand"><img src="images/abm-logo.png" alt="">ABM Payment Management</div>
      </div>
      <div class="receipt-actions">
        <button class="btn dark" id="shot">📸 Take screenshot</button>
        <button class="btn primary" id="done">Done</button>
      </div>`);
    if (fresh) toast("Payment successful");
    $("#done", m).onclick = closeModal;
    $("#shot", m).onclick = () => screenshot(tx, out ? to : from);
  }

  async function screenshot(tx, other) {
    if (!window.html2canvas) return toast("Screenshot tool didn't load.");
    try {
      const canvas = await html2canvas($("#receipt"), { scale: 2, backgroundColor: "#ffffff" });
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const file = new File([blob], `ABM-payment-${tx.id}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "ABM Payment", text: `${fmt(tx.amount)} · ${other?.name || ""}` });
          return;
        } catch (e) {
          if (e.name === "AbortError") return;
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("Screenshot saved");
    } catch (e) {
      console.error(e);
      toast(location.protocol === "file:" ? "Screenshots work once the site is online." : "Could not take screenshot.");
    }
  }

  // ============================================================
  //  QR pay page — opened by scanning someone's QR code.
  //  No login needed: the PIN typed here tells us who is paying.
  // ============================================================
  function renderQrPay(toId) {
    const to = byId[toId];
    const clearLink = () => {
      pendingPayTo = null;
      try { history.replaceState(null, "", location.pathname); } catch { /* file:// */ }
    };
    let purpose = to.company ? "fees" : "other";
    $("#app").innerHTML = `
      <div class="login-wrap"><div class="login">
        <img class="login-logo" style="width:120px" src="images/abm-logo.png" alt="ABM">
        <div class="muted small" style="font-weight:700;letter-spacing:.5px">PAYING</div>
        <div style="margin:12px auto">${avatar(to, "lg")}</div>
        <h1 style="margin:0 0 4px">${esc(to.name)}</h1>
        <p class="muted" style="margin:0 0 18px">${to.phone ? "📞 " + esc(to.phone) : "Company account"}</p>
        <form id="qrPayForm" autocomplete="off" style="text-align:left">
          <div class="field"><label for="qAmt">How much to pay? (${CUR} Aurex)</label>
            <input class="input amount-input" id="qAmt" inputmode="numeric" placeholder="${CUR} 0" value="${to.company ? FEE : ""}"></div>
          ${to.company ? `<div class="field"><label>Paying for</label><div class="chips" id="qChips">
            <button type="button" class="chip on" data-p="fees">Fees</button>
            <button type="button" class="chip" data-p="other">Other</button></div></div>` : ""}
          <div class="field"><label for="qNote">Message</label>
            <input class="input" id="qNote" maxlength="120" placeholder="${to.company ? "e.g. For fees" : "Add a message"}"></div>
          <div class="field" style="text-align:center"><label for="qPin">Enter your PIN</label>
            <input class="input pin-input" id="qPin" type="password" inputmode="numeric" maxlength="4"></div>
          <button class="btn primary big block" id="qBtn">Pay</button>
          <p class="err" id="qErr" style="text-align:center"></p>
        </form>
        <button class="btn ghost small" id="qLogin" style="margin-top:6px">Log in instead</button>
      </div></div>`;
    $("#qAmt").focus();
    const chips = $("#qChips");
    if (chips) chips.onclick = (e) => {
      const c = e.target.closest("[data-p]");
      if (!c) return;
      purpose = c.dataset.p;
      $$(".chip", chips).forEach((x) => x.classList.toggle("on", x === c));
      if (purpose === "fees" && !$("#qAmt").value) $("#qAmt").value = FEE;
    };
    $("#qLogin").onclick = () => { clearLink(); renderLogin(); };
    $("#qrPayForm").onsubmit = async (e) => {
      e.preventDefault();
      const err = $("#qErr"), btn = $("#qBtn");
      err.textContent = "";
      const amount = Number($("#qAmt").value);
      const pin = $("#qPin").value.trim();
      if (!Number.isInteger(amount) || amount <= 0) return (err.textContent = "Enter how much to pay.");
      if (Date.now() < lockUntil) return (err.textContent = `Too many tries. Wait ${Math.ceil((lockUntil - Date.now()) / 1000)}s.`);
      if (!/^\d{4}$/.test(pin)) return (err.textContent = "Enter your 4-digit PIN.");
      const payer = await findByPin(pin);
      if (!payer) {
        fails++;
        if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
        $("#qPin").value = "";
        return (err.textContent = "Wrong PIN.");
      }
      fails = 0;
      if (payer.id === to.id) return (err.textContent = "You can't pay yourself.");
      btn.disabled = true;
      btn.textContent = "Paying…";
      try {
        const p = payer.company || !to.company ? "other" : purpose;
        const tx = await DB.pay({
          from: payer.id,
          to: to.id,
          amount,
          purpose: p,
          note: $("#qNote").value.trim(),
          feePeriod: p === "fees" ? feePeriod().key : null,
          month: monthInfo().key,
        });
        clearLink();
        S.user = payer;
        S.quick = true;
        showReceipt(tx, true);
      } catch (ex) {
        console.error(ex);
        btn.disabled = false;
        btn.textContent = "Pay";
        err.textContent = ex.message === "NO_BALANCE" ? "Not enough money." : "Payment failed. Try again.";
      }
    };
  }

  // ============================================================
  if (pendingPayTo) renderQrPay(pendingPayTo);
  else renderLogin();
})();

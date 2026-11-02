/* RTS Knowledge Assessment — static, client-side graded.
   Answer key is stored as salted SHA-256 hashes (questions.json) and as an
   AES-GCM encrypted blob (key.enc.json) that only the examiner passphrase opens. */
(() => {
  const $ = (s) => document.querySelector(s);
  const LS = "rts-assessment-v1";
  const EXAMINER_EMAIL = "kshitij@rechargestudio.com";
  let Q = null;            // loaded questions.json
  let state = null;        // {name,email,start,answers:{},marked:{},cur,submitted,end}
  let tick = null;

  // ---------- helpers ----------
  const enc = new TextEncoder();
  async function sha256(str) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const b64u = {
    enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4))))
  };
  const fmt = (ms) => { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } };
  const show = (id) => { ["start", "test", "result", "examiner"].forEach(s => $("#" + s).classList.toggle("hidden", s !== id)); };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function grade(answers) {
    // returns {score,max,perQ:{id:bool},sections:{name:{q,c,m,max}}}
    const perQ = {}, sections = {}; let score = 0, max = 0;
    for (const q of Q.questions) {
      max += q.marks;
      const sec = sections[q.section] ||= { q: 0, c: 0, m: 0, max: 0 };
      sec.q++; sec.max += q.marks;
      const a = answers[q.id];
      let ok = false;
      if (a !== undefined && a !== null) ok = (await sha256(`${Q.salt}|${q.id}|${a}`)) === q.h;
      perQ[q.id] = ok;
      if (ok) { score += q.marks; sec.c++; sec.m += q.marks; }
    }
    return { score, max, perQ, sections };
  }

  // ---------- start ----------
  async function init() {
    Q = await (await fetch("questions.json", { cache: "no-store" })).json();
    $("#totalQ").textContent = Q.questions.length;
    $("#totalMarks").textContent = Q.questions.reduce((s, q) => s + q.marks, 0);
    const params = new URLSearchParams(location.search);
    if (params.get("reset")) { try { localStorage.removeItem(LS); } catch (e) {} location.replace(location.pathname); return; }
    if (params.get("examiner")) { show("examiner"); bindExaminer(); return; }
    state = load();
    if (state && state.submitted) { showResult(); return; }
    if (state && state.start) { // resume
      if (Date.now() - state.start >= Q.duration_min * 60000) { await submit(true); return; }
      startTest(); return;
    }
    $("#startBtn").addEventListener("click", () => {
      const name = $("#name").value.trim();
      if (!name) { $("#name").focus(); $("#name").style.borderColor = "var(--bad)"; return; }
      state = { name, email: $("#email").value.trim(), start: Date.now(), answers: {}, marked: {}, cur: 0, submitted: false };
      save(); startTest();
    });
  }

  // ---------- test ----------
  function startTest() {
    show("test"); $("#timer").classList.remove("hidden");
    renderPalette(); render();
    tick = setInterval(() => {
      const left = state.start + Q.duration_min * 60000 - Date.now();
      $("#timer").textContent = fmt(left);
      $("#timer").classList.toggle("low", left < 5 * 60000);
      if (left <= 0) submit(true);
    }, 500);
    $("#prevBtn").onclick = () => go(state.cur - 1);
    $("#nextBtn").onclick = () => go(state.cur + 1);
    $("#clearBtn").onclick = () => { delete state.answers[cur().id]; save(); render(); };
    $("#markBtn").onclick = () => { const id = cur().id; state.marked[id] = !state.marked[id]; save(); render(); };
    $("#submitBtn").onclick = () => {
      const n = Object.keys(state.answers).length, t = Q.questions.length;
      const msg = n < t ? `You have answered ${n} of ${t} questions. ${t - n} unanswered will score zero.\n\nSubmit the paper now?` : "Submit the paper now? You cannot change answers afterwards.";
      if (confirm(msg)) submit(false);
    };
    document.addEventListener("keydown", (e) => {
      if ($("#test").classList.contains("hidden")) return;
      if (e.key === "ArrowRight") go(state.cur + 1);
      if (e.key === "ArrowLeft") go(state.cur - 1);
      if (/^[1-6]$/.test(e.key)) { const i = +e.key - 1; if (cur().options[i] !== undefined) choose(i); }
    });
  }
  const cur = () => Q.questions[state.cur];
  function go(i) { if (i < 0 || i >= Q.questions.length) return; state.cur = i; save(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function choose(i) { state.answers[cur().id] = i; save(); render(); }

  function render() {
    const q = cur(), n = Q.questions.length;
    $("#qSection").textContent = q.section;
    $("#qMarks").textContent = `${q.marks} mark${q.marks > 1 ? "s" : ""}`;
    $("#qCount").textContent = `Question ${state.cur + 1} of ${n}`;
    $("#qText").textContent = q.text;
    const sel = state.answers[q.id];
    $("#opts").innerHTML = q.options.map((o, i) =>
      `<label class="opt ${sel === i ? "sel" : ""}"><input type="radio" name="opt" ${sel === i ? "checked" : ""} data-i="${i}"><span class="k">${"ABCDEF"[i]}.</span><span>${esc(o)}</span></label>`).join("");
    $("#opts").querySelectorAll("input").forEach(r => r.addEventListener("change", () => choose(+r.dataset.i)));
    $("#prevBtn").disabled = state.cur === 0;
    $("#nextBtn").textContent = state.cur === n - 1 ? "Last question" : "Next →";
    $("#nextBtn").disabled = state.cur === n - 1;
    $("#markBtn").textContent = state.marked[q.id] ? "Unmark review" : "Mark for review";
    $("#pal").querySelectorAll("button").forEach((b, i) => {
      const id = Q.questions[i].id;
      b.className = (state.answers[id] !== undefined ? "ans " : "") + (state.marked[id] ? "mark " : "") + (i === state.cur ? "cur" : "");
    });
    // section progress
    const secs = {};
    Q.questions.forEach(x => { const s = secs[x.section] ||= { a: 0, t: 0 }; s.t++; if (state.answers[x.id] !== undefined) s.a++; });
    $("#secProgress").innerHTML = Object.entries(secs).map(([k, v]) => `<div><span>${esc(k)}</span><span>${v.a}/${v.t}</span></div>`).join("");
  }
  function renderPalette() {
    $("#pal").innerHTML = Q.questions.map((q, i) => `<button title="${esc(q.section)}">${i + 1}</button>`).join("");
    $("#pal").querySelectorAll("button").forEach((b, i) => b.onclick = () => go(i));
  }

  // ---------- submit & result ----------
  async function submit(auto) {
    if (state.submitted) return;
    clearInterval(tick);
    state.submitted = true; state.end = Date.now(); state.auto = !!auto;
    const g = await grade(state.answers);
    state.score = g.score; state.max = g.max;
    save(); showResult(g);
  }
  async function showResult(g) {
    show("result"); $("#timer").classList.add("hidden");
    g = g || await grade(state.answers);
    const mins = Math.round((state.end - state.start) / 60000);
    $("#resMeta").textContent = `${state.name}${state.email ? " · " + state.email : ""} · submitted ${new Date(state.end).toLocaleString()} · time taken ${mins} min${state.auto ? " · auto-submitted at time-up" : ""}`;
    $("#resScore").textContent = g.score; $("#resMax").textContent = g.max;
    $("#resPct").textContent = Math.round(100 * g.score / g.max) + "%";
    $("#resTable tbody").innerHTML = Object.entries(g.sections).map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td class="num">${v.q}</td><td class="num">${v.c}</td><td class="num">${v.m} / ${v.max}</td></tr>`).join("") +
      `<tr><th>Total</th><th class="num">${Q.questions.length}</th><th class="num">${Object.values(g.perQ).filter(Boolean).length}</th><th class="num">${g.score} / ${g.max}</th></tr>`;
    const payload = { v: 1, name: state.name, email: state.email, start: state.start, end: state.end, auto: state.auto, score: g.score, max: g.max, answers: state.answers };
    const code = "RTS1." + b64u.enc(JSON.stringify(payload));
    $("#resCode").value = code;
    const body = `RTS Knowledge Assessment result\nName: ${state.name}\nScore: ${g.score} / ${g.max}\nSubmitted: ${new Date(state.end).toLocaleString()}\n\nResult code (for verification):\n${code}`;
    $("#mailBtn").onclick = () => location.href = `mailto:${EXAMINER_EMAIL}?subject=${encodeURIComponent("RTS Assessment result - " + state.name)}&body=${encodeURIComponent(body)}`;
    $("#copyBtn").onclick = async () => { try { await navigator.clipboard.writeText(code); $("#copyBtn").textContent = "Copied ✓"; } catch (e) { $("#resCode").select(); document.execCommand("copy"); } };
  }

  // ---------- examiner ----------
  async function decryptKey(pass) {
    const k = await (await fetch("key.enc.json", { cache: "no-store" })).json();
    const b = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const km = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b(k.salt), iterations: k.iter, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b(k.iv) }, key, b(k.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  function bindExaminer() {
    $("#timer").classList.add("hidden");
    $("#exBtn").onclick = async () => {
      const out = $("#exOut"); out.innerHTML = "";
      let payload;
      try { const c = $("#exCode").value.trim(); if (!c.startsWith("RTS1.")) throw 0; payload = JSON.parse(b64u.dec(c.slice(5))); }
      catch (e) { out.innerHTML = `<p class="bad">That does not look like a valid result code.</p>`; return; }
      const g = await grade(payload.answers || {});
      let key = null;
      if ($("#exPass").value) { try { key = await decryptKey($("#exPass").value); } catch (e) { out.innerHTML = `<p class="bad">Wrong passphrase. Showing verified score only.</p>`; } }
      const mins = Math.round((payload.end - payload.start) / 60000);
      out.innerHTML += `<div class="notice"><strong>${esc(payload.name || "")}</strong> ${payload.email ? "· " + esc(payload.email) : ""}<br>
        Verified score: <strong>${g.score} / ${g.max}</strong> (${Math.round(100 * g.score / g.max)}%) · claimed ${payload.score} · ${mins} min · submitted ${new Date(payload.end).toLocaleString()}${payload.auto ? " · auto-submitted" : ""}
        ${payload.score !== g.score ? '<br><span class="bad">Claimed score does not match the verified score.</span>' : ""}</div>` +
        `<table><thead><tr><th>Section</th><th class="num">Correct</th><th class="num">Marks</th></tr></thead><tbody>` +
        Object.entries(g.sections).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.c}/${v.q}</td><td class="num">${v.m}/${v.max}</td></tr>`).join("") + `</tbody></table>`;
      out.innerHTML += Q.questions.map((q, i) => {
        const a = payload.answers[q.id]; const ok = g.perQ[q.id];
        const given = a === undefined ? '<span class="warn">not answered</span>' : `${"ABCDEF"[a]}. ${esc(q.options[a])}`;
        const correct = key ? `<div class="o">Correct: <strong>${"ABCDEF"[key[q.id].a]}. ${esc(q.options[key[q.id].a])}</strong>${key[q.id].src ? ` <span class="muted">— ${esc(key[q.id].src)}</span>` : ""}</div>` : "";
        return `<div class="q"><div class="t">${i + 1}. <span class="chip">${esc(q.section)}</span> ${esc(q.text)}</div><div class="o">Answer given: ${given} <span class="${ok ? "ok" : "bad"}">${ok ? "✓ " + q.marks : "✗ 0"}</span></div>${correct}</div>`;
      }).join("");
    };
    $("#exKeyBtn").onclick = async () => {
      const out = $("#exOut");
      try {
        const key = await decryptKey($("#exPass").value);
        out.innerHTML = Q.questions.map((q, i) => `<div class="q"><div class="t">${i + 1}. <span class="chip">${esc(q.section)}</span> ${esc(q.text)}</div><div class="o">Answer: <strong>${"ABCDEF"[key[q.id].a]}. ${esc(q.options[key[q.id].a])}</strong>${key[q.id].src ? ` <span class="muted">— ${esc(key[q.id].src)}</span>` : ""}</div></div>`).join("");
      } catch (e) { out.innerHTML = `<p class="bad">Wrong passphrase.</p>`; }
    };
  }

  init().catch(e => { document.body.insertAdjacentHTML("afterbegin", `<p class="bad wrap">Failed to load the paper: ${esc(e.message)}</p>`); });
})();

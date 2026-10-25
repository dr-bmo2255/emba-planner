// Sign-in screen: Yale email → 6-digit code → (first time) your name.
window.showSignIn = function (opts) {
  opts = opts || {};
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  document.body.classList.add("signed-out");
  const root = document.createElement("div");
  root.className = "signin";
  document.body.appendChild(root);
  let email = "";

  function card(inner) {
    root.innerHTML = `<div class="signin-card">
      <div class="signin-brand"><span class="brand-yale">Yale</span><span class="brand-som">School of Management</span></div>
      <h1>EMBA Planner</h1><p class="signin-sub">Class of 2028 · assignments, readings, classes, and teams</p>${inner}
      <p class="signin-foot">Unofficial, student-built tool. Yale accounts only.</p></div>`;
    const f = root.querySelector("input");
    if (f) f.focus();
  }

  function emailStep(err) {
    card(`<form id="siEmail"><label>Your Yale email
      <input type="email" name="email" autocomplete="email" inputmode="email" placeholder="first.last@yale.edu" value="${esc(email)}" required></label>
      <button class="btn btn-lg" type="submit">Email me a sign-in code</button>
      <p class="signin-msg err">${esc(err || "")}</p>
      ${opts.joinName ? `<p class="signin-note">Sign in to join <b>${esc(opts.joinName)}</b>.</p>` : opts.join ? `<p class="signin-note">Sign in to join your team.</p>` : ""}</form>`);
    root.querySelector("#siEmail").addEventListener("submit", async (e) => {
      e.preventDefault();
      email = e.target.email.value.trim().toLowerCase();
      if (!/@yale\.edu$/.test(email)) return emailStep("Use your @yale.edu address.");
      e.target.querySelector("button").disabled = true;
      try {
        const r = await api("POST", "/api/auth/start", { email });
        codeStep("", r.devCode);
      } catch (x) { emailStep(x.message); }
    });
  }

  function codeStep(err, devCode) {
    card(`<form id="siCode"><p class="signin-note">We emailed a 6-digit code to <b>${esc(email)}</b>. It expires in 10 minutes.</p>
      ${devCode ? `<p class="signin-dev">Local test mode: your code is <b>${esc(devCode)}</b></p>` : ""}
      <label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="123456" required></label>
      <button class="btn btn-lg" type="submit">Sign in</button>
      <p class="signin-msg err">${esc(err || "")}</p>
      <p class="signin-alt"><button type="button" class="linkish" id="siBack">Use a different email</button> · <button type="button" class="linkish" id="siResend">Send a new code</button></p></form>`);
    root.querySelector("#siBack").addEventListener("click", () => emailStep());
    root.querySelector("#siResend").addEventListener("click", async () => {
      try { const r = await api("POST", "/api/auth/start", { email }); codeStep("A new code is on its way.", r.devCode); } catch (x) { codeStep(x.message); }
    });
    root.querySelector("#siCode").addEventListener("submit", async (e) => {
      e.preventDefault();
      e.target.querySelector("button").disabled = true;
      try {
        const r = await api("POST", "/api/auth/verify", { email, code: e.target.code.value });
        if (!r.user.name) nameStep(); else done();
      } catch (x) { codeStep(x.message, devCode); }
    });
  }

  function nameStep(err) {
    const guess = email.split("@")[0].split(/[._]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    card(`<form id="siName"><p class="signin-note">Welcome! What should your teammates see?</p>
      <label>Your name<input name="name" autocomplete="name" value="${esc(guess)}" maxlength="60" required></label>
      <button class="btn btn-lg" type="submit">Continue</button>
      <p class="signin-msg err">${esc(err || "")}</p></form>`);
    root.querySelector("#siName").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("PUT", "/api/me/name", { name: e.target.name.value }); done(); } catch (x) { nameStep(x.message); }
    });
  }

  function done() { location.reload(); }
  emailStep();
};

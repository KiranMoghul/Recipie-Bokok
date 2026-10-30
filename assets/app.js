// Recipe Book: home page (cuisines) and recipe pages, routed on the URL hash.
//   #c-mexican          -> home, scrolled to the Mexican shelf
//   #r-mexican-nixtamal -> that recipe

const SITE_NAME = "Recipe Book";
const SWATCHES = ["#1d6a4c", "#c2410c", "#2557a8", "#9d2a5a", "#7a5b13", "#5b3fa0", "#0f766e", "#a3322b"];

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const store = {
  get(k, d) { try { const v = localStorage.getItem("rb:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("rb:" + k, JSON.stringify(v)); } catch {} },
};

const state = {
  data: null,
  units: store.get("units", "metric"),   // "metric" | "us"
  temp: store.get("temp", "C"),          // "C" | "F"
  recipe: null,
  servings: 1,
  checkedIng: new Set(),
  doneSteps: new Set(),
  cookIndex: 0,
  timers: [],
  wakeLock: null,
  wantWake: false,
};

function fmtMin(m) {
  if (!m) return "";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return [d && `${d} d`, h && `${h} h`, mm && `${mm} min`].filter(Boolean).join(" ");
}
function swatch(cuisineSlug) {
  const i = state.data.cuisines.findIndex((c) => c.slug === cuisineSlug);
  return SWATCHES[(i < 0 ? 0 : i) % SWATCHES.length];
}
function plural(label, n) {
  if (n === 1) return label.replace(/s$/, "") === "people" ? "person" : label;
  if (label === "person") return "people";
  if (/(people|s)$/.test(label)) return label;
  return /(ch|sh|x)$/.test(label) ? label + "es" : label + "s";
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.role = "status"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------------- Home ---------------- */

function renderHome(focusCuisine) {
  document.title = SITE_NAME;
  const { cuisines, recipes } = state.data;
  const app = $("#app");
  app.innerHTML = `
    <section class="wrap intro">
      <h1>${esc(SITE_NAME)}</h1>
      <p>${recipes.length} recipe${recipes.length === 1 ? "" : "s"} across ${cuisines.length} cuisine${cuisines.length === 1 ? "" : "s"}. Every recipe scales to the number of people you're cooking for and switches between grams and cups &amp; spoons.</p>
      <nav class="shelf-nav" aria-label="Cuisines">
        <a class="chip" href="#saved">♥ Saved <span class="count num">${store.get("saved", []).length}</span></a>
        ${cuisines.map((c) => `<a class="chip" href="#c-${c.slug}"><span style="color:${swatch(c.slug)}">●</span>${esc(c.name)} <span class="count num">${recipes.filter((r) => r.cuisineSlug === c.slug).length}</span></a>`).join("")}
      </nav>
    </section>
    <div class="wrap" id="shelves"></div>`;
  renderShelves($("#q").value);
  if (focusCuisine) {
    const el = document.getElementById("c-" + focusCuisine);
    if (el) el.scrollIntoView();
  } else window.scrollTo(0, 0);
}

function matches(r, q) {
  if (!q) return true;
  const hay = [r.title, r.cuisine, r.category, r.description, r.tags.join(" "), r.ingredients.map((i) => i.name).join(" ")].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function renderShelves(q) {
  const box = $("#shelves");
  if (!box) return;
  const { cuisines } = state.data;
  let recipes = state.data.recipes;
  if (location.hash === "#saved") {
    const saved = store.get("saved", []);
    recipes = recipes.filter((r) => saved.includes(r.id));
    if (!recipes.length) { box.innerHTML = `<p class="empty">No saved recipes yet. Tap ♡ on any recipe to keep it here.</p>`; return; }
  }
  const html = cuisines.map((c) => {
    const list = recipes.filter((r) => r.cuisineSlug === c.slug && matches(r, q));
    if (!list.length) return "";
    return `
      <section class="shelf" id="c-${c.slug}">
        <div class="shelf-head"><h2>${esc(c.name)}</h2><span class="muted num">${list.length} recipe${list.length === 1 ? "" : "s"}</span></div>
        ${c.description ? `<p>${esc(c.description)}</p>` : ""}
        <div class="grid">${list.map(card).join("")}</div>
      </section>`;
  }).join("");
  box.innerHTML = html || `<p class="empty">No recipes match “${esc(q)}”. Try an ingredient or a cuisine.</p>`;
}

function photo(r) {
  if (r.image) return `<img src="${esc(r.image)}" alt="${esc(r.title)}" loading="lazy">`;
  return `<div class="ph" style="--swatch:${swatch(r.cuisineSlug)}" role="img" aria-label="No photo yet"><span>${esc(r.title.charAt(0))}</span></div>`;
}

function card(r) {
  const total = r.prep + r.cook + r.rest;
  const saved = store.get("saved", []).includes(r.id);
  return `
    <article class="card">
      <div class="card-img">${photo(r)}</div>
      <div class="card-body">
        <div class="kicker">${esc([r.cuisine, r.category].filter(Boolean).join(" · "))}</div>
        <h3><a href="#r-${r.id}">${esc(r.title)}</a></h3>
        <div class="facts num">
          <span>${total ? fmtMin(total) : ""}</span>
          <button type="button" class="save-mini" data-save="${r.id}" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save recipe"}">${saved ? "♥" : "♡"}</button>
        </div>
      </div>
    </article>`;
}

function toggleList(key, id) {
  const list = store.get(key, []);
  const i = list.indexOf(id);
  i < 0 ? list.push(id) : list.splice(i, 1);
  store.set(key, list);
  return i < 0;
}

function paintActions() {
  const r = state.recipe; if (!r) return;
  const saved = store.get("saved", []).includes(r.id), made = store.get("made", []).includes(r.id);
  $("#save").setAttribute("aria-pressed", saved); $("#save").textContent = saved ? "♥ Saved" : "♡ Save";
  $("#made").setAttribute("aria-pressed", made); $("#made").textContent = made ? "✓ Made it" : "◯ I made it";
}

function relatedTo(r) {
  const others = state.data.recipes.filter((x) => x.id !== r.id);
  const score = (x) => (x.cuisineSlug === r.cuisineSlug ? 2 : 0) + (x.category && x.category === r.category ? 1 : 0);
  return others.sort((a, b) => score(b) - score(a)).slice(0, 4);
}

function storyHTML(lines) {
  let h = "", list = false;
  lines.forEach((l) => {
    const li = /^[-*]\s+/.test(l);
    if (li && !list) { h += "<ul>"; list = true; }
    if (!li && list) { h += "</ul>"; list = false; }
    h += li ? `<li>${esc(l.replace(/^[-*]\s+/, ""))}</li>` : `<p>${esc(l)}</p>`;
  });
  return h + (list ? "</ul>" : "");
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-save]");
  if (!b) return;
  const on = toggleList("saved", b.dataset.save);
  b.setAttribute("aria-pressed", on); b.textContent = on ? "♥" : "♡";
  b.setAttribute("aria-label", on ? "Remove from saved" : "Save recipe");
  if (location.hash === "#saved") route();
});

/* ---------------- Recipe ---------------- */

function findIng(r, ref) {
  const key = slug(ref);
  return r.ingredients.find((i) => i.id === key) || r.ingredients.find((i) => i.id.startsWith(key)) || r.ingredients.find((i) => i.id.includes(key));
}

function qtyHTML(ing, factor) {
  const q = Units.formatQuantity(ing, factor, state.units);
  if (!q) return "";
  return `${q.approx ? `<span class="approx" title="Approximate conversion">≈</span>` : ""}${esc(q.qty)}${q.unit ? " " + esc(q.unit) : ""}`;
}

function stepHTML(text, r, factor) {
  let h = esc(text);
  // Temperatures: 180°C / 350 °F
  h = h.replace(/(\d{2,3})\s*°\s*([CF])\b/g, (m, n, u) => {
    n = +n;
    const v = state.temp === u ? n : u === "C" ? Units.toF(n) : Units.toC(n);
    return `<span class="temp">${v}°${state.temp}</span>`;
  });
  // Times become timer buttons: "40 minutes", "8 hours", "10–12 min"
  h = h.replace(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi, (m, a, b, u) => {
    const mult = /^s/i.test(u) ? 1 : /^m/i.test(u) ? 60 : 3600;
    const secs = Math.round(parseFloat(a) * mult);
    return `<button type="button" class="timer-btn" data-secs="${secs}" data-label="${esc(m)}" title="Start a ${esc(m)} timer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>${esc(m)}</button>`;
  });
  // {ingredient} references show the scaled amount
  h = h.replace(/\{([^}]+)\}/g, (m, ref) => {
    const ing = findIng(r, ref);
    if (!ing) return esc(ref);
    const q = qtyHTML(ing, factor);
    return q ? `<span class="inline-qty">${q}</span> ${esc(ing.name)}` : esc(ing.name);
  });
  return h;
}

function stepRefs(text, r) {
  return (text.match(/\{([^}]+)\}/g) || []).map((m) => findIng(r, m.slice(1, -1))).filter(Boolean);
}

function openRecipe(id) {
  const r = state.data.recipes.find((x) => x.id === id);
  if (!r) { location.hash = ""; return; }
  if (state.recipe !== r) {
    state.recipe = r;
    state.servings = r.serves;
    state.checkedIng = new Set(store.get("ing:" + r.id, []));
    state.doneSteps = new Set(store.get("steps:" + r.id, []));
  }
  document.title = `${r.title} · ${SITE_NAME}`;
  const app = $("#app");
  const yieldText = `${r.serves} ${plural(r.servesLabel, r.serves)}`;
  const byline = r.author ? `By ${esc(r.author)}` : r.source ? `Recipe from ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.source)}</a>` : esc(r.source)}` : "";
  const related = relatedTo(r);
  app.innerHTML = `
    <article>
      <div class="wrap narrow recipe-top">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#">Home</a><span>›</span><a href="#c-${r.cuisineSlug}">${esc(r.cuisine)}</a>${r.category ? `<span>›</span><span>${esc(r.category)}</span>` : ""}</nav>
        <h1>${esc(r.title)}</h1>
        ${byline ? `<p class="byline">${byline}</p>` : ""}
        <div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <div><button type="button" class="btn primary" id="jump">↓ Jump to recipe</button></div>
        <figure class="hero">${photo(r)}</figure>
        <dl class="facts-strip">
          <div><dt>Yields</dt><dd>${esc(r.yield || yieldText)}</dd></div>
          ${r.prep ? `<div><dt>Prep time</dt><dd>${fmtMin(r.prep)}</dd></div>` : ""}
          ${r.cook ? `<div><dt>Cook time</dt><dd>${fmtMin(r.cook)}</dd></div>` : ""}
          ${r.rest ? `<div><dt>Rest</dt><dd>${fmtMin(r.rest)}</dd></div>` : ""}
          ${r.prep + r.cook + r.rest ? `<div><dt>Total time</dt><dd>${fmtMin(r.prep + r.cook + r.rest)}</dd></div>` : ""}
          ${r.level ? `<div><dt>Level</dt><dd>${esc(r.level)}</dd></div>` : ""}
        </dl>
        <div class="actions">
          <button type="button" class="btn" id="save" aria-pressed="false"></button>
          <button type="button" class="btn" id="print">⎙ Print</button>
          <button type="button" class="btn" id="made" aria-pressed="false"></button>
        </div>
        ${r.description ? `<p class="lede">${esc(r.description)}</p>` : ""}
        ${r.story.map((sec) => `<section class="story"><h2>${esc(sec.title)}</h2>${storyHTML(sec.lines)}</section>`).join("")}
      </div>

      <section class="wrap recipe-box" id="recipe" aria-label="Recipe">
        <div class="controls" role="toolbar" aria-label="Recipe controls">
          <div class="ctl">
            <span class="ctl-label" id="serves-lbl">Serves</span>
            <div class="stepper">
              <button type="button" id="less" aria-label="Fewer">−</button>
              <input id="servings" type="number" inputmode="decimal" min="${r.servesStep}" step="${r.servesStep}" aria-labelledby="serves-lbl">
              <button type="button" id="more" aria-label="More">+</button>
            </div>
            <span id="serves-unit" class="muted"></span>
          </div>
          <div class="ctl">
            <span class="ctl-label">Units</span>
            <div class="seg" id="units">
              <button type="button" data-v="metric">Grams &amp; ml</button>
              <button type="button" data-v="us">Cups &amp; spoons</button>
            </div>
          </div>
          <div class="ctl">
            <span class="ctl-label">Oven</span>
            <div class="seg" id="temp"><button type="button" data-v="C">°C</button><button type="button" data-v="F">°F</button></div>
          </div>
          <span class="spacer"></span>
          <button type="button" class="btn primary" id="cook-start">Cook mode →</button>
          <p class="scale-note" id="scale-note" hidden></p>
        </div>

        <div class="body">
          <aside class="ingredients" aria-labelledby="ing-h">
            <div class="panel-head"><h2 id="ing-h">Ingredients</h2><button type="button" class="linkbtn" id="copy-list">Copy list</button></div>
            <div id="ing"></div>
            <p class="conv-hint" id="conv-hint"></p>
            <button type="button" class="switch" id="wake" role="switch" aria-checked="false"><span class="track"><span class="knob"></span></span>Keep screen awake</button>
            ${r.nutrition.length ? `<div class="nutrition"><h3>Nutrition per serving</h3><ul>${r.nutrition.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
          </aside>
          <section aria-labelledby="steps-h">
            <div class="panel-head"><h2 id="steps-h">Directions</h2><button type="button" class="linkbtn" id="clear">Clear ticks</button></div>
            <ol class="step-list" id="steps"></ol>
            ${r.notes.length ? `<aside class="notes"><h2>Chef's notes</h2><ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></aside>` : ""}
          </section>
        </div>
      </section>

      ${related.length ? `<section class="wrap related"><h2>You'll also love</h2><div class="grid">${related.map(card).join("")}</div></section>` : ""}
    </article>`;

  $("#jump").onclick = () => $("#recipe").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  $("#save").onclick = () => { toggleList("saved", r.id); paintActions(); };
  $("#made").onclick = () => { const on = toggleList("made", r.id); paintActions(); if (on) toast("Nice! Marked as made"); };
  paintActions();
  // wire controls
  $("#servings").addEventListener("change", (e) => setServings(parseFloat(e.target.value)));
  $("#less").onclick = () => setServings(state.servings - r.servesStep);
  $("#more").onclick = () => setServings(state.servings + r.servesStep);
  $("#units").onclick = (e) => { const v = e.target.closest("button")?.dataset.v; if (v) { state.units = v; store.set("units", v); refresh(); } };
  $("#temp").onclick = (e) => { const v = e.target.closest("button")?.dataset.v; if (v) { state.temp = v; store.set("temp", v); refresh(); } };
  $("#wake").onclick = toggleWake;
  $("#wake").setAttribute("aria-checked", state.wantWake);
  $("#print").onclick = () => { try { window.print(); } catch { toast("Printing isn't available here"); } };
  $("#cook-start").onclick = () => openCook(firstOpenStep());
  $("#clear").onclick = () => { state.checkedIng.clear(); state.doneSteps.clear(); saveTicks(); refresh(); };
  $("#copy-list").onclick = copyList;
  $("#ing").addEventListener("change", (e) => {
    const i = e.target.dataset.i; if (i == null) return;
    e.target.checked ? state.checkedIng.add(+i) : state.checkedIng.delete(+i);
    saveTicks(); e.target.closest("li").classList.toggle("checked", e.target.checked);
  });
  $("#steps").addEventListener("change", (e) => {
    const i = e.target.dataset.s; if (i == null) return;
    e.target.checked ? state.doneSteps.add(+i) : state.doneSteps.delete(+i);
    saveTicks(); e.target.closest("li").classList.toggle("done", e.target.checked);
  });
  window.scrollTo(0, 0);
  refresh();
}

function saveTicks() {
  const r = state.recipe;
  store.set("ing:" + r.id, [...state.checkedIng]);
  store.set("steps:" + r.id, [...state.doneSteps]);
}

function setServings(n) {
  const r = state.recipe;
  if (!isFinite(n)) n = r.serves;
  n = Math.max(r.servesStep, Math.round(n / r.servesStep) * r.servesStep);
  state.servings = +n.toFixed(2);
  refresh();
}

function refresh() {
  const r = state.recipe;
  if (!r) return;
  const factor = state.servings / r.serves;
  $("#servings").value = state.servings;
  $("#serves-unit").textContent = plural(r.servesLabel, state.servings);
  $("#units").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === state.units));
  $("#temp").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === state.temp));
  if ($("#yield")) $("#yield").textContent = factor === 1 ? r.yield : `${r.yield} × ${+factor.toFixed(2)}`;

  const note = $("#scale-note");
  note.hidden = factor === 1;
  note.innerHTML = factor === 1 ? "" :
    `Scaled ×${+factor.toFixed(2)} from the original ${r.serves} ${esc(plural(r.servesLabel, r.serves))}. Cooking times and pan sizes may need adjusting. <button type="button" class="linkbtn" id="reset-serves">Reset</button>`;
  if (factor !== 1) $("#reset-serves").onclick = () => setServings(r.serves);

  // Ingredients
  let html = "", group = undefined, idx = 0, noVol = false, approx = false;
  html += `<ul class="ing-list">`;
  r.ingredients.forEach((ing, i) => {
    if (ing.group !== group) {
      if (i) html += `</ul><ul class="ing-list">`;
      if (ing.group) html = html.replace(/<ul class="ing-list">$/, `<h3 class="ing-group">${esc(ing.group)}</h3><ul class="ing-list">`);
      group = ing.group;
    }
    const q = Units.formatQuantity(ing, factor, state.units);
    if (q?.noVolume) noVol = true;
    if (q?.approx) approx = true;
    const checked = state.checkedIng.has(i);
    html += `<li class="${checked ? "checked" : ""}"><label>
      <input type="checkbox" data-i="${i}" ${checked ? "checked" : ""}>
      <span class="qty">${qtyHTML(ing, factor)}</span>
      <span><span class="ing-name">${esc(ing.name)}</span>${ing.note ? `<span class="ing-note">, ${esc(ing.note)}</span>` : ""}</span>
    </label></li>`;
  });
  html += `</ul>`;
  $("#ing").innerHTML = html;
  $("#conv-hint").textContent = [
    approx ? "≈ marks amounts converted by the ingredient's typical weight. For baking, weigh where you can." : "",
    noVol ? "Some ingredients stay in grams because there's no reliable spoon measure for them." : "",
  ].filter(Boolean).join(" ");

  // Steps
  $("#steps").innerHTML = r.steps.map((s, i) => {
    const done = state.doneSteps.has(i);
    return `<li class="${done ? "done" : ""}">
      <label class="step-num"><input type="checkbox" data-s="${i}" ${done ? "checked" : ""}><span>Step ${i + 1}</span></label>
      <p class="step-text">${stepHTML(s.text, r, factor)}</p>
    </li>`;
  }).join("");

  if (!$("#cook").hidden) renderCook();
}

function copyList() {
  const r = state.recipe, factor = state.servings / r.serves;
  const lines = r.ingredients.map((ing) => {
    const q = Units.formatQuantity(ing, factor, state.units);
    return `- ${q ? `${q.approx ? "~" : ""}${q.qty}${q.unit ? " " + q.unit : ""} ` : ""}${ing.name}${ing.note ? ", " + ing.note : ""}`;
  });
  const text = `${r.title} (${state.servings} ${plural(r.servesLabel, state.servings)})\n${lines.join("\n")}`;
  navigator.clipboard.writeText(text).then(() => toast("Ingredient list copied"), () => toast("Couldn't copy. Select the list and copy it instead."));
}

/* ---------------- Keep screen awake ---------------- */

async function acquireWake() {
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => { state.wakeLock = null; });
    return true;
  } catch { return false; }
}
async function toggleWake() {
  if (state.wantWake) {
    state.wantWake = false;
    try { await state.wakeLock?.release(); } catch {}
  } else {
    if (!("wakeLock" in navigator) || !(await acquireWake())) {
      toast("This browser can't keep the screen on. Check your phone's auto-lock setting.");
      return;
    }
    state.wantWake = true;
    toast("Screen will stay on while this page is open");
  }
  document.querySelectorAll("#wake").forEach((b) => b.setAttribute("aria-checked", state.wantWake));
}
document.addEventListener("visibilitychange", () => {
  if (state.wantWake && document.visibilityState === "visible" && !state.wakeLock) acquireWake();
});

/* ---------------- Timers ---------------- */

let audioCtx = null;
function startTimer(secs, label) {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch {}
  state.timers.push({ id: Date.now() + Math.random(), label, end: Date.now() + secs * 1000, ringing: false });
  renderTimers();
}
function beep() {
  if (!audioCtx) return;
  try {
    [0, 0.25, 0.5].forEach((t) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch {}
  try { navigator.vibrate?.([300, 150, 300]); } catch {}
}
function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0");
}
function renderTimers() {
  const box = $("#timers");
  box.innerHTML = state.timers.map((t) => {
    const left = t.end - Date.now();
    return `<div class="timer ${t.ringing ? "ring" : ""}" role="timer">
      <div style="flex:1"><div class="t-time">${t.ringing ? "Done!" : clock(left)}</div><div class="t-label">${esc(t.label)}</div></div>
      ${t.ringing ? "" : `<button type="button" data-add="${t.id}">+1 min</button>`}
      <button type="button" data-stop="${t.id}">${t.ringing ? "Stop" : "Cancel"}</button>
    </div>`;
  }).join("");
}
setInterval(() => {
  if (!state.timers.length) return;
  state.timers.forEach((t) => {
    if (Date.now() >= t.end) { t.ringing = true; beep(); }
  });
  renderTimers();
}, 1000);
document.addEventListener("click", (e) => {
  const tb = e.target.closest(".timer-btn");
  if (tb) { startTimer(+tb.dataset.secs, `${state.recipe?.title || ""}: ${tb.dataset.label}`); return; }
  const add = e.target.closest("[data-add]");
  if (add) { const t = state.timers.find((x) => String(x.id) === add.dataset.add); if (t) t.end += 60000; renderTimers(); return; }
  const stop = e.target.closest("[data-stop]");
  if (stop) { state.timers = state.timers.filter((x) => String(x.id) !== stop.dataset.stop); renderTimers(); }
});

/* ---------------- Cook mode ---------------- */

function firstOpenStep() {
  const i = state.recipe.steps.findIndex((_, i) => !state.doneSteps.has(i));
  return i < 0 ? 0 : i;
}
function openCook(i) {
  state.cookIndex = i;
  $("#cook").hidden = false;
  document.body.style.overflow = "hidden";
  if (!state.wantWake) toggleWake();
  renderCook();
  $("#cook-next").focus();
}
function closeCook() {
  $("#cook").hidden = true;
  document.body.style.overflow = "";
  refresh();
}
function renderCook() {
  const r = state.recipe, i = state.cookIndex, n = r.steps.length, factor = state.servings / r.serves;
  const step = r.steps[i];
  $("#cook-title").textContent = r.title;
  $("#cook-bar").style.width = ((i + 1) / n) * 100 + "%";
  $("#cook-no").textContent = `Step ${i + 1} of ${n}`;
  $("#cook-text").innerHTML = stepHTML(step.text, r, factor);
  const uses = stepRefs(step.text, r);
  $("#cook-uses").innerHTML = uses.map((ing) => `<span class="tag">${qtyHTML(ing, factor)} ${esc(ing.name)}</span>`).join("");
  $("#cook-prev").disabled = i === 0;
  $("#cook-next").textContent = i === n - 1 ? "Finish ✓" : "Next step →";
}
function cookMove(d) {
  const r = state.recipe;
  if (d > 0) { state.doneSteps.add(state.cookIndex); saveTicks(); }
  if (d > 0 && state.cookIndex === r.steps.length - 1) { closeCook(); toast("All steps done. Enjoy!"); return; }
  state.cookIndex = Math.min(r.steps.length - 1, Math.max(0, state.cookIndex + d));
  renderCook();
}
$("#cook-close").onclick = closeCook;
$("#cook-prev").onclick = () => cookMove(-1);
$("#cook-next").onclick = () => cookMove(1);
document.addEventListener("keydown", (e) => {
  if ($("#cook").hidden) return;
  if (e.key === "ArrowRight") cookMove(1);
  if (e.key === "ArrowLeft") cookMove(-1);
  if (e.key === "Escape") closeCook();
});

/* ---------------- Router & boot ---------------- */

function route() {
  if (!state.data) return;
  if (!$("#cook").hidden) closeCook();
  const h = location.hash.slice(1);
  if (h.startsWith("r-")) return openRecipe(h.slice(2));
  state.recipe = null;
  renderHome(h.startsWith("c-") ? h.slice(2) : null);
  document.querySelectorAll('.shelf-nav a[href="#saved"]').forEach((a) => a.setAttribute("aria-current", h === "saved" ? "page" : "false"));
}

$("#q").addEventListener("input", (e) => {
  if (location.hash.startsWith("#r-")) { location.hash = ""; }
  renderShelves(e.target.value.trim());
});
document.querySelector(".brand").textContent = "";
document.querySelector(".brand").insertAdjacentHTML("beforeend", `<span class="brand-mark" aria-hidden="true">✦</span>${esc(SITE_NAME)}`);
window.addEventListener("hashchange", route);

fetch("recipes/index.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => { state.data = d; route(); })
  .catch(() => {
    $("#app").innerHTML = `<div class="wrap empty">Couldn't load the recipes (recipes/index.json). If you're opening the file directly from your computer, run a local server instead; on GitHub, check the Actions tab for a failed build.</div>`;
  });

// Recipe Book: home (rows per cuisine), cuisine pages and recipe pages,
// routed on the URL hash:
//   #c-mexican          -> all Mexican recipes
//   #r-mexican-nixtamal -> that recipe
//   #saved              -> saved recipes

const SITE_NAME = "Recipe Book";

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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

const ICON = {
  bookmark: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`,
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>`,
  left: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>`,
  right: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`,
};

function fmtMin(m) {
  if (!m) return "";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return [d && `${d} d`, h && `${h} hr`, mm && `${mm} min`].filter(Boolean).join(" ");
}
function plural(label, n) {
  if (n === 1) return label === "people" ? "person" : label;
  if (label === "person") return "people";
  if (/(people|s)$/.test(label)) return label;
  return /(ch|sh|x)$/.test(label) ? label + "es" : label + "s";
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function toggleList(key, id) {
  const list = store.get(key, []);
  const i = list.indexOf(id);
  i < 0 ? list.push(id) : list.splice(i, 1);
  store.set(key, list);
  return i < 0;
}
const isSaved = (id) => store.get("saved", []).includes(id);

/* ---------------- Cards ---------------- */

function card(r) {
  const total = r.prep + r.cook + r.rest;
  const saved = isSaved(r.id);
  const bm = `<button type="button" class="bookmark" data-save="${r.id}" aria-pressed="${saved}" aria-label="${saved ? "Remove from saved" : "Save recipe"}">${ICON.bookmark}</button>`;
  // Photo is optional: with one, a photo card; without, a text tile the same size.
  const tile = `<div class="card-tile"><span class="kicker">${esc([r.cuisine, r.category].filter(Boolean).join(" · "))}</span><h3>${esc(r.title)}</h3></div>`;
  const top = r.image ? `<div class="card-img"><img src="${esc(r.image)}" alt="" loading="lazy" onerror="imgFail(this)"></div>` : tile;
  return `
    <article class="card${r.image ? "" : " text-card"}">
      ${top}
      <div class="card-meta">
        <div><h3><a class="stretch" href="#r-${r.id}">${esc(r.title)}</a></h3><div class="time num">${total ? fmtMin(total) + " total" : ""}</div></div>
        ${bm}
      </div>
    </article>`;
}

// A photo that fails to load is swapped for the text tile, so nothing looks broken.
window.imgFail = (img) => {
  const r = state.data.recipes.find((x) => img.closest(".card")?.querySelector("[data-save]")?.dataset.save === x.id);
  const box = img.parentNode;
  box.outerHTML = r ? `<div class="card-tile"><span class="kicker">${esc(r.cuisine)}</span><h3>${esc(r.title)}</h3></div>` : "";
};

function row(title, list, seeHref, id) {
  return `
    <section class="row">
      <div class="row-head">
        <h2>${esc(title)}</h2>
        ${seeHref ? `<a class="see" href="${seeHref}">See all ${list.length}</a>` : ""}
        <div class="arrows">
          <button type="button" class="arrow" data-scroll="${id}" data-dir="-1" aria-label="Scroll ${esc(title)} left">${ICON.left}</button>
          <button type="button" class="arrow" data-scroll="${id}" data-dir="1" aria-label="Scroll ${esc(title)} right">${ICON.right}</button>
        </div>
      </div>
      <div class="track" id="${id}">${list.map(card).join("")}</div>
    </section>`;
}

/* ---------------- Home & lists ---------------- */

function matches(r, q) {
  if (!q) return true;
  const hay = [r.title, r.cuisine, r.category, r.description, r.tags.join(" "), r.ingredients.map((i) => i.name).join(" ")].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function setNav(which) {
  document.querySelectorAll(".nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === which ? "page" : "false"));
}

function renderHome() {
  document.title = SITE_NAME;
  setNav("home");
  const q = $("#q").value.trim();
  const { cuisines, recipes } = state.data;
  if (q) {
    const found = recipes.filter((r) => matches(r, q));
    $("#app").innerHTML = `<div class="wrap">
      <header class="page-title"><h1>Results for “${esc(q)}”</h1><p>${found.length} recipe${found.length === 1 ? "" : "s"}</p></header>
      ${found.length ? `<div class="grid">${found.map(card).join("")}</div>` : `<p class="empty">Nothing matches. Try an ingredient, like “corn”, or a cuisine.</p>`}
    </div>`;
    return;
  }
  const names = cuisines.map((c) => c.name);
  $("#app").innerHTML = `<div class="wrap">
    <header class="hero">
      <h1>Cook it for one, or for a crowd.</h1>
      <p>Every recipe scales and converts, from grams to cups${names.length ? `, from <em>${esc(names[0])}</em>${names.length > 1 ? ` to <em>${esc(names[names.length - 1])}</em>` : ""}` : ""}.</p>
    </header>
    ${cuisines.map((c, i) => {
      const list = recipes.filter((r) => r.cuisineSlug === c.slug);
      return list.length ? row(c.name, list, `#c-${c.slug}`, `row-${i}`) : "";
    }).join("")}
  </div>`;
}

function renderCuisine(cs) {
  const c = state.data.cuisines.find((x) => x.slug === cs);
  if (!c) { location.hash = ""; return; }
  document.title = `${c.name} recipes · ${SITE_NAME}`;
  setNav("");
  const list = state.data.recipes.filter((r) => r.cuisineSlug === cs);
  $("#app").innerHTML = `<div class="wrap">
    <header class="page-title"><nav class="crumbs" aria-label="Breadcrumb"><a href="#">Home</a><span>›</span><span>${esc(c.name)}</span></nav><h1>${esc(c.name)}</h1>${c.description ? `<p>${esc(c.description)}</p>` : ""}</header>
    <div class="grid" style="padding:18px 0 60px">${list.map(card).join("")}</div>
  </div>`;
}

function renderSaved() {
  document.title = `Saved · ${SITE_NAME}`;
  setNav("saved");
  const saved = store.get("saved", []);
  const list = state.data.recipes.filter((r) => saved.includes(r.id));
  $("#app").innerHTML = `<div class="wrap">
    <header class="page-title"><h1>Saved recipes</h1><p>Kept on this device.</p></header>
    ${list.length ? `<div class="grid" style="padding:18px 0 60px">${list.map(card).join("")}</div>` : `<p class="empty">Nothing saved yet. Tap the bookmark on any recipe to keep it here.</p>`}
  </div>`;
}

/* ---------------- Recipe ---------------- */

function findIng(r, ref) {
  const key = slug(ref);
  return r.ingredients.find((i) => i.id === key) || r.ingredients.find((i) => i.id.startsWith(key)) || r.ingredients.find((i) => i.id.includes(key));
}
function qtyText(ing, factor) {
  const q = Units.formatQuantity(ing, factor, state.units);
  if (!q) return "";
  return `${q.approx ? `<span class="approx" title="Approximate conversion">≈</span>` : ""}${esc(q.qty)}${q.unit ? " " + esc(q.unit) : ""}`;
}
function stepHTML(text, r, factor) {
  let h = esc(text);
  h = h.replace(/(\d{2,3})\s*°\s*([CF])\b/g, (m, n, u) => {
    n = +n;
    const v = state.temp === u ? n : u === "C" ? Units.toF(n) : Units.toC(n);
    return `<span class="temp">${v}°${state.temp}</span>`;
  });
  h = h.replace(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi, (m, a, b, u) => {
    const mult = /^s/i.test(u) ? 1 : /^m/i.test(u) ? 60 : 3600;
    const secs = Math.round(parseFloat(a) * mult);
    return `<button type="button" class="timer-btn" data-secs="${secs}" data-label="${esc(m)}" title="Start a ${esc(m)} timer">${ICON.clock}${esc(m)}</button>`;
  });
  h = h.replace(/\{([^}]+)\}/g, (m, ref) => {
    const ing = findIng(r, ref);
    if (!ing) return esc(ref);
    const q = qtyText(ing, factor);
    return q ? `<span class="inline-qty">${q}</span> ${esc(ing.name)}` : esc(ing.name);
  });
  return h;
}
function stepRefs(text, r) {
  const seen = new Set();
  return (text.match(/\{([^}]+)\}/g) || []).map((m) => findIng(r, m.slice(1, -1))).filter((i) => i && !seen.has(i.id) && seen.add(i.id));
}
function chipsHTML(refs, factor) {
  return refs.length ? `<div class="chips">${refs.map((ing) => { const q = qtyText(ing, factor); return `<span class="chip"><span>${esc(ing.name)}</span>${q ? `<span class="q">${q}</span>` : ""}</span>`; }).join("")}</div>` : "";
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
function relatedTo(r) {
  const score = (x) => (x.cuisineSlug === r.cuisineSlug ? 2 : 0) + (x.category && x.category === r.category ? 1 : 0);
  return state.data.recipes.filter((x) => x.id !== r.id).sort((a, b) => score(b) - score(a)).slice(0, 4);
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
  setNav("");
  document.title = `${r.title} · ${SITE_NAME}`;
  const byline = [
    r.author ? `By ${esc(r.author)}` : "",
    r.source ? (r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Original recipe: ${esc(r.source)}</a>` : `Original recipe: ${esc(r.source)}`) : "",
  ].filter(Boolean).join(" · ");
  const related = relatedTo(r);

  $("#app").innerHTML = `<div class="wrap">
    <article class="recipe ${r.image ? "has-img" : ""}">
      ${r.image ? `<div class="r-media"><img src="${esc(r.image)}" alt="${esc(r.title)}" onerror="this.parentNode.parentNode.classList.remove('has-img');this.parentNode.remove()"></div>` : ""}
      <div class="r-main">
        <header class="r-head">
          <nav class="crumbs" aria-label="Breadcrumb"><a href="#">Home</a><span>›</span><a href="#c-${r.cuisineSlug}">${esc(r.cuisine)}</a>${r.category ? `<span>›</span><span>${esc(r.category)}</span>` : ""}</nav>
          <h1>${esc(r.title)}</h1>
          ${byline ? `<p class="byline">${byline}</p>` : ""}
          ${r.description ? `<p class="lede">${esc(r.description)}</p>` : ""}
          ${r.tags.length ? `<div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
        </header>

        <section aria-labelledby="ing-h">
          <div class="sec-head"><h2 id="ing-h">Ingredients</h2><span class="muted" id="ing-for"></span>
            <div class="links"><button type="button" class="linkbtn" id="copy-list">Copy list</button><button type="button" class="linkbtn" id="print">Print</button><button type="button" class="linkbtn" id="clear">Clear ticks</button></div>
          </div>
          <div id="ing"></div>
          <p class="conv-hint" id="conv-hint"></p>
        </section>

        <section aria-labelledby="det-h">
          <div class="sec-head"><h2 id="det-h">Details</h2></div>
          <dl class="details">
            ${r.level ? `<div><dt>Skill level</dt><dd>${esc(r.level)}</dd></div>` : ""}
            ${r.prep ? `<div><dt>Prep time</dt><dd>${fmtMin(r.prep)}</dd></div>` : ""}
            ${r.cook ? `<div><dt>Cook time</dt><dd>${fmtMin(r.cook)}</dd></div>` : ""}
            ${r.rest ? `<div><dt>Resting</dt><dd>${fmtMin(r.rest)}</dd></div>` : ""}
            ${r.prep + r.cook + r.rest ? `<div><dt>Total time</dt><dd>${fmtMin(r.prep + r.cook + r.rest)}</dd></div>` : ""}
            <div><dt>Servings</dt><dd id="det-serves"></dd></div>
            ${r.yield ? `<div><dt>Makes</dt><dd>${esc(r.yield)}</dd></div>` : ""}
            ${r.nutrition.map((n) => { const m = n.match(/^([\d.,]+\s*\S*)\s+(.+)$/); return m ? `<div><dt>${esc(m[2])}</dt><dd>${esc(m[1])}</dd></div>` : `<div><dt>Nutrition</dt><dd>${esc(n)}</dd></div>`; }).join("")}
          </dl>
          ${r.nutrition.length ? `<p class="conv-hint">Nutrition is per serving.</p>` : ""}
        </section>

        ${r.story.map((sec) => `<section class="story"><h2>${esc(sec.title)}</h2>${storyHTML(sec.lines)}</section>`).join("")}

        <section aria-labelledby="steps-h">
          <div class="sec-head"><h2 id="steps-h">Directions</h2><span class="muted">Tap a number to mark the step done</span></div>
          <ol class="steps" id="steps"></ol>
        </section>

        ${r.notes.length ? `<aside class="notes"><h2>Chef's notes</h2><ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></aside>` : ""}

        ${related.length ? `<section class="related"><div class="sec-head"><h2>You might also like</h2></div><div class="grid">${related.map(card).join("")}</div></section>` : ""}
      </div>
    </article>
  </div>

  <p class="scale-note" id="scale-note" hidden></p>
  <div class="dock" role="toolbar" aria-label="Cooking controls">
    <div class="serves">
      <button type="button" id="less" aria-label="Fewer servings">−</button>
      <label for="servings">Cooking for <input id="servings" type="number" inputmode="decimal" min="${r.servesStep}" step="${r.servesStep}"><span id="serves-unit"></span></label>
      <button type="button" id="more" aria-label="More servings">+</button>
    </div>
    <span class="sep"></span>
    <div class="seg" id="units" aria-label="Units"><button type="button" data-v="metric">g · ml</button><button type="button" data-v="us">cups · tbsp</button></div>
    <div class="seg" id="temp" aria-label="Oven temperature"><button type="button" data-v="C">°C</button><button type="button" data-v="F">°F</button></div>
    <span class="sep"></span>
    <button type="button" class="pill" id="wake" aria-pressed="false" title="Keep the screen from turning off">☀ Awake</button>
    <button type="button" class="pill" id="save" aria-pressed="false"></button>
    <button type="button" class="pill cook-btn" id="cook-start">Cook</button>
  </div>`;

  $("#servings").addEventListener("change", (e) => setServings(parseFloat(e.target.value)));
  $("#less").onclick = () => setServings(state.servings - r.servesStep);
  $("#more").onclick = () => setServings(state.servings + r.servesStep);
  $("#units").onclick = (e) => { const v = e.target.closest("button")?.dataset.v; if (v) { state.units = v; store.set("units", v); refresh(); } };
  $("#temp").onclick = (e) => { const v = e.target.closest("button")?.dataset.v; if (v) { state.temp = v; store.set("temp", v); refresh(); } };
  $("#wake").onclick = toggleWake;
  $("#wake").setAttribute("aria-pressed", state.wantWake);
  $("#save").onclick = () => { toggleList("saved", r.id); paintSave(); };
  $("#print").onclick = () => { try { window.print(); } catch { toast("Printing isn't available here"); } };
  $("#cook-start").onclick = () => openCook(firstOpenStep());
  $("#clear").onclick = () => { state.checkedIng.clear(); state.doneSteps.clear(); saveTicks(); refresh(); };
  $("#copy-list").onclick = copyList;
  $("#ing").addEventListener("change", (e) => {
    const i = e.target.dataset.i; if (i == null) return;
    e.target.checked ? state.checkedIng.add(+i) : state.checkedIng.delete(+i);
    saveTicks(); e.target.closest(".ing-tile").classList.toggle("checked", e.target.checked);
  });
  $("#steps").addEventListener("click", (e) => {
    const b = e.target.closest(".step-no"); if (!b) return;
    const i = +b.dataset.s;
    state.doneSteps.has(i) ? state.doneSteps.delete(i) : state.doneSteps.add(i);
    saveTicks();
    const on = state.doneSteps.has(i);
    b.closest("li").classList.toggle("done", on); b.setAttribute("aria-pressed", on);
  });
  paintSave();
  window.scrollTo(0, 0);
  refresh();
}

function paintSave() {
  const b = $("#save"); if (!b || !state.recipe) return;
  const on = isSaved(state.recipe.id);
  b.setAttribute("aria-pressed", on);
  b.innerHTML = `${ICON.bookmark}${on ? "Saved" : "Save"}`;
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
  if (!r || !$("#servings")) return;
  const factor = state.servings / r.serves;
  const servesLabel = `${state.servings} ${plural(r.servesLabel, state.servings)}`;
  $("#servings").value = state.servings;
  $("#serves-unit").textContent = plural(r.servesLabel, state.servings);
  $("#ing-for").textContent = `for ${servesLabel}`;
  $("#det-serves").textContent = servesLabel;
  $("#units").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === state.units));
  $("#temp").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === state.temp));

  const note = $("#scale-note");
  note.hidden = factor === 1;
  note.innerHTML = factor === 1 ? "" : `Scaled ×${+factor.toFixed(2)}. Times and pan sizes may need adjusting. <button type="button" class="linkbtn" id="reset-serves">Reset</button>`;
  if (factor !== 1) $("#reset-serves").onclick = () => setServings(r.serves);

  // Ingredient tiles, grouped
  let html = "", group, open = false, noVol = false, approx = false;
  r.ingredients.forEach((ing, i) => {
    if (!open || ing.group !== group) {
      if (open) html += `</div>`;
      if (ing.group) html += `<h3 class="ing-group">${esc(ing.group)}</h3>`;
      html += `<div class="ing-grid">`; open = true; group = ing.group;
    }
    const q = Units.formatQuantity(ing, factor, state.units);
    if (q?.noVolume) noVol = true;
    if (q?.approx) approx = true;
    const checked = state.checkedIng.has(i);
    html += `<label class="ing-tile ${checked ? "checked" : ""}">
      <input type="checkbox" data-i="${i}" ${checked ? "checked" : ""}>
      <span class="tick" aria-hidden="true"></span>
      <span class="qty">${qtyText(ing, factor)}</span>
      <span class="nm">${esc(ing.name)}</span>
      ${ing.note ? `<span class="note">${esc(ing.note)}</span>` : ""}
    </label>`;
  });
  if (open) html += `</div>`;
  $("#ing").innerHTML = html;
  $("#conv-hint").textContent = [
    approx ? "≈ amounts are converted by the ingredient's typical weight. For baking, weigh where you can." : "",
    noVol ? "Some ingredients stay in grams because there's no reliable spoon measure for them." : "",
  ].filter(Boolean).join(" ");

  // Directions
  $("#steps").innerHTML = r.steps.map((s, i) => {
    const done = state.doneSteps.has(i);
    return `<li class="${done ? "done" : ""}">
      <button type="button" class="step-no" data-s="${i}" aria-pressed="${done}" aria-label="Step ${i + 1}, mark done">${String(i + 1).padStart(2, "0")}</button>
      <div class="step-body">
        <p class="step-text">${stepHTML(s.text, r, factor)}</p>
        ${chipsHTML(stepRefs(s.text, r), factor)}
        ${s.tip ? `<p class="tip">Tip: ${esc(s.tip)}</p>` : ""}
      </div>
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
  $("#wake")?.setAttribute("aria-pressed", state.wantWake);
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
  $("#timers").innerHTML = state.timers.map((t) => `<div class="timer ${t.ringing ? "ring" : ""}" role="timer">
      <div style="flex:1"><div class="t-time">${t.ringing ? "Done" : clock(t.end - Date.now())}</div><div class="t-label">${esc(t.label)}</div></div>
      ${t.ringing ? "" : `<button type="button" data-add="${t.id}">+1 min</button>`}
      <button type="button" data-stop="${t.id}">${t.ringing ? "Stop" : "Cancel"}</button>
    </div>`).join("");
}
setInterval(() => {
  if (!state.timers.length) return;
  state.timers.forEach((t) => { if (Date.now() >= t.end) { t.ringing = true; beep(); } });
  renderTimers();
}, 1000);

/* ---------------- Shared clicks ---------------- */

document.addEventListener("click", (e) => {
  const tb = e.target.closest(".timer-btn");
  if (tb) { startTimer(+tb.dataset.secs, `${state.recipe?.title || ""}: ${tb.dataset.label}`); return; }
  const add = e.target.closest("[data-add]");
  if (add) { const t = state.timers.find((x) => String(x.id) === add.dataset.add); if (t) t.end += 60000; renderTimers(); return; }
  const stop = e.target.closest("[data-stop]");
  if (stop) { state.timers = state.timers.filter((x) => String(x.id) !== stop.dataset.stop); renderTimers(); return; }
  const save = e.target.closest("[data-save]");
  if (save) {
    const on = toggleList("saved", save.dataset.save);
    document.querySelectorAll(`[data-save="${save.dataset.save}"]`).forEach((b) => { b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? "Remove from saved" : "Save recipe"); });
    if (location.hash === "#saved") renderSaved();
    paintSave();
    return;
  }
  const arrow = e.target.closest("[data-scroll]");
  if (arrow) { const t = document.getElementById(arrow.dataset.scroll); t?.scrollBy({ left: +arrow.dataset.dir * t.clientWidth * 0.8, behavior: reduceMotion() ? "auto" : "smooth" }); }
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
  $("#cook-no").textContent = `Step ${String(i + 1).padStart(2, "0")} of ${n}`;
  $("#cook-text").innerHTML = stepHTML(step.text, r, factor);
  $("#cook-uses").innerHTML = chipsHTML(stepRefs(step.text, r), factor) + (step.tip ? `<p class="tip">Tip: ${esc(step.tip)}</p>` : "");
  $("#cook-prev").disabled = i === 0;
  $("#cook-next").textContent = i === n - 1 ? "Finish" : "Next step";
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
  if (h.startsWith("c-")) renderCuisine(h.slice(2));
  else if (h === "saved") renderSaved();
  else renderHome();
  window.scrollTo(0, 0);
}

$("#q").addEventListener("input", () => {
  if (location.hash) { history.replaceState(null, "", location.pathname); state.recipe = null; }
  renderHome();
});
$(".brand").innerHTML = `<span class="brand-mark" aria-hidden="true">✦</span>${esc(SITE_NAME)}`;
$("#foot-name").textContent = SITE_NAME;
window.addEventListener("hashchange", route);

fetch("recipes/index.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => { state.data = d; route(); })
  .catch(() => {
    $("#app").innerHTML = `<div class="wrap empty">Couldn't load the recipes (recipes/index.json). If you're opening the file directly from your computer, run a local server instead; on GitHub, check the Actions tab for a failed build.</div>`;
  });

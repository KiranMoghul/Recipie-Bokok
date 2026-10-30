#!/usr/bin/env node
// Reads every recipes/<cuisine>/<recipe>.md file and writes recipes/index.json,
// which the website loads. Runs automatically on GitHub (see .github/workflows).
// Run locally with:  node scripts/build-index.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RECIPES = path.join(ROOT, "recipes");

const UNITS = {
  g: "g", gr: "g", gram: "g", grams: "g", grm: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  mg: "mg",
  ml: "ml", millilitre: "ml", milliliter: "ml", millilitres: "ml", milliliters: "ml",
  l: "l", lt: "l", ltr: "l", litre: "l", liter: "l", litres: "l", liters: "l",
  dl: "dl", cl: "cl",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp",
  cup: "cup", cups: "cup",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  "fl oz": "fl oz",
  pinch: "pinch", pinches: "pinch",
};

const errors = [];

function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function titleCase(s) {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseMinutes(s) {
  if (!s) return 0;
  let total = 0;
  const str = String(s).toLowerCase();
  const h = str.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  const m = str.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/);
  const d = str.match(/(\d+(?:\.\d+)?)\s*(d|day|days)\b/);
  if (d) total += parseFloat(d[1]) * 1440;
  if (h) total += parseFloat(h[1]) * 60;
  if (m) total += parseFloat(m[1]);
  if (!d && !h && !m && /^\d+(\.\d+)?$/.test(str.trim())) total = parseFloat(str);
  return Math.round(total);
}

const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

// "1", "1.5", "1,5", "1/2", "1 1/2", "1½", "2-3"
function parseAmount(str) {
  const m = str.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*/);
  if (!m) return null;
  const toNum = (t) => {
    t = t.trim();
    if (/^\d+\s+\d+\/\d+$/.test(t)) { const [w, f] = t.split(/\s+/); const [a, b] = f.split("/"); return +w + a / b; }
    if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split("/"); return a / b; }
    const fr = t.match(/^(\d*)([½¼¾⅓⅔⅛])$/);
    if (fr) return (fr[1] ? +fr[1] : 0) + FRACTIONS[fr[2]];
    return parseFloat(t.replace(",", "."));
  };
  return { amount: toNum(m[1]), amountMax: m[2] ? toNum(m[2]) : null, rest: str.slice(m[0].length) };
}

function parseIngredient(line, group, file) {
  let text = line.replace(/^[-*]\s+/, "").trim();
  const ing = { name: text, amount: null, unit: null, note: null, group };
  const a = parseAmount(text);
  if (a) {
    ing.amount = a.amount;
    if (a.amountMax) ing.amountMax = a.amountMax;
    let rest = a.rest;
    const um = rest.match(/^(fl\s*oz|[a-zA-Z]+)\.?(\s+(of\s+)?|$)/);
    if (um && UNITS[um[1].toLowerCase().replace(/\s+/, " ")]) {
      ing.unit = UNITS[um[1].toLowerCase().replace(/\s+/, " ")];
      rest = rest.slice(um[0].length);
    }
    ing.name = rest.trim();
  }
  // Text after the last comma is a note ("onion, finely chopped")
  const c = ing.name.lastIndexOf(",");
  if (c > 0) { ing.note = ing.name.slice(c + 1).trim(); ing.name = ing.name.slice(0, c).trim(); }
  if (!ing.name) errors.push(`${file}: could not read ingredient "${line}"`);
  ing.id = slug(ing.name);
  return ing;
}

function parseRecipe(file, cuisineSlug) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const rel = path.relative(ROOT, file);
  if (!fm) { errors.push(`${rel}: missing the --- details block at the top`); return null; }
  const meta = {};
  fm[1].split("\n").forEach((l) => {
    const m = l.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  });
  const body = raw.slice(fm[0].length);

  const sections = {};
  const titles = {};
  const order = [];
  let current = null, group = null;
  body.split("\n").forEach((line) => {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h2) {
      current = h2[1].toLowerCase();
      if (!sections[current]) { sections[current] = []; titles[current] = h2[1]; order.push(current); }
      group = null; return;
    }
    if (!current) return;
    if (h3) { group = h3[1]; return; }
    if (line.trim()) sections[current].push({ line: line.trim(), group });
  });

  const ingKey = Object.keys(sections).find((k) => k.startsWith("ingredient"));
  const stepKey = Object.keys(sections).find((k) => /^(steps|method|preparation|instructions|directions)/.test(k));
  const noteKey = Object.keys(sections).find((k) => /^(notes|tips|chef)/.test(k));

  if (!meta.title) errors.push(`${rel}: missing "title:"`);
  if (!ingKey) errors.push(`${rel}: missing "## Ingredients" section`);
  if (!stepKey) errors.push(`${rel}: missing "## Steps" section`);

  const ingredients = (sections[ingKey] || [])
    .filter((x) => /^[-*]\s+/.test(x.line))
    .map((x) => parseIngredient(x.line, x.group, rel));

  // A line starting with ">" right after a step is that step's tip:
  //   > Tip: Don't crowd the pan.
  const steps = [];
  (sections[stepKey] || []).forEach((x) => {
    if (/^>/.test(x.line)) {
      const tip = x.line.replace(/^>\s*(tip\s*:\s*)?/i, "");
      if (steps.length) steps[steps.length - 1].tip = tip;
      else errors.push(`${rel}: tip "${tip}" comes before the first step`);
      return;
    }
    steps.push({ text: x.line.replace(/^(\d+[.)]|[-*])\s+/, ""), group: x.group, tip: "" });
  });

  const notes = (sections[noteKey] || []).map((x) => x.line.replace(/^[-*]\s+/, ""));

  // Any other "## Heading" sections (About this recipe, Make ahead & storage...)
  // are shown as text above the recipe, in the order they're written.
  const story = order
    .filter((k) => k !== ingKey && k !== stepKey && k !== noteKey)
    .map((k) => ({ title: titles[k], lines: sections[k].map((x) => x.line) }));

  // A photo with the same name as the recipe file is picked up automatically:
  // recipes/mexican/nixtamal.jpg goes with recipes/mexican/nixtamal.md
  let image = meta.image || "";
  if (image && !/^(https?:)?\/\//.test(image)) image = path.posix.join("recipes", path.basename(path.dirname(file)), image);
  if (!image) {
    const base = file.replace(/\.md$/, "");
    const ext = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"].find((e) => fs.existsSync(`${base}.${e}`));
    if (ext) image = path.relative(ROOT, `${base}.${ext}`).split(path.sep).join("/");
  }

  // Check {ingredient} references in steps
  steps.forEach((s) => {
    (s.text.match(/\{([^}]+)\}/g) || []).forEach((ref) => {
      const key = slug(ref.slice(1, -1));
      if (!ingredients.some((i) => i.id === key || i.id.startsWith(key) || i.id.includes(key)))
        errors.push(`${rel}: step mentions ${ref} but no ingredient matches it`);
    });
  });

  const serves = parseFloat(meta.serves || meta.servings || "4");
  return {
    id: `${cuisineSlug}-${slug(path.basename(file, ".md"))}`,
    cuisine: meta.cuisine || titleCase(cuisineSlug),
    cuisineSlug,
    title: meta.title || titleCase(path.basename(file, ".md")),
    category: meta.category || "",
    level: meta.level || meta.difficulty || "",
    prep: parseMinutes(meta.prep),
    cook: parseMinutes(meta.cook),
    rest: parseMinutes(meta.rest),
    serves: isNaN(serves) ? 4 : serves,
    servesLabel: meta["serves-label"] || "people",
    servesStep: parseFloat(meta["serves-step"] || "1") || 1,
    yield: meta.yield || "",
    tags: (meta.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    description: meta.description || "",
    image,
    author: meta.author || "",
    nutrition: (meta.nutrition || "").split(",").map((t) => t.trim()).filter(Boolean),
    story,
    source: meta.source || "",
    sourceUrl: meta["source-url"] || "",
    ingredients,
    steps,
    notes,
  };
}

const cuisines = [];
const recipes = [];

fs.readdirSync(RECIPES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((dir) => {
    const cuisineSlug = slug(dir.name);
    const folder = path.join(RECIPES, dir.name);
    let info = { slug: cuisineSlug, name: titleCase(dir.name), description: "" };
    const infoFile = path.join(folder, "_cuisine.md");
    if (fs.existsSync(infoFile)) {
      const txt = fs.readFileSync(infoFile, "utf8").trim();
      const nm = txt.match(/^#\s+(.+)$/m);
      if (nm) info.name = nm[1].trim();
      info.description = txt.replace(/^#\s+.+$/m, "").trim();
    }
    const files = fs.readdirSync(folder).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
    files.forEach((f) => {
      const r = parseRecipe(path.join(folder, f), cuisineSlug);
      if (r) { r.cuisine = info.name; recipes.push(r); }
    });
    if (files.length) cuisines.push(info);
  });

if (errors.length) {
  console.error("Problems found in recipe files:\n - " + errors.join("\n - "));
  process.exit(1);
}

recipes.sort((a, b) => a.title.localeCompare(b.title));
fs.writeFileSync(
  path.join(RECIPES, "index.json"),
  JSON.stringify({ generated: new Date().toISOString(), cuisines, recipes }, null, 2)
);
console.log(`Built recipes/index.json: ${recipes.length} recipe(s) in ${cuisines.length} cuisine(s).`);

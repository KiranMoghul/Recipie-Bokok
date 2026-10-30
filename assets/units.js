// Unit conversion and quantity formatting.
// Grams <-> cups/spoons needs to know how heavy each ingredient is per ml.
// Add rows to DENSITY to teach the site new ingredients (first match wins).
// [pattern matched against the ingredient name, grams per ml, is it a liquid?]

const DENSITY = [
  [/corn ?starch|cornflour|corn flour/, 0.54, false],
  [/masa harina/, 0.5, false],
  [/\bcal\b|slaked lime|pickling lime|calcium hydroxide/, 0.5, false],
  [/\bcorn\b|maize|hominy/, 0.75, false],
  [/water|stock|broth/, 1.0, true],
  [/milk/, 1.03, true],
  [/cream/, 1.0, true],
  [/yogh?urt|curd|dahi/, 1.03, false],
  [/oil/, 0.92, true],
  [/vinegar/, 1.01, true],
  [/juice/, 1.04, true],
  [/wine|beer|rum|brandy|vodka|tequila/, 0.99, true],
  [/honey/, 1.42, true],
  [/syrup|molasses|treacle/, 1.37, true],
  [/soy sauce|fish sauce/, 1.15, true],
  [/butter|ghee/, 0.96, false],
  [/icing sugar|powdered sugar|confectioners/, 0.5, false],
  [/brown sugar/, 0.93, false],
  [/sugar/, 0.85, false],
  [/baking soda|bicarbonate/, 0.92, false],
  [/baking powder/, 0.9, false],
  [/salt/, 1.2, false],
  [/cocoa/, 0.42, false],
  [/oats/, 0.38, false],
  [/semolina|suji/, 0.7, false],
  [/flour|maida|atta|besan/, 0.53, false],
  [/rice/, 0.85, false],
  [/lentil|dal|daal/, 0.8, false],
  [/breadcrumb/, 0.45, false],
  [/parmesan|grated cheese/, 0.4, false],
  [/yeast/, 0.6, false],
  [/gelatin/, 0.6, false],
  [/pepper|cumin|coriander|paprika|chil+i powder|turmeric|cinnamon|garam masala|spice|ground/, 0.5, false],
  [/jam|ketchup|paste|puree|purée/, 1.1, false],
  [/mayonnaise|mayo/, 0.95, false],
];

const MASS = { mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOL = { ml: 1, cl: 10, dl: 100, l: 1000, tsp: 4.929, tbsp: 14.787, cup: 240, "fl oz": 29.574 };

function densityFor(ing) {
  if (ing.density) return { g: ing.density, liquid: false };
  const name = ing.name.toLowerCase();
  for (const [re, g, liquid] of DENSITY) if (re.test(name)) return { g, liquid };
  return null;
}

const GLYPH = { "0.125": "⅛", "0.25": "¼", "0.333": "⅓", "0.5": "½", "0.667": "⅔", "0.75": "¾" };

function nice(x, parts) {
  const whole = Math.floor(x + 1e-9);
  const rem = x - whole;
  let best = 0, bestD = rem;
  for (const p of parts.concat([1])) {
    const d = Math.abs(rem - p);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best === 1) return String(whole + 1);
  if (best === 0) return whole === 0 ? GLYPH[parts[0].toFixed(3).replace(/0+$/, "")] || "0" : String(whole);
  const g = GLYPH[best.toFixed(3).replace(/0+$/, "")] || "";
  return (whole ? whole : "") + g;
}

function trim(n, dp) { return String(+n.toFixed(dp)); }

function metricMass(g) {
  if (g >= 1000) return { qty: trim(g / 1000, 2), unit: "kg" };
  if (g >= 100) return { qty: String(Math.round(g / 5) * 5), unit: "g" };
  if (g >= 10) return { qty: String(Math.round(g)), unit: "g" };
  if (g >= 1) return { qty: trim(Math.round(g * 2) / 2, 1), unit: "g" };
  return { qty: trim(g, 2), unit: "g" };
}

function metricVol(ml) {
  if (ml >= 1000) return { qty: trim(ml / 1000, 2), unit: "l" };
  if (ml >= 100) return { qty: String(Math.round(ml / 5) * 5), unit: "ml" };
  if (ml >= 1) return { qty: String(Math.round(ml)), unit: "ml" };
  return { qty: trim(ml, 1), unit: "ml" };
}

function spoons(ml) {
  if (ml < 0.45) return { qty: "1", unit: "pinch" };
  const tsp = ml / VOL.tsp;
  if (tsp < 2.85) return { qty: nice(tsp, [0.125, 0.25, 0.5, 0.75]), unit: "tsp" };
  const tbsp = ml / VOL.tbsp;
  if (tbsp < 3.75) return { qty: nice(tbsp, [0.5]), unit: "tbsp" };
  const cups = ml / VOL.cup;
  if (cups >= 10) return { qty: nice(cups, [0.5]), unit: "cups" };
  const q = nice(cups, [0.25, 0.333, 0.5, 0.667, 0.75]);
  return { qty: q, unit: cups > 1.1 ? "cups" : "cup" };
}

// Returns { qty, unit, approx } for one amount, or null when there's no amount.
function convertOne(ing, amount, system) {
  const unit = ing.unit;
  if (!unit) return { qty: nice(amount, [0.25, 0.333, 0.5, 0.667, 0.75]), unit: "" };
  if (unit === "pinch") return { qty: nice(amount, [0.5]), unit: amount > 1 ? "pinches" : "pinch" };
  const d = densityFor(ing);
  if (MASS[unit]) {
    const g = amount * MASS[unit];
    if (system === "metric") return metricMass(g);
    if (d) return Object.assign(spoons(g / d.g), { approx: !(d.liquid && d.g === 1) });
    return Object.assign(metricMass(g), { noVolume: true });
  }
  if (VOL[unit]) {
    const ml = amount * VOL[unit];
    if (system === "us") return spoons(ml);
    if (d && !d.liquid) return Object.assign(metricMass(ml * d.g), { approx: true });
    return metricVol(ml);
  }
  return { qty: trim(amount, 2), unit };
}

function formatQuantity(ing, factor, system) {
  if (ing.amount == null) return null;
  const a = convertOne(ing, ing.amount * factor, system);
  if (ing.amountMax) {
    const b = convertOne(ing, ing.amountMax * factor, system);
    if (a.unit === b.unit) return Object.assign({}, b, { qty: `${a.qty}–${b.qty}` });
    return Object.assign({}, b, { qty: `${a.qty} ${a.unit} – ${b.qty}` });
  }
  return a;
}

function toF(c) { return Math.round((c * 9) / 5 + 32); }
function toC(f) { return Math.round(((f - 32) * 5) / 9); }

window.Units = { formatQuantity, densityFor, toF, toC };

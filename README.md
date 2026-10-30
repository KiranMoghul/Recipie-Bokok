# Recipe Book

A recipe website sorted by cuisine. Every recipe can be scaled to any number of
people, switched between grams/ml and cups/spoons, and cooked step by step with
built-in timers.

## Adding a recipe

1. Copy `recipes/_TEMPLATE.md` and fill it in. Save it as a `.md` file.
2. On GitHub, open the cuisine folder, for example `recipes/mexican/`.
   For a new cuisine, type a new folder name when uploading,
   e.g. `recipes/italian/carbonara.md`.
3. Click **Add file → Upload files**, drop the file in, and click **Commit changes**.
4. Wait about a minute. The recipe appears on the site under its cuisine.

If it doesn't appear, open the **Actions** tab. A red ✗ means a recipe file has a mistake, and the log says which file and what to fix.

## How to write a recipe file

**Details block (between the `---` lines)**

| Line | Example | Notes |
|---|---|---|
| `title:` | `Chicken Karahi` | Required |
| `cuisine:` | `Pakistani` | Shown name; the folder decides the section |
| `category:` | `Mains` | Starters, Mains, Desserts, Drinks… |
| `level:` | `Beginner` | |
| `prep:` `cook:` `rest:` | `20 min`, `1 h 30 min`, `8 h` | Leave blank if none |
| `serves:` | `4` | The number of people the amounts are for |
| `serves-label:` | `people` | Or `batch`, `pieces`, `glasses`… |
| `serves-step:` | `0.5` | Optional. How much + and − change it (default 1) |
| `yield:` | `12 tortillas` | Optional |
| `tags:` | `vegan, spicy` | Comma separated |
| `description:` | one or two sentences | |
| `source:` `source-url:` | credit for the recipe | Optional |
| `image:` | `images/karahi.jpg` | Optional, not shown yet |

**Ingredients**: one per line, starting with `- `, as *amount unit name, note*:

```
- 500 g chicken, cut into pieces
- 2 tbsp ginger garlic paste
- 1/2 tsp salt
- 1 1/2 cups water
- 2-3 green chillies
- 3 eggs
- salt, to taste
```

Units the site understands: g, kg, mg, ml, l, tsp, tbsp, cup, oz, lb, fl oz, pinch.
Anything after the last comma becomes a small note. Use `### Heading` lines to split
ingredients into groups (e.g. "For the marinade").

**Steps**: numbered lines. Put an ingredient name in `{curly brackets}` and the step
shows the scaled amount, e.g. `Add the {water}` becomes "Add the 375 ml water".
Times like `10 minutes` or `1 hour` turn into tap-to-start timers automatically, and
`180°C` switches to °F when the reader chooses it.

**Notes**: optional `- ` lines for tips.

## Grams ↔ cups

Converting weight to spoons needs each ingredient's weight per spoon. The table is at the
top of `assets/units.js`. If an ingredient stays in grams in "Cups & spoons" mode,
add a line for it there. Converted amounts are marked ≈.

## Setting up GitHub Pages (once)

1. Create a new repository on GitHub and upload all these files (keep the folders).
2. Go to **Settings → Pages**, and under *Build and deployment → Source* choose **GitHub Actions**.
3. Open the **Actions** tab and wait for the green ✓. The site link appears in Settings → Pages.

## Previewing on your computer

```
node scripts/build-index.js
python3 -m http.server
```
Then open http://localhost:8000.

## Photos

Save a photo next to the recipe with the same name, e.g. `recipes/mexican/nixtamal.jpg`
for `nixtamal.md`, and it shows on the recipe and its card. Until then, a coloured
placeholder is shown. Keep photos under about 500 KB so pages load fast on phones.

## Extra sections

Any other `## Heading` in a recipe file (for example `## About this recipe` or
`## Make ahead & storage`) shows as text above the recipe. Write each paragraph on one line.
Add `nutrition: 320 kcal, 22 g protein, 14 g fat` in the details block to show a
nutrition box, and `author: Your Name` for the byline.

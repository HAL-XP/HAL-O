"""Generate an interactive HTML font browser for pyfiglet."""
import pyfiglet
import html as h
import os, subprocess, sys

PREVIEW_TEXT = "HAL-O"
# Output to <project-root>/temp/ — find project root by walking up from this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
OUTPUT = os.path.join(PROJECT_ROOT, "temp", "ascii-fonts.html")

# Top picks by category
CATEGORIES = {
    "Sci-Fi": ["slant", "banner3", "cyberlarge", "digital", "doom", "starwars", "sub-zero", "speed", "univers", "cybermedium", "electronic"],
    "Bold": ["big", "block", "bulbhead", "epic", "ogre", "roman", "stop", "larry3d", "isometric1", "isometric3", "colossal"],
    "Clean": ["standard", "small", "mini", "smslant", "smshadow", "thin", "pagga", "term", "smscript", "futural"],
    "Decorative": ["3-d", "3x5", "alligator", "alligator2", "alphabet", "avatar", "banner", "bell", "caligraphy", "doh", "fire_font-s", "ghost", "gothic", "graffiti", "hollywood", "invita", "jazmine", "maxfour", "mirror", "nancyj", "nipples", "pawp", "peaks", "puffy", "rounded", "shadow", "shimrod", "stacey", "stampate", "weird"],
}

fonts = sorted(pyfiglet.FigletFont.getFonts())

# Pre-render previews
previews = {}
for f in fonts:
    try:
        txt = pyfiglet.figlet_format(PREVIEW_TEXT, font=f, width=120)
        if txt.strip():
            previews[f] = txt
    except:
        pass

# Build categorized set
categorized = set()
for cat_fonts in CATEGORIES.values():
    categorized.update(cat_fonts)

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ASCII Font Browser — {len(previews)} fonts</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#0a0a0f; color:#c0c0c0; font-family:'JetBrains Mono','Cascadia Code',monospace; }}
  .header {{ background:#111118; border-bottom:1px solid #1a1a2e; padding:1.5rem 2rem; position:sticky; top:0; z-index:10; }}
  .header h1 {{ color:#00e5ff; font-size:1.3rem; letter-spacing:0.1em; margin-bottom:0.8rem; }}
  .controls {{ display:flex; gap:1rem; flex-wrap:wrap; align-items:center; }}
  input[type=text] {{ background:#0a0a0f; border:1px solid #333; color:#e0e0e0; padding:0.5rem 1rem; border-radius:4px; font-family:inherit; font-size:0.9rem; width:280px; }}
  input[type=text]:focus {{ border-color:#00e5ff; outline:none; }}
  .preview-input {{ width:180px; }}
  .cats {{ display:flex; gap:0.5rem; flex-wrap:wrap; }}
  .cat {{ background:#1a1a2e; color:#888; border:1px solid #333; padding:0.3rem 0.8rem; border-radius:3px; cursor:pointer; font-size:0.8rem; transition:all 0.15s; }}
  .cat:hover {{ border-color:#00e5ff; color:#00e5ff; }}
  .cat.active {{ background:#00e5ff22; border-color:#00e5ff; color:#00e5ff; }}
  .stats {{ color:#555; font-size:0.8rem; margin-left:auto; }}
  .grid {{ padding:1rem 2rem 4rem; display:grid; grid-template-columns:repeat(auto-fill, minmax(380px, 1fr)); gap:1rem; }}
  .card {{ background:#111118; border:1px solid #1a1a2e; border-radius:6px; overflow:hidden; transition:border-color 0.15s; display:none; }}
  .card.visible {{ display:flex; flex-direction:column; }}
  .card:hover {{ border-color:#00e5ff44; }}
  .card-header {{ display:flex; align-items:center; gap:0.8rem; padding:0.5rem 1rem; background:#0d0d14; border-bottom:1px solid #1a1a2e; flex-wrap:wrap; }}
  .font-name {{ color:#39ff14; font-size:0.9rem; font-weight:bold; }}
  .font-tags {{ display:flex; gap:0.4rem; }}
  .tag {{ font-size:0.65rem; padding:1px 6px; border-radius:3px; }}
  .tag-pick {{ background:#00e5ff22; color:#00e5ff; }}
  .tag-cat {{ background:#39ff1422; color:#39ff14; }}
  .card pre {{ padding:0.8rem 1rem; font-size:0.7rem; line-height:1.2; overflow-x:auto; color:#e0e0e0; white-space:pre; }}
  .copy-btn {{ background:none; border:1px solid #333; color:#888; padding:2px 8px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:0.7rem; }}
  .copy-btn:hover {{ border-color:#00e5ff; color:#00e5ff; }}
  .copy-btn.copied {{ color:#39ff14; border-color:#39ff14; }}
</style>
</head>
<body>

<div class="header">
  <h1>ASCII FONT BROWSER — {len(previews)} fonts</h1>
  <div class="controls">
    <input type="text" id="search" placeholder="Search fonts..." autofocus>
    <input type="text" id="previewText" class="preview-input" placeholder="Preview text" value="{PREVIEW_TEXT}">
    <div class="cats">
      <div class="cat active" data-cat="all">All ({len(previews)})</div>
      <div class="cat" data-cat="picks">Top Picks</div>
"""

for cat_name, cat_fonts in CATEGORIES.items():
    valid = [f for f in cat_fonts if f in previews]
    page += f'      <div class="cat" data-cat="{cat_name.lower()}">{cat_name} ({len(valid)})</div>\n'

page += """    </div>
    <div class="stats" id="stats"></div>
  </div>
</div>

<div class="grid" id="grid">
"""

# Render font cards
for font_name in fonts:
    if font_name not in previews:
        continue
    art = h.escape(previews[font_name]).rstrip()

    # Determine categories
    cats = []
    is_pick = False
    for cat_name, cat_fonts in CATEGORIES.items():
        if font_name in cat_fonts:
            cats.append(cat_name)
            is_pick = True

    cat_data = " ".join(c.lower() for c in cats) if cats else ""
    tags_html = ""
    if is_pick:
        tags_html += '<span class="tag tag-pick">TOP PICK</span>'
        for c in cats:
            tags_html += f'<span class="tag tag-cat">{c}</span>'

    page += f"""  <div class="card visible" data-font="{font_name}" data-cats="{cat_data}" data-pick="{1 if is_pick else 0}">
    <div class="card-header">
      <span class="font-name">{font_name}</span>
      <button class="copy-btn" onclick="copyCmd('{font_name}', this)">copy /ascii cmd</button>
      <div class="font-tags">{tags_html}</div>
    </div>
    <pre>{art}</pre>
  </div>
"""

page += """</div>

<script>
const cards = document.querySelectorAll('.card');
const search = document.getElementById('search');
const stats = document.getElementById('stats');
const catBtns = document.querySelectorAll('.cat');
let activeCat = 'all';

function filter() {
  const q = search.value.toLowerCase();
  let visible = 0;
  cards.forEach(c => {
    const name = c.dataset.font;
    const cats = c.dataset.cats;
    const pick = c.dataset.pick === '1';

    let matchCat = activeCat === 'all' ||
                   (activeCat === 'picks' && pick) ||
                   cats.includes(activeCat);
    let matchSearch = !q || name.includes(q);

    if (matchCat && matchSearch) {
      c.classList.add('visible');
      visible++;
    } else {
      c.classList.remove('visible');
    }
  });
  stats.textContent = `${visible} / """ + str(len(previews)) + """ fonts`;
}

search.addEventListener('input', filter);

catBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    catBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCat = btn.dataset.cat;
    filter();
  });
});

function copyCmd(font, btn) {
  const text = document.getElementById('previewText').value || '""" + PREVIEW_TEXT + """';
  navigator.clipboard.writeText(`/ascii -f ${font} ${text}`);
  btn.textContent = 'copied!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = 'copy /ascii cmd'; btn.classList.remove('copied'); }, 1500);
}

filter();
</script>
</body>
</html>"""

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write(page)

print(f"Generated {OUTPUT} with {len(previews)} fonts")

# Open in browser
if sys.platform == "win32":
    subprocess.Popen(["cmd", "/c", "start", "", OUTPUT], shell=False)
else:
    subprocess.Popen(["xdg-open", OUTPUT])

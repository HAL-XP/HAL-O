---
name: html-rules
description: "UX rules for all HTML page generation in this project. Auto-loaded by /hal html and frontend-design skill."
user-invocable: false
---

# HTML Generation UX Rules

These rules apply to ALL generated HTML pages in this project.

## Layout Rules

1. **Actions near content**: Buttons, links, and interactive controls MUST be visually adjacent to the content they act on. Never place a button at the far right when its related content is at the far left of a wide layout. Use flex with `gap` instead of `justify-content: space-between` on wide containers.

2. **Card headers**: On cards with a title + action button, keep them close together. Either:
   - Stack vertically (title above, button below)
   - Group horizontally with a small gap (not space-between across full width)
   - Place the action button on the left, right after the title

3. **No dead zones**: Avoid layouts where the user must scan across >400px of empty space to find the next interactive element.

4. **Content-fitted containers**: Cards and containers should fit their content, not stretch to 100% viewport width by default. Use `max-width` or CSS grid with `auto-fill` / `minmax()` to create multi-column layouts that use screen real estate efficiently. A card with 30 chars of text should NOT be 1500px wide.

5. **Grid over stack**: When displaying a collection of similarly-sized items (font previews, project cards, thumbnails), prefer a responsive CSS grid (`grid-template-columns: repeat(auto-fill, minmax(350px, 1fr))`) over a single-column vertical stack. Fill the screen, don't waste it.

6. **Mobile-first**: All pages must be responsive. Test at 375px, 768px, and 1440px mentally.

## HAL-O Aesthetic Defaults

When generating HTML for this project, default to:
- Dark background: `#0a0a0f`
- Primary accent: `#00e5ff` (cyan)
- Secondary accent: `#39ff14` (green)
- Alert: `#ff3366` (red)
- Font: `'JetBrains Mono', 'Cascadia Code', monospace` for code, plus a clean sans-serif for body
- Subtle glow/bloom effects on accents
- HAL-O logo: `https://raw.githubusercontent.com/HAL-XP/HAL-O/master/build/icon.png`

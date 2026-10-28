# Store Builder Playbook (AuraGlow template)

This folder is the complete, working Shopify store template built for **AuraGlow Smart Tree Lights**
(auraglow.live, Shopify store `yw0gjb-h0`). It is the master template for every future product store.
Rebuild new stores from these files: same structure, layout, urgency, sections and behaviour, re-themed
and re-written for the new product.

## What the owner wants (keep exactly)

- Copy the reference designs exactly: **Sternify-style** product page (ROSÉE layout), **GRIPT** countdown bar,
  review slider, bundles and cart drawer, tabs section, before/after + FAQ, **Huel** comparison table.
  References are in `reference-images/` (`user-screenshots/` = images the owner sent in chat, `design-refs/` = the original Sternify/GRIPT/ROSÉE refs).
- **Mobile-first.** The cart drawer layout is for desktop too, but phone is the priority.
- **Everything editable in the Theme Editor**: text, colours, icons, avatar size/shape/images, timers, codes.
- **Product page only**: the homepage redirects to the product (`ag-redirect` in the header group, keeps UTM/fbclid).
  The logo links to the product. No search icon.
- **Less text, more visual.** Short copy, videos everywhere.
- Build on a **draft (unpublished) theme**. The owner publishes it. `themeFilesUpsert` cannot write to the live theme.

## Page structure (product.json order)

1. `ag-topbar`: pine-green countdown with digit tiles, **"Discount ends in"**, copyable code chip (XMAS25), closable, store-wide snowfall.
   The 5-hour timer is per visitor and resets daily.
2. Header: announcement bar (red, rotating), centred logo, no search.
3. `ag-product` (main):
   - Gallery: scroll-snap main image + side feature cards. Thumbnails hidden and replaced by
     **red/green arrow buttons + progress bar** (`ag-gallery.js`, `ag-xmas2.css`).
   - Stars + review count (links to `#reviews`), title, 1-line description, avatar pill.
   - Price, compare price, %-off, speech bubble.
   - Deal box: countdown (same timer as the top bar) + copy-code button.
   - Mini review slider: circle profile pics or initials, verified badge, every style setting editable.
   - Variant pills (simple names like "6 ft · 400 LEDs"); clicking one updates the URL.
   - **Glowing "Almost out of stock"**, plus "Only [n] discount spots left" with a bar.
   - Bundles: 1/2/3 units with discounted totals. Ribbons: "Limited supply" (green), "Only 20 left" (red, pulsing).
     The real discounts come from Shopify **automatic discounts** (2 units −15%, 3+ units −25%). Keep the percentages in sync.
   - Add to cart (product-form.js compatible) + **Apple Pay / dynamic checkout** + mini payment icons.
   - "Loved by 1,500+ families" + **customer video carousel** (9:16 cards, tap for sound).
   - Feature tiles, delivery-ETA timeline, accordions, sticky mobile add-to-cart bar.
4. `ag-video-wall`: horizontal 9:16 UGC videos with captions + stars.
5. `ag-tabs`: "One tree, three Christmas moods".
6. `ag-before-after`: draggable slider with a hint animation.
7. `ag-compare`: **Huel-style**. Inter heading with a Playfair italic word ("Find your *perfect* …"). Soft cream highlight column
   for us. **ONE competitor shown at a time**, switched with a pulsing red next-arrow, "Compare next" and dots.
   ✓ / ✗ icons. Competitors: Traditional lights, Amazon string lights, Other smart lights. Applies to this section only.
8. `ag-reviews` (id `#reviews`): rating summary + bars + review cards + "Show more". **Fill with REAL reviews only.**
9. `ag-faq`.

Other pages: `page.about.json` (`ag-about`, the redesigned About Us), `page.contact.json` (`ag-contact`).
Cart drawer: `cart-drawer/` (AuraGlow layout: social proof, reserved timer, banner, free-shipping bar, discount field).

## Theme styling (`ag-xmas.css`)

- The cream boxes use Christmas patterns: red with snow dots, green with snow dots, white with candy-cane stripes.
- Cart drawer is mobile-safe (100vw, 16px inputs, no iOS zoom). The viewport has max-scale=1.
- Colours: wine/red `#B3122E` / `#C8102E`, pine `#1E5A3A` / `#0F2E1F`, cream `#F7F0E7`, gold stars `#E0A82E`.
- For a new product, swap the palette and patterns to that product's theme.

## How to build a new store from this template

1. Research the product: benefits, complaints about competitors, angles that sell.
2. Duplicate the live theme in Shopify → write the files from `theme/` and `config/` to the draft theme:
   - `themeFilesUpsert` only works on unpublished themes.
   - Keep each batch under ~40KB.
   - Range values must land on the schema step (e.g. `head_h` step 4 → use 152, not 150).
3. Rewrite all copy, colours, bundles, comparison rows, FAQ, About page and product handle (`/products/<handle>`) for the new product.
4. Simplify the variant names; create the automatic bundle discounts.
5. Test locally with `tools/render.mjs` (liquidjs) + Playwright at 390px and 1280px.
6. Send the owner the preview link: `https://<domain>/products/<handle>?preview_theme_id=<id>`.

## Hard rules

- Never publish a theme or spend ad money without the owner's go-ahead.
- Meta ads:
  - Always set a **campaign spending limit** (the total cap the owner gives, e.g. $30). A daily budget alone overspent (~$74) before.
  - Use the **business** ad account + the pixel connected to the store.
  - Videos need ≥1080px; supply 1080×1920 (Reels/Stories) **and** 1080×1350 (Feeds).
- Reviews and counts must be real (supplier/customer). Keep urgency claims believable.
- Contact-form "Hello" emails from random Gmail accounts right after launch are usually Shopify scams. Don't treat them as customers.

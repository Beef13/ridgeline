# Asset licences

Every image and sound that ships with Ridge Run, where it came from, and whether
it can legally be used in a **commercial** release.

"Commercial" is the word that matters. Everything here is fine for a private
project nobody earns from. The moment the game takes revenue share from a portal
— Poki, CrazyGames, or any ad-supported host — it becomes commercial use, and
several of these assets stop being usable.

Both Poki's and CrazyGames' developer terms make *you* warrant that you own or
have permission for every element in the game, and make *you* indemnify them
against any claim. So an unlicensed asset is not only a risk from the rights
holder; it is a breach of contract with the portal, and their losses land on
you. This file is what you hand them when a claim arrives.

**Status: NOT READY for commercial release.** See "Must fix" at the bottom.

---

## Legend

| | |
|---|---|
| ✅ **SAFE** | Verified licence permits commercial use with no attribution. |
| ⚠️ **UNKNOWN** | Origin not recorded. Must be identified or replaced. Treat as unsafe. |
| ❌ **NOT SAFE** | Licence forbids commercial use, or no licence grant exists. |

---

## Images in use

These ten files are referenced by `public/design.json` and appear in the game.

| File | Source | Licence | Verdict |
|---|---|---|---|
| `endless-green-forest-stockcake.png` | StockCake | CC0 / public domain. Commercial use, no credit required. | ✅ SAFE |
| `Realistic_Pine_Tree_PNG_Clip_Art-1103.png` | clipartpng.com (ID 1103) | No licence published. Pages say "personal projects" and carry an all-rights-reserved notice. | ❌ NOT SAFE |
| `White_Small_Cloud_PNG_Clipart-879.png` | clipartpng.com (ID 879) | Same as above. | ❌ NOT SAFE |
| `mountain_01_sunset.png` | *not recorded* | — | ⚠️ UNKNOWN |
| `mountain_02_day time.png` | *not recorded* | — | ⚠️ UNKNOWN |
| `a-dead-tree-on-a-transparent-background-png.png` | *not recorded* | — | ⚠️ UNKNOWN |
| `a-large-rock-…-crevices-png.png` | *not recorded* | — | ⚠️ UNKNOWN |
| `a-large-rock-…-crevices-png-LIGHTER.png` | *not recorded* (edit of the above) | — | ⚠️ UNKNOWN |
| `rock-isolated-on-white-background-gray-stone-texture-png.png` | *not recorded* | — | ⚠️ UNKNOWN |
| `vibrant-green-boston-fern-…-transparent-png.png` | *not recorded* | — | ⚠️ UNKNOWN |

The seven UNKNOWN files have filenames that read like image-generator prompts or
SEO stock-site slugs. That does not tell us the terms either way. Each one needs
its source identified — or replacing, which is usually faster than establishing
provenance after the fact.

## Images shipped but unused

Not referenced by `design.json`, but **still published and still in the repo**,
because Vite copies `public/` wholesale. They carry exactly the same legal
exposure as the images above while contributing nothing to the game.

| File | Source | Licence | Verdict |
|---|---|---|---|
| `360_F_522564739_g7v9M2VfYH2kZ1zKTKAznLdNggnOtHTM.jpg` | Adobe Stock **watermarked comp** | Comp licence is 90 days, preview only. Explicitly forbids use in a final production or making the asset publicly available. | ❌ NOT SAFE |
| `cloud_PNG112271.png` | pngimg.com | **CC BY-NC 4.0** — non-commercial only. No paid upgrade exists. | ❌ NOT SAFE |
| `fern_png_3_by_gareng92_dda5v4w-fullview.png` | DeviantArt (Gareng92), `-fullview` = scraped display render | All rights reserved by default. No terms published by the artist. | ❌ NOT SAFE |
| `pngtree-fern-plant-…_16070058.png` | Pngtree, free tier | Commercial use only with visible Pngtree credit in-game. | ❌ NOT SAFE as used |
| `pngtree-green-tree-plant-forest-…_11716383.png` | Pngtree, free tier | Same. | ❌ NOT SAFE as used |
| `3-31230_pine-tree-png-image-…-background.png` | PNG aggregator site | No licence grant. | ❌ NOT SAFE |
| `cloud for distance.png` (4.3 MB) | *not recorded* | — | ⚠️ UNKNOWN |
| `cloud-isolated-on-black-background-png.webp` | *not recorded* | — | ⚠️ UNKNOWN |
| `realistic-tree-png-4k_4BV.webp` | *not recorded* | — | ⚠️ UNKNOWN |
| `lush-green-fern-plant-…-aesthetics-png.png` | *not recorded* | — | ⚠️ UNKNOWN |
| `~ai-…_.tmp` (4.2 MB) | half-written export | — | delete |

**Delete all of these.** Nothing references them, they add about 14 MB to what
every player downloads, and while they sit in `public/` they are being
distributed.

## Logos and marks

`ridge runner logo.ai`, `ridge runner logo*.png`, `ridge logo*.png`,
`granite*.png` — original work, no third-party rights.

Worth moving out of `public/art/` into a `design-source/` folder that is **not**
published: the `.ai` file alone is 4.2 MB of working file being served to every
player who loads the game. Only `public/logo.png` and the favicons need to ship.

## Audio

| File | Source | Licence | Verdict |
|---|---|---|---|
| `ethnic-flute-ambient.mp3` (6.0 MB) | YouTube, "…No Copyright Background Music" | "No copyright" is a marketing phrase, not a legal status. Compilation uploads of this kind are usually re-uploads the uploader cannot license. Even a genuine YouTube-facing permission rarely covers sync into distributed software. | ❌ NOT SAFE |
| `bell.mp3` | *not recorded* | — | ⚠️ UNKNOWN |
| `crash.mp3` | *not recorded* | — | ⚠️ UNKNOWN |
| `duck.mp3` | *not recorded* | — | ⚠️ UNKNOWN |
| `jump.mp3` | *not recorded* | — | ⚠️ UNKNOWN |
| star collect / new life / bird stomp | **synthesised in `src/core/sfx.js`** | Original — no samples, generated at runtime by Web Audio. | ✅ SAFE |

---

## Replacement sources that are actually safe

All CC0 (public domain) unless noted — commercial use, no attribution, no
account needed.

**Art**

- **kenney.nl** — CC0 across the entire catalogue. Nature Kit and Foliage packs
  cover trees, rocks and clouds. The best single starting point.
- **polyhaven.com** — CC0. Textures, HDRIs, models.
- **ambientcg.com** — CC0. Rock, bark, moss, ground materials.
- **quaternius.com** — CC0. Stylised low-poly nature, well suited to this game's
  budget.
- **opengameart.org** — mixed; **filter to CC0 only**. CC BY-SA and GPL entries
  can impose obligations on the whole project.
- **stockcake.com** — CC0. Already in use here and fine.
- **openclipart.org**, **publicdomainvectors.org** — CC0 vectors, good for
  parallax silhouettes.
- **pixabay.com** — commercial use, no credit needed, but you may not distribute
  an unmodified file on a standalone basis. Composite it into an atlas rather
  than serving the original PNG at a public URL.

Avoid: Unsplash and Pexels (commercial-ok but no standalone redistribution),
freepik / vecteezy / flaticon free tiers (attribution required), and anything
marked CC BY-NC or "personal use".

**Music and sound**

- **pixabay.com/music** — commercial use, no attribution. Closest drop-in for
  the flute track.
- **freesound.org** — **filter to CC0**; the default pool includes NC licences.
- **opengameart.org** music, CC0 filter — purpose-built loops with real licence
  metadata.
- **incompetech.com** (Kevin MacLeod) — CC BY: free, but requires a visible
  credit screen. A paid licence removes that.
- **Sonniss GDC bundle** — royalty-free, explicitly cleared for commercial
  games. Free, annual, several GB of ambience and SFX.

---

## Must fix before any commercial release

1. **Delete the unused art.** Nothing references it, it is ~14 MB of what every
   player downloads, and six of those files are outright unlicensed.
2. **Replace the two clipartpng images** — the pine tree and the small cloud.
   Both are in the game right now. Kenney's Nature Kit covers both.
3. **Replace `ethnic-flute-ambient.mp3`.** `src/core/audio.js` holds the loop
   points in `MUSIC`; per `public/audio/CREDITS.txt` those two numbers are the
   only things a swap needs to change.
4. **Identify or replace the seven UNKNOWN images in use** and the four UNKNOWN
   sound effects.
5. **Move logo working files out of `public/`** so they stop being published.
6. **Keep this file current.** Every asset added from here on gets a row: source
   URL, author, licence name and version, and the date downloaded. Save a copy
   of the licence text alongside it.

---

*Last audited: 12 September 2026.*

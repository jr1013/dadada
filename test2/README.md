# dadada — experimental publishing platform
**dadada.in** · Photo books, image essays, video works

---

## File structure

```
dadada/
├── index.html
├── manifest.json
├── README.md
│
├── css/
│   └── style.css
│
├── js/
│   └── app.js
│
├── data/
│   ├── works.json        ← all 15 works — the single source of truth
│   └── config.json       ← site settings, currency, shipping
│
├── images/
│   ├── covers/            ← one cover image per work
│   │   ├── dust-cover.jpg
│   │   ├── 54-rooms-cover.jpg
│   │   └── ...
│   └── plates/             ← interior images per work (used by the
│       │                     chapter scroller and book reader)
│       ├── dust-plate-01.jpg
│       ├── dust-plate-02.jpg
│       ├── dust-plate-03.jpg
│       ├── dust-plate-04.jpg
│       └── ...
│
└── pdfs/                   ← downloadable PDF files for works that
    ├── dust.pdf               sell a PDF format (currently empty —
    └── ...                    add your own files here, see below)
```

15 demo works are pre-loaded with generated placeholder cover and plate
artwork (60 images total) so the catalogue and chapter-scroller are fully
populated out of the box. Replace these with real artwork using the steps
below.

---

## 1. Uploading images for a work

### Covers
Drop a cover image into `images/covers/`, named to match the work's slug:

```
images/covers/your-work-slug-cover.jpg
```

Recommended size: **800×1067px** (3:4 portrait ratio), JPG or WebP, under
300KB if possible for fast loading.

### Interior plates
Drop as many interior images as you like into `images/plates/`:

```
images/plates/your-work-slug-plate-01.jpg
images/plates/your-work-slug-plate-02.jpg
images/plates/your-work-slug-plate-03.jpg
...
```

Recommended size: **1200×900px** (4:3 landscape) or **1000×1400px**
(portrait, for tall photographs), JPG or WebP.

There's no fixed limit on the number of plates — add 4 or 40. The chapter
scroller will cycle through them as the reader scrolls (see below for how
chapters map to plates).

### Registering the images in `works.json`
Open `data/works.json`, find your work's entry (or duplicate one to create
a new entry), and set:

```json
{
  "cover": "images/covers/your-work-slug-cover.jpg",
  "plates": [
    "images/plates/your-work-slug-plate-01.jpg",
    "images/plates/your-work-slug-plate-02.jpg",
    "images/plates/your-work-slug-plate-03.jpg",
    "images/plates/your-work-slug-plate-04.jpg"
  ]
}
```

The catalogue grid, the home page featured cards, and the chapter scroller
all read directly from these two fields — nothing else needs to change.

---

## 2. Uploading a PDF for a work

1. Place the PDF file in the `pdfs/` folder:
   ```
   pdfs/your-work-slug.pdf
   ```
2. In `data/works.json`, add a `pdfFile` field to that work's entry:
   ```json
   "pdfFile": "pdfs/your-work-slug.pdf",
   "formats": {
     "pdf": { "price": 300, "available": true }
   }
   ```
3. The detail page automatically shows a **Download file** link in the
   Details table once `pdfFile` is set and `formats.pdf.available` is
   `true`. Until then it shows "Not yet uploaded" as a placeholder.

For an actual storefront you'd gate this behind a successful payment —
see the Payment integration section below for hooking up Razorpay/Stripe
before delivering the file.

---

## 3. How the chapter scroller works (individual work page)

The single-work page replicates the "scrollytelling" pattern used by
sites like *animism.e-flux.com* — chapters of text scroll past a sticky
image that swaps as you read.

**Desktop / tablet (≥901px):**
- Text chapters scroll in the **left** column.
- The image sits **sticky on the right**, pinned to the viewport.
- As each chapter's top edge crosses roughly the upper third of the
  screen, that chapter is marked active (highlighted, full opacity) and
  the image cross-fades to the plate assigned to that chapter.

**Mobile / narrow tablet (≤900px):**
- The image moves **above** the text and becomes sticky at a reduced
  height (42vh on tablets, 34vh on phones) just below the nav bar.
- Text chapters stack and scroll normally underneath.
- The same scroll-trigger logic swaps the image as you scroll through
  chapters — image on top, text below, both updating together.

### How chapters map to plates
Each work has a `sections` array (the chapter text) and a `plates` array
(the images). If there are more chapters than plates, the plate index
loops via modulo — e.g. 5 chapters with 4 plates means chapter 5 reuses
plate 1. To give every chapter its own unique image, just add one plate
per chapter in `works.json`.

```json
"plates": ["images/plates/dust-plate-01.jpg", "...02.jpg", "...03.jpg", "...04.jpg"],
"sections": [
  { "title": "Prologue",      "body": "..." },
  { "title": "I. Threshold",  "body": "..." },
  { "title": "II. Interior",  "body": "..." },
  { "title": "III. Light",    "body": "..." },
  { "title": "Coda",          "body": "..." }
]
```

### Adjusting the trigger point
The scroll-trigger line is set at 35% down the viewport
(`window.innerHeight * 0.35`) in `js/app.js` inside `bindChapterScrollWatcher()`.
Lower this fraction to trigger the image change earlier (closer to the top
of the screen); raise it to trigger later.

---

## 4. Adding a brand-new work

1. Add cover + plate images as described in section 1.
2. Copy an existing object in `data/works.json` and edit every field —
   `id`, `slug`, `type`, `title`, `artist`, `year`, `location`, `tags`,
   `description`, `formats`, `cover`, `plates`, `sections`.
3. `type` must be exactly one of: `"photo book"`, `"image essay"`, `"video"`
   — this string is used by the catalogue filter buttons.
4. For a video work, use `duration` instead of `pages`, and typically set
   `formats.pdf.available` and `formats.print.available` to `false`.
5. Save — no build step, no restart needed. Refresh the page.

---

## 5. Site configuration

Edit `data/config.json` for:
- Site name, domain, contact email
- Submission status (open/closed)
- Domestic shipping cost (₹)
- Currency symbol

---

## 6. Deployment

Static site — upload the whole folder to any host:

```bash
# rsync to your own server
rsync -avz ./dadada/ user@yourserver.com:/var/www/dadada.in/

# Netlify
netlify deploy --dir=dadada --prod

# Vercel
vercel ./dadada
```

Minimal Nginx config:
```nginx
server {
    listen 80;
    server_name dadada.in www.dadada.in;
    root /var/www/dadada.in;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    gzip on;
    gzip_types text/css application/javascript application/json image/jpeg;
}
```

---

## 7. Payment integration

Replace the `checkout()` function in `js/app.js`:

```javascript
function checkout() {
  const options = {
    key: 'YOUR_RAZORPAY_KEY',
    amount: totalInPaise,
    currency: 'INR',
    name: 'dadada',
    handler: function(response) {
      // On success: unlock PDF download / confirm print order
    }
  };
  new Razorpay(options).open();
}
```

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `Esc` | Close reader / drawer / go back |

---

## Notes

- Cart state and theme/font preferences persist in `localStorage`.
- The chapter scroller and the full-screen book reader (`Open full-screen
  reader →` button) are two separate experiences — the scroller is the
  primary reading mode on the work's own page; the reader overlay is a
  distraction-free fullscreen alternative using the same `sections` /
  `plates` data.
- All 60 demo images are abstract generative placeholders (no real
  photographs) — swap them for actual artist images before launch.

---

*dadada.in — built to last · HTML · JSON · No database*

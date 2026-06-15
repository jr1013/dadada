# dadada — experimental publishing platform
**dadada.in** · Photo books, image essays, video works

---

## Philosophy

DADADA is a lightweight, self-hosted publishing platform built entirely with
HTML, CSS, JavaScript and JSON. No framework, no database, no build step,
no subscriptions. Designed to be human-readable and maintainable for decades.

---

## File structure

```
dadada/
├── index.html          ← The entire site (single HTML file)
├── manifest.json       ← PWA manifest
├── README.md           ← This file
│
├── css/
│   └── style.css       ← All styles (Courier Prime, paper palette)
│
├── js/
│   └── app.js          ← All site logic — routing, cart, reader, search
│
├── data/
│   ├── works.json      ← All published works (the source of truth)
│   └── config.json     ← Site name, currency, shipping, submission status
│
└── works/              ← One folder per published work
    ├── dust/
    │   ├── cover.jpg   ← Cover image (recommended: 800×1067px, 3:4 ratio)
    │   ├── plate-01.jpg
    │   ├── plate-02.jpg
    │   └── ...
    ├── 54-rooms/
    └── ...
```

---

## How to add a new work

### 1. Add to `data/works.json`

Copy one of the existing entries and fill in your work's details:

```json
{
  "id": "your-work-slug",
  "slug": "your-work-slug",
  "type": "photo book",          // "photo book" | "image essay" | "video"
  "title": "Work Title",
  "artist": "Artist Name",
  "year": "2025",
  "location": "City",
  "tags": ["tag1", "tag2"],
  "description": "One paragraph about the work.",
  "pages": 80,                   // omit for video, use "duration" instead
  "language": "English",
  "edition": "First",
  "printRun": "Ed. of 50, numbered",
  "printSpecs": "A5, saddle stitch, Munken Lynx 100gsm",
  "formats": {
    "digital": { "price": 0,    "available": true  },
    "pdf":     { "price": 300,  "available": true  },
    "print":   { "price": 1200, "available": true  }
  },
  "preview": true,
  "sections": [
    { "title": "Prologue", "body": "First section text..." },
    { "title": "Chapter 1", "body": "Second section text..." }
  ]
}
```

For a **video work**, replace `pages` with `duration` (e.g. `"40 min"`) and
set `pdf.available` and `print.available` to `false`.

### 2. Add images

Create a folder `works/your-work-slug/` and add:
- `cover.jpg` — cover (3:4 ratio, ~800×1067px recommended)
- `plate-01.jpg`, `plate-02.jpg`, etc. — interior pages

The app currently shows placeholder labels — to display real images, update
`app.js` around the `openDetail()` function to reference `works/${w.slug}/cover.jpg`.

---

## Updating site config

Edit `data/config.json` to change:
- Site name, domain, contact email
- Submission status (`"open"` or `"closed"`)
- Shipping cost (in INR)
- Currency symbol

---

## Deployment (self-hosted)

This is a static site — upload the entire folder to any web host:

```bash
# With rsync
rsync -avz ./dadada/ user@yourserver.com:/var/www/dadada.in/

# With Netlify CLI
netlify deploy --dir=dadada --prod

# With Vercel
vercel ./dadada
```

No server-side language needed. A simple Nginx config serves the whole site.

### Nginx config (minimal)

```nginx
server {
    listen 80;
    server_name dadada.in www.dadada.in;
    root /var/www/dadada.in;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    gzip on;
    gzip_types text/css application/javascript application/json;
}
```

---

## Payment integration

The cart is fully functional in the frontend. To connect a payment gateway,
replace the `checkout()` function in `js/app.js` with your Razorpay / Stripe
integration:

```javascript
// Razorpay example
function checkout() {
  const options = {
    key: 'YOUR_RAZORPAY_KEY',
    amount: totalInPaise,
    currency: 'INR',
    name: 'dadada',
    handler: function(response) { /* handle success */ }
  };
  new Razorpay(options).open();
}
```

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `Esc` | Close reader / go back |

---

## Notes

- Cart state persists in `localStorage` between sessions
- The site works offline once cached (PWA manifest included)
- Print styles are included — `Ctrl+P` from any work page prints cleanly
- All content lives in `data/works.json` — no CMS, no admin panel needed

---

*dadada.in — built to last · HTML · JSON · Markdown · No database*

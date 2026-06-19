/* ============================================================
   DADADA — dadada.in — app.js
   No framework. No build step. Works with JSON + HTML.
   ============================================================ */
'use strict';

/* ══════════════════════════════════════
   FONT SIZE — sets px directly on <html>
══════════════════════════════════════ */
const FONT_STEPS  = ['sm', 'md', 'lg', 'xl'];
const FONT_SCALE  = { sm: '87.5%', md: '100%', lg: '112.5%', xl: '125%' };
const FONT_LABELS = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'X-Large' };
let fontIndex = 1; // default: md

function changeFontSize(dir) {
  fontIndex = Math.max(0, Math.min(FONT_STEPS.length - 1, fontIndex + dir));
  applyFont();
}

function applyFont() {
  const step  = FONT_STEPS[fontIndex];
  const scale = FONT_SCALE[step];
  /* All typographic rules in style.css use rem units, which are relative
     to the <html> font-size — scaling it here scales every rem-based
     font-size on the page proportionally, in one place. */
  document.documentElement.style.fontSize = scale;
  localStorage.setItem('dadada_font', step);
  showFontIndicator(FONT_LABELS[step]);
}

function showFontIndicator(label) {
  const el = document.getElementById('fontIndicator');
  if (!el) return;
  el.textContent = 'Font — ' + label;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

/* ══════════════════════════════════════
   THEME
══════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dadada_theme', theme);
  const icon    = document.getElementById('themeIcon');
  const drawer  = document.getElementById('drawerThemeBtn');
  const meta    = document.getElementById('metaTheme');
  const btn     = document.getElementById('themeBtn');
  if (icon)   icon.textContent   = theme === 'dark' ? '○' : '●';
  if (drawer) drawer.textContent = theme === 'dark' ? '◑ Light' : '◑ Dark';
  if (meta)   meta.setAttribute('content', theme === 'dark' ? '#111110' : '#f5f3ee');
  if (btn)    btn.setAttribute('title', theme === 'dark' ? 'Switch to light' : 'Switch to dark');
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function initPreferences() {
  /* Font */
  const savedFont = localStorage.getItem('dadada_font');
  if (savedFont) {
    const idx = FONT_STEPS.indexOf(savedFont);
    if (idx >= 0) fontIndex = idx;
  }
  applyFont();

  /* Theme */
  const savedTheme   = localStorage.getItem('dadada_theme');
  const prefersDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
}

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
const State = {
  works:    [],
  config:   {},
  cart:     JSON.parse(localStorage.getItem('dadada_cart') || '[]'),
  page:     'home',
  prevPage: 'home',
  detail:   null,
  fmt:      { type: 'digital', price: 0 },
  qty:      1,
};

/* ══════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════ */
async function init() {
  initPreferences();

  try {
    const [wRes, cRes] = await Promise.all([
      fetch('data/works.json'),
      fetch('data/config.json'),
    ]);
    State.works  = await wRes.json();
    State.config = await cRes.json();
  } catch (e) {
    console.warn('Could not load JSON data — check the data/ folder is present.');
  }

  buildMarquee();
  buildFeatured();
  renderCatalogue('all');
  updateCartBadge();
  bindGlobalEvents();
  routeFromHash();
   
  /* Open any detail page that was set before works JSON finished loading */
  if (State._pendingDetailId) {
    const id = State._pendingDetailId;
    State._pendingDetailId = null;
    openDetail(id);
  }
}

/* ══════════════════════════════════════
   ROUTING
══════════════════════════════════════ */
function routeFromHash() {
  const raw  = location.hash.replace('#', '') || 'home';
  const page = raw.split('?')[0]; /* strip any ?work= from direct links */

  if (page === 'detail') {
    /* Case 1: returning from narrator — id stored in sessionStorage */
    const returnId = sessionStorage.getItem('dadada_return_work');
    if (returnId) {
      sessionStorage.removeItem('dadada_return_work');
      State._pendingDetailId = returnId;
      return; /* openDetail() runs after works load in init() */
    }
    /* Case 2: direct deep-link e.g. index.html#detail?work=54-rooms */
    const params = new URLSearchParams(raw.split('?')[1] || '');
    const workId = params.get('work');
    if (workId) {
      State._pendingDetailId = workId;
      return;
    }
  }

  showPage(page);
}

function showPage(id) {
  /* Clean up the chapter scroll watcher when leaving the detail page */
  if (State.page === 'detail' && id !== 'detail') {
    stopGalleryAutoplay();
  }

  document.querySelectorAll('[data-page]').forEach(el => {
    el.hidden = (el.dataset.page !== id);
  });
  /* Nav tabs */
  document.querySelectorAll('.nav__tab').forEach(btn => {
    btn.setAttribute('aria-current', btn.dataset.page === id ? 'page' : 'false');
  });
  /* Drawer links */
  document.querySelectorAll('.nav__drawer-link[data-page]').forEach(btn => {
    btn.setAttribute('aria-current', btn.dataset.page === id ? 'page' : 'false');
  });
  State.prevPage = State.page;
  State.page     = id;
  location.hash  = id;
  window.scrollTo(0, 0);
  if (id === 'cart') renderCart();
}

function goBack() {
  const target = ['detail', 'search'].includes(State.prevPage) ? 'catalogue' : State.prevPage;
  showPage(target);
}

/* ══════════════════════════════════════
   MARQUEE
══════════════════════════════════════ */
function buildMarquee() {
  const el = document.getElementById('marqueeInner');
  if (!el || !State.works.length) return;
  const items = State.works.map(w => `<span class="marquee__item">${w.title} — ${w.artist}</span>`).join('');
  el.innerHTML = items + items;
}

/* ══════════════════════════════════════
   HOME — FEATURED (first 3 works)
══════════════════════════════════════ */
function buildFeatured() {
  const el = document.getElementById('featuredRow');
  if (!el) return;
  State.works.slice(0, 3).forEach(w => {
    const lowestPaid = w.formats.pdf?.price || w.formats.print?.price;
    el.insertAdjacentHTML('beforeend', `
      <div class="feat-card" onclick="openDetail('${w.id}')" tabindex="0">
        <div class="feat-card__cover">
          ${w.cover ? `<img src="${w.cover}" alt="${w.title} cover" loading="lazy">` : `<div class="feat-card__cover-label">${w.year}<br>${w.type}</div>`}
        </div>
        <div class="feat-card__body">
          <div class="feat-card__type">${w.type}</div>
          <div class="feat-card__title">${w.title}</div>
          <div class="feat-card__artist">${w.artist} · ${w.location}</div>
          <div class="feat-card__price-row">
            <div>
              ${lowestPaid
                ? `<span class="price"><span class="price__from">from</span> ${currency(lowestPaid)}</span><span class="price__free"> · Free to read</span>`
                : `<span class="price__free">Free online</span>`}
            </div>
            <button class="btn-add-sm" onclick="event.stopPropagation(); quickAdd('${w.id}')">+ Cart</button>
          </div>
        </div>
      </div>`);
  });
}

/* ══════════════════════════════════════
   CATALOGUE
══════════════════════════════════════ */
function renderCatalogue(filter) {
  const grid  = document.getElementById('catGrid');
  const count = document.getElementById('catCount');
  const foot  = document.getElementById('catFooter');
  if (!grid) return;

  const works = filter === 'all' ? State.works : State.works.filter(w => w.type === filter);
  grid.innerHTML = '';

  works.forEach(w => {
    const badges = [];
    if (w.formats.digital?.available) badges.push('<span class="fmt-badge">Read free</span>');
    if (w.formats.pdf?.available)     badges.push(`<span class="fmt-badge fmt-badge--paid">PDF ${currency(w.formats.pdf.price)}</span>`);
    if (w.formats.print?.available)   badges.push(`<span class="fmt-badge fmt-badge--paid">Print ${currency(w.formats.print.price)}</span>`);
    if (w.type === 'image essay')     badges.push(`<span class="fmt-badge" style="opacity:.9" onclick="event.stopPropagation(); location.href='read.html?work=${w.id}'">▶ Narrator</span>`);

    grid.insertAdjacentHTML('beforeend', `
      <div class="cat-card" onclick="openDetail('${w.id}')" tabindex="0">
        <div class="cat-card__cover">
          <span class="cat-card__type-pip">${w.type}</span>
          ${w.cover ? `<img src="${w.cover}" alt="${w.title}" loading="lazy">` : w.year}
        </div>
        <div class="cat-card__body">
          <div class="cat-card__title">${w.title}</div>
          <div class="cat-card__by">${w.artist} · ${w.location} · ${w.year}</div>
          <div class="cat-card__formats">${badges.join('')}</div>
        </div>
      </div>`);
  });

  const n = works.length;
  if (count) count.textContent = `${n} work${n !== 1 ? 's' : ''}`;
  if (foot)  foot.textContent  = `${n} published works`;
}

function filterCatalogue(type, btn) {
  document.querySelectorAll('.cat-filter').forEach(b => b.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', 'true');
  renderCatalogue(type);
}

/* ══════════════════════════════════════
   DETAIL VIEW — header + chapter scroller
   Chapter text scrolls; the sticky image
   swaps automatically based on which
   chapter is centred in the viewport.
   (Same interaction model as
   animism.e-flux.com/episode1)
══════════════════════════════════════ */
/* (gallery state lives in the Gallery object defined below) */

function openDetail(id) {
  const w = State.works.find(x => x.id === id);
  if (!w) return;
  State.detail = w;
  State.fmt    = { type: 'digital', price: 0 };
  State.qty    = 1;

  renderDetailInfo(w);
  renderGallery(w);

  showPage('detail');
}

function renderDetailInfo(w) {
  const fmtOpts = [fmtOption('digital', 0, 'Read online', 'Free — opens the full-screen reader', true)];
  if (w.formats.pdf?.available)   fmtOpts.push(fmtOption('pdf',   w.formats.pdf.price,   'PDF download',  'Print-ready. By email.', false));
  if (w.formats.print?.available) fmtOpts.push(fmtOption('print', w.formats.print.price, 'Print edition', w.printRun || '', false));

  const metaRows = w.type === 'video'
    ? `<tr><td>Duration</td><td>${w.duration}</td></tr><tr><td>Language</td><td>${w.language}</td></tr><tr><td>Edition</td><td>${w.edition}</td></tr>`
    : `<tr><td>Pages</td><td>${w.pages}</td></tr>
       <tr><td>Language</td><td>${w.language}</td></tr>
       <tr><td>Edition</td><td>${w.edition}</td></tr>
       ${w.printRun   ? `<tr><td>Print run</td><td>${w.printRun}</td></tr>`   : ''}
       ${w.printSpecs ? `<tr><td>Specs</td><td>${w.printSpecs}</td></tr>` : ''}
       ${w.formats.pdf?.available ? `<tr><td>PDF</td><td><a href="${w.pdfFile || '#'}" style="border-bottom:1px solid var(--mid)">${w.pdfFile ? 'Download file' : 'Not yet uploaded'}</a></td></tr>` : ''}`;

  const tags = (w.tags || []).map(t => `<span class="u-tag">${t}</span>`).join('');

  document.getElementById('detInfo').innerHTML = `
    <div class="det__type">${w.type}</div>
    <div class="det__title">${w.title}</div>
    <div class="det__artist">${w.artist} · ${w.location} · ${w.year}</div>
    <div class="det__desc">${w.description}</div>
    <span class="det__section-label">Format</span>
    <div class="fmt-grid" id="fmtGrid">${fmtOpts.join('')}</div>
    <div class="qty-row" id="qtyRow" style="display:none">
      <span class="u-label">Qty</span>
      <div class="qty-ctrl">
        <button class="qty-btn" onclick="changeQty(-1)">−</button>
        <div class="qty-val" id="qtyVal">1</div>
        <button class="qty-btn" onclick="changeQty(1)">+</button>
      </div>
    </div>
    <div>
      <button class="btn-add-main" id="addBtn" onclick="addToCart()">Read online — free</button>
      ${w.preview ? `<button class="btn-preview" onclick="openReader('${w.id}')">Read a preview →</button>` : ''}
      ${w.type === 'image essay' ? `<button class="btn-narrator" onclick="location.href='read.html?work=${w.id}'">▶ Narrator (auto read aloud) →</button>` : ''}
    </div>
    <span class="det__section-label">Details</span>
    <table class="meta-table"><tbody>${metaRows}</tbody></table>
    <span class="det__section-label">Tags</span>
    <div class="tag-cloud">${tags}</div>`;
}

/* ══════════════════════════════════════
   STICKY IMAGE GALLERY — up to 10 plates.
   Auto-advances every 4s, or click any
   thumbnail to jump directly. No inline
   reading text here — that only opens via
   "Read online" (full-screen reader) or
   "Narrator" (auto-read, image essays only).
══════════════════════════════════════ */
const Gallery = {
  images: [],
  idx: 0,
  playing: true,
  timer: null,
};

function renderGallery(w) {
  stopGalleryAutoplay();

  /* Cap at 10 images as specified; fall back to cover if no plates */
  const plates = (w.plates || []).slice(0, 10);
  Gallery.images = plates.length ? plates : (w.cover ? [w.cover] : []);
  Gallery.idx = 0;
  Gallery.playing = true;

  const stage  = document.getElementById('galleryStage');
  const thumbs = document.getElementById('galleryThumbs');
  const playBtn = document.getElementById('galleryPlayPause');

  if (Gallery.images.length) {
    stage.innerHTML = Gallery.images.map((src, i) =>
      `<img src="${src}" alt="${w.title} — image ${i+1}" class="${i === 0 ? 'is-active' : ''}" data-idx="${i}">`
    ).join('');
  } else {
    stage.innerHTML = `<div class="det__gallery-placeholder">${w.title}<br><span style="opacity:.5">${w.artist}</span></div>`;
  }

  thumbs.innerHTML = Gallery.images.map((src, i) =>
    `<button class="det__gallery-thumb ${i === 0 ? 'is-active' : ''}" data-idx="${i}" onclick="goToGalleryImage(${i})" aria-label="Image ${i+1}">
      <img src="${src}" alt="Thumbnail ${i+1}">
     </button>`
  ).join('');

  updateGalleryCounter();
  if (playBtn) playBtn.textContent = '❙❙';

  if (Gallery.images.length > 1) startGalleryAutoplay();
}

function updateGalleryCounter() {
  const el = document.getElementById('galleryCounter');
  if (el) el.textContent = Gallery.images.length ? `${Gallery.idx + 1} / ${Gallery.images.length}` : '';
}

function goToGalleryImage(idx) {
  if (idx < 0 || idx >= Gallery.images.length) return;
  Gallery.idx = idx;
  document.querySelectorAll('.det__gallery-stage img').forEach(img =>
    img.classList.toggle('is-active', parseInt(img.dataset.idx) === idx)
  );
  document.querySelectorAll('.det__gallery-thumb').forEach(t =>
    t.classList.toggle('is-active', parseInt(t.dataset.idx) === idx)
  );
  updateGalleryCounter();
  /* Restart the autoplay clock so a manual click doesn't get instantly overridden */
  if (Gallery.playing) { stopGalleryAutoplay(false); startGalleryAutoplay(); }
}

function startGalleryAutoplay() {
  if (Gallery.images.length < 2) return;
  Gallery.timer = setInterval(() => {
    const next = (Gallery.idx + 1) % Gallery.images.length;
    goToGalleryImage(next);
  }, 4000);
}

function stopGalleryAutoplay(updateFlag = true) {
  if (Gallery.timer) { clearInterval(Gallery.timer); Gallery.timer = null; }
  if (updateFlag) Gallery.playing = false;
}

function toggleGalleryAutoplay() {
  const btn = document.getElementById('galleryPlayPause');
  if (Gallery.playing) {
    stopGalleryAutoplay();
    if (btn) btn.textContent = '▶';
  } else {
    Gallery.playing = true;
    startGalleryAutoplay();
    if (btn) btn.textContent = '❙❙';
  }
}

function fmtOption(type, price, name, desc, selected) {
  return `<button class="fmt-opt" aria-pressed="${selected}" data-fmt="${type}" data-price="${price}" onclick="selectFmt(this)">
    <div class="fmt-opt__name">${name}</div>
    <div class="fmt-opt__desc">${desc}</div>
    <div class="fmt-opt__price">${price === 0 ? 'Free' : currency(price)}</div>
  </button>`;
}

function selectFmt(el) {
  document.querySelectorAll('.fmt-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
  el.setAttribute('aria-pressed', 'true');
  State.fmt = { type: el.dataset.fmt, price: parseInt(el.dataset.price) || 0 };
  State.qty = 1;
  document.getElementById('qtyRow').style.display = State.fmt.type === 'print' ? 'flex' : 'none';
  document.getElementById('qtyVal').textContent = 1;
  updateAddBtn();
}

function changeQty(delta) {
  State.qty = Math.max(1, State.qty + delta);
  document.getElementById('qtyVal').textContent = State.qty;
  updateAddBtn();
}

function updateAddBtn() {
  const btn = document.getElementById('addBtn');
  if (!btn) return;
  btn.textContent = State.fmt.price === 0
    ? 'Read online — free'
    : `Add to cart — ${currency(State.fmt.price * State.qty)}`;
}

/* ══════════════════════════════════════
   CART
══════════════════════════════════════ */
function addToCart() {
  if (!State.detail) return;
  const { type, price } = State.fmt;
  if (price === 0) { openReader(State.detail.id); return; }
  const key = `${State.detail.id}::${type}`;
  const existing = State.cart.find(c => c.key === key);
  if (existing) { existing.qty += State.qty; }
  else {
    State.cart.push({
      key, id: State.detail.id,
      title:  State.detail.title,
      artist: State.detail.artist,
      cover:  State.detail.cover || null,
      fmt: type, price, qty: State.qty
    });
  }
  persistCart(); updateCartBadge();
  toast(`"${State.detail.title}" added to cart`);
}

function quickAdd(id) {
  const w = State.works.find(x => x.id === id);
  if (!w) return;
  const price = w.formats.pdf?.price || w.formats.print?.price;
  if (!price) { toast("Free to read online"); return; }
  const fmt = w.formats.pdf?.available ? 'pdf' : 'print';
  const key = `${w.id}::${fmt}`;
  const existing = State.cart.find(c => c.key === key);
  if (existing) { existing.qty++; }
  else { State.cart.push({ key, id: w.id, title: w.title, artist: w.artist, cover: w.cover || null, fmt, price, qty: 1 }); }
  persistCart(); updateCartBadge();
  toast(`"${w.title}" added to cart`);
}

function removeFromCart(key) {
  const idx = State.cart.findIndex(c => c.key === key);
  if (idx > -1) State.cart.splice(idx, 1);
  persistCart(); updateCartBadge(); renderCart();
}

function changeCartQty(key, delta) {
  const item = State.cart.find(c => c.key === key);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  persistCart(); updateCartBadge(); renderCart();
}

function renderCart() {
  const itemsEl   = document.getElementById('cartItems');
  const summaryEl = document.getElementById('cartSummary');
  const totalEl   = document.getElementById('cartTotal');
  if (!itemsEl) return;

  if (!State.cart.length) {
    itemsEl.innerHTML = `<div class="cart-empty"><p>Your cart is empty.</p>
      <button class="btn btn--light" onclick="showPage('catalogue')" style="margin-top:8px">Browse catalogue</button></div>`;
    if (summaryEl) summaryEl.innerHTML = '';
    if (totalEl)   totalEl.textContent = currency(0);
    return;
  }

  itemsEl.innerHTML = '';
  let subtotal = 0;

  State.cart.forEach(item => {
    const line     = item.price * item.qty;
    subtotal      += line;
    const fmtLabel = { pdf: 'PDF download', print: 'Print edition', digital: 'Digital' }[item.fmt] || item.fmt;
    const isPrint  = item.fmt === 'print';
    itemsEl.insertAdjacentHTML('beforeend', `
      <div class="cart-row">
        <div class="cart-thumb">
          ${item.cover ? `<img src="${item.cover}" alt="${item.title}">` : item.title.charAt(0)}
        </div>
        <div>
          <div class="cart-item__title">${item.title}</div>
          <div class="cart-item__by">${item.artist}</div>
          <span class="cart-item__fmt">${fmtLabel}</span>
          ${isPrint ? `<div class="cart-item__qty">
            <button onclick="changeCartQty('${item.key}',-1)">−</button>
            <span>${item.qty}</span>
            <button onclick="changeCartQty('${item.key}',1)">+</button>
          </div>` : ''}
          <button class="cart-remove" onclick="removeFromCart('${item.key}')">Remove</button>
        </div>
        <div class="cart-price">${currency(line)}</div>
      </div>`);
  });

  const hasPhysical = State.cart.some(c => c.fmt === 'print');
  const shipping    = hasPhysical ? (State.config.site?.shipping?.domestic || 150) : 0;
  const total       = subtotal + shipping;

  if (summaryEl) {
    summaryEl.innerHTML = State.cart.map(c =>
      `<div class="summary-row"><span>${c.title} (${c.fmt})</span><span>${currency(c.price * c.qty)}</span></div>`
    ).join('') + (shipping ? `<div class="summary-row"><span>Shipping</span><span>${currency(shipping)}</span></div>` : '');
  }
  if (totalEl) totalEl.textContent = currency(total);
}

function persistCart()     { localStorage.setItem('dadada_cart', JSON.stringify(State.cart)); }
function updateCartBadge() {
  const n = State.cart.reduce((s, c) => s + c.qty, 0);
  ['cartBadge', 'drawerCartBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });
}

/* ══════════════════════════════════════
   BOOK READER
══════════════════════════════════════ */
function openReader(id) {
  const w = State.works.find(x => x.id === id);
  if (!w) return;
  document.getElementById('readerTitle').textContent = `${w.title} — ${w.artist} · Preview`;
  const textCol = document.getElementById('readerText');
  textCol.innerHTML = (w.sections || []).map((s, i) => `
    <div class="reader__section ${i === 0 ? 'is-active' : ''}" data-idx="${i}">
      <h3>${s.title}</h3><p>${s.body}</p>
    </div>`).join('');

  document.getElementById('reader').classList.add('is-open');

  const sections = textCol.querySelectorAll('.reader__section');
  const imgEl    = document.getElementById('readerImage');
  let   plate    = 0;

  function updateReader() {
    const mid = textCol.getBoundingClientRect().top + textCol.clientHeight * 0.4;
    let closest = 0, dist = Infinity;
    sections.forEach((s, i) => {
      const d = Math.abs((s.getBoundingClientRect().top + s.getBoundingClientRect().height / 2) - mid);
      if (d < dist) { dist = d; closest = i; }
    });
    sections.forEach((s, i) => s.classList.toggle('is-active', i === closest));
    if (closest !== plate) {
      plate = closest;
      const src = w.plates?.[closest];
      if (imgEl) {
        if (src) {
          imgEl.innerHTML = `<img src="${src}" alt="Plate ${closest + 1}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:32px">`;
        } else {
          imgEl.innerHTML = `plate ${closest + 1} / ${sections.length}`;
        }
      }
    }
  }

  textCol.addEventListener('scroll', updateReader, { passive: true });
  updateReader();
}

function closeReader() { document.getElementById('reader')?.classList.remove('is-open'); }

/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
function doSearch(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) { if (State.page === 'search') showPage(State.prevPage); return; }

  const results = State.works.filter(w =>
    [w.title, w.artist, w.type, w.description, w.location, ...(w.tags || [])].some(s => s?.toLowerCase().includes(q))
  );

  const header = document.getElementById('searchHeader');
  const list   = document.getElementById('searchResults');

  if (header) header.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`;
  if (list) {
    list.innerHTML = results.length
      ? results.map(w => {
          const paid = w.formats.pdf?.price || w.formats.print?.price;
          return `<div class="search-result-row" onclick="openDetail('${w.id}')">
            <span class="u-tag">${w.type}</span>
            <div>
              <div class="search-result-row__title">${w.title}</div>
              <div class="search-result-row__by">${w.artist} · ${w.year} · ${w.location}</div>
            </div>
            <div class="search-result-row__price">${paid ? 'from ' + currency(paid) : 'Free'}</div>
          </div>`;
        }).join('')
      : `<div style="padding:40px 24px;opacity:.4;font-size:11px;letter-spacing:.1em;text-transform:uppercase">Nothing found.</div>`;
  }
  showPage('search');
}

/* ══════════════════════════════════════
   SUBMIT
══════════════════════════════════════ */
function selectSubmitType(el) {
  el.closest('.radio-group').querySelectorAll('.radio-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
  el.setAttribute('aria-pressed', 'true');
}
function handleSubmit() { toast("Submission received — we'll be in touch within 6 weeks"); }

/* ══════════════════════════════════════
   CHECKOUT
══════════════════════════════════════ */
function checkout() {
  if (!State.cart.length) return;
  /* Replace with Razorpay / Stripe / etc. */
  toast('Redirecting to checkout…');
}

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
function currency(amount) {
  const sym = State.config.site?.currencySymbol || '₹';
  return `${sym}${Number(amount).toLocaleString('en-IN')}`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('is-visible'), 2400);
}

/* ══════════════════════════════════════
   MOBILE DRAWER
══════════════════════════════════════ */
function toggleDrawer() {
  const drawer = document.getElementById('navDrawer');
  drawer.classList.contains('is-open') ? closeDrawer() : openDrawer();
}

function openDrawer() {
  const drawer   = document.getElementById('navDrawer');
  const burger   = document.getElementById('navBurger');
  const backdrop = document.getElementById('drawerBackdrop');
  drawer.removeAttribute('hidden');
  drawer.classList.add('is-open');
  burger?.classList.add('is-open');
  burger?.setAttribute('aria-expanded', 'true');
  backdrop?.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const drawer   = document.getElementById('navDrawer');
  const burger   = document.getElementById('navBurger');
  const backdrop = document.getElementById('drawerBackdrop');
  drawer.classList.remove('is-open');
  drawer.setAttribute('hidden', '');
  burger?.classList.remove('is-open');
  burger?.setAttribute('aria-expanded', 'false');
  backdrop?.classList.remove('is-open');
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════
   GLOBAL EVENTS
══════════════════════════════════════ */
function bindGlobalEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('reader')?.classList.contains('is-open')) { closeReader(); return; }
      if (document.getElementById('navDrawer')?.classList.contains('is-open')) { closeDrawer(); return; }
      if (State.page === 'detail') { goBack(); return; }
    }
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      document.getElementById('navSearch')?.focus();
    }
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) closeDrawer(); });
  window.addEventListener('hashchange', routeFromHash);
}

/* ══════════════════════════════════════
   START
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);

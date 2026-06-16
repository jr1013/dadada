/* ============================================================
   DADADA — dadada.in — app.js
   ============================================================ */
'use strict';

/* ── FONT SIZE ── */
const FONT_STEPS  = ['sm', 'md', 'lg', 'xl'];
const FONT_VALUES = { sm: '11px', md: '13px', lg: '15px', xl: '17px' };
const FONT_LABELS = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'X-Large' };
let fontIndex = 1;

function changeFontSize(dir) {
  fontIndex = Math.max(0, Math.min(FONT_STEPS.length - 1, fontIndex + dir));
  applyFont();
}

function applyFont() {
  const step = FONT_STEPS[fontIndex];
  const size = FONT_VALUES[step];

  /* Set on <html> so all rem/em and CSS var(--t-*) cascade correctly */
  document.documentElement.style.fontSize = size;

  /* Also patch every CSS variable that controls type */
  document.documentElement.style.setProperty('--t-xs',   size);
  document.documentElement.style.setProperty('--t-sm',   size);
  document.documentElement.style.setProperty('--t-base', size);

  localStorage.setItem('dadada_font', step);

  /* Show indicator toast */
  showFontIndicator(FONT_LABELS[step]);
}

function showFontIndicator(label) {
  let ind = document.getElementById('fontIndicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'fontIndicator';
    ind.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
      'background:var(--ink)', 'color:var(--paper)',
      'font-family:var(--font)', 'font-size:11px',
      'letter-spacing:0.14em', 'text-transform:uppercase',
      'padding:10px 18px', 'pointer-events:none',
      'transition:opacity 0.3s', 'opacity:0'
    ].join(';');
    document.body.appendChild(ind);
  }
  ind.textContent = 'Font — ' + label;
  ind.style.opacity = '1';
  clearTimeout(ind._t);
  ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 1800);
}

/* ── THEME ── */
function initTheme() {
  /* Font */
  const savedFont = localStorage.getItem('dadada_font');
  if (savedFont) {
    const idx = FONT_STEPS.indexOf(savedFont);
    if (idx >= 0) fontIndex = idx;
  }
  applyFont();

  /* Theme */
  const saved = localStorage.getItem('dadada_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dadada_theme', theme);

  const icon   = document.getElementById('themeIcon');
  const drawer = document.getElementById('drawerThemeBtn');
  const meta   = document.getElementById('metaTheme');
  const btn    = document.getElementById('themeBtn');

  if (icon)   icon.textContent = theme === 'dark' ? '○' : '●';
  if (drawer) drawer.textContent = theme === 'dark' ? '◑ Light' : '◑ Dark';
  if (meta)   meta.setAttribute('content', theme === 'dark' ? '#111110' : '#f5f3ee');
  if (btn)    btn.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
/* ── STATE ── */
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

/* ── INIT ── */
async function init() {
  initTheme();
  try {
    const [wRes, cRes] = await Promise.all([
      fetch('data/works.json'),
      fetch('data/config.json'),
    ]);
    State.works  = await wRes.json();
    State.config = await cRes.json();
  } catch (e) {
    console.warn('JSON load failed — check data/ folder.');
  }
  buildMarquee();
  buildFeatured();
  renderCatalogue('all');
  updateCartBadge();
  bindGlobalEvents();
  routeFromHash();
}

/* ── ROUTING ── */
function routeFromHash() {
  const hash = location.hash.replace('#', '') || 'home';
  showPage(hash);
}

function showPage(id) {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.hidden = (el.dataset.page !== id);
  });
  document.querySelectorAll('.nav__tab').forEach(btn => {
    btn.setAttribute('aria-current', btn.dataset.page === id ? 'page' : 'false');
  });
  document.querySelectorAll('.nav__drawer-link[data-page]').forEach(btn => {
    btn.setAttribute('aria-current', btn.dataset.page === id ? 'page' : 'false');
  });
  State.prevPage = State.page;
  State.page = id;
  location.hash = id;
  window.scrollTo(0, 0);
  if (id === 'cart') renderCart();
}

function goBack() {
  const target = ['detail', 'search'].includes(State.prevPage) ? 'catalogue' : State.prevPage;
  showPage(target);
}

/* ── MARQUEE ── */
function buildMarquee() {
  const el = document.getElementById('marqueeInner');
  if (!el || !State.works.length) return;
  const items = State.works.map(w => `<span class="marquee__item">${w.title} — ${w.artist}</span>`).join('');
  el.innerHTML = items + items;
}

/* ── HOME FEATURED ── */
function buildFeatured() {
  const el = document.getElementById('featuredRow');
  if (!el) return;
  State.works.slice(0, 3).forEach(w => {
    const lowestPaid = w.formats.pdf?.price || w.formats.print?.price;
    el.insertAdjacentHTML('beforeend', `
      <div class="feat-card" onclick="openDetail('${w.id}')" role="article" tabindex="0">
        <div class="feat-card__cover">
          <div class="feat-card__cover-label">${w.year}<br>${w.type}</div>
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

/* ── CATALOGUE ── */
function renderCatalogue(filter) {
  const grid  = document.getElementById('catGrid');
  const count = document.getElementById('catCount');
  if (!grid) return;
  const works = filter === 'all' ? State.works : State.works.filter(w => w.type === filter);
  grid.innerHTML = '';
  works.forEach(w => {
    const badges = [];
    if (w.formats.digital?.available) badges.push('<span class="fmt-badge">Read free</span>');
    if (w.formats.pdf?.available)     badges.push(`<span class="fmt-badge fmt-badge--paid">PDF ${currency(w.formats.pdf.price)}</span>`);
    if (w.formats.print?.available)   badges.push(`<span class="fmt-badge fmt-badge--paid">Print ${currency(w.formats.print.price)}</span>`);
    grid.insertAdjacentHTML('beforeend', `
      <div class="cat-card" onclick="openDetail('${w.id}')" role="article" tabindex="0">
        <div class="cat-card__cover">
          <span class="cat-card__type-pip">${w.type}</span>${w.year}
        </div>
        <div class="cat-card__body">
          <div class="cat-card__title">${w.title}</div>
          <div class="cat-card__by">${w.artist} · ${w.location}</div>
          <div class="cat-card__formats">${badges.join('')}</div>
        </div>
      </div>`);
  });
  if (count) count.textContent = `${works.length} work${works.length !== 1 ? 's' : ''}`;
}

function filterCatalogue(type, btn) {
  document.querySelectorAll('.cat-filter').forEach(b => b.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', 'true');
  renderCatalogue(type);
}

/* ── DETAIL ── */
function openDetail(id) {
  const w = State.works.find(x => x.id === id);
  if (!w) return;
  State.detail = w;
  State.fmt = { type: 'digital', price: 0 };
  State.qty = 1;

  const thumbStrip = document.getElementById('detThumbs');
  thumbStrip.innerHTML = '';
  const plates = w.type === 'video'
    ? ['00:00', '10:20', '25:40', '38:50']
    : (w.sections || []).slice(0, 4).map((s, i) => `Plate ${i + 1}`);
  plates.forEach((p, i) => {
    thumbStrip.insertAdjacentHTML('beforeend',
      `<button class="det__thumb" aria-selected="${i === 0}" onclick="selectThumb(this,'${p}',${i})">${p}</button>`);
  });

  document.getElementById('detCoverMain').innerHTML =
    `<div>${w.title}<br><span style="font-size:8px;opacity:.4">${w.artist}</span><br><span style="font-size:7px;opacity:.2">[cover image]</span></div>`;

  const fmtOpts = [fmtOption('digital', 0, 'Read online', 'Free in the book reader', true)];
  if (w.formats.pdf?.available)   fmtOpts.push(fmtOption('pdf',   w.formats.pdf.price,   'PDF download',  'Print-ready. Delivered by email.', false));
  if (w.formats.print?.available) fmtOpts.push(fmtOption('print', w.formats.print.price, 'Print edition', w.printRun || '', false));

  const metaRows = w.type === 'video'
    ? `<tr><td>Duration</td><td>${w.duration}</td></tr><tr><td>Language</td><td>${w.language}</td></tr><tr><td>Edition</td><td>${w.edition}</td></tr>`
    : `<tr><td>Pages</td><td>${w.pages}</td></tr><tr><td>Language</td><td>${w.language}</td></tr><tr><td>Edition</td><td>${w.edition}</td></tr>${w.printRun ? `<tr><td>Print run</td><td>${w.printRun}</td></tr>` : ''}${w.printSpecs ? `<tr><td>Specs</td><td>${w.printSpecs}</td></tr>` : ''}`;

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
    <button class="btn-add-main" id="addBtn" onclick="addToCart()">Read online — free</button>
    ${w.preview ? `<button class="btn-preview" onclick="openReader('${w.id}')">Read a preview →</button>` : ''}
    <span class="det__section-label">Details</span>
    <table class="meta-table"><tbody>${metaRows}</tbody></table>
    <span class="det__section-label">Tags</span>
    <div class="tag-cloud">${tags}</div>`;

  showPage('detail');
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

function selectThumb(el, label, idx) {
  document.querySelectorAll('.det__thumb').forEach(b => b.setAttribute('aria-selected', 'false'));
  el.setAttribute('aria-selected', 'true');
  document.getElementById('detCoverMain').innerHTML =
    `<div>${State.detail?.title || ''}<br><span style="font-size:8px;opacity:.4">${label}</span><br><span style="font-size:7px;opacity:.2">[image ${idx + 1}]</span></div>`;
}

/* ── CART ── */
function addToCart() {
  if (!State.detail) return;
  const { type, price } = State.fmt;
  if (price === 0) { openReader(State.detail.id); return; }
  const key = `${State.detail.id}::${type}`;
  const existing = State.cart.find(c => c.key === key);
  if (existing) { existing.qty += State.qty; }
  else { State.cart.push({ key, id: State.detail.id, title: State.detail.title, artist: State.detail.artist, fmt: type, price, qty: State.qty }); }
  persistCart(); updateCartBadge();
  toast(`"${State.detail.title}" added to cart`);
}

function quickAdd(id) {
  const w = State.works.find(x => x.id === id);
  if (!w) return;
  const price = w.formats.pdf?.price || w.formats.print?.price;
  if (!price) { toast("Open to read online — it's free"); return; }
  const fmt = w.formats.pdf?.available ? 'pdf' : 'print';
  const key = `${w.id}::${fmt}`;
  const existing = State.cart.find(c => c.key === key);
  if (existing) { existing.qty++; }
  else { State.cart.push({ key, id: w.id, title: w.title, artist: w.artist, fmt, price, qty: 1 }); }
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
    itemsEl.innerHTML = `<div class="cart-empty"><p>Your cart is empty.</p><button class="btn btn--light" onclick="showPage('catalogue')" style="margin-top:8px">Browse catalogue</button></div>`;
    if (summaryEl) summaryEl.innerHTML = '';
    if (totalEl) totalEl.textContent = currency(0);
    return;
  }

  itemsEl.innerHTML = '';
  let subtotal = 0;
  State.cart.forEach(item => {
    const line = item.price * item.qty;
    subtotal += line;
    const fmtLabel = { pdf: 'PDF download', print: 'Print edition', digital: 'Digital' }[item.fmt] || item.fmt;
    itemsEl.insertAdjacentHTML('beforeend', `
      <div class="cart-row">
        <div class="cart-thumb">${item.title.charAt(0)}</div>
        <div>
          <div class="cart-item__title">${item.title}</div>
          <div class="cart-item__by">${item.artist}</div>
          <span class="cart-item__fmt">${fmtLabel}</span>
          ${item.fmt === 'print' ? `<div class="cart-item__qty"><button onclick="changeCartQty('${item.key}',-1)">−</button><span>${item.qty}</span><button onclick="changeCartQty('${item.key}',1)">+</button></div>` : ''}
          <button class="cart-remove" onclick="removeFromCart('${item.key}')">Remove</button>
        </div>
        <div class="cart-price">${currency(line)}</div>
      </div>`);
  });

  const shipping = State.cart.some(c => c.fmt === 'print') ? (State.config.site?.shipping?.domestic || 150) : 0;
  const total = subtotal + shipping;
  if (summaryEl) {
    summaryEl.innerHTML = State.cart.map(c =>
      `<div class="summary-row"><span>${c.title} (${c.fmt})</span><span>${currency(c.price * c.qty)}</span></div>`
    ).join('') + (shipping ? `<div class="summary-row"><span>Shipping</span><span>${currency(shipping)}</span></div>` : '');
  }
  if (totalEl) totalEl.textContent = currency(total);
}

function persistCart() { localStorage.setItem('dadada_cart', JSON.stringify(State.cart)); }

function updateCartBadge() {
  const n = State.cart.reduce((s, c) => s + c.qty, 0);
  ['cartBadge', 'drawerCartBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });
}

/* ── READER ── */
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
  const imgEl = document.getElementById('readerImage');
  textCol.addEventListener('scroll', () => {
    const mid = textCol.getBoundingClientRect().top + textCol.clientHeight * 0.4;
    let closest = 0, dist = Infinity;
    sections.forEach((s, i) => {
      const d = Math.abs((s.getBoundingClientRect().top + s.getBoundingClientRect().height / 2) - mid);
      if (d < dist) { dist = d; closest = i; }
    });
    sections.forEach((s, i) => s.classList.toggle('is-active', i === closest));
    if (imgEl) imgEl.innerHTML = `preview<br><span style="font-size:8px;opacity:.4">plate ${closest + 1} / ${sections.length}</span>`;
  }, { passive: true });
}

function closeReader() { document.getElementById('reader')?.classList.remove('is-open'); }

/* ── SEARCH ── */
function doSearch(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) { if (State.page === 'search') showPage(State.prevPage); return; }
  const results = State.works.filter(w =>
    [w.title, w.artist, w.type, w.description, ...(w.tags || [])].some(s => s?.toLowerCase().includes(q))
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
            <div><div class="search-result-row__title">${w.title}</div><div class="search-result-row__by">${w.artist} · ${w.year}</div></div>
            <div class="search-result-row__price">${paid ? 'from ' + currency(paid) : 'Free'}</div>
          </div>`;
        }).join('')
      : `<div style="padding:40px 24px;opacity:.4;font-size:11px;letter-spacing:.1em;text-transform:uppercase">Nothing found.</div>`;
  }
  showPage('search');
}

/* ── SUBMIT ── */
function selectSubmitType(el) {
  el.closest('.radio-group').querySelectorAll('.radio-opt').forEach(b => b.setAttribute('aria-pressed', 'false'));
  el.setAttribute('aria-pressed', 'true');
}
function handleSubmit() { toast("Submission received — we'll be in touch within 6 weeks"); }

/* ── CHECKOUT ── */
function checkout() {
  if (!State.cart.length) return;
  toast('Redirecting to checkout…');
}

/* ── UTILS ── */
function currency(amount) {
  const sym = State.config.site?.currencySymbol || '₹';
  return `${sym}${amount.toLocaleString('en-IN')}`;
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('is-visible'), 2400);
}

/* ── MOBILE DRAWER ── */
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

/* ── GLOBAL EVENTS ── */
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

document.addEventListener('DOMContentLoaded', init);

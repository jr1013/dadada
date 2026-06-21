/* ============================================================
   DADADA — flipbook.js
   Photo book flipbook with CSS 3D page-turn animation.
   Keyboard, arrow, drag-corner, auto-flip, thumbnail nav.
   ============================================================ */
'use strict';

const FB = {
  work:        null,
  pages:       [],   /* all image URLs in order: [cover, p1, p2, ...] */
  spread:      0,    /* current spread index (0 = cover, 1 = pages 1-2, etc.) */
  total:       0,    /* total number of spreads */
  flipping:    false,
  autoTimer:   null,
  autoOn:      false,
  thumbsOpen:  false,
  hintShown:   false,
};

/* ══════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════ */
async function init() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('work');

  try {
    const res   = await fetch('data/works.json');
    const works = await res.json();
    FB.work = works.find(w => w.id === id);
  } catch (e) {
    console.warn('Could not load works.json', e);
  }

  if (!FB.work) {
    document.getElementById('fbLoading').querySelector('.fb-loading__text').textContent = 'Book not found.';
    return;
  }

  /* Build page array: cover first, then all plates */
  const cover  = FB.work.cover  ? [FB.work.cover]  : [];
  const plates = FB.work.plates ? FB.work.plates    : [];
  FB.pages = [...cover, ...plates];

  if (!FB.pages.length) {
    document.getElementById('fbLoading').querySelector('.fb-loading__text').textContent = 'No images found for this book.';
    return;
  }

  /* Preload all images so flips are instant */
  await preloadImages(FB.pages);

  /* spreads: spread 0 = cover (single), spread 1 = pages[1]+pages[2], etc. */
  FB.total = Math.ceil((FB.pages.length - 1) / 2) + 1; /* +1 for cover spread */

  document.getElementById('fbTitle').textContent =
    `${FB.work.title} — ${FB.work.artist}`;

  buildThumbnails();
  renderSpread(0, false);
  bindEvents();

  /* Hide loading screen */
  setTimeout(() => {
    document.getElementById('fbLoading').classList.add('is-hidden');
  }, 300);
}

/* ══════════════════════════════════════
   IMAGE PRELOAD
══════════════════════════════════════ */
function preloadImages(urls) {
  return Promise.all(urls.map(src => new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = src;
  })));
}

/* ══════════════════════════════════════
   PAGE INDEX HELPERS
   spread 0            → cover only (left side empty, right = pages[0])
   spread 1            → pages[1] left, pages[2] right
   spread 2            → pages[3] left, pages[4] right …
══════════════════════════════════════ */
function spreadToPageIndices(spread) {
  if (spread === 0) return { left: null, right: 0 };
  const base = (spread - 1) * 2 + 1;
  return {
    left:  base     < FB.pages.length ? base     : null,
    right: base + 1 < FB.pages.length ? base + 1 : null,
  };
}

/* ══════════════════════════════════════
   RENDER SPREAD (no animation)
══════════════════════════════════════ */
function renderSpread(spread, animate) {
  FB.spread = Math.max(0, Math.min(FB.total - 1, spread));
  const { left, right } = spreadToPageIndices(FB.spread);

  /* Left page */
  const imgLeft  = document.getElementById('imgLeft');
  const numLeft  = document.getElementById('numLeft');
  const pageLeft = document.getElementById('pageLeft');

  if (left !== null) {
    imgLeft.src          = FB.pages[left];
    imgLeft.style.display = '';
    numLeft.textContent  = left + 1;
    pageLeft.style.display = '';
  } else {
    imgLeft.src          = '';
    imgLeft.style.display = 'none';
    numLeft.textContent  = '';
    /* On cover spread hide the left page entirely */
    pageLeft.style.display = spread === 0 ? 'none' : '';
  }

  /* Right page */
  const imgRight  = document.getElementById('imgRight');
  const numRight  = document.getElementById('numRight');
  const pageRight = document.getElementById('pageRight');

  if (right !== null) {
    imgRight.src           = FB.pages[right];
    imgRight.style.display = '';
    numRight.textContent   = right + 1;
    pageRight.style.display = '';
  } else {
    imgRight.src           = '';
    imgRight.style.display = 'none';
    numRight.textContent   = '';
    pageRight.style.display = '';
  }

  /* Cover: single page centered */
  document.getElementById('fbBook').classList.toggle('is-cover', spread === 0);

  updateCounter();
  updateArrows();
  updateThumbnailHighlight();
}

/* ══════════════════════════════════════
   FLIP ANIMATION
   direction: 'forward' (next) | 'backward' (prev)
══════════════════════════════════════ */
function doFlip(direction) {
  if (FB.flipping) return;
  const next = direction === 'forward' ? FB.spread + 1 : FB.spread - 1;
  if (next < 0 || next >= FB.total) return;

  FB.flipping = true;

  const flip = document.getElementById('fbFlip');
  const { left: curLeft, right: curRight } = spreadToPageIndices(FB.spread);
  const { left: nxLeft,  right: nxRight  } = spreadToPageIndices(next);

  if (direction === 'forward') {
    /* The right page of the current spread lifts and turns to reveal
       the left page of the next spread on its back */
    const frontSrc = curRight !== null ? FB.pages[curRight] : '';
    const backSrc  = nxLeft  !== null  ? FB.pages[nxLeft]  : '';
    const frontNum = curRight !== null ? curRight + 1 : '';
    const backNum  = nxLeft  !== null  ? nxLeft  + 1 : '';

    document.getElementById('flipFront').src          = frontSrc;
    document.getElementById('flipBack').src           = backSrc;
    document.getElementById('numFlipFront').textContent = frontNum;
    document.getElementById('numFlipBack').textContent  = backNum;

    /* Position flip page over the right side */
    flip.style.left            = 'var(--page-w)';
    flip.style.transformOrigin = 'left center';
    flip.style.transform       = 'rotateY(0deg)';
    flip.classList.remove('flip-backward', 'is-flipping');

    /* Force reflow */
    void flip.offsetWidth;

    flip.classList.add('is-flipping');
    flip.style.transition = 'transform 0.65s cubic-bezier(0.645, 0.045, 0.355, 1.000)';
    flip.style.transform  = 'rotateY(-180deg)';

  } else {
    /* Backward: the left page of current spread flips back to reveal
       the right page of the previous spread on its back */
    const frontSrc = curLeft !== null ? FB.pages[curLeft] : '';
    const backSrc  = nxRight !== null ? FB.pages[nxRight] : '';
    const frontNum = curLeft !== null ? curLeft + 1 : '';
    const backNum  = nxRight !== null ? nxRight + 1 : '';

    document.getElementById('flipFront').src           = frontSrc;
    document.getElementById('flipBack').src            = backSrc;
    document.getElementById('numFlipFront').textContent = frontNum;
    document.getElementById('numFlipBack').textContent  = backNum;

    flip.style.left            = '0';
    flip.style.transformOrigin = 'right center';
    flip.style.transform       = 'rotateY(0deg)';
    flip.classList.remove('flip-forward', 'is-flipping');

    void flip.offsetWidth;

    flip.classList.add('is-flipping');
    flip.style.transition = 'transform 0.65s cubic-bezier(0.645, 0.045, 0.355, 1.000)';
    flip.style.transform  = 'rotateY(180deg)';
  }

  /* After animation: commit the new spread to the static pages */
  setTimeout(() => {
    flip.classList.remove('is-flipping');
    flip.style.transition = 'none';
    flip.style.transform  = 'rotateY(0deg)';
    /* Reset to default resting position off-screen right */
    flip.style.left            = 'var(--page-w)';
    flip.style.transformOrigin = 'left center';

    renderSpread(next, false);
    FB.flipping = false;
  }, 680);
}

function flipRight()  { doFlip('forward'); }
function flipLeft()   { doFlip('backward'); }

/* ══════════════════════════════════════
   COUNTER + ARROWS
══════════════════════════════════════ */
function updateCounter() {
  const { left, right } = spreadToPageIndices(FB.spread);
  const parts = [];
  if (left  !== null) parts.push(left  + 1);
  if (right !== null) parts.push(right + 1);
  const pageStr = parts.length ? `Pages ${parts.join('–')}` : 'Cover';
  document.getElementById('fbCounter').textContent =
    `${pageStr}  ·  ${FB.spread + 1} / ${FB.total}`;
}

function updateArrows() {
  document.getElementById('arrowLeft').disabled  = FB.spread <= 0;
  document.getElementById('arrowRight').disabled = FB.spread >= FB.total - 1;
}

/* ══════════════════════════════════════
   THUMBNAILS
══════════════════════════════════════ */
function buildThumbnails() {
  const grid = document.getElementById('fbThumbGrid');
  grid.innerHTML = FB.pages.map((src, i) => `
    <button class="fb-thumb ${i === 0 ? 'is-active' : ''}" data-page="${i}" onclick="jumpToPage(${i})">
      <img src="${src}" alt="Page ${i+1}">
      <div class="fb-thumb__num">${i + 1}</div>
    </button>
  `).join('');
}

function updateThumbnailHighlight() {
  const { left, right } = spreadToPageIndices(FB.spread);
  document.querySelectorAll('.fb-thumb').forEach(t => {
    const p = parseInt(t.dataset.page);
    t.classList.toggle('is-active', p === left || p === right);
  });
  /* Scroll active thumb into view */
  const active = document.querySelector('.fb-thumb.is-active');
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function toggleThumbs() {
  FB.thumbsOpen = !FB.thumbsOpen;
  document.getElementById('fbThumbs').hidden = !FB.thumbsOpen;
  document.getElementById('fbThumbBtn').classList.toggle('is-active', FB.thumbsOpen);
}

function jumpToPage(pageIdx) {
  /* Convert page index to spread index */
  let targetSpread;
  if (pageIdx === 0) {
    targetSpread = 0;
  } else {
    targetSpread = Math.floor((pageIdx) / 2) + (pageIdx % 2 === 0 ? 0 : 1);
    targetSpread = Math.ceil(pageIdx / 2);
  }
  targetSpread = Math.min(targetSpread, FB.total - 1);
  renderSpread(targetSpread, false);
}

/* ══════════════════════════════════════
   AUTO-FLIP
══════════════════════════════════════ */
function toggleAuto() {
  FB.autoOn = !FB.autoOn;
  const btn = document.getElementById('fbAutoBtn');
  btn.classList.toggle('is-active', FB.autoOn);
  btn.textContent = FB.autoOn ? '⏸ Auto' : '⏵ Auto';
  if (FB.autoOn) {
    FB.autoTimer = setInterval(() => {
      if (FB.spread >= FB.total - 1) {
        /* reached the end — stop */
        toggleAuto();
      } else {
        flipRight();
      }
    }, 3200);
  } else {
    clearInterval(FB.autoTimer);
    FB.autoTimer = null;
  }
}

/* ══════════════════════════════════════
   FULLSCREEN
══════════════════════════════════════ */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

/* ══════════════════════════════════════
   DRAG-CORNER TO FLIP
   User can drag the right or left edge
   of the book to initiate a flip.
══════════════════════════════════════ */
function bindDragFlip() {
  const book = document.getElementById('fbBook');
  let startX = 0, startY = 0, dragging = false, side = null;

  function onStart(e) {
    const rect = book.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = clientX - rect.left;
    const bookW = rect.width;

    /* Only trigger if click is within 80px of either edge */
    if (relX < 80) {
      side = 'left'; dragging = true;
    } else if (relX > bookW - 80) {
      side = 'right'; dragging = true;
    }
    if (dragging) {
      startX = clientX;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
    }
  }

  function onEnd(e) {
    if (!dragging) return;
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const dx = clientX - startX;
    dragging = false;

    if (Math.abs(dx) > 40) {
      if (dx < 0 && side === 'right') flipRight();
      if (dx > 0 && side === 'left')  flipLeft();
    }
    side = null;
  }

  book.addEventListener('mousedown',  onStart);
  book.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('mouseup',   onEnd);
  document.addEventListener('touchend',  onEnd, { passive: true });
}

/* ══════════════════════════════════════
   KEYBOARD
══════════════════════════════════════ */
function bindEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault(); flipRight();
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); flipLeft();
    }
    if (e.key === 'Escape') goBack();
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    if (e.key === 't' || e.key === 'T') toggleThumbs();
    if (e.key === 'a' || e.key === 'A') toggleAuto();
  });

  bindDragFlip();
}

/* ══════════════════════════════════════
   NAVIGATION BACK
══════════════════════════════════════ */
function goBack() {
  if (FB.autoTimer) clearInterval(FB.autoTimer);
  const id = FB.work?.id;
  if (id) sessionStorage.setItem('dadada_return_work', id);
  const indexPath = location.href.split('?')[0].replace(/flipbook\.html$/, 'index.html');
  location.href = indexPath + '#detail';
}

document.addEventListener('DOMContentLoaded', init);

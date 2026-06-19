/* ============================================================
   DADADA — read.js
   Cinematic / narrated reading mode for image essays.
   Browser TTS + word-level highlight, synced image changes.
   Two modes: manual scroll / auto-advance.
   ============================================================ */
'use strict';

const ReadState = {
  work:          null,
  mode:          'manual',
  voiceOn:       true,
  speaking:      false,
  paused:        false,
  chapterIdx:    0,
  utterance:     null,
  scrollHandler: null,
};

const synth = window.speechSynthesis;

/* ── BOOTSTRAP ── */
async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('work');

  try {
    const res = await fetch('data/works.json');
    const works = await res.json();
    ReadState.work = works.find(w => w.id === id) || works.find(w => w.type === 'image essay');
  } catch (e) {
    console.warn('Could not load works.json', e);
  }

  if (!ReadState.work) {
    const ph = document.getElementById('stagePlaceholder');
    if (ph) ph.textContent = 'Work not found';
    return;
  }

  /* Populate end screen title */
  document.getElementById('endTitle').textContent = ReadState.work.title;

  buildChapterIndex();
  buildStage();

  /* Skip the start overlay — open directly in manual mode */
  const startEl = document.getElementById('readStart');
  if (startEl) startEl.style.display = 'none';

  setMode('manual');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      buildChapters();
      bindManualScrollWatcher();
      speakChapter(0);
    });
  });
}

/* ── START OVERLAY ── 
function renderStartOverlay() {
  const w = ReadState.work;
  document.getElementById('startType').textContent   = w.type;
  document.getElementById('startTitle').textContent  = w.title;
  document.getElementById('startArtist').textContent = `${w.artist} · ${w.location} · ${w.year}`;
  document.getElementById('startDesc').textContent   = w.description;
  document.getElementById('endTitle').textContent    = w.title;
}

function chooseStartMode(mode) {
  ReadState.mode = mode;
  document.getElementById('startModeManual').setAttribute('aria-pressed', mode === 'manual');
  document.getElementById('startModeAuto').setAttribute('aria-pressed', mode === 'auto');
}

function beginRead() {
  setMode(ReadState.mode);
  document.getElementById('readStart').classList.add('is-hidden');
  buildChapters();
  if (ReadState.mode === 'auto') {
    startAutoChapter(0);
  } else {
    bindManualScrollWatcher();
    speakChapter(0);
  }
} */

/* ── MODE SWITCHING ── */
function setMode(mode) {
  ReadState.mode = mode;
  document.getElementById('tabManual').setAttribute('aria-pressed', mode === 'manual');
  document.getElementById('tabAuto').setAttribute('aria-pressed', mode === 'auto');
  document.getElementById('autoBar').classList.toggle('is-visible', mode === 'auto');

  stopSpeaking();

  if (mode === 'auto') {
    if (ReadState.scrollHandler) {
      document.getElementById('textTrack').removeEventListener('scroll', ReadState.scrollHandler);
      ReadState.scrollHandler = null;
    }
    startAutoChapter(ReadState.chapterIdx);
  } else {
    bindManualScrollWatcher();
    speakChapter(ReadState.chapterIdx);
  }
}

/* ── STAGE (image side) ── */
function buildStage() {
  const w = ReadState.work;
  const frame = document.getElementById('stageFrame');
  const plates = w.plates || [];

  frame.innerHTML = plates.length
    ? plates.map((src, i) =>
        `<img src="${src}" alt="Plate ${i+1}" class="read-stage__img ${i===0?'is-active':''}" data-idx="${i}">`
      ).join('')
    : `<div class="read-stage__placeholder">${w.title}</div>`;

  const dots = document.getElementById('stageDots');
  dots.innerHTML = plates.map((_, i) =>
    `<button class="read-dot ${i===0?'is-active':''}" data-idx="${i}" onclick="jumpToPlate(${i})" aria-label="Image ${i+1}"></button>`
  ).join('');

  updateStageCaption(0);
}

function setActivePlate(idx) {
  const w = ReadState.work;
  const safeIdx = Math.min(idx, Math.max((w.plates||[]).length - 1, 0));
  document.querySelectorAll('.read-stage__img').forEach(img =>
    img.classList.toggle('is-active', parseInt(img.dataset.idx) === safeIdx)
  );
  document.querySelectorAll('.read-dot').forEach(dot =>
    dot.classList.toggle('is-active', parseInt(dot.dataset.idx) === safeIdx)
  );
  updateStageCaption(safeIdx);
}

function updateStageCaption(idx) {
  const w = ReadState.work;
  const cap = document.getElementById('stageCaption');
  if (cap) cap.textContent = `${w.title}, plate ${idx + 1} — ${w.artist}, ${w.year}`;
}

function jumpToPlate(idx) {
  const w = ReadState.work;
  const plateLen = (w.plates || []).length || 1;
  const chapterIdx = (w.sections || []).findIndex((_, i) => (i % plateLen) === idx);
  if (chapterIdx > -1) {
    if (ReadState.mode === 'auto') {
      startAutoChapter(chapterIdx);
    } else {
      document.querySelector(`.read-chapter[data-idx="${chapterIdx}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    setActivePlate(idx);
  }
}

/* ── CHAPTER INDEX ── */
function buildChapterIndex() {
  const w = ReadState.work;
  const el = document.getElementById('chapterIndex');
  el.innerHTML = (w.sections || []).map((s, i) =>
    `<button class="chapter-index__item" data-idx="${i}" aria-current="${i===0}" onclick="jumpToChapter(${i})">${toRoman(i+1)}. ${s.title}</button>`
  ).join('');
}

function jumpToChapter(idx) {
  if (ReadState.mode === 'auto') {
    startAutoChapter(idx);
  } else {
    document.querySelector(`.read-chapter[data-idx="${idx}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateChapterIndexHighlight(idx) {
  document.querySelectorAll('.chapter-index__item').forEach(btn =>
    btn.setAttribute('aria-current', parseInt(btn.dataset.idx) === idx)
  );
}

function toRoman(num) {
  const r = ['I','II','III','IV','V','VI','VII','VIII','IX','X',
             'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
  return r[num - 1] || num;
}

/* ── BUILD CHAPTERS (word spans for highlight) ── */
function buildChapters() {
  const w = ReadState.work;
  const track = document.getElementById('textTrack');
  const plateCount = (w.plates || []).length || 1;

  track.innerHTML = (w.sections || []).map((s, i) => {
    const plateIdx = i % plateCount;
    const wordsHtml = wrapWords(s.body, i);
    return `
      <div class="read-chapter" data-idx="${i}" data-plate="${plateIdx}">
        <div class="read-chapter__num">Chapter ${toRoman(i+1)}</div>
        <div class="read-chapter__title">${s.title}</div>
        <div class="read-chapter__body" id="chapterBody-${i}">${wordsHtml}</div>
      </div>`;
  }).join('');

  if (track.firstElementChild) track.firstElementChild.classList.add('is-active');
}

function wrapWords(text, chapterIdx) {
  return text.split(/\s+/).map((word, wi) =>
    `<span class="read-word" data-chapter="${chapterIdx}" data-word="${wi}">${word}</span>`
  ).join(' ');
}

/* ── MANUAL MODE ── */
function bindManualScrollWatcher() {
  const track = document.getElementById('textTrack');
  if (ReadState.scrollHandler) track.removeEventListener('scroll', ReadState.scrollHandler);

  function update() {
    const blocks = document.querySelectorAll('.read-chapter');
    const rect = track.getBoundingClientRect();
    const triggerY = rect.top + rect.height * 0.3;
    let activeIdx = 0, best = -Infinity;

    blocks.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      if (r.top <= triggerY && r.top > best) { best = r.top; activeIdx = i; }
    });

    blocks.forEach((b, i) => b.classList.toggle('is-active', i === activeIdx));

    if (activeIdx !== ReadState.chapterIdx) {
      ReadState.chapterIdx = activeIdx;
      setActivePlate(parseInt(blocks[activeIdx].dataset.plate || 0));
      updateChapterIndexHighlight(activeIdx);
      speakChapter(activeIdx);
    }

    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      const lr = lastBlock.getBoundingClientRect();
      if (lr.bottom <= rect.top + rect.height * 0.6) showEndOverlay();
    }
  }

  ReadState.scrollHandler = update;
  track.addEventListener('scroll', update, { passive: true });
}

/* ── AUTO MODE ── */
function startAutoChapter(idx) {
  const blocks = document.querySelectorAll('.read-chapter');
  if (!blocks.length || idx >= blocks.length) { showEndOverlay(); return; }

  ReadState.chapterIdx = idx;
  blocks.forEach((b, i) => b.classList.toggle('is-active', i === idx));
  blocks[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });

  setActivePlate(parseInt(blocks[idx].dataset.plate || 0));
  updateChapterIndexHighlight(idx);
  updateAutoTime();
  speakChapter(idx, true);
}

function nextChapter() { startAutoChapter(ReadState.chapterIdx + 1); }
function prevChapter() { startAutoChapter(Math.max(0, ReadState.chapterIdx - 1)); }

function togglePlay() {
  const btn = document.getElementById('playBtn');
  if (ReadState.speaking && !ReadState.paused) {
    synth.pause();
    ReadState.paused = true;
    if (btn) btn.textContent = '▶';
  } else if (ReadState.paused) {
    synth.resume();
    ReadState.paused = false;
    if (btn) btn.textContent = '❙❙';
  } else {
    startAutoChapter(ReadState.chapterIdx);
  }
}

function updateAutoTime() {
  const total = document.querySelectorAll('.read-chapter').length;
  const fill  = document.getElementById('progressFill');
  const time  = document.getElementById('autoTime');
  if (time) time.textContent = `${ReadState.chapterIdx + 1} / ${total}`;
  if (fill) fill.style.width = `${((ReadState.chapterIdx + 1) / total) * 100}%`;
}

/* ── SPEECH SYNTHESIS + WORD HIGHLIGHT ── */
function speakChapter(idx, autoAdvance) {
  stopSpeaking();
  if (!ReadState.voiceOn) {
    if (autoAdvance) ReadState._dwellTimer = setTimeout(() => nextChapter(), 4500);
    return;
  }

  const body = ReadState.work.sections[idx]?.body;
  if (!body) return;

  const utter = new SpeechSynthesisUtterance(body);
  utter.rate  = 0.95;
  utter.pitch = 1.0;

  const wordEls = document.querySelectorAll(`.read-word[data-chapter="${idx}"]`);
  const words = body.split(/\s+/);
  let charOffsets = [], pos = 0;
  words.forEach(w => { charOffsets.push(pos); pos += w.length + 1; });

  utter.onboundary = (e) => {
    if (e.name !== 'word') return;
    let wordIdx = 0;
    for (let i = 0; i < charOffsets.length; i++) {
      if (charOffsets[i] <= e.charIndex) wordIdx = i; else break;
    }
    wordEls.forEach((el, i) => {
      el.classList.toggle('is-current', i === wordIdx);
      if (i <= wordIdx) el.classList.add('is-spoken');
    });
  };

  utter.onend = () => {
    ReadState.speaking = false;
    wordEls.forEach(el => { el.classList.remove('is-current'); el.classList.add('is-spoken'); });
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.textContent = '▶';
    if (autoAdvance) setTimeout(() => nextChapter(), 600);
  };

  ReadState.speaking  = true;
  ReadState.paused    = false;
  ReadState.utterance = utter;
  const playBtn = document.getElementById('playBtn');
  if (playBtn) playBtn.textContent = '❙❙';
  synth.speak(utter);
}

function stopSpeaking() {
  if (synth.speaking || synth.pending) synth.cancel();
  ReadState.speaking = false;
  ReadState.paused   = false;
  if (ReadState._dwellTimer) { clearTimeout(ReadState._dwellTimer); ReadState._dwellTimer = null; }
}

function toggleVoice() {
  ReadState.voiceOn = !ReadState.voiceOn;
  const icon  = document.getElementById('voiceIcon');
  const label = document.getElementById('voiceLabel');
  const btn   = document.getElementById('voiceBtn');

  if (ReadState.voiceOn) {
    if (icon)  icon.textContent  = '🔊';
    if (label) label.textContent = 'Voice on';
    btn?.classList.remove('is-muted');
    speakChapter(ReadState.chapterIdx, ReadState.mode === 'auto');
  } else {
    if (icon)  icon.textContent  = '🔇';
    if (label) label.textContent = 'Voice off';
    btn?.classList.add('is-muted');
    stopSpeaking();
    if (ReadState.mode === 'auto') ReadState._dwellTimer = setTimeout(() => nextChapter(), 4500);
  }
}

/* ── END OVERLAY ── */
function showEndOverlay() {
  stopSpeaking();
  document.getElementById('readEnd').classList.add('is-visible');
}

function restartRead() {
  document.getElementById('readEnd').classList.remove('is-visible');
  document.getElementById('textTrack').scrollTo({ top: 0, behavior: 'instant' });
  ReadState.chapterIdx = 0;
  if (ReadState.mode === 'auto') {
    startAutoChapter(0);
  } else {
    setActivePlate(0);
    updateChapterIndexHighlight(0);
    speakChapter(0);
  }
}

/* ══════════════════════════════════════
   NAVIGATION — FIXED

   OLD (broken):
     location.href = 'index.html#detail?work=54-rooms'
     → router did showPage('detail?work=54-rooms')
     → no matching [data-page] element → blank screen

   NEW (correct):
     1. Store work id in sessionStorage
     2. Navigate to index.html#detail (clean hash)
     3. app.js routeFromHash() checks sessionStorage,
        waits for works to load, calls openDetail(id)
══════════════════════════════════════ */
function goBackToWork() {
  stopSpeaking();
  const id = ReadState.work?.id;

  if (id) {
    sessionStorage.setItem('dadada_return_work', id);
  }

  /* Derive the index.html path relative to wherever read.html lives.
     Works in any subfolder e.g. /test/, /v2/, root, etc. */
  const indexPath = location.href
    .split('?')[0]
    .replace(/read\.html$/, 'index.html');

  location.href = indexPath + '#detail';
}

/* ── KEYBOARD ── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape')                                   goBackToWork();
  if (e.key === ' ' && ReadState.mode === 'auto')          { e.preventDefault(); togglePlay(); }
  if (e.key === 'ArrowRight' && ReadState.mode === 'auto')  nextChapter();
  if (e.key === 'ArrowLeft'  && ReadState.mode === 'auto')  prevChapter();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopSpeaking();
});

document.addEventListener('DOMContentLoaded', init);

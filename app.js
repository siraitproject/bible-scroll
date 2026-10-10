// Scroll: one random ESV verse per swipe.
// Every verse in the Bible is shuffled once into a saved order, so nothing repeats until the
// whole Bible has been seen; then a new shuffle starts. Only the order and position are saved
// on the device. ESV text is kept in memory only, because Crossway limits stored verses to 500.

(() => {
  const BOOKS = window.BOOKS;
  const TOTAL = BOOKS.reduce((n, [, ch]) => n + ch.reduce((a, b) => a + b, 0), 0);
  const AHEAD = 3;          // slides fetched ahead of the one on screen
  const KEEP = 40;          // slides kept in the page before old ones are removed
  const MEMORY_CACHE = 100; // verses kept in memory (well under Crossway's 500 limit)
  const STORE = 'scroll-state-v1';

  const BLB = ['gen','exo','lev','num','deu','jos','jdg','rth','1sa','2sa','1ki','2ki','1ch','2ch','ezr','neh',
    'est','job','psa','pro','ecc','sng','isa','jer','lam','eze','dan','hos','joe','amo','oba','jon','mic','nah',
    'hab','zep','hag','zec','mal','mat','mar','luk','jhn','act','rom','1co','2co','gal','eph','phl','col','1th',
    '2th','1ti','2ti','tit','phm','heb','jas','1pe','2pe','1jo','2jo','3jo','jud','rev'];

  // ---------- saved order ----------
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.seed && s.total === TOTAL) return s; } catch {}
    return { seed: newSeed(), pos: 0, pass: 1, total: TOTAL };
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
  function newSeed() { return (Math.random() * 2 ** 31) >>> 0 || 1; }

  function shuffled(seed) {
    let a = seed >>> 0; // mulberry32
    const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const order = new Uint16Array(TOTAL);
    for (let i = 0; i < TOTAL; i++) order[i] = i;
    for (let i = TOTAL - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    return order;
  }

  // index (0..TOTAL-1) -> { book, bookIndex, chapter, verse, count }
  function refAt(index) {
    let n = index;
    for (let b = 0; b < BOOKS.length; b++) {
      const [name, chapters] = BOOKS[b];
      for (let c = 0; c < chapters.length; c++) {
        if (n < chapters[c]) return { book: name, bookIndex: b, chapter: c + 1, verse: n + 1, count: chapters[c] };
        n -= chapters[c];
      }
    }
  }
  const label = r => `${r.book} ${r.chapter}:${r.verse}`;

  let state = load();
  let order = shuffled(state.seed);
  save();

  // ---------- ESV fetching (memory cache only) ----------
  const cache = new Map();
  async function api(mode, q) {
    const key = mode + '|' + q;
    if (cache.has(key)) return cache.get(key);
    const p = fetch(`/api/passage?mode=${mode}&q=${encodeURIComponent(q)}`).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Request failed');
      return body;
    });
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    while (cache.size > MEMORY_CACHE) cache.delete(cache.keys().next().value);
    return p;
  }

  // ---------- feed ----------
  const feed = document.getElementById('feed');
  const progress = document.getElementById('progress');
  let nextPos = state.pos; // next position in the order to turn into a slide

  function nextRef() {
    if (nextPos >= TOTAL) return null;
    return { pos: nextPos, ...refAt(order[nextPos++]) };
  }

  function addSlide() {
    const r = nextRef();
    if (!r) return addEndSlide();
    const el = document.createElement('section');
    el.className = 'slide loading';
    el.dataset.pos = r.pos;
    el.innerHTML = `<p class="verse">…</p><div class="ref">${label(r)} <span>ESV</span></div>
      <div class="actions"><button type="button" data-share aria-label="Share">↗</button></div>
      <div class="hint">Tap for context · swipe for next</div>`;
    el._ref = r;
    feed.appendChild(el);
    fill(el, r);
  }

  async function fill(el, r) {
    try {
      const { text } = await api('verse', label(r));
      if (!text) { el.remove(); addSlide(); return; } // verse the ESV keeps only in a footnote
      const v = el.querySelector('.verse');
      v.textContent = text;
      v.classList.toggle('long', text.length > 260);
      el.classList.remove('loading');
    } catch (e) {
      el.classList.remove('loading'); el.classList.add('error');
      el.querySelector('.verse').textContent = 'Could not load this verse. ' + e.message;
    }
  }

  function addEndSlide() {
    if (feed.querySelector('.end')) return;
    const el = document.createElement('section');
    el.className = 'slide end';
    el.innerHTML = `<p class="verse">You have read every verse in the Bible. 🎉</p>
      <div class="ref">Pass ${state.pass} complete</div>
      <div class="hint"><button type="button" data-restart>Start a new shuffle</button></div>`;
    feed.appendChild(el);
  }

  function restart() {
    state = { seed: newSeed(), pos: 0, pass: state.pass + 1, total: TOTAL };
    order = shuffled(state.seed); nextPos = 0; save();
    feed.innerHTML = ''; for (let i = 0; i <= AHEAD; i++) addSlide();
    feed.scrollTop = 0; showProgress();
  }

  function showProgress() {
    progress.textContent = `Pass ${state.pass} · ${(state.pos + 1).toLocaleString()} of ${TOTAL.toLocaleString()}`;
  }

  const seen = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting || !e.target._ref) continue;
      state.pos = e.target._ref.pos; save(); showProgress();
      let i = [...feed.children].indexOf(e.target);
      while (feed.children.length - 1 - i < AHEAD) {
        const before = feed.children.length; addSlide();
        if (feed.children.length === before) break; // end of the shuffle
      }
      // drop old slides, keeping the scroll position steady
      for (; i > KEEP; i--) { const first = feed.firstElementChild; const h = first.offsetHeight; first.remove(); feed.scrollTop -= h; }
    }
  }, { root: feed, threshold: 0.6 });
  new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(n => n.nodeType === 1 && seen.observe(n))))
    .observe(feed, { childList: true });

  for (let i = 0; i <= AHEAD; i++) addSlide();
  showProgress();

  // ---------- context sheet ----------
  const sheet = document.getElementById('sheet');
  const sheetTitle = document.getElementById('sheet-title');
  const sheetPassage = document.getElementById('sheet-passage');
  const sheetLinks = document.getElementById('sheet-links');

  function slug(s) { return s.toLowerCase().replace(/\s+/g, '-'); }
  function links(r) {
    const ref = label(r), q = encodeURIComponent(ref);
    const ew = r.book === 'Psalms' ? 'psalm' : slug(r.book);
    return [
      ['Enduring Word commentary', `${r.book} ${r.chapter}, verse by verse (David Guzik)`, `https://enduringword.com/bible-commentary/${ew}-${r.chapter}/`],
      ['BibleProject', `Guide, overview videos and podcast for ${r.book}`, `https://bibleproject.com/guides/book-of-${slug(r.book)}/`],
      ['Blue Letter Bible', `${r.book} ${r.chapter} with commentaries and original-language tools`, `https://www.blueletterbible.org/esv/${BLB[r.bookIndex]}/${r.chapter}/${r.verse}/`],
      ['Desiring God', `Articles, sermons and devotionals on ${r.book} ${r.chapter}`, `https://www.desiringgod.org/scripture/${slug(r.book)}/${r.chapter}`],
      ['Devotionals', `Web search for devotionals on ${ref}`, `https://www.google.com/search?q=${q}%20devotional`],
      ['Podcasts', `Apple Podcasts episodes about ${ref}`, `https://podcasts.apple.com/us/search?term=${q}`],
      ['Sermons', `YouTube sermons on ${ref}`, `https://www.youtube.com/results?search_query=${q}%20sermon`],
      ['Read the full chapter', `${r.book} ${r.chapter} on esv.org`, `https://www.esv.org/${encodeURIComponent(r.book).replace(/%20/g, '+')}+${r.chapter}/`],
    ];
  }

  async function openSheet(r) {
    sheetTitle.textContent = `${label(r)} in context`;
    sheetLinks.innerHTML = links(r).map(([t, d, u]) =>
      `<li><a href="${u}" target="_blank" rel="noopener">${t}<small>${d}</small></a></li>`).join('');
    sheetPassage.textContent = 'Loading the surrounding verses…';
    sheet.hidden = false;
    const from = Math.max(1, r.verse - 3), to = Math.min(r.count, r.verse + 3);
    try {
      const { html } = await api('context', `${r.book} ${r.chapter}:${from}-${to}`);
      sheetPassage.innerHTML = html;
      const id = 'v' + String(r.bookIndex + 1).padStart(2, '0') + String(r.chapter).padStart(3, '0') + String(r.verse).padStart(3, '0');
      const num = sheetPassage.querySelector(`[id^="${id}"]`);
      if (num) num.classList.add('target');
    } catch (e) {
      sheetPassage.textContent = 'Could not load the surrounding verses. ' + e.message;
    }
  }

  feed.addEventListener('click', async e => {
    if (e.target.closest('[data-restart]')) return restart();
    const slide = e.target.closest('.slide');
    if (!slide || !slide._ref) return;
    if (e.target.closest('[data-share]')) {
      const text = `“${slide.querySelector('.verse').textContent}” — ${label(slide._ref)} (ESV)`;
      try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); alert('Copied'); } } catch {}
      return;
    }
    openSheet(slide._ref);
  });
  sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) sheet.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') sheet.hidden = true; });
})();

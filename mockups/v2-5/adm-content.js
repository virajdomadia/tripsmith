/* Admin redesign · round 3 interiors for Destinations and Reviews (style A Ink rail is fixed).
   Three new page structures per screen, added beside admin-catalog.js's first pass (A):
   Destinations  B Storefront editor · C Season atlas · D Demand ledger
   Reviews       B Moderation deck   · C Insight board · D Page wall
   Data follows admin-catalog.js and the seed (api/content): same six destinations, fifteen packages,
   departures and prices; review texts, counts (3 waiting · 41 published · 2 hidden) and leaders.
   v2.5 additions (Led by X, Verified traveller) carry the small v2.5 chip. Nothing here costs a paid call:
   themes and checks are plain keyword matches. */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON, LEADERS, avatar, stars } = TS;

  const V25 = '<span class="a-chip pri ad-rv-v25" title="New in v2.5">v2.5</span>';
  const each = (root, sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
  const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const NOW_M = 9; // September 2026
  const pd = (s) => { const [d, m, y] = s.split(' '); return new Date(+y, MON.indexOf(m), +d); };
  const shortD = (s) => s.replace(/ 20\d\d$/, '');
  const calm = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; } };
  const GRIP = '<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  const monthRange = (ms) => {
    const set = new Set(ms);
    if (!set.size) return '';
    if (set.size === 12) return 'All year';
    const prev = (m) => ((m + 10) % 12) + 1, next = (m) => (m % 12) + 1;
    return [...set].filter((m) => !set.has(prev(m))).sort((a, b) => a - b).map((s) => {
      let e = s;
      while (set.has(next(e)) && next(e) !== s) e = next(e);
      return s === e ? MON[s - 1] : `${MON[s - 1]}–${MON[e - 1]}`;
    }).join(', ');
  };

  /* =====================================================================
     DATA · destinations + packages (copied from admin-catalog.js / api/content)
     ===================================================================== */
  const DS = [
    { id: 'goa', name: 'Goa', tag: "Beaches, shacks and Portuguese lanes — India's easiest holiday", region: 'West India', months: [11, 12, 1, 2], pos: 1, img: 'img/goa-2.jpg',
      intro: 'Goa is two holidays in one. The north — Baga, Anjuna, Vagator, Morjim — is beach shacks, flea markets, sunset forts and a nightlife that runs past midnight. The south — Palolem, Agonda, Cola — is quieter: crescent bays, coconut groves and cottages a few steps from the water.' },
    { id: 'kerala', name: 'Kerala', tag: 'Backwaters, tea hills and a slow coast', region: 'South India', months: [9, 10, 11, 12, 1, 2, 3], pos: 2, img: 'img/kerala-1.jpg',
      intro: "Kerala is three trips stacked on top of each other. Up in the Western Ghats, Munnar's tea estates roll away in every direction and the mornings are cold enough for a jacket. Down on the plain, Alleppey's backwaters are a maze of canals and paddies best seen from the deck of a houseboat." },
    { id: 'himachal', name: 'Himachal', tag: 'Snow, pines and the Parvati valley', region: 'North India', months: [3, 4, 5, 6, 12], pos: 3, img: 'img/himachal-1.jpg',
      intro: "Himachal is the Himalaya you can reach by coach from Delhi overnight. Shimla is the old summer capital — the Ridge, Mall Road, a toy train and Kufri's hills an hour up. Manali, seven hours further, is the base for Solang valley's snow." },
    { id: 'rajasthan', name: 'Rajasthan', tag: 'Forts, lakes and the Thar', region: 'North-west India', months: [10, 11, 12, 1, 2, 3], pos: 4, img: 'img/udaipur-1.jpg',
      intro: "Rajasthan is the trip people picture when they picture India: Amber's ramparts above a lake, Jodhpur's blue lanes under Mehrangarh, Udaipur's palaces standing in the water." },
    { id: 'andaman', name: 'Andaman', tag: 'Radhanagar sands and reefs', region: 'Bay of Bengal', months: [11, 12, 1, 2, 3, 4], pos: 5, img: 'img/andaman-1.jpg',
      intro: "Two hours' flight east of Chennai, the Andamans are the beaches India's mainland does not have: white sand, water you can see your feet in, and reefs a short boat ride out." },
    { id: 'ladakh', name: 'Ladakh', tag: 'Passes, lakes and monasteries', region: 'Trans-Himalaya', months: [6, 7, 8, 9], pos: 6, img: 'img/ladakh-2.jpg',
      intro: 'Ladakh is a high desert on the far side of the Himalaya: 3,500 metres at Leh, 5,359 at Khardung La, a sky so blue it looks edited. Monasteries sit on rocks above the Indus, and Pangong changes colour four times before lunch.' },
  ];
  // deps: [date, seats, sold, double price]
  const PKD = [
    { id: 'kasol', name: 'Kasol Riverside Weekend', dest: 'Himachal', st: 'live', enq: 9, img: 'img/kasol-1.jpg', deps: [['6 Nov 2026', 16, 12, 5999], ['20 Nov 2026', 16, 6, 5999], ['4 Dec 2026', 16, 2, 5499]] },
    { id: 'oldgoa', name: 'Old Goa & Dudhsagar Weekend', dest: 'Goa', st: 'live', enq: 4, img: 'img/goa-6.jpg', deps: [['6 Nov 2026', 12, 7, 6499], ['27 Nov 2026', 12, 4, 6499], ['11 Dec 2026', 12, 0, 6999]] },
    { id: 'munnar', name: 'Munnar & Alleppey Houseboat', dest: 'Kerala', st: 'live', enq: 9, img: 'img/munnar-2.jpg', deps: [['13 Nov 2026', 12, 8, 22999], ['18 Dec 2026', 10, 6, 25999], ['15 Jan 2027', 12, 2, 21999], ['12 Feb 2027', 12, 0, 21999]] },
    { id: 'northgoa', name: 'North Goa Beaches', dest: 'Goa', st: 'live', enq: 11, img: 'img/goa-3.jpg', deps: [['20 Nov 2026', 16, 9, 14999], ['18 Dec 2026', 4, 3, 17499], ['15 Jan 2027', 16, 2, 15499], ['12 Feb 2027', 12, 0, 14499]] },
    { id: 'goaq', name: 'Goa Quiet Escape', dest: 'Goa', st: 'live', enq: 6, img: 'img/goa-2.jpg', deps: [['27 Nov 2026', 12, 5, 21499], ['24 Dec 2026', 10, 8, 25999], ['22 Jan 2027', 12, 1, 21999]] },
    { id: 'kochi', name: 'Kochi · Thekkady · Kovalam', dest: 'Kerala', st: 'live', enq: 4, img: 'img/hero-2.jpg', deps: [['27 Nov 2026', 16, 4, 27999], ['23 Dec 2026', 14, 9, 31999], ['22 Jan 2027', 16, 1, 28499]] },
    { id: 'jaipur', name: 'Jaipur · Jodhpur · Udaipur', dest: 'Rajasthan', st: 'live', enq: 12, img: 'img/jaipur-1.jpg', deps: [['28 Nov 2026', 16, 11, 27999], ['26 Dec 2026', 16, 7, 29999], ['23 Jan 2027', 16, 3, 26499], ['20 Feb 2027', 16, 0, 26499]] },
    { id: 'manali', name: 'Manali · Kasol · Tosh', dest: 'Himachal', st: 'live', enq: 5, img: 'img/himachal-1.jpg', deps: [['5 Dec 2026', 16, 6, 21499], ['3 Apr 2027', 16, 0, 19999], ['8 May 2027', 16, 0, 19999], ['5 Jun 2027', 16, 0, 20999]] },
    { id: 'pb', name: 'Port Blair · Havelock · Neil', dest: 'Andaman', st: 'live', enq: 10, img: 'img/andaman-2.jpg', deps: [['5 Dec 2026', 16, 10, 34999], ['16 Jan 2027', 16, 3, 32999], ['13 Feb 2027', 16, 0, 32999], ['20 Mar 2027', 16, 0, 33999]] },
    { id: 'jais', name: 'Jaisalmer Desert Nights', dest: 'Rajasthan', st: 'live', enq: 5, img: 'img/rajasthan-1.jpg', deps: [['12 Dec 2026', 12, 5, 21999], ['9 Jan 2027', 12, 2, 19499], ['6 Feb 2027', 12, 0, 19499], ['6 Mar 2027', 12, 0, 19999]] },
    { id: 'shimla', name: 'Shimla–Manali Classic', dest: 'Himachal', st: 'live', enq: 7, img: 'img/himachal-5.jpg', deps: [['19 Dec 2026', 24, 14, 21999], ['20 Mar 2027', 24, 2, 18499], ['17 Apr 2027', 24, 0, 18499], ['15 May 2027', 24, 0, 19999]] },
    { id: 'hav', name: 'Havelock Honeymoon', dest: 'Andaman', st: 'live', enq: 5, img: 'img/andaman-1.jpg', deps: [['19 Dec 2026', 6, 4, 37999], ['10 Feb 2027', 6, 2, 34999], ['13 Mar 2027', 6, 0, 34999]] },
    { id: 'lehnp', name: 'Leh · Nubra · Pangong', dest: 'Ladakh', st: 'live', enq: 8, img: 'img/ladakh-1.jpg', deps: [['12 Jun 2027', 12, 2, 31999], ['3 Jul 2027', 12, 1, 29999], ['14 Aug 2027', 12, 0, 29999], ['11 Sep 2027', 12, 0, 30999]] },
    { id: 'leht', name: 'Leh & Turtuk', dest: 'Ladakh', st: 'live', enq: 3, img: 'img/nubra-1.jpg', deps: [['26 Jun 2027', 10, 0, 29499], ['24 Jul 2027', 10, 0, 27499], ['28 Aug 2027', 10, 0, 27499], ['18 Sep 2027', 10, 0, 28499]] },
    { id: 'lehcopy', name: 'Leh & Turtuk (copy)', dest: 'Ladakh', st: 'draft', enq: 0, img: 'img/ladakh-2.jpg', deps: [['26 Jun 2027', 10, 0, 29499], ['24 Jul 2027', 10, 0, 27499], ['28 Aug 2027', 10, 0, 27499], ['18 Sep 2027', 10, 0, 28499]] },
  ];

  const DSX = DS.map((d) => ({ ...d, months: d.months.slice() }));
  const snap = () => JSON.stringify(DSX.map((d) => ({ id: d.id, name: d.name, tag: d.tag, region: d.region, months: d.months.slice().sort((a, b) => a - b), pos: d.pos, intro: d.intro })));
  let SAVED = snap();
  const ordered = () => DSX.slice().sort((a, b) => a.pos - b.pos);
  const dsById = (id) => DSX.find((d) => d.id === id) || ordered()[0];
  const reorder = (id, to) => {
    const o = ordered(), i = o.findIndex((d) => d.id === id);
    if (i < 0) return;
    const [x] = o.splice(i, 1);
    o.splice(Math.max(0, Math.min(to, o.length)), 0, x);
    o.forEach((d, k) => { d.pos = k + 1; });
  };
  const diff = () => {
    const was = JSON.parse(SAVED), out = [];
    const moved = DSX.filter((d) => was.find((w) => w.id === d.id).pos !== d.pos);
    if (moved.length) out.push(`order changed (${moved.length} tiles)`);
    DSX.forEach((d) => {
      const w = was.find((x) => x.id === d.id);
      const f = [];
      if (w.name !== d.name) f.push('name');
      if (w.tag !== d.tag) f.push('tagline');
      if (w.region !== d.region) f.push('region');
      if (w.intro !== d.intro) f.push('intro');
      if (w.months.join() !== d.months.slice().sort((a, b) => a - b).join()) f.push('best months');
      if (f.length) out.push(`${d.name}: ${f.join(', ')}`);
    });
    return out;
  };
  const discard = () => {
    JSON.parse(SAVED).forEach((w) => Object.assign(dsById(w.id), { name: w.name, tag: w.tag, region: w.region, months: w.months.slice(), pos: w.pos, intro: w.intro }));
  };

  function stats(d) {
    const pk = PKD.filter((p) => p.dest === DS.find((x) => x.id === d.id).name);
    const live = pk.filter((p) => p.st === 'live');
    const deps = live.flatMap((p) => p.deps.map(([date, cap, sold, price]) => ({ p, date, t: pd(date), cap, sold, price }))).sort((a, b) => a.t - b.t);
    const sum = (f) => deps.reduce((n, x) => n + f(x), 0);
    const off = deps.filter((x) => !d.months.includes(x.t.getMonth() + 1));
    const opens = [...Array(12)].map((_, k) => ((NOW_M + k) % 12) + 1).find((m) => d.months.includes(m));
    return {
      pk, live: live.length, draft: pk.length - live.length, deps, next: deps[0],
      from: deps.length ? Math.min(...deps.map((x) => x.price)) : 0,
      sold: sum((x) => x.sold), cap: sum((x) => x.cap), value: sum((x) => x.sold * x.price), enq: live.reduce((n, p) => n + p.enq, 0),
      off, inSeason: d.months.includes(NOW_M), opens,
    };
  }
  const season = (d, s = stats(d)) => (s.inSeason ? '<span class="a-chip ok">In season</span>'
    : `<span class="a-chip mute">Off season${s.opens ? ` · opens ${MON[s.opens - 1]}` : ''}</span>`);
  const monthBtns = (d, attr) => MON.map((m, i) => `<button type="button" ${attr}="${i + 1}" data-id="${d.id}" aria-pressed="${d.months.includes(i + 1)}">${m}</button>`).join('');
  const toggleMonth = (d, m) => { d.months = d.months.includes(m) ? d.months.filter((x) => x !== m) : [...d.months, m]; };
  const saveBar = (key) => {
    const c = diff();
    return `<div class="ad-ds-save" data-save="${key}" role="status" ${c.length ? '' : 'hidden'}><span class="t"><b>Not saved yet</b><span class="ls">${esc(c.join(' · '))}</span></span>
      <span class="acts"><button type="button" class="a-btn ghost sm" data-discard>Discard</button><button type="button" class="a-btn act sm" data-dsave>Save and publish</button></span></div>`;
  };
  const refreshSave = (site) => {
    const bar = site.querySelector('.ad-ds-save'); if (!bar) return;
    const c = diff();
    bar.hidden = !c.length;
    const ls = bar.querySelector('.ls'); if (ls) ls.textContent = c.join(' · ');
  };
  const wireSave = (site, rerender, st) => {
    each(site, '[data-discard]', 'click', () => { discard(); st.flash = 'Changes discarded — the site still shows the saved version.'; rerender(); });
    each(site, '[data-dsave]', 'click', () => { SAVED = snap(); st.flash = 'Saved. The home page, Explore menu and destination pages refresh within a minute.'; rerender(); });
  };
  const flashNote = (st) => (st.flash ? `<p class="a-note ad-rv-flash" role="status">${ICON.check}<span>${esc(st.flash)}</span></p>` : '');

  /* =====================================================================
     DESTINATIONS · B · Storefront editor
     ===================================================================== */
  const dsB = { sel: 'kerala', mode: 'edit', moved: '', flash: '' };
  const tileB = (d, i, edit, selId) => {
    const s = stats(d);
    const ce = (f, label) => (edit ? ` contenteditable="plaintext-only" spellcheck="false" data-ce="${f}" data-id="${d.id}" role="textbox" aria-label="${label} for ${esc(d.name)}"` : '');
    return `<li class="ad-ds-tile${edit && d.id === selId ? ' sel' : ''}${dsB.moved === d.id ? ' moved' : ''}" data-tile="${d.id}"${edit ? ' draggable="true"' : ''}>
      <div class="ph"><img src="${d.img}" alt="${esc(d.name)} cover" loading="lazy"><span class="shade" aria-hidden="true"></span>
        <span class="pill num">${pl(s.live, 'trip')} · best ${monthRange(d.months) || 'not set'}</span>
        <span class="cap"><b${ce('name', 'Name')}>${esc(d.name)}</b><small><span${ce('tag', 'Tagline')}>${esc(d.tag)}</span>${s.from ? ` · starting ${inr(s.from)}` : ''}</small></span>
        ${edit ? `<span class="ctl"><span class="pos num" title="Position on the home page">${i + 1}</span><span class="grip" title="Drag to reorder">${GRIP}</span>
          <button type="button" class="mv" data-mv="-1" data-id="${d.id}" aria-label="Move ${esc(d.name)} earlier"${i === 0 ? ' disabled' : ''}>${ICON.chevL}</button>
          <button type="button" class="mv" data-mv="1" data-id="${d.id}" aria-label="Move ${esc(d.name)} later"${i === DSX.length - 1 ? ' disabled' : ''}>${ICON.chevR}</button></span>` : ''}
      </div>
      ${edit ? `<p class="meta">${season(d, s)}<span>Next out ${s.next ? shortD(s.next.date) : 'none'}</span>${s.draft ? `<span class="a-chip warn">${s.draft} draft hidden</span>` : ''}</p>` : ''}
    </li>`;
  };
  function dsBRender() {
    const o = ordered(), edit = dsB.mode === 'edit', d = dsById(dsB.sel), s = stats(d);
    const dock = edit ? `<section class="a-card ad-ds-dock" aria-label="Details for ${esc(d.name)}">
        <div class="a-card-h"><h2>${esc(d.name)}</h2><span class="a-chip info num">Tile ${d.pos} of ${DSX.length}</span>${season(d, s)}
          <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.eye}View page</a></div></div>
        <div class="a-card-b ad-ds-dockb">
          <div class="cov"><span class="ph"><img src="${d.img}" alt="${esc(d.name)} cover"></span>
            <button type="button" class="a-btn ghost sm">${ICON.camera}Replace cover</button><small>JPG, PNG or WEBP up to 4 MB. Cropped 4:3 on the grid, 16:9 on phones.</small></div>
          <div class="flds">
            <div class="a-row2"><div class="a-field"><label for="ad-ds-bn">Name</label><input id="ad-ds-bn" data-f="name" data-id="${d.id}" value="${esc(d.name)}"></div>
              <div class="a-field"><label for="ad-ds-bs">Slug</label><input id="ad-ds-bs" value="${d.id}"><span class="hint">Changing it moves the public page.</span></div></div>
            <div class="a-row2"><div class="a-field"><label for="ad-ds-bt">Tagline</label><input id="ad-ds-bt" data-f="tag" data-id="${d.id}" value="${esc(d.tag)}"></div>
              <div class="a-field"><label for="ad-ds-br">Region</label><input id="ad-ds-br" data-f="region" data-id="${d.id}" value="${esc(d.region)}"></div></div>
            <div class="a-field"><label for="ad-ds-bi">Intro</label><textarea id="ad-ds-bi" data-f="intro" data-id="${d.id}" rows="4">${esc(d.intro)}</textarea><span class="hint">Markdown, 2–3 paragraphs. Shown on the destination page, not on the tile.</span></div>
            <div class="a-field"><span class="ad-rv-lbl" id="ad-ds-bm">Best months</span><div class="ad-ds-mon" role="group" aria-labelledby="ad-ds-bm">${monthBtns(d, 'data-bm')}</div>
              <span class="hint">The tile pill reads “best ${monthRange(d.months) || 'not set'}”.</span></div>
          </div>
          <div class="side"><h3 class="ad-rv-h3">Same order in the Explore menu</h3>
            <ol class="ad-ds-menu">${o.map((x) => `<li class="${x.id === d.id ? 'on' : ''}"><span class="num">${x.pos}</span>${esc(x.name)}<small>${pl(stats(x).live, 'trip')}</small></li>`).join('')}</ol>
            <p class="ad-rv-mute">${s.pk.length ? `Delete is blocked while ${pl(s.pk.length, 'package uses', 'packages use')} ${esc(d.name)}.` : 'No packages use this destination.'}</p>
            <button type="button" class="a-btn danger sm"${s.pk.length ? ' disabled' : ''}>Delete destination</button></div>
        </div></section>` : '';
    const main = `<div class="ad-ds ad-ds-b" data-mode="${dsB.mode}">
      <div class="a-head"><h1>Destinations</h1><p class="sub">${edit ? 'This is the home page row itself. Drag a tile (or use the arrows) to reorder; click a name or tagline to type over it.' : 'Customer view: exactly what the home page shows, in this order.'}</p>
        <div class="acts"><div class="a-seg" role="group" aria-label="Mode"><button type="button" data-bmode="edit" aria-pressed="${edit}">Edit</button><button type="button" data-bmode="view" aria-pressed="${!edit}">Customer view</button></div>
          <a href="#" class="a-btn">${ICON.plus}New destination</a></div></div>
      ${flashNote(dsB)}
      <div class="ad-ds-frame"><div class="ad-rv-fbar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="url">tripsmith.vercel.app</span><span class="a-chip ${edit ? 'warn' : 'ok'}">${edit ? 'Editing · not live until saved' : 'Live order'}</span></div>
        <div class="fbody"><div class="sh"><div><h2>Trending destinations</h2><p>Where our travellers are going this season.</p></div><a href="#">All destinations${ICON.arrowR}</a></div>
          <ol class="ad-ds-grid" aria-label="Home page tiles in order">${o.map((x, i) => tileB(x, i, edit, d.id)).join('')}</ol></div></div>
      ${dock}
      ${saveBar('b')}
    </div>`;
    return TS.adminShell('Destinations', main);
  }
  function dsBMount(site, rerender) {
    dsB.flash = ''; dsB.moved = '';
    const go = () => rerender();
    each(site, '[data-bmode]', 'click', (b) => { dsB.mode = b.dataset.bmode; go(); });
    each(site, '[data-tile]', 'click', (li, e) => {
      if (dsB.mode !== 'edit' || e.target.closest('[data-ce], button')) return;
      if (dsB.sel !== li.dataset.tile) { dsB.sel = li.dataset.tile; dsB.moved = ''; go(); }
    });
    each(site, '[data-mv]', 'click', (b) => {
      const d = dsById(b.dataset.id); reorder(d.id, d.pos - 1 + +b.dataset.mv); dsB.moved = d.id; dsB.sel = d.id; go();
    });
    each(site, '[data-ce]', 'input', (el) => {
      const d = dsById(el.dataset.id); d[el.dataset.ce] = el.textContent.trim();
      const f = site.querySelector(`[data-f="${el.dataset.ce}"][data-id="${d.id}"]`); if (f) f.value = d[el.dataset.ce];
      refreshSave(site);
    });
    each(site, '[data-ce]', 'keydown', (el, e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    each(site, '[data-f]', 'input', (el) => {
      const d = dsById(el.dataset.id); d[el.dataset.f] = el.value;
      const t = site.querySelector(`[data-ce="${el.dataset.f}"][data-id="${d.id}"]`); if (t) t.textContent = el.value;
      refreshSave(site);
    });
    each(site, '[data-bm]', 'click', (b) => { toggleMonth(dsById(b.dataset.id), +b.dataset.bm); go(); });
    let dragId = '';
    each(site, '[data-tile][draggable]', 'dragstart', (li, e) => {
      dragId = li.dataset.tile; li.classList.add('drag');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* older browsers */ }
    });
    each(site, '[data-tile][draggable]', 'dragend', (li) => { li.classList.remove('drag'); site.querySelectorAll('.ad-ds-tile.over').forEach((x) => x.classList.remove('over')); });
    each(site, '[data-tile][draggable]', 'dragover', (li, e) => { if (!dragId) return; e.preventDefault(); li.classList.add('over'); });
    each(site, '[data-tile][draggable]', 'dragleave', (li) => li.classList.remove('over'));
    each(site, '[data-tile][draggable]', 'drop', (li, e) => {
      e.preventDefault(); if (!dragId || dragId === li.dataset.tile) return;
      reorder(dragId, dsById(li.dataset.tile).pos - 1); dsB.moved = dragId; dsB.sel = dragId; dragId = ''; go();
    });
    wireSave(site, rerender, dsB);
  }

  /* =====================================================================
     DESTINATIONS · C · Season atlas
     ===================================================================== */
  // schematic India, x = (lon − 68) × 10, y = (37 − lat) × 10 — a rough outline, not survey data
  const INDIA = 'M60,4 L95,15 L110,45 L130,70 L160,90 L200,95 L212,103 L240,95 L280,90 L270,110 L250,130 L240,150 L215,150 L190,155 L180,170 L150,195 L123,215 L122,240 L118,267 L95,289 L85,275 L70,245 L60,220 L50,190 L48,165 L46,155 L20,160 L10,145 L5,135 L25,120 L30,100 L55,75 L65,50 L60,25 Z';
  const XY = { goa: [60, 216, 'r'], kerala: [90, 270, 'r'], himachal: [92, 52, 'r'], rajasthan: [58, 108, 'r'], andaman: [248, 250, 'l'], ladakh: [97, 24, 'r'] };
  const dsC = { sel: 'himachal', tab: 'page', flash: '' };
  function atlasSvg(selId) {
    const nodes = ordered().map((d) => {
      const [x, y, side] = XY[d.id], s = stats(d), r = 6 + s.live * 2, on = d.id === selId;
      const tx = side === 'r' ? x + r + 6 : x - r - 6, anchor = side === 'r' ? 'start' : 'end';
      return `<g class="nd ${s.inSeason ? 'in' : 'off'}${on ? ' on' : ''}" data-cn="${d.id}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(d.name)}: ${pl(s.live, 'live trip')}, ${s.inSeason ? 'in season' : 'off season'}">
        ${on ? `<circle class="pulse" cx="${x}" cy="${y}" r="${r + 4}"/>` : ''}<circle class="dot" cx="${x}" cy="${y}" r="${r}"/>
        <text x="${tx}" y="${y - 1}" text-anchor="${anchor}" class="nm">${esc(d.name)}</text>
        <text x="${tx}" y="${y + 10}" text-anchor="${anchor}" class="sb">${pl(s.live, 'trip')} · ${s.inSeason ? 'in season' : 'off season'}</text></g>`;
    }).join('');
    return `<svg class="ad-ds-map" viewBox="-6 -4 316 304" role="group" aria-label="Destinations on a schematic map of India">
      <path class="land" d="${INDIA}"/><g class="isl" aria-hidden="true"><circle cx="246" cy="232" r="2.2"/><circle cx="249" cy="240" r="1.8"/><circle cx="251" cy="262" r="2"/><circle cx="244" cy="270" r="1.6"/></g>${nodes}</svg>`;
  }
  function ribbon(selId) {
    return `<div class="ad-ds-rib"><div class="rh" aria-hidden="true"><span></span>${MON.map((m, i) => `<span class="${i + 1 === NOW_M ? 'now' : ''}">${m.charAt(0)}<em>${m}</em></span>`).join('')}</div>
      ${ordered().map((d) => {
        const s = stats(d), per = MON.map(() => 0);
        s.deps.forEach((x) => { per[x.t.getMonth()]++; });
        return `<button type="button" class="rr${d.id === selId ? ' on' : ''}" data-cn="${d.id}" aria-label="${esc(d.name)}: best ${monthRange(d.months)}, ${pl(s.deps.length, 'departure')}, ${s.off.length} outside best months">
          <span class="nm">${esc(d.name)}</span>${per.map((n, i) => {
            const best = d.months.includes(i + 1);
            return `<span class="c${best ? ' best' : ''}${n && !best ? ' out' : ''}${i + 1 === NOW_M ? ' now' : ''}">${n ? `<b class="num">${n}</b>` : ''}</span>`;
          }).join('')}</button>`;
      }).join('')}
      <p class="lg"><span><i class="best"></i>Best months</span><span><b class="num">2</b> departures that month</span><span><i class="out"></i>Departure outside best months</span><span><i class="now"></i>Now · Sep</span></p></div>`;
  }
  function dsCRender() {
    const d = dsById(dsC.sel), s = stats(d);
    const desc = (() => { const first = d.intro.split(/(?<=[.:])\s/)[0]; const t = `${d.tag}. ${first}`; return t.length > 158 ? t.slice(0, 155).replace(/\s\S*$/, '') + '…' : t; })();
    const tabs = [['page', 'Page'], ['season', 'Season'], ['search', 'Search & share']];
    const body = {
      page: `<div class="cov"><span class="ph"><img src="${d.img}" alt="${esc(d.name)} cover"></span><button type="button" class="a-btn ghost sm">${ICON.camera}Replace</button></div>
        <div class="a-row2"><div class="a-field"><label for="ad-ds-cn">Name</label><input id="ad-ds-cn" data-cf="name" value="${esc(d.name)}"></div>
          <div class="a-field"><label for="ad-ds-cr">Region</label><input id="ad-ds-cr" data-cf="region" value="${esc(d.region)}"></div></div>
        <div class="a-field"><label for="ad-ds-ct">Tagline</label><input id="ad-ds-ct" data-cf="tag" value="${esc(d.tag)}"></div>
        <div class="a-field"><label for="ad-ds-ci">Intro</label><textarea id="ad-ds-ci" data-cf="intro" rows="5">${esc(d.intro)}</textarea><span class="hint">Markdown, 2–3 paragraphs.</span></div>
        <div class="a-field ad-rv-narrow"><label for="ad-ds-co">Order</label><input id="ad-ds-co" type="number" min="1" max="6" data-corder value="${d.pos}"><span class="hint">Lower shows first on the home page.</span></div>`,
      season: `<div class="a-field"><span class="ad-rv-lbl" id="ad-ds-cm">Best months</span><div class="ad-ds-mon" role="group" aria-labelledby="ad-ds-cm">${monthBtns(d, 'data-cm')}</div>
          <span class="hint">Prints as “best ${monthRange(d.months) || 'not set'}” on the tile and the destination page.</span></div>
        ${s.off.length ? `<p class="ad-rv-warn">${ICON.info}<span><b>${pl(s.off.length, 'departure')} outside best months.</b> Travellers see “best ${monthRange(d.months)}” next to a date that isn't. Widen the months or check the trips.</span></p>`
          : '<p class="a-note">' + ICON.check + '<span>Every departure falls in the best months.</span></p>'}
        <ul class="ad-ds-deps">${s.deps.map((x) => { const ok = d.months.includes(x.t.getMonth() + 1);
          return `<li><span class="dt num">${shortD(x.date)}</span><span class="pk">${esc(x.p.name)}<small class="num">${x.sold} of ${x.cap} sold · ${inr(x.price)}</small></span>${ok ? '<span class="a-chip ok">In best months</span>' : '<span class="a-chip warn">Outside</span>'}</li>`; }).join('') || '<li class="a-empty">No live departures.</li>'}</ul>`,
      search: `<p class="ad-rv-mute">Built from Name, Tagline and Intro — there are no separate SEO fields to keep in sync.</p>
        <div class="ad-ds-serp" aria-label="Search result preview"><small>tripsmith.vercel.app › destinations › ${d.id}</small><b>${esc(d.name)} holiday packages · Tripsmith</b><p>${esc(desc)}</p></div>
        <div class="ad-ds-meter"><span>Description</span><span class="a-meter" style="--v:${Math.min(100, Math.round((desc.length / 160) * 100))}%" aria-hidden="true"></span><span class="num">${desc.length} / 160</span></div>
        <div class="ad-ds-og" aria-label="Share card preview"><span class="ph"><img src="${d.img}" alt=""></span><span><small>tripsmith.vercel.app</small><b>${esc(d.name)} · ${esc(d.tag)}</b></span></div>
        <div class="a-field"><label for="ad-ds-cs">Slug</label><input id="ad-ds-cs" value="${d.id}"><span class="hint">Changing this moves the public page; the old address stops working.</span></div>`,
    }[dsC.tab];
    const main = `<div class="ad-ds ad-ds-c">
      <div class="a-head"><h1>Destinations</h1><p class="sub">Where you sell and when it is worth going. Pick a place on the map or a row in the season chart.</p>
        <div class="acts"><a href="#" class="a-btn">${ICON.plus}New destination</a></div></div>
      ${flashNote(dsC)}
      <div class="ad-ds-cgrid">
        <section class="a-card ad-ds-atlas" aria-label="Map and seasons">
          <div class="a-card-h"><h2>Map</h2><span class="a-chip ok">${ordered().filter((x) => stats(x).inSeason).length} in season now</span><div class="acts ad-rv-mute">Dot size = live trips</div></div>
          <div class="a-card-b ad-ds-mapw">${atlasSvg(d.id)}
            <div class="ad-ds-pick"><span class="ph"><img src="${d.img}" alt=""></span><div><b>${esc(d.name)}</b><small>${esc(d.region)} · ${pl(s.live, 'live trip')}${s.draft ? ` · ${s.draft} draft` : ''}</small>
              <small class="num">From ${s.from ? inr(s.from) : 'not priced'} · next ${s.next ? s.next.date : 'none'}</small>${season(d, s)}</div></div></div>
          <div class="a-card-h"><h2>Season and departures</h2></div><div class="a-card-b">${ribbon(d.id)}</div>
        </section>
        <aside class="a-panel ad-ds-ced" aria-label="Edit ${esc(d.name)}">
          <section><div class="ad-rv-row"><h2 class="ad-rv-h2">${esc(d.name)}</h2><a href="#" class="a-btn ghost sm">${ICON.eye}View page</a></div>
            <div class="a-tabs" role="tablist" aria-label="Editor sections">${tabs.map(([k, l]) => `<button type="button" role="tab" data-ctab="${k}" aria-selected="${dsC.tab === k}">${l}${k === 'season' && s.off.length ? ` <span class="ct num">${s.off.length}</span>` : ''}</button>`).join('')}</div></section>
          <section class="ad-ds-cbody">${body}</section>
          <section class="ad-rv-row2b"><button type="button" class="a-btn" data-dsave>Save changes</button><button type="button" class="a-btn ghost" data-discard>Discard</button></section>
          <section><small class="ad-rv-mute">${s.pk.length ? `Delete is blocked while ${pl(s.pk.length, 'package uses', 'packages use')} this destination.` : 'No packages use this destination.'}</small></section>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Destinations', main);
  }
  function dsCMount(site, rerender) {
    dsC.flash = '';
    const pick = (id) => { if (dsC.sel !== id) { dsC.sel = id; rerender(); } };
    each(site, '[data-cn]', 'click', (el) => pick(el.dataset.cn));
    each(site, 'g[data-cn]', 'keydown', (el, e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el.dataset.cn); } });
    each(site, '[data-ctab]', 'click', (b) => { dsC.tab = b.dataset.ctab; rerender(); });
    each(site, '[data-cm]', 'click', (b) => { toggleMonth(dsById(b.dataset.id), +b.dataset.cm); rerender(); });
    each(site, '[data-cf]', 'input', (el) => { dsById(dsC.sel)[el.dataset.cf] = el.value; });
    each(site, '[data-corder]', 'change', (el) => { reorder(dsC.sel, (+el.value || 1) - 1); rerender(); });
    wireSave(site, rerender, dsC);
  }

  /* =====================================================================
     DESTINATIONS · D · Demand ledger
     ===================================================================== */
  const dsD = { sort: 'pos', dir: 1, open: 'himachal', flash: '' };
  const COLS = [['pos', '#', 1], ['name', 'Destination', 0], ['live', 'Trips', 1], ['from', 'From', 1], ['next', 'Next out', 1], ['fill', 'Seats sold', 1], ['value', 'Booked', 1], ['enq', 'Enquiries · 30 d', 1], ['season', 'Season', 0]];
  function alerts() {
    const out = [], rows = ordered().map((d) => [d, stats(d)]);
    rows.forEach(([d, s]) => {
      if (s.off.length) out.push(['warn', `${d.name}: ${pl(s.off.length, 'departure')} outside “best ${monthRange(d.months)}”`, 'Check the best months', d.id]);
      if (s.next && (s.next.t - new Date(2026, 8, 27)) / 864e5 > 120) out.push(['info', `${d.name} has nothing to book before ${s.next.date}, yet sits at tile ${d.pos}`, 'Move it down until spring', d.id]);
      if (s.draft) out.push(['mute', `${d.name}: ${pl(s.draft, 'draft package')} not shown`, 'Open drafts', d.id]);
    });
    const byEnq = rows.slice().sort((a, b) => b[1].enq - a[1].enq)[0];
    if (byEnq[0].pos > 1) out.push(['info', `${byEnq[0].name} gets the most enquiries (${byEnq[1].enq}) but is tile ${byEnq[0].pos}`, 'Try it first', byEnq[0].id]);
    return out;
  }
  // in-season or departing within 120 days first, then by booked value
  const soon = (s) => (s.inSeason || (s.next && (s.next.t - new Date(2026, 8, 27)) / 864e5 <= 120) ? 0 : 1);
  const suggested = () => ordered().map((d) => ({ d, s: stats(d) })).sort((a, b) => soon(a.s) - soon(b.s) || b.s.value - a.s.value).map((x) => x.d);
  function dsDRender() {
    const rows = ordered().map((d) => ({ d, s: stats(d) }));
    const key = { pos: (r) => r.d.pos, name: (r) => r.d.name, live: (r) => r.s.live, from: (r) => r.s.from, next: (r) => (r.s.next ? +r.s.next.t : 9e15), fill: (r) => r.s.sold / (r.s.cap || 1), value: (r) => r.s.value, enq: (r) => r.s.enq, season: (r) => (r.s.inSeason ? 0 : 1) }[dsD.sort];
    rows.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dsD.dir);
    const tot = rows.reduce((t, r) => ({ live: t.live + r.s.live, sold: t.sold + r.s.sold, cap: t.cap + r.s.cap, value: t.value + r.s.value, enq: t.enq + r.s.enq }), { live: 0, sold: 0, cap: 0, value: 0, enq: 0 });
    const al = alerts(), sug = suggested();
    const same = sug.every((x, i) => x.pos === i + 1);
    const th = COLS.map(([k, l, n]) => `<th class="${n ? 'num' : ''}" aria-sort="${dsD.sort === k ? (dsD.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-dsort="${k}">${l}<span class="ar" aria-hidden="true">${dsD.sort === k ? (dsD.dir > 0 ? '↑' : '↓') : ''}</span></button></th>`).join('');
    const body = rows.map(({ d, s }) => {
      const open = dsD.open === d.id, fill = s.cap ? Math.round((s.sold / s.cap) * 100) : 0;
      return `<tr class="${open ? 'sel' : ''}">
        <td class="num" data-l="#"><b>${d.pos}</b></td>
        <td data-l="Destination"><button type="button" class="ad-ds-rowbtn" data-dopen="${d.id}" aria-expanded="${open}"><span class="ph"><img src="${d.img}" alt=""></span><span><b>${esc(d.name)}</b><small>${esc(d.region)}</small></span>${ICON.chevD}</button></td>
        <td class="num" data-l="Trips">${s.live}${s.draft ? `<small>+${s.draft} draft</small>` : ''}</td>
        <td class="num" data-l="From">${s.from ? inr(s.from) : '—'}</td>
        <td class="num" data-l="Next out">${s.next ? shortD(s.next.date) : 'None'}<small>${s.next ? s.next.t.getFullYear() : ''}</small></td>
        <td class="num" data-l="Seats sold"><span class="ad-ds-fill"><span class="a-meter" style="--v:${fill}%" aria-hidden="true"></span><span>${s.sold} / ${s.cap}</span></span></td>
        <td class="num" data-l="Booked">${lakh(s.value)}</td>
        <td class="num" data-l="Enquiries">${s.enq}</td>
        <td data-l="Season">${season(d, s)}</td></tr>
        ${open ? `<tr class="ad-ds-exp"><td colspan="9"><div class="in">
          <div class="pks"><h3 class="ad-rv-h3">Packages in ${esc(d.name)}</h3><ul>${s.pk.map((p) => { const ps = p.deps.reduce((n, x) => n + x[2], 0), pc = p.deps.reduce((n, x) => n + x[1], 0);
            return `<li><span class="ph"><img src="${p.img}" alt=""></span><span class="n"><b>${esc(p.name)}</b><small class="num">${pl(p.deps.length, 'departure')} · from ${inr(Math.min(...p.deps.map((x) => x[3])))} · ${p.enq} enquiries</small></span>
              <span class="num sm">${ps} / ${pc}</span>${p.st === 'live' ? '<span class="a-chip ok">Live</span>' : '<span class="a-chip warn">Draft</span>'}</li>`; }).join('')}</ul></div>
          <div class="qe"><h3 class="ad-rv-h3">Quick edit</h3>
            <div class="a-field"><label for="ad-ds-dt">Tagline</label><input id="ad-ds-dt" data-df="tag" data-id="${d.id}" value="${esc(d.tag)}"></div>
            <div class="a-field"><span class="ad-rv-lbl" id="ad-ds-dm">Best months · ${monthRange(d.months) || 'not set'}</span><div class="ad-ds-mon sm" role="group" aria-labelledby="ad-ds-dm">${monthBtns(d, 'data-dm')}</div></div>
            <div class="ad-rv-row"><div class="a-field ad-rv-narrow"><label for="ad-ds-do">Order</label><input id="ad-ds-do" type="number" min="1" max="6" data-dorder="${d.id}" value="${d.pos}"></div>
              <a href="#" class="a-btn ghost sm">Full editor${ICON.arrowR}</a></div></div>
        </div></td></tr>` : ''}`;
    }).join('');
    const main = `<div class="ad-ds ad-ds-d">
      <div class="a-head"><h1>Destinations</h1><p class="sub">Which places sell, which sit idle, and whether the home page order matches. Click a destination to open its packages and quick edit.</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.down}Export CSV</a><a href="#" class="a-btn">${ICON.plus}New destination</a></div></div>
      ${flashNote(dsD)}
      <section class="ad-ds-look" aria-label="Needs a look"><h2 class="ad-rv-h3">Needs a look <span class="num">${al.length}</span></h2>
        <ul>${al.map(([t, x, act, id]) => `<li><span class="a-chip ${t}">${{ warn: 'Check', info: 'Idea', mute: 'Draft' }[t]}</span><span class="x">${esc(x)}</span><button type="button" class="a-btn ghost sm" data-dopen="${id}">${act}</button></li>`).join('')}</ul></section>
      <section class="a-card ad-ds-ord"><div class="a-card-b"><div><b>Suggested home page order</b><small>In-season and soon-departing first, then by booked value. Nothing changes until you apply it.</small></div>
        <ol>${sug.map((x) => `<li class="${x.pos === sug.indexOf(x) + 1 ? '' : 'chg'}">${esc(x.name)}</li>`).join('')}</ol>
        <button type="button" class="a-btn ${same ? 'ghost' : 'act'} sm" data-dsug${same ? ' disabled' : ''}>${same ? 'Already in this order' : 'Apply order'}</button></div></section>
      <div class="a-card flush"><div class="a-tw"><table class="a-table ad-ds-led"><thead><tr>${th}</tr></thead><tbody>${body}</tbody>
        <tfoot><tr><td></td><td data-l="All"><b>All destinations</b></td><td class="num" data-l="Trips">${tot.live}</td><td></td><td></td><td class="num" data-l="Seats sold">${tot.sold} / ${tot.cap}</td><td class="num" data-l="Booked"><b>${lakh(tot.value)}</b></td><td class="num" data-l="Enquiries">${tot.enq}</td><td></td></tr></tfoot></table></div></div>
      ${saveBar('d')}
    </div>`;
    return TS.adminShell('Destinations', main);
  }
  function dsDMount(site, rerender) {
    dsD.flash = '';
    each(site, '[data-dsort]', 'click', (b) => { const k = b.dataset.dsort; dsD.dir = dsD.sort === k ? -dsD.dir : (['value', 'enq', 'fill', 'live'].includes(k) ? -1 : 1); dsD.sort = k; rerender(); });
    each(site, '[data-dopen]', 'click', (b) => { dsD.open = dsD.open === b.dataset.dopen && b.closest('table') ? '' : b.dataset.dopen; rerender(); });
    each(site, '[data-df]', 'input', (el) => { dsById(el.dataset.id)[el.dataset.df] = el.value; refreshSave(site); });
    each(site, '[data-dm]', 'click', (b) => { toggleMonth(dsById(b.dataset.id), +b.dataset.dm); rerender(); });
    each(site, '[data-dorder]', 'change', (el) => { reorder(el.dataset.dorder, (+el.value || 1) - 1); rerender(); });
    each(site, '[data-dsug]', 'click', () => { suggested().forEach((x, i) => { x.pos = i + 1; }); dsD.sort = 'pos'; dsD.dir = 1; rerender(); });
    wireSave(site, rerender, dsD);
  }

  /* =====================================================================
     DATA · reviews (texts from admin-catalog.js + a few more published ones)
     ===================================================================== */
  // dist = published reviews by stars [5,4,3,2,1]; totals 41 published across 11 trips
  const PR = {
    munnar: { name: 'Munnar & Alleppey Houseboat', slug: 'munnar-alleppey-houseboat', img: 'img/munnar-1.jpg', lead: 'anjali', dist: [5, 1, 0, 0, 0] },
    lehnp: { name: 'Leh · Nubra · Pangong', slug: 'leh-nubra-pangong', img: 'img/ladakh-1.jpg', lead: 'rigzin', dist: [4, 1, 0, 0, 0] },
    jaipur: { name: 'Jaipur · Jodhpur · Udaipur', slug: 'jaipur-jodhpur-udaipur', img: 'img/udaipur-1.jpg', lead: 'meera', dist: [4, 1, 0, 0, 0] },
    northgoa: { name: 'North Goa Beaches', slug: 'north-goa-beaches', img: 'img/goa-3.jpg', lead: 'meera', dist: [3, 1, 1, 0, 0] },
    kasol: { name: 'Kasol Riverside Weekend', slug: 'kasol-weekend-camp', img: 'img/kasol-1.jpg', lead: 'tenzin', dist: [2, 2, 0, 0, 0] },
    hav: { name: 'Havelock Honeymoon', slug: 'havelock-honeymoon', img: 'img/andaman-1.jpg', lead: 'anjali', dist: [3, 0, 0, 0, 0] },
    shimla: { name: 'Shimla–Manali Classic', slug: 'shimla-manali-classic', img: 'img/himachal-5.jpg', lead: 'meera', dist: [2, 1, 1, 0, 0] },
    pb: { name: 'Port Blair · Havelock · Neil', slug: 'port-blair-havelock-neil', img: 'img/andaman-2.jpg', lead: 'anjali', dist: [2, 1, 0, 0, 0] },
    goaq: { name: 'Goa Quiet Escape', slug: 'goa-quiet-escape', img: 'img/goa-2.jpg', lead: 'meera', dist: [1, 1, 0, 1, 0] },
    manali: { name: 'Manali · Kasol · Tosh', slug: 'manali-kasol-tosh', img: 'img/himachal-1.jpg', lead: 'tenzin', dist: [2, 0, 0, 0, 0] },
    oldgoa: { name: 'Old Goa & Dudhsagar Weekend', slug: 'old-goa-weekend', img: 'img/goa-6.jpg', lead: 'meera', dist: [0, 1, 0, 0, 0] },
  };
  const RVS = [
    { id: 'p1', st: 'pending', name: 'Priya Raghavan', email: 'priya.raghavan@customer.in', pk: 'munnar', r: 5, trav: 'Feb 2026', with: 3, ref: 'TS-7F3K2Q', sent: '25 Sep 2026',
      text: "The houseboat night was the best part of the trip — the crew cooked karimeen for us and moored right by a paddy field. Tea County's rooms face the estate, so ask for the upper floor.\n\nOur driver Biju waited an extra hour at Eravikulam without a word. Would book again for my parents." },
    { id: 'p2', st: 'pending', name: 'Arjun Mehta', email: 'arjun.mehta88@customer.in', pk: 'lehnp', r: 4, trav: 'Sep 2026', with: 5, ref: 'TS-9A1B7C', sent: '24 Sep 2026',
      text: 'The rest day in Leh made all the difference — nobody in our group of six got sick. Pangong camp was cold at night and the heaters only ran till 11, so carry a thermal. Rigzin knew every monastery caretaker by name.' },
    { id: 'p3', st: 'pending', name: 'Sneha Kulkarni', email: 'sneha.k@customer.in', pk: 'northgoa', r: 3, trav: 'Mar 2026', with: 1, ref: 'TS-5G6H1J', sent: '21 Sep 2026',
      text: 'Candolim is a great base and the Chapora sunset was worth the climb. The resort pool was closed for repairs for two of our three days and nobody told us before we arrived. Driver was always on time.' },
    { id: 'q1', st: 'published', name: 'Karthik Iyer', email: 'karthik.iyer@customer.in', pk: 'jaipur', r: 5, trav: 'Feb 2026', with: 1, ref: 'TS-3K7L9M', sent: '3 Mar 2026',
      text: 'Havelis over chain hotels was the right call. Meera booked the Mehrangarh audio guide before we asked and the Pichola boat at sunset was timed perfectly.' },
    { id: 'q2', st: 'published', name: 'Ananya Bose', email: 'ananya.bose@customer.in', pk: 'hav', r: 5, trav: 'Jan 2026', with: 1, ref: 'TS-2D8E4F', sent: '30 Jan 2026',
      text: 'Radhanagar at 7 am had maybe ten people on it. The ferry tickets were sorted before we landed, which is the part everyone else on the boat was stressed about.' },
    { id: 'q3', st: 'published', name: 'Rohit Sharma', email: 'rohit.sharma.dev@customer.in', pk: 'kasol', r: 4, trav: 'Apr 2026', with: 2, ref: 'TS-8M2N4P', sent: '14 Apr 2026',
      text: 'Good value for a weekend. The Volvo was on time both ways and the riverside tents were warmer than expected. Chalal trail is easy — do it in the morning.' },
    { id: 'q4', st: 'published', name: 'Deepa Nair', email: 'deepa.nair@customer.in', pk: 'munnar', r: 5, trav: 'Jan 2026', with: 2, ref: 'TS-4B6C8D', sent: '28 Jan 2026',
      text: 'Anjali sorted a cooking class on the houseboat when the rain kept us off the canals. The tea estate walk at 6 am was cold and completely worth it.' },
    { id: 'q5', st: 'published', name: 'Sanjay Rao', email: 'sanjay.rao@customer.in', pk: 'munnar', r: 4, trav: 'Dec 2025', with: 4, ref: 'TS-1H5J7K', sent: '2 Jan 2026',
      text: 'Well planned for a family of five. The Munnar to Alleppey drive is long, so leave early. Houseboat food was the highlight for the kids.' },
    { id: 'q6', st: 'published', name: 'Farhan Qureshi', email: 'farhan.qureshi@customer.in', pk: 'lehnp', r: 5, trav: 'Aug 2026', with: 3, ref: 'TS-6L2M9N', sent: '29 Aug 2026',
      text: 'Oxygen in the Innova, a proper rest day, and Rigzin checking everyone at breakfast. Khardung La felt safe, and Hunder at sunset was unreal.' },
    { id: 'q7', st: 'published', name: 'Pooja Desai', email: 'pooja.desai@customer.in', pk: 'northgoa', r: 4, trav: 'Jan 2026', with: 2, ref: 'TS-9P3Q5R', sent: '24 Jan 2026',
      text: 'Acron is right on the river and walking distance to Calangute. Airport pickup was waiting when we landed. Sunset cruise was crowded but fun.' },
    { id: 'q8', st: 'published', name: 'Aditya Joshi', email: 'aditya.joshi@customer.in', pk: 'northgoa', r: 5, trav: 'Feb 2026', with: 5, ref: 'TS-3S7T1U', sent: '20 Feb 2026',
      text: 'Six friends, zero arguments about plans — Meera had Fort Aguada, Anjuna market and the cruise sorted into days that actually worked. Driver was always on time.' },
    { id: 'h1', st: 'hidden', name: 'Vikas', email: 'goataxi.deals@customer.in', pk: 'oldgoa', r: 1, trav: 'Dec 2025', with: 0, ref: 'TS-4Q9R2S', sent: '22 Sep 2026',
      text: 'Call 98200 XXXXX for cheaper taxis in Goa, better than any agency. Jeep to Dudhsagar for half the price.' },
    { id: 'h2', st: 'hidden', name: 'Neha Gupta', email: 'neha.gupta21@customer.in', pk: 'goaq', r: 2, trav: 'Jan 2026', with: 1, ref: 'TS-6T3U8V', sent: '2 Feb 2026',
      text: "The cottage was fine but I am posting the manager's personal number here so others can reach him directly since the front desk never answered." },
  ];
  const BASE = { published: 41 - RVS.filter((x) => x.st === 'published').length, pending: 0, hidden: 0 };
  const count = (st) => RVS.filter((x) => x.st === st).length + BASE[st];
  const n = (d) => d.reduce((a, b) => a + b, 0);
  const avg = (d) => (n(d) ? d.reduce((s, c, i) => s + c * (5 - i), 0) / n(d) : 0);
  const allDist = () => Object.values(PR).reduce((t, p) => t.map((c, i) => c + p.dist[i]), [0, 0, 0, 0, 0]);
  const WORD = { 5: 'Loved it', 4: 'Liked it', 3: 'Mixed', 2: 'Disappointed', 1: 'Poor' };
  const move = (x, to) => {
    if (x.st === to) return;
    if (x.st === 'published') PR[x.pk].dist[5 - x.r]--;
    if (to === 'published') PR[x.pk].dist[5 - x.r]++;
    x.st = to;
  };
  const CHECKS = [
    [/\d{5}\s?(\d{5}|X{5})|\+91/i, 'bad', 'Phone number'],
    [/@|https?:|www\./i, 'bad', 'Email or link'],
    [/personal number|home address/i, 'bad', 'Personal details'],
    [/closed for repairs|nobody told|never answered|only ran|crowded/i, 'warn', 'Raises a problem'],
    [/\b(Biju|Rigzin|Meera|Tenzin|Anjali)\b/, 'info', 'Names your team'],
  ];
  const checks = (x) => {
    const hit = CHECKS.filter(([re]) => re.test(x.text)).map(([, t, l]) => `<span class="a-chip ${t}">${l}</span>`);
    return hit.length ? hit.join('') : '<span class="a-chip ok">Looks clean</span>';
  };
  const cleanFlag = (x) => !CHECKS.slice(0, 3).some(([re]) => re.test(x.text));
  const meta42 = (x) => `<span class="ad-rv-m42"><b>${esc(x.name)}</b><span class="vt">${ICON.shield}Verified traveller ${V25}</span><span>Travelled ${x.trav}${x.with ? ` · with ${pl(x.with, 'other')}` : ''}</span><span class="ld">${avatar(PR[x.pk].lead, 18)}Led by ${LEADERS[PR[x.pk].lead].name.split(' ')[0]} ${V25}</span></span>`;
  const distBars = (d, hi) => `<ul class="ad-rv-dist" aria-label="Rating breakdown">${d.map((c, i) => `<li class="${hi === 5 - i ? 'hi' : ''}"><span class="num">${5 - i}★</span><span class="bar"><i style="--w:${n(d) ? Math.round((c / n(d)) * 100) : 0}%"></i></span><span class="num c">${c}</span></li>`).join('')}</ul>`;
  const para = (t) => esc(t).split('\n\n').map((p) => `<p>${p}</p>`).join('');

  /* =====================================================================
     REVIEWS · B · Moderation deck
     ===================================================================== */
  const rvB = { i: 0, view: 'deck', log: [], leaving: '' };
  let deckSite = null, deckRerender = null;
  const deckAct = (to) => {
    const q = RVS.filter((x) => x.st === 'pending'); if (!q.length) return;
    const x = q[Math.min(rvB.i, q.length - 1)];
    const apply = () => { rvB.log.unshift({ id: x.id, from: x.st, to }); move(x, to); rvB.leaving = ''; rvB.i = Math.min(rvB.i, Math.max(0, q.length - 2)); deckRerender(); };
    const card = deckSite && deckSite.querySelector('.ad-rv-card');
    if (card && !calm()) { card.classList.add(to === 'published' ? 'out-p' : 'out-h'); setTimeout(apply, 260); } else apply();
  };
  const deckUndo = () => { const l = rvB.log.shift(); if (!l) return; move(RVS.find((x) => x.id === l.id), l.from); rvB.i = RVS.filter((x) => x.st === 'pending').findIndex((x) => x.id === l.id); rvB.view = 'deck'; deckRerender(); };
  const onKey = (e) => {
    if (!deckSite || !deckSite.querySelector('.ad-rv-deck') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase(), q = RVS.filter((x) => x.st === 'pending').length;
    if (k === 'p') deckAct('published'); else if (k === 'h') deckAct('hidden'); else if (k === 'u') deckUndo();
    else if ((k === 'j' || k === 'arrowright') && q) { rvB.i = (rvB.i + 1) % q; deckRerender(); }
    else if ((k === 'k' || k === 'arrowleft') && q) { rvB.i = (rvB.i - 1 + q) % q; deckRerender(); }
    else return;
    e.preventDefault();
  };
  function rvBRender() {
    const q = RVS.filter((x) => x.st === 'pending');
    rvB.i = Math.min(rvB.i, Math.max(0, q.length - 1));
    const x = q[rvB.i], p = x && PR[x.pk];
    const seg = `<div class="a-seg" role="group" aria-label="Show">${[['deck', `Waiting · ${count('pending')}`], ['published', `Published · ${count('published')}`], ['hidden', `Hidden · ${count('hidden')}`]].map(([k, l]) => `<button type="button" data-bview="${k}" aria-pressed="${rvB.view === k}">${l}</button>`).join('')}</div>`;
    const logHtml = rvB.log.length ? `<ol class="ad-rv-log">${rvB.log.slice(0, 5).map((l, i) => { const r = RVS.find((y) => y.id === l.id);
      return `<li><span class="a-chip ${l.to === 'published' ? 'ok' : 'mute'}">${l.to === 'published' ? 'Published' : 'Hidden'}</span><span>${esc(r.name)} · ${esc(PR[r.pk].name)}</span>${i === 0 ? '<button type="button" class="a-btn ghost sm" data-undo>Undo <kbd>U</kbd></button>' : ''}</li>`; }).join('')}</ol>` : '<p class="ad-rv-mute">Nothing decided yet this session.</p>';
    let stage;
    if (rvB.view !== 'deck') {
      const list = RVS.filter((y) => y.st === rvB.view);
      stage = `<div class="a-card flush ad-rv-plain"><div class="a-card-b"><ul>${list.map((y) => `<li><span class="ph"><img src="${PR[y.pk].img}" alt=""></span><span class="t">${stars(y.r, false)}<b>${esc(y.name)}</b><small>${esc(PR[y.pk].name)} · sent ${shortD(y.sent)}</small><span class="ex">${esc(y.text.split('\n')[0])}</span></span>
        <button type="button" class="a-btn ghost sm" data-bmove="${y.id}" data-to="${y.st === 'published' ? 'hidden' : 'published'}">${y.st === 'published' ? 'Hide' : 'Publish'}</button></li>`).join('')}</ul>
        ${rvB.view === 'published' ? `<p class="ad-rv-mute ad-rv-pad">Showing the ${list.length} newest of ${count('published')}.</p>` : ''}</div></div>`;
    } else if (!x) {
      stage = `<div class="ad-rv-clear"><span class="ic-b">${ICON.check}</span><h2>Queue clear</h2><p>Every review is decided. Review requests go out two days after each return, and you get an email when one comes in.</p>
        <button type="button" class="a-btn ghost" data-bview="published">See published reviews</button></div>`;
    } else {
      const next = q.length - 1 - rvB.i;
      stage = `<div class="ad-rv-deck">
        <div class="ad-rv-prog"><span class="num"><b>${rvB.i + 1}</b> of ${q.length} waiting</span><span class="segs" aria-hidden="true">${q.map((_, i) => `<i class="${i === rvB.i ? 'on' : i < rvB.i ? 'seen' : ''}"></i>`).join('')}</span><span class="ad-rv-mute">oldest sent ${shortD(q[q.length - 1].sent)}</span></div>
        <div class="ad-rv-stack${next > 0 ? ' more' : ''}${next > 1 ? ' more2' : ''}">
          <article class="ad-rv-card" aria-label="Review from ${esc(x.name)}">
            <header><span class="ph"><img src="${p.img}" alt="${esc(p.name)}"></span><span class="h"><small>${esc(p.name)}</small><b>${stars(x.r, false)} <span>${x.r} · ${WORD[x.r]}</span></b></span><span class="a-chip warn">Waiting</span></header>
            <div class="txt">${para(x.text)}</div>
            <footer>${meta42(x)}<span class="ad-rv-chk"><span class="ad-rv-mute">Auto checks</span>${checks(x)}</span></footer>
          </article>
        </div>
        <div class="ad-rv-keys" role="group" aria-label="Decide">
          <button type="button" class="a-btn ghost" data-bact="hidden">${ICON.eye}Hide <kbd>H</kbd></button>
          <button type="button" class="a-btn ghost" data-bskip="1">Skip <kbd>J</kbd></button>
          <button type="button" class="a-btn" data-bact="published">${ICON.check}Publish <kbd>P</kbd></button>
        </div>
        <p class="ad-rv-mute ad-rv-c">The text is the customer's and is never edited. ${cleanFlag(x) ? 'Nothing here needs hiding.' : 'Hide it: it shares contact details.'}</p>
      </div>`;
    }
    const now = x ? avg(p.dist) : 0, after = x ? avg(p.dist.map((c, i) => c + (i === 5 - x.r ? 1 : 0))) : 0;
    const rail = x && rvB.view === 'deck' ? `<section class="a-card"><div class="a-card-h"><h2>If you publish</h2></div><div class="a-card-b ad-rv-if">
        <div class="big"><span><small>Now</small><b class="num">${now.toFixed(1)}</b><em class="num">${pl(n(p.dist), 'review')}</em></span>${ICON.arrowR}<span><small>After</small><b class="num">${after.toFixed(1)}</b><em class="num">${pl(n(p.dist) + 1, 'review')}</em></span></div>
        ${distBars(p.dist, x.r)}
        <dl class="a-kv"><div><dt>Booking</dt><dd><a href="#" class="ad-rv-ref num">${x.ref}</a></dd></div><div><dt>Email</dt><dd>${esc(x.email)}</dd></div><div><dt>Sent</dt><dd>${x.sent}</dd></div></dl>
        <a href="#" class="a-btn ghost sm">${ICON.eye}Open the trip page</a></div></section>` : '';
    const main = `<div class="ad-rv ad-rv-b">
      <div class="a-head"><h1>Reviews</h1><p class="sub">One review at a time. Read it, press P to publish or H to hide, and the next one slides in.</p><div class="acts">${seg}</div></div>
      <div class="ad-rv-bgrid"><div class="ad-rv-stage">${stage}</div>
        <div class="ad-rv-rail">${rail}<section class="a-card"><div class="a-card-h"><h2>This session</h2></div><div class="a-card-b">${logHtml}</div></section>
          <section class="a-card ad-rv-help"><div class="a-card-b"><b>Keys</b><span><kbd>P</kbd> publish</span><span><kbd>H</kbd> hide</span><span><kbd>J</kbd><kbd>K</kbd> next / back</span><span><kbd>U</kbd> undo</span></div></section></div></div>
    </div>`;
    return TS.adminShell('Reviews', main);
  }
  function rvBMount(site, rerender) {
    deckSite = site; deckRerender = rerender;
    if (!window.__adRvKeys) { document.addEventListener('keydown', (e) => onKey(e)); window.__adRvKeys = true; }
    each(site, '[data-bview]', 'click', (b) => { rvB.view = b.dataset.bview; rerender(); });
    each(site, '[data-bact]', 'click', (b) => deckAct(b.dataset.bact));
    each(site, '[data-bskip]', 'click', () => { const q = RVS.filter((x) => x.st === 'pending').length; if (q) { rvB.i = (rvB.i + 1) % q; rerender(); } });
    each(site, '[data-undo]', 'click', () => deckUndo());
    each(site, '[data-bmove]', 'click', (b) => { const x = RVS.find((y) => y.id === b.dataset.bmove); rvB.log.unshift({ id: x.id, from: x.st, to: b.dataset.to }); move(x, b.dataset.to); rerender(); });
  }

  /* =====================================================================
     REVIEWS · C · Insight board
     ===================================================================== */
  // themes: keyword match over review text; `pub` = mentions across all 41 published reviews
  const THEMES = [
    { k: 'drivers', l: 'Drivers and transfers', re: /driver|volvo|pickup|transfer|innova/i, tone: 'ok', pub: 14 },
    { k: 'houseboat', l: 'Houseboat', re: /houseboat/i, tone: 'ok', pub: 6 },
    { k: 'pace', l: 'Pace and rest days', re: /rest day|leave early|timed|sorted into days/i, tone: 'ok', pub: 7 },
    { k: 'stays', l: 'Heritage stays', re: /haveli|heritage/i, tone: 'ok', pub: 5 },
    { k: 'cold', l: 'Cold nights', re: /cold|heater|thermal/i, tone: 'warn', pub: 4 },
    { k: 'upkeep', l: 'Hotel upkeep', re: /closed for repairs|pool|front desk/i, tone: 'bad', pub: 3 },
    { k: 'told', l: 'Told too late', re: /nobody told|never answered|before we arrived/i, tone: 'bad', pub: 2 },
    { k: 'crowds', l: 'Crowds', re: /crowded|busy/i, tone: 'warn', pub: 3 },
  ];
  const TONE = { ok: 'Praised', warn: 'Mixed', bad: 'Complaint' };
  const rvC = { f: '', fk: '', sort: 'low', flash: '' };
  const matches = (x) => (!rvC.f ? true : rvC.fk === 'theme' ? THEMES.find((t) => t.k === rvC.f).re.test(x.text) : rvC.fk === 'pk' ? x.pk === rvC.f : PR[x.pk].lead === rvC.f);
  function rvCRender() {
    const all = allDist(), tot = n(all), mean = allDist().reduce((s, c, i) => s + c * (5 - i), 0) / tot;
    const pend = RVS.filter((x) => x.st === 'pending');
    const trips = Object.entries(PR).map(([k, p]) => ({ k, p, a: avg(p.dist), w: pend.filter((x) => x.pk === k).length }))
      .sort((a, b) => (rvC.sort === 'low' ? a.a - b.a : rvC.sort === 'high' ? b.a - a.a : n(b.p.dist) - n(a.p.dist)));
    const leaders = Object.keys(LEADERS).map((k) => {
      const ps = Object.values(PR).filter((p) => p.lead === k), d = ps.reduce((t, p) => t.map((c, i) => c + p.dist[i]), [0, 0, 0, 0, 0]);
      const named = RVS.filter((x) => x.st !== 'hidden' && new RegExp(LEADERS[k].name.split(' ')[0]).test(x.text)).length;
      return { k, L: LEADERS[k], a: avg(d), c: n(d), trips: ps.length, named };
    });
    const stack = (d) => `<span class="ad-rv-stk" role="img" aria-label="${d.map((c, i) => `${c} at ${5 - i} stars`).join(', ')}">${d.map((c, i) => (c ? `<i class="s${5 - i}" style="flex:${c}"></i>` : '')).join('')}</span>`;
    const fl = rvC.f ? (rvC.fk === 'theme' ? THEMES.find((t) => t.k === rvC.f).l : rvC.fk === 'pk' ? PR[rvC.f].name : `Led by ${LEADERS[rvC.f].name}`) : '';
    const q = pend.filter(matches);
    const qHtml = q.length ? q.map((x) => `<li class="ad-rv-qi"><div class="top">${stars(x.r, false)}<b>${esc(x.name)}</b><small>${shortD(x.sent)}</small></div>
        <small class="pk">${esc(PR[x.pk].name)}</small><p>${esc(x.text.split('\n')[0])}</p>
        <div class="tg">${THEMES.filter((t) => t.re.test(x.text)).map((t) => `<span class="a-chip ${t.tone === 'ok' ? 'ok' : t.tone === 'bad' ? 'bad' : 'warn'}">${t.l}</span>`).join('')}</div>
        <div class="act"><button type="button" class="a-btn sm" data-cmove="${x.id}" data-to="published">${ICON.check}Publish</button><button type="button" class="a-btn ghost sm" data-cmove="${x.id}" data-to="hidden">Hide</button></div></li>`).join('')
      : `<li class="a-empty">${pend.length ? 'No waiting review matches this filter.' : 'Nothing waiting. New reviews land here.'}</li>`;
    const main = `<div class="ad-rv ad-rv-c">
      <div class="a-head"><h1>Reviews</h1><p class="sub">What travellers keep saying, per trip and per leader, with the waiting queue beside it. Click any trip, theme or leader to filter the queue.</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.down}Export CSV</a></div></div>
      ${rvC.flash ? `<p class="a-note ad-rv-flash" role="status">${ICON.check}<span>${esc(rvC.flash)}</span></p>` : ''}
      <div class="ad-rv-cgrid">
        <div class="ad-rv-cmain">
          <div class="ad-rv-top">
            <section class="a-card ad-rv-score"><div class="a-card-b"><small>Published average</small><b class="num">${mean.toFixed(1)}</b>${stars(mean, false)}<span class="ad-rv-mute num">${tot} reviews · ${Object.keys(PR).length} trips</span>${distBars(all)}</div></section>
            <section class="a-card ad-rv-themes"><div class="a-card-h"><h2>Recurring themes</h2><span class="ad-rv-mute">keyword match, no AI</span></div><div class="a-card-b"><ul>${THEMES.map((t) => {
              const w = pend.filter((x) => t.re.test(x.text)).length;
              return `<li><button type="button" class="${rvC.f === t.k ? 'on' : ''} t-${t.tone}" data-cf="${t.k}" data-fk="theme" aria-pressed="${rvC.f === t.k}"><b>${t.l}</b><span class="a-chip ${t.tone === 'ok' ? 'ok' : t.tone === 'bad' ? 'bad' : 'warn'}">${TONE[t.tone]}</span><span class="num c">${t.pub}${w ? ` <em>+${w} waiting</em>` : ''}</span></button></li>`; }).join('')}</ul></div></section>
          </div>
          <section class="a-card flush"><div class="a-card-h"><h2>By trip</h2><div class="acts"><div class="a-seg" role="group" aria-label="Sort trips">${[['low', 'Lowest first'], ['high', 'Highest first'], ['most', 'Most reviews']].map(([k, l]) => `<button type="button" data-csort="${k}" aria-pressed="${rvC.sort === k}">${l}</button>`).join('')}</div></div></div>
            <div class="a-card-b"><div class="a-tw"><table class="a-table ad-rv-trips"><thead><tr><th>Trip</th><th class="num">Avg</th><th>Breakdown</th><th class="num">Reviews</th><th>Leader</th><th>Queue</th></tr></thead><tbody>
            ${trips.map(({ k, p, a, w }) => `<tr class="${rvC.f === k ? 'sel' : ''}"><td><button type="button" class="ad-rv-tb" data-cf="${k}" data-fk="pk" aria-pressed="${rvC.f === k}"><span class="ph"><img src="${p.img}" alt=""></span><b>${esc(p.name)}</b></button></td>
              <td class="num"><b class="${a < 4 ? 'lo' : ''}">${a.toFixed(1)}</b></td><td>${stack(p.dist)}</td><td class="num">${n(p.dist)}</td>
              <td><span class="ad-rv-ld">${avatar(p.lead, 22)}${LEADERS[p.lead].name.split(' ')[0]}</span></td><td>${w ? `<span class="a-chip warn">${w} waiting</span>` : '<span class="a-chip mute">Clear</span>'}</td></tr>`).join('')}
            </tbody></table></div></div></section>
          <section class="a-card"><div class="a-card-h"><h2>Trip leaders ${V25}</h2><span class="ad-rv-mute">reviews on the trips they lead</span></div><div class="a-card-b"><ul class="ad-rv-leads">${leaders.map((l) => `<li><button type="button" class="${rvC.f === l.k ? 'on' : ''}" data-cf="${l.k}" data-fk="lead" aria-pressed="${rvC.f === l.k}">${avatar(l.k, 38)}<span class="n"><b>${l.L.name}</b><small>${pl(l.trips, 'trip')} · named in ${pl(l.named, 'review')}</small></span><span class="s">${stars(l.a)}<small class="num">${pl(l.c, 'review')}</small></span></button></li>`).join('')}</ul></div></section>
        </div>
        <aside class="a-panel ad-rv-cq" aria-label="Waiting reviews">
          <section><div class="ad-rv-row"><h2 class="ad-rv-h2">Waiting <span class="num">${pend.length}</span></h2>${rvC.f ? `<button type="button" class="a-chip info ad-rv-clr" data-cf="" data-fk="">${esc(fl)} ${ICON.x}<span class="sr">Clear filter</span></button>` : ''}</div>
            <small class="ad-rv-mute">Publishing recomputes the trip rating. Every card shows the ${V25} Verified traveller and Led by labels on the site.</small></section>
          <section><ul class="ad-rv-q">${qHtml}</ul></section>
          <section><small class="ad-rv-mute">${count('published')} published · ${count('hidden')} hidden</small></section>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Reviews', main);
  }
  function rvCMount(site, rerender) {
    rvC.flash = '';
    each(site, '[data-cf]', 'click', (b) => { const same = rvC.f === b.dataset.cf; rvC.f = same ? '' : b.dataset.cf; rvC.fk = same ? '' : b.dataset.fk; rerender(); });
    each(site, '[data-csort]', 'click', (b) => { rvC.sort = b.dataset.csort; rerender(); });
    each(site, '[data-cmove]', 'click', (b) => {
      const x = RVS.find((y) => y.id === b.dataset.cmove); move(x, b.dataset.to);
      rvC.flash = b.dataset.to === 'published' ? `Published — ${PR[x.pk].name} is now ${avg(PR[x.pk].dist).toFixed(1)} from ${pl(n(PR[x.pk].dist), 'review')}.` : `Hidden — ${x.name}'s review stays off the page.`;
      rerender();
    });
  }

  /* =====================================================================
     REVIEWS · D · Page wall
     ===================================================================== */
  const rvD = { pk: 'munnar', dev: 'desk', flash: '' };
  function rvDRender() {
    const keys = Object.keys(PR).sort((a, b) => RVS.filter((x) => x.pk === b && x.st === 'pending').length - RVS.filter((x) => x.pk === a && x.st === 'pending').length);
    const p = PR[rvD.pk], mine = RVS.filter((x) => x.pk === rvD.pk);
    const wait = mine.filter((x) => x.st === 'pending'), pub = mine.filter((x) => x.st === 'published'), hid = mine.filter((x) => x.st === 'hidden');
    const a = avg(p.dist), c = n(p.dist);
    const ifAll = p.dist.map((v, i) => v + wait.filter((x) => 5 - x.r === i).length);
    const card = (x, ghost) => `<article class="ad-rv-wc${ghost ? ' ghost' : ''}" aria-label="${ghost ? 'Waiting review' : 'Published review'} from ${esc(x.name)}">
        ${ghost ? `<div class="gh"><span class="a-chip warn">Waiting · not on the page</span><span class="ad-rv-mute">sent ${shortD(x.sent)}</span></div>` : ''}
        <div class="st">${stars(x.r, false)}<span class="num">${x.r}.0</span></div>
        <div class="txt">${para(x.text)}</div>
        <p class="m">${meta42(x)}</p>
        <div class="ops">${ghost ? `<button type="button" class="a-btn sm" data-wmove="${x.id}" data-to="published">${ICON.check}Publish here</button><button type="button" class="a-btn ghost sm" data-wmove="${x.id}" data-to="hidden">Hide</button>${cleanFlag(x) ? '' : '<span class="a-chip bad">Shares contact details</span>'}`
          : `<button type="button" class="a-btn ghost sm" data-wmove="${x.id}" data-to="hidden">Hide from page</button>`}</div>
      </article>`;
    const main = `<div class="ad-rv ad-rv-d">
      <div class="a-head"><h1>Reviews</h1><p class="sub">Moderate on the page itself: this is each trip's review section as customers see it, with waiting reviews dropped in where they would land.</p>
        <div class="acts"><div class="a-seg" role="group" aria-label="Preview width"><button type="button" data-dev="desk" aria-pressed="${rvD.dev === 'desk'}">Desktop</button><button type="button" data-dev="phone" aria-pressed="${rvD.dev === 'phone'}">Phone</button></div></div></div>
      <div class="ad-rv-pick" role="tablist" aria-label="Trip">${keys.map((k) => { const w = RVS.filter((x) => x.pk === k && x.st === 'pending').length;
        return `<button type="button" role="tab" data-wpk="${k}" aria-selected="${rvD.pk === k}"><span class="ph"><img src="${PR[k].img}" alt=""></span><span>${esc(PR[k].name)}</span>${w ? `<span class="a-chip warn">${w} waiting</span>` : `<span class="a-chip mute num">${n(PR[k].dist)} live</span>`}</button>`; }).join('')}</div>
      ${rvD.flash ? `<p class="a-note ad-rv-flash" role="status">${ICON.check}<span>${esc(rvD.flash)}</span></p>` : ''}
      <div class="ad-rv-dgrid">
        <div class="ad-rv-frame" data-dev="${rvD.dev}"><div class="ad-rv-fbar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="url">tripsmith.vercel.app/packages/${p.slug}#reviews</span></div>
          <div class="wall">
            <div class="whd"><div class="sc"><b class="num">${a.toFixed(1)}</b>${stars(a, false)}<small class="num">from ${pl(c, 'review')}</small></div>${distBars(p.dist)}</div>
            <p class="r42">${ICON.shield}All reviews are from travellers who completed this trip. ${V25}</p>
            ${wait.map((x) => card(x, true)).join('')}
            ${pub.map((x) => card(x, false)).join('')}
            ${c > pub.length ? `<p class="more"><span class="num">Showing ${pub.length} of ${c}</span><span class="a-btn ghost sm">Show more reviews</span></p>` : ''}
            ${!wait.length && !pub.length ? '<p class="a-empty">No reviews on this trip yet.</p>' : ''}
          </div></div>
        <aside class="ad-rv-side">
          <section class="a-card"><div class="a-card-h"><h2>On this page</h2></div><div class="a-card-b"><dl class="a-kv">
            <div><dt>Rating shown</dt><dd class="num">${a.toFixed(1)} · ${pl(c, 'review')}</dd></div>
            <div><dt>If all waiting publish</dt><dd class="num">${avg(ifAll).toFixed(1)} · ${pl(n(ifAll), 'review')}</dd></div>
            <div><dt>Waiting</dt><dd>${wait.length ? `<span class="a-chip warn">${wait.length} waiting</span>` : '<span class="a-chip ok">None</span>'}</dd></div>
            <div><dt>Led by ${V25}</dt><dd class="ad-rv-ld">${avatar(p.lead, 20)}${LEADERS[p.lead].name}</dd></div></dl>
            <p class="ad-rv-mute ad-rv-t">Google's rating snippet uses published reviews only; seeded testimonials never count.</p>
            <a href="#" class="a-btn ghost sm">${ICON.eye}Open the live page</a></div></section>
          <section class="a-card"><div class="a-card-h"><h2>Hidden from this page</h2><span class="a-chip mute num">${hid.length}</span></div><div class="a-card-b">
            ${hid.length ? `<ul class="ad-rv-hid">${hid.map((x) => `<li>${stars(x.r, false)}<b>${esc(x.name)}</b><p>${esc(x.text)}</p><span class="chk">${checks(x)}</span><button type="button" class="a-btn ghost sm" data-wmove="${x.id}" data-to="published">Publish instead</button></li>`).join('')}</ul>`
              : '<p class="ad-rv-mute">Nothing hidden on this trip.</p>'}</div></section>
          <section class="a-card"><div class="a-card-b ad-rv-all"><span><b class="num">${count('pending')}</b> waiting</span><span><b class="num">${count('published')}</b> published</span><span><b class="num">${count('hidden')}</b> hidden</span><small class="ad-rv-mute">across all trips</small></div></section>
        </aside>
      </div>
    </div>`;
    return TS.adminShell('Reviews', main);
  }
  function rvDMount(site, rerender) {
    rvD.flash = '';
    each(site, '[data-wpk]', 'click', (b) => { rvD.pk = b.dataset.wpk; rerender(); });
    each(site, '[data-dev]', 'click', (b) => { rvD.dev = b.dataset.dev; rerender(); });
    each(site, '[data-wmove]', 'click', (b) => {
      const x = RVS.find((y) => y.id === b.dataset.wmove); move(x, b.dataset.to);
      rvD.flash = b.dataset.to === 'published' ? `${x.name}'s review is live on this page. The rating is now ${avg(PR[x.pk].dist).toFixed(1)}.` : `${x.name}'s review is off the page. It is listed under Hidden, where you can publish it again.`;
      rerender();
    });
  }

  /* =====================================================================
     CSS
     ===================================================================== */
  const common = `
  .ad-rv-v25 { font-size: 10px !important; padding: 1px 6px !important; vertical-align: middle; }
  .ad-rv-mute { color: var(--mute); font-size: 12.5px; margin: 0; }
  .ad-rv-h2 { font-size: 18px; letter-spacing: -.02em; margin: 0; }
  .ad-rv-h3 { font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); margin: 0; }
  .ad-rv-lbl { font-size: 12.5px; font-weight: 700; }
  .ad-rv-row { display: flex; align-items: center; gap: 10px; justify-content: space-between; flex-wrap: wrap; }
  .ad-rv-row2b { display: flex !important; gap: 8px; flex-wrap: wrap; }
  .ad-rv-narrow { max-width: 150px; }
  .ad-rv-flash { animation: ad-rv-in .35s var(--ease); }
  @keyframes ad-rv-in { from { opacity: 0; transform: translateY(-4px); } }
  .ad-ds .ph, .ad-rv .ph { position: relative; overflow: hidden; background: #DDE3E6; display: block; }
  .ad-ds .ph img, .ad-rv .ph img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .ad-ds kbd, .ad-rv kbd { font: 700 11px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-bottom-width: 2px; border-radius: 5px; padding: 0 5px; background: var(--a-surf); color: var(--ink2); }
  .ad-ds-mon { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .ad-ds-mon button { font: 700 12px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--mute); border-radius: 7px; padding: 6px 0; cursor: pointer; transition: background .15s, color .15s; }
  .ad-ds-mon button[aria-pressed="true"] { background: var(--ok-soft); border-color: color-mix(in srgb, var(--ok) 40%, transparent); color: var(--ok); }
  .ad-ds-mon.sm { grid-template-columns: repeat(12, 1fr); } .ad-ds-mon.sm button { font-size: 10.5px; padding: 5px 0; }
  .ad-ds-save { position: sticky; bottom: 12px; z-index: 5; display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; background: var(--ink); color: #fff; border-radius: 14px; padding: 10px 12px 10px 16px; box-shadow: 0 18px 40px -20px rgba(20,32,42,.6); animation: ad-rv-in .3s var(--ease); }
  .ad-ds-save[hidden] { display: none; }
  .ad-ds-save .t { display: grid; gap: 1px; min-width: 0; flex: 1 1 240px; font-size: 13px; } .ad-ds-save .ls { color: var(--ink-soft); font-size: 12.5px; }
  .ad-ds-save .acts { display: flex; gap: 8px; } .ad-ds-save .a-btn.ghost { background: transparent; color: #fff; border-color: var(--ink-line); }
  .ad-ds-frame, .ad-rv-frame { background: #fff; border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; box-shadow: 0 24px 50px -40px rgba(20,32,42,.5); min-width: 0; }
  .ad-rv-fbar { display: flex; align-items: center; gap: 10px; padding: 9px 14px; background: var(--bg2); border-bottom: 1px solid var(--a-line); font-size: 12px; min-width: 0; }
  .ad-rv-fbar .dots { display: flex; gap: 5px; } .ad-rv-fbar .dots i { width: 9px; height: 9px; border-radius: 50%; background: #D5DCE2; }
  .ad-rv-fbar .url { font-weight: 600; color: var(--mute); background: #fff; border: 1px solid var(--a-line); border-radius: 7px; padding: 3px 10px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .ad-rv .stars { display: inline-flex; gap: 1px; align-items: center; color: #B86E00; }
  .ad-rv .stars svg { width: 14px; height: 14px; } .ad-rv .stars .off { color: #D5DCE2; } .ad-rv .stars b { margin-left: 5px; color: var(--ink); font-size: 13px; }
  .ad-rv-ref { color: var(--pri); font-weight: 800; letter-spacing: .04em; text-decoration: none; }
  @media (prefers-reduced-motion: reduce) { .ad-ds *, .ad-rv * { animation: none !important; transition: none !important; } }
  `;

  const dsCss = common + `
  /* B · storefront */
  .ad-ds-frame .ad-rv-fbar .a-chip { flex: none; }
  .ad-ds-frame .fbody { padding: 22px 22px 26px; display: grid; gap: 16px; }
  .ad-ds-frame .sh { display: flex; align-items: end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .ad-ds-frame .sh h2 { font-size: 26px; letter-spacing: -.03em; margin: 0; } .ad-ds-frame .sh p { color: var(--ink2); margin: 2px 0 0; font-size: 14px; }
  .ad-ds-frame .sh a { display: inline-flex; gap: 6px; align-items: center; color: var(--pri); font-weight: 700; text-decoration: none; font-size: 14px; } .ad-ds-frame .sh a .ic { width: 15px; height: 15px; }
  .ad-ds-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .ad-ds-tile { display: grid; gap: 8px; border-radius: 16px; transition: transform .3s var(--ease), opacity .2s; }
  .ad-ds-tile .ph { aspect-ratio: 4 / 3; border-radius: 16px; color: #fff; }
  .ad-ds-tile .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,20,30,.8), transparent 55%); }
  .ad-ds-tile .pill { position: absolute; top: 12px; left: 12px; background: rgba(255,255,255,.92); color: var(--ink); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; }
  .ad-ds-tile .cap { position: absolute; left: 14px; right: 14px; bottom: 14px; display: grid; gap: 2px; text-shadow: 0 2px 16px rgba(0,0,0,.35); }
  .ad-ds-tile .cap b { font-size: 26px; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; } .ad-ds-tile .cap small { font-size: 12px; font-weight: 600; opacity: .95; }
  .ad-ds-b[data-mode="edit"] .ad-ds-tile { cursor: grab; }
  .ad-ds-b [contenteditable] { border-radius: 5px; outline: 1px dashed transparent; outline-offset: 2px; cursor: text; transition: outline-color .15s, background .15s; }
  .ad-ds-b [contenteditable]:hover { outline-color: rgba(255,255,255,.7); }
  .ad-ds-b [contenteditable]:focus { outline: 2px solid var(--act); background: rgba(10,20,30,.35); }
  .ad-ds-tile .ctl { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; align-items: center; opacity: .0; transition: opacity .2s; }
  .ad-ds-tile:hover .ctl, .ad-ds-tile:focus-within .ctl, .ad-ds-tile.sel .ctl { opacity: 1; }
  .ad-ds-tile .ctl .pos { width: 28px; height: 28px; border-radius: 8px; background: var(--act); color: var(--ink); font-weight: 800; font-size: 13px; display: grid; place-items: center; }
  .ad-ds-tile .ctl .grip, .ad-ds-tile .ctl .mv { width: 28px; height: 28px; border-radius: 8px; background: rgba(20,32,42,.72); color: #fff; display: grid; place-items: center; border: 0; cursor: pointer; }
  .ad-ds-tile .ctl .grip { cursor: grab; } .ad-ds-tile .ctl .mv[disabled] { opacity: .35; cursor: default; } .ad-ds-tile .ctl .ic { width: 15px; height: 15px; }
  .ad-ds-tile .ctl .mv:hover:not([disabled]) { background: var(--pri); }
  .ad-ds-tile.sel .ph { box-shadow: 0 0 0 3px var(--pri), 0 16px 30px -18px rgba(27,79,216,.8); }
  .ad-ds-tile.drag { opacity: .45; } .ad-ds-tile.over .ph { box-shadow: 0 0 0 3px var(--act); transform: scale(.98); }
  .ad-ds-tile.moved .ph { animation: ad-ds-pop .6s var(--ease); }
  @keyframes ad-ds-pop { 0% { transform: scale(.94); } 60% { transform: scale(1.02); } 100% { transform: none; } }
  .ad-ds-tile .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0; font-size: 12px; color: var(--mute); padding: 0 2px; }
  .ad-ds-dockb { display: grid; grid-template-columns: 220px minmax(0, 1fr) 230px; gap: 18px; align-items: start; }
  .ad-ds-dockb .cov { display: grid; gap: 8px; } .ad-ds-dockb .cov .ph { aspect-ratio: 4 / 3; border-radius: 12px; } .ad-ds-dockb .cov small { color: var(--mute); font-size: 12px; } .ad-ds-dockb .cov .a-btn { justify-self: start; }
  .ad-ds-dockb .flds { display: grid; gap: 12px; min-width: 0; }
  .ad-ds-dockb .side { display: grid; gap: 10px; align-content: start; } .ad-ds-dockb .side .a-btn { justify-self: start; }
  .ad-ds-menu { list-style: none; margin: 0; padding: 6px; border: 1px solid var(--a-line); border-radius: 12px; display: grid; gap: 1px; box-shadow: 0 14px 30px -24px rgba(20,32,42,.5); }
  .ad-ds-menu li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; font-size: 13.5px; font-weight: 600; }
  .ad-ds-menu li .num { color: var(--mute); font-size: 11.5px; width: 12px; } .ad-ds-menu li small { margin-left: auto; color: var(--mute); font-size: 11.5px; font-weight: 600; }
  .ad-ds-menu li.on { background: var(--pri-soft); color: var(--pri-ink); }

  /* C · atlas */
  .ad-ds-cgrid { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 16px; align-items: start; }
  .ad-ds-mapw { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: center; }
  .ad-ds-map { width: 100%; max-height: 420px; display: block; overflow: visible; }
  .ad-ds-map .land { fill: color-mix(in srgb, var(--pri) 7%, var(--bg2)); stroke: color-mix(in srgb, var(--pri) 25%, var(--a-line)); stroke-width: 1.2; stroke-linejoin: round; }
  .ad-ds-map .isl circle { fill: color-mix(in srgb, var(--pri) 25%, var(--a-line)); }
  .ad-ds-map .nd { cursor: pointer; outline: none; }
  .ad-ds-map .nd .dot { fill: #fff; stroke-width: 3; transition: stroke-width .2s; }
  .ad-ds-map .nd.in .dot { stroke: var(--ok); } .ad-ds-map .nd.off .dot { stroke: #8A96A1; }
  .ad-ds-map .nd.on .dot { fill: var(--pri); stroke: var(--pri); }
  .ad-ds-map .nd:hover .dot, .ad-ds-map .nd:focus-visible .dot { stroke-width: 5; }
  .ad-ds-map .nd:focus-visible .nm { text-decoration: underline; }
  .ad-ds-map .pulse { fill: none; stroke: var(--pri); stroke-width: 2; transform-box: fill-box; transform-origin: center; animation: ad-ds-pulse 1.8s var(--ease) infinite; }
  @keyframes ad-ds-pulse { from { transform: scale(.8); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }
  .ad-ds-map .nm { font: 800 11px "DM Sans", sans-serif; fill: var(--ink); paint-order: stroke; stroke: #fff; stroke-width: 3px; }
  .ad-ds-map .sb { font: 600 8.5px "DM Sans", sans-serif; fill: var(--mute); paint-order: stroke; stroke: #fff; stroke-width: 3px; }
  .ad-ds-pick { display: grid; gap: 10px; }
  .ad-ds-pick .ph { aspect-ratio: 4 / 3; border-radius: 12px; }
  .ad-ds-pick div { display: grid; gap: 3px; justify-items: start; } .ad-ds-pick b { font-size: 20px; letter-spacing: -.02em; } .ad-ds-pick small { color: var(--mute); font-size: 12.5px; }
  .ad-ds-rib { display: grid; gap: 3px; }
  .ad-ds-rib .rh, .ad-ds-rib .rr { display: grid; grid-template-columns: 96px repeat(12, minmax(0, 1fr)); gap: 3px; align-items: center; }
  .ad-ds-rib .rh span { font-size: 11px; font-weight: 800; color: var(--a-th); text-align: center; } .ad-ds-rib .rh em { font-style: normal; display: none; }
  .ad-ds-rib .rh span.now { color: var(--pri); }
  .ad-ds-rib .rr { border: 0; background: none; padding: 2px 0; font: inherit; color: inherit; cursor: pointer; border-radius: 8px; text-align: left; }
  .ad-ds-rib .rr:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .ad-ds-rib .rr.on { background: var(--pri-soft); }
  .ad-ds-rib .rr .nm { font-size: 13px; font-weight: 700; padding-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ad-ds-rib .c { height: 26px; border-radius: 6px; background: var(--bg2); display: grid; place-items: center; font-size: 11.5px; position: relative; }
  .ad-ds-rib .c.best { background: var(--ok-soft); color: var(--ok); }
  .ad-ds-rib .c.out { background: var(--warn-soft); color: var(--warn); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--warn) 55%, transparent); }
  .ad-ds-rib .c.now { outline: 2px solid color-mix(in srgb, var(--pri) 55%, transparent); outline-offset: -2px; }
  .ad-ds-rib .lg { display: flex; gap: 6px 16px; flex-wrap: wrap; font-size: 12px; color: var(--mute); margin: 8px 0 0; align-items: center; }
  .ad-ds-rib .lg span { display: inline-flex; gap: 6px; align-items: center; } .ad-ds-rib .lg i { width: 14px; height: 12px; border-radius: 3px; display: inline-block; }
  .ad-ds-rib .lg i.best { background: var(--ok-soft); } .ad-ds-rib .lg i.out { background: var(--warn-soft); box-shadow: inset 0 0 0 1.5px var(--warn); } .ad-ds-rib .lg i.now { box-shadow: inset 0 0 0 2px var(--pri); }
  .ad-ds-ced .a-tabs { margin-top: 4px; }
  .ad-ds-cbody { gap: 12px !important; }
  .ad-ds-cbody .cov { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; } .ad-ds-cbody .cov .ph { aspect-ratio: 16 / 9; border-radius: 10px; }
  .ad-rv-warn { display: flex; gap: 10px; background: var(--warn-soft); color: var(--warn); border-radius: 12px; padding: 10px 12px; font-size: 13px; margin: 0; } .ad-rv-warn .ic { width: 16px; height: 16px; flex: none; margin-top: 2px; }
  .ad-ds-deps { list-style: none; margin: 0; padding: 0; display: grid; }
  .ad-ds-deps li { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--a-line); font-size: 13px; }
  .ad-ds-deps .dt { font-weight: 800; } .ad-ds-deps .pk { display: grid; min-width: 0; } .ad-ds-deps .pk small { color: var(--mute); font-size: 12px; }
  .ad-ds-serp { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--a-line); border-radius: 12px; }
  .ad-ds-serp small { color: #3C6E47; font-size: 12px; } .ad-ds-serp b { color: #1A0DAB; font-size: 17px; font-weight: 500; } .ad-ds-serp p { margin: 0; font-size: 13px; color: #4D5156; line-height: 1.45; }
  .ad-ds-meter { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 12px; color: var(--mute); font-weight: 700; }
  .ad-ds-og { display: grid; grid-template-columns: 110px minmax(0, 1fr); border: 1px solid var(--a-line); border-radius: 12px; overflow: hidden; }
  .ad-ds-og .ph { aspect-ratio: 1.91 / 1; } .ad-ds-og > span:last-child { padding: 8px 12px; display: grid; align-content: center; gap: 2px; font-size: 13px; } .ad-ds-og small { color: var(--mute); font-size: 11.5px; }

  /* D · ledger */
  .ad-ds-look { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 14px var(--a-pad); display: grid; gap: 10px; }
  .ad-ds-look h2 { display: flex; gap: 8px; align-items: center; } .ad-ds-look h2 .num { background: var(--act); color: var(--ink); border-radius: 99px; padding: 0 7px; font-size: 11px; letter-spacing: 0; }
  .ad-ds-look ul { list-style: none; margin: 0; padding: 0; display: grid; }
  .ad-ds-look li { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--a-line); font-size: 13.5px; }
  .ad-ds-look li:first-child { border-top: 0; } .ad-ds-look li .a-chip { justify-self: start; }
  .ad-ds-ord .a-card-b { display: flex; gap: 12px 18px; align-items: center; flex-wrap: wrap; }
  .ad-ds-ord .a-card-b > div { display: grid; gap: 2px; flex: 1 1 220px; } .ad-ds-ord small { color: var(--mute); font-size: 12.5px; }
  .ad-ds-ord ol { display: flex; gap: 6px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; counter-reset: o; }
  .ad-ds-ord li { counter-increment: o; font-size: 12.5px; font-weight: 700; border: 1px solid var(--a-line); border-radius: 99px; padding: 4px 10px 4px 6px; display: inline-flex; gap: 6px; align-items: center; }
  .ad-ds-ord li::before { content: counter(o); width: 18px; height: 18px; border-radius: 50%; background: var(--bg2); display: grid; place-items: center; font-size: 11px; }
  .ad-ds-ord li.chg { border-color: color-mix(in srgb, var(--act) 70%, transparent); background: var(--warn-soft); }
  .ad-ds-led th button { background: none; border: 0; font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; padding: 0; display: inline-flex; gap: 4px; }
  .ad-ds-led th .ar { color: var(--pri); min-width: 8px; }
  .ad-ds-rowbtn { display: flex; align-items: center; gap: 10px; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; text-align: left; }
  .ad-ds-rowbtn .ph { width: 52px; height: 38px; border-radius: 8px; flex: none; } .ad-ds-rowbtn > span:nth-child(2) { display: grid; }
  .ad-ds-rowbtn .ic { width: 15px; height: 15px; color: var(--mute); transition: transform .25s var(--ease); } .ad-ds-rowbtn[aria-expanded="true"] .ic { transform: rotate(180deg); }
  .ad-ds-fill { display: grid; grid-template-columns: 64px auto; gap: 8px; align-items: center; justify-content: end; }
  .ad-ds-led tfoot td { border-top: 1px solid var(--a-line); background: var(--bg2); font-weight: 700; }
  .ad-ds-exp > td { background: var(--bg2); padding: 0 !important; }
  .ad-ds-exp .in { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; padding: 14px var(--a-pad) 16px; animation: ad-rv-in .3s var(--ease); }
  .ad-ds-exp ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
  .ad-ds-exp li { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 10px; padding: 6px 10px 6px 6px; }
  .ad-ds-exp li .ph { width: 44px; height: 34px; border-radius: 6px; } .ad-ds-exp li .n { display: grid; min-width: 0; } .ad-ds-exp li .n small { display: inline; } .ad-ds-exp .sm { font-size: 12.5px; color: var(--ink2); }
  .ad-ds-exp .qe { display: grid; gap: 10px; align-content: start; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 12px; padding: 12px; }
  .ad-ds-exp .qe .ad-rv-row { align-items: end; }

  @container site (max-width: 700px) {
    .ad-ds-frame .fbody { padding: 14px 12px 16px; } .ad-ds-frame .sh h2 { font-size: 21px; }
    .ad-ds-frame .ad-rv-fbar .url { display: none; }
    .ad-ds-grid { grid-template-columns: 1fr; gap: 12px; }
    .ad-ds-tile .ph { aspect-ratio: 16 / 9; } .ad-ds-tile .cap b { font-size: 22px; }
    .ad-ds-tile .ctl { opacity: 1; }
    .ad-ds-dockb { grid-template-columns: 1fr; }
    .ad-ds-save { bottom: 8px; } .ad-ds-save .acts { width: 100%; } .ad-ds-save .acts .a-btn { flex: 1; justify-content: center; }
    .ad-ds-cgrid { grid-template-columns: 1fr; }
    .ad-ds-mapw { grid-template-columns: 1fr; }
    .ad-ds-pick { grid-template-columns: 120px minmax(0, 1fr); align-items: center; }
    .ad-ds-rib .rh, .ad-ds-rib .rr { grid-template-columns: 64px repeat(12, minmax(0, 1fr)); gap: 2px; }
    .ad-ds-rib .rr .nm { font-size: 11.5px; padding-left: 4px; } .ad-ds-rib .c { height: 22px; font-size: 10.5px; }
    .ad-ds-look li { grid-template-columns: minmax(0, 1fr) auto; } .ad-ds-look li .x { grid-column: 1 / -1; grid-row: 2; } .ad-ds-look li .a-btn { grid-row: 1; grid-column: 2; }
    .ad-ds-led thead { display: none; }
    .ad-ds-led, .ad-ds-led tbody, .ad-ds-led tfoot { display: block; }
    .ad-ds-led tr { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; padding: 12px var(--a-pad); border-bottom: 1px solid var(--a-line); }
    .ad-ds-led td { border: 0 !important; padding: 0 !important; text-align: left !important; display: grid; gap: 1px; }
    .ad-ds-led td[data-l]::before { content: attr(data-l); font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); }
    .ad-ds-led td:first-child { display: none; }
    .ad-ds-led td[data-l="Destination"] { grid-column: 1 / -1; } .ad-ds-led td[data-l="Destination"]::before { display: none; }
    .ad-ds-led td:empty { display: none; }
    .ad-ds-fill { justify-content: start; }
    .ad-ds-led tr.ad-ds-exp { display: block; padding: 0; } .ad-ds-exp > td { display: block; }
    .ad-ds-exp .in { grid-template-columns: 1fr; padding: 12px; }
    .ad-ds-exp li { grid-template-columns: 44px minmax(0, 1fr) auto; } .ad-ds-exp li .sm { display: none; }
    .ad-ds-mon.sm { grid-template-columns: repeat(6, 1fr); }
  }`;

  const rvCss = `
  .ad-rv-m42 { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; font-size: 12.5px; color: var(--mute); }
  .ad-rv-m42 b { color: var(--ink); font-size: 13.5px; }
  .ad-rv-m42 .vt { color: var(--ok); font-weight: 700; display: inline-flex; gap: 4px; align-items: center; } .ad-rv-m42 .vt .ic { width: 14px; height: 14px; }
  .ad-rv-m42 .ld, .ad-rv-ld { display: inline-flex; gap: 6px; align-items: center; }
  .ad-rv-dist { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .ad-rv-dist li { display: grid; grid-template-columns: 26px minmax(0, 1fr) 22px; gap: 8px; align-items: center; font-size: 12px; color: var(--mute); font-weight: 700; }
  .ad-rv-dist .bar { height: 7px; border-radius: 99px; background: #E6EBEF; overflow: hidden; display: block; }
  .ad-rv-dist .bar i { display: block; height: 100%; width: var(--w); background: #B86E00; border-radius: inherit; }
  .ad-rv-dist li.hi { color: var(--pri); } .ad-rv-dist li.hi .bar i { background: var(--pri); }
  .ad-rv-dist .c { text-align: right; }

  /* B · deck */
  .ad-rv-bgrid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
  .ad-rv-stage { min-width: 0; }
  .ad-rv-deck { display: grid; gap: 14px; max-width: 760px; }
  .ad-rv-prog { display: flex; gap: 12px; align-items: center; font-size: 13px; flex-wrap: wrap; }
  .ad-rv-prog .segs { display: flex; gap: 4px; flex: 1 1 120px; } .ad-rv-prog .segs i { flex: 1; height: 5px; border-radius: 99px; background: var(--a-line); }
  .ad-rv-prog .segs i.seen { background: color-mix(in srgb, var(--pri) 35%, var(--a-line)); } .ad-rv-prog .segs i.on { background: var(--pri); }
  .ad-rv-stack { position: relative; padding-bottom: 0; }
  .ad-rv-stack.more { padding-bottom: 10px; } .ad-rv-stack.more2 { padding-bottom: 20px; }
  .ad-rv-stack.more::before, .ad-rv-stack.more2::after { content: ""; position: absolute; left: 16px; right: 16px; bottom: 0; height: 40px; border-radius: 0 0 20px 20px; background: var(--a-surf); border: 1px solid var(--a-line); border-top: 0; }
  .ad-rv-stack.more2::after { left: 32px; right: 32px; opacity: .7; }
  .ad-rv-stack.more2::before { bottom: 10px; }
  .ad-rv-card { position: relative; z-index: 1; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 20px; overflow: hidden; box-shadow: 0 30px 60px -44px rgba(20,32,42,.55); animation: ad-rv-cardin .35s var(--ease); }
  @keyframes ad-rv-cardin { from { opacity: 0; transform: translateY(10px) scale(.985); } }
  .ad-rv-card.out-p { transform: translateX(60px) rotate(2deg); opacity: 0; transition: transform .26s var(--ease), opacity .26s; }
  .ad-rv-card.out-h { transform: translateX(-60px) rotate(-2deg); opacity: 0; transition: transform .26s var(--ease), opacity .26s; }
  .ad-rv-card header { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--a-line); }
  .ad-rv-card header .ph { width: 64px; height: 48px; border-radius: 10px; }
  .ad-rv-card header .h { display: grid; gap: 3px; } .ad-rv-card header small { color: var(--mute); font-size: 12.5px; font-weight: 700; }
  .ad-rv-card header b { display: flex; gap: 8px; align-items: center; font-size: 14px; } .ad-rv-card header .stars svg { width: 20px; height: 20px; }
  .ad-rv-card .txt { padding: 18px 22px 6px; font-size: 18px; line-height: 1.6; color: var(--ink); } .ad-rv-card .txt p { margin: 0 0 12px; max-width: 62ch; }
  .ad-rv-card footer { padding: 12px 22px 16px; display: grid; gap: 10px; border-top: 1px dashed var(--a-line); }
  .ad-rv-chk { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ad-rv-keys { display: grid; grid-template-columns: 1fr auto 1.4fr; gap: 10px; }
  .ad-rv-keys .a-btn { justify-content: center; padding: 12px 16px; font-size: 14.5px; } .ad-rv-keys .a-btn kbd { margin-left: 4px; }
  .ad-rv-keys .a-btn:not(.ghost) kbd { background: rgba(255,255,255,.18); color: #fff; border-color: rgba(255,255,255,.35); }
  .ad-rv-c { text-align: center; }
  .ad-rv-rail { display: grid; gap: 14px; }
  .ad-rv-if { display: grid; gap: 12px; }
  .ad-rv-if .big { display: flex; align-items: center; gap: 14px; } .ad-rv-if .big > span { display: grid; } .ad-rv-if .big .ic { width: 18px; height: 18px; color: var(--mute); }
  .ad-rv-if .big small { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); } .ad-rv-if .big b { font-size: 28px; letter-spacing: -.03em; line-height: 1.1; } .ad-rv-if .big em { font-style: normal; font-size: 12px; color: var(--mute); }
  .ad-rv-if .a-btn { justify-self: start; }
  .ad-rv-log { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .ad-rv-log li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; animation: ad-rv-in .3s var(--ease); } .ad-rv-log li .a-btn { margin-left: auto; }
  .ad-rv-help .a-card-b { display: flex; gap: 8px 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--mute); align-items: center; } .ad-rv-help b { color: var(--ink); width: 100%; }
  .ad-rv-clear { text-align: center; display: grid; justify-items: center; gap: 10px; padding: 50px 20px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 20px; }
  .ad-rv-clear .ic-b { width: 54px; height: 54px; border-radius: 16px; background: var(--ok-soft); color: var(--ok); display: grid; place-items: center; } .ad-rv-clear .ic-b .ic { width: 26px; height: 26px; }
  .ad-rv-clear h2 { margin: 0; font-size: 22px; } .ad-rv-clear p { margin: 0; color: var(--ink2); max-width: 44ch; }
  .ad-rv-plain ul { list-style: none; margin: 0; padding: 0; }
  .ad-rv-plain li { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px var(--a-pad); border-top: 1px solid var(--a-line); }
  .ad-rv-plain li:first-child { border-top: 0; } .ad-rv-plain .ph { width: 56px; height: 42px; border-radius: 8px; }
  .ad-rv-plain .t { display: grid; gap: 2px; min-width: 0; } .ad-rv-plain small { color: var(--mute); font-size: 12px; } .ad-rv-plain .ex { font-size: 13px; color: var(--ink2); }
  .ad-rv-pad { padding: 8px var(--a-pad) 12px; }

  /* C · insight */
  .ad-rv-cgrid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
  .ad-rv-cmain { display: grid; gap: 16px; min-width: 0; }
  .ad-rv-top { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; }
  .ad-rv-score .a-card-b { display: grid; gap: 6px; justify-items: start; }
  .ad-rv-score small { font-size: 12px; font-weight: 800; color: var(--mute); } .ad-rv-score > .a-card-b > b { font-size: 44px; letter-spacing: -.04em; line-height: 1; }
  .ad-rv-score .stars svg { width: 18px; height: 18px; } .ad-rv-score .ad-rv-dist { width: 100%; margin-top: 6px; }
  .ad-rv-themes .a-card-h .ad-rv-mute { margin-left: auto; }
  .ad-rv-themes ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .ad-rv-themes button { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; align-items: center; text-align: left; background: var(--bg2); border: 1px solid transparent; border-radius: 10px; padding: 8px 10px; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s, background .2s; }
  .ad-rv-themes button:hover { border-color: var(--a-line); background: var(--a-surf); }
  .ad-rv-themes button.on { border-color: var(--pri); background: var(--pri-soft); }
  .ad-rv-themes b { font-size: 13px; } .ad-rv-themes .a-chip { grid-row: 1; grid-column: 2; } .ad-rv-themes .c { grid-column: 1 / -1; font-size: 12px; color: var(--mute); font-weight: 700; }
  .ad-rv-themes .c em { font-style: normal; color: var(--warn); }
  .ad-rv-trips td { vertical-align: middle; }
  .ad-rv-tb { display: flex; gap: 10px; align-items: center; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; text-align: left; }
  .ad-rv-tb .ph { width: 44px; height: 32px; border-radius: 6px; flex: none; } .ad-rv-tb[aria-pressed="true"] b { color: var(--pri); }
  .ad-rv-trips b.lo { color: var(--warn); }
  .ad-rv-stk { display: flex; height: 10px; border-radius: 99px; overflow: hidden; width: 140px; background: #E6EBEF; gap: 1px; }
  .ad-rv-stk i { display: block; } .ad-rv-stk .s5 { background: var(--ok); } .ad-rv-stk .s4 { background: color-mix(in srgb, var(--ok) 55%, #fff); } .ad-rv-stk .s3 { background: var(--act); } .ad-rv-stk .s2 { background: var(--warn); } .ad-rv-stk .s1 { background: #B42318; }
  .ad-rv-leads { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .ad-rv-leads button { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; text-align: left; background: none; border: 1px solid var(--a-line); border-radius: 12px; padding: 10px; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s; }
  .ad-rv-leads button:hover { border-color: var(--ink); } .ad-rv-leads button.on { border-color: var(--pri); background: var(--pri-soft); }
  .ad-rv-leads .n, .ad-rv-leads .s { display: grid; gap: 2px; } .ad-rv-leads .s { justify-items: end; } .ad-rv-leads small { color: var(--mute); font-size: 12px; }
  .ad-rv-cq .ad-rv-clr { border: 0; cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 800; }
  .ad-rv-cq .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .ad-rv-q { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .ad-rv-qi { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--a-line); border-radius: 12px; animation: ad-rv-in .3s var(--ease); }
  .ad-rv-qi .top { display: flex; gap: 8px; align-items: center; } .ad-rv-qi .top small { margin-left: auto; color: var(--mute); font-size: 12px; }
  .ad-rv-qi .pk { color: var(--mute); font-size: 12px; font-weight: 700; } .ad-rv-qi p { margin: 0; font-size: 13.5px; color: var(--ink2); line-height: 1.5; }
  .ad-rv-qi .tg { display: flex; gap: 4px; flex-wrap: wrap; } .ad-rv-qi .act { display: flex; gap: 6px; }

  /* D · wall */
  .ad-rv-pick { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
  .ad-rv-pick button { flex: none; display: flex; gap: 8px; align-items: center; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 12px; padding: 5px 10px 5px 5px; font: 700 13px "DM Sans", sans-serif; color: var(--ink); cursor: pointer; transition: border-color .2s; }
  .ad-rv-pick button:hover { border-color: var(--ink); } .ad-rv-pick button[aria-selected="true"] { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri); background: var(--pri-soft); }
  .ad-rv-pick .ph { width: 36px; height: 28px; border-radius: 7px; }
  .ad-rv-dgrid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
  .ad-rv-frame { justify-self: stretch; }
  .ad-rv-frame[data-dev="phone"] { justify-self: center; width: min(390px, 100%); border-radius: 28px; border-width: 6px; border-color: var(--ink); }
  .ad-rv-frame .wall { padding: 22px 26px 26px; display: grid; gap: 14px; }
  .ad-rv-frame[data-dev="phone"] .wall { padding: 16px 14px 20px; }
  .ad-rv-frame[data-dev="phone"] .ad-rv-fbar .url { font-size: 11px; }
  .ad-rv-frame .whd { display: grid; grid-template-columns: auto minmax(0, 260px); gap: 18px 28px; align-items: center; }
  .ad-rv-frame[data-dev="phone"] .whd { grid-template-columns: 1fr; }
  .ad-rv-frame .sc { display: grid; gap: 4px; } .ad-rv-frame .sc b { font-size: 42px; letter-spacing: -.04em; line-height: 1; } .ad-rv-frame .sc small { color: var(--mute); font-size: 13px; }
  .ad-rv-frame .sc .stars svg { width: 18px; height: 18px; }
  .ad-rv-frame .r42 { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 0; font-size: 13px; font-weight: 700; color: var(--ok); padding-bottom: 12px; border-bottom: 1px solid var(--line); } .ad-rv-frame .r42 .ic { width: 16px; height: 16px; }
  .ad-rv-wc { display: grid; gap: 8px; padding: 16px 0 14px; border-bottom: 1px solid var(--line); position: relative; animation: ad-rv-in .3s var(--ease); }
  .ad-rv-wc.ghost { border: 1.5px dashed color-mix(in srgb, var(--act-ink) 70%, transparent); border-radius: 14px; padding: 12px 14px 14px; background: color-mix(in srgb, var(--warn-soft) 60%, #fff); }
  .ad-rv-wc .gh { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-rv-wc .st { display: flex; gap: 6px; align-items: center; font-weight: 800; font-size: 13px; }
  .ad-rv-wc .txt { font-size: 15px; line-height: 1.6; } .ad-rv-wc .txt p { margin: 0 0 8px; } .ad-rv-wc.ghost .txt { opacity: .85; }
  .ad-rv-wc .m { margin: 0; }
  .ad-rv-wc .ops { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ad-rv-wc:not(.ghost) .ops { position: absolute; top: 12px; right: 0; opacity: 0; transition: opacity .2s; }
  .ad-rv-wc:not(.ghost):hover .ops, .ad-rv-wc:not(.ghost):focus-within .ops { opacity: 1; }
  .ad-rv-frame .more { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: var(--mute); font-size: 13px; margin: 0; flex-wrap: wrap; }
  .ad-rv-side { display: grid; gap: 14px; }
  .ad-rv-side .ad-rv-t { margin: 10px 0; }
  .ad-rv-hid { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .ad-rv-hid li { display: grid; gap: 6px; justify-items: start; font-size: 13px; } .ad-rv-hid p { margin: 0; color: var(--mute); } .ad-rv-hid .chk { display: flex; gap: 4px; flex-wrap: wrap; }
  .ad-rv-all { display: flex; gap: 6px 14px; flex-wrap: wrap; align-items: baseline; font-size: 13px; } .ad-rv-all b { font-size: 18px; }

  @container site (max-width: 700px) {
    .ad-rv-bgrid, .ad-rv-cgrid, .ad-rv-dgrid, .ad-rv-top { grid-template-columns: 1fr; }
    .ad-rv-card .txt { font-size: 16px; padding: 14px 16px 4px; } .ad-rv-card header { padding: 12px 14px; grid-template-columns: 48px minmax(0, 1fr); }
    .ad-rv-card header .ph { width: 48px; height: 38px; } .ad-rv-card header .a-chip { grid-column: 1 / -1; justify-self: start; }
    .ad-rv-card footer { padding: 12px 16px 14px; }
    .ad-rv-keys { position: sticky; bottom: 8px; z-index: 4; background: var(--a-bg); padding: 6px 0; grid-template-columns: 1fr 1fr; }
    .ad-rv-keys [data-bskip] { display: none; } .ad-rv-keys kbd { display: none; }
    .ad-rv-help { display: none; }
    .ad-rv-cq { order: -1; }
    .ad-rv-themes ul, .ad-rv-leads { grid-template-columns: 1fr; }
    .ad-rv-trips th:nth-child(3), .ad-rv-trips td:nth-child(3), .ad-rv-trips th:nth-child(5), .ad-rv-trips td:nth-child(5) { display: none; }
    .ad-rv-tb .ph { display: none; }
    .ad-rv-frame .wall { padding: 14px 12px 18px; } .ad-rv-frame .whd { grid-template-columns: 1fr; }
    .ad-rv-frame[data-dev="phone"] { border-width: 1px; border-color: var(--a-line); border-radius: var(--a-r); }
    .ad-rv-wc:not(.ghost) .ops { position: static; opacity: 1; }
    .ad-rv-plain li { grid-template-columns: minmax(0, 1fr); } .ad-rv-plain .ph { display: none; } .ad-rv-plain li .a-btn { justify-self: start; }
  }`;

  /* =====================================================================
     REGISTER
     ===================================================================== */
  TS.addVariants('destinations', [
    { id: 'B', name: 'Storefront editor',
      note: 'The page IS the home page\'s "Trending destinations" row, drawn with the same tile as the site (4:3 cover, "3 trips · best Nov–Feb" pill, name, "tagline · starting ₹X"). The owner drags tiles (or uses the arrow buttons) to set the order, and types straight over a name or tagline on the photo. Clicking a tile opens a details dock under the grid with the cover, slug, region, intro and best-month picker, next to the Explore menu drawn in the same order. A dark save bar lists every unsaved change; Customer view hides the controls. On a phone the grid becomes one 16:9 tile per row, as on the site, with the arrows always visible.',
      tradeoff: 'What-you-see ordering is instant, but the numbers behind each place (bookings, enquiries) are not on this page.',
      render: dsBRender, mount: dsBMount },
    { id: 'C', name: 'Season atlas',
      note: 'A map-led page: a schematic India with one dot per destination (size = live trips, green ring = in season now) and, under it, a season chart that lays best months against the months that actually have departures, flagging departures that fall outside the months the tile promises. The owner picks a place on the map or chart; the editor on the right has three tabs: Page (cover, name, region, tagline, intro, order), Season (month picker and every departure marked in or outside best months) and Search & share (the Google result and share card built from the same fields). On a phone the map, then the chart, then the editor stack.',
      tradeoff: 'The map is the most memorable view but the least dense; with 6 destinations it fits, with 30 it would need clustering.',
      render: dsCRender, mount: dsCMount },
    { id: 'D', name: 'Demand ledger',
      note: 'A performance table: each destination with live and draft trips, starting price, next departure, seats sold against capacity, booked value and enquiries, sortable by any column. Above it, "Needs a look" lists computed problems (departures outside best months, a place with nothing to book for eight months sitting high on the home page, drafts) and a suggested home-page order the owner can apply in one click. Clicking a destination expands its packages and a quick edit (tagline, best months, order) in place. On a phone each row becomes a labelled card.',
      tradeoff: 'Best for deciding what to push, but covers and intros are edited in the full editor, one click away.',
      render: dsDRender, mount: dsDMount },
  ], dsCss);

  TS.addVariants('reviews', [
    { id: 'B', name: 'Moderation deck',
      note: 'One review at a time, big and readable, like a card deck: trip photo, stars with a word, the full text, then the exact public byline (Verified traveller, travelled month, party size, Led by) and automatic checks for phone numbers, emails, personal details and complaints. The owner presses P to publish or H to hide (or taps the buttons); the card slides away and the next one arrives. The right rail shows what publishing does to the trip rating (now and after, with the breakdown) and a session log with Undo. Published and Hidden sit behind the segment switch. On a phone the Hide and Publish buttons stick to the bottom of the screen.',
      tradeoff: 'Fastest for clearing a queue, weakest for comparing reviews side by side.',
      render: rvBRender, mount: rvBMount },
    { id: 'C', name: 'Insight board',
      note: 'An analysis page with the queue beside it. The left side answers "what are travellers telling us": the published average with its star breakdown, recurring themes found by plain keyword matching (drivers, houseboat, cold nights, hotel upkeep, told too late) tagged Praised, Mixed or Complaint, a by-trip table sorted lowest first with a stacked star bar and waiting count, and trip leaders with the average on the trips they lead. Clicking any theme, trip or leader filters the waiting queue on the right, where Publish and Hide work inline. On a phone the queue comes first, then the insight cards.',
      tradeoff: 'Turns reviews into decisions about trips and leaders, but moderation itself is a side panel.',
      render: rvCRender, mount: rvCMount },
    { id: 'D', name: 'Page wall',
      note: 'Moderation on the page itself: pick a trip (those with waiting reviews first) and see its review section exactly as customers do, with the rating, the breakdown and the "All reviews are from travellers who completed this trip" line. Waiting reviews are dropped in at the top as dashed cards with "Publish here" and "Hide"; live reviews show a "Hide from page" action on hover. The side column shows the rating now and if everything waiting were published, the leader, and what is hidden on this trip with "Publish instead". A Desktop and Phone switch previews the wall at 390 px. On a phone it is one column.',
      tradeoff: 'Makes the customer\'s view impossible to forget, but you clear one trip at a time.',
      render: rvDRender, mount: rvDMount },
  ], rvCss);
})();

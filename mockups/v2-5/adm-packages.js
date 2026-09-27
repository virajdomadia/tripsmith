/* Round 3 · Packages (list) and Package editor — three new interiors each (B · C · D) inside admin style A.
   List:   B Photo catalogue (health on every card) · C Season planner (packages × months) · D Performance board.
   Editor: B Live preview (form beside the customer page) · C Itinerary builder (day storyboard, money in a drawer)
           · D Departures desk (dates, price grid, bulk dates, per-date inspector).
   Data copies admin-catalog.js and api/content/packages (the editor is munnar_alleppey_houseboat.py). */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON, LEADERS, avatar } = TS;
  const V25 = '<span class="a-chip pri ad-pe-v25" title="New in v2.5">v2.5</span>';
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const bind = (root, sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY = 864e5, T0 = Date.UTC(2026, 8, 27);
  const uOf = (s) => { const [d, m, y] = s.split(' '); return Date.UTC(+y, MON.indexOf(m), +d); };
  const uIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fmt = (u, yr = true) => { const t = new Date(u); return `${t.getUTCDate()} ${MON[t.getUTCMonth()]}${yr ? ' ' + t.getUTCFullYear() : ''}`; };
  const isoOf = (u) => new Date(u).toISOString().slice(0, 10);
  const wd = (u) => WD[new Date(u).getUTCDay()];
  const away = (u) => Math.round((u - T0) / DAY);
  const swi = (cls, isOn, label, extra = '') => `<button type="button" class="${cls}" role="switch" aria-checked="${isOn}" aria-label="${esc(label)}"${extra}><i></i></button>`;
  const RS = (v, label, attrs = '') => `<span class="ad-pe-rs"><span aria-hidden="true">₹</span><input inputmode="numeric" value="${v}" aria-label="${esc(label)}"${attrs}></span>`;
  const fld = (label, input, hint = '', cls = '') => `<div class="a-field ${cls}"><label>${label}</label>${input}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;

  /* ---------- the catalogue (same seed as admin-catalog.js) · deps: [date, seats, sold, double] ---------- */
  const PK = [
    { id: 'kasol', name: 'Kasol Riverside Weekend', slug: 'kasol-weekend-camp', dest: 'Himachal', n: 2, city: 'Ex-Delhi', img: 'img/kasol-1.jpg', status: 'live', feat: false, enq: 9, photos: 5, lead: 'tenzin', views: 212, bk: 4,
      deps: [['6 Nov 2026', 16, 12, 5999], ['20 Nov 2026', 16, 6, 5999], ['4 Dec 2026', 16, 2, 5499]] },
    { id: 'oldgoa', name: 'Old Goa & Dudhsagar Weekend', slug: 'old-goa-weekend', dest: 'Goa', n: 2, city: 'Ex-Goa', img: 'img/goa-6.jpg', status: 'live', feat: false, enq: 4, photos: 5, lead: 'meera', views: 88, bk: 2,
      deps: [['6 Nov 2026', 12, 7, 6499], ['27 Nov 2026', 12, 4, 6499], ['11 Dec 2026', 12, 0, 6999]] },
    { id: 'munnar', name: 'Munnar & Alleppey Houseboat', slug: 'munnar-alleppey-houseboat', dest: 'Kerala', n: 4, city: 'Ex-Bengaluru', img: 'img/munnar-2.jpg', status: 'live', feat: true, enq: 9, photos: 4, lead: 'anjali', views: 190, bk: 3, eb: true,
      deps: [['13 Nov 2026', 12, 8, 22999], ['18 Dec 2026', 10, 6, 25999], ['15 Jan 2027', 12, 2, 21999], ['12 Feb 2027', 12, 0, 21999]],
      deal: ['ok', 'Deal ₹19,999', 'Running: ₹2,000 off per traveller until 31 Oct 2026'] },
    { id: 'northgoa', name: 'North Goa Beaches', slug: 'north-goa-beaches', dest: 'Goa', n: 3, city: 'Ex-Mumbai', img: 'img/goa-3.jpg', status: 'live', feat: true, enq: 11, photos: 7, lead: 'meera', views: 246, bk: 4,
      deps: [['20 Nov 2026', 16, 9, 14999], ['18 Dec 2026', 4, 3, 17499], ['15 Jan 2027', 16, 2, 15499], ['12 Feb 2027', 12, 0, 14499]] },
    { id: 'goaq', name: 'Goa Quiet Escape', slug: 'goa-quiet-escape', dest: 'Goa', n: 4, city: 'Ex-Mumbai', img: 'img/goa-2.jpg', status: 'live', feat: false, enq: 6, photos: 6, lead: 'meera', views: 126, bk: 2,
      deps: [['27 Nov 2026', 12, 5, 21499], ['24 Dec 2026', 10, 8, 25999], ['22 Jan 2027', 12, 1, 21999]] },
    { id: 'kochi', name: 'Kochi · Thekkady · Kovalam', slug: 'kochi-thekkady-kovalam', dest: 'Kerala', n: 5, city: 'Ex-Bengaluru', img: 'img/hero-2.jpg', status: 'live', feat: false, enq: 4, photos: 6, lead: 'anjali', views: 104, bk: 1,
      deps: [['27 Nov 2026', 16, 4, 27999], ['23 Dec 2026', 14, 9, 31999], ['22 Jan 2027', 16, 1, 28499]],
      deal: ['mute', 'Deal ended', 'Deal ended on 15 Sep 2026'] },
    { id: 'jaipur', name: 'Jaipur · Jodhpur · Udaipur', slug: 'jaipur-jodhpur-udaipur', dest: 'Rajasthan', n: 5, city: 'Ex-Jaipur', img: 'img/jaipur-1.jpg', status: 'live', feat: true, enq: 12, photos: 7, lead: 'meera', views: 198, bk: 4, eb: true,
      deps: [['28 Nov 2026', 16, 11, 27999], ['26 Dec 2026', 16, 7, 29999], ['23 Jan 2027', 16, 3, 26499], ['20 Feb 2027', 16, 0, 26499]] },
    { id: 'manali', name: 'Manali · Kasol · Tosh', slug: 'manali-kasol-tosh', dest: 'Himachal', n: 5, city: 'Ex-Delhi', img: 'img/himachal-1.jpg', status: 'live', feat: false, enq: 5, photos: 6, lead: 'tenzin', views: 138, bk: 1,
      deps: [['5 Dec 2026', 16, 6, 21499], ['3 Apr 2027', 16, 0, 19999], ['8 May 2027', 16, 0, 19999], ['5 Jun 2027', 16, 0, 20999]] },
    { id: 'pb', name: 'Port Blair · Havelock · Neil', slug: 'port-blair-havelock-neil', dest: 'Andaman', n: 5, city: 'Ex-Port Blair', img: 'img/andaman-2.jpg', status: 'live', feat: true, enq: 10, photos: 7, lead: 'anjali', views: 176, bk: 3, eb: true,
      deps: [['5 Dec 2026', 16, 10, 34999], ['16 Jan 2027', 16, 3, 32999], ['13 Feb 2027', 16, 0, 32999], ['20 Mar 2027', 16, 0, 33999]] },
    { id: 'jais', name: 'Jaisalmer Desert Nights', slug: 'jaisalmer-desert-nights', dest: 'Rajasthan', n: 4, city: 'Ex-Jodhpur', img: 'img/rajasthan-1.jpg', status: 'live', feat: false, enq: 5, photos: 6, lead: 'meera', views: 98, bk: 1,
      deps: [['12 Dec 2026', 12, 5, 21999], ['9 Jan 2027', 12, 2, 19499], ['6 Feb 2027', 12, 0, 19499], ['6 Mar 2027', 12, 0, 19999]],
      deal: ['warn', 'Deal inactive', 'Deal inactive: ₹19,999 is not below the starting price ₹19,499'] },
    { id: 'shimla', name: 'Shimla–Manali Classic', slug: 'shimla-manali-classic', dest: 'Himachal', n: 4, city: 'Ex-Delhi', img: 'img/himachal-5.jpg', status: 'live', feat: true, enq: 7, photos: 6, lead: 'meera', views: 158, bk: 3,
      deps: [['19 Dec 2026', 24, 14, 21999], ['20 Mar 2027', 24, 2, 18499], ['17 Apr 2027', 24, 0, 18499], ['15 May 2027', 24, 0, 19999]] },
    { id: 'hav', name: 'Havelock Honeymoon', slug: 'havelock-honeymoon', dest: 'Andaman', n: 4, city: 'Ex-Port Blair', img: 'img/andaman-1.jpg', status: 'live', feat: false, enq: 5, photos: 5, lead: 'anjali', views: 76, bk: 1,
      deps: [['19 Dec 2026', 6, 4, 37999], ['10 Feb 2027', 6, 2, 34999], ['13 Mar 2027', 6, 0, 34999]] },
    { id: 'lehnp', name: 'Leh · Nubra · Pangong', slug: 'leh-nubra-pangong', dest: 'Ladakh', n: 6, city: 'Ex-Leh', img: 'img/ladakh-1.jpg', status: 'live', feat: true, enq: 8, photos: 7, lead: 'rigzin', views: 168, bk: 2, eb: true,
      deps: [['12 Jun 2027', 12, 2, 31999], ['3 Jul 2027', 12, 1, 29999], ['14 Aug 2027', 12, 0, 29999], ['11 Sep 2027', 12, 0, 30999]] },
    { id: 'leht', name: 'Leh & Turtuk', slug: 'leh-turtuk', dest: 'Ladakh', n: 5, city: 'Ex-Leh', img: 'img/nubra-1.jpg', status: 'live', feat: false, enq: 3, photos: 6, lead: 'rigzin', views: 58, bk: 0,
      deps: [['26 Jun 2027', 10, 0, 29499], ['24 Jul 2027', 10, 0, 27499], ['28 Aug 2027', 10, 0, 27499], ['18 Sep 2027', 10, 0, 28499]] },
    { id: 'lehcopy', name: 'Leh & Turtuk (copy)', slug: 'leh-turtuk-copy', dest: 'Ladakh', n: 6, city: 'Ex-Leh', img: 'img/ladakh-2.jpg', status: 'draft', feat: false, enq: 0, photos: 6, written: 6, lead: 'rigzin', views: 0, bk: 0,
      deps: [['26 Jun 2027', 10, 0, 29499], ['24 Jul 2027', 10, 0, 27499], ['28 Aug 2027', 10, 0, 27499], ['18 Sep 2027', 10, 0, 28499]] },
  ];
  const DESTS = ['Goa', 'Kerala', 'Himachal', 'Rajasthan', 'Andaman', 'Ladakh'];
  const SEASON = { Goa: [11, 12, 1, 2], Kerala: [9, 10, 11, 12, 1, 2, 3], Himachal: [3, 4, 5, 6, 12], Rajasthan: [10, 11, 12, 1, 2, 3], Andaman: [11, 12, 1, 2, 3, 4], Ladakh: [6, 7, 8, 9] };
  const SEASON_TXT = { Goa: 'Nov–Feb', Kerala: 'Sep–Mar', Himachal: 'Dec and Mar–Jun', Rajasthan: 'Oct–Mar', Andaman: 'Nov–Apr', Ladakh: 'Jun–Sep' };
  const from = (p) => Math.min(...p.deps.map((d) => d[3]));
  const soldOf = (p) => p.deps.reduce((s, d) => s + d[2], 0);
  const seatsOf = (p) => p.deps.reduce((s, d) => s + d[1], 0);
  const fillOf = (p) => pct(soldOf(p), seatsOf(p));
  const rules = (p) => {
    const days = p.n + 1, written = p.written == null ? days : p.written;
    return [
      ['At least one photo', `${p.photos} uploaded`, p.photos > 0],
      ['Full itinerary', `${written} of ${days} days written`, written === days],
      ['At least one upcoming departure', `${p.deps.length} upcoming`, p.deps.length > 0],
      ['Prices set for every departure', 'All departures priced', true],
    ];
  };
  const statusChip = (p) => (p.status === 'live' ? '<span class="a-chip ok">Live</span>' : '<span class="a-chip mute">Draft</span>');
  // health: [chip kind, word, why]
  const health = (p) => {
    const r = rules(p);
    if (!r.every((x) => x[2])) return ['bad', "Can't publish", `Itinerary has ${r.filter((x) => !x[2]).map((x) => x[1]).join(', ')}`];
    if (p.deal && p.deal[0] === 'warn') return ['warn', 'Needs a fix', p.deal[2]];
    const tight = p.deps.find((d) => d[1] - d[2] === 1);
    if (tight) return ['info', 'Almost full', `${tight[0]}: 1 seat left of ${tight[1]}. Add seats or open another date.`];
    if (p.status === 'live' && !soldOf(p)) return ['info', 'No bookings yet', `0 of ${seatsOf(p)} seats sold across ${p.deps.length} dates; first is ${p.deps[0][0]}.`];
    return ['ok', 'Healthy', ''];
  };
  const ACTION = { "Can't publish": 'Finish itinerary', 'Needs a fix': 'Fix the deal', 'Almost full': 'Add seats', 'No bookings yet': 'Feature it' };

  /* =====================================================================
     PACKAGES · B · Photo catalogue
     ===================================================================== */
  const lb = { f: 'all', q: '', dest: '', sort: 'next', feat: {} };
  const isFeat = (p) => (p.id in lb.feat ? lb.feat[p.id] : p.feat);
  const LB_F = [['all', 'All'], ['live', 'Live'], ['draft', 'Draft'], ['feat', 'Featured'], ['attn', 'Needs a look'], ['deal', 'Deal running']];
  const fOk = (k, p) => k === 'all' || (k === 'live' && p.status === 'live') || (k === 'draft' && p.status === 'draft') ||
    (k === 'feat' && isFeat(p)) || (k === 'attn' && health(p)[0] !== 'ok') || (k === 'deal' && !!p.deal && p.deal[0] === 'ok');
  const lbMatch = (p) => fOk(lb.f, p) && (!lb.dest || p.dest === lb.dest) &&
    (!lb.q || (p.name + ' ' + p.dest).toLowerCase().includes(lb.q.toLowerCase()));
  const lbSorted = () => {
    const l = PK.slice();
    if (lb.sort === 'next') l.sort((a, b) => uOf(a.deps[0][0]) - uOf(b.deps[0][0]));
    if (lb.sort === 'name') l.sort((a, b) => a.name.localeCompare(b.name));
    if (lb.sort === 'enq') l.sort((a, b) => b.enq - a.enq);
    if (lb.sort === 'fill') l.sort((a, b) => fillOf(a) - fillOf(b));
    return l;
  };
  function lbCard(p) {
    const [hk, hw, why] = health(p), r = rules(p), done = r.filter((x) => x[2]).length, nx = p.deps[0], f = isFeat(p);
    return `<article class="ad-pk-card" data-id="${p.id}"${lbMatch(p) ? '' : ' hidden'}>
      <div class="ph"><img src="${p.img}" alt="${esc(p.name)}" loading="lazy">
        <span class="ad-pk-ov">${statusChip(p)}${f ? '<span class="a-chip info">Featured</span>' : ''}</span>
        <span class="a-chip ${hk} ad-pk-hc">${hw}</span>
        ${p.deal ? `<span class="ad-pk-stamp ${p.deal[0]}">${p.deal[1]}</span>` : ''}</div>
      <div class="ad-pk-cb">
        <div class="ad-pk-tt"><h3>${esc(p.name)}</h3><span class="num"><small>from</small>${inr(from(p))}</span></div>
        <p class="ad-pk-meta">${p.dest} · ${p.n} nights · ${p.city} · ${p.deps.length} dates</p>
        <div class="ad-pk-st">
          <div><span class="k">Publish checks</span><span class="ad-pk-dots" aria-hidden="true">${r.map((x) => `<i class="${x[2] ? '' : 'no'}"></i>`).join('')}</span><span class="v">${done} of 4 done</span></div>
          <div><span class="k">Next · ${fmt(uOf(nx[0]), false)}</span><span class="a-meter" style="--v:${pct(nx[2], nx[1])}%" aria-hidden="true"></span><span class="v">${nx[2]} of ${nx[1]} sold</span></div>
          <div><span class="k">Enquiries · 30 d</span><span class="v big num">${p.enq}</span></div>
        </div>
        ${why ? `<p class="ad-pk-why ${hk}">${ICON.info}<span>${esc(why)}</span></p>` : ''}
      </div>
      <div class="ad-pk-qa"><a href="#" class="a-btn sm">${ICON.file}Edit</a><button type="button" class="a-btn ghost sm">${ICON.copy}Duplicate</button>
        ${p.status === 'live' ? `<a href="#" class="a-btn ghost sm">${ICON.eye}View</a>` : '<button type="button" class="a-btn act sm" disabled>Publish</button>'}
        <span class="ad-pk-fl">${swi('ad-pk-sw', f, `Featured on the home page: ${p.name}`, ` data-feat="${p.id}"`)}<span>Featured</span></span></div>
    </article>`;
  }
  function lbRender() {
    const live = PK.filter((p) => p.status === 'live').length, attn = PK.filter((p) => health(p)[0] !== 'ok');
    const main = `<div class="ad-pk ad-pk-b">
      <div class="a-head"><h1>Packages</h1><p class="sub">${live} live · ${PK.length - live} draft · ${PK.filter(isFeat).length} featured on the home page · ${attn.length} need a look</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.eye}View site</a><a href="#" class="a-btn">${ICON.plus}New package</a></div></div>
      <section class="ad-pk-attn" aria-labelledby="ad-pk-attn-h"><h2 class="ad-pk-h2" id="ad-pk-attn-h">Needs a look <span class="a-chip warn num">${attn.length}</span></h2>
        <div class="ad-pk-attl">${attn.map((p) => { const [hk, hw, why] = health(p); return `<article class="ad-pk-att">
          <span class="ph"><img src="${p.img}" alt="${esc(p.name)}" loading="lazy"></span>
          <div><span class="a-chip ${hk}">${hw}</span><b>${esc(p.name)}</b><small>${esc(why)}</small></div>
          <a href="#" class="a-btn ghost sm">${ACTION[hw]}${ICON.arrowR}</a></article>`; }).join('')}</div></section>
      <div class="ad-pk-tool">
        <div class="ad-pk-pills" role="group" aria-label="Show">${LB_F.map(([k, l]) =>
          `<button type="button" data-f="${k}" aria-pressed="${lb.f === k}">${l} <span class="num">${PK.filter((p) => fOk(k, p)).length}</span></button>`).join('')}</div>
        <div class="a-bar">
          <label class="a-search">${ICON.search}<input type="search" id="ad-pk-b-q" placeholder="Search packages" aria-label="Search packages" value="${esc(lb.q)}" autocomplete="off"></label>
          <select class="a-select" id="ad-pk-b-dest" aria-label="Destination"><option value="">All destinations</option>${DESTS.map((d) => `<option ${lb.dest === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
          <select class="a-select" id="ad-pk-b-sort" aria-label="Sort">${[['next', 'Next departure'], ['name', 'Name'], ['enq', 'Enquiries'], ['fill', 'Emptiest first']].map(([k, l]) =>
            `<option value="${k}" ${lb.sort === k ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="ad-pk-grid">${lbSorted().map(lbCard).join('')}</div>
      <p class="a-empty" id="ad-pk-b-empty"${PK.some(lbMatch) ? ' hidden' : ''}>No packages match. <button type="button" class="a-btn ghost sm" data-clear>Clear filters</button></p>
    </div>`;
    return TS.adminShell('Packages', main);
  }
  function lbMount(site, rr) {
    const root = site.querySelector('.ad-pk-b'); if (!root) return;
    const apply = () => {
      let n = 0;
      root.querySelectorAll('.ad-pk-card').forEach((c) => { const ok = lbMatch(PK.find((p) => p.id === c.dataset.id)); c.hidden = !ok; if (ok) n++; });
      root.querySelector('#ad-pk-b-empty').hidden = n > 0;
    };
    bind(root, '[data-f]', 'click', (b) => { lb.f = b.dataset.f; root.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b)); apply(); });
    bind(root, '#ad-pk-b-q', 'input', (i) => { lb.q = i.value; apply(); });
    bind(root, '#ad-pk-b-dest', 'change', (s) => { lb.dest = s.value; apply(); });
    bind(root, '#ad-pk-b-sort', 'change', (s) => { lb.sort = s.value; rr(); });
    bind(root, '[data-feat]', 'click', (b) => { const p = PK.find((x) => x.id === b.dataset.feat); lb.feat[p.id] = !isFeat(p); rr(); });
    bind(root, '[data-clear]', 'click', () => { lb.f = 'all'; lb.q = ''; lb.dest = ''; rr(); });
  }

  /* =====================================================================
     PACKAGES · C · Season planner (packages × Oct 2026 – Sep 2027)
     ===================================================================== */
  const COLS = Array.from({ length: 12 }, (_, i) => ({ m: (9 + i) % 12, y: 9 + i >= 12 ? 2027 : 2026 }));
  const colOf = (u) => { const t = new Date(u); return (t.getUTCFullYear() - 2026) * 12 + t.getUTCMonth() - 9; };
  const inSeason = (dest, m) => SEASON[dest].includes(m + 1);
  const plannable = (c) => Date.UTC(COLS[c].y, COLS[c].m, 1) - T0 >= 30 * DAY;
  const isGap = (p, c) => p.status === 'live' && inSeason(p.dest, COLS[c].m) && plannable(c) && !p.deps.some((d) => colOf(uOf(d[0])) === c);
  const lc = { dest: '', sel: 'munnar|d|0', gaps: true };
  const fillCls = (d) => (d[2] >= d[1] ? 'full' : pct(d[2], d[1]) >= 60 ? 'f3' : pct(d[2], d[1]) >= 25 ? 'f2' : 'f1');

  function lcCell(p, c) {
    const season = inSeason(p.dest, COLS[c].m);
    const ds = p.deps.map((d, i) => [d, i]).filter(([d]) => colOf(uOf(d[0])) === c);
    let inner = ds.map(([d, i]) => {
      const key = `${p.id}|d|${i}`;
      return `<button type="button" class="ad-pk-dc ${fillCls(d)}" data-k="${key}" aria-pressed="${lc.sel === key}" aria-label="${esc(p.name)}, ${d[0]}: ${d[2]} of ${d[1]} sold">
        <b>${new Date(uOf(d[0])).getUTCDate()}</b><small class="num">${d[2]}/${d[1]}</small></button>`;
    }).join('');
    if (isGap(p, c)) {
      const key = `${p.id}|g|${c}`;
      inner = `<button type="button" class="ad-pk-gap" data-k="${key}" aria-pressed="${lc.sel === key}" aria-label="Gap: no ${esc(p.name)} date in ${MON[COLS[c].m]} ${COLS[c].y}">${ICON.plus}<span>Gap</span></button>`;
    }
    return `<td class="${season ? 's' : ''}">${inner}</td>`;
  }
  function lcInsp() {
    const [id, t, x] = lc.sel.split('|'), p = PK.find((q) => q.id === id);
    if (t === 'd') {
      const d = p.deps[+x], u = uOf(d[0]), left = d[1] - d[2];
      return `<section class="ad-pk-insp" aria-live="polite"><span class="ph"><img src="${p.img}" alt="${esc(p.name)}"></span>
        <div class="t"><small>${wd(u)} ${d[0]} · ${away(u)} days away</small><b>${esc(p.name)}</b><span>${p.dest} · ${p.n} nights · led by ${LEADERS[p.lead].name}</span></div>
        <div class="m"><span class="a-meter" style="--v:${pct(d[2], d[1])}%" aria-hidden="true"></span><small><b class="num">${d[2]} of ${d[1]}</b> sold · ${left ? `${left} left` : 'Full'}</small></div>
        <dl class="a-kv"><div><dt>Twin sharing</dt><dd>${inr(d[3])}</dd></div><div><dt>Sold, at twin price</dt><dd>${lakh(d[2] * d[3])}</dd></div></dl>
        <div class="acts"><a href="#" class="a-btn sm">${ICON.cal}Edit date</a><a href="#" class="a-btn ghost sm">${ICON.file}Manifest</a></div></section>`;
    }
    const c = COLS[+x], mu = Date.UTC(c.y, c.m, 15);
    const before = p.deps.filter((d) => uOf(d[0]) < mu).pop(), after = p.deps.find((d) => uOf(d[0]) > mu);
    const near = [before && `before it ${before[0]}`, after && `after it ${after[0]}`].filter(Boolean).join(', ');
    const copy = before || after;
    return `<section class="ad-pk-insp gap" aria-live="polite"><span class="ph"><img src="${p.img}" alt="${esc(p.name)}"></span>
      <div class="t"><small>Gap in the best months · ${SEASON_TXT[p.dest]}</small><b>No ${esc(p.name)} date in ${MON[c.m]} ${c.y}</b><span>Nearest dates: ${near || 'none yet'}.</span></div>
      <div class="m"><small>A new date copies seats and prices from ${copy ? copy[0] : 'the package'}; you can change them before saving.</small></div>
      <div class="acts"><button type="button" class="a-btn act sm">${ICON.plus}Add a date in ${MON[c.m]} ${c.y}</button></div></section>`;
  }
  function lcRender() {
    const rows = PK.filter((p) => !lc.dest || p.dest === lc.dest);
    const tot = COLS.map((_, c) => {
      const ds = rows.flatMap((p) => p.deps.filter((d) => colOf(uOf(d[0])) === c));
      return { n: ds.length, sold: ds.reduce((s, d) => s + d[2], 0), seats: ds.reduce((s, d) => s + d[1], 0) };
    });
    const gaps = rows.reduce((s, p) => s + COLS.filter((_, c) => isGap(p, c)).length, 0);
    const busiest = tot.reduce((b, t, i) => (t.n > tot[b].n ? i : b), 0);
    const in90 = rows.flatMap((p) => p.deps).filter((d) => away(uOf(d[0])) <= 90);
    const s90 = in90.reduce((s, d) => s + d[2], 0), t90 = in90.reduce((s, d) => s + d[1], 0);
    const main = `<div class="ad-pk ad-pk-c${lc.gaps ? '' : ' no-gaps'}">
      <div class="a-head"><h1>Packages</h1><p class="sub">Season planner · every package against the next 12 months. Shaded months are each destination's best season.</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.cal}Open calendar</a><a href="#" class="a-btn">${ICON.plus}New package</a></div></div>
      <div class="a-kpis">
        <div class="a-kpi"><span class="k">Departures on sale</span><span class="v num">${rows.reduce((s, p) => s + p.deps.length, 0)}</span><span class="d">${rows.length} packages · ${rows.filter((p) => p.status === 'draft').length} draft</span></div>
        <div class="a-kpi"><span class="k">Seats sold · next 90 days</span><span class="v num">${s90} / ${t90}</span><span class="d ${pct(s90, t90) >= 50 ? 'up' : ''}">${pct(s90, t90)}% full</span></div>
        <div class="a-kpi"><span class="k">Busiest month</span><span class="v">${MON[COLS[busiest].m]} ${COLS[busiest].y}</span><span class="d">${tot[busiest].n} departures · ${pct(tot[busiest].sold, tot[busiest].seats)}% sold</span></div>
        <div class="a-kpi"><span class="k">Gaps in best season</span><span class="v num">${gaps}</span><span class="d down">Months a package could sell but has no date</span></div>
      </div>
      <div class="ad-pk-ctool">
        <div class="a-seg" role="group" aria-label="Destination"><button type="button" data-d="" aria-pressed="${!lc.dest}">All</button>${DESTS.map((d) => `<button type="button" data-d="${d}" aria-pressed="${lc.dest === d}">${d}</button>`).join('')}</div>
        <span class="ad-pk-fl">${swi('ad-pk-sw', lc.gaps, 'Show gaps', ' id="ad-pk-c-gaps"')}<span>Show gaps</span></span>
        <ul class="ad-pk-leg" aria-label="Legend"><li><i class="f3"></i>60 %+ sold</li><li><i class="f2"></i>25–59 %</li><li><i class="f1"></i>Under 25 %</li><li><i class="full"></i>Full</li><li><i class="s"></i>Best season</li></ul>
      </div>
      ${lcInsp()}
      <div class="ad-pk-mxw"><table class="ad-pk-mx">
        <colgroup><col class="n">${COLS.map(() => '<col>').join('')}</colgroup>
        <thead><tr><th scope="col" class="n">Package</th>${COLS.map((c, i) => `<th scope="col">${MON[c.m]}${i === 0 || c.m === 0 ? `<small>${c.y}</small>` : ''}</th>`).join('')}</tr></thead>
        <tbody>${DESTS.filter((d) => !lc.dest || d === lc.dest).map((dest) => `<tr class="grp"><th scope="rowgroup" colspan="13"><span>${dest}</span><small>Best ${SEASON_TXT[dest]}</small></th></tr>
          ${rows.filter((p) => p.dest === dest).map((p) => `<tr><th scope="row" class="n"><span class="ad-pk-rn"><span class="ph"><img src="${p.img}" alt="" loading="lazy"></span><span><b>${esc(p.name)}</b><small>${p.n}N · ${inr(from(p))}${p.status === 'draft' ? ' · Draft' : ''}</small></span></span></th>${COLS.map((_, c) => lcCell(p, c)).join('')}</tr>`).join('')}`).join('')}</tbody>
        <tfoot><tr><th scope="row" class="n">All packages</th>${tot.map((t) => `<td><b class="num">${t.n || '—'}</b>${t.n ? `<small class="num">${pct(t.sold, t.seats)}% sold</small>` : ''}</td>`).join('')}</tr></tfoot>
      </table></div>
      <p class="ad-pk-fine">Each chip is one departure: day of the month and seats sold of seats total. A gap is a best-season month, at least 30 days out, with no date on sale.</p>
    </div>`;
    return TS.adminShell('Packages', main);
  }
  function lcMount(site, rr) {
    const root = site.querySelector('.ad-pk-c'); if (!root) return;
    bind(root, '[data-k]', 'click', (b) => { lc.sel = b.dataset.k; rr(); });
    bind(root, '[data-d]', 'click', (b) => {
      lc.dest = b.dataset.d;
      if (lc.dest && PK.find((p) => p.id === lc.sel.split('|')[0]).dest !== lc.dest) { const p = PK.find((q) => q.dest === lc.dest); lc.sel = `${p.id}|d|0`; }
      rr();
    });
    bind(root, '#ad-pk-c-gaps', 'click', (b) => { lc.gaps = !lc.gaps; b.setAttribute('aria-checked', lc.gaps); root.classList.toggle('no-gaps', !lc.gaps); });
  }

  /* =====================================================================
     PACKAGES · D · Performance board
     ===================================================================== */
  const ld = { per: 30, sort: 'rev', dir: -1, open: 'munnar' };
  const PER = { 7: 0.24, 30: 1, 90: 2.7 };
  const perf = (p) => {
    const k = PER[ld.per], views = Math.round(p.views * k), enq = Math.round(p.enq * k), bk = Math.round(p.bk * k);
    return { views, enq, bk, rev: Math.round((bk * 2.3 * from(p)) / 100) * 100, conv: views ? (bk / views) * 100 : 0, fill: fillOf(p) };
  };
  const series = (p) => {
    let h = 0; for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 12 }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; return p.views ? Math.round((p.views / 4) * (0.55 + ((h % 1000) / 1000) * 0.7 + i * 0.02)) : 0; });
  };
  const spark = (vals) => {
    const W = 72, H = 24, mx = Math.max(...vals, 1);
    const pts = vals.map((v, i) => [((i * W) / (vals.length - 1)).toFixed(1), (H - 3 - (v / mx) * (H - 6)).toFixed(1)]);
    const last = pts[pts.length - 1];
    return `<svg class="ad-pk-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts.map((q) => q.join(',')).join(' ')}"/><circle cx="${last[0]}" cy="${last[1]}" r="2.4"/></svg>`;
  };
  const LD_H = [['name', 'Package', ''], ['views', 'Page views', 'num'], ['enq', 'Enquiries', 'num'], ['bk', 'Bookings', 'num'], ['rev', 'Revenue', 'num'], ['conv', 'View → booking', 'num'], ['fill', 'Upcoming seats sold', ''], ['from', 'From', 'num']];
  function ldRender() {
    const rows = PK.map((p) => ({ p, ...perf(p) }));
    const val = (r, k) => (k === 'name' ? r.p.name : k === 'from' ? from(r.p) : r[k]);
    rows.sort((a, b) => { const x = val(a, ld.sort), y = val(b, ld.sort); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * ld.dir; });
    const T = rows.reduce((s, r) => ({ views: s.views + r.views, enq: s.enq + r.enq, bk: s.bk + r.bk, rev: s.rev + r.rev }), { views: 0, enq: 0, bk: 0, rev: 0 });
    const avg = T.views ? (T.bk / T.views) * 100 : 0;
    const liveR = rows.filter((r) => r.p.status === 'live' && r.p.views >= 100);
    const best = liveR.slice().sort((a, b) => b.conv - a.conv)[0], most = liveR.slice().sort((a, b) => b.views - a.views)[0], leak = liveR.slice().sort((a, b) => a.conv - b.conv)[0];
    const perL = { 7: '7 days', 30: '30 days', 90: '90 days' }[ld.per];
    const row = (r) => {
      const p = r.p, open = ld.open === p.id, dr = p.status === 'draft';
      const holds = r.bk ? Math.round(r.bk * 1.6) + 1 : r.enq ? 1 : 0;
      const stages = [['Page views', r.views], ['Enquiries', r.enq], ['Checkout holds', holds], ['Paid bookings', r.bk]];
      const nx = p.deps[0];
      return `<tr class="${open ? 'open' : ''}${dr ? ' dim' : ''}">
        <td data-l="Package"><button type="button" class="ad-pk-pn" data-open="${p.id}" aria-expanded="${open}"><span class="ph"><img src="${p.img}" alt="" loading="lazy"></span><span class="t"><b>${esc(p.name)}</b><small>${p.dest} · ${p.n}N · ${dr ? 'Draft' : 'Live'}</small></span>${ICON.chevD}</button></td>
        <td class="num" data-l="Page views"><span class="ad-pk-vw">${dr ? '' : spark(series(p))}<b>${r.views.toLocaleString('en-IN')}</b></span></td>
        <td class="num" data-l="Enquiries">${r.enq}</td>
        <td class="num" data-l="Bookings">${r.bk}</td>
        <td class="num" data-l="Revenue">${r.rev ? lakh(r.rev) : '—'}</td>
        <td class="num" data-l="View → booking">${r.views ? `<span class="ad-pk-cv"><b>${r.conv.toFixed(1)}%</b><small class="${r.conv >= avg ? 'up' : 'dn'}">${r.conv >= avg ? 'Above' : 'Below'} average</small></span>` : '<small class="ad-pk-na">Not live</small>'}</td>
        <td data-l="Upcoming seats sold"><span class="ad-pk-fillc"><span class="a-meter" style="--v:${r.fill}%" aria-hidden="true"></span><small class="num">${soldOf(p)} of ${seatsOf(p)} · ${r.fill}%</small></span></td>
        <td class="num" data-l="From">${inr(from(p))}</td></tr>
        ${open ? `<tr class="ad-pk-more"><td colspan="8"><div class="ad-pk-mg">
          <div><h3 class="ad-pk-h3">Funnel · last ${perL}</h3><ol class="ad-pk-fun">${stages.map(([l, v], i) => {
            const share = i ? pct(v, stages[i - 1][1]) : 100;
            return `<li><span class="l">${l}</span><span class="bar"><i style="--v:${share}%"></i></span><b class="num">${v.toLocaleString('en-IN')}</b><small>${i ? `${share}% of ${stages[i - 1][0].toLowerCase()}` : 'Start'}</small></li>`;
          }).join('')}</ol><p class="ad-pk-fine">Counted from page views, enquiries and holds already stored; no new tracking.</p></div>
          <div><h3 class="ad-pk-h3">What is moving it</h3><ul class="ad-pk-sig">
            <li>${p.deal ? `<span class="a-chip ${p.deal[0]}">${p.deal[1]}</span>${esc(p.deal[2])}` : '<span class="a-chip mute">No deal</span>No deal on this package'}</li>
            <li>${p.eb ? `<span class="a-chip info">Early bird on</span>−₹1,500 at 90+ days out, −₹750 at 45+ ${V25}` : `<span class="a-chip mute">Early bird off</span>Could lift early bookings on the ${nx[0].replace(/ 20\d\d$/, '')} date ${V25}`}</li>
            <li>${isFeat(p) ? '<span class="a-chip ok">Featured</span>On the home page' : '<span class="a-chip mute">Not featured</span>Only reachable from its destination page'}</li>
            <li><span class="a-chip ${pct(nx[2], nx[1]) >= 60 ? 'ok' : 'mute'}">Next ${nx[0].replace(/ 20\d\d$/, '')}</span>${nx[2]} of ${nx[1]} seats sold, ${away(uOf(nx[0]))} days out</li>
          </ul><div class="ad-pk-acts"><a href="#" class="a-btn sm">${ICON.file}Edit package</a><a href="#" class="a-btn ghost sm">${ICON.chart}Open in Reports</a><a href="#" class="a-btn ghost sm">${ICON.eye}View page</a></div></div>
        </div></td></tr>` : ''}`;
    };
    const main = `<div class="ad-pk ad-pk-d">
      <div class="a-head"><h1>Packages</h1><p class="sub">Performance board · which trips people look at, ask about and pay for. Click a package for its funnel.</p>
        <div class="acts"><div class="a-seg" role="group" aria-label="Period">${[7, 30, 90].map((d) => `<button type="button" data-per="${d}" aria-pressed="${ld.per === d}">${d} days</button>`).join('')}</div><a href="#" class="a-btn">${ICON.plus}New package</a></div></div>
      <div class="a-kpis">
        <div class="a-kpi"><span class="k">Page views</span><span class="v num">${T.views.toLocaleString('en-IN')}</span><span class="d">Last ${perL}, all packages</span></div>
        <div class="a-kpi"><span class="k">Enquiries</span><span class="v num">${T.enq}</span><span class="d">${pct(T.enq, T.views)}% of views</span></div>
        <div class="a-kpi"><span class="k">Paid bookings</span><span class="v num">${T.bk}</span><span class="d">Deposits count as paid</span></div>
        <div class="a-kpi"><span class="k">Revenue booked</span><span class="v num">${lakh(T.rev)}</span><span class="d">Before refunds, excl. add-ons</span></div>
        <div class="a-kpi"><span class="k">View → booking</span><span class="v num">${avg.toFixed(1)}%</span><span class="d">Average across live packages</span></div>
      </div>
      <div class="ad-pk-ins">
        <article><span class="a-chip ok">Best converter</span><b>${esc(best.p.name)}</b><small>${best.conv.toFixed(1)}% of ${best.views} views became a booking — ${(best.conv / (avg || 1)).toFixed(1)}× the average.</small></article>
        <article><span class="a-chip info">Most viewed</span><b>${esc(most.p.name)}</b><small>${most.views} views and ${most.enq} enquiries; ${most.bk} paid.</small></article>
        <article><span class="a-chip warn">Leaking</span><b>${esc(leak.p.name)}</b><small>${leak.views} views but ${leak.conv.toFixed(1)}% book. ${leak.p.deal ? esc(leak.p.deal[2]) + '.' : 'Check the price and the first photo.'}</small></article>
      </div>
      <div class="a-card flush"><div class="a-card-b"><div class="a-tw"><table class="a-table ad-pk-perf">
        <thead><tr>${LD_H.map(([k, l, c]) => `<th class="${c}" aria-sort="${ld.sort === k ? (ld.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${l}${ld.sort === k ? `<span aria-hidden="true">${ld.dir > 0 ? '↑' : '↓'}</span>` : ''}</button></th>`).join('')}</tr></thead>
        <tbody>${rows.map(row).join('')}</tbody></table></div></div></div>
    </div>`;
    return TS.adminShell('Packages', main);
  }
  function ldMount(site, rr) {
    const root = site.querySelector('.ad-pk-d'); if (!root) return;
    bind(root, '[data-per]', 'click', (b) => { ld.per = +b.dataset.per; rr(); });
    bind(root, '[data-sort]', 'click', (b) => { const k = b.dataset.sort; if (ld.sort === k) ld.dir *= -1; else { ld.sort = k; ld.dir = k === 'name' ? 1 : -1; } rr(); });
    bind(root, '[data-open]', 'click', (b) => { ld.open = ld.open === b.dataset.open ? '' : b.dataset.open; rr(); });
  }

  /* =====================================================================
     EDITOR data · Munnar & Alleppey Houseboat (api/content/packages/munnar_alleppey_houseboat.py)
     ===================================================================== */
  const E = {
    name: 'Munnar & Alleppey Houseboat', slug: 'munnar-alleppey-houseboat', dest: 'Kerala', nights: 4, city: 'Ex-Bengaluru', lead: 'anjali',
    summary: "Two nights among Munnar's tea estates, a night on a private houseboat on the Vembanad backwaters and a last evening in Fort Kochi. The Kerala trip we would pick.",
    hl: ['A night on a private houseboat on the Vembanad backwaters', 'Eravikulam park and the tea estates above Munnar', "Fort Kochi's Chinese fishing nets and a Kathakali evening", 'A tea-estate stay with the plantation on your doorstep'],
    incl: ['2 nights at Tea Valley Resort, Munnar, breakfast and dinner', '1 night on a private one-bedroom houseboat, Alleppey — lunch, dinner, breakfast', '1 night at Fort House, Fort Kochi, breakfast included',
      'Private car with driver for all transfers and sightseeing (Kochi airport to airport)', 'Eravikulam park entry and the Kathakali performance in Fort Kochi', 'Tripsmith WhatsApp support from booking to return'],
    excl: ['Flights or train to Kochi (we can book them for you at cost)', 'Meals not listed above', 'Tea museum entry, boat rides at Mattupetty and camera fees (about ₹600 per person)', '5% GST on the package price'],
    faq: [['Is Eravikulam open on our dates?', 'The park closes for the Nilgiri tahr calving season, usually February to early April. On those departures we swap in Top Station and the Kolukkumalai tea estate jeep ride instead.'],
      ['What is the houseboat like?', 'A one-bedroom kettuvallam with an air-conditioned cabin, attached bathroom and an open upper deck. A crew of three cooks on board — Kerala meals, fish if you want it.'],
      ['Can we add Varkala or Kovalam?', 'Yes — two extra nights on the coast after Kochi is our most common extension. Ask when you enquire and we quote it with the same driver.']],
    hotels: [['Tea Valley Resort', 'Munnar', 3, 2], ['Spice Routes houseboat', 'Alleppey', 4, 1], ['Fort House', 'Fort Kochi', 3, 1]],
    photos: [['img/munnar-2.jpg', 'Tea estates of Munnar from above'], ['img/munnar-1.jpg', 'Tea bushes on a Munnar hillside'], ['img/kerala-1.jpg', 'Houseboats on a backwater canal near Alleppey'], ['img/kerala-2.jpg', 'A houseboat under the palms']],
    meet: 'Kochi airport (COK), domestic arrivals, pillar 6', time: 'Day 1, 11:30 IST — driver holds a Tripsmith board', maps: 'https://maps.google.com/?q=Cochin+International+Airport',
    kbyg: ['Munnar nights drop to 10 °C from December: pack a fleece and closed shoes for the estate walk.', 'Houseboat cabins are air-conditioned from 9 pm to 6 am only.',
      'Network: Jio and BSNL work in Munnar town, patchy on the estate, none on parts of the backwaters.', 'Carry ₹3,000 in cash for tips and the tea museum; everything else takes UPI.', 'Eravikulam allows no plastic bottles — guards check bags at the gate.'],
    deal: { price: 19999, until: '2026-10-31', label: 'Season opener' },
    addons: [['Ayurvedic massage in Munnar', '60 minutes, full body, at the resort spa', 'Per traveller', 2200, true], ['Kolukkumalai sunrise jeep', "The world's highest tea estate, 4.30 am start, shared jeep", 'Per traveller', 1800, true],
      ['Extra night at Fort House, Fort Kochi', 'Same room, breakfast included · max 2 nights', 'Per traveller per night', 3400, true], ['Airport pick-up in an Innova Crysta', 'Instead of the sedan, for up to 6 with luggage', 'Per booking', 2500, false]],
    req: [['ID type and number', true, 'Masked everywhere but the manifest'], ['Emergency contact', true, ''], ['Food preference', true, 'Veg, non-veg, Jain, vegan, allergies'], ['Date of birth', false, ''], ['Medical notes', false, '']],
    check: ['Printed photo ID for the houseboat check-in', 'Arrival flight number sent on WhatsApp'],
  };
  const DAYS0 = [
    { t: 'Arrive Kochi, drive up to the tea country', place: 'Munnar', meals: 'D', stay: 'Tea Valley Resort, Munnar', img: 'img/munnar-2.jpg', alt: 'Tea estates of Munnar from above',
      desc: 'Your driver meets you at Kochi airport for the four-hour climb into the Ghats, with a stop at the Cheeyappara falls where the road starts to twist. Check in above the estates at Pothamedu in time for the light on the tea; dinner is at the resort.' },
    { t: 'Eravikulam, Mattupetty and the tea museum', place: 'Eravikulam', meals: 'BD', stay: 'Tea Valley Resort, Munnar', img: 'img/munnar-1.jpg', alt: 'Tea bushes on a Munnar hillside',
      desc: 'An early start for Eravikulam, where the Nilgiri tahr graze the grassland before the crowds arrive. Then the Mattupetty dam and Echo point, and the KDHP tea museum for how the leaf gets from bush to cup. Back by four for a walk through the estate behind the resort; dinner there.' },
    { t: 'Down to Alleppey, board the houseboat', place: 'Alleppey', meals: 'BLD', stay: 'Houseboat, Vembanad lake', img: 'img/kerala-1.jpg', alt: 'Houseboats on a backwater canal near Alleppey',
      desc: 'Five hours down to the plain, boarding at Punnamada at noon as lunch is served. The afternoon is canals, paddies below water level and villages you pass at walking pace; the boat moors by sunset and dinner is on the deck.' },
    { t: 'Fort Kochi: fishing nets, Mattancherry, Kathakali', place: 'Fort Kochi', meals: 'B', stay: 'Fort House, Fort Kochi', img: '', alt: '',
      desc: 'Breakfast on board, off by nine, and ninety minutes to Fort Kochi. The Chinese fishing nets on the seafront, Mattancherry palace and the antique shops of Jew Street fill the afternoon; the Kathakali performance starts at six, with the make-up done in front of you from five.' },
    { t: 'Kochi morning and departure', place: 'Kochi', meals: 'B', stay: '', img: '', alt: '',
      desc: "A last walk past St Francis church to a coffee on Princess Street, then the hour's drive to Kochi airport. Late check-out until 1 pm on request." },
  ];
  const DEPS0 = [
    { iso: '2026-11-13', seats: 12, sold: 8, held: 1, wait: 0, dbl: 22999, tri: 20999, ch: 13499, sgl: 9500, g: true, lead: 'anjali', meet: '' },
    { iso: '2026-12-18', seats: 10, sold: 6, held: 0, wait: 0, dbl: 25999, tri: 23999, ch: 15499, sgl: 11000, g: false, lead: 'meera', meet: 'Pillar 6 at 10:30 IST — Christmas-week traffic on the ghat road' },
    { iso: '2027-01-15', seats: 12, sold: 2, held: 1, wait: 0, dbl: 21999, tri: 19999, ch: 12999, sgl: 9000, g: true, lead: 'anjali', meet: '' },
    { iso: '2027-02-12', seats: 12, sold: 0, held: 0, wait: 0, dbl: 21999, tri: 19999, ch: 12999, sgl: 9000, g: false, lead: 'anjali', meet: '' },
  ];
  const STAYS = [['Tea Valley Resort, Munnar', 'Munnar', 'Tea Valley Resort', 3], ['Houseboat, Vembanad lake', 'Alleppey', 'Spice Routes houseboat', 4], ['Fort House, Fort Kochi', 'Fort Kochi', 'Fort House', 3]];
  const THEMES = [['beach', 'Beach'], ['hills', 'Hills'], ['honeymoon', 'Honeymoon'], ['family', 'Family'], ['adventure', 'Adventure'], ['heritage', 'Heritage']];
  const MEALS = [['B', 'Breakfast'], ['L', 'Lunch'], ['D', 'Dinner']];
  const startP = (deps) => Math.min(...deps.map((d) => +d.dbl || 0));
  const dealOff = (deps, price = E.deal.price) => (price > 0 ? Math.max(0, startP(deps) - price) : 0);
  const tier = (days, on = true) => (!on ? 0 : days >= 90 ? 1500 : days >= 45 ? 750 : 0);
  const today = (d, deps, price, eb = true) => Math.max(1, (+d.dbl || 0) - dealOff(deps, price) - tier(away(uIso(d.iso)), eb));
  const leaderOpts = (sel) => Object.keys(LEADERS).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${LEADERS[k].name}</option>`).join('');

  /* ---------- save state + unsaved-changes guard (shared by B, C, D) ---------- */
  const saveChip = (st) => (st.dirty ? '<span class="a-chip warn">Unsaved changes</span>'
    : st.saved ? '<span class="a-chip ok">Saved · pages refresh in a few seconds</span>' : '<span class="a-chip mute">All changes saved · 26 Sep, 18:40</span>');
  const saveBar = (st) => `<span class="ad-pe-sv"><span data-save>${saveChip(st)}</span>
    <button type="button" class="a-btn ghost sm" data-act="discard"${st.dirty ? '' : ' disabled'}>Discard</button><button type="button" class="a-btn sm" data-act="save"${st.dirty ? '' : ' disabled'}>Save changes</button></span>`;
  const dock = (st) => `<div class="ad-pe-dock" data-dock role="region" aria-label="Unsaved changes"${st.dirty ? '' : ' hidden'}><span class="a-chip warn">Unsaved changes</span><span class="ad-pe-fine">Leaving asks first.</span>
    <button type="button" class="a-btn ghost sm" data-act="discard">Discard</button><button type="button" class="a-btn sm" data-act="save">Save changes</button></div>`;
  const leaveBar = (st) => (st.leaving ? `<div class="ad-pe-guard" role="alertdialog" aria-label="Unsaved changes">${ICON.info}<span><b>Leave without saving?</b> Your changes to this package are not saved yet.</span>
    <span class="acts"><button type="button" class="a-btn ghost sm" data-guard="stay">Stay and keep editing</button><button type="button" class="a-btn danger sm" data-guard="leave">Leave without saving</button></span></div>` : '');
  function guard(root, st, rr, reset) {
    const mark = () => {
      if (st.dirty) return;
      st.dirty = true; st.saved = false;
      root.querySelectorAll('[data-save]').forEach((el) => { el.innerHTML = saveChip(st); });
      root.querySelectorAll('[data-act]').forEach((b) => { b.disabled = false; });
      root.querySelectorAll('[data-dock]').forEach((el) => { el.hidden = false; });
    };
    root.addEventListener('input', mark);
    root.addEventListener('change', mark);
    bind(root, '[data-act="save"]', 'click', () => { st.dirty = false; st.saved = true; st.leaving = false; rr(); });
    bind(root, '[data-act="discard"]', 'click', () => { st.dirty = false; st.saved = false; st.leaving = false; reset(); rr(); });
    bind(root, '[data-back]', 'click', (a, e) => { e.preventDefault(); if (st.dirty) { st.leaving = true; rr(); } });
    bind(root, '[data-guard]', 'click', (b) => { if (b.dataset.guard === 'leave') { st.dirty = false; reset(); } st.leaving = false; rr(); });
    bind(root, '.ad-pe-pills button', 'click', (b) => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); mark(); });
    bind(root, '.ad-pe-sw:not([data-own])', 'click', (b) => { b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true'); mark(); });
    return mark;
  }
  const checksList = (list) => `<ul class="ad-pe-rules">${list.map(([l, d, ok]) =>
    `<li class="${ok ? 'ok' : 'no'}">${ok ? ICON.check : ICON.x}<span><b>${esc(l)}</b><small>${esc(d)}</small></span><em>${ok ? 'Done' : 'To do'}</em></li>`).join('')}</ul>`;
  const MUNNAR = PK.find((p) => p.id === 'munnar');
  const addonsList = () => `<div class="ad-pe-adds">${E.addons.map(([n, d, k, price, on], i) => `<div class="ad-pe-add${on ? '' : ' off'}">
      <span class="t"><b>${esc(n)}</b><small>${esc(d)}</small></span><span class="p num">${inr(price)}<small>${k}</small></span>
      <span class="s">${swi('ad-pe-sw', on, `${n}: on or off`, ` data-add="${i}"`)}<small>${on ? 'On' : 'Off'}</small></span></div>`).join('')}</div>
    <p class="ad-pe-fine">Deals, coupons and early bird never apply to add-ons. No stock limits: switch one off instead.</p>`;
  const reqList = () => `<div class="ad-pe-checks">${E.req.map(([l, onv, h]) => `<label><input type="checkbox" ${onv ? 'checked' : ''}><span>${l}${h ? `<small>${h}</small>` : ''}</span></label>`).join('')}</div>`;
  const bindAddons = (root) => bind(root, '[data-add]', 'click', (b) => {
    const row = b.closest('.ad-pe-add'), onv = b.getAttribute('aria-checked') === 'true';
    row.classList.toggle('off', !onv); row.querySelector('.s small').textContent = onv ? 'On' : 'Off';
  });

  /* =====================================================================
     EDITOR · B · Live preview (form left, the customer page right, click either side to jump)
     ===================================================================== */
  const eb = { open: 'title', mode: 'page', pane: 'edit', checks: false, dirty: false, saved: false, leaving: false, v: null };
  const ebReset = () => { eb.v = { name: E.name, summary: E.summary, hl: E.hl.join('\n'), deal: String(E.deal.price), kbyg: E.kbyg.join('\n'), meet: E.meet, days: DAYS0.map((d) => d.t), dbl: DEPS0.map((d) => String(d.dbl)) }; };
  ebReset();
  const ebDeps = () => DEPS0.map((d, i) => ({ ...d, dbl: +eb.v.dbl[i] || 0 }));
  const lines = (s) => String(s).split('\n').map((x) => x.trim()).filter(Boolean);
  const PV = {
    name: () => esc(eb.v.name || 'Untitled package'),
    summary: () => esc(eb.v.summary),
    hl: () => lines(eb.v.hl).map((l) => `<li>${ICON.check}<span>${esc(l)}</span></li>`).join('') || '<li class="empty">No highlights yet</li>',
    days: () => DAYS0.map((d, i) => `<li><span class="n">Day ${i + 1}</span><span><b>${esc(eb.v.days[i] || '')}</b><small>${d.place}${d.stay ? ` · ${esc(d.stay)}` : ''} · ${MEALS.filter(([m]) => d.meals.includes(m)).map(([, l]) => l).join(', ')}</small></span></li>`).join(''),
    price: () => {
      const deps = ebDeps(), s = startP(deps), dp = +eb.v.deal || 0, run = dp > 0 && dp < s;
      return run ? `<span class="from"><small>From</small><s class="num">${inr(s)}</s><b class="num">${inr(dp)}</b></span><small class="pp">per person, twin sharing</small><span class="tag">${E.deal.label} · ends 31 Oct</span>`
        : `<span class="from"><small>From</small><b class="num">${inr(s)}</b></span><small class="pp">per person, twin sharing</small>${dp ? `<span class="adm-note">Only you see this: the deal is hidden because ${inr(dp)} is not below ${inr(s)}.</span>` : ''}`;
    },
    deps: () => {
      const deps = ebDeps(), dp = +eb.v.deal || 0;
      return deps.map((d) => {
        const u = uIso(d.iso), left = d.seats - d.sold - d.held, t = tier(away(u));
        return `<div class="dep"><span><b>${wd(u)}, ${fmt(u, false)}</b><small>${avatar(d.lead, 18)}${LEADERS[d.lead].name.split(' ')[0]} · ${d.g ? 'Guaranteed' : left <= 4 ? `${left} seats left` : 'Open'}</small></span>
          <span class="p num">${inr(today(d, deps, dp))}${t ? `<small>Early bird −${inr(t)}</small>` : ''}</span></div>`;
      }).join('');
    },
    kbyg: () => lines(eb.v.kbyg).map((l) => `<li>${esc(l)}</li>`).join(''),
    meet: () => esc(eb.v.meet),
  };
  const out = (k, tag = 'span', cls = '') => `<${tag} data-out="${k}"${cls ? ` class="${cls}"` : ''}>${PV[k]()}</${tag}>`;
  const EB_G = [
    ['title', 'Title and summary', 'Kerala · 4 nights · Ex-Bengaluru · Featured'], ['photos', 'Photos', '4 photos · cover set'], ['highlights', 'Highlights', '4 lines'],
    ['itinerary', 'Day by day', '5 of 5 days written'], ['prices', 'Dates, prices and deal', '4 dates · deal running · early bird on', 1], ['booking', 'Deposit and add-ons', '25 % deposit · 3 of 4 add-ons on', 1],
    ['stays', 'Hotels', '3 hotels · 4 nights'], ['incl', 'Included, not included, FAQ', '6 in · 4 out · 3 questions'], ['trippack', 'Trip pack and traveller details', 'Meeting point set · 3 fields required', 1], ['danger', 'Duplicate or delete', ''],
  ];
  function ebBody(g) {
    if (g === 'title') return `${fld('Name', `<input data-bind="name" value="${esc(eb.v.name)}">`)}
      ${fld(`Slug ${ICON.lock}`, `<input value="${E.slug}" readonly aria-readonly="true" class="ad-pe-ro">`, 'Fixed once the trip has been published.')}
      <div class="a-row3">${fld('Destination', `<select>${DESTS.map((d) => `<option ${d === 'Kerala' ? 'selected' : ''}>${d}</option>`).join('')}</select>`)}${fld('Nights', '<input type="number" value="4" min="1" max="30">', '5 days')}${fld('From', '<input value="Ex-Bengaluru">')}</div>
      <div class="a-field"><span class="ad-pe-lbl">Themes</span><div class="ad-pe-pills" role="group" aria-label="Themes">${THEMES.map(([k, l]) => `<button type="button" aria-pressed="${k === 'hills' || k === 'honeymoon'}">${l}</button>`).join('')}</div></div>
      ${fld('Summary', `<textarea rows="4" data-bind="summary">${esc(eb.v.summary)}</textarea>`, 'Two or three lines: the card and the meta description.')}
      <div class="ad-pe-swrow">${swi('ad-pe-sw', true, 'Featured')}<span><b>Featured</b><small>Featured packages lead the home page.</small></span></div>
      <div class="a-field"><label>Default trip leader ${V25}</label><span class="ad-pe-lead">${avatar('anjali', 28)}<select aria-label="Default trip leader">${leaderOpts('anjali')}</select></span><span class="hint">Every date uses this leader unless the date switches.</span></div>`;
    if (g === 'photos') return `<div class="ad-pe-gal">${E.photos.map(([src, alt], i) => `<figure><span class="ph"><img src="${src}" alt="${esc(alt)}" loading="lazy">${i === 0 ? '<span class="cov">Cover</span>' : ''}</span>
        <input class="ad-pe-in" value="${esc(alt)}" aria-label="Alt text, photo ${i + 1}"></figure>`).join('')}<button type="button" class="ad-pe-up">${ICON.plus}<b>Upload</b><small>JPG, PNG or WEBP up to 4 MB</small></button></div>
      <p class="ad-pe-fine">The first photo is the cover. Photo changes save straight away.</p>`;
    if (g === 'highlights') return fld('Highlights · one per line', `<textarea rows="5" data-bind="hl">${esc(eb.v.hl)}</textarea>`, 'Shown on the card and at the top of the page.');
    if (g === 'itinerary') return `<div class="ad-pe-days">${DAYS0.map((d, i) => `<details${i === 0 ? ' open' : ''}><summary><span class="n">Day ${i + 1}</span><b>${esc(eb.v.days[i])}</b>${ICON.chevD}</summary>
        <div class="b">${fld(`Title, day ${i + 1}`, `<input data-bind="day" data-i="${i}" value="${esc(eb.v.days[i])}">`)}${fld(`Description, day ${i + 1}`, `<textarea rows="3">${esc(d.desc)}</textarea>`)}
        <div class="a-row2">${fld('Stay', `<input value="${esc(d.stay)}" placeholder="No stay: going home">`)}<div class="a-field"><span class="ad-pe-lbl">Meals</span><div class="ad-pe-pills sm" role="group" aria-label="Meals, day ${i + 1}">${MEALS.map(([m, l]) => `<button type="button" aria-pressed="${d.meals.includes(m)}">${l}</button>`).join('')}</div></div></div></div></details>`).join('')}</div>`;
    if (g === 'prices') return `<table class="ad-pe-mini"><thead><tr><th>Date</th><th>Seats</th><th>Double</th><th>Leader ${V25}</th></tr></thead><tbody>${DEPS0.map((d, i) => { const u = uIso(d.iso); return `<tr>
        <td><b>${fmt(u)}</b><small>${d.sold} booked${d.g ? ' · Guaranteed' : ''}</small></td><td><input class="ad-pe-in w-s" value="${d.seats}" aria-label="Seats, ${fmt(u)}"></td>
        <td>${RS(eb.v.dbl[i], `Double, ${fmt(u)}`, ` data-bind="dbl" data-i="${i}"`)}</td><td><select class="ad-pe-in" aria-label="Leader, ${fmt(u)}">${leaderOpts(d.lead)}</select></td></tr>`; }).join('')}</tbody></table>
      <p class="ad-pe-fine">Triple, child and single supplement live in the full price grid. <a href="#">Open the grid</a></p>
      <h4 class="ad-pe-h4">Deal</h4><div class="a-row2">${fld('Deal price per person', RS(eb.v.deal, 'Deal price per person', ' data-bind="deal"'), 'Must be below the starting price to show.')}${fld('Last day', '<input type="date" value="2026-10-31">', 'Ends at midnight IST')}</div>
      <h4 class="ad-pe-h4">Early bird ${V25}</h4><div class="ad-pe-swrow">${swi('ad-pe-sw', true, 'Early bird on')}<span><b>−₹1,500 at 90+ days · −₹750 at 45+ days</b><small>Per traveller after the deal, before a coupon; never on add-ons.</small></span></div>`;
    if (g === 'booking') return `<div class="ad-pe-swrow">${swi('ad-pe-sw', true, 'Deposit on')}<span><b>Reserve with 25 % now ${V25}</b><small>Balance due 30 days before departure; dates inside that window pay in full.</small></span></div>
      <h4 class="ad-pe-h4">Add-ons ${V25}</h4>${addonsList()}`;
    if (g === 'stays') return `<div class="ad-pe-hotels">${E.hotels.map(([n, c, s, nt], i) => `<div>${fld('Name', `<input value="${esc(n)}">`)}${fld('City', `<input value="${esc(c)}">`)}${fld('Stars', `<select>${[2, 3, 4, 5].map((x) => `<option ${x === s ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}${fld('Nights', `<input type="number" value="${nt}" aria-label="Nights, hotel ${i + 1}">`)}</div>`).join('')}</div>
      <p class="ad-pe-fine">4 nights across 3 hotels — matches the itinerary.</p>`;
    if (g === 'incl') return `${fld('Included · one per line', `<textarea rows="6">${esc(E.incl.join('\n'))}</textarea>`)}${fld('Not included · one per line', `<textarea rows="4">${esc(E.excl.join('\n'))}</textarea>`)}
      <div class="ad-pe-faq">${E.faq.map(([q, a], i) => `<details><summary><b>${esc(q)}</b>${ICON.chevD}</summary><div class="b"><input class="ad-pe-in" value="${esc(q)}" aria-label="Question ${i + 1}"><textarea class="ad-pe-in" rows="3" aria-label="Answer ${i + 1}">${esc(a)}</textarea></div></details>`).join('')}</div>`;
    if (g === 'trippack') return `${fld(`Meeting point ${V25}`, `<input data-bind="meet" value="${esc(eb.v.meet)}">`, 'A date can override it in the price grid.')}${fld('Meeting time', `<input value="${esc(E.time)}">`)}
      ${fld('Know before you go · one per line', `<textarea rows="6" data-bind="kbyg">${esc(eb.v.kbyg)}</textarea>`, 'The trip pack unlocks 7 days before departure, once fully paid.')}
      <div class="a-field"><span class="ad-pe-lbl">Required from every traveller ${V25}</span>${reqList()}</div>`;
    return `<div class="ad-pe-danger"><div><b>Duplicate as a draft</b><small>Copies everything but the bookings.</small></div><button type="button" class="a-btn ghost sm">${ICON.copy}Duplicate</button></div>
      <div class="ad-pe-danger"><div><b>Delete package</b><small>Blocked while 9 enquiries reference this package.</small></div><button type="button" class="a-btn danger sm" disabled>Delete</button></div>`;
  }
  function ebRender() {
    const r = rules(MUNNAR);
    const pkHosts = E.hotels.map(([n, c, s, nt]) => `<li><b>${esc(n)}</b><small>${c} · ${s}-star · ${nt} ${nt > 1 ? 'nights' : 'night'}</small></li>`).join('');
    const main = `<div class="ad-pe ad-pe-b" data-pane="${eb.pane}">
      <div class="ad-pe-top">
        <a href="#" class="ad-pe-back" data-back>${ICON.chevL}Packages</a>
        <div class="ad-pe-tt"><h1 data-out="name">${PV.name()}</h1><span class="a-chip ok">Live</span>
          <button type="button" class="ad-pe-chk" aria-expanded="${eb.checks}" data-checks>${ICON.check}${r.filter((x) => x[2]).length} of 4 checks</button></div>
        ${saveBar(eb)}
        ${eb.checks ? `<div class="ad-pe-pop" role="region" aria-label="Publish checks">${checksList(r)}<button type="button" class="a-btn ghost sm">Unpublish</button></div>` : ''}
      </div>
      ${leaveBar(eb)}
      <div class="a-seg ad-pe-pane" role="group" aria-label="Show"><button type="button" data-pane="edit" aria-pressed="${eb.pane === 'edit'}">Edit</button><button type="button" data-pane="preview" aria-pressed="${eb.pane === 'preview'}">Preview</button></div>
      <div class="ad-pe-bgrid">
        <div class="ad-pe-form">${EB_G.map(([g, l, sum, nw]) => `<section class="ad-pe-grp${eb.open === g ? ' on' : ''}" data-grp="${g}">
            <button type="button" class="ad-pe-gh" data-g-open="${g}" aria-expanded="${eb.open === g}"><span><b>${l}${nw ? ` ${V25}` : ''}</b>${sum ? `<small>${sum}</small>` : ''}</span>${ICON.chevD}</button>
            <div class="ad-pe-gb"${eb.open === g ? '' : ' hidden'}>${ebBody(g)}</div></section>`).join('')}</div>
        <div class="ad-pe-prev">
          <div class="ad-pe-ptool"><div class="a-seg" role="group" aria-label="Preview">${[['page', 'Page'], ['phone', 'Phone'], ['card', 'Card'], ['pack', 'Trip pack']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${eb.mode === k}">${l}</button>`).join('')}</div>
            <small>Click any part of the preview to edit it</small></div>
          <div class="ad-pe-pv" data-mode="${eb.mode}">
            <div class="ad-pe-pvbar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="url">tripsmith.vercel.app/${eb.mode === 'pack' ? 'my-trips/TS-7F3K2Q/trip-pack' : `packages/${E.slug}`}</span><span class="a-chip ok">Updates as you type</span></div>
            <div class="ad-pe-pvs" id="ad-pe-pvs">
              <div class="ad-pe-page">
                <div class="gal" data-g="photos"><span class="ph"><img src="img/munnar-2.jpg" alt="Tea estates of Munnar from above"></span><span class="ph"><img src="img/munnar-1.jpg" alt="Tea bushes on a Munnar hillside"></span><span class="ph"><img src="img/kerala-1.jpg" alt="Houseboats on a backwater canal near Alleppey"></span></div>
                <div class="hd" data-g="title"><small class="crumb">Kerala / Packages</small>${out('name', 'h2')}<p class="sub">4 nights · 5 days · Ex-Bengaluru · <span class="star">${TS.ICON.star}</span>4.8 (91 reviews)</p>${out('summary', 'p', 'lede')}</div>
                <div class="cols"><div class="l">
                  <section data-g="highlights"><h3>Highlights</h3>${out('hl', 'ul', 'hl')}</section>
                  <section data-g="itinerary"><h3>Day by day</h3>${out('days', 'ol', 'days')}</section>
                  <section data-g="stays"><h3>Where you stay</h3><ul class="stays">${pkHosts}</ul></section>
                  <section data-g="incl"><h3>What's included</h3><ul class="inc">${E.incl.slice(0, 4).map((l) => `<li>${ICON.check}<span>${esc(l)}</span></li>`).join('')}</ul><small class="more">+ 2 more · 4 not included · 3 questions</small></section>
                </div><aside class="r" data-g="prices">${out('price', 'div', 'pr')}${out('deps', 'div', 'deps')}
                  <p class="dp" data-g="booking">Reserve with 25 % now · 3 add-ons in the Book-now sheet</p><span class="bk">Book now</span>
                  <p class="ld">${avatar('anjali', 26)}<span><b>Your trip leader</b>Anjali Menon · 6 years</span></p></aside></div>
              </div>
              <div class="ad-pe-card" data-g="title"><span class="ph" data-g="photos"><img src="img/munnar-2.jpg" alt="Tea estates of Munnar from above"><span class="stamp">${E.deal.label}</span></span>
                <div class="b"><small>Kerala · 4 nights</small>${out('name', 'b')}<span class="rt"><span class="star">${TS.ICON.star}</span>4.8 · 91 reviews</span><span class="eb">Early-bird savings</span><div data-g="prices">${out('price', 'div', 'pr')}</div></div></div>
              <div class="ad-pe-pack" data-g="trippack"><small class="crumb">Trip pack · unlocks 7 days before, once fully paid</small><h2>Munnar &amp; Alleppey · Fri 13 Nov</h2>
                <dl><div><dt>Meet at</dt><dd>${out('meet')}</dd></div><div><dt>When</dt><dd>${esc(E.time)}</dd></div><div><dt>Your leader</dt><dd>Anjali Menon · +91 94470 31562</dd></div></dl>
                <h3>Know before you go</h3>${out('kbyg', 'ul', 'kb')}
                <h3>Before you travel</h3><ul class="kb"><li>Details: ID, emergency contact and food for every traveller</li>${E.check.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
            </div>
          </div>
        </div>
      </div>
      ${dock(eb)}
    </div>`;
    return TS.adminShell('Packages', main);
  }
  function ebMount(site, rr) {
    const root = site.querySelector('.ad-pe-b'); if (!root) return;
    guard(root, eb, rr, ebReset);
    bindAddons(root);
    const pvs = root.querySelector('#ad-pe-pvs'), pv = root.querySelector('.ad-pe-pv');
    const paint = (keys) => keys.forEach((k) => root.querySelectorAll(`[data-out="${k}"]`).forEach((el) => { el.innerHTML = PV[k](); }));
    const glow = (g) => {
      root.querySelectorAll('.ad-pe-pv [data-g]').forEach((el) => el.classList.toggle('hl', el.dataset.g === g));
      const vis = [...root.querySelectorAll(`.ad-pe-pv [data-g="${g}"]`)].find((el) => el.offsetParent !== null);
      if (vis && pvs) pvs.scrollTo({ top: Math.max(0, vis.getBoundingClientRect().top - pvs.getBoundingClientRect().top + pvs.scrollTop - 16), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    const setMode = (m) => { eb.mode = m; pv.dataset.mode = m; root.querySelectorAll('[data-mode]').forEach((b) => b !== pv && b.setAttribute('aria-pressed', b.dataset.mode === m));
      root.querySelector('.ad-pe-pvbar .url').textContent = `tripsmith.vercel.app/${m === 'pack' ? 'my-trips/TS-7F3K2Q/trip-pack' : `packages/${E.slug}`}`; };
    const openG = (g, focus) => {
      eb.open = g;
      root.querySelectorAll('.ad-pe-grp').forEach((s) => {
        const on = s.dataset.grp === g; s.classList.toggle('on', on);
        s.querySelector('.ad-pe-gh').setAttribute('aria-expanded', on); s.querySelector('.ad-pe-gb').hidden = !on;
      });
      if (g === 'trippack') setMode('pack'); else if (eb.mode === 'pack') setMode('page');
      glow(g);
      if (focus) { const s = root.querySelector(`[data-grp="${g}"]`); s.scrollIntoView({ block: 'nearest' }); const f = s.querySelector('.ad-pe-gb input:not([readonly]), .ad-pe-gb textarea'); if (f) f.focus({ preventScroll: true }); }
    };
    bind(root, '[data-g-open]', 'click', (b) => openG(eb.open === b.dataset.gOpen ? '' : b.dataset.gOpen));
    bind(root, '.ad-pe-pv [data-g]', 'click', (el, e) => { e.stopPropagation(); if (eb.pane === 'preview') { eb.pane = 'edit'; root.dataset.pane = 'edit'; root.querySelectorAll('[data-pane]').forEach((b) => b !== root && b.setAttribute('aria-pressed', b.dataset.pane === 'edit')); } openG(el.dataset.g, true); });
    bind(root, '.ad-pe-grp', 'mouseenter', (s) => root.querySelectorAll('.ad-pe-pv [data-g]').forEach((el) => el.classList.toggle('peek', el.dataset.g === s.dataset.grp)));
    bind(root, '.ad-pe-form', 'mouseleave', () => root.querySelectorAll('.ad-pe-pv .peek').forEach((el) => el.classList.remove('peek')));
    bind(root, 'button[data-mode]', 'click', (b) => setMode(b.dataset.mode));
    bind(root, 'button[data-pane]', 'click', (b) => { eb.pane = b.dataset.pane; root.dataset.pane = eb.pane; root.querySelectorAll('button[data-pane]').forEach((x) => x.setAttribute('aria-pressed', x === b)); });
    bind(root, '[data-checks]', 'click', () => { eb.checks = !eb.checks; rr(); });
    root.addEventListener('input', (e) => {
      const t = e.target, k = t.dataset && t.dataset.bind; if (!k) return;
      if (k === 'day') { eb.v.days[+t.dataset.i] = t.value; const sum = t.closest('details').querySelector('summary b'); if (sum) sum.textContent = t.value; paint(['days']); return; }
      if (k === 'dbl') { eb.v.dbl[+t.dataset.i] = t.value.replace(/\D/g, ''); paint(['price', 'deps']); return; }
      if (k === 'deal') { eb.v.deal = t.value.replace(/\D/g, ''); paint(['price', 'deps']); return; }
      eb.v[k] = t.value; paint([k]);
    });
    if (eb.open) glow(eb.open);
  }

  /* =====================================================================
     EDITOR · C · Itinerary builder (storyboard of days; money and the rest in a drawer)
     ===================================================================== */
  const ec = { days: null, sel: 0, nights: 4, drawer: false, tab: 'prices', dirty: false, saved: false, leaving: false };
  const ecReset = () => { ec.days = clone(DAYS0); ec.sel = 0; ec.nights = 4; };
  ecReset();
  const EC_TABS = [['text', 'Basics and page text'], ['photos', 'Photos'], ['prices', 'Dates and prices'], ['deal', 'Deal and early bird', 1], ['booking', 'Deposit and add-ons', 1], ['pack', 'Trip pack', 1]];
  const route = (days) => {
    const o = [];
    days.forEach((d, i) => { if (!d.stay) return; const last = o[o.length - 1]; if (last && last.stay === d.stay) { last.n++; last.to = i; } else o.push({ stay: d.stay, n: 1, from: i, to: i }); });
    return o;
  };
  const stayCity = (s) => (STAYS.find((x) => x[0] === s) || [s, s])[1];
  function ecTab(t) {
    if (t === 'text') return `<div class="a-row2">${fld('Name', `<input value="${esc(E.name)}">`)}${fld('Destination', `<select>${DESTS.map((d) => `<option ${d === 'Kerala' ? 'selected' : ''}>${d}</option>`).join('')}</select>`)}</div>
      <div class="a-row2">${fld('Nights', `<input type="number" value="${ec.nights}" data-nights>`, `${ec.days.length} days in the story`)}${fld('Departure city', '<input value="Ex-Bengaluru">')}</div>
      ${fld('Summary', `<textarea rows="3">${esc(E.summary)}</textarea>`)}${fld('Highlights · one per line', `<textarea rows="4">${esc(E.hl.join('\n'))}</textarea>`)}
      ${fld('Included · one per line', `<textarea rows="5">${esc(E.incl.join('\n'))}</textarea>`)}${fld('Not included · one per line', `<textarea rows="3">${esc(E.excl.join('\n'))}</textarea>`)}
      <div class="ad-pe-faq">${E.faq.map(([q, a], i) => `<details><summary><b>${esc(q)}</b>${ICON.chevD}</summary><div class="b"><textarea class="ad-pe-in" rows="3" aria-label="Answer ${i + 1}">${esc(a)}</textarea></div></details>`).join('')}</div>`;
    if (t === 'photos') return `<div class="ad-pe-gal">${E.photos.map(([src, alt], i) => `<figure><span class="ph"><img src="${src}" alt="${esc(alt)}" loading="lazy">${i === 0 ? '<span class="cov">Cover</span>' : ''}</span>
        <small>${ec.days.map((d, j) => (d.img === src ? `Day ${j + 1}` : '')).filter(Boolean).join(', ') || 'Not on a day'}</small><input class="ad-pe-in" value="${esc(alt)}" aria-label="Alt text, photo ${i + 1}"></figure>`).join('')}
      <button type="button" class="ad-pe-up">${ICON.plus}<b>Upload</b><small>JPG, PNG or WEBP up to 4 MB</small></button></div>`;
    if (t === 'prices') return `<div class="ad-pe-dcards">${DEPS0.map((d) => { const u = uIso(d.iso); return `<div class="ad-pe-dcard">
        <div class="h"><b>${wd(u)} ${fmt(u)}</b><span class="a-chip ${d.g ? 'ok' : 'mute'}">${d.g ? 'Guaranteed' : 'On sale'}</span></div>
        <span class="a-meter" style="--v:${pct(d.sold, d.seats)}%;--h:${pct(d.held, d.seats)}%" aria-hidden="true"></span><small>${d.sold} sold · ${d.held} held · ${d.seats - d.sold - d.held} free of ${d.seats}</small>
        <div class="g">${[['dbl', 'Double'], ['tri', 'Triple'], ['ch', 'Child'], ['sgl', 'Single suppl.']].map(([k, l]) => `<label><span>${l}</span>${RS(d[k], `${l}, ${fmt(u)}`)}</label>`).join('')}</div>
        <span class="ad-pe-lead sm">${avatar(d.lead, 22)}<select aria-label="Leader, ${fmt(u)}">${leaderOpts(d.lead)}</select>${d.lead !== 'anjali' ? '<small>Changed from default</small>' : ''}</span></div>`; }).join('')}</div>
      <button type="button" class="a-btn ghost sm">${ICON.plus}Add departure</button>`;
    if (t === 'deal') return `<p class="ad-pe-notice ok">Running: ₹2,000 off per traveller until 31 Oct 2026</p>
      <div class="a-row2">${fld('Deal price per person', RS(19999, 'Deal price per person'), '₹2,000 off the starting price ₹21,999')}${fld('Last day', '<input type="date" value="2026-10-31">')}</div>${fld('Label · optional', '<input value="Season opener" maxlength="24">')}
      <div class="ad-pe-swrow">${swi('ad-pe-sw', true, 'Early bird on')}<span><b>Early bird ${V25}</b><small>Up to 2 tiers, per traveller, children included, never on add-ons.</small></span></div>
      <div class="ad-pe-tiers">${[[1, 1500, 90], [2, 750, 45]].map(([n, off, days]) => `<div><span class="n">Tier ${n}</span>${RS(off, `Tier ${n} amount off`)}<span>off when booked</span><input class="ad-pe-in w-s" value="${days}" aria-label="Tier ${n} days before"><span>+ days out</span></div>`).join('')}</div>`;
    if (t === 'booking') return `<div class="ad-pe-swrow">${swi('ad-pe-sw', true, 'Deposit on')}<span><b>Reserve with 25 % now</b><small>Of the total after deal and coupon, add-ons included. Balance due 30 days before departure.</small></span></div>
      <h4 class="ad-pe-h4">Add-ons</h4>${addonsList()}`;
    return `${fld('Meeting point', `<input value="${esc(E.meet)}">`, 'Each date can override it.')}${fld('Meeting time', `<input value="${esc(E.time)}">`)}${fld('Maps link', `<input value="${E.maps}">`)}
      ${fld('Know before you go · one per line', `<textarea rows="6">${esc(E.kbyg.join('\n'))}</textarea>`)}<div class="a-field"><span class="ad-pe-lbl">Required from every traveller</span>${reqList()}</div>
      <div class="a-field"><span class="ad-pe-lbl">Pre-trip checklist</span>${E.check.map((c, i) => `<input class="ad-pe-in" value="${esc(c)}" aria-label="Checklist item ${i + 1}">`).join('')}</div>`;
  }
  function ecRender() {
    const days = ec.days, d = days[ec.sel], rt = route(days), n = days.length;
    const splits = STAYS.filter(([s]) => rt.filter((x) => x.stay === s).length > 1);
    const shapeOk = n - 1 === ec.nights;
    const tally = MEALS.map(([m, l]) => [l, days.filter((x) => x.meals.includes(m)).length]);
    const noPhoto = days.filter((x) => !x.img).length;
    const r = rules(MUNNAR);
    const card = (x, i) => `<li class="ad-pe-sb${i === ec.sel ? ' sel' : ''}">
      <button type="button" class="ad-pe-sbc" data-day="${i}" aria-pressed="${i === ec.sel}">
        ${x.img ? `<span class="ph"><img src="${x.img}" alt="${esc(x.alt)}" loading="lazy"></span>` : `<span class="ad-pe-noph">${ICON.camera}No photo yet</span>`}
        <span class="n">Day ${i + 1}</span><b data-sbt="${i}">${esc(x.t)}</b>
        <small>${ICON.pin}<span data-sbp="${i}">${esc(x.place)}</span></small><small>${ICON.bed}${x.stay ? esc(stayCity(x.stay)) : 'No stay · going home'}</small>
        <span class="ml">${MEALS.map(([m, l]) => `<i class="${x.meals.includes(m) ? 'on' : ''}" title="${l}">${m}</i>`).join('')}</span></button>
      <span class="mv"><button type="button" data-mv="-1" data-i="${i}" aria-label="Move day ${i + 1} earlier"${i === 0 ? ' disabled' : ''}>${ICON.chevL}</button><button type="button" data-mv="1" data-i="${i}" aria-label="Move day ${i + 1} later"${i === n - 1 ? ' disabled' : ''}>${ICON.chevR}</button></span></li>`;
    const main = `<div class="ad-pe ad-pe-c${ec.drawer ? ' drawer-on' : ''}">
      <div class="ad-pe-top">
        <a href="#" class="ad-pe-back" data-back>${ICON.chevL}Packages</a>
        <div class="ad-pe-tt"><h1>${esc(E.name)}</h1><span class="a-chip ok">Live</span><span class="a-chip mute">Kerala · ${ec.nights} nights · Ex-Bengaluru</span></div>
        ${saveBar(ec)}
      </div>
      ${leaveBar(ec)}
      <div class="ad-pe-route" aria-label="Route">
        <span class="stop end">${ICON.pin}<span><b>Kochi airport</b><small>Meet · 11:30</small></span></span>
        ${rt.map((x) => `<span class="leg" aria-hidden="true"></span><span class="stop"><span class="ph"><img src="${(days[x.from].img || days.slice(x.from, x.to + 1).map((q) => q.img).find(Boolean) || 'img/kerala-2.jpg')}" alt="" loading="lazy"></span><span><b>${esc(stayCity(x.stay))}</b><small>${x.n} ${x.n > 1 ? 'nights' : 'night'} · Day ${x.from + 1}${x.to > x.from ? `–${x.to + 1}` : ''}</small></span></span>`).join('')}
        <span class="leg" aria-hidden="true"></span><span class="stop end">${ICON.pin}<span><b>Kochi airport</b><small>Day ${n} · home</small></span></span>
        <button type="button" class="ad-pe-money" data-open="prices">${ICON.rupee}<span><b>From ${inr(21999)} · deal ${inr(19999)}</b><small>4 dates · 16 of 46 sold · deposit and 3 add-ons on</small></span>${ICON.chevR}</button>
      </div>
      <ol class="ad-pe-story" aria-label="Days">${days.map(card).join('')}
        <li class="ad-pe-sb add"><button type="button" class="ad-pe-sbc" data-addday>${ICON.plus}<b>Add day ${n + 1}</b><small>Nights follow the days</small></button></li></ol>
      <div class="ad-pe-cgrid">
        <section class="a-card ad-pe-de" aria-label="Day ${ec.sel + 1}">
          <div class="a-card-h"><h2>Day ${ec.sel + 1} · <span data-sbp="${ec.sel}">${esc(d.place)}</span></h2><div class="acts">
            <button type="button" class="a-btn ghost sm" data-mv="-1" data-i="${ec.sel}"${ec.sel === 0 ? ' disabled' : ''}>${ICON.chevL}Earlier</button><button type="button" class="a-btn ghost sm" data-mv="1" data-i="${ec.sel}"${ec.sel === n - 1 ? ' disabled' : ''}>Later${ICON.chevR}</button>
            <button type="button" class="a-btn danger sm" data-delday${n <= 2 ? ' disabled' : ''}>Remove day</button></div></div>
          <div class="a-card-b ad-pe-deg">
            <div class="pcol">${d.img ? `<span class="ph big"><img src="${d.img}" alt="${esc(d.alt)}"></span>` : `<span class="ad-pe-noph big">${ICON.camera}<b>No photo for this day</b><small>Pick one from the gallery below or upload</small></span>`}
              <div class="ad-pe-pick" role="group" aria-label="Photo for day ${ec.sel + 1}">${E.photos.map(([src, alt], i) => `<button type="button" class="ph" data-pick="${i}" aria-pressed="${d.img === src}" aria-label="Use: ${esc(alt)}"><img src="${src}" alt=""></button>`).join('')}
                <button type="button" class="up" aria-label="Upload a photo">${ICON.plus}</button></div></div>
            <div class="fcol">
              ${fld('Title', `<input data-dk="t" value="${esc(d.t)}">`)}
              <div class="a-row2">${fld('Place', `<input data-dk="place" value="${esc(d.place)}">`, 'Shown on the day and the route')}
                ${fld('Stay tonight', `<select data-dk="stay"><option value="">No stay · going home</option>${STAYS.map(([s]) => `<option ${d.stay === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`)}</div>
              ${fld('What happens', `<textarea rows="6" data-dk="desc">${esc(d.desc)}</textarea>`)}
              <div class="a-field"><span class="ad-pe-lbl">Meals included</span><div class="ad-pe-pills own" role="group" aria-label="Meals">${MEALS.map(([m, l]) => `<button type="button" data-meal="${m}" aria-pressed="${d.meals.includes(m)}">${l}</button>`).join('')}</div></div>
            </div>
          </div>
        </section>
        <aside class="ad-pe-rail">
          <section class="a-card"><div class="a-card-h"><h2>Trip shape</h2><span class="a-chip ${shapeOk ? 'ok' : 'warn'}">${shapeOk ? 'Matches' : 'Mismatch'}</span></div><div class="a-card-b">
            <p class="ad-pe-big"><b class="num">${n}</b> days · <b class="num">${ec.nights}</b> nights</p>
            ${shapeOk ? '<small class="ad-pe-fine">Days equal nights plus one, as publishing requires.</small>' : `<p class="ad-pe-notice warn">${n} days need ${n - 1} nights; Basics says ${ec.nights}.</p><button type="button" class="a-btn sm" data-fixn="${n - 1}">Set nights to ${n - 1}</button>`}</div></section>
          <section class="a-card"><div class="a-card-h"><h2>Stays</h2><span class="a-chip ${splits.length ? 'warn' : 'ok'}">${splits.length ? 'Split stay' : 'In order'}</span></div><div class="a-card-b"><ul class="ad-pe-stays">
            ${rt.map((x) => { const s = STAYS.find((q) => q[0] === x.stay) || [x.stay, x.stay, x.stay, 3]; return `<li>${ICON.bed}<span><b>${esc(s[2])}</b><small>${esc(s[1])} · ${s[3]}-star</small></span><em class="num">${x.n} ${x.n > 1 ? 'nights' : 'night'}</em></li>`; }).join('')}</ul>
            ${splits.length ? `<p class="ad-pe-notice warn">${esc(splits[0][2])} appears twice: travellers would check in, leave and come back.</p>` : '<small class="ad-pe-fine">Hotels follow the days; the hotel list updates when you save.</small>'}</div></section>
          <section class="a-card"><div class="a-card-h"><h2>Meals</h2></div><div class="a-card-b"><dl class="a-kv">${tally.map(([l, c]) => `<div><dt>${l}</dt><dd>${c} of ${n} days</dd></div>`).join('')}</dl></div></section>
          <section class="a-card"><div class="a-card-h"><h2>Around the story</h2></div><div class="a-card-b ad-pe-around">
            ${[['text', 'Basics and page text', '4 highlights · 6 included · 3 FAQ'], ['photos', 'Photos', `4 photos · ${noPhoto ? `${noPhoto} ${noPhoto > 1 ? 'days' : 'day'} without one` : 'every day has one'}`], ['deal', 'Deal and early bird', 'Running · 2 tiers', 1], ['booking', 'Deposit and add-ons', '25 % · 3 of 4 on', 1], ['pack', 'Trip pack', 'Meeting point · 3 required fields', 1]].map(([k, l, s, nw]) =>
              `<button type="button" data-open="${k}"><span><b>${l}${nw ? ` ${V25}` : ''}</b><small>${s}</small></span>${ICON.chevR}</button>`).join('')}</div></section>
          <section class="a-card"><div class="a-card-h"><h2>Publish checks</h2><span class="a-chip ok">Live</span></div><div class="a-card-b">${checksList(r.map((x, i) => (i === 1 ? ['Full itinerary', `${n} of ${ec.nights + 1} days written`, shapeOk] : x)))}</div></section>
        </aside>
      </div>
      <div class="ad-pe-scrim" data-close${ec.drawer ? '' : ' hidden'}></div>
      <aside class="ad-pe-drawer" aria-label="Package details" aria-hidden="${!ec.drawer}"${ec.drawer ? '' : ' inert'}>
        <div class="in"><div class="h"><h2>Everything around the days</h2><button type="button" class="a-btn ghost sm" data-close aria-label="Close">${ICON.x}</button></div>
          <div class="a-tabs" role="tablist">${EC_TABS.map(([k, l, nw]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${ec.tab === k}">${l}${nw ? ' <i class="ad-pe-nw">v2.5</i>' : ''}</button>`).join('')}</div>
          <div class="b" role="tabpanel">${ecTab(ec.tab)}</div></div>
      </aside>
      ${dock(ec)}
    </div>`;
    return TS.adminShell('Packages', main);
  }
  function ecMount(site, rr) {
    const root = site.querySelector('.ad-pe-c'); if (!root) return;
    const mark = guard(root, ec, rr, ecReset);
    bindAddons(root);
    const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= ec.days.length) return; const a = ec.days; [a[i], a[j]] = [a[j], a[i]]; ec.sel = j; ec.dirty = true; rr(); };
    bind(root, '[data-day]', 'click', (b) => { ec.sel = +b.dataset.day; rr(); });
    bind(root, '[data-mv]', 'click', (b) => move(+b.dataset.i, +b.dataset.mv));
    bind(root, '[data-addday]', 'click', () => { ec.days.push({ t: 'New day', place: 'Kochi', meals: 'B', stay: '', img: '', alt: '', desc: '' }); ec.sel = ec.days.length - 1; ec.dirty = true; rr(); });
    bind(root, '[data-delday]', 'click', () => { ec.days.splice(ec.sel, 1); ec.sel = Math.max(0, ec.sel - 1); ec.dirty = true; rr(); });
    bind(root, '[data-fixn]', 'click', (b) => { ec.nights = +b.dataset.fixn; ec.dirty = true; rr(); });
    bind(root, '[data-pick]', 'click', (b) => { const p = E.photos[+b.dataset.pick]; Object.assign(ec.days[ec.sel], { img: p[0], alt: p[1] }); ec.dirty = true; rr(); });
    bind(root, '[data-meal]', 'click', (b) => { const d = ec.days[ec.sel], m = b.dataset.meal; d.meals = MEALS.map(([x]) => x).filter((x) => (x === m ? !d.meals.includes(x) : d.meals.includes(x))).join(''); ec.dirty = true; rr(); });
    bind(root, '[data-open]', 'click', (b) => { ec.drawer = true; ec.tab = b.dataset.open; rr(); const t = site.querySelector('.ad-pe-drawer [aria-selected="true"]'); if (t) t.focus(); });
    bind(root, '[data-close]', 'click', () => { ec.drawer = false; rr(); });
    bind(root, '[data-tab]', 'click', (b) => { ec.tab = b.dataset.tab; rr(); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ec.drawer) { ec.drawer = false; rr(); } });
    root.addEventListener('input', (e) => {
      const t = e.target, k = t.dataset && t.dataset.dk;
      if (t.dataset && 'nights' in t.dataset) { ec.nights = +t.value || ec.nights; return; }
      if (!k) return;
      ec.days[ec.sel][k] = t.value;
      if (k === 't') root.querySelectorAll(`[data-sbt="${ec.sel}"]`).forEach((el) => { el.textContent = t.value; });
      if (k === 'place') root.querySelectorAll(`[data-sbp="${ec.sel}"]`).forEach((el) => { el.textContent = t.value; });
    });
    root.addEventListener('change', (e) => { const t = e.target; if (t.dataset && t.dataset.dk === 'stay') { ec.days[ec.sel].stay = t.value; ec.dirty = true; rr(); } else if (t.dataset && 'nights' in t.dataset) { ec.dirty = true; rr(); } });
    void mark;
  }

  /* =====================================================================
     EDITOR · D · Departures desk (season strip, price grid, bulk dates, per-date inspector)
     ===================================================================== */
  const ed = { deps: null, sel: 0, ebOn: true, dirty: false, saved: false, leaving: false,
    bulk: { every: 2, wd: 5, from: '2027-02-26', to: '2027-03-26', seats: 12 }, bk: { row: 'dbl', op: 'add', amt: 1000, scope: 'all' } };
  const edReset = () => { ed.deps = clone(DEPS0); ed.sel = 0; };
  edReset();
  const sortDeps = () => { const cur = ed.deps[ed.sel]; ed.deps.sort((a, b) => uIso(a.iso) - uIso(b.iso)); ed.sel = Math.max(0, ed.deps.indexOf(cur)); };
  const gen = (b) => {
    const o = []; let u = uIso(b.from); const end = uIso(b.to);
    if (!(u <= end) || !(+b.every > 0)) return o;
    while (new Date(u).getUTCDay() !== +b.wd) u += DAY;
    while (u <= end && o.length < 12) { o.push(u); u += +b.every * 7 * DAY; }
    return o;
  };
  const flag = (u) => {
    const m = new Date(u).getUTCMonth() + 1, dd = new Date(u).getUTCDate();
    if (ed.deps.some((d) => d.iso === isoOf(u))) return ['mute', 'Already on sale'];
    if (!SEASON.Kerala.includes(m)) return ['warn', 'Outside best months'];
    if (m === 2 || m === 3 || (m === 4 && dd <= 10)) return ['info', 'Eravikulam closed: Top Station instead'];
    return ['ok', 'Good month'];
  };
  const genChips = () => { const g = gen(ed.bulk); return g.length ? g.map((u) => { const [k, w] = flag(u); return `<li><b>${wd(u)} ${fmt(u)}</b><span class="a-chip ${k}">${w}</span></li>`; }).join('') : '<li class="none">No dates match. Check the range and the weekday.</li>'; };
  const ladder = (d) => {
    const u = uIso(d.iso), dd = away(u), off = dealOff(ed.deps), dealEnd = uIso(E.deal.until) + DAY;
    const pts = [T0];
    if (ed.ebOn && dd >= 90) pts.push(u - 89 * DAY);
    if (ed.ebOn && dd >= 45) pts.push(u - 44 * DAY);
    if (off && dealEnd < u) pts.push(dealEnd);
    return [...new Set(pts)].filter((p) => p < u).sort((a, b) => a - b).map((p) => {
      const days = Math.round((u - p) / DAY), dl = p < dealEnd ? off : 0, t = tier(days, ed.ebOn);
      const why = [dl && `deal −${inr(dl)}`, t && `early bird −${inr(t)}`].filter(Boolean).join(' · ') || 'Full price';
      return [p === T0 ? 'Book today' : `From ${fmt(p, false)}`, Math.max(1, d.dbl - dl - t), why];
    });
  };
  const PG_ROWS = [['seats', 'Seats'], ['dbl', 'Double', 'per person'], ['tri', 'Triple', 'per person'], ['ch', 'Child', 'with 2 adults'], ['sgl', 'Single suppl.', 'on top']];
  const todayCell = (d) => { const t = tier(away(uIso(d.iso)), ed.ebOn), off = dealOff(ed.deps);
    return `<b class="num">${inr(today(d, ed.deps, E.deal.price, ed.ebOn))}</b><small>${[off && `deal −${inr(off)}`, t && `tier ${t === 1500 ? 1 : 2} −${inr(t)}`].filter(Boolean).join(' · ') || 'No discount'}</small>`; };
  const depCell = (d) => `<b class="num">${inr(Math.round(today(d, ed.deps, E.deal.price, ed.ebOn) * 2 * 0.25))}</b><small>for two, today</small>`;
  function edInsp() {
    const d = ed.deps[ed.sel], u = uIso(d.iso), free = d.seats - d.sold - d.held, L = LEADERS[d.lead];
    return `<aside class="a-panel ad-pe-insp" aria-label="Selected departure">
      <section><small class="ad-pe-eyeb">${wd(u)} · ${away(u)} days away${d.isNew ? ' · New, not saved' : ''}</small><h2>${fmt(u)}</h2>
        <div class="ad-pe-chips"><span class="a-chip ${d.g ? 'ok' : 'mute'}">${d.g ? 'Guaranteed' : 'Not guaranteed yet'}</span><span class="a-chip ${free ? 'info' : 'bad'}">${free ? 'On sale' : 'Sold out'}</span></div>
        <div class="ad-pe-seat" role="img" aria-label="${d.sold} sold, ${d.held} held, ${free} free of ${d.seats}"><i class="s" style="--w:${pct(d.sold, d.seats)}%"></i><i class="h" style="--w:${pct(d.held, d.seats)}%"></i></div>
        <ul class="ad-pe-legend"><li><i class="s"></i>${d.sold} sold</li><li><i class="h"></i>${d.held} held</li><li><i></i>${free} free</li></ul></section>
      <section><h3 class="ad-pe-h4">What a traveller pays, twin sharing</h3><ol class="ad-pe-ladder">${ladder(d).map(([l, p, why], i) => `<li class="${i === 0 ? 'on' : ''}"><span>${l}</span><b class="num">${inr(p)}</b><small>${why}</small></li>`).join('')}</ol></section>
      <section><h3 class="ad-pe-h4">Trip leader ${V25}</h3><span class="ad-pe-lead">${avatar(d.lead, 34)}<span><b>${L.name}</b><small>${L.years} years · ${L.langs}</small></span></span>
        <select class="ad-pe-in" data-k="lead" data-i="${ed.sel}" aria-label="Leader for this date">${leaderOpts(d.lead)}</select><small class="ad-pe-fine">${d.lead === 'anjali' ? 'Package default' : 'Changed from the default, Anjali Menon'}</small></section>
      <section><h3 class="ad-pe-h4">Meeting point ${V25}</h3>${d.meet ? `<input class="ad-pe-in" value="${esc(d.meet)}" aria-label="Meeting point for this date"><small class="ad-pe-fine">Overrides the default: ${esc(E.meet)}</small>` : `<p class="ad-pe-def">${esc(E.meet)}<small>Package default · 11:30 IST</small></p><button type="button" class="a-btn ghost sm">Override for this date</button>`}</section>
      <section><h3 class="ad-pe-h4">Waitlist</h3><p class="ad-pe-fine">${d.wait ? `${d.wait} waiting` : 'Nobody waiting. The list opens when this date sells out and closes 3 days before.'}</p></section>
      <section class="ad-pe-iacts"><a href="#" class="a-btn ghost sm">${ICON.file}Manifest</a><button type="button" class="a-btn ghost sm" disabled>Offer seats</button>
        <button type="button" class="a-btn danger sm" data-rm${d.sold || d.held ? ' disabled' : ''}>Remove date</button>${d.sold || d.held ? `<small class="ad-pe-fine">Remove is blocked: ${d.sold + d.held} seats are booked or held. Move them first.</small>` : ''}</section>
    </aside>`;
  }
  function edRender() {
    const deps = ed.deps, sold = deps.reduce((s, d) => s + d.sold, 0), seats = deps.reduce((s, d) => s + d.seats, 0);
    const off = dealOff(deps), nx = deps[0], cheapest = Math.min(...deps.map((d) => today(d, deps, E.deal.price, ed.ebOn)));
    const b = ed.bulk, bk = ed.bk;
    const main = `<div class="ad-pe ad-pe-d">
      <div class="ad-pe-top">
        <a href="#" class="ad-pe-back" data-back>${ICON.chevL}Packages</a>
        <div class="ad-pe-tt"><h1>${esc(E.name)}</h1><span class="a-chip ok">Live</span><a href="#" class="ad-pe-link">${ICON.file}Content: itinerary, photos, text</a></div>
        ${saveBar(ed)}
      </div>
      ${leaveBar(ed)}
      <div class="a-kpis">
        <div class="a-kpi"><span class="k">Next departure</span><span class="v">${fmt(uIso(nx.iso), false)}</span><span class="d">${away(uIso(nx.iso))} days · ${nx.sold} of ${nx.seats} sold</span></div>
        <div class="a-kpi"><span class="k">Seats sold</span><span class="v num">${sold} / ${seats}</span><span class="d">${pct(sold, seats)}% across ${deps.length} dates</span></div>
        <div class="a-kpi"><span class="k">Lowest price today</span><span class="v num">${inr(cheapest)}</span><span class="d ${off ? 'up' : 'down'}">${off ? `Deal −${inr(off)} running` : 'Deal inactive'}</span></div>
        <div class="a-kpi"><span class="k">Booked value</span><span class="v num">${lakh(deps.reduce((s, d) => s + d.sold * d.dbl, 0))}</span><span class="d">At twin price, before add-ons</span></div>
      </div>
      <section class="ad-pe-months" aria-label="Season, Oct 2026 to Sep 2027">
        ${COLS.map((c, i) => {
          const ds = deps.map((d, j) => [d, j]).filter(([d]) => colOf(uIso(d.iso)) === i), season = inSeason('Kerala', c.m);
          return `<div class="mo${season ? ' s' : ''}"><span class="lb"><b>${MON[c.m]}</b>${i === 0 || c.m === 0 ? ` ${c.y}` : ''}<small>${season ? 'Best' : 'Off season'}</small></span>
            ${ds.map(([d, j]) => `<button type="button" class="dc ${fillCls([0, d.seats, d.sold])}" data-sel="${j}" aria-pressed="${j === ed.sel}"><b>${wd(uIso(d.iso))} ${new Date(uIso(d.iso)).getUTCDate()}</b><small class="num">${d.sold}/${d.seats}${d.isNew ? ' · New' : ''}</small></button>`).join('')}
            ${!ds.length && season && plannable(i) ? `<button type="button" class="add" data-addm="${i}">${ICON.plus}Add date</button>` : ''}</div>`;
        }).join('')}
      </section>
      <div class="ad-pe-dgrid">
        <div class="ad-pe-dmain">
          <section class="a-card flush"><div class="a-card-h"><h2>Price grid</h2><span class="a-chip mute">${deps.length} dates side by side</span></div>
            <div class="ad-pe-bulk" role="group" aria-label="Change many prices at once"><span>Change</span>
              <select class="a-select" data-bk="row" aria-label="Which price">${PG_ROWS.map(([k, l]) => `<option value="${k}" ${bk.row === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <select class="a-select" data-bk="op" aria-label="How">${[['add', 'up by'], ['sub', 'down by'], ['set', 'to']].map(([k, l]) => `<option value="${k}" ${bk.op === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
              ${RS(bk.amt, 'Amount', ' data-bk="amt"')}
              <select class="a-select" data-bk="scope" aria-label="On which dates">${[['all', 'on every date'], ['sel', 'on the selected date'], ['open', 'on dates with nobody booked']].map(([k, l]) => `<option value="${k}" ${bk.scope === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <button type="button" class="a-btn sm" data-bkgo>Apply</button></div>
            <div class="a-card-b"><div class="a-tw"><table class="ad-pe-pg">
              <thead><tr><th scope="col">Per departure</th>${deps.map((d, i) => { const u = uIso(d.iso); return `<th scope="col" class="${i === ed.sel ? 'sel' : ''}"><button type="button" data-sel="${i}" aria-pressed="${i === ed.sel}"><b>${wd(u)} ${fmt(u, false)}</b><small>${new Date(u).getUTCFullYear()} · ${away(u)} days${d.isNew ? ' · New' : ''}</small></button></th>`; }).join('')}</tr></thead>
              <tbody>
                ${PG_ROWS.map(([k, l, h]) => `<tr><th scope="row">${l}${h ? `<small>${h}</small>` : ''}</th>${deps.map((d, i) => `<td class="${i === ed.sel ? 'sel' : ''}">${k === 'seats'
                  ? `<input class="ad-pe-in w-s" inputmode="numeric" value="${d.seats}" data-k="seats" data-i="${i}" aria-label="Seats, ${fmt(uIso(d.iso))}"><small>${d.sold} sold · ${d.held} held</small>`
                  : RS(d[k], `${l}, ${fmt(uIso(d.iso))}`, ` data-k="${k}" data-i="${i}"`)}</td>`).join('')}</tr>`).join('')}
                <tr><th scope="row">Guaranteed</th>${deps.map((d, i) => `<td class="${i === ed.sel ? 'sel' : ''}"><label class="ad-pe-cb"><input type="checkbox" ${d.g ? 'checked' : ''} aria-label="Guaranteed, ${fmt(uIso(d.iso))}"><span>${d.g ? 'Yes' : 'No'}</span></label></td>`).join('')}</tr>
                <tr><th scope="row">Leader ${V25}</th>${deps.map((d, i) => `<td class="${i === ed.sel ? 'sel' : ''}"><span class="ad-pe-lead sm">${avatar(d.lead, 22)}<span>${LEADERS[d.lead].name.split(' ')[0]}<small>${d.lead === 'anjali' ? 'Default' : 'Changed'}</small></span></span></td>`).join('')}</tr>
                <tr><th scope="row">Meeting point ${V25}</th>${deps.map((d, i) => `<td class="${i === ed.sel ? 'sel' : ''}"><small class="${d.meet ? 'ovr' : ''}">${d.meet ? 'Own time: 10:30' : 'Default'}</small></td>`).join('')}</tr>
                <tr class="calc"><th scope="row">Price today<small>after deal and early bird</small></th>${deps.map((d, i) => `<td class="${i === ed.sel ? 'sel' : ''}" data-today="${i}">${todayCell(d)}</td>`).join('')}</tr>
                <tr class="calc"><th scope="row">Deposit today ${V25}<small>25 %, if two book</small></th>${deps.map((d, i) => `<td class="${i === ed.sel ? 'sel' : ''}" data-dep="${i}">${depCell(d)}</td>`).join('')}</tr>
              </tbody></table></div></div></section>
          <section class="a-card"><div class="a-card-h"><h2>Add dates in bulk</h2><span class="a-chip mute">Copies seats and prices from ${fmt(uIso(deps[deps.length - 1].iso))}</span></div><div class="a-card-b">
            <div class="ad-pe-gen">
              <label>Every<select class="a-select" data-b="every">${[[1, 'week'], [2, '2 weeks'], [4, '4 weeks']].map(([v, l]) => `<option value="${v}" ${+b.every === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
              <label>on<select class="a-select" data-b="wd">${WDL.map((w, i) => `<option value="${i}" ${+b.wd === i ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
              <label>from<input class="ad-pe-in" type="date" value="${b.from}" data-b="from"></label>
              <label>to<input class="ad-pe-in" type="date" value="${b.to}" data-b="to"></label>
              <label>seats<input class="ad-pe-in w-s" inputmode="numeric" value="${b.seats}" data-b="seats"></label>
            </div>
            <ul class="ad-pe-genl" aria-live="polite">${genChips()}</ul>
            <div class="ad-pe-foot"><button type="button" class="a-btn act sm" data-gen>${ICON.plus}<span data-gen-n>Add ${gen(b).filter((u) => !deps.some((d) => d.iso === isoOf(u))).length} dates</span></button><small class="ad-pe-fine">New dates go on sale when you save. Customers never see a date twice.</small></div>
          </div></section>
          <section class="ad-pe-rulesg" aria-label="Rules that apply to every date">
            <div class="a-card"><div class="a-card-h"><h2>Deal</h2><span class="a-chip ${off ? 'ok' : 'warn'}">${off ? 'Running' : 'Inactive'}</span></div><div class="a-card-b">
              <div class="a-row2">${fld('Deal price', RS(E.deal.price, 'Deal price per person'))}${fld('Last day', '<input type="date" value="2026-10-31">')}</div>
              <small class="ad-pe-fine">${off ? `${inr(off)} off per traveller on every date: starting price ${inr(startP(deps))} minus the deal price.` : `Inactive: ${inr(E.deal.price)} is not below the starting price ${inr(startP(deps))}.`}</small></div></div>
            <div class="a-card"><div class="a-card-h"><h2>Early bird ${V25}</h2><span class="ad-pe-fl">${swi('ad-pe-sw', ed.ebOn, 'Early bird on', ' data-own data-ebon')}<small>${ed.ebOn ? 'On' : 'Off'}</small></span></div><div class="a-card-b">
              <div class="ad-pe-tiers">${[[1, 1500, 90], [2, 750, 45]].map(([n, o, days]) => `<div><span class="n">Tier ${n}</span>${RS(o, `Tier ${n} amount off`)}<span>off at</span><input class="ad-pe-in w-s" value="${days}" aria-label="Tier ${n} days before"><span>+ days</span></div>`).join('')}</div></div></div>
            <div class="a-card"><div class="a-card-h"><h2>Deposit ${V25}</h2>${swi('ad-pe-sw', true, 'Deposit on')}</div><div class="a-card-b"><p class="ad-pe-fine">Reserve with 25 % now; the balance is due 30 days before departure. Dates inside 30 days pay in full.</p></div></div>
            <div class="a-card"><div class="a-card-h"><h2>Add-ons ${V25}</h2><span class="a-chip mute">3 of 4 on</span></div><div class="a-card-b">${addonsList()}</div></div>
          </section>
          <section class="a-card ad-pe-content"><div class="a-card-b"><span class="ph"><img src="img/munnar-2.jpg" alt="Tea estates of Munnar from above"></span>
            <div><b>Content lives in its own editor</b><small>Itinerary 5 of 5 days · 4 photos · 4 highlights · trip pack set · 3 traveller fields required</small></div><a href="#" class="a-btn ghost sm">Open content${ICON.arrowR}</a></div></section>
        </div>
        ${edInsp()}
      </div>
      ${dock(ed)}
    </div>`;
    return TS.adminShell('Packages', main);
  }
  function edMount(site, rr) {
    const root = site.querySelector('.ad-pe-d'); if (!root) return;
    guard(root, ed, rr, edReset);
    bindAddons(root);
    const repaint = () => ed.deps.forEach((d, i) => {
      const t = root.querySelector(`[data-today="${i}"]`); if (t) t.innerHTML = todayCell(d);
      const p = root.querySelector(`[data-dep="${i}"]`); if (p) p.innerHTML = depCell(d);
    });
    const genRefresh = () => {
      root.querySelector('.ad-pe-genl').innerHTML = genChips();
      root.querySelector('[data-gen-n]').textContent = `Add ${gen(ed.bulk).filter((u) => !ed.deps.some((d) => d.iso === isoOf(u))).length} dates`;
    };
    bind(root, '[data-sel]', 'click', (b) => { ed.sel = +b.dataset.sel; rr(); });
    bind(root, '[data-ebon]', 'click', () => { ed.ebOn = !ed.ebOn; ed.dirty = true; rr(); });
    bind(root, '[data-rm]', 'click', () => { ed.deps.splice(ed.sel, 1); ed.sel = Math.max(0, ed.sel - 1); ed.dirty = true; rr(); });
    bind(root, '[data-addm]', 'click', (b) => {
      const c = COLS[+b.dataset.addm]; let u = Date.UTC(c.y, c.m, 8); while (new Date(u).getUTCDay() !== 5) u += DAY;
      const src = ed.deps[ed.deps.length - 1];
      ed.deps.push({ ...src, iso: isoOf(u), sold: 0, held: 0, wait: 0, g: false, meet: '', lead: 'anjali', isNew: true });
      ed.sel = ed.deps.length - 1; sortDeps(); ed.dirty = true; rr();
    });
    bind(root, '[data-gen]', 'click', () => {
      const src = ed.deps[ed.deps.length - 1];
      gen(ed.bulk).filter((u) => !ed.deps.some((d) => d.iso === isoOf(u))).forEach((u) => ed.deps.push({ ...src, iso: isoOf(u), seats: +ed.bulk.seats || src.seats, sold: 0, held: 0, wait: 0, g: false, meet: '', lead: 'anjali', isNew: true }));
      sortDeps(); ed.dirty = true; rr();
    });
    bind(root, '[data-bkgo]', 'click', () => {
      const { row, op, amt, scope } = ed.bk, a = +String(amt).replace(/\D/g, '') || 0;
      ed.deps.forEach((d, i) => {
        if (scope === 'sel' && i !== ed.sel) return;
        if (scope === 'open' && (d.sold || d.held)) return;
        d[row] = Math.max(row === 'seats' ? d.sold + d.held : 1, op === 'add' ? d[row] + a : op === 'sub' ? d[row] - a : a);
      });
      ed.dirty = true; rr();
    });
    root.addEventListener('input', (e) => {
      const t = e.target, ds = t.dataset || {};
      if (ds.k && ds.i != null && ds.k !== 'lead') { ed.deps[+ds.i][ds.k] = +t.value.replace(/\D/g, '') || 0; repaint(); }
      if (ds.bk) ed.bk[ds.bk] = ds.bk === 'amt' ? t.value.replace(/\D/g, '') : t.value;
      if (ds.b) { ed.bulk[ds.b] = t.value; genRefresh(); }
    });
    root.addEventListener('change', (e) => {
      const t = e.target, ds = t.dataset || {};
      if (ds.k === 'lead') { ed.deps[+ds.i].lead = t.value; ed.dirty = true; rr(); return; }
      if (ds.bk) ed.bk[ds.bk] = t.value;
      if (ds.b) { ed.bulk[ds.b] = t.value; genRefresh(); }
    });
  }

  /* =====================================================================
     CSS
     ===================================================================== */
  const cssList = `
  .ad-pk { display: grid; gap: 18px; min-width: 0; }
  .ad-pk-h2 { font-size: 15px; display: flex; gap: 8px; align-items: center; }
  .ad-pk-h3 { font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); margin-bottom: 10px; }
  .ad-pk-fine { font-size: 12.5px; color: var(--mute); }
  .ad-pk-sw, .ad-pe-sw { width: 38px; height: 22px; border-radius: 99px; border: 0; padding: 0; background: #B9C3CC; position: relative; cursor: pointer; flex: none; transition: background .2s; }
  .ad-pk-sw i, .ad-pe-sw i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .25s var(--ease); }
  .ad-pk-sw[aria-checked="true"], .ad-pe-sw[aria-checked="true"] { background: var(--ok); }
  .ad-pk-sw[aria-checked="true"] i, .ad-pe-sw[aria-checked="true"] i { transform: translateX(16px); }
  .ad-pk-sw:focus-visible, .ad-pe-sw:focus-visible { outline: 2px solid var(--pri); outline-offset: 2px; }
  .ad-pk-fl { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; }

  /* B · photo catalogue */
  .ad-pk-attn { display: grid; gap: 10px; }
  .ad-pk-attl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .ad-pk-att { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 10px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; padding: 10px; align-content: start; }
  .ad-pk-att .ph { width: 54px; height: 54px; border-radius: 10px; }
  .ad-pk-att > div { display: grid; gap: 4px; justify-items: start; min-width: 0; }
  .ad-pk-att b { font-size: 13.5px; line-height: 1.25; }
  .ad-pk-att small { font-size: 12px; color: var(--mute); line-height: 1.35; }
  .ad-pk-att .a-btn { grid-column: 1 / -1; justify-self: start; }
  .ad-pk-tool { display: flex; gap: 10px 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
  .ad-pk-pills { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-pk-pills button { font: 700 13px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 999px; padding: 6px 12px; cursor: pointer; display: inline-flex; gap: 6px; transition: background .2s, border-color .2s; }
  .ad-pk-pills button span { color: var(--mute); }
  .ad-pk-pills button:hover { border-color: var(--ink); }
  .ad-pk-pills button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .ad-pk-pills button[aria-pressed="true"] span { color: var(--act); }
  .ad-pk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px; }
  .ad-pk-card { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 18px; overflow: hidden; display: grid; grid-template-rows: auto 1fr auto; transition: transform .35s var(--ease), box-shadow .35s var(--ease); }
  .ad-pk-card:hover { transform: translateY(-3px); box-shadow: 0 22px 40px -28px rgba(20,32,42,.45); }
  .ad-pk-card .ph { aspect-ratio: 16 / 10; }
  .ad-pk-card .ph img { transition: transform .6s var(--ease); }
  .ad-pk-card:hover .ph img { transform: scale(1.04); }
  .ad-pk-ov { position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; }
  .ad-pk-ov .a-chip, .ad-pk-hc { box-shadow: 0 2px 8px rgba(20,32,42,.18); }
  .ad-pk-ov .a-chip.ok { background: #fff; } .ad-pk-ov .a-chip.info { background: #fff; }
  .ad-pk-hc { position: absolute; top: 10px; right: 10px; }
  .ad-pk-hc.ok { background: #fff; }
  .ad-pk-stamp { position: absolute; left: 10px; bottom: 10px; font-size: 12px; font-weight: 800; padding: 4px 9px; border-radius: 8px; background: var(--act); color: var(--ink); }
  .ad-pk-stamp.mute { background: rgba(255,255,255,.94); color: var(--ink2); } .ad-pk-stamp.warn { background: var(--warn-soft); color: var(--warn); }
  .ad-pk-cb { padding: 14px 16px 12px; display: grid; gap: 8px; align-content: start; }
  .ad-pk-tt { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
  .ad-pk-tt h3 { font-size: 17px; letter-spacing: -.02em; }
  .ad-pk-tt > span { font-weight: 800; font-size: 15px; text-align: right; white-space: nowrap; }
  .ad-pk-tt > span small { display: block; font-size: 11px; color: var(--mute); font-weight: 700; }
  .ad-pk-meta { font-size: 12.5px; color: var(--mute); font-weight: 600; margin-top: -4px; }
  .ad-pk-st { display: grid; grid-template-columns: 1.1fr 1.2fr .9fr; gap: 10px; border-top: 1px solid var(--a-line); padding-top: 10px; }
  .ad-pk-st > div { display: grid; gap: 5px; align-content: start; min-width: 0; }
  .ad-pk-st .k { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ad-pk-st .v { font-size: 12.5px; font-weight: 700; }
  .ad-pk-st .v.big { font-size: 20px; font-weight: 800; letter-spacing: -.02em; line-height: 1; }
  .ad-pk-st .a-meter { height: 6px; }
  .ad-pk-dots { display: flex; gap: 3px; }
  .ad-pk-dots i { flex: 1; height: 6px; border-radius: 3px; background: var(--ok); }
  .ad-pk-dots i.no { background: #F3C9C4; }
  .ad-pk-why { display: flex; gap: 8px; font-size: 12.5px; font-weight: 600; border-radius: 10px; padding: 8px 10px; background: var(--bg2); color: var(--ink2); }
  .ad-pk-why .ic { width: 15px; height: 15px; margin-top: 1px; }
  .ad-pk-why.bad { background: #FDECEA; color: #B42318; } .ad-pk-why.warn { background: var(--warn-soft); color: var(--warn); } .ad-pk-why.info { background: var(--pri-soft); color: var(--pri-ink); }
  .ad-pk-qa { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 10px 16px 14px; border-top: 1px solid var(--a-line); }
  .ad-pk-qa .ad-pk-fl { margin-left: auto; }

  /* C · season planner */
  .ad-pk-ctool { display: flex; gap: 10px 18px; flex-wrap: wrap; align-items: center; }
  .ad-pk-leg { display: flex; gap: 6px 14px; flex-wrap: wrap; list-style: none; margin: 0 0 0 auto; padding: 0; font-size: 12px; font-weight: 600; color: var(--ink2); }
  .ad-pk-leg li { display: inline-flex; gap: 6px; align-items: center; }
  .ad-pk-leg i { width: 14px; height: 14px; border-radius: 4px; background: #EEF0F2; }
  .ad-pk-leg i.f3 { background: var(--ok-soft); box-shadow: inset 0 0 0 1.5px var(--ok); } .ad-pk-leg i.f2 { background: var(--pri-soft); box-shadow: inset 0 0 0 1.5px var(--pri); }
  .ad-pk-leg i.full { background: var(--ink); } .ad-pk-leg i.s { background: color-mix(in srgb, var(--act) 16%, #fff); }
  .ad-pk-insp { display: grid; grid-template-columns: 76px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, .9fr) auto; gap: 14px; align-items: center; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 12px 14px; animation: ad-in .35s var(--ease); }
  .ad-pk-insp .ph { width: 76px; height: 58px; border-radius: 10px; }
  .ad-pk-insp .t { display: grid; gap: 2px; min-width: 0; }
  .ad-pk-insp .t small { font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--warn); }
  .ad-pk-insp .t b { font-size: 16px; letter-spacing: -.02em; }
  .ad-pk-insp .t span { font-size: 12.5px; color: var(--mute); }
  .ad-pk-insp .m { display: grid; gap: 6px; font-size: 12.5px; color: var(--ink2); }
  .ad-pk-insp .a-kv { font-size: 12.5px; gap: 4px; } .ad-pk-insp .a-kv > div { font-size: 12.5px; }
  .ad-pk-insp .acts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: end; }
  .ad-pk-insp.gap { background: color-mix(in srgb, var(--act) 8%, var(--a-surf)); border-style: dashed; border-color: #E2C48E; }
  .ad-pk-insp.gap { grid-template-columns: 76px minmax(0, 1.4fr) minmax(0, 1.2fr) auto; }
  @keyframes ad-in { from { opacity: 0; transform: translateY(4px); } }
  .ad-pk-mxw { overflow-x: auto; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); }
  .ad-pk-mx { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 920px; table-layout: fixed; font-size: 12.5px; }
  .ad-pk-mx col.n { width: 214px; }
  .ad-pk-mx th, .ad-pk-mx td { border-bottom: 1px solid var(--a-line); padding: 5px 4px; vertical-align: middle; }
  .ad-pk-mx thead th { font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); text-align: left; padding: 10px 6px 8px; }
  .ad-pk-mx thead th small { display: block; font-size: 10.5px; color: var(--mute); letter-spacing: .02em; }
  .ad-pk-mx th.n { position: sticky; left: 0; z-index: 2; background: var(--a-surf); border-right: 1px solid var(--a-line); padding-left: 14px; text-align: left; }
  .ad-pk-mx td.s { background: color-mix(in srgb, var(--act) 9%, transparent); }
  .ad-pk-mx tr.grp th { background: var(--bg2); text-align: left; padding: 7px 14px; font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .ad-pk-mx tr.grp th span { position: sticky; left: 14px; } .ad-pk-mx tr.grp th small { margin-left: 10px; font-weight: 700; letter-spacing: .02em; text-transform: none; color: var(--mute); }
  .ad-pk-rn { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .ad-pk-rn .ph { width: 34px; height: 34px; border-radius: 8px; flex: none; }
  .ad-pk-rn > span:last-child { display: grid; min-width: 0; }
  .ad-pk-rn b { font-size: 12.5px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ad-pk-rn small { font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .ad-pk-dc, .ad-pk-gap { width: 100%; display: grid; justify-items: start; gap: 0; border: 0; border-radius: 8px; padding: 4px 7px; font: inherit; cursor: pointer; text-align: left; background: #EEF0F2; color: var(--ink); transition: transform .2s var(--ease), box-shadow .2s; }
  .ad-pk-dc + .ad-pk-dc { margin-top: 3px; }
  .ad-pk-dc b { font-size: 13px; line-height: 1.2; } .ad-pk-dc small { font-size: 11px; font-weight: 700; }
  .ad-pk-dc.f3 { background: var(--ok-soft); color: var(--ok); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ok) 55%, transparent); }
  .ad-pk-dc.f2 { background: var(--pri-soft); color: var(--pri-ink); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--pri) 45%, transparent); }
  .ad-pk-dc.full { background: var(--ink); color: #fff; }
  .ad-pk-dc:hover, .ad-pk-gap:hover { transform: translateY(-1px); }
  .ad-pk-dc[aria-pressed="true"], .ad-pk-gap[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--a-surf), 0 0 0 4px var(--pri); }
  .ad-pk-gap { background: transparent; border: 1.5px dashed #C9A96A; color: var(--warn); grid-auto-flow: column; justify-content: start; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 800; padding: 6px; }
  .ad-pk-gap .ic { width: 13px; height: 13px; }
  .ad-pk-c.no-gaps .ad-pk-gap { display: none; }
  .ad-pk-mx tfoot th, .ad-pk-mx tfoot td { border-bottom: 0; border-top: 2px solid var(--ink); background: var(--bg2); padding: 8px 6px; }
  .ad-pk-mx tfoot th.n { background: var(--bg2); font-size: 12px; }
  .ad-pk-mx tfoot td b { display: block; font-size: 14px; } .ad-pk-mx tfoot td small { font-size: 10.5px; color: var(--mute); font-weight: 700; }

  /* D · performance board */
  .ad-pk-ins { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .ad-pk-ins article { display: grid; gap: 5px; justify-items: start; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; padding: 12px 14px; }
  .ad-pk-ins b { font-size: 15px; letter-spacing: -.02em; } .ad-pk-ins small { font-size: 12.5px; color: var(--ink2); line-height: 1.4; }
  .ad-pk-perf th button { font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; background: none; border: 0; padding: 0; cursor: pointer; display: inline-flex; gap: 4px; }
  .ad-pk-perf th[aria-sort="ascending"] button, .ad-pk-perf th[aria-sort="descending"] button { color: var(--pri); }
  .ad-pk-pn { display: flex; gap: 10px; align-items: center; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
  .ad-pk-pn .ph { width: 40px; height: 40px; border-radius: 9px; flex: none; }
  .ad-pk-pn .t { display: grid; } .ad-pk-pn b { font-size: 13.5px; } .ad-pk-pn small { font-size: 12px; color: var(--mute); }
  .ad-pk-pn .ic { width: 15px; height: 15px; color: var(--mute); transition: transform .25s var(--ease); }
  .ad-pk-pn[aria-expanded="true"] .ic { transform: rotate(180deg); }
  .ad-pk-perf tr.open { background: var(--pri-soft); }
  .ad-pk-vw { display: inline-flex; gap: 10px; align-items: center; justify-content: end; }
  .ad-pk-spark { width: 72px; height: 24px; overflow: visible; }
  .ad-pk-spark polyline { fill: none; stroke: var(--pri); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
  .ad-pk-spark circle { fill: var(--pri); }
  .ad-pk-cv { display: inline-grid; justify-items: end; } .ad-pk-cv small { font-size: 11px; font-weight: 700; } .ad-pk-cv small.up { color: var(--ok); } .ad-pk-cv small.dn { color: var(--warn); }
  .ad-pk-na { color: var(--mute); font-weight: 600; }
  .ad-pk-fillc { display: grid; gap: 4px; min-width: 120px; } .ad-pk-fillc small { font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .ad-pk-more > td { background: color-mix(in srgb, var(--pri) 3%, var(--a-surf)); padding-top: 16px !important; padding-bottom: 18px !important; }
  .ad-pk-mg { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; animation: ad-in .35s var(--ease); }
  .ad-pk-fun { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 8px; }
  .ad-pk-fun li { display: grid; grid-template-columns: 116px minmax(0, 1fr) 54px; gap: 2px 10px; align-items: center; font-size: 13px; }
  .ad-pk-fun .bar { height: 10px; border-radius: 99px; background: #E6EBEF; overflow: hidden; }
  .ad-pk-fun .bar i { display: block; height: 100%; width: var(--v); background: var(--pri); border-radius: inherit; transform-origin: left; animation: ad-grow .6s var(--ease); }
  @keyframes ad-grow { from { transform: scaleX(0); } }
  .ad-pk-fun b { text-align: right; } .ad-pk-fun small { grid-column: 2 / -1; font-size: 11.5px; color: var(--mute); }
  .ad-pk-sig { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 13px; }
  .ad-pk-sig li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .ad-pk-acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }

  @media (prefers-reduced-motion: reduce) {
    .ad-pk *, .ad-pk *::before, .ad-pk *::after { animation: none !important; transition: none !important; }
  }
  @container site (max-width: 700px) {
    .ad-pk-attl { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 84%; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; }
    .ad-pk-att { scroll-snap-align: start; }
    .ad-pk-tool .a-bar { width: 100%; } .ad-pk-tool .a-search { max-width: none; min-width: 0; }
    .ad-pk-pills { flex-wrap: nowrap; overflow-x: auto; width: 100%; padding-bottom: 2px; } .ad-pk-pills button { white-space: nowrap; }
    .ad-pk-grid { grid-template-columns: minmax(0, 1fr); }
    .ad-pk-ctool .a-seg { overflow-x: auto; max-width: 100%; } .ad-pk-ctool .a-seg button { white-space: nowrap; }
    .ad-pk-leg { margin: 0; }
    .ad-pk-insp, .ad-pk-insp.gap { grid-template-columns: 64px minmax(0, 1fr); }
    .ad-pk-insp .ph { width: 64px; height: 52px; }
    .ad-pk-insp .m, .ad-pk-insp .a-kv, .ad-pk-insp .acts { grid-column: 1 / -1; justify-content: start; }
    .ad-pk-mx { min-width: 760px; } .ad-pk-mx col.n { width: 132px; }
    .ad-pk-rn .ph { display: none; } .ad-pk-rn b { white-space: normal; }
    .ad-pk-ins { grid-template-columns: minmax(0, 1fr); }
    .ad-pk-d .a-head .acts { margin-left: 0; }
    .ad-pk-perf thead { display: none; }
    .ad-pk-perf, .ad-pk-perf tbody { display: block; }
    .ad-pk-perf tbody tr { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; padding: 12px 14px; border-bottom: 1px solid var(--a-line); }
    .ad-pk-perf tbody td { border: 0; padding: 0 !important; text-align: left !important; }
    .ad-pk-perf tbody td[data-l]::before { content: attr(data-l); display: block; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); margin-bottom: 2px; }
    .ad-pk-perf tbody td[data-l="Package"] { grid-column: 1 / -1; } .ad-pk-perf tbody td[data-l="Package"]::before { display: none; }
    .ad-pk-perf tbody td[data-l="Upcoming seats sold"] { grid-column: 1 / -1; }
    .ad-pk-vw, .ad-pk-cv { justify-content: start; justify-items: start; }
    .ad-pk-perf tr.ad-pk-more { display: block; } .ad-pk-perf tr.ad-pk-more > td { display: block; padding: 14px !important; }
    .ad-pk-mg { grid-template-columns: minmax(0, 1fr); gap: 18px; }
    .ad-pk-fun li { grid-template-columns: 100px minmax(0, 1fr) 44px; }
  }`;

  const cssEd = `
  .ad-pe { display: grid; gap: 16px; min-width: 0; position: relative; }
  .ad-pe-v25 { font-size: 10.5px !important; padding: 1px 7px !important; vertical-align: 2px; }
  .ad-pe-nw { font-style: normal; font-size: 10px; font-weight: 800; letter-spacing: .04em; color: var(--pri); background: var(--pri-soft); border-radius: 99px; padding: 1px 6px; }
  .ad-pe-top { display: flex; gap: 8px 14px; align-items: center; flex-wrap: wrap; position: relative; z-index: 8; padding-bottom: 12px; border-bottom: 1px solid var(--a-line); }
  .ad-pe-back { display: inline-flex; gap: 4px; align-items: center; font-size: 13px; font-weight: 700; color: var(--mute); text-decoration: none; flex-basis: 100%; }
  .ad-pe-back .ic { width: 15px; height: 15px; } .ad-pe-back:hover { color: var(--ink); }
  .ad-pe-tt { display: flex; gap: 8px 10px; align-items: center; flex-wrap: wrap; min-width: 0; flex: 1 1 360px; }
  .ad-pe-tt h1 { font-size: 24px; letter-spacing: -.03em; }
  .ad-pe-sv { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-left: auto; }
  .ad-pe-chk { display: inline-flex; gap: 5px; align-items: center; font: 800 12px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ok); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
  .ad-pe-chk .ic { width: 13px; height: 13px; }
  .ad-pe-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 9; width: min(380px, 100%); background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; padding: 12px; display: grid; gap: 10px; justify-items: start; box-shadow: 0 24px 50px -24px rgba(20,32,42,.4); animation: ad-in .25s var(--ease); }
  .ad-pe-dock { position: sticky; bottom: 14px; z-index: 9; justify-self: end; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; background: color-mix(in srgb, var(--a-surf) 94%, transparent); backdrop-filter: blur(8px); border: 1px solid var(--a-line); border-radius: 14px; padding: 8px 10px 8px 12px; box-shadow: 0 16px 36px -18px rgba(20,32,42,.5); animation: ad-in .3s var(--ease); }
  .adm .main:has(.ad-pe-c) { overflow-x: clip; }
  .ad-pe-guard { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: var(--warn-soft); color: var(--ink); border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent); border-radius: 12px; padding: 10px 12px; font-size: 13.5px; }
  .ad-pe-guard > .ic { color: var(--warn); width: 18px; height: 18px; } .ad-pe-guard .acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-pe-rules { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; width: 100%; }
  .ad-pe-rules li { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: start; font-size: 13px; }
  .ad-pe-rules li > .ic { width: 20px; height: 20px; padding: 3px; border-radius: 50%; background: var(--ok); color: #fff; }
  .ad-pe-rules li.no > .ic { background: #FDECEA; color: #B42318; }
  .ad-pe-rules b { display: block; } .ad-pe-rules small { color: var(--mute); font-size: 12px; }
  .ad-pe-rules em { font-style: normal; font-size: 11.5px; font-weight: 800; color: var(--ok); } .ad-pe-rules li.no em { color: #B42318; }
  .ad-pe-in { font: 500 13.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 8px; padding: 7px 9px; background: var(--a-surf); color: var(--ink); width: 100%; min-width: 0; }
  .ad-pe-in.w-s { width: 64px; }
  .ad-pe-in:focus { outline: 2px solid var(--pri); outline-offset: 0; border-color: transparent; }
  textarea.ad-pe-in { resize: vertical; }
  .ad-pe-rs { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--a-line); border-radius: 8px; background: var(--a-surf); padding: 0 8px; font-weight: 700; color: var(--mute); font-size: 13px; }
  .ad-pe-rs input { border: 0; outline: 0; background: transparent; font: 600 13.5px "DM Sans", sans-serif; color: var(--ink); width: 70px; padding: 7px 0 7px 2px; font-variant-numeric: tabular-nums; }
  .ad-pe-rs:focus-within { outline: 2px solid var(--pri); border-color: transparent; }
  .ad-pe-ro { background: var(--bg2) !important; color: var(--mute) !important; }
  .ad-pe-lbl { font-size: 12.5px; font-weight: 700; display: inline-flex; gap: 6px; align-items: center; }
  .ad-pe-h4 { font-size: 13px; font-weight: 800; margin-top: 4px; display: flex; gap: 6px; align-items: center; }
  .ad-pe-fine { font-size: 12.5px; color: var(--mute); }
  .ad-pe-fine a { color: var(--pri); font-weight: 700; }
  .ad-pe-notice { font-size: 13px; font-weight: 600; border-radius: 10px; padding: 8px 10px; background: var(--ok-soft); color: var(--ok); }
  .ad-pe-notice.warn { background: var(--warn-soft); color: var(--warn); }
  .ad-pe-pills { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-pe-pills button { font: 700 12.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 999px; padding: 5px 11px; cursor: pointer; transition: background .2s, color .2s; }
  .ad-pe-pills button[aria-pressed="true"] { background: var(--pri-soft); border-color: var(--pri); color: var(--pri-ink); }
  .ad-pe-pills.sm button { padding: 4px 9px; font-size: 12px; }
  .ad-pe-swrow { display: flex; gap: 12px; align-items: flex-start; } .ad-pe-swrow b { display: block; font-size: 13.5px; } .ad-pe-swrow small { font-size: 12.5px; color: var(--mute); }
  .ad-pe-fl { display: inline-flex; gap: 8px; align-items: center; margin-left: auto; font-size: 12px; font-weight: 700; }
  .ad-pe-lead { display: inline-flex; gap: 8px; align-items: center; } .ad-pe-lead select { min-width: 0; }
  .ad-pe-lead b { display: block; font-size: 13.5px; } .ad-pe-lead small { display: block; font-size: 11.5px; color: var(--mute); }
  .ad-pe-lead.sm { font-size: 12.5px; font-weight: 700; }
  .ad-pe-checks { display: grid; gap: 6px; }
  .ad-pe-checks label { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; font-weight: 600; }
  .ad-pe-checks input { width: 16px; height: 16px; margin-top: 2px; accent-color: var(--pri); }
  .ad-pe-checks small { display: block; font-size: 12px; color: var(--mute); font-weight: 500; }
  .ad-pe-adds { display: grid; gap: 8px; }
  .ad-pe-add { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; border: 1px solid var(--a-line); border-radius: 12px; padding: 9px 12px; transition: opacity .2s; }
  .ad-pe-add.off { opacity: .6; background: var(--bg2); }
  .ad-pe-add .t { display: grid; min-width: 0; } .ad-pe-add b { font-size: 13.5px; } .ad-pe-add .t small { font-size: 12px; color: var(--mute); }
  .ad-pe-add .p { text-align: right; font-weight: 800; font-size: 14px; } .ad-pe-add .p small { display: block; font-size: 11px; color: var(--mute); font-weight: 600; }
  .ad-pe-add .s { display: grid; justify-items: center; gap: 2px; } .ad-pe-add .s small { font-size: 11px; font-weight: 800; }
  .ad-pe-gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
  .ad-pe-gal figure { margin: 0; display: grid; gap: 6px; }
  .ad-pe-gal .ph { aspect-ratio: 4 / 3; border-radius: 10px; }
  .ad-pe-gal figure small { font-size: 11.5px; color: var(--mute); font-weight: 700; }
  .ad-pe-gal .cov { position: absolute; left: 6px; top: 6px; background: var(--act); color: var(--ink); font-size: 11px; font-weight: 800; border-radius: 6px; padding: 2px 7px; }
  .ad-pe-up { display: grid; place-items: center; align-content: center; gap: 2px; min-height: 120px; border: 1.5px dashed #C4CFDE; border-radius: 10px; background: var(--bg2); color: var(--ink2); cursor: pointer; font: inherit; text-align: center; padding: 8px; }
  .ad-pe-up small { font-size: 11.5px; color: var(--mute); }
  .ad-pe-days, .ad-pe-faq { display: grid; gap: 6px; }
  .ad-pe-days details, .ad-pe-faq details { border: 1px solid var(--a-line); border-radius: 10px; background: var(--a-surf); }
  .ad-pe-days summary, .ad-pe-faq summary { display: flex; gap: 8px; align-items: center; padding: 8px 10px; cursor: pointer; list-style: none; font-size: 13px; }
  .ad-pe-days summary::-webkit-details-marker, .ad-pe-faq summary::-webkit-details-marker { display: none; }
  .ad-pe-days summary b, .ad-pe-faq summary b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ad-pe-days summary .ic, .ad-pe-faq summary .ic { width: 15px; height: 15px; color: var(--mute); transition: transform .25s var(--ease); }
  .ad-pe-days details[open] summary .ic, .ad-pe-faq details[open] summary .ic { transform: rotate(180deg); }
  .ad-pe-days .n { font-size: 11px; font-weight: 800; background: var(--ink); color: #fff; border-radius: 6px; padding: 1px 6px; }
  .ad-pe-days .b, .ad-pe-faq .b { padding: 0 10px 10px; display: grid; gap: 8px; }
  .ad-pe-hotels { display: grid; gap: 8px; } .ad-pe-hotels > div { display: grid; grid-template-columns: 1.6fr 1fr 70px 70px; gap: 8px; }
  .ad-pe-danger { display: flex; gap: 12px; align-items: center; justify-content: space-between; border: 1px solid var(--a-line); border-radius: 12px; padding: 10px 12px; }
  .ad-pe-danger b { display: block; font-size: 13.5px; } .ad-pe-danger small { font-size: 12.5px; color: var(--mute); }
  .ad-pe-mini { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ad-pe-mini th { text-align: left; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); padding: 0 6px 6px 0; }
  .ad-pe-mini td { padding: 6px 6px 6px 0; border-top: 1px solid var(--a-line); vertical-align: middle; }
  .ad-pe-mini td b { display: block; } .ad-pe-mini td small { font-size: 11.5px; color: var(--mute); }
  .ad-pe-tiers { display: grid; gap: 8px; }
  .ad-pe-tiers > div { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--ink2); }
  .ad-pe-tiers .n { font-size: 11px; font-weight: 800; background: var(--act); color: var(--ink); border-radius: 6px; padding: 2px 7px; }

  /* B · live preview */
  .ad-pe-pane { display: none; }
  .ad-pe-bgrid { display: grid; grid-template-columns: minmax(0, 420px) minmax(0, 1fr); gap: 18px; align-items: start; }
  .ad-pe-form { display: grid; gap: 8px; }
  .ad-pe-grp { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; transition: box-shadow .25s; }
  .ad-pe-grp.on { box-shadow: 0 0 0 2px var(--pri), 0 18px 36px -26px rgba(27,79,216,.45); border-color: transparent; }
  .ad-pe-gh { width: 100%; display: flex; gap: 10px; align-items: center; justify-content: space-between; background: none; border: 0; padding: 11px 14px; cursor: pointer; font: inherit; color: inherit; text-align: left; }
  .ad-pe-gh b { display: flex; gap: 6px; align-items: center; font-size: 14px; } .ad-pe-gh small { display: block; font-size: 12px; color: var(--mute); font-weight: 600; margin-top: 1px; }
  .ad-pe-gh > .ic { width: 16px; height: 16px; color: var(--mute); transition: transform .25s var(--ease); flex: none; }
  .ad-pe-gh[aria-expanded="true"] > .ic { transform: rotate(180deg); }
  .ad-pe-gb { padding: 2px 14px 14px; display: grid; gap: 12px; animation: ad-in .3s var(--ease); }
  .ad-pe-prev { position: sticky; top: 160px; display: grid; gap: 8px; min-width: 0; }
  .ad-pe-ptool { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .ad-pe-ptool small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .ad-pe-pv { border: 1px solid var(--a-line); border-radius: 16px; background: #fff; overflow: hidden; box-shadow: 0 30px 60px -44px rgba(20,32,42,.5); }
  .ad-pe-pvbar { display: flex; gap: 10px; align-items: center; padding: 8px 12px; background: var(--bg2); border-bottom: 1px solid var(--a-line); font-size: 12px; min-width: 0; }
  .ad-pe-pvbar .dots { display: flex; gap: 5px; } .ad-pe-pvbar .dots i { width: 9px; height: 9px; border-radius: 50%; background: #C9D2DA; }
  .ad-pe-pvbar .url { flex: 1; min-width: 0; background: #fff; border: 1px solid var(--a-line); border-radius: 8px; padding: 3px 10px; color: var(--mute); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ad-pe-pvs { max-height: max(420px, calc(100vh - 250px)); overflow: auto; overscroll-behavior: contain; background: #fff; }
  .ad-pe-pv [data-g] { cursor: pointer; border-radius: 10px; transition: box-shadow .25s, background .25s; }
  .ad-pe-pv [data-g]:hover, .ad-pe-pv [data-g].peek { box-shadow: 0 0 0 2px color-mix(in srgb, var(--pri) 45%, transparent); }
  .ad-pe-pv [data-g].hl { box-shadow: 0 0 0 2px var(--pri); background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .ad-pe-page, .ad-pe-card, .ad-pe-pack { display: none; }
  .ad-pe-pv[data-mode="page"] .ad-pe-page, .ad-pe-pv[data-mode="phone"] .ad-pe-page, .ad-pe-pv[data-mode="card"] .ad-pe-card, .ad-pe-pv[data-mode="pack"] .ad-pe-pack { display: grid; }
  .ad-pe-page { width: 880px; zoom: .64; padding: 20px 24px 30px; gap: 18px; color: var(--ink); container: pvp / inline-size; }
  .ad-pe-pv[data-mode="phone"] .ad-pe-pvs { background: var(--bg2); padding: 16px 0; }
  .ad-pe-pv[data-mode="phone"] .ad-pe-page { width: 340px; zoom: .92; margin: 0 auto; background: #fff; border-radius: 26px; border: 6px solid var(--ink); padding: 12px 12px 20px; }
  .ad-pe-page .gal { display: grid; grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; gap: 6px; height: 300px; padding: 0; }
  .ad-pe-page .gal .ph { border-radius: 12px; } .ad-pe-page .gal .ph:first-child { grid-row: 1 / 3; }
  .ad-pe-page .hd { display: grid; gap: 6px; padding: 6px; }
  .ad-pe-page .crumb, .ad-pe-pack .crumb { font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .ad-pe-page h2 { font-size: 38px; letter-spacing: -.035em; }
  .ad-pe-page .sub { color: var(--mute); font-weight: 600; font-size: 14px; display: flex; gap: 4px; align-items: center; }
  .ad-pe-pv .star svg { width: 14px; height: 14px; color: var(--star); vertical-align: -2px; }
  .ad-pe-page .lede { font-size: 17px; color: var(--ink2); max-width: 60ch; }
  .ad-pe-page .cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 28px; align-items: start; }
  .ad-pe-page .l { display: grid; gap: 22px; } .ad-pe-page .l section { padding: 6px; display: grid; gap: 10px; }
  .ad-pe-page h3 { font-size: 20px; letter-spacing: -.02em; }
  .ad-pe-page ul, .ad-pe-page ol, .ad-pe-pack ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .ad-pe-page .hl li, .ad-pe-page .inc li { display: flex; gap: 8px; font-size: 15px; } .ad-pe-page .hl .ic, .ad-pe-page .inc .ic { color: var(--ok); margin-top: 3px; }
  .ad-pe-page .hl li.empty { color: var(--mute); }
  .ad-pe-page .days li { display: grid; grid-template-columns: 62px minmax(0, 1fr); gap: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  .ad-pe-page .days .n { font-size: 12px; font-weight: 800; color: var(--pri); padding-top: 3px; } .ad-pe-page .days b { display: block; font-size: 16px; } .ad-pe-page .days small { font-size: 13px; color: var(--mute); }
  .ad-pe-page .stays li { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; } .ad-pe-page .stays b { display: block; } .ad-pe-page .stays small { color: var(--mute); font-size: 13px; }
  .ad-pe-page .more { font-size: 13px; color: var(--pri); font-weight: 700; }
  .ad-pe-page .r { border: 1px solid var(--line); border-radius: 18px; padding: 16px; display: grid; gap: 12px; box-shadow: 0 30px 60px -40px rgba(20,32,42,.35); }
  .ad-pe-pv .pr { display: grid; gap: 4px; justify-items: start; }
  .ad-pe-pv .from { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } .ad-pe-pv .from small { font-size: 12px; color: var(--mute); font-weight: 700; }
  .ad-pe-pv .from s { color: var(--mute); font-weight: 600; } .ad-pe-pv .from b { font-size: 28px; letter-spacing: -.03em; }
  .ad-pe-pv .pp { font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .ad-pe-pv .tag { background: var(--warn-soft); color: var(--warn); font-size: 12px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
  .ad-pe-pv .adm-note { font-size: 12px; font-weight: 700; color: #B42318; background: #FDECEA; border: 1px dashed #F3C9C4; border-radius: 8px; padding: 6px 8px; }
  .ad-pe-page .deps { display: grid; gap: 6px; }
  .ad-pe-page .dep { display: flex; justify-content: space-between; gap: 10px; border: 1.5px solid var(--line); border-radius: 12px; padding: 8px 10px; }
  .ad-pe-page .dep b { display: block; font-size: 14px; } .ad-pe-page .dep small { display: flex; gap: 5px; align-items: center; font-size: 12px; color: var(--mute); font-weight: 600; }
  .ad-pe-page .dep .p { font-weight: 800; text-align: right; } .ad-pe-page .dep .p small { justify-content: end; color: var(--ok); }
  .ad-pe-page .dp { font-size: 13px; color: var(--ink2); font-weight: 600; padding: 4px 6px; }
  .ad-pe-page .bk { background: var(--act); color: var(--ink); font-weight: 800; border-radius: 12px; padding: 12px; text-align: center; }
  .ad-pe-page .ld { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--mute); } .ad-pe-page .ld b { display: block; color: var(--ink); }
  @container pvp (max-width: 520px) {
    .ad-pe-page .gal { height: 200px; grid-template-columns: 1fr; } .ad-pe-page .gal .ph:not(:first-child) { display: none; }
    .ad-pe-page h2 { font-size: 28px; } .ad-pe-page .cols { grid-template-columns: minmax(0, 1fr); }
    .ad-pe-page .r { order: -1; }
  }
  .ad-pe-card { width: 300px; margin: 24px auto; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fff; box-shadow: 0 30px 60px -40px rgba(20,32,42,.4); }
  .ad-pe-card .ph { aspect-ratio: 4 / 3; border-radius: 0; }
  .ad-pe-card .stamp { position: absolute; left: 10px; top: 10px; background: var(--act); color: var(--ink); font-size: 12px; font-weight: 800; padding: 4px 9px; border-radius: 8px; }
  .ad-pe-card .b { padding: 12px 14px 14px; display: grid; gap: 4px; justify-items: start; }
  .ad-pe-card .b > small { font-size: 12px; color: var(--mute); font-weight: 700; } .ad-pe-card .b > b { font-size: 17px; letter-spacing: -.02em; }
  .ad-pe-card .rt { font-size: 12.5px; color: var(--mute); font-weight: 600; } .ad-pe-card .eb { font-size: 11.5px; font-weight: 800; color: var(--pri-ink); background: var(--pri-soft); border-radius: 6px; padding: 2px 7px; }
  .ad-pe-card .from b { font-size: 22px; }
  .ad-pe-pack { padding: 20px 22px 26px; gap: 12px; color: var(--ink); }
  .ad-pe-pack h2 { font-size: 22px; letter-spacing: -.03em; } .ad-pe-pack h3 { font-size: 15px; margin-top: 6px; }
  .ad-pe-pack dl { margin: 0; display: grid; gap: 8px; border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
  .ad-pe-pack dl div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px; font-size: 13.5px; } .ad-pe-pack dt { color: var(--mute); font-weight: 700; } .ad-pe-pack dd { margin: 0; font-weight: 700; }
  .ad-pe-pack .kb li { position: relative; padding-left: 16px; font-size: 13.5px; color: var(--ink2); }
  .ad-pe-pack .kb li::before { content: ""; position: absolute; left: 2px; top: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--act); }

  /* C · itinerary builder */
  .ad-pe-route { display: flex; align-items: center; gap: 0; flex-wrap: wrap; row-gap: 10px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 12px 14px; }
  .ad-pe-route .stop { display: flex; gap: 8px; align-items: center; font-size: 13px; min-width: 0; }
  .ad-pe-route .stop .ph { width: 38px; height: 38px; border-radius: 50%; box-shadow: 0 0 0 2px var(--a-surf), 0 0 0 4px var(--pri-soft); flex: none; }
  .ad-pe-route .stop.end > .ic { width: 30px; height: 30px; padding: 6px; border-radius: 50%; background: var(--bg2); color: var(--pri); }
  .ad-pe-route .stop b { display: block; font-size: 13.5px; } .ad-pe-route .stop small { font-size: 11.5px; color: var(--mute); font-weight: 600; white-space: nowrap; }
  .ad-pe-route .leg { flex: 1 1 18px; min-width: 18px; max-width: 70px; height: 2px; margin: 0 8px; background: repeating-linear-gradient(90deg, var(--pri) 0 6px, transparent 6px 10px); }
  .ad-pe-money { margin-left: auto; display: flex; gap: 10px; align-items: center; border: 1px solid var(--a-line); background: var(--bg2); border-radius: 12px; padding: 8px 12px; cursor: pointer; font: inherit; color: inherit; text-align: left; transition: border-color .2s, transform .2s var(--ease); }
  .ad-pe-money:hover { border-color: var(--pri); transform: translateY(-1px); }
  .ad-pe-money > .ic:first-child { width: 28px; height: 28px; padding: 5px; border-radius: 8px; background: var(--act); color: var(--ink); }
  .ad-pe-money b { display: block; font-size: 13.5px; } .ad-pe-money small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .ad-pe-story { list-style: none; margin: 0; padding: 2px 2px 6px; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(150px, 1fr); gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; }
  .ad-pe-sb { display: grid; gap: 6px; scroll-snap-align: start; min-width: 0; }
  .ad-pe-sbc { display: grid; gap: 4px; align-content: start; text-align: left; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; padding: 8px 8px 10px; cursor: pointer; font: inherit; color: inherit; height: 100%; transition: transform .25s var(--ease), box-shadow .25s; }
  .ad-pe-sbc:hover { transform: translateY(-2px); box-shadow: 0 16px 30px -22px rgba(20,32,42,.4); }
  .ad-pe-sbc[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--pri), 0 16px 30px -22px rgba(27,79,216,.5); border-color: transparent; }
  .ad-pe-sbc .ph, .ad-pe-sbc .ad-pe-noph { aspect-ratio: 4 / 3; border-radius: 10px; margin-bottom: 4px; }
  .ad-pe-sbc .n { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--pri); }
  .ad-pe-sbc b { font-size: 13.5px; line-height: 1.25; }
  .ad-pe-sbc small { display: flex; gap: 5px; align-items: center; font-size: 12px; color: var(--mute); font-weight: 600; min-width: 0; }
  .ad-pe-sbc small .ic { width: 13px; height: 13px; }
  .ad-pe-sbc .ml { display: flex; gap: 3px; margin-top: 2px; }
  .ad-pe-sbc .ml i { font-style: normal; font-size: 10.5px; font-weight: 800; width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; background: var(--bg2); color: #9AA6B1; }
  .ad-pe-sbc .ml i.on { background: var(--ok-soft); color: var(--ok); }
  .ad-pe-noph { display: grid; place-items: center; align-content: center; gap: 4px; background: var(--bg2); border: 1.5px dashed #C4CFDE; color: var(--mute); font-size: 12px; font-weight: 700; text-align: center; padding: 8px; }
  .ad-pe-noph .ic { width: 20px; height: 20px; }
  .ad-pe-sb .mv { display: flex; gap: 4px; justify-content: center; }
  .ad-pe-sb .mv button { width: 30px; height: 26px; border-radius: 8px; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink2); cursor: pointer; display: grid; place-items: center; }
  .ad-pe-sb .mv button .ic { width: 14px; height: 14px; } .ad-pe-sb .mv button:disabled { opacity: .35; cursor: default; }
  .ad-pe-sb.add .ad-pe-sbc { place-items: center; align-content: center; border-style: dashed; background: var(--bg2); color: var(--pri); min-height: 200px; text-align: center; }
  .ad-pe-sb.add .ad-pe-sbc > .ic { width: 26px; height: 26px; }
  .ad-pe-cgrid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
  .ad-pe-de .a-card-h h2 { font-size: 18px; }
  .ad-pe-deg { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 18px; }
  .ad-pe-deg .pcol { display: grid; gap: 8px; align-content: start; }
  .ad-pe-deg .ph.big, .ad-pe-noph.big { aspect-ratio: 4 / 3; border-radius: 14px; }
  .ad-pe-noph.big b { font-size: 14px; color: var(--ink2); } .ad-pe-noph.big small { font-weight: 500; }
  .ad-pe-deg .fcol { display: grid; gap: 12px; align-content: start; }
  .ad-pe-pick { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .ad-pe-pick button { aspect-ratio: 1; border-radius: 8px; border: 0; padding: 0; cursor: pointer; }
  .ad-pe-pick button[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--a-surf), 0 0 0 4px var(--pri); }
  .ad-pe-pick .up { display: grid; place-items: center; background: var(--bg2); border: 1.5px dashed #C4CFDE; color: var(--mute); }
  .ad-pe-rail { display: grid; gap: 12px; }
  .ad-pe-rail .a-card-h h2 { font-size: 14.5px; } .ad-pe-rail .a-card-b { display: grid; gap: 8px; justify-items: start; }
  .ad-pe-big { font-size: 15px; } .ad-pe-big b { font-size: 22px; letter-spacing: -.03em; }
  .ad-pe-stays { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; width: 100%; }
  .ad-pe-stays li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 13px; }
  .ad-pe-stays .ic { width: 16px; height: 16px; color: var(--mute); } .ad-pe-stays b { display: block; } .ad-pe-stays small { font-size: 11.5px; color: var(--mute); }
  .ad-pe-stays em { font-style: normal; font-weight: 800; font-size: 12.5px; }
  .ad-pe-rail .a-kv { width: 100%; }
  .ad-pe-around { gap: 2px !important; padding-top: 6px !important; }
  .ad-pe-around button { width: 100%; display: flex; justify-content: space-between; gap: 8px; align-items: center; background: none; border: 0; border-top: 1px solid var(--a-line); padding: 9px 0; cursor: pointer; font: inherit; color: inherit; text-align: left; }
  .ad-pe-around button:first-child { border-top: 0; }
  .ad-pe-around b { display: flex; gap: 6px; align-items: center; font-size: 13.5px; } .ad-pe-around small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .ad-pe-around .ic { width: 15px; height: 15px; color: var(--mute); flex: none; }
  .ad-pe-around button:hover b { color: var(--pri); }
  .ad-pe-scrim { position: absolute; inset: -22px -28px -44px; background: rgba(15,25,35,.32); z-index: 10; animation: ad-fade .25s; }
  @keyframes ad-fade { from { opacity: 0; } }
  .ad-pe-drawer { position: absolute; top: -22px; right: -28px; bottom: -44px; width: min(500px, 100%); z-index: 11; background: var(--a-surf); border-left: 1px solid var(--a-line); box-shadow: -30px 0 60px -30px rgba(0,0,0,.35);
    transform: translateX(105%); visibility: hidden; transition: transform .4s var(--ease), visibility 0s .4s; }
  .ad-pe-c.drawer-on .ad-pe-drawer { transform: none; visibility: visible; transition: transform .4s var(--ease), visibility 0s; }
  .ad-pe-drawer .in { position: sticky; top: 150px; max-height: calc(100vh - 160px); overflow: auto; display: grid; gap: 12px; padding: 16px 18px 24px; align-content: start; }
  .ad-pe-drawer .h { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .ad-pe-drawer .h h2 { font-size: 18px; }
  .ad-pe-drawer .b { display: grid; gap: 12px; }
  .ad-pe-dcards { display: grid; gap: 10px; }
  .ad-pe-dcard { border: 1px solid var(--a-line); border-radius: 12px; padding: 10px 12px; display: grid; gap: 6px; }
  .ad-pe-dcard .h { display: flex; justify-content: space-between; gap: 8px; align-items: center; } .ad-pe-dcard > small { font-size: 12px; color: var(--mute); }
  .ad-pe-dcard .g { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; }
  .ad-pe-dcard .g label { display: grid; gap: 2px; font-size: 11.5px; font-weight: 700; color: var(--mute); }
  .ad-pe-dcard .ad-pe-rs input { width: 100%; }
  .ad-pe-dcard .ad-pe-lead small { color: var(--warn); font-weight: 700; }

  /* D · departures desk */
  .ad-pe-link { display: inline-flex; gap: 5px; align-items: center; font-size: 12.5px; font-weight: 700; color: var(--pri); text-decoration: none; }
  .ad-pe-link .ic { width: 14px; height: 14px; }
  .ad-pe-months { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px; }
  .ad-pe-months .mo { display: grid; gap: 4px; align-content: start; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 12px; padding: 7px 6px 8px; min-height: 104px; min-width: 0; }
  .ad-pe-months .mo.s { background: color-mix(in srgb, var(--act) 9%, var(--a-surf)); border-color: #EBD7B0; }
  .ad-pe-months .lb { font-size: 12.5px; white-space: nowrap; } .ad-pe-months .lb small { display: block; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); }
  .ad-pe-months .mo.s .lb small { color: var(--warn); }
  .ad-pe-months .dc { display: grid; justify-items: start; border: 0; border-radius: 8px; padding: 4px 6px; background: #EEF0F2; color: var(--ink); font: inherit; cursor: pointer; text-align: left; min-width: 0; transition: transform .2s var(--ease); }
  .ad-pe-months .dc b { font-size: 12px; white-space: nowrap; } .ad-pe-months .dc small { font-size: 10.5px; font-weight: 700; white-space: nowrap; }
  .ad-pe-months .dc.f3 { background: var(--ok-soft); color: var(--ok); } .ad-pe-months .dc.f2 { background: var(--pri-soft); color: var(--pri-ink); } .ad-pe-months .dc.full { background: var(--ink); color: #fff; }
  .ad-pe-months .dc:hover { transform: translateY(-1px); }
  .ad-pe-months .dc[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--a-surf), 0 0 0 4px var(--pri); }
  .ad-pe-months .add { display: inline-flex; gap: 3px; align-items: center; justify-content: center; border: 1.5px dashed #C9A96A; background: transparent; color: var(--warn); border-radius: 8px; padding: 5px 4px; font: 800 11px "DM Sans", sans-serif; cursor: pointer; white-space: nowrap; }
  .ad-pe-months .add .ic { width: 12px; height: 12px; }
  .ad-pe-dgrid { display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: 16px; align-items: start; }
  .ad-pe-dmain { display: grid; gap: 16px; min-width: 0; }
  .ad-pe-bulk { display: flex; gap: 6px 8px; flex-wrap: wrap; align-items: center; margin: 12px var(--a-pad) 0; padding: 8px 10px; background: var(--bg2); border-radius: 12px; font-size: 13px; font-weight: 700; }
  .ad-pe-bulk .a-select { padding: 6px 8px; font-size: 12.5px; }
  .ad-pe-pg { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13px; }
  .ad-pe-pg th, .ad-pe-pg td { border-bottom: 1px solid var(--a-line); padding: 7px 8px; vertical-align: middle; text-align: left; }
  .ad-pe-pg th[scope="row"] { font-size: 12.5px; font-weight: 800; white-space: nowrap; padding-left: var(--a-pad); position: sticky; left: 0; background: var(--a-surf); z-index: 1; }
  .ad-pe-pg th[scope="row"] small { display: block; font-size: 11px; color: var(--mute); font-weight: 600; }
  .ad-pe-pg thead th { padding-top: 10px; }
  .ad-pe-pg thead th button { display: grid; justify-items: start; background: none; border: 0; padding: 4px 6px; margin: -4px -6px; border-radius: 8px; cursor: pointer; font: inherit; color: inherit; text-align: left; white-space: nowrap; }
  .ad-pe-pg thead th button b { font-size: 13px; } .ad-pe-pg thead th button small { font-size: 11px; color: var(--mute); font-weight: 600; }
  .ad-pe-pg .sel { background: color-mix(in srgb, var(--pri) 6%, transparent); }
  .ad-pe-pg thead th.sel button { color: var(--pri-ink); }
  .ad-pe-pg td small { display: block; font-size: 11px; color: var(--mute); font-weight: 600; margin-top: 2px; }
  .ad-pe-pg td small.ovr { color: var(--warn); font-weight: 800; }
  .ad-pe-pg .ad-pe-rs input { width: 62px; }
  .ad-pe-pg tr.calc th, .ad-pe-pg tr.calc td { background: var(--bg2); } .ad-pe-pg tr.calc .sel { background: color-mix(in srgb, var(--pri) 9%, var(--bg2)); }
  .ad-pe-pg tr.calc b { font-size: 14px; }
  .ad-pe-pg tr:last-child th, .ad-pe-pg tr:last-child td { border-bottom: 0; }
  .ad-pe-cb { display: inline-flex; gap: 6px; align-items: center; font-weight: 700; font-size: 12.5px; } .ad-pe-cb input { width: 16px; height: 16px; accent-color: var(--ok); }
  .ad-pe-gen { display: flex; gap: 8px 12px; flex-wrap: wrap; align-items: end; }
  .ad-pe-gen label { display: grid; gap: 4px; font-size: 12px; font-weight: 700; color: var(--mute); }
  .ad-pe-gen .ad-pe-in[type="date"] { width: 150px; }
  .ad-pe-genl { list-style: none; margin: 12px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px; }
  .ad-pe-genl li { display: flex; justify-content: space-between; align-items: center; gap: 8px; border: 1px dashed #C4CFDE; border-radius: 10px; padding: 7px 10px; font-size: 13px; animation: ad-in .3s var(--ease); flex-wrap: wrap; }
  .ad-pe-genl li.none { color: var(--mute); grid-column: 1 / -1; }
  .ad-pe-foot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  .ad-pe-rulesg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .ad-pe-rulesg .a-card-h h2 { font-size: 14.5px; display: flex; gap: 6px; align-items: center; }
  .ad-pe-rulesg .a-card-b { display: grid; gap: 10px; }
  .ad-pe-rulesg .a-card-h > .ad-pe-sw { margin-left: auto; }
  .ad-pe-content .a-card-b { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; gap: 14px; align-items: center; }
  .ad-pe-content .ph { width: 72px; height: 54px; border-radius: 10px; } .ad-pe-content b { display: block; } .ad-pe-content small { font-size: 12.5px; color: var(--mute); }
  .ad-pe-insp { top: 160px; }
  .ad-pe-insp h2 { font-size: 24px; letter-spacing: -.03em; }
  .ad-pe-eyeb { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--warn); }
  .ad-pe-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-pe-seat { display: flex; height: 12px; border-radius: 99px; background: #E6EBEF; overflow: hidden; }
  .ad-pe-seat i { display: block; flex: 0 0 var(--w); background: var(--pri); transform-origin: left; animation: ad-grow .6s var(--ease); }
  .ad-pe-seat i.h { background: color-mix(in srgb, var(--act) 70%, #fff); }
  .ad-pe-legend { list-style: none; margin: 0; padding: 0; display: flex; gap: 12px; font-size: 12.5px; font-weight: 700; color: var(--ink2); }
  .ad-pe-legend li { display: inline-flex; gap: 5px; align-items: center; } .ad-pe-legend i { width: 10px; height: 10px; border-radius: 3px; background: #E6EBEF; }
  .ad-pe-legend i.s { background: var(--pri); } .ad-pe-legend i.h { background: color-mix(in srgb, var(--act) 70%, #fff); }
  .ad-pe-ladder { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .ad-pe-ladder li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 10px; padding: 7px 0 7px 18px; position: relative; border-left: 2px solid var(--a-line); margin-left: 5px; font-size: 13px; }
  .ad-pe-ladder li::before { content: ""; position: absolute; left: -7px; top: 11px; width: 12px; height: 12px; border-radius: 50%; background: var(--a-surf); border: 2px solid #B9C3CC; }
  .ad-pe-ladder li.on::before { background: var(--act); border-color: var(--act); }
  .ad-pe-ladder li.on span, .ad-pe-ladder li.on b { color: var(--ink); font-weight: 800; }
  .ad-pe-ladder span { color: var(--ink2); font-weight: 600; } .ad-pe-ladder b { text-align: right; } .ad-pe-ladder small { grid-column: 1 / -1; font-size: 11.5px; color: var(--mute); }
  .ad-pe-def { font-size: 13px; font-weight: 700; } .ad-pe-def small { display: block; color: var(--mute); font-weight: 500; font-size: 12px; }
  .ad-pe-iacts { display: flex !important; flex-wrap: wrap; gap: 6px !important; }

  @media (prefers-reduced-motion: reduce) {
    .ad-pe *, .ad-pe *::before, .ad-pe *::after { animation: none !important; transition: none !important; }
  }
  @container site (max-width: 700px) {
    .ad-pe-dock { left: 0; right: 0; justify-self: stretch; }
    .ad-pe-tt h1 { font-size: 20px; } .ad-pe-tt { flex-basis: 100%; }
    .ad-pe-sv { margin-left: 0; }
    .ad-pe-guard .acts { margin-left: 0; }
    .ad-pe-hotels > div { grid-template-columns: 1fr 1fr; }
    .ad-pe-add { grid-template-columns: minmax(0, 1fr) auto; } .ad-pe-add .p { grid-row: 2; text-align: left; }
    .ad-pe-add .s { grid-row: 1 / 3; grid-column: 2; }
    /* B */
    .ad-pe-pane { display: inline-flex; justify-self: start; }
    .ad-pe-bgrid { grid-template-columns: minmax(0, 1fr); }
    .ad-pe-b[data-pane="edit"] .ad-pe-prev, .ad-pe-b[data-pane="preview"] .ad-pe-form { display: none; }
    .ad-pe-prev { position: static; }
    .ad-pe-ptool .a-seg { overflow-x: auto; max-width: 100%; } .ad-pe-ptool .a-seg button { white-space: nowrap; }
    .ad-pe-pvbar .a-chip { display: none; }
    .ad-pe-pv[data-mode="page"] .ad-pe-page, .ad-pe-pv[data-mode="phone"] .ad-pe-page { width: auto; zoom: 1; border: 0; border-radius: 0; padding: 12px; margin: 0; }
    .ad-pe-pv[data-mode="phone"] .ad-pe-pvs { padding: 0; background: #fff; }
    .ad-pe-card { width: auto; margin: 14px; }
    .ad-pe-mini th:nth-child(4), .ad-pe-mini td:nth-child(4) { display: none; }
    /* C */
    .ad-pe-route { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .ad-pe-route .leg { display: none; }
    .ad-pe-money { margin: 4px 0 0; }
    .ad-pe-story { grid-auto-columns: 62%; }
    .ad-pe-cgrid, .ad-pe-deg { grid-template-columns: minmax(0, 1fr); }
    .ad-pe-scrim { inset: -16px -14px -30px; }
    .ad-pe-drawer { top: -16px; right: -14px; bottom: -30px; width: calc(100% + 28px); }
    .ad-pe-drawer .a-tabs { flex-wrap: nowrap; overflow-x: auto; } .ad-pe-drawer .a-tabs button { white-space: nowrap; }
    /* D */
    .ad-pe-months { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 92px; overflow-x: auto; padding-bottom: 4px; }
    .ad-pe-dgrid, .ad-pe-rulesg { grid-template-columns: minmax(0, 1fr); }
    .ad-pe-insp { position: static; order: -1; }
    .ad-pe-bulk { margin: 12px 0 0; }
    .ad-pe-gen .ad-pe-in[type="date"] { width: 140px; }
    .ad-pe-content .a-card-b { grid-template-columns: 56px minmax(0, 1fr); } .ad-pe-content .ph { width: 56px; height: 44px; } .ad-pe-content .a-btn { grid-column: 1 / -1; justify-self: start; }
  }`;

  /* ---------- register ---------- */
  TS.addVariants('packages', [
    { id: 'B', name: 'Photo catalogue', render: lbRender, mount: lbMount,
      note: 'The list becomes a catalogue of photo cards, because the owner recognises trips by their picture. Each card carries its own health: a status word (Healthy, Needs a fix, Almost full, No bookings yet, Can\'t publish), four publish-check dots, the next departure\'s seat fill, 30-day enquiries and the deal stamp, with Edit, Duplicate, View and a Featured switch on the card itself. Above the grid, a "Needs a look" row lists the four packages that need an action today with the one verb that fixes each. The owner starts there, then filters by pill (Live, Draft, Featured, Needs a look, Deal running), destination or search. On a phone the cards stack in one column and the "Needs a look" row swipes sideways.',
      tradeoff: 'Fifteen photo cards take three screens to scroll where a table fits on one, so comparing prices across packages is slower.' },
    { id: 'C', name: 'Season planner', render: lcRender, mount: lcMount,
      note: 'Rows are packages grouped by destination, columns are the next twelve months (Oct 2026 to Sep 2027), and each departure is a chip coloured by how full it is, with the day and seats sold of seats total. Each destination\'s best months are shaded, and a dashed Gap marks a best-season month at least 30 days out with no date on sale, which is where the next sale comes from. Clicking a chip or a gap fills the strip above the grid: seats, price and leader for a date, or "Add a date" with the nearest dates to copy for a gap. The owner starts from the gap count in the KPIs. On a phone the package column stays pinned and the months scroll sideways inside the grid.',
      tradeoff: 'Prices, enquiries and publish state are pushed out of view: this is a planning screen, not the place to fix a package.' },
    { id: 'D', name: 'Performance board', render: ldRender, mount: ldMount,
      note: 'A sortable board of what each trip earns: page views with a 12-week sparkline, enquiries, paid bookings, revenue, view-to-booking rate marked above or below average, upcoming seats sold and the from price, over 7, 30 or 90 days. Three reading cards name the best converter, the most viewed and the leakiest package. Clicking a package opens its funnel (views, enquiries, checkout holds, paid) and what is moving it: deal, early bird, featured, next-date fill. Everything is counted from views, enquiries and holds already stored. The owner starts by sorting by revenue or conversion. On a phone each row becomes a card with labelled figures.',
      tradeoff: 'It answers "what sells" well but hides the catalogue\'s housekeeping (photos, drafts, publish checks) behind the editor.' },
  ], cssList);

  TS.addVariants('package', [
    { id: 'B', name: 'Live preview', render: ebRender, mount: ebMount,
      note: 'The editor sits beside the real customer page. Left is a stack of short sections in the order the page reads (title, photos, highlights, day by day, dates and prices, deposit and add-ons, hotels, inclusions, trip pack); right is the package page at 64 % scale that updates as you type: name, summary, highlights, day titles, double prices and the deal price, including the hidden-deal warning when a deal is not below the starting price. Clicking any part of the preview opens the matching section; hovering a section outlines its part of the page. The preview switches between Page, Phone, the listing Card and the Trip pack, which is where the meeting point and "Know before you go" appear. Publish checks sit in a chip in the header; the header turns amber on the first edit and Back asks before leaving. On a phone an Edit / Preview switch shows one side at a time.',
      tradeoff: 'The form column is narrow, so wide tools like the full price grid are one click away rather than on this screen.' },
    { id: 'C', name: 'Itinerary builder', render: ecRender, mount: ecMount,
      note: 'The trip is built as a story. A route strip across the top (Kochi airport, Munnar 2 nights, Alleppey 1 night, Fort Kochi 1 night, home) is derived from the days, and below it every day is a card with its photo, place, stay and meals. Days reorder with the arrows; the selected day opens below with a large photo picked from the gallery, title, place, stay tonight and meals. A rail keeps the trip honest: days against nights (with a one-click fix), stays in order (a hotel split across the trip is flagged), a meals tally and the publish checks. Price, dates, deal, early bird, deposit, add-ons and the trip pack live in a drawer opened from the price button or the "Around the story" list. On a phone the days swipe sideways and the drawer fills the screen.',
      tradeoff: 'Money is one click deeper: an owner who mostly changes prices opens the drawer every time.' },
    { id: 'D', name: 'Departures desk', render: edRender, mount: edMount,
      note: 'The editor for selling, not writing. A twelve-month strip shows every date in its month, shaded for Kerala\'s best season, with "Add date" in empty best-season months. Below, a price grid puts the dates side by side (seats, double, triple, child, single supplement, guaranteed, leader, meeting point) with computed rows for today\'s price after deal and early bird and the deposit for two. One bar changes a price on every date, the selected one or only unbooked ones; "Add dates in bulk" repeats a weekday every 1, 2 or 4 weeks and flags each date (best month, Eravikulam closed, already on sale). The deal, early-bird, deposit and add-on rules sit under the grid. The inspector on the right shows the selected date: seats sold, held and free, the price ladder a traveller sees over time, leader and meeting-point overrides, waitlist, and Remove, blocked while seats are booked. Content is one link away. On a phone the months and the grid scroll inside their cards and the inspector comes first.',
      tradeoff: 'Itinerary, photos and page text move to a separate content screen, so a new package needs two editors.' },
  ], cssEd);
})();

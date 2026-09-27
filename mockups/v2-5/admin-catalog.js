/* Admin redesign · catalogue screens: Packages, Package editor, Destinations, Reviews, Coupons, Sign in.
   Content, fields, rules and wording follow the shipped admin (web/src/app/(admin), components/admin)
   and the seed (api/content). v2.5 additions carry a "v2.5" chip. All chrome is the admin kit, so the
   global Admin style switch (A Ink rail · B Command · C Operator) restyles every screen. */
(() => {
  const TS = window.TS;
  const { inr, esc, ICON, LEADERS, avatar } = TS;

  /* ---------- small shared pieces ---------- */
  const V25 = '<span class="a-chip pri cat-v25" title="New in v2.5">v2.5</span>';
  const th = (img, cls = '') => `<span class="ph cat-th ${cls}"><img src="${img}" alt="" loading="lazy"></span>`;
  const sw = (on, label, dis = false) =>
    `<button type="button" class="cat-sw" role="switch" aria-checked="${on}" aria-label="${esc(label)}"${dis ? ' disabled' : ''}><i></i></button>`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const each = (root, sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
  const RS = (v, label, w = '') => `<span class="cat-rs"><span aria-hidden="true">₹</span><input class="cat-in ${w}" inputmode="numeric" value="${v}" aria-label="${esc(label)}"></span>`;

  /* ---------- the catalogue (real seed: api/content/packages, prices in rupees) ---------- */
  // deps: [date, seats total, seats sold, double price]
  const PK = [
    { id: 'kasol', name: 'Kasol Riverside Weekend', slug: 'kasol-weekend-camp', dest: 'Himachal', n: 2, city: 'Ex-Delhi', img: 'img/kasol-1.jpg', status: 'live', feat: false, enq: 9, photos: 5,
      deps: [['6 Nov 2026', 16, 12, 5999], ['20 Nov 2026', 16, 6, 5999], ['4 Dec 2026', 16, 2, 5499]] },
    { id: 'oldgoa', name: 'Old Goa & Dudhsagar Weekend', slug: 'old-goa-weekend', dest: 'Goa', n: 2, city: 'Ex-Goa', img: 'img/goa-6.jpg', status: 'live', feat: false, enq: 4, photos: 5,
      deps: [['6 Nov 2026', 12, 7, 6499], ['27 Nov 2026', 12, 4, 6499], ['11 Dec 2026', 12, 0, 6999]] },
    { id: 'munnar', name: 'Munnar & Alleppey Houseboat', slug: 'munnar-alleppey-houseboat', dest: 'Kerala', n: 4, city: 'Ex-Bengaluru', img: 'img/munnar-2.jpg', status: 'live', feat: true, enq: 9, photos: 4,
      deps: [['13 Nov 2026', 12, 8, 22999], ['18 Dec 2026', 10, 6, 25999], ['15 Jan 2027', 12, 2, 21999], ['12 Feb 2027', 12, 0, 21999]],
      deal: ['ok', 'Deal ₹19,999', 'Running: ₹2,000 off per traveller until 31 Oct 2026'] },
    { id: 'northgoa', name: 'North Goa Beaches', slug: 'north-goa-beaches', dest: 'Goa', n: 3, city: 'Ex-Mumbai', img: 'img/goa-3.jpg', status: 'live', feat: true, enq: 11, photos: 7,
      deps: [['20 Nov 2026', 16, 9, 14999], ['18 Dec 2026', 4, 3, 17499], ['15 Jan 2027', 16, 2, 15499], ['12 Feb 2027', 12, 0, 14499]] },
    { id: 'goaq', name: 'Goa Quiet Escape', slug: 'goa-quiet-escape', dest: 'Goa', n: 4, city: 'Ex-Mumbai', img: 'img/goa-2.jpg', status: 'live', feat: false, enq: 6, photos: 6,
      deps: [['27 Nov 2026', 12, 5, 21499], ['24 Dec 2026', 10, 8, 25999], ['22 Jan 2027', 12, 1, 21999]] },
    { id: 'kochi', name: 'Kochi · Thekkady · Kovalam', slug: 'kochi-thekkady-kovalam', dest: 'Kerala', n: 5, city: 'Ex-Bengaluru', img: 'img/hero-2.jpg', status: 'live', feat: false, enq: 4, photos: 6,
      deps: [['27 Nov 2026', 16, 4, 27999], ['23 Dec 2026', 14, 9, 31999], ['22 Jan 2027', 16, 1, 28499]],
      deal: ['mute', 'Deal ended', 'Deal ended on 15 Sep 2026'] },
    { id: 'jaipur', name: 'Jaipur · Jodhpur · Udaipur', slug: 'jaipur-jodhpur-udaipur', dest: 'Rajasthan', n: 5, city: 'Ex-Jaipur', img: 'img/jaipur-1.jpg', status: 'live', feat: true, enq: 12, photos: 7,
      deps: [['28 Nov 2026', 16, 11, 27999], ['26 Dec 2026', 16, 7, 29999], ['23 Jan 2027', 16, 3, 26499], ['20 Feb 2027', 16, 0, 26499]] },
    { id: 'manali', name: 'Manali · Kasol · Tosh', slug: 'manali-kasol-tosh', dest: 'Himachal', n: 5, city: 'Ex-Delhi', img: 'img/himachal-1.jpg', status: 'live', feat: false, enq: 5, photos: 6,
      deps: [['5 Dec 2026', 16, 6, 21499], ['3 Apr 2027', 16, 0, 19999], ['8 May 2027', 16, 0, 19999], ['5 Jun 2027', 16, 0, 20999]] },
    { id: 'pb', name: 'Port Blair · Havelock · Neil', slug: 'port-blair-havelock-neil', dest: 'Andaman', n: 5, city: 'Ex-Port Blair', img: 'img/andaman-2.jpg', status: 'live', feat: true, enq: 10, photos: 7,
      deps: [['5 Dec 2026', 16, 10, 34999], ['16 Jan 2027', 16, 3, 32999], ['13 Feb 2027', 16, 0, 32999], ['20 Mar 2027', 16, 0, 33999]] },
    { id: 'jais', name: 'Jaisalmer Desert Nights', slug: 'jaisalmer-desert-nights', dest: 'Rajasthan', n: 4, city: 'Ex-Jodhpur', img: 'img/rajasthan-1.jpg', status: 'live', feat: false, enq: 5, photos: 6,
      deps: [['12 Dec 2026', 12, 5, 21999], ['9 Jan 2027', 12, 2, 19499], ['6 Feb 2027', 12, 0, 19499], ['6 Mar 2027', 12, 0, 19999]],
      deal: ['warn', 'Deal inactive', 'Deal inactive: ₹19,999 is not below the starting price ₹19,499'] },
    { id: 'shimla', name: 'Shimla–Manali Classic', slug: 'shimla-manali-classic', dest: 'Himachal', n: 4, city: 'Ex-Delhi', img: 'img/himachal-5.jpg', status: 'live', feat: true, enq: 7, photos: 6,
      deps: [['19 Dec 2026', 24, 14, 21999], ['20 Mar 2027', 24, 2, 18499], ['17 Apr 2027', 24, 0, 18499], ['15 May 2027', 24, 0, 19999]] },
    { id: 'hav', name: 'Havelock Honeymoon', slug: 'havelock-honeymoon', dest: 'Andaman', n: 4, city: 'Ex-Port Blair', img: 'img/andaman-1.jpg', status: 'live', feat: false, enq: 5, photos: 5,
      deps: [['19 Dec 2026', 6, 4, 37999], ['10 Feb 2027', 6, 2, 34999], ['13 Mar 2027', 6, 0, 34999]] },
    { id: 'lehnp', name: 'Leh · Nubra · Pangong', slug: 'leh-nubra-pangong', dest: 'Ladakh', n: 6, city: 'Ex-Leh', img: 'img/ladakh-1.jpg', status: 'live', feat: true, enq: 8, photos: 7,
      deps: [['12 Jun 2027', 12, 2, 31999], ['3 Jul 2027', 12, 1, 29999], ['14 Aug 2027', 12, 0, 29999], ['11 Sep 2027', 12, 0, 30999]] },
    { id: 'leht', name: 'Leh & Turtuk', slug: 'leh-turtuk', dest: 'Ladakh', n: 5, city: 'Ex-Leh', img: 'img/nubra-1.jpg', status: 'live', feat: false, enq: 3, photos: 6,
      deps: [['26 Jun 2027', 10, 0, 29499], ['24 Jul 2027', 10, 0, 27499], ['28 Aug 2027', 10, 0, 27499], ['18 Sep 2027', 10, 0, 28499]] },
    { id: 'lehcopy', name: 'Leh & Turtuk (copy)', slug: 'leh-turtuk-copy', dest: 'Ladakh', n: 6, city: 'Ex-Leh', img: 'img/ladakh-2.jpg', status: 'draft', feat: false, enq: 0, photos: 6, written: 6,
      deps: [['26 Jun 2027', 10, 0, 29499], ['24 Jul 2027', 10, 0, 27499], ['28 Aug 2027', 10, 0, 27499], ['18 Sep 2027', 10, 0, 28499]] },
  ];
  const fromPrice = (p) => Math.min(...p.deps.map((d) => d[3]));
  const rules = (p) => {
    const days = p.n + 1, written = p.written == null ? days : p.written;
    return [
      ['At least one photo', `${p.photos} uploaded`, p.photos > 0],
      ['Full itinerary', `${written} of ${days} days written`, written === days],
      ['At least one upcoming departure', `${p.deps.length} upcoming`, p.deps.length > 0],
      ['Prices set for every departure', 'All departures priced', true],
    ];
  };
  const rulesList = (list) => `<ul class="cat-rules">${list.map(([l, d, ok]) =>
    `<li class="${ok ? 'ok' : 'no'}" aria-label="${esc(l)}: ${ok ? 'done' : 'not done'}">${ok ? ICON.check : ICON.x}<span><b>${esc(l)}</b><small>${esc(d)}</small></span></li>`).join('')}</ul>`;
  const statusChip = (s) => (s === 'live' ? '<span class="a-chip ok">Live</span>' : '<span class="a-chip mute">Draft</span>');

  /* =====================================================================
     1 · PACKAGES (list)
     ===================================================================== */
  const pk = { tab: 'all', q: '', dest: '', view: 'rows', sort: 'next', sel: 'munnar' };
  const DESTS = ['Goa', 'Kerala', 'Himachal', 'Rajasthan', 'Andaman', 'Ladakh'];
  const pkMatch = (p) =>
    (pk.tab === 'all' || p.status === pk.tab) && (!pk.dest || p.dest === pk.dest) &&
    (!pk.q || (p.name + ' ' + p.dest).toLowerCase().includes(pk.q.toLowerCase()));
  const pkSorted = () => {
    const list = PK.slice();
    if (pk.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (pk.sort === 'enq') list.sort((a, b) => b.enq - a.enq);
    return list;
  };

  function pkRow(p, sel) {
    const nx = p.deps[0], fill = pct(nx[2], nx[1]);
    return `<tr data-id="${p.id}" class="${sel ? 'sel' : ''} ${p.status === 'draft' ? 'dim' : ''}" tabindex="0" aria-selected="${sel}"${pkMatch(p) ? '' : ' hidden'}>
      <td><span class="cat-pn">${th(p.img)}<span class="t"><b>${esc(p.name)}</b><small>${p.dest} · ${p.n}N · ${p.city}${p.feat ? ' · Featured' : ''}</small>
        ${p.deal ? `<span class="a-chip ${p.deal[0]} cat-dealchip">${p.deal[1]}</span>` : ''}</span></span></td>
      <td class="num">${inr(fromPrice(p))}</td>
      <td><span class="cat-nx"><span class="d"><b>${nx[0].replace(/ 20\d\d$/, '')}</b> <small>${p.deps.length} dates</small></span>
        <span class="a-meter" style="--v:${fill}%" role="img" aria-label="${nx[2]} of ${nx[1]} seats sold"></span><small>${nx[2]} of ${nx[1]} sold</small></span></td>
      <td class="num cat-hs">${p.enq || '—'}</td>
      <td>${statusChip(p.status)}</td></tr>`;
  }
  function pkCard(p, sel) {
    const nx = p.deps[0];
    return `<button type="button" class="cat-pcard ${sel ? 'sel' : ''}" data-id="${p.id}" aria-pressed="${sel}"${pkMatch(p) ? '' : ' hidden'}>
      <span class="ph"><img src="${p.img}" alt="" loading="lazy"><span class="st">${statusChip(p.status)}</span></span>
      <b>${esc(p.name)}</b><small>${p.dest} · ${p.n}N · from ${inr(fromPrice(p))}</small>
      <span class="a-meter" style="--v:${pct(nx[2], nx[1])}%" aria-hidden="true"></span><small>Next ${nx[0]} · ${nx[2]} of ${nx[1]} sold</small></button>`;
  }
  function pkPanel(p) {
    const r = rules(p), ready = r.every((x) => x[2]);
    return `<aside class="a-panel cat-prev" aria-label="Selected package">
      <section><span class="ph"><img src="${p.img}" alt="${esc(p.name)}"><span class="cap"><b>${esc(p.name)}</b>/packages/${p.slug}</span></span>
        <div class="cat-chips">${statusChip(p.status)}${p.feat ? '<span class="a-chip info">Featured</span>' : ''}<span class="a-chip mute">${p.dest} · ${p.n} nights · ${p.city}</span></div></section>
      <section><h3 class="cat-h3">Next departures</h3>
        ${p.deps.slice(0, 3).map((d) => `<div class="cat-drow"><span><b>${d[0]}</b><small>${inr(d[3])} twin sharing</small></span>
          <span class="m"><span class="a-meter" style="--v:${pct(d[2], d[1])}%" aria-hidden="true"></span><small>${d[2]} of ${d[1]} sold</small></span></div>`).join('')}
        ${p.deps.length > 3 ? `<small class="cat-mute">+${p.deps.length - 3} more ${p.deps.length - 3 === 1 ? 'date' : 'dates'} in the editor</small>` : ''}</section>
      <section><h3 class="cat-h3">${ready ? 'Ready to publish' : 'Not ready to publish'}</h3>${rulesList(r)}</section>
      ${p.deal ? `<section><h3 class="cat-h3">Deal</h3><p class="cat-notice ${p.deal[0]}" role="status">${p.deal[2]}</p></section>` : ''}
      <section class="cat-acts2"><a href="#" class="a-btn">${ICON.file}Edit package</a><button type="button" class="a-btn ghost">${ICON.copy}Duplicate</button>
        ${p.status === 'live' ? `<a href="#" class="a-btn ghost">${ICON.eye}View</a>` : `<button type="button" class="a-btn act" ${ready ? '' : 'disabled'}>Publish</button>`}
        ${ready ? '' : '<small class="cat-mute">Publish unlocks when every check above is done.</small>'}</section>
    </aside>`;
  }
  function pkRender() {
    const live = PK.filter((p) => p.status === 'live').length, draft = PK.length - live;
    const sel = PK.find((p) => p.id === pk.sel) || PK[0];
    const list = pkSorted();
    const count = (t) => (t === 'all' ? PK.length : PK.filter((p) => p.status === t).length);
    const main = `<div class="cat-pk">
      <div class="a-head"><h1>Packages</h1><p class="sub">${live} live · ${draft} draft · ${PK.filter((p) => p.feat).length} featured on the home page</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.eye}View site</a><a href="#" class="a-btn">${ICON.plus}New package</a></div></div>
      <div class="a-kpis">
        <div class="a-kpi"><span class="k">Live packages</span><span class="v num">${live}</span><span class="d">${draft} draft waiting on its itinerary</span></div>
        <div class="a-kpi"><span class="k">Upcoming departures</span><span class="v num">52</span><span class="d">Next: Kasol and Old Goa, 6 Nov</span></div>
        <div class="a-kpi"><span class="k">Seats sold · next 60 days</span><span class="v num">42 / 72</span><span class="d up">58% full</span></div>
        <div class="a-kpi"><span class="k">Enquiries · 30 days</span><span class="v num">98</span><span class="d">Jaipur · Jodhpur · Udaipur leads with 12</span></div>
        <div class="a-kpi"><span class="k">Deals</span><span class="v num">1 running</span><span class="d down">1 inactive: Jaisalmer</span></div>
      </div>
      <div class="cat-toolbar">
        <div class="a-tabs" role="tablist" aria-label="Filter by status">${[['all', 'All'], ['live', 'Live'], ['draft', 'Draft']].map(([k, l]) =>
          `<button type="button" role="tab" data-tab="${k}" aria-selected="${pk.tab === k}">${l} <span class="ct num">${count(k)}</span></button>`).join('')}</div>
        <div class="a-bar">
          <label class="a-search">${ICON.search}<input type="search" id="cat-pk-q" placeholder="Search packages" aria-label="Search packages" value="${esc(pk.q)}" autocomplete="off"></label>
          <select class="a-select" id="cat-pk-dest" aria-label="Destination"><option value="">All destinations</option>${DESTS.map((d) => `<option ${pk.dest === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
          <select class="a-select" id="cat-pk-sort" aria-label="Sort">${[['next', 'Next departure'], ['name', 'Name'], ['enq', 'Enquiries · 30 d']].map(([k, l]) =>
            `<option value="${k}" ${pk.sort === k ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select>
          <div class="a-seg" role="group" aria-label="View"><button type="button" data-view="rows" aria-pressed="${pk.view === 'rows'}">Rows</button><button type="button" data-view="cards" aria-pressed="${pk.view === 'cards'}">Photos</button></div>
        </div>
      </div>
      <div class="a-split">
        <div class="cat-pk-left">
          <div class="a-card flush" ${pk.view === 'rows' ? '' : 'hidden'}><div class="a-card-b"><div class="a-tw"><table class="a-table">
            <thead><tr><th>Package</th><th class="num">From</th><th>Next departure</th><th class="num cat-hs">Enq · 30 d</th><th>Status</th></tr></thead>
            <tbody>${list.map((p) => pkRow(p, p.id === sel.id)).join('')}</tbody></table></div></div></div>
          <div class="cat-pgrid" ${pk.view === 'cards' ? '' : 'hidden'}>${list.map((p) => pkCard(p, p.id === sel.id)).join('')}</div>
          <p class="a-empty" id="cat-pk-empty" ${PK.some(pkMatch) ? 'hidden' : ''}>No packages match this search.</p>
        </div>
        ${pkPanel(sel)}
      </div></div>`;
    return TS.adminShell('Packages', main);
  }
  function pkMount(site, rerender) {
    const apply = () => {
      let any = false;
      site.querySelectorAll('.cat-pk [data-id]').forEach((el) => {
        const ok = pkMatch(PK.find((p) => p.id === el.dataset.id));
        el.hidden = !ok; any = any || ok;
      });
      const e = site.querySelector('#cat-pk-empty'); if (e) e.hidden = any;
    };
    each(site, '.cat-pk [data-tab]', 'click', (b) => { pk.tab = b.dataset.tab; rerender(); });
    each(site, '.cat-pk [data-view]', 'click', (b) => { pk.view = b.dataset.view; rerender(); });
    each(site, '#cat-pk-q', 'input', (i) => { pk.q = i.value; apply(); });
    each(site, '#cat-pk-dest', 'change', (s) => { pk.dest = s.value; apply(); });
    each(site, '#cat-pk-sort', 'change', (s) => { pk.sort = s.value; rerender(); });
    each(site, '.cat-pk [data-id]', 'click', (r) => { pk.sel = r.dataset.id; rerender(); });
    each(site, '.cat-pk tr[data-id]', 'keydown', (r, e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pk.sel = r.dataset.id; rerender(); } });
  }

  /* =====================================================================
     2 · PACKAGE EDITOR — Munnar & Alleppey Houseboat (api/content/packages/munnar_alleppey_houseboat.py)
     ===================================================================== */
  const ED_DAYS = [
    ['Arrive Kochi, drive up to the tea country', 'D', 'Tea Valley Resort, Munnar',
      'Your driver meets you at Kochi airport for the four-hour climb into the Ghats, with a stop at the Cheeyappara falls where the road starts to twist. Check in above the estates at Pothamedu in time for the light on the tea; dinner is at the resort.'],
    ['Eravikulam, Mattupetty and the tea museum', 'BD', 'Tea Valley Resort, Munnar',
      'An early start for Eravikulam, where the Nilgiri tahr graze the grassland before the crowds arrive. Then the Mattupetty dam and Echo point, and the KDHP tea museum for how the leaf gets from bush to cup.'],
    ['Down to Alleppey, board the houseboat', 'BLD', 'Houseboat, Vembanad lake',
      'Five hours down to the plain, boarding at Punnamada at noon as lunch is served. The afternoon is canals, paddies below water level and villages you pass at walking pace; the boat moors by sunset.'],
    ['Fort Kochi: fishing nets, Mattancherry, Kathakali', 'B', 'Fort House, Fort Kochi',
      'Breakfast on board, off by nine, and ninety minutes to Fort Kochi. The Chinese fishing nets, Mattancherry palace and Jew Street fill the afternoon; the Kathakali performance starts at six.'],
    ['Kochi morning and departure', 'B', '',
      'A last walk past St Francis church to a coffee on Princess Street, then the hour\'s drive to Kochi airport. Late check-out until 1 pm on request.'],
  ];
  // [date, seats, sold, double, triple, child, single, guaranteed, leader, past]
  const ED_DEPS = [
    ['2026-11-13', 12, 8, 22999, 20999, 13499, 9500, true, 'anjali'],
    ['2026-12-18', 10, 6, 25999, 23999, 15499, 11000, false, 'meera'],
    ['2027-01-15', 12, 2, 21999, 19999, 12999, 9000, true, 'anjali'],
    ['2027-02-12', 12, 0, 21999, 19999, 12999, 9000, false, 'anjali'],
  ];
  const ED_ADDONS = [
    ['Ayurvedic massage in Munnar', '60 minutes, full body, at the resort spa', 'trav', 2200, 0, true],
    ['Kolukkumalai sunrise jeep', 'The world\'s highest tea estate, 4.30 am start, shared jeep', 'trav', 1800, 0, true],
    ['Extra night at Fort House, Fort Kochi', 'Same room, breakfast included', 'night', 3400, 2, true],
    ['Airport pick-up in an Innova Crysta', 'Instead of the sedan, for up to 6 with luggage', 'booking', 2500, 0, false],
  ];
  const ED_PHOTOS = [
    ['img/munnar-2.jpg', 'Tea estates of Munnar from above'],
    ['img/munnar-1.jpg', 'Tea bushes on a Munnar hillside'],
    ['img/kerala-1.jpg', 'Houseboats on a backwater canal near Alleppey'],
    ['img/kerala-2.jpg', 'A houseboat under the palms'],
  ];
  const ED_NAV = [
    ['basics', 'Basics', 'Done'], ['itinerary', 'Itinerary', '5 of 5'], ['departures', 'Departures', '4 dates'], ['deal', 'Deal', 'Running'],
    ['early', 'Early bird', '2 tiers', 1], ['deposit', 'Deposit', '25 %', 1], ['addons', 'Add-ons', '3 on', 1], ['trippack', 'Trip pack', 'Set', 1],
    ['travellers', 'Traveller details', '3 required', 1], ['lists', 'Inclusions and FAQ', '3 Q'], ['gallery', 'Gallery', '4 photos'], ['hotels', 'Hotels', '3'], ['danger', 'Danger zone', ''],
  ];
  const ed = { cur: 'basics', dirty: false, leaving: false, saved: false };
  const THEMES = [['beach', 'Beach'], ['hills', 'Hills'], ['honeymoon', 'Honeymoon'], ['family', 'Family'], ['adventure', 'Adventure'], ['heritage', 'Heritage']];
  const fld = (label, input, hint = '', cls = '') => `<div class="a-field ${cls}"><label>${label}</label>${input}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const card = (id, title, body, meta = '', acts = '') =>
    `<section class="a-card cat-sec" id="ed-${id}" data-sec="${id}"><div class="a-card-h"><h2>${title}</h2>${meta}${acts ? `<div class="acts">${acts}</div>` : ''}</div><div class="a-card-b">${body}</div></section>`;
  const fmtIso = (iso) => { const [y, m, d] = iso.split('-'); return `${+d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`; };

  function edRender() {
    const L = LEADERS;
    const leaderOpts = (sel) => Object.keys(L).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${L[k].name}</option>`).join('');

    const basics = `<div class="a-row2">
        ${fld('Name', '<input value="Munnar &amp; Alleppey Houseboat">')}
        ${fld(`Slug ${ICON.lock}`, '<input value="munnar-alleppey-houseboat" readonly aria-readonly="true" class="cat-ro">', 'The URL is fixed once a trip has been published.')}
      </div>
      <div class="a-row3">
        ${fld('Destination', `<select>${DESTS.map((d) => `<option ${d === 'Kerala' ? 'selected' : ''}>${d}</option>`).join('')}</select>`)}
        ${fld('Nights', '<input type="number" value="4" min="1" max="30" inputmode="numeric">', '5 days')}
        ${fld('Departure city', '<input value="Ex-Bengaluru">')}
      </div>
      <div class="a-field"><span class="cat-lbl" id="cat-themes">Themes</span><div class="cat-pills" role="group" aria-labelledby="cat-themes">${THEMES.map(([k, l]) =>
        `<button type="button" aria-pressed="${k === 'hills' || k === 'honeymoon'}">${l}</button>`).join('')}</div></div>
      ${fld('Summary', '<textarea rows="3">Two nights among Munnar\'s tea estates, a night on a private houseboat on the Vembanad backwaters and a last evening in Fort Kochi. The Kerala trip we would pick.</textarea>', 'Two or three lines — this is the card and the meta description.')}
      <div class="cat-2x">
        <div class="cat-swrow">${sw(true, 'Featured')}<span><b>Featured</b><small>Featured packages lead the home page.</small></span></div>
        <div class="a-field"><label>Trip leader ${V25}</label><span class="cat-lead">${avatar('anjali', 30)}<select aria-label="Default trip leader">${leaderOpts('anjali')}</select></span>
          <span class="hint">The default for every date; a departure can switch below.</span></div>
      </div>`;

    const itin = `<div class="cat-days">${ED_DAYS.map(([t, meals, stay, desc], i) => `<details class="cat-day" ${i === 0 ? 'open' : ''}>
        <summary><span class="grip" aria-hidden="true">⋮⋮</span><span class="n">Day ${i + 1}</span><b>${esc(t)}</b>
          <span class="meals">${['B', 'L', 'D'].map((m) => `<i class="${meals.includes(m) ? 'on' : ''}" title="${{ B: 'Breakfast', L: 'Lunch', D: 'Dinner' }[m]}">${m}</i>`).join('')}</span>${ICON.chevD}</summary>
        <div class="body">
          ${fld(`Title, day ${i + 1}`, `<input value="${esc(t)}">`)}
          ${fld(`Description, day ${i + 1}`, `<textarea rows="3">${esc(desc)}</textarea>`)}
          <div class="cat-2x">
            <div class="a-field"><span class="cat-lbl">Meals</span><div class="cat-pills sm">${[['B', 'Breakfast'], ['L', 'Lunch'], ['D', 'Dinner']].map(([m, l]) =>
              `<button type="button" aria-pressed="${meals.includes(m)}">${l}</button>`).join('')}</div></div>
            ${fld('Stay', `<input value="${esc(stay)}" placeholder="No stay: departure day">`)}
          </div>
        </div></details>`).join('')}</div>
      <div class="cat-foot"><button type="button" class="a-btn ghost sm">${ICON.plus}Add day</button><span class="cat-mute">Drag the handle to reorder. Days must match the nights plus one to publish.</span></div>`;

    const deps = `<div class="a-tw cat-depw"><table class="a-table cat-dept">
        <thead><tr><th>Date</th><th>Seats</th><th>Double</th><th>Triple</th><th>Child</th><th>Single suppl.</th><th>Guar.</th><th>Leader ${V25}</th><th><span class="cat-sr">Actions</span></th></tr></thead>
        <tbody>${ED_DEPS.map(([date, seats, sold, dbl, tri, ch, sgl, g, lead], i) => `<tr>
          <td><input class="cat-in w-date" type="date" value="${date}" aria-label="Date, departure ${i + 1}"></td>
          <td><input class="cat-in w-s" inputmode="numeric" value="${seats}" aria-label="Seats total, departure ${i + 1}"><small class="cat-sold">${sold} booked</small></td>
          <td>${RS(dbl, `Double, departure ${i + 1}`)}</td><td>${RS(tri, `Triple, departure ${i + 1}`)}</td><td>${RS(ch, `Child, departure ${i + 1}`)}</td><td>${RS(sgl, `Single supplement, departure ${i + 1}`)}</td>
          <td><input type="checkbox" class="cat-cb" ${g ? 'checked' : ''} aria-label="Guaranteed, departure ${i + 1}"></td>
          <td><span class="cat-lead sm">${avatar(lead, 24)}<select aria-label="Leader, departure ${i + 1}">${leaderOpts(lead)}</select></span>${lead !== 'anjali' ? '<small class="cat-ovr">Changed from default</small>' : ''}</td>
          <td class="cat-ic"><a href="#" class="a-btn ghost sm" title="Passenger manifest" aria-label="Manifest, departure ${i + 1}">${ICON.file}</a><button type="button" class="a-btn ghost sm" aria-label="Remove departure ${i + 1}">${ICON.x}</button></td></tr>`).join('')}</tbody></table></div>
      <div class="cat-foot"><button type="button" class="a-btn ghost sm">${ICON.plus}Add departure</button><span class="cat-mute">Seats is the capacity: online bookings count against it — lower it only for seats sold outside the site. The file icon opens a saved date's passenger manifest.</span></div>`;

    const deal = `<p class="cat-mute">A flat amount off per traveller on every date: starting price − deal price. It ends at midnight IST after the last day.</p>
      <p class="cat-notice ok" role="status">Running: ₹2,000 off per traveller until 31 Oct 2026</p>
      <div class="a-row3">
        ${fld('Deal price per person', RS(19999, 'Deal price per person', 'w-full'), '₹2,000 off the starting price ₹21,999')}
        ${fld('Last day', '<input type="date" value="2026-10-31">', 'Ends at midnight IST after this day')}
        ${fld('Label · optional', '<input value="Season opener" maxlength="24">', 'On the card\'s stamp; “Deal” when blank')}
      </div>`;

    const early = `<div class="cat-swrow">${sw(true, 'Early-bird pricing on')}<span><b>Early-bird pricing is on</b><small>Up to 2 tiers. Applied after the deal and before a coupon, per traveller, children included — never on add-ons.</small></span></div>
      <div class="cat-tiers">${[[1, 1500, 90], [2, 750, 45]].map(([n, off, days]) => `<div class="cat-tier"><span class="n">Tier ${n}</span>
        ${RS(off, `Tier ${n} amount off per traveller`)}<span>off per traveller when booked</span><input class="cat-in w-s" inputmode="numeric" value="${days}" aria-label="Tier ${n} days before departure"><span>+ days before departure</span></div>`).join('')}</div>
      <div class="cat-ladder" aria-label="Price ladder for the 15 Jan 2027 departure">
        <span class="cap">Price ladder · 15 Jan 2027 · per traveller, twin sharing, after the ₹2,000 deal</span>
        <ol><li class="on"><b class="num">${inr(18499)}</b><small>Book today</small><em>Tier 1 · −₹1,500</em></li>
          <li><b class="num">${inr(19249)}</b><small>From 18 Oct</small><em>Tier 2 · −₹750</em></li>
          <li><b class="num">${inr(19999)}</b><small>From 2 Dec</small><em>Deal price</em></li></ol></div>`;

    const deposit = `<div class="cat-swrow">${sw(true, 'Deposit on')}<span><b>Reserve with 25 % now</b><small>Of the total after deal and coupon, add-ons included. The balance is due 30 days before departure; dates inside that window pay in full.</small></span></div>
      <div class="a-note">${ICON.info}<span>On the 15 Jan 2027 date for two: <b>${inr(9250)}</b> today, balance <b>${inr(27748)}</b> due by 16 Dec 2026 — payable in parts of ₹1,000 or more.</span></div>`;

    const chargeSel = (k, i) => `<select class="cat-in w-c" aria-label="Charged, add-on ${i + 1}">${[['booking', 'Per booking'], ['trav', 'Per traveller'], ['night', 'Per traveller per night']].map(([v, l]) =>
      `<option value="${v}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const addons = `<div class="cat-addons">${ED_ADDONS.map(([n, d, k, price, max, on], i) => `<div class="cat-addon ${on ? '' : 'off'}">
        <div class="t"><input class="cat-in w-full b" value="${esc(n)}" aria-label="Add-on ${i + 1} name"><input class="cat-in w-full" value="${esc(d)}" aria-label="Add-on ${i + 1} description"></div>
        <div class="p">${RS(price, `Add-on ${i + 1} price`)}${chargeSel(k, i)}${k === 'night' ? `<span class="cat-max">max <input class="cat-in w-xs" value="${max}" aria-label="Add-on ${i + 1} maximum nights"> nights</span>` : ''}</div>
        <div class="s">${sw(on, `${n} on`)}<small>${on ? 'On' : 'Off'}</small></div></div>`).join('')}</div>
      <div class="cat-foot"><button type="button" class="a-btn ghost sm">${ICON.plus}Add an add-on</button><span class="cat-mute">Deals, coupons and early-bird never apply to add-ons. No stock limits — switch one off instead.</span></div>`;

    const trippack = `<div class="a-row2">
        ${fld('Meeting point', '<input value="Kochi airport (COK), domestic arrivals, pillar 6">', 'Each departure can override it.')}
        ${fld('Meeting time', '<input value="Day 1, 11:30 IST — driver holds a Tripsmith board">')}
      </div>
      ${fld('Maps link', '<input value="https://maps.google.com/?q=Cochin+International+Airport">')}
      ${fld('Know before you go', '<textarea rows="5">Munnar nights drop to 10 °C from December: pack a fleece and closed shoes for the estate walk.\nHouseboat cabins are air-conditioned from 9 pm to 6 am only.\nNetwork: Jio and BSNL work in Munnar town, patchy on the estate, none on parts of the backwaters.\nCarry ₹3,000 in cash for tips and the tea museum; everything else takes UPI.\nEravikulam allows no plastic bottles — guards check bags at the gate.</textarea>',
        'Packing, weather, network, cash, local rules. Plain text. The trip pack unlocks 7 days before departure, once fully paid.')}`;

    const travellers = `<div class="cat-2x">
        <div class="a-field"><span class="cat-lbl">Required from every traveller</span><div class="cat-checks">${[['ID type and number', true, 'Masked everywhere but the manifest'], ['Emergency contact', true, ''], ['Food preference', true, 'Veg, non-veg, Jain, vegan, allergies'], ['Date of birth', false, ''], ['Medical notes', false, '']].map(([l, on, h]) =>
          `<label><input type="checkbox" class="cat-cb" ${on ? 'checked' : ''}><span>${l}${h ? `<small>${h}</small>` : ''}</span></label>`).join('')}</div></div>
        <div class="a-field"><span class="cat-lbl">Pre-trip checklist items</span><div class="cat-checks">${['Printed photo ID for the houseboat check-in', 'Arrival flight number sent on WhatsApp'].map((l, i) =>
          `<div class="cat-item"><input class="cat-in w-full" value="${esc(l)}" aria-label="Checklist item ${i + 1}"><button type="button" class="a-btn ghost sm" aria-label="Remove item ${i + 1}">${ICON.x}</button></div>`).join('')}
          <button type="button" class="a-btn ghost sm">${ICON.plus}Add item</button></div>
          <span class="hint">Tick-boxes in My trips next to details, balance, trip pack and calendar. No uploads.</span></div>
      </div>
      <p class="cat-mute">Details lock 3 days before departure. ID numbers are deleted 30 days after the trip ends.</p>`;

    const lists = `<div class="a-row2">
        ${fld('Included · one per line', '<textarea rows="6">2 nights at Tea Valley Resort, Munnar, breakfast and dinner\n1 night on a private one-bedroom houseboat, Alleppey — lunch, dinner, breakfast\n1 night at Fort House, Fort Kochi, breakfast included\nPrivate car with driver for all transfers and sightseeing\nEravikulam park entry and the Kathakali performance\nTripsmith WhatsApp support from booking to return</textarea>', 'What the price covers')}
        ${fld('Not included · one per line', '<textarea rows="6">Flights or train to Kochi (we can book them for you at cost)\nMeals not listed above\nTea museum entry, boat rides at Mattupetty and camera fees (about ₹600 per person)\n5% GST on the package price</textarea>', 'What it does not')}
      </div>
      ${fld('Highlights · one per line', '<textarea rows="4">A night on a private houseboat on the Vembanad backwaters\nEravikulam park and the tea estates above Munnar\nFort Kochi\'s Chinese fishing nets and a Kathakali evening\nA tea-estate stay with the plantation on your doorstep</textarea>', 'Shown on the card and the page')}
      <div class="a-field"><span class="cat-lbl">FAQ</span><div class="cat-faq">${[['Is Eravikulam open on our dates?', 'The park closes for the Nilgiri tahr calving season, usually February to early April. On those departures we swap in Top Station and the Kolukkumalai jeep ride.'],
        ['What is the houseboat like?', 'A one-bedroom kettuvallam with an air-conditioned cabin, attached bathroom and an open upper deck. A crew of three cooks on board.'],
        ['Can we add Varkala or Kovalam?', 'Yes — two extra nights on the coast after Kochi is our most common extension.']].map(([q, a], i) =>
        `<details ${i === 0 ? 'open' : ''}><summary><b>${esc(q)}</b>${ICON.chevD}</summary><div class="body"><input class="cat-in w-full b" value="${esc(q)}" aria-label="Question ${i + 1}"><textarea class="cat-in w-full" rows="2" aria-label="Answer ${i + 1}">${esc(a)}</textarea></div></details>`).join('')}</div>
        <button type="button" class="a-btn ghost sm cat-self">${ICON.plus}Add question</button></div>`;

    const gallery = `<div class="cat-gal">${ED_PHOTOS.map(([src, alt], i) => `<figure class="cat-tile">
        <span class="ph"><img src="${src}" alt="${esc(alt)}" loading="lazy">${i === 0 ? '<span class="cov">Cover</span>' : ''}</span>
        <span class="tools"><button type="button" class="ic-b" aria-label="Reorder photo ${i + 1}">⋮⋮</button><button type="button" class="ic-b ${i === 0 ? 'on' : ''}" aria-label="Make photo ${i + 1} the cover" ${i === 0 ? 'disabled' : ''}>${TS.ICON.star}</button><button type="button" class="ic-b" aria-label="Delete photo ${i + 1}">${ICON.x}</button></span>
        <input class="cat-in w-full" value="${esc(alt)}" aria-label="Alt text, photo ${i + 1}"></figure>`).join('')}
        <button type="button" class="cat-up">${ICON.plus}<b>Upload</b><small>JPG/PNG/WEBP ≤ 4 MB</small></button></div>
      <p class="cat-mute">Drag to reorder. Alt text describes the photo for screen readers and shows if the image fails to load. Photo changes save straight away.</p>`;

    const hotels = `<div class="cat-hotels">${[['Tea Valley Resort', 'Munnar', 3, 2], ['Spice Routes houseboat', 'Alleppey', 4, 1], ['Fort House', 'Fort Kochi', 3, 1]].map(([n, c, s, nt], i) =>
      `<div class="cat-hotel">${fld('Name', `<input value="${esc(n)}">`)}${fld('City', `<input value="${esc(c)}">`)}${fld('Stars', `<select>${[2, 3, 4, 5].map((x) => `<option ${x === s ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}${fld('Nights', `<input type="number" value="${nt}">`)}
        <button type="button" class="a-btn ghost sm" aria-label="Remove hotel ${i + 1}">${ICON.x}</button></div>`).join('')}</div>
      <div class="cat-foot"><button type="button" class="a-btn ghost sm">${ICON.plus}Add hotel</button><span class="cat-mute">4 nights across 3 hotels — matches the itinerary.</span></div>`;

    const danger = `<div class="cat-danger"><div><b>Duplicate as a draft</b><small>Copies everything but the bookings; photos are shared, not re-uploaded.</small></div><button type="button" class="a-btn ghost">${ICON.copy}Duplicate</button></div>
      <div class="cat-danger"><div><b>Delete package</b><small>Delete is blocked while 9 enquiries reference this package.</small></div><button type="button" class="a-btn danger" disabled>Delete package</button></div>`;

    const r = rules(PK.find((p) => p.id === 'munnar'));
    const main = `<div class="cat-ed ${ed.dirty ? 'is-dirty' : ''}">
      <div class="a-head"><a href="#" class="cat-back" id="cat-ed-back">${ICON.chevL}Packages</a>
        <h1>Munnar &amp; Alleppey Houseboat</h1>
        <p class="sub">Kerala · 4 nights · Ex-Bengaluru · last saved 26 Sep, 18:40 IST</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.eye}View page</a><a href="#" class="a-btn ghost">${ICON.file}Itinerary PDF</a></div></div>
      ${ed.leaving ? `<div class="cat-guard" role="alertdialog" aria-label="Unsaved changes"><span>${ICON.info}<b>Leave without saving?</b> Your changes to this package are not saved yet.</span>
        <span class="acts"><button type="button" class="a-btn ghost sm" data-guard="stay">Stay and keep editing</button><button type="button" class="a-btn danger sm" data-guard="leave">Leave without saving</button></span></div>` : ''}
      <div class="cat-ed-grid">
        <aside class="cat-ed-rail">
          <div class="a-panel cat-status"><section><div class="cat-strow"><span class="a-chip ok">Live</span><span class="cat-mute">since 12 Sep</span><button type="button" class="a-btn ghost sm">Unpublish</button></div>
            ${rulesList(r)}<small class="cat-mute">Publishing revalidates the public page, the listing, the destination page and the itinerary PDF.</small></section></div>
          <nav class="cat-ed-nav" aria-label="Editor sections">${ED_NAV.map(([id, l, m, nw]) =>
            `<a href="#ed-${id}" data-go="${id}" aria-current="${ed.cur === id}"><span>${l}${nw ? ' <i class="nw">v2.5</i>' : ''}</span><small>${m}</small></a>`).join('')}</nav>
        </aside>
        <div class="cat-ed-form">
          ${card('basics', 'Basics', basics)}
          ${card('itinerary', 'Itinerary', itin, '<span class="a-chip ok">5 of 5 days</span>')}
          ${card('departures', 'Departures', deps, '<span class="a-chip mute">4 dates · 16 of 46 seats booked</span>')}
          ${card('deal', 'Deal', deal, '<span class="a-chip ok">Running</span>', '<button type="button" class="a-btn ghost sm">Clear deal</button>')}
          ${card('early', `Early-bird pricing ${V25}`, early)}
          ${card('deposit', `Deposit ${V25}`, deposit)}
          ${card('addons', `Add-ons ${V25}`, addons, '<span class="a-chip mute">3 on · 1 off</span>')}
          ${card('trippack', `Trip pack ${V25}`, trippack)}
          ${card('travellers', `Traveller details ${V25}`, travellers)}
          ${card('lists', 'Inclusions, exclusions and FAQ', lists)}
          ${card('gallery', 'Gallery', gallery, '<span class="a-chip mute">4 photos</span>')}
          ${card('hotels', 'Hotels', hotels)}
          ${card('danger', 'Danger zone', danger)}
          <div class="cat-savebar" role="region" aria-label="Save">
            ${ed.dirty ? '<span class="a-chip warn">Unsaved changes</span><span class="cat-mute">Leaving this page asks first.</span>'
              : ed.saved ? '<span class="a-chip ok">Saved</span><span class="cat-mute">The public pages refresh in a few seconds.</span>'
              : '<span class="a-chip mute">All changes saved</span><span class="cat-mute">26 Sep, 18:40 IST</span>'}
            <span class="acts"><button type="button" class="a-btn ghost" data-act="discard" ${ed.dirty ? '' : 'disabled'}>Discard</button><button type="button" class="a-btn" data-act="save" ${ed.dirty ? '' : 'disabled'}>Save changes</button></span>
          </div>
        </div>
      </div></div>`;
    return TS.adminShell('Packages', main);
  }
  function edMount(site, rerender) {
    const root = site.querySelector('.cat-ed'); if (!root) return;
    const markDirty = () => {
      if (ed.dirty) return;
      ed.dirty = true; ed.saved = false; root.classList.add('is-dirty');
      const bar = root.querySelector('.cat-savebar');
      bar.querySelector('.a-chip').outerHTML = '<span class="a-chip warn">Unsaved changes</span>';
      bar.querySelector('.cat-mute').textContent = 'Leaving this page asks first.';
      bar.querySelectorAll('[data-act]').forEach((b) => (b.disabled = false));
    };
    root.addEventListener('input', markDirty);
    root.addEventListener('change', markDirty);
    each(root, '.cat-pills button', 'click', (b) => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); markDirty(); });
    each(root, '.cat-sw:not([disabled])', 'click', (b) => {
      const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on);
      const row = b.closest('.cat-addon'); if (row) { row.classList.toggle('off', !on); const s = row.querySelector('.s small'); if (s) s.textContent = on ? 'On' : 'Off'; }
      markDirty();
    });
    each(root, '[data-act="save"]', 'click', () => { ed.dirty = false; ed.saved = true; ed.leaving = false; rerender(); });
    each(root, '[data-act="discard"]', 'click', () => { ed.dirty = false; ed.saved = false; ed.leaving = false; rerender(); });
    each(root, '#cat-ed-back', 'click', (a, e) => { e.preventDefault(); if (ed.dirty) { ed.leaving = true; rerender(); } });
    each(root, '[data-guard]', 'click', (b) => { if (b.dataset.guard === 'leave') ed.dirty = false; ed.leaving = false; rerender(); });
    each(root, '[data-go]', 'click', (a, e) => {
      e.preventDefault(); ed.cur = a.dataset.go;
      root.querySelectorAll('[data-go]').forEach((x) => x.setAttribute('aria-current', x === a));
      const sec = root.querySelector('#ed-' + ed.cur); if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash'); }
    });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => ents.forEach((en) => {
        if (!en.isIntersecting) return; ed.cur = en.target.dataset.sec;
        root.querySelectorAll('[data-go]').forEach((x) => x.setAttribute('aria-current', x.dataset.go === ed.cur));
      }), { rootMargin: '-20% 0px -70% 0px' });
      root.querySelectorAll('.cat-sec').forEach((s) => io.observe(s));
    }
  }

  /* =====================================================================
     3 · DESTINATIONS (list + editor, one screen)
     ===================================================================== */
  const DS = [
    { id: 'goa', name: 'Goa', tag: "Beaches, shacks and Portuguese lanes — India's easiest holiday", region: 'West India', months: [11, 12, 1, 2], pos: 1, img: 'img/goa-2.jpg', live: 3, draft: 0, next: '6 Nov 2026',
      intro: 'Goa is two holidays in one. The north — Baga, Anjuna, Vagator, Morjim — is beach shacks, flea markets, sunset forts and a nightlife that runs past midnight. The south — Palolem, Agonda, Cola — is quieter: crescent bays, coconut groves and cottages a few steps from the water.' },
    { id: 'kerala', name: 'Kerala', tag: 'Backwaters, tea hills and a slow coast', region: 'South India', months: [9, 10, 11, 12, 1, 2, 3], pos: 2, img: 'img/kerala-1.jpg', live: 2, draft: 0, next: '13 Nov 2026',
      intro: "Kerala is three trips stacked on top of each other. Up in the Western Ghats, Munnar's tea estates roll away in every direction and the mornings are cold enough for a jacket. Down on the plain, Alleppey's backwaters are a maze of canals and paddies best seen from the deck of a houseboat.\n\n**Best time:** September to March — the monsoon has cleared, the hills are green and the coast is dry." },
    { id: 'himachal', name: 'Himachal', tag: 'Snow, pines and the Parvati valley', region: 'North India', months: [3, 4, 5, 6, 12], pos: 3, img: 'img/himachal-1.jpg', live: 3, draft: 0, next: '6 Nov 2026',
      intro: "Himachal is the Himalaya you can reach by coach from Delhi overnight. Shimla is the old summer capital — the Ridge, Mall Road, a toy train and Kufri's hills an hour up. Manali, seven hours further, is the base for Solang valley's snow." },
    { id: 'rajasthan', name: 'Rajasthan', tag: 'Forts, lakes and the Thar', region: 'North-west India', months: [10, 11, 12, 1, 2, 3], pos: 4, img: 'img/udaipur-1.jpg', live: 2, draft: 0, next: '28 Nov 2026',
      intro: "Rajasthan is the trip people picture when they picture India: Amber's ramparts above a lake, Jodhpur's blue lanes under Mehrangarh, Udaipur's palaces standing in the water." },
    { id: 'andaman', name: 'Andaman', tag: 'Radhanagar sands and reefs', region: 'Bay of Bengal', months: [11, 12, 1, 2, 3, 4], pos: 5, img: 'img/andaman-1.jpg', live: 2, draft: 0, next: '5 Dec 2026',
      intro: "Two hours' flight east of Chennai, the Andamans are the beaches India's mainland does not have: white sand, water you can see your feet in, and reefs a short boat ride out." },
    { id: 'ladakh', name: 'Ladakh', tag: 'Passes, lakes and monasteries', region: 'Trans-Himalaya', months: [6, 7, 8, 9], pos: 6, img: 'img/ladakh-2.jpg', live: 2, draft: 1, next: '12 Jun 2027',
      intro: 'Ladakh is a high desert on the far side of the Himalaya: 3,500 metres at Leh, 5,359 at Khardung La, a sky so blue it looks edited. Monasteries sit on rocks above the Indus, and Pangong changes colour four times before lunch.' },
  ];
  const MO = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthRange = (m) => {
    const s = MON[m[0] - 1], e = MON[m[m.length - 1] - 1];
    return m.length === 1 ? s : `${s}–${e}`;
  };
  const ds = { sel: 'kerala' };
  function dsRender() {
    const d = DS.find((x) => x.id === ds.sel) || DS[0];
    const pk = (x) => `${x.live} live${x.draft ? ` · ${x.draft} draft` : ''}`;
    const cards = DS.map((x) => `<button type="button" class="cat-dcard ${x.id === d.id ? 'sel' : ''}" data-ds="${x.id}" aria-pressed="${x.id === d.id}">
        <span class="ph"><img src="${x.img}" alt="" loading="lazy"><span class="pos num" title="Order">${x.pos}</span><span class="nm"><b>${x.name}</b>${x.region}</span></span>
        <span class="tg">${esc(x.tag)}</span>
        <span class="cat-mo" role="img" aria-label="Best months: ${monthRange(x.months)}">${MO.map((m, i) => `<i class="${x.months.includes(i + 1) ? 'on' : ''}">${m}</i>`).join('')}</span>
        <span class="ft"><span class="a-chip ${x.draft ? 'warn' : 'ok'}">${pk(x)}</span><small>Next departure ${x.next}</small><span class="grip" aria-hidden="true">⋮⋮</span></span></button>`).join('');
    const total = d.live + d.draft;
    const panel = `<aside class="a-panel cat-dpanel" aria-label="Edit ${d.name}">
      <section><div class="cat-strow"><h2 class="cat-h2">${d.name}</h2><a href="#" class="a-btn ghost sm">${ICON.eye}View page</a></div>
        <div class="cat-cover"><span class="ph"><img src="${d.img}" alt="${d.name} cover"></span><button type="button" class="cat-up">${ICON.camera}<b>Replace cover</b><small>JPG/PNG/WEBP ≤ 4 MB</small></button></div></section>
      <section>
        <div class="a-row2">${fld('Name', `<input value="${d.name}">`)}${fld('Slug', `<input value="${d.id}">`, 'Changing this moves the public page; the old address stops working.')}</div>
        ${fld('Tagline', `<input value="${esc(d.tag)}">`)}
        ${fld('Region', `<input value="${esc(d.region)}">`)}
        ${fld('Intro', `<textarea rows="6">${esc(d.intro)}</textarea>`, 'Markdown, 2–3 paragraphs. **Bold** works; blank line = new paragraph.')}
        <div class="cat-2x cat-mp">
          <div class="a-field"><span class="cat-lbl" id="cat-bm">Best months</span><div class="cat-months" role="group" aria-labelledby="cat-bm">${MON.map((m, i) =>
            `<button type="button" aria-pressed="${d.months.includes(i + 1)}">${m}</button>`).join('')}</div></div>
          ${fld('Order', `<input type="number" value="${d.pos}" min="0" max="999">`, 'Lower shows first.')}
        </div>
      </section>
      <section class="cat-acts2"><button type="button" class="a-btn">Save changes</button><button type="button" class="a-btn ghost">Cancel</button></section>
      <section><h3 class="cat-h3">Danger zone</h3><div class="cat-danger"><div><small>${total ? `Delete is blocked while ${total} ${total === 1 ? 'package uses' : 'packages use'} this destination.` : 'No packages use this destination.'}</small></div>
        <button type="button" class="a-btn danger sm" ${total ? 'disabled' : ''}>Delete</button></div></section>
    </aside>`;
    const main = `<div class="cat-ds">
      <div class="a-head"><h1>Destinations</h1><p class="sub">6 destinations · 14 live packages · the order sets the home page and the Explore menu</p>
        <div class="acts"><a href="#" class="a-btn">${ICON.plus}New destination</a></div></div>
      <div class="a-split"><div class="cat-dgrid">${cards}</div>${panel}</div></div>`;
    return TS.adminShell('Destinations', main);
  }
  function dsMount(site, rerender) {
    each(site, '[data-ds]', 'click', (b) => { ds.sel = b.dataset.ds; rerender(); });
    each(site, '.cat-months button', 'click', (b) => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'));
  }

  /* =====================================================================
     4 · REVIEWS (moderation queue)
     ===================================================================== */
  const RV = [
    { id: 'r1', st: 'pending', name: 'Priya Raghavan', email: 'priya.raghavan@customer.in', pkg: 'Munnar & Alleppey Houseboat', img: 'img/kerala-1.jpg', r: 5, trav: 'Travelled Feb 2026', ref: 'TS-7F3K2Q', sent: '25 Sep 2026', lead: 'anjali', rating: [4.8, 91],
      text: 'The houseboat night was the best part of the trip — the crew cooked karimeen for us and moored right by a paddy field. Tea Valley\'s rooms face the estate, so ask for the upper floor.\n\nOur driver Biju waited an extra hour at Eravikulam without a word. Would book again for my parents.' },
    { id: 'r2', st: 'pending', name: 'Arjun Mehta', email: 'arjun.mehta88@customer.in', pkg: 'Leh · Nubra · Pangong', img: 'img/ladakh-1.jpg', r: 4, trav: 'Travelled Sep 2026', ref: 'TS-9A1B7C', sent: '24 Sep 2026', lead: 'rigzin', rating: [4.9, 57],
      text: 'The rest day in Leh made all the difference — nobody in our group of six got sick. Pangong camp was cold at night and the heaters only ran till 11, so carry a thermal. Rigzin knew every monastery caretaker by name.' },
    { id: 'r3', st: 'pending', name: 'Sneha Kulkarni', email: 'sneha.k@customer.in', pkg: 'North Goa Beaches', img: 'img/goa-3.jpg', r: 3, trav: 'Travelled Mar 2026', ref: 'TS-5G6H1J', sent: '21 Sep 2026', lead: 'meera', rating: [4.3, 143],
      text: 'Candolim is a great base and the Chapora sunset was worth the climb. The resort pool was closed for repairs for two of our three days and nobody told us before we arrived. Driver was always on time.' },
    { id: 'r4', st: 'published', name: 'Karthik Iyer', email: 'karthik.iyer@customer.in', pkg: 'Jaipur · Jodhpur · Udaipur', img: 'img/udaipur-1.jpg', r: 5, trav: 'Travelled Feb 2026', ref: 'TS-3K7L9M', sent: '3 Mar 2026', lead: 'meera', rating: [4.7, 76],
      text: 'Havelis over chain hotels was the right call. Meera booked the Mehrangarh audio guide before we asked and the Pichola boat at sunset was timed perfectly.' },
    { id: 'r5', st: 'published', name: 'Ananya Bose', email: 'ananya.bose@customer.in', pkg: 'Havelock Honeymoon', img: 'img/andaman-1.jpg', r: 5, trav: 'Travelled Jan 2026', ref: 'TS-2D8E4F', sent: '30 Jan 2026', lead: 'anjali', rating: [4.8, 22],
      text: 'Radhanagar at 7 am had maybe ten people on it. The ferry tickets were sorted before we landed, which is the part everyone else on the boat was stressed about.' },
    { id: 'r6', st: 'published', name: 'Rohit Sharma', email: 'rohit.sharma.dev@customer.in', pkg: 'Kasol Riverside Weekend', img: 'img/kasol-1.jpg', r: 4, trav: 'Travelled Apr 2026', ref: 'TS-8M2N4P', sent: '14 Apr 2026', lead: 'tenzin', rating: [4.6, 38],
      text: 'Good value for a weekend. The Volvo was on time both ways and the riverside tents were warmer than expected. Chalal trail is easy — do it in the morning.' },
    { id: 'r7', st: 'hidden', name: 'Vikas', email: 'goataxi.deals@customer.in', pkg: 'Old Goa & Dudhsagar Weekend', img: 'img/goa-6.jpg', r: 1, trav: 'Travelled Dec 2025', ref: 'TS-4Q9R2S', sent: '22 Sep 2026', lead: 'meera', rating: [4.5, 29],
      text: 'Call 98200 XXXXX for cheaper taxis in Goa, better than any agency. Jeep to Dudhsagar for half the price.' },
    { id: 'r8', st: 'hidden', name: 'Neha Gupta', email: 'neha.gupta21@customer.in', pkg: 'Goa Quiet Escape', img: 'img/goa-2.jpg', r: 2, trav: 'Travelled Jan 2026', ref: 'TS-6T3U8V', sent: '2 Feb 2026', lead: 'meera', rating: [4.4, 48],
      text: 'The cottage was fine but I am posting the manager\'s personal number here so others can reach him directly since the front desk never answered.' },
  ];
  const rv = { tab: 'pending', sel: 'r1', flash: '' };
  const RV_TOTAL = { pending: 0, published: 37, hidden: 0 }; // published rows beyond the 4 shown
  const RV_EMPTY = { pending: 'Nothing waiting. New reviews land here, and you get an email for each.', published: 'No published reviews yet.', hidden: 'No hidden reviews.' };
  function rvRender() {
    const counts = { pending: 0, published: 0, hidden: 0 };
    RV.forEach((x) => counts[x.st]++);
    const total = (k) => counts[k] + RV_TOTAL[k];
    const list = RV.filter((x) => x.st === rv.tab);
    const sel = list.find((x) => x.id === rv.sel) || list[0];
    const L = sel ? LEADERS[sel.lead] : null;
    const moves = (x) => `${x.st !== 'published' ? `<button type="button" class="a-btn" data-move="published" data-id="${x.id}">${ICON.check}Publish</button>` : ''}${x.st !== 'hidden' ? `<button type="button" class="a-btn ghost" data-move="hidden" data-id="${x.id}">${ICON.eye}Hide</button>` : ''}`;
    const stChip = (s) => ({ pending: '<span class="a-chip warn">Waiting</span>', published: '<span class="a-chip ok">Published</span>', hidden: '<span class="a-chip mute">Hidden</span>' })[s];
    const queue = list.length ? `<ul class="cat-rq">${list.map((x) => `<li><button type="button" data-rv="${x.id}" class="${sel && x.id === sel.id ? 'sel' : ''}" aria-pressed="${!!sel && x.id === sel.id}">
        ${th(x.img)}<span class="t"><span class="top">${TS.stars(x.r, false)}<b>${esc(x.name)}</b><small>${x.sent.replace(/ 2026$/, '')}</small></span>
        <small class="pk">${esc(x.pkg)}</small><span class="ex">${esc(x.text.split('\n')[0])}</span></span></button></li>`).join('')}</ul>
        ${rv.tab === 'published' ? `<p class="cat-pager"><span>Showing ${list.length} of ${total('published')} reviews</span><span><button type="button" class="a-btn ghost sm" disabled>${ICON.chevL}Newer</button><button type="button" class="a-btn ghost sm">Older${ICON.chevR}</button></span></p>` : ''}`
      : `<p class="a-empty">${RV_EMPTY[rv.tab]}</p>`;
    const pane = sel ? `<aside class="a-panel cat-rpane" aria-label="Review from ${esc(sel.name)}">
      <section class="hd"><span class="ph"><img src="${sel.img}" alt="${esc(sel.pkg)}"></span><div>${stChip(sel.st)}<b>${esc(sel.pkg)}</b><small>${sel.trav}</small></div></section>
      <section><div class="cat-big">${TS.stars(sel.r)}</div><p class="cat-rtext">${esc(sel.text).replace(/\n/g, '<br>')}</p>
        <p class="cat-who"><b>${esc(sel.name)}</b> · ${esc(sel.email)}</p></section>
      <section><dl class="a-kv">
        <div><dt>Booking</dt><dd><a href="#" class="cat-ref num">${sel.ref}</a></dd></div>
        <div><dt>Sent</dt><dd>${sel.sent}</dd></div>
        <div><dt>Led by ${V25}</dt><dd class="cat-ldd">${avatar(sel.lead, 22)}${L.name}</dd></div>
        <div><dt>Label ${V25}</dt><dd><span class="a-chip ok">${ICON.shield}Verified traveller</span></dd></div>
        <div><dt>Trip rating now</dt><dd>${sel.rating[0].toFixed(1)} from ${sel.rating[1]} reviews</dd></div>
      </dl></section>
      <section><div class="cat-acts2">${moves(sel)}</div>
        <small class="cat-mute">${sel.st === 'pending' ? 'Publishing recomputes the trip\'s rating and refreshes its pages. The text is the customer\'s — it is never edited.' : 'No confirm needed: either move is undone from the other tab.'}</small></section>
    </aside>` : `<aside class="a-panel cat-rpane"><section><p class="a-empty">Pick a review to read it in full.</p></section></aside>`;
    const main = `<div class="cat-rv">
      <div class="a-head"><h1>Reviews</h1><p class="sub">${total('pending')} waiting · ${total('published')} published · ${total('hidden')} hidden</p>
        <div class="acts"><a href="#" class="a-btn ghost">${ICON.mail}Review emails</a></div></div>
      <div class="a-kpis">
        <div class="a-kpi"><span class="k">Waiting</span><span class="v num">${total('pending')}</span><span class="d ${total('pending') ? 'down' : 'up'}">${total('pending') ? 'Oldest sent 21 Sep' : 'Queue clear'}</span></div>
        <div class="a-kpi"><span class="k">Average published</span><span class="v num">4.6</span><span class="d">across 15 trips</span></div>
        <div class="a-kpi"><span class="k">Published · Sep</span><span class="v num">7</span><span class="d up">+3 on August</span></div>
        <div class="a-kpi"><span class="k">Hidden</span><span class="v num">${total('hidden')}</span><span class="d">Spam or personal details</span></div>
      </div>
      ${rv.flash ? `<p class="a-note" role="status">${ICON.check}<span>${rv.flash}</span></p>` : ''}
      <div class="a-tabs" role="tablist" aria-label="Filter by state">${[['pending', 'Pending'], ['published', 'Published'], ['hidden', 'Hidden']].map(([k, l]) =>
        `<button type="button" role="tab" data-rt="${k}" aria-selected="${rv.tab === k}">${l} <span class="ct num">${total(k)}</span></button>`).join('')}</div>
      <div class="a-split"><div class="a-card flush cat-rqw"><div class="a-card-b">${queue}</div></div>${pane}</div></div>`;
    return TS.adminShell('Reviews', main);
  }
  function rvMount(site, rerender) {
    each(site, '[data-rt]', 'click', (b) => { rv.tab = b.dataset.rt; rv.sel = ''; rv.flash = ''; rerender(); });
    each(site, '[data-rv]', 'click', (b) => { rv.sel = b.dataset.rv; rv.flash = ''; rerender(); });
    each(site, '[data-move]', 'click', (b) => {
      const x = RV.find((r) => r.id === b.dataset.id); if (!x) return;
      x.st = b.dataset.move;
      rv.flash = x.st === 'published' ? `Published on the trip’s page — ${esc(x.name)}’s review moved to Published.` : `Hidden from the page — ${esc(x.name)}’s review moved to Hidden.`;
      rv.sel = '';
      rerender();
    });
  }

  /* =====================================================================
     5 · COUPONS (list + editor)
     ===================================================================== */
  const CP = [
    { code: 'WELCOME10', kind: 'percent', pct: 10, cap: 1000, min: 0, all: true, trips: 'Every package', start: '2026-09-15', end: '2027-09-14', uses: 37, limit: 1000, holds: 2, state: 'active', on: true },
    { code: 'DIWALI1500', kind: 'flat', amt: 1500, min: 30000, all: false, trips: 'Jaipur · Jodhpur · Udaipur, Jaisalmer Desert Nights', pkgs: ['jaipur', 'jais'], start: '2026-10-15', end: '2026-11-08', uses: 0, limit: 200, holds: 0, state: 'scheduled', on: true },
    { code: 'LADAKH2027', kind: 'flat', amt: 2000, min: 0, all: false, trips: 'Leh · Nubra · Pangong, Leh & Turtuk', pkgs: ['lehnp', 'leht'], start: '2026-09-01', end: '2027-03-31', uses: 4, limit: 100, holds: 0, state: 'paused', on: false },
    { code: 'HONEYMOON5', kind: 'percent', pct: 5, cap: 2500, min: 0, all: false, trips: 'Havelock Honeymoon, Munnar & Alleppey Houseboat', pkgs: ['hav', 'munnar'], start: '2026-08-01', end: '', uses: 25, limit: 25, holds: 0, state: 'used_up', on: true },
    { code: 'MONSOON750', kind: 'flat', amt: 750, min: 15000, all: true, trips: 'Every package', start: '2026-07-01', end: '2026-08-31', uses: 18, limit: 0, holds: 0, state: 'expired', on: true },
  ];
  const CP_STATE = { active: ['ok', 'Active'], paused: ['mute', 'Paused'], scheduled: ['info', 'Starts later'], expired: ['mute', 'Expired'], used_up: ['warn', 'Used up'] };
  const terms = (c) => (c.kind === 'flat' ? `${inr(c.amt)} off` : `${c.pct} % off${c.cap ? `, up to ${inr(c.cap)}` : ''}`);
  const cpDates = (c) => (c.end ? `${fmtIso(c.start)} – ${fmtIso(c.end)}` : `From ${fmtIso(c.start)}`);
  const cp = { f: 'all', sel: 'WELCOME10', kind: {} };
  const cpMatch = (c) => cp.f === 'all' || (cp.f === 'ended' ? c.state === 'expired' || c.state === 'used_up' : c.state === cp.f);
  function cpRender() {
    const c = CP.find((x) => x.code === cp.sel) || CP[0];
    const locked = c.uses > 0 || c.holds > 0;
    const kind = cp.kind[c.code] || c.kind;
    const uses = CP.reduce((s, x) => s + x.uses, 0);
    const rows = CP.map((x) => {
      const [tone, label] = CP_STATE[x.state];
      return `<tr data-cp="${x.code}" class="${x.code === c.code ? 'sel' : ''}" tabindex="0" aria-selected="${x.code === c.code}"${cpMatch(x) ? '' : ' hidden'}>
        <td><b class="cat-code">${x.code}</b><small>${esc(x.trips)}</small></td>
        <td>${terms(x)}${x.min ? `<small>on ${inr(x.min)} or more</small>` : ''}</td>
        <td><span class="cat-nx"><span class="d"><b class="num">${x.uses}</b>${x.limit ? ` <small>/ ${x.limit.toLocaleString('en-IN')}</small>` : ' <small>· no limit</small>'}</span>
          ${x.limit ? `<span class="a-meter" style="--v:${pct(x.uses, x.limit)}%;--h:${pct(x.holds, x.limit)}%" aria-hidden="true"></span>` : ''}${x.holds ? `<small>+${x.holds} in checkout</small>` : ''}</span></td>
        <td class="cat-hs"><small class="cat-dt">${cpDates(x)}</small></td>
        <td><span class="a-chip ${tone}">${label}</span></td>
        <td>${sw(x.on, `${x.code} on`)}</td></tr>`;
    }).join('');
    const disabled = locked ? 'disabled' : '';
    const lockNote = locked ? `<span class="hint cat-lk">${ICON.lock} Locked — the coupon is in use</span>` : '';
    const ex = 43998, raw = kind === 'flat' ? (c.amt || 0) : Math.floor(ex * (c.pct || 0) / 100), off = kind === 'flat' ? raw : Math.min(raw, c.cap || raw);
    const panel = `<aside class="a-panel cat-cpanel" aria-label="Edit ${c.code}">
      <section><div class="cat-strow"><h2 class="cat-h2 cat-code">${c.code}</h2><span class="a-chip ${CP_STATE[c.state][0]}">${CP_STATE[c.state][1]}</span></div>
        ${locked ? `<p class="cat-notice mute">Used ${c.uses} ${c.uses === 1 ? 'time' : 'times'}${c.holds ? ` · ${c.holds} checkouts holding it now` : ''}. Vouchers already carry this code and discount, so those stay as they are — dates, limits and packages can still change.</p>` : ''}</section>
      <section><h3 class="cat-h3">Code and discount</h3>
        <div class="a-row2">${fld('Code', `<input value="${c.code}" ${disabled} class="cat-code">`, locked ? '' : 'Customers type it in any case.')}
          <div class="a-field"><span class="cat-lbl">Type</span><div class="a-seg cat-kind" role="radiogroup" aria-label="Type">${[['percent', '% off'], ['flat', '₹ off']].map(([k, l]) =>
            `<button type="button" role="radio" data-kind="${k}" aria-checked="${kind === k}" aria-pressed="${kind === k}" ${disabled}>${l}</button>`).join('')}</div></div></div>
        ${lockNote}
        ${kind === 'flat' ? fld('₹ off the booking', `<input value="${c.amt || ''}" inputmode="numeric" placeholder="500" ${disabled}>`, 'Once per booking, whatever the party size.')
          : `<div class="a-row2">${fld('% off', `<input value="${c.pct || ''}" inputmode="numeric" placeholder="10" ${disabled}>`, 'Of the total after any deal, rounded down to the rupee.')}${fld('Up to ₹ (optional)', `<input value="${c.cap || ''}" inputmode="numeric" placeholder="1000">`, 'Blank = no cap.')}</div>`}
        <div class="cat-calc"><span class="cap">What a customer sees</span><span>On a <b>${inr(ex)}</b> booking for two</span>
          <span class="ln"><span>${c.code}${kind === 'percent' && raw > off ? ` · capped at ${inr(off)}` : ''}</span><b class="num">−${inr(off)}</b></span><span class="ln tot"><span>They pay</span><b class="num">${inr(ex - off)}</b></span></div></section>
      <section><h3 class="cat-h3">When and how often</h3>
        <div class="a-row2">${fld('Starts on', `<input type="date" value="${c.start}">`)}${fld('Last day (optional)', `<input type="date" value="${c.end}">`, 'Works until midnight IST. Blank = no end.')}</div>
        <div class="a-row2">${fld('Minimum booking ₹ (optional)', `<input value="${c.min || ''}" inputmode="numeric" placeholder="20000">`, 'The total after any deal.')}${fld('Total uses (optional)', `<input value="${c.limit || ''}" inputmode="numeric" placeholder="100">`, 'A use counts once the payment is captured. Each email can use it once.')}</div></section>
      <section><h3 class="cat-h3">Trips</h3>
        <label class="cat-chk"><input type="checkbox" class="cat-cb" ${c.all ? 'checked' : ''}><b>Every package</b></label>
        ${c.all ? '' : `<div class="cat-plist">${PK.filter((p) => p.status === 'live').map((p) => `<label class="cat-chk"><input type="checkbox" class="cat-cb" ${(c.pkgs || []).includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}</div>`}
        <label class="cat-chk top"><input type="checkbox" class="cat-cb" ${c.on ? 'checked' : ''}><b>On — customers can use it (off = paused)</b></label></section>
      <section class="cat-acts2"><button type="button" class="a-btn">Save coupon</button><button type="button" class="a-btn ghost">Cancel</button>
        <button type="button" class="a-btn danger" ${locked ? 'disabled' : ''}>Delete</button>
        ${locked ? '<small class="cat-mute">In use, so it can’t be deleted — switch it off instead.</small>' : ''}</section>
    </aside>`;
    const F = [['all', 'All', CP.length], ['active', 'Active', 1], ['scheduled', 'Starts later', 1], ['paused', 'Paused', 1], ['ended', 'Ended', 2]];
    const main = `<div class="cat-cp">
      <div class="a-head"><h1>Coupons</h1><p class="sub">${CP.filter((x) => x.state === 'active').length} active · ${uses} uses in all · a use counts once the payment is captured</p>
        <div class="acts"><a href="#" class="a-btn">${ICON.plus}New coupon</a></div></div>
      <div class="a-kpis">
        <div class="a-kpi"><span class="k">Active codes</span><span class="v num">1</span><span class="d">DIWALI1500 starts 15 Oct</span></div>
        <div class="a-kpi"><span class="k">Uses · September</span><span class="v num">14</span><span class="d up">WELCOME10 brings 12</span></div>
        <div class="a-kpi"><span class="k">Discount given · all time</span><span class="v num">${inr(58940)}</span><span class="d">across ${uses} bookings</span></div>
        <div class="a-kpi"><span class="k">In checkout now</span><span class="v num">2</span><span class="d">holds on WELCOME10</span></div>
      </div>
      <div class="a-bar"><div class="a-seg" role="group" aria-label="Filter">${F.map(([k, l, n]) => `<button type="button" data-cf="${k}" aria-pressed="${cp.f === k}">${l} <span class="num">${n}</span></button>`).join('')}</div></div>
      <div class="a-split"><div class="a-card flush"><div class="a-card-b"><div class="a-tw"><table class="a-table">
        <thead><tr><th>Code</th><th>Gives</th><th>Uses</th><th class="cat-hs">Dates</th><th>State</th><th>On</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>${panel}</div></div>`;
    return TS.adminShell('Coupons', main);
  }
  function cpMount(site, rerender) {
    each(site, '[data-cf]', 'click', (b) => { cp.f = b.dataset.cf; rerender(); });
    each(site, 'tr[data-cp]', 'click', (r, e) => { if (e.target.closest('.cat-sw')) return; cp.sel = r.dataset.cp; rerender(); });
    each(site, 'tr[data-cp]', 'keydown', (r, e) => { if (e.key === 'Enter') { cp.sel = r.dataset.cp; rerender(); } });
    each(site, '.cat-cp .cat-sw', 'click', (b) => {
      const code = b.closest('tr').dataset.cp, c = CP.find((x) => x.code === code);
      c.on = !c.on;
      if (c.state === 'active' && !c.on) c.state = 'paused'; else if (c.state === 'paused' && c.on) c.state = 'active';
      rerender();
    });
    each(site, '[data-kind]:not([disabled])', 'click', (b) => { cp.kind[cp.sel] = b.dataset.kind; rerender(); });
  }

  /* =====================================================================
     6 · SIGN IN (chrome-free; follows the style letter)
     ===================================================================== */
  const li = { st: 'normal' };
  const LI_MSG = {
    credentials: ['warn', 'Wrong email or password.'],
    rate_limited: ['warn', 'Too many attempts — wait a few minutes and try again.'],
    signedout: ['ok', 'You’re signed out.'],
  };
  function liRender() {
    const d = TS.adminDir;
    const m = LI_MSG[li.st];
    const photo = `<div class="cat-li-photo ph"><img src="img/ladakh-1.jpg" alt="Pangong lake, Ladakh"><p><b>Tripsmith admin</b>Packages, departures, bookings and the calendar — one owner, one login.</p></div>`;
    const form = `<form class="cat-li-form" novalidate onsubmit="return false">
        <a href="#" class="logo"><i></i>Tripsmith${d === 'C' ? '' : ' <small>admin</small>'}</a>
        <h1>Sign in</h1>
        <p class="cat-li-demo">${ICON.info}<span>Demo: <b>owner@tripsmith.demo</b> — use the password on the portfolio case study.</span></p>
        ${m ? `<p class="cat-li-msg ${m[0]}" role="${m[0] === 'ok' ? 'status' : 'alert'}">${m[1]}</p>` : ''}
        <div class="a-field"><label for="cat-li-e">Email</label><input id="cat-li-e" type="email" autocomplete="username" value="owner@tripsmith.demo"></div>
        <div class="a-field"><label for="cat-li-p">Password</label><span class="cat-li-pw"><input id="cat-li-p" type="password" autocomplete="current-password" placeholder="••••••••••"><button type="button" class="cat-li-show" aria-pressed="false">Show</button></span>
          <span class="hint cat-li-caps" hidden>Caps Lock is on.</span></div>
        <button type="submit" class="a-btn cat-li-go" ${li.st === 'rate_limited' ? 'disabled' : ''}>Sign in${ICON.arrowR}</button>
        <p class="cat-li-foot">Forgot your password? Email <a href="#">tripsmith.work@gmail.com</a>. · <a href="#">Back to the site</a></p>
        <p class="cat-li-foot">${ICON.lock} One owner account. Sign-up is off.</p>
      </form>`;
    const mock = `<div class="cat-li-mock" role="group" aria-label="Mockup state"><span>Mockup state</span><div class="a-seg">${[['normal', 'Default'], ['credentials', 'Wrong password'], ['rate_limited', 'Rate limited'], ['signedout', 'Signed out']].map(([k, l]) =>
      `<button type="button" data-li="${k}" aria-pressed="${li.st === k}">${l}</button>`).join('')}</div></div>`;
    const band = d === 'C' ? `<header class="cat-li-band"><a href="#" class="logo"><i></i>Tripsmith <small>Operator</small></a><span>Owner sign-in</span><a href="#" class="bk">Back to the site</a></header>` : '';
    return `<div class="adm" data-dir="${d}"><div class="cat-li">${band}<div class="cat-li-body">${d === "C" ? form + photo : photo + form}</div>${mock}</div></div>`;
  }
  function liMount(site, rerender) {
    each(site, '[data-li]', 'click', (b) => { li.st = b.dataset.li; rerender(); });
    each(site, '.cat-li-show', 'click', (b) => {
      const i = site.querySelector('#cat-li-p'); const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', show);
    });
    each(site, '#cat-li-p', 'keyup', (i, e) => { const c = site.querySelector('.cat-li-caps'); if (c && e.getModifierState) c.hidden = !e.getModifierState('CapsLock'); });
  }

  /* ---------- CSS (once, with the first register) ---------- */
  const css = `
  /* shared */
  .cat-v25 { font-size: 10px; padding: 1px 7px; letter-spacing: .04em; vertical-align: 2px; margin-left: 4px; }
  .cat-th { width: 56px; height: 40px; border-radius: 8px; flex: none; display: block; }
  .cat-mute { color: var(--mute); font-size: 12.5px; }
  .cat-h2 { font-size: 18px; letter-spacing: -.02em; }
  .cat-h3 { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); font-weight: 800; }
  .cat-lbl { font-size: 12.5px; font-weight: 700; }
  .cat-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .cat-sw { width: 38px; height: 22px; border-radius: 99px; border: 0; padding: 0; background: #C4CDD5; position: relative; cursor: pointer; flex: none; transition: background .2s; }
  .cat-sw i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(20,32,42,.25); transition: transform .3s var(--ease); }
  .cat-sw[aria-checked="true"] { background: var(--ok); } .cat-sw[aria-checked="true"] i { transform: translateX(16px); }
  .cat-sw[disabled] { opacity: .5; cursor: not-allowed; }
  .cat-cb { width: 17px; height: 17px; accent-color: var(--pri); flex: none; margin: 0; }
  .cat-in { font: 600 13px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 8px; padding: 6px 8px; background: var(--a-surf); color: var(--ink); width: 88px; min-width: 0; }
  .cat-in:focus { outline: 2px solid var(--pri); outline-offset: 0; border-color: transparent; }
  .cat-in.w-s { width: 58px; } .cat-in.w-xs { width: 42px; } .cat-in.w-date { width: 138px; } .cat-in.w-c { width: 170px; } .cat-in.w-full { width: 100%; } .cat-in.b { font-weight: 700; }
  .cat-rs { display: inline-flex; align-items: center; gap: 4px; color: var(--mute); font-weight: 700; font-size: 13px; }
  .cat-rs .w-full { width: 100%; } .a-field .cat-rs { display: flex; } .a-field .cat-rs input { font-size: 14px; padding: 9px 11px; border-radius: 10px; }
  .cat-notice { border-radius: 10px; padding: 8px 12px; font-size: 13px; font-weight: 700; margin: 0; }
  .cat-notice.ok { background: var(--ok-soft); color: var(--ok); } .cat-notice.warn { background: var(--warn-soft); color: var(--warn); } .cat-notice.mute { background: var(--bg2); color: var(--ink2); font-weight: 600; }
  .cat-rules { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .cat-rules li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
  .cat-rules li .ic { width: 16px; height: 16px; flex: none; margin-top: 1px; padding: 2px; border-radius: 50%; }
  .cat-rules li.ok .ic { color: #fff; background: var(--ok); } .cat-rules li.no .ic { color: #B42318; background: #FDECEA; }
  .cat-rules b { display: block; font-weight: 700; } .cat-rules small { color: var(--mute); }
  .cat-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .cat-acts2 { display: flex !important; flex-wrap: wrap; gap: 8px; align-items: center; }
  .cat-acts2 > small { flex-basis: 100%; }
  .cat-strow { display: flex; align-items: center; gap: 8px; } .cat-strow > :last-child { margin-left: auto; }
  .cat-2x { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
  .cat-swrow { display: flex; gap: 12px; align-items: flex-start; } .cat-swrow b { display: block; font-size: 14px; } .cat-swrow small { color: var(--mute); font-size: 12.5px; display: block; }
  .cat-danger { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .cat-danger + .cat-danger { border-top: 1px dashed var(--a-line); padding-top: 12px; margin-top: 12px; }
  .cat-danger b { display: block; } .cat-danger small { color: var(--mute); font-size: 12.5px; }
  .cat-up { display: grid; place-items: center; align-content: center; gap: 2px; border: 1.5px dashed var(--a-line); border-radius: 10px; background: transparent; color: var(--mute); font: 600 12.5px "DM Sans", sans-serif; cursor: pointer; padding: 12px; transition: border-color .2s, color .2s; }
  .cat-up:hover { border-color: var(--ink); color: var(--ink); } .cat-up b { color: inherit; font-size: 13px; } .cat-up small { font-weight: 500; font-size: 11.5px; } .cat-up .ic { width: 20px; height: 20px; }
  .cat-nx { display: grid; gap: 4px; min-width: 118px; } .cat-nx .a-meter { height: 6px; } .cat-nx small { color: var(--mute); font-size: 12px; } .cat-nx .d small { display: inline; }
  .cat-hs { } .adm .a-table tr[data-id], .adm .a-table tr[data-cp] { cursor: pointer; }
  .adm .a-table tr[hidden] { display: none; }
  .adm [hidden] { display: none !important; }

  /* packages */
  .cat-pk { display: grid; gap: inherit; min-width: 0; }
  .adm .main > .cat-pk, .adm .main > .cat-ed, .adm .main > .cat-ds, .adm .main > .cat-rv, .adm .main > .cat-cp { display: grid; gap: 18px; min-width: 0; }
  .adm[data-dir="B"] .main > div[class^="cat-"] { gap: 14px; } .adm[data-dir="C"] .main > div[class^="cat-"] { gap: 24px; }
  .cat-toolbar { display: flex; gap: 10px 16px; align-items: end; justify-content: space-between; flex-wrap: wrap; }
  .cat-toolbar .a-tabs { border-bottom: 0; }
  .cat-pn { display: flex; gap: 12px; align-items: center; min-width: 210px; } .cat-pn .t { display: grid; gap: 2px; justify-items: start; }
  .cat-dealchip { margin-top: 3px; }
  .cat-pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
  .cat-pcard { text-align: left; display: grid; gap: 5px; padding: 8px 8px 12px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); cursor: pointer; font: inherit; color: inherit; transition: border-color .2s, transform .3s var(--ease); }
  .cat-pcard:hover { border-color: var(--ink); transform: translateY(-2px); } .cat-pcard.sel { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri); }
  .cat-pcard .ph { aspect-ratio: 4 / 3; border-radius: calc(var(--a-r) - 6px); margin-bottom: 4px; } .cat-pcard .st { position: absolute; top: 8px; left: 8px; }
  .cat-pcard small { color: var(--mute); font-size: 12px; } .cat-pcard .a-meter { height: 5px; }
  .cat-prev .ph { aspect-ratio: 16 / 9; border-radius: 10px; }
  .cat-prev .ph .cap { position: absolute; inset: auto 0 0 0; padding: 26px 12px 10px; color: #fff; background: linear-gradient(transparent, rgba(12,20,28,.8)); font-size: 12px; }
  .cat-prev .ph .cap b { display: block; font-size: 16px; letter-spacing: -.02em; }
  .cat-drow { display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 10px; align-items: center; font-size: 13px; }
  .cat-drow small { display: block; color: var(--mute); font-size: 12px; } .cat-drow .m { display: grid; gap: 3px; } .cat-drow .a-meter { height: 6px; }

  /* package editor */
  .cat-back { display: inline-flex; align-items: center; gap: 4px; flex-basis: 100%; font-size: 13px; font-weight: 700; color: var(--pri); text-decoration: none; margin-bottom: -6px; }
  .cat-back .ic { width: 15px; height: 15px; }
  .cat-guard { display: flex; gap: 10px 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: var(--warn-soft); color: var(--ink); border: 1px solid #F3C9A0; border-radius: 12px; padding: 10px 14px; font-size: 13.5px; animation: cat-in .35s var(--ease); }
  .cat-guard > span { display: flex; gap: 8px; align-items: center; } .cat-guard .ic { width: 16px; height: 16px; color: var(--warn); } .cat-guard .acts { display: flex; gap: 8px; }
  @keyframes cat-in { from { opacity: 0; transform: translateY(-6px); } }
  .cat-ed-grid { display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 18px; align-items: start; }
  .cat-ed-rail { position: sticky; top: 12px; display: grid; gap: 12px; }
  .adm[data-dir="B"] .cat-ed-rail { top: 66px; }
  .cat-status section { gap: 12px !important; }
  .cat-ed-nav { display: grid; gap: 1px; }
  .cat-ed-nav a { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px; text-decoration: none; color: var(--ink2); font-weight: 600; font-size: 13px; border-left: 2px solid transparent; }
  .cat-ed-nav a:hover { background: var(--a-surf); color: var(--ink); }
  .cat-ed-nav a[aria-current="true"] { background: var(--pri-soft); color: var(--pri-ink); border-left-color: var(--pri); }
  .cat-ed-nav small { color: var(--mute); font-weight: 700; font-size: 11.5px; white-space: nowrap; }
  .cat-ed-nav .nw { font-style: normal; font-size: 9.5px; font-weight: 800; color: var(--pri); background: var(--pri-soft); border-radius: 99px; padding: 0 5px; margin-left: 2px; }
  .adm[data-dir="A"] .cat-ed-nav a[aria-current="true"] { background: var(--ink); color: #fff; border-left-color: var(--act); }
  .adm[data-dir="A"] .cat-ed-nav a[aria-current="true"] small { color: var(--ink-soft); }
  .adm[data-dir="C"] .cat-ed-nav { border-top: 2px solid var(--ink); padding-top: 6px; } .adm[data-dir="C"] .cat-ed-nav a { border-radius: 0; }
  .cat-ed-form { display: grid; gap: 16px; min-width: 0; }
  .adm[data-dir="C"] .cat-ed-form { gap: 30px; }
  .cat-sec { scroll-margin-top: 76px; }
  .cat-sec .a-card-b { display: grid; gap: 14px; }
  .cat-sec.flash { animation: cat-flash 1.1s var(--ease); }
  @keyframes cat-flash { 0% { box-shadow: 0 0 0 3px var(--pri); } 100% { box-shadow: 0 0 0 3px transparent; } }
  .cat-ro { background: var(--bg2) !important; color: var(--mute) !important; }
  .a-field label .ic { width: 12px; height: 12px; vertical-align: -1px; color: var(--mute); }
  .cat-pills { display: flex; gap: 6px; flex-wrap: wrap; }
  .cat-pills button { font: 600 13px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 99px; padding: 5px 12px; cursor: pointer; transition: background .2s, border-color .2s, color .2s; }
  .cat-pills button:hover { border-color: var(--ink); color: var(--ink); }
  .cat-pills button[aria-pressed="true"] { background: var(--pri); border-color: var(--pri); color: #fff; }
  .cat-pills.sm button { font-size: 12.5px; padding: 4px 10px; }
  .cat-lead { display: flex; gap: 8px; align-items: center; } .cat-lead select { flex: 1; min-width: 0; }
  .cat-lead.sm select { font: 600 12.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 8px; padding: 5px 6px; background: var(--a-surf); color: var(--ink); max-width: 150px; }
  .cat-ovr { display: block; font-size: 11px; color: var(--warn); font-weight: 700; margin-top: 3px; }
  .cat-days { display: grid; gap: 8px; }
  .cat-day, .cat-faq details { border: 1px solid var(--a-line); border-radius: 10px; background: var(--a-surf); }
  .cat-day summary, .cat-faq summary { list-style: none; display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; font-size: 13.5px; }
  .cat-day summary::-webkit-details-marker, .cat-faq summary::-webkit-details-marker { display: none; }
  .cat-day summary > b, .cat-faq summary > b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cat-day summary .ic, .cat-faq summary .ic { width: 16px; height: 16px; color: var(--mute); transition: transform .25s var(--ease); flex: none; }
  .cat-day[open] summary .ic, .cat-faq details[open] summary .ic { transform: rotate(180deg); }
  .cat-day .grip { color: var(--mute); letter-spacing: -2px; cursor: grab; font-weight: 800; }
  .cat-day .n { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; background: var(--ink); color: #fff; border-radius: 6px; padding: 2px 7px; flex: none; }
  .cat-day .meals { display: flex; gap: 3px; flex: none; }
  .cat-day .meals i { font-style: normal; font-size: 10.5px; font-weight: 800; width: 19px; height: 19px; display: grid; place-items: center; border-radius: 5px; background: var(--bg2); color: #9AA6B0; }
  .cat-day .meals i.on { background: var(--ok-soft); color: var(--ok); }
  .cat-day .body, .cat-faq .body { padding: 2px 12px 14px; display: grid; gap: 12px; border-top: 1px solid var(--a-line); padding-top: 12px; }
  .cat-foot { display: flex; gap: 8px 14px; align-items: center; flex-wrap: wrap; }
  .cat-foot .cat-mute { flex: 1 1 260px; }
  .cat-depw { border: 1px solid var(--a-line); border-radius: 10px; }
  .cat-dept td, .cat-dept th { padding-left: 8px !important; padding-right: 8px !important; }
  .cat-dept td { vertical-align: top; }
  .cat-sold { display: block; font-size: 11.5px; color: var(--ok); font-weight: 700; margin-top: 3px; }
  .cat-ic { white-space: nowrap; } .cat-ic .a-btn { padding: 5px 7px; } .cat-ic .a-btn .ic { width: 14px; height: 14px; }
  .cat-tiers { display: grid; gap: 8px; }
  .cat-tier { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--ink2); background: var(--bg2); border-radius: 10px; padding: 8px 10px; }
  .cat-tier .n { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--pri-ink); background: var(--pri-soft); border-radius: 6px; padding: 2px 7px; }
  .cat-ladder { display: grid; gap: 8px; }
  .cat-ladder .cap { font-size: 12px; color: var(--mute); font-weight: 600; }
  .cat-ladder ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); position: relative; }
  .cat-ladder ol::before { content: ""; position: absolute; left: 7px; right: 16.6%; top: 7px; height: 2px; background: var(--a-line); }
  .cat-ladder li { position: relative; display: grid; gap: 1px; padding-top: 22px; font-size: 12.5px; }
  .cat-ladder li::before { content: ""; position: absolute; top: 0; left: 0; width: 12px; height: 12px; border-radius: 50%; background: var(--a-surf); border: 2px solid #AEB9C2; }
  .cat-ladder li.on::before { background: var(--act); border-color: var(--act-ink); box-shadow: 0 0 0 4px color-mix(in srgb, var(--act) 25%, transparent); }
  .cat-ladder li b { font-size: 18px; letter-spacing: -.02em; } .cat-ladder li small { color: var(--mute); font-weight: 600; } .cat-ladder li em { font-style: normal; font-size: 11.5px; font-weight: 700; color: var(--ok); }
  .cat-ladder li:last-child em { color: var(--mute); }
  .cat-addons { display: grid; gap: 8px; }
  .cat-addon { display: grid; grid-template-columns: minmax(0, 1fr) auto 52px; gap: 12px; align-items: center; border: 1px solid var(--a-line); border-radius: 10px; padding: 10px; background: var(--a-surf); transition: opacity .2s; }
  .cat-addon.off { opacity: .6; background: var(--bg2); }
  .cat-addon .t { display: grid; gap: 5px; } .cat-addon .t .cat-in:not(.b) { color: var(--ink2); font-weight: 500; }
  .cat-addon .p { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; max-width: 330px; }
  .cat-addon .s { display: grid; justify-items: center; gap: 3px; } .cat-addon .s small { font-size: 11px; font-weight: 800; color: var(--mute); }
  .cat-max { font-size: 12px; color: var(--mute); font-weight: 600; display: inline-flex; gap: 4px; align-items: center; }
  .cat-checks { display: grid; gap: 8px; }
  .cat-checks label { display: flex; gap: 9px; align-items: flex-start; font-size: 13.5px; font-weight: 600; }
  .cat-checks label small { display: block; color: var(--mute); font-weight: 500; font-size: 12px; }
  .cat-checks .a-btn { justify-self: start; }
  .cat-item { display: flex; gap: 6px; }
  .cat-faq { display: grid; gap: 8px; } .cat-self { justify-self: start; margin-top: 4px; }
  .cat-gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .cat-tile { margin: 0; display: grid; gap: 6px; border: 1px solid var(--a-line); border-radius: 10px; padding: 6px; background: var(--a-surf); }
  .cat-tile .ph { aspect-ratio: 4 / 3; border-radius: 7px; }
  .cat-tile .cov { position: absolute; top: 6px; left: 6px; background: rgba(20,32,42,.82); color: #fff; font-size: 11px; font-weight: 800; border-radius: 5px; padding: 1px 6px; }
  .cat-tile .tools { display: flex; gap: 2px; }
  .cat-tile .ic-b { border: 0; background: none; color: var(--mute); cursor: pointer; padding: 3px 5px; border-radius: 6px; font: 800 12px "DM Sans", sans-serif; letter-spacing: -2px; display: grid; place-items: center; }
  .cat-tile .ic-b:hover { background: var(--bg2); color: var(--ink); } .cat-tile .ic-b svg { width: 14px; height: 14px; } .cat-tile .ic-b.on { color: var(--act-ink); }
  .cat-tile .ic-b:last-child { margin-left: auto; }
  .cat-gal .cat-up { aspect-ratio: auto; min-height: 150px; }
  .cat-hotels { display: grid; gap: 10px; }
  .cat-hotel { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr) 76px 76px auto; gap: 10px; align-items: end; }
  .cat-savebar { position: sticky; bottom: 12px; z-index: 4; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: color-mix(in srgb, var(--a-surf) 92%, transparent); backdrop-filter: blur(8px); border: 1px solid var(--a-line); border-radius: 14px; padding: 10px 12px 10px 14px; box-shadow: 0 12px 30px -18px rgba(20,32,42,.45); }
  .cat-savebar .acts { margin-left: auto; display: flex; gap: 8px; }
  .cat-ed.is-dirty .cat-savebar { border-color: var(--act); box-shadow: 0 0 0 3px color-mix(in srgb, var(--act) 20%, transparent), 0 12px 30px -18px rgba(20,32,42,.45); }
  .adm[data-dir="A"] .cat-savebar { background: var(--ink); border-color: var(--ink); color: #fff; } .adm[data-dir="A"] .cat-savebar .cat-mute { color: var(--ink-soft); }
  .adm[data-dir="A"] .cat-savebar .a-btn.ghost { background: transparent; color: #fff; border-color: var(--ink-line); }
  .adm[data-dir="C"] .cat-savebar { border-radius: 0; border-width: 2px 0 0; border-color: var(--ink); box-shadow: none; }

  /* destinations */
  .cat-dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; min-width: 0; }
  .cat-dcard { text-align: left; display: grid; gap: 9px; padding: 8px 8px 12px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); cursor: pointer; font: inherit; color: inherit; transition: border-color .2s, transform .3s var(--ease), box-shadow .2s; }
  .cat-dcard:hover { border-color: var(--ink); transform: translateY(-2px); }
  .cat-dcard.sel { border-color: var(--pri); box-shadow: inset 0 0 0 1px var(--pri), 0 10px 24px -16px rgba(27,79,216,.6); }
  .cat-dcard .ph { aspect-ratio: 16 / 10; border-radius: calc(var(--a-r) - 6px); }
  .cat-dcard .ph::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 45%, rgba(12,20,28,.75)); }
  .cat-dcard .pos { position: absolute; z-index: 1; top: 8px; left: 8px; width: 26px; height: 26px; border-radius: 8px; background: var(--act); color: var(--ink); font-weight: 800; font-size: 13px; display: grid; place-items: center; }
  .cat-dcard .nm { position: absolute; z-index: 1; left: 12px; bottom: 10px; color: #fff; font-size: 12px; font-weight: 600; } .cat-dcard .nm b { display: block; font-size: 20px; letter-spacing: -.03em; }
  .cat-dcard .tg { font-size: 13px; color: var(--ink2); padding: 0 4px; min-height: 2.8em; }
  .cat-dcard .ft { display: flex; gap: 8px; align-items: center; padding: 0 4px; flex-wrap: wrap; } .cat-dcard .ft small { color: var(--mute); font-size: 12px; } .cat-dcard .grip { margin-left: auto; color: var(--mute); letter-spacing: -2px; font-weight: 800; cursor: grab; }
  .cat-mo { display: grid; grid-template-columns: repeat(12, 1fr); gap: 2px; padding: 0 4px; }
  .cat-mo i { font-style: normal; font-size: 10px; font-weight: 800; text-align: center; padding: 3px 0; border-radius: 4px; background: var(--bg2); color: #A3AEB8; }
  .cat-mo i.on { background: var(--ok-soft); color: var(--ok); }
  .cat-cover { display: grid; grid-template-columns: minmax(0, 1fr) 118px; gap: 10px; }
  .cat-cover .ph { aspect-ratio: 16 / 10; border-radius: 10px; }
  .cat-months { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .cat-months button { font: 700 12px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--mute); border-radius: 7px; padding: 6px 0; cursor: pointer; }
  .cat-months button[aria-pressed="true"] { background: var(--ok-soft); border-color: color-mix(in srgb, var(--ok) 40%, transparent); color: var(--ok); }
  .cat-mp { grid-template-columns: minmax(0, 1fr) 90px; }
  .cat-dpanel section, .cat-cpanel section { gap: 12px !important; }

  /* reviews */
  .cat-rq { list-style: none; margin: 0; padding: 0; }
  .cat-rq li + li { border-top: 1px solid var(--a-line); }
  .cat-rq button { width: 100%; text-align: left; display: flex; gap: 12px; align-items: flex-start; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 12px var(--a-pad); border-left: 3px solid transparent; }
  .adm[data-dir="C"] .cat-rq button { padding: 12px 10px; }
  .cat-rq button:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .cat-rq button.sel { background: var(--pri-soft); border-left-color: var(--pri); }
  .cat-rq .t { display: grid; gap: 3px; min-width: 0; flex: 1; }
  .cat-rq .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .cat-rq .top small { margin-left: auto; color: var(--mute); font-size: 12px; }
  .cat-rq .pk { color: var(--mute); font-size: 12px; font-weight: 600; }
  .cat-rq .ex { font-size: 13px; color: var(--ink2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cat-rq .stars, .cat-big .stars { display: inline-flex; gap: 1px; color: var(--act); align-items: center; }
  .cat-rq .stars svg { width: 13px; height: 13px; } .cat-big .stars svg { width: 20px; height: 20px; }
  .cat-rq .stars .off, .cat-big .stars .off { color: #D5DCE2; }
  .cat-pager { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px var(--a-pad); border-top: 1px solid var(--a-line); font-size: 12.5px; color: var(--mute); margin: 0; flex-wrap: wrap; }
  .cat-pager span:last-child { display: flex; gap: 6px; }
  .cat-rpane .hd { grid-template-columns: 72px minmax(0, 1fr); align-items: center; display: grid !important; }
  .cat-rpane .hd .ph { width: 72px; height: 54px; border-radius: 8px; }
  .cat-rpane .hd div { display: grid; gap: 2px; justify-items: start; } .cat-rpane .hd small { color: var(--mute); font-size: 12px; }
  .cat-rtext { font-size: 15px; line-height: 1.55; margin: 0; }
  .cat-who { font-size: 13px; color: var(--mute); margin: 0; } .cat-who b { color: var(--ink); }
  .cat-ref { color: var(--pri); font-weight: 800; letter-spacing: .04em; text-decoration: none; }
  .cat-ldd { display: inline-flex; gap: 6px; align-items: center; }
  .cat-rpane .a-kv dt .cat-v25 { margin-left: 2px; }
  .cat-rv .a-note { animation: cat-in .35s var(--ease); }

  /* coupons */
  .cat-code { font-family: ui-monospace, "SF Mono", Consolas, monospace; letter-spacing: .04em; font-weight: 800; }
  .cat-cp .a-table td small { max-width: 220px; }
  .cat-dt { white-space: nowrap; color: var(--ink2) !important; font-size: 12.5px !important; }
  .cat-lk { display: inline-flex; gap: 5px; align-items: center; font-weight: 700; } .cat-lk .ic { width: 12px; height: 12px; }
  .cat-kind { width: 100%; } .cat-kind button { flex: 1; padding: 9px 11px; }
  .cat-kind button[disabled] { opacity: .55; cursor: not-allowed; }
  .cat-calc { display: grid; gap: 4px; background: var(--bg2); border-radius: 10px; padding: 10px 12px; font-size: 13px; }
  .cat-calc .cap { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--a-th); }
  .cat-calc .ln { display: flex; justify-content: space-between; gap: 10px; } .cat-calc .ln b { color: var(--ok); } .cat-calc .tot { border-top: 1px solid var(--a-line); padding-top: 4px; } .cat-calc .tot b { color: var(--ink); font-size: 15px; }
  .cat-chk { display: flex; gap: 9px; align-items: center; font-size: 13.5px; }
  .cat-chk.top { border-top: 1px solid var(--a-line); padding-top: 12px; }
  .cat-plist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; }
  .cat-plist .cat-chk { font-size: 12.5px; }

  /* sign in */
  .cat-li { grid-column: 1 / -1; display: flex; flex-direction: column; min-height: 780px; position: relative; }
  .cat-li-body { flex: 1; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
  .cat-li-photo { min-height: 320px; }
  .cat-li-photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 40%, rgba(12,20,28,.78)); }
  .cat-li-photo p { position: absolute; z-index: 1; left: 32px; bottom: 32px; right: 32px; color: #fff; margin: 0; font-size: 15px; max-width: 42ch; }
  .cat-li-photo p b { display: block; font-size: 30px; font-weight: 800; letter-spacing: -.03em; }
  .cat-li-form { align-self: center; justify-self: center; width: min(400px, 100%); display: grid; gap: 14px; padding: 40px 24px; }
  .cat-li-form .logo small { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--act); font-weight: 800; }
  .cat-li-form h1 { font-size: 30px; letter-spacing: -.03em; }
  .cat-li-demo { display: flex; gap: 8px; align-items: flex-start; background: var(--pri-soft); color: var(--pri-ink); border-radius: 10px; padding: 9px 12px; font-size: 13px; font-weight: 600; margin: 0; }
  .cat-li-demo .ic { width: 16px; height: 16px; flex: none; margin-top: 1px; }
  .cat-li-msg { border-radius: 10px; padding: 9px 12px; font-size: 14px; font-weight: 700; margin: 0; animation: cat-in .35s var(--ease); }
  .cat-li-msg.warn { background: var(--warn-soft); color: var(--warn); } .cat-li-msg.ok { background: var(--ok-soft); color: var(--ok); }
  .cat-li-pw { position: relative; display: block; } .cat-li-pw input { padding-right: 64px !important; }
  .cat-li-show { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: none; color: var(--pri); font: 700 12.5px "DM Sans", sans-serif; cursor: pointer; padding: 6px 8px; }
  .cat-li-go { justify-content: center; padding: 12px 18px; font-size: 15px; border-radius: 12px; } .cat-li-go .ic { width: 16px; height: 16px; }
  .cat-li-foot { font-size: 12.5px; color: var(--mute); margin: 0; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .cat-li-foot a { color: inherit; } .cat-li-foot .ic { width: 13px; height: 13px; }
  .cat-li-mock { position: absolute; right: 12px; top: 12px; z-index: 3; display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,.94); border: 1px dashed #AEB9C2; border-radius: 12px; padding: 5px 5px 5px 10px; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); }
  .cat-li-mock .a-seg button { text-transform: none; letter-spacing: 0; }
  /* A · dark */
  .adm[data-dir="A"] .cat-li { background: var(--ink); }
  .adm[data-dir="A"] .cat-li .cat-li-form { color: #fff; }
  .adm[data-dir="A"] .cat-li .cat-li-form .logo { color: #fff; }
  .adm[data-dir="A"] .cat-li .a-field label { color: var(--ink-soft); }
  .adm[data-dir="A"] .cat-li .a-field input { background: #1C2B37; border-color: var(--ink-line); color: #fff; }
  .adm[data-dir="A"] .cat-li .cat-li-demo { background: rgba(27,79,216,.22); color: #C9D6FF; }
  .adm[data-dir="A"] .cat-li .cat-li-show { color: var(--act); }
  .adm[data-dir="A"] .cat-li .cat-li-go { background: var(--act); color: var(--ink); } .adm[data-dir="A"] .cat-li .cat-li-go:hover { background: var(--act-ink); }
  .adm[data-dir="A"] .cat-li .cat-li-foot { color: var(--ink-soft); }
  .adm[data-dir="A"] .cat-li .cat-li-msg.warn { background: rgba(242,169,59,.16); color: #F7C77A; } .adm[data-dir="A"] .cat-li .cat-li-msg.ok { background: rgba(31,122,77,.25); color: #9FDDBC; }
  .adm[data-dir="A"] .cat-li .cat-li-photo { margin: 14px 0 14px 14px; border-radius: 20px; }
  /* B · light, card over a tinted page */
  .adm[data-dir="B"] .cat-li { background: var(--bg2); }
  .adm[data-dir="B"] .cat-li .cat-li-body { grid-template-columns: 1fr; place-items: center; padding: 60px 16px; }
  .adm[data-dir="B"] .cat-li .cat-li-photo { display: none; }
  .adm[data-dir="B"] .cat-li .cat-li-form { background: #fff; border: 1px solid var(--a-line); border-radius: 16px; padding: 0 26px 26px; box-shadow: 0 24px 50px -30px rgba(20,32,42,.35); overflow: hidden; }
  .adm[data-dir="B"] .cat-li .cat-li-form::before { content: ""; height: 110px; margin: 0 -26px 4px; background: url("img/ladakh-1.jpg") center 60% / cover; }
  .adm[data-dir="B"] .cat-li .cat-li-form h1 { font-size: 24px; }
  /* C · ink band, form left, photo right */
  .adm[data-dir="C"] .cat-li { background: #fff; }
  .cat-li-band { background: var(--ink); color: var(--ink-soft); display: flex; align-items: center; gap: 18px; padding: 0 24px; min-height: 54px; font-size: 13.5px; font-weight: 700; flex-wrap: wrap; }
  .cat-li-band .logo { color: #fff; font-size: 17px; } .cat-li-band .logo small { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--act); font-weight: 800; margin-left: 4px; }
  .cat-li-band .bk { margin-left: auto; color: var(--ink-soft); text-decoration: none; } .cat-li-band .bk:hover { color: #fff; }
  .adm[data-dir="C"] .cat-li .cat-li-body { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); }
  .adm[data-dir="C"] .cat-li .cat-li-form { border-top: 3px solid var(--ink); padding-top: 22px; margin: 40px 24px; }
  .adm[data-dir="C"] .cat-li .cat-li-form > .logo { display: none; }
  .adm[data-dir="C"] .cat-li .cat-li-form h1 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; }
  .adm[data-dir="C"] .cat-li .cat-li-go { border-radius: 8px; }
  .adm[data-dir="C"] .cat-li .cat-li-photo { border-left: 1px solid var(--a-line); }
  .adm[data-dir="C"] .cat-li .cat-li-mock { top: 66px; }

  /* ---------- phone ---------- */
  @container site (max-width: 700px) {
    .cat-hs { display: none; }
    .cat-2x, .cat-mp { grid-template-columns: 1fr; }
    .cat-toolbar { align-items: stretch; } .cat-toolbar .a-bar { width: 100%; } .cat-toolbar .a-search { max-width: none; }
    .cat-pn { min-width: 0; } .cat-pn .cat-th { width: 44px; height: 34px; }
    .cat-nx { min-width: 88px; }
    .cat-pgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .cat-ed-grid { grid-template-columns: 1fr; }
    .cat-ed-rail { position: static; }
    .cat-ed-nav { display: flex; overflow-x: auto; gap: 4px; padding-bottom: 4px; border-top: 0 !important; }
    .cat-ed-nav a { flex: none; border: 1px solid var(--a-line); border-radius: 99px !important; padding: 6px 11px; background: var(--a-surf); }
    .cat-ed-nav a small { display: none; }
    .cat-addon { grid-template-columns: minmax(0, 1fr) 48px; } .cat-addon .p { grid-column: 1; grid-row: 2; justify-content: flex-start; } .cat-addon .s { grid-row: 1 / span 2; grid-column: 2; }
    .cat-in.w-c { width: 150px; }
    .cat-hotel { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cat-hotel > .a-field:first-child { grid-column: 1 / -1; }
    .cat-ladder li b { font-size: 15px; }
    .cat-savebar { bottom: 8px; } .cat-savebar .acts { margin-left: 0; width: 100%; } .cat-savebar .acts .a-btn { flex: 1; justify-content: center; }
    .adm[data-dir="B"] .cat-savebar { bottom: 72px; }
    .cat-dgrid { grid-template-columns: 1fr; }
    .cat-cover { grid-template-columns: 1fr; }
    .cat-plist { grid-template-columns: 1fr; }
    .cat-li-body, .adm[data-dir="C"] .cat-li .cat-li-body { grid-template-columns: 1fr; }
    .cat-li-photo { min-height: 200px; } .adm[data-dir="A"] .cat-li .cat-li-photo { margin: 12px 12px 0; }
    .cat-li-photo p { left: 18px; bottom: 16px; } .cat-li-photo p b { font-size: 22px; }
    .adm[data-dir="C"] .cat-li .cat-li-photo { order: -1; }
    .adm[data-dir="C"] .cat-li .cat-li-form { margin: 24px 16px; }
    .adm[data-dir="B"] .cat-li .cat-li-body { padding: 70px 14px 30px; }
    .cat-li-form { padding: 24px 16px 32px; }
    .cat-li-mock { left: 8px; right: 8px; top: 8px; overflow-x: auto; } .cat-li-mock > span { display: none; }
    .adm[data-dir="C"] .cat-li .cat-li-mock { top: auto; bottom: 8px; }
    .cat-li-band { padding: 8px 14px; gap: 10px; }
  }`;

  /* ---------- register ---------- */
  const reg = (id, label, note, render, mount, withCss) => TS.register({
    id, label, group: 'Admin redesign', admin: true, css: withCss ? css : undefined,
    variants: [{ id: 'A', name: 'Redesign', note, tradeoff: '', render, mount }],
  });

  reg('packages', 'Packages',
    'Today the list is a plain table (name, destination, nights, from, departure count, enquiries, status) and every question means opening the editor. The redesign adds a KPI strip (seats sold in the next 60 days, enquiries, deals needing attention), shows the next departure with a seat-fill meter on every row, adds a destination filter, sort and a photo view, and pins a preview panel beside the list: next three dates with seats, the same four publish checks the editor uses, and the deal notice. Click a row or card to preview it; tabs, search, destination and sort filter live.',
    pkRender, pkMount, true);
  reg('package', 'Package editor',
    'Today the editor is one long two-column form with Status, Gallery, Hotels and Danger zone crammed into a 320 px side column. The redesign gives it a sticky left rail — status with the four publish checks up top, then a section index with a live summary per section — and moves Gallery and Hotels into the main column where photos get room. Departures now show seats booked under capacity. The unsaved-changes guard becomes visible: a sticky save bar turns amber on the first edit, and Back to Packages asks before leaving. v2.5 fields sit in their own compact cards: trip leader (default + per departure), early-bird tiers with a live price ladder, deposit, add-ons, trip pack (meeting point, know before you go) and required traveller details.',
    edRender, edMount);
  reg('destinations', 'Destinations',
    'Today destinations are a table plus a separate editor page. The redesign puts both on one screen: cover-photo cards in home-page order (order badge, best-month strip, live/draft package count, next departure) and the editor in a side panel — cover, tagline, region, intro, a 12-month picker and order — so reordering and editing never lose the overview. Delete stays blocked while packages use the destination. Click a card to edit it.',
    dsRender, dsMount);
  reg('reviews', 'Reviews',
    'Today each review is a full-width card with Publish and Hide buttons stacked on the right. The redesign turns moderation into an inbox: a compact queue (stars, name, trip photo, first line) beside a reading pane with the full text, booking link, trip rating and the actions. v2.5 adds "Led by" (trip leader) and the Verified traveller label to the pane. Publish or Hide moves the review to its tab straight away, with no confirm, as today.',
    rvRender, rvMount);
  reg('coupons', 'Coupons',
    'Today the list and the editor are separate pages. The redesign keeps the list (code, what it gives, uses, dates, state, on switch) and opens the editor beside it. Uses get a meter with checkout holds shaded, and the editor shows what a customer actually pays on a sample booking, so a cap like WELCOME10\'s ₹1,000 is visible before saving. The lock rules are unchanged: once used, code, type and amount are read-only and delete is replaced by switching it off.',
    cpRender, cpMount);
  reg('login', 'Sign in',
    'Today sign-in is a half photo, half form page. The redesign keeps the same fields, demo notice and error copy, adds a show-password toggle, a caps-lock hint and a plain line that sign-up is off, and dresses the page in the chosen admin style: A dark ink with the Pangong photo in a rounded frame, B a light card with the photo as a header strip, C the Operator ink band over form and photo. The dashed "Mockup state" control previews the wrong-password, rate-limited and signed-out messages.',
    liRender, liMount);
})();

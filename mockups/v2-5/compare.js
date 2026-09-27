/* Tripsmith v2.5 · /compare?p=a,b,c (R39, with R40 urgency labels and R42 verified wording).
   Three layouts over one shared state: A sticky table · B aligned photo cards · C decision view. */
(() => {
  const TS = window.TS;
  const { inr, esc, ICON, stars, avatar, LEADERS } = TS;

  /* ---------- local data: what the compare page needs beyond the shared seed ---------- */
  const X = {
    manali: { alt: 'Snow-capped peaks above the pine forests of Manali', pickup: 'Delhi (Majnu ka Tilla)',
      deal: { kind: 'deal', now: 17499, tag: 'Pujo deal · ₹2,000 off', till: 'Book by Mon 5 Oct' },
      deps: [['2026-10-02', 3, 'fill'], ['2026-10-09', 9, 'sure'], ['2026-10-16', 14, '']], demand: 'Booked 7× this month',
      verdict: 'The fullest Parvati valley loop: 5 nights, three different stays and a slow village walk in Tosh.' },
    shimla: { alt: 'Snow bridge across the stream in Solang Valley near Manali', pickup: 'Chandigarh',
      deal: { kind: 'eb', now: 16999, tag: 'Early bird ₹1,500 off', till: 'Nov–Dec dates, book 45+ days ahead' },
      deps: [['2026-10-03', 6, 'likely'], ['2026-10-10', 12, 'sure'], ['2026-10-17', 2, 'fill']], demand: 'Booked 11× this month',
      verdict: 'The easy first Himachal trip: hotels all the way and a private sedan that picks you up in Chandigarh.' },
    kasol: { alt: 'The Parvati river running over boulders at Kasol', pickup: 'Delhi (Kashmere Gate ISBT)',
      deps: [['2026-10-02', 4, 'fill'], ['2026-10-09', 11, ''], ['2026-10-16', 16, '']], demand: 'Last booked 2 days ago',
      verdict: 'The cheapest way into the hills: leave Delhi on Friday night, back at your desk on Monday.' },
    leh: { alt: 'Pangong Lake under bare brown mountains in Ladakh', pickup: 'Leh airport',
      deps: [['2026-10-04', 5, 'likely'], ['2026-10-08', 8, 'sure'], ['2026-10-12', 12, '']], demand: 'Booked 4× this month',
      verdict: 'The big one: Khardung La, the Hunder dunes and sunrise at Pangong. Needs 7 days and a flight.' },
    munnar: { alt: 'Rows of tea bushes on the hills of Munnar', pickup: 'Kochi airport',
      deps: [['2026-10-03', 7, 'sure'], ['2026-10-10', 4, 'fill'], ['2026-10-17', 12, '']], demand: 'Booked 9× this month',
      verdict: 'Tea hills first, then a night on your own houseboat. Flights to Kochi are extra.' },
    jaipur: { alt: 'The pink sandstone facade of Hawa Mahal, Jaipur', pickup: 'Jaipur',
      deps: [['2026-10-09', 10, 'sure'], ['2026-10-23', 14, ''], ['2026-11-06', 16, '']], demand: 'Booked 5× this month',
      verdict: 'Three forts, three heritage hotels and a private car for the whole loop.' },
    goa: { alt: 'Coconut palms over the beach at Vagator, Goa', pickup: 'Goa airport (Mopa or Dabolim)',
      deps: [['2026-10-02', 8, ''], ['2026-10-09', 3, 'fill'], ['2026-10-16', 13, '']], demand: 'Booked 12× this month',
      verdict: 'Four easy beach days from a 4★ hotel. Breakfast only, so you eat where the locals do.' },
  };
  const DEFAULT = ['manali', 'shimla', 'kasol'];
  const CANCEL = 'Full refund until 30 days before departure';
  const PAY = 'Pay in full, or reserve with 25 % now';

  /* ---------- state (shared by the three layouts) ---------- */
  let ids = DEFAULT.slice();
  let diffOnly = false;
  let picking = false;
  let flash = false;
  const saved = { manali: true, kasol: true, leh: true, munnar: true };

  const P = (id) => Object.assign({ id }, TS.PKGS[id], X[id]);
  const now = (p) => (p.deal && p.deal.kind === 'deal' ? p.deal.now : p.from);
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MO[m - 1]}`; };
  const url = () => 'https://tripsmith.vercel.app/compare?p=' + ids.map((id) => TS.PKGS[id].slug).join(',');
  const pool = () => Object.keys(TS.PKGS).filter((id) => !ids.includes(id)).sort((a, b) => (saved[b] ? 1 : 0) - (saved[a] ? 1 : 0));

  /* ---------- cell renderers ---------- */
  const seatBadge = ([, n, k]) =>
    k === 'fill' ? `<span class="badge fill">Filling fast · ${n} left</span>`
      : k === 'likely' ? `<span class="badge fill">Likely to sell out · ${n} left</span>`
        : k === 'sure' ? `<span class="badge sure">${ICON.check}Guaranteed · ${n} left</span>`
          : `<span class="badge muted">${n} seats left</span>`;
  const priceCell = (p) => {
    const d = p.deal;
    const main = `<b class="num cmp-pr">${inr(now(p))}</b>`;
    if (d && d.kind === 'deal') return `<div class="cmp-price">${main}<span class="deal"><s class="num">${inr(p.from)}</s><span class="tag">${esc(d.tag)}</span></span><small>${esc(d.till)}</small></div>`;
    if (d && d.kind === 'eb') return `<div class="cmp-price">${main}<span class="deal"><span class="tag">${esc(d.tag)}</span></span><small>${inr(d.now)} on ${esc(d.till)}</small></div>`;
    return `<div class="cmp-price">${main}<small>No offer running on this trip</small></div>`;
  };
  const list = (a, cls = '') => `<ul class="cmp-li ${cls}">${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const depsCell = (p) => `<ul class="cmp-deps">${p.deps.map((d) => `<li><span class="d num">${day(d[0])}</span>${seatBadge(d)}</li>`).join('')}</ul><p class="cmp-dem">${ICON.users}${esc(p.demand)}</p>`;
  const ratingCell = (p) => `<div class="cmp-rt">${stars(p.rating)}<span class="fine"><b class="num">${p.reviews}</b> verified reviews</span></div>`;
  const leaderCell = (p) => { const l = LEADERS[p.leader]; return `<div class="cmp-ld">${avatar(p.leader, 34)}<span><b>${esc(l.name)}</b><small>${l.years} yrs · ${esc(l.langs)}</small></span></div>`; };
  const incl = (icon, s) => `<p class="cmp-inc">${ICON[icon]}<span>${esc(s)}</span></p>`;

  const ROWS = [
    { k: 'price', g: 'Price and dates', l: 'Price from', sub: 'Per person, twin sharing', v: (p) => now(p) + (p.deal ? p.deal.tag : ''), h: priceCell },
    { k: 'deps', g: 'Price and dates', l: 'Next departures', sub: 'Seats left at 10:40 IST', v: (p) => JSON.stringify(p.deps), h: depsCell },
    { k: 'nights', g: 'The trip', l: 'Duration', v: (p) => p.nights, h: (p) => `<b class="num">${p.nights} nights</b> · ${p.nights + 1} days` },
    { k: 'places', g: 'The trip', l: 'Places', v: (p) => p.places.join(), h: (p) => `<p class="cmp-route">${p.places.map(esc).join(`<i aria-hidden="true">→</i>`)}</p>` },
    { k: 'pickup', g: 'The trip', l: 'Starts from', v: (p) => p.pickup, h: (p) => `<p class="cmp-inc">${ICON.pin}<span>${esc(p.pickup)}</span></p>` },
    { k: 'hotels', g: 'The trip', l: 'Stays', v: (p) => p.hotels.join(), h: (p) => list(p.hotels, 'bed') },
    { k: 'meals', g: 'What is included', l: 'Meals', v: (p) => p.meals, h: (p) => incl('utensils', p.meals) },
    { k: 'transfers', g: 'What is included', l: 'Transfers', v: (p) => p.transfers, h: (p) => incl('arrowR', p.transfers) },
    { k: 'acts', g: 'What is included', l: 'Activities', v: (p) => p.activities, h: (p) => incl('camera', p.activities) },
    { k: 'excl', g: 'What is included', l: 'Not included', v: (p) => p.excl.join(), h: (p) => list(p.excl, 'no') },
    { k: 'rating', g: 'People', l: 'Rating', sub: 'All reviews from travellers who completed this trip', v: (p) => p.rating + '/' + p.reviews, h: ratingCell },
    { k: 'leader', g: 'People', l: 'Trip leader', v: (p) => p.leader, h: leaderCell },
    { k: 'cancel', g: 'Booking terms', l: 'Cancellation', v: () => CANCEL, h: () => incl('shield', CANCEL) },
    { k: 'pay', g: 'Booking terms', l: 'Payment', v: () => PAY, h: () => incl('rupee', PAY) },
  ];

  /* winners power the "Lowest price" style tags in C and the small crowns in A/B */
  const winners = (ps) => {
    const w = {};
    if (ps.length < 2) return w;
    const best = (f, lab, max) => {
      const vals = ps.map(f), t = max ? Math.max(...vals) : Math.min(...vals);
      if (vals.filter((v) => v === t).length === 1) w[ps[vals.indexOf(t)].id + ':' + lab.k] = lab.t;
    };
    best(now, { k: 'price', t: 'Lowest price' }, false);
    best((p) => p.nights, { k: 'nights', t: 'Longest trip' }, true);
    best((p) => p.rating, { k: 'rating', t: 'Top rated' }, true);
    best((p) => p.reviews, { k: 'reviews', t: 'Most reviewed' }, true);
    best((p) => p.deps.reduce((s, d) => s + d[1], 0), { k: 'deps', t: 'Most seats open' }, true);
    return w;
  };
  const winTag = (w, id, k) => (w[id + ':' + k] ? `<span class="cmp-win">${ICON.check}${w[id + ':' + k]}</span>` : '');

  function model() {
    const ps = ids.map(P);
    const rows = ROWS.map((r) => {
      const d = ps.length > 1 && new Set(ps.map(r.v).map(String)).size > 1;
      return Object.assign({}, r, { d, cells: ps.map((p) => r.h(p)) });
    });
    const only = diffOnly && ps.length > 1;
    return { ps, rows, vis: only ? rows.filter((r) => r.d) : rows, nd: rows.filter((r) => r.d).length, w: winners(ps), slot: ps.length < 3 };
  }

  /* ---------- shared chrome ---------- */
  const heart = (p) => `<button class="cmp-heart" data-act="save" data-id="${p.id}" aria-pressed="${!!saved[p.id]}" aria-label="Save ${esc(p.name)}" title="${saved[p.id] ? 'Saved' : 'Save'}">${ICON.heart}</button>`;
  const rm = (p) => `<button class="cmp-x" data-act="rm" data-id="${p.id}" aria-label="Remove ${esc(p.name)} from compare" ${ids.length < 2 ? 'disabled title="Keep at least one trip"' : 'title="Remove"'}>${ICON.x}</button>`;
  const ctas = (p, cls = 'sm') => `<div class="cmp-cta"><a class="btn ${cls}" href="#">Book now</a><a class="btn line ${cls}" href="#">Enquire</a></div>`;
  const addSlot = () => {
    const free = 3 - ids.length;
    return `<div class="cmp-add"><button class="cmp-addbtn" data-act="add" aria-expanded="${picking}">${ICON.plus}<span><b>Add a trip</b><small>${free} of 3 slots free</small></span></button>
      ${picking ? `<ul class="cmp-pick" aria-label="Your saved and recently viewed trips">${pool().map((id) => { const p = P(id); return `<li><button data-act="pick" data-id="${id}"><span class="ph"><img src="${p.img}" alt=""></span><span class="t"><b>${esc(p.name)}</b><small>${p.nights} nights · from <span class="num">${inr(now(p))}</span></small></span>${saved[id] ? '<span class="badge new">Saved</span>' : ''}</button></li>`; }).join('')}</ul>`
        : `<p class="fine">Pick from your saved trips or anything you viewed this week.</p>`}</div>`;
  };
  function head(m, title) {
    const n = m.ps.length;
    return `${TS.header('Trips')}
      <div class="wrap cmp-hd"><div class="cmp-hd-t">
        <div class="crumbs"><a href="#">Trips</a><span>/</span><a href="#">Saved (4)</a><span>/</span><span>Compare</span></div>
        <h1>${title || `Compare ${n} trip${n === 1 ? '' : 's'}`}</h1>
        <p><span class="live">Live seats · updated 10:40 IST, Sun 27 Sep 2026</span></p></div>
        <div class="cmp-bar">
          <button class="cmp-tog" data-act="diff" aria-pressed="${diffOnly && n > 1}" ${n < 2 ? 'disabled' : ''}><i aria-hidden="true"></i>Show only differences<span class="num cmp-ct">${m.nd} of ${ROWS.length}</span></button>
          <div class="cmp-share"><label class="cmp-sr" for="cmp-url">Share link</label>${ICON.link}<input id="cmp-url" readonly value="${esc(url())}"><button data-act="copy">${ICON.copy}<span>Copy link</span></button></div>
          <span class="cmp-msg" role="status" aria-live="polite"></span>
        </div></div>`;
  }
  const key = `<span class="cmp-key"><i aria-hidden="true"></i>Highlighted rows differ between trips</span>`;
  const cellCls = (r, i) => (r.d ? `dif${flash ? ' fl' : ''}` : `same${flash ? ' fin' : ''}`) + (i != null ? `" style="--i:${i}` : '');
  const empty1 = (m) => (m.ps.length < 2 ? `<p class="demo cmp-one">${ICON.info}<span>Add a second trip to see where they differ. Rows stay the same until then.</span></p>` : '');

  /* ================= A · Sticky table ================= */
  const A = {
    id: 'A', name: 'Sticky table',
    note: 'A classic comparison table. Each trip is a column whose photo, price, ♡ and × stay pinned to the top of the window as you scroll the fact rows, grouped as Price and dates, The trip, What is included, People and Booking terms. Rows that differ carry a marigold tint and a bar on the row name; "Show only differences" collapses the rest and flashes what is left. On a phone the table becomes a sideways swipe region: row names stay in a pinned left column and each swipe snaps to the next trip, with the next one peeking in.',
    tradeoff: 'Densest and easiest to scan across, but the photos shrink to headers and the table reads as a spreadsheet more than a shop window.',
    render() {
      const m = model(), c = m.ps.length + (m.slot ? 1 : 0);
      let i = 0, lastG = '';
      const body = m.vis.map((r) => {
        const g = r.g !== lastG ? `<tr class="grp"><th colspan="${c + 1}" scope="colgroup"><span>${r.g}</span></th></tr>` : '';
        lastG = r.g;
        return `${g}<tr><th scope="row" class="lab${r.d ? ' dl' : ''}">${r.l}${r.sub ? `<small>${r.sub}</small>` : ''}</th>${r.cells.map((h, j) => `<td class="${cellCls(r, i++)}">${h}${winTag(m.w, m.ps[j].id, r.k)}</td>`).join('')}${m.slot ? '<td class="slot"></td>' : ''}</tr>`;
      }).join('');
      return `<div class="cmp cmpA">${head(m)}
        <div class="wrap">${empty1(m)}<div class="cmp-meta">${key}<span class="cmp-hint">Swipe sideways for the other trips. Row names stay put.</span></div>
        <div class="cmpA-scroll"><table class="cmpA-t" style="--c:${c}">
          <colgroup><col class="lab">${'<col>'.repeat(c)}</colgroup>
          <thead><tr><th class="lab" scope="col"><span class="eyebrow">${m.ps.length} trips · Himachal and beyond</span><span class="cmp-lg">From your compare tray</span></th>
          ${m.ps.map((p) => `<th scope="col" class="pk"><div class="pkA"><div class="ph"><img src="${p.img}" alt="${esc(p.alt)}"></div><div class="ov">${heart(p)}${rm(p)}</div>
            <span class="eyebrow">${esc(p.dest)} · ${p.nights}N</span><h3>${esc(p.name)}</h3><p class="pkA-p"><b class="num">${inr(now(p))}</b><small>per person</small></p></div></th>`).join('')}
          ${m.slot ? `<th scope="col" class="pk slot">${addSlot()}</th>` : ''}</tr></thead>
          <tbody>${body}
          <tr class="act"><th scope="row" class="lab">Ready?<small>Holds your seats for 15 min</small></th>${m.ps.map((p) => `<td>${ctas(p)}</td>`).join('')}${m.slot ? '<td class="slot"></td>' : ''}</tr></tbody>
        </table></div></div></div>`;
    },
    mount: (s, rr) => mountAll(s, rr),
  };

  /* ================= B · Photo cards ================= */
  const B = {
    id: 'B', name: 'Aligned photo cards',
    note: 'Each trip is a full card with a large photo, its ♡ and ×, rating and a one-line verdict; the facts run down the card in rows that line up across all three cards (CSS subgrid), so a long hotel list in one card pushes the matching row in the others. The row names sit in a quiet rail on the left and differing facts are tinted. On a phone the rail pins to the left edge and the cards swipe one at a time, with dots that track and jump between trips.',
    tradeoff: 'Feels like shopping rather than auditing, but at desktop width three tall cards need more scrolling than the table.',
    render() {
      const m = model(), c = m.ps.length + (m.slot ? 1 : 0), rows = m.vis.length + 2;
      let i = 0;
      const cells = m.ps.map((p, j) => `<article class="cardB" aria-label="${esc(p.name)}">
          <div class="c top"><div class="ph"><img src="${p.img}" alt="${esc(p.alt)}"><div class="ov">${heart(p)}${rm(p)}</div><span class="badge new cmpB-dest">${esc(p.dest)}</span></div>
            <div class="meta"><h3>${esc(p.name)}</h3>${stars(p.rating)}<p class="cmpB-v">${esc(p.verdict)}</p></div></div>
          ${m.vis.map((r) => `<div class="c ${cellCls(r, i++)}"><span class="cmpB-l" aria-hidden="true">${r.l}</span>${r.cells[j]}${winTag(m.w, p.id, r.k)}</div>`).join('')}
          <div class="c end"><p class="cmpB-tot"><span>from</span><b class="num">${inr(now(p))}</b></p>${ctas(p, '')}</div></article>`).join('');
      return `<div class="cmp cmpB">${head(m)}
        <div class="wrap">${empty1(m)}<div class="cmp-meta">${key}<span class="cmp-hint">Swipe between trips. Row names stay on the left.</span></div>
        <div class="cmpB-scroll"><div class="cmpB-g" style="--c:${c};--rows:${rows}">
          <div class="rail" aria-hidden="true"><div class="c top"><span class="eyebrow">What you get</span><p>${m.nd} of ${ROWS.length} facts differ</p></div>
            ${m.vis.map((r) => `<div class="c${r.d ? ' dl' : ''}"><b>${r.l}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</div>`).join('')}<div class="c end"></div></div>
          ${cells}${m.slot ? `<div class="cardB add">${addSlot()}</div>` : ''}
        </div></div>
        <div class="cmp-dots" role="group" aria-label="Trips">${m.ps.map((p, j) => `<button data-act="dot" data-i="${j}" aria-pressed="${j === 0}" aria-label="Show ${esc(p.name)}"></button>`).join('')}</div>
        </div></div>`;
    },
    mount: (s, rr) => mountAll(s, rr),
  };

  /* ================= C · Decision view ================= */
  const C = {
    id: 'C', name: 'Decision view',
    note: 'Leads with the answer, not the spreadsheet. Top: one verdict card per trip with the photo, a plain-language "pick this if" line, earned tags (Lowest price, Longest trip, Top rated, Most seats open), the next departure and Book/Enquire. Below: "Where they differ", a matrix of only the differing facts with the winning cell marked, then a compact "Same on all trips" list that the differences toggle hides. On a phone the verdict cards swipe as a strip and the matrix shows one trip at a time beside pinned row names, switched by swiping or by the trip pills.',
    tradeoff: 'Fastest route to a choice, but the verdict lines are editorial copy the owner has to write and keep honest per package.',
    render() {
      const m = model(), n = m.ps.length, c = n + (m.slot ? 1 : 0);
      const dif = m.rows.filter((r) => r.d), same = m.rows.filter((r) => !r.d);
      let i = 0;
      const tags = (p) => ['price', 'nights', 'rating', 'reviews', 'deps'].map((k) => (m.w[p.id + ':' + k] ? `<span class="badge sure">${ICON.check}${m.w[p.id + ':' + k]}</span>` : '')).join('');
      const verd = m.ps.map((p) => `<article class="vc" aria-label="${esc(p.name)}"><div class="ph"><img src="${p.img}" alt="${esc(p.alt)}"><div class="ov">${heart(p)}${rm(p)}</div></div>
          <div class="b"><div class="vc-t"><span class="eyebrow">${esc(p.dest)} · ${p.nights} nights</span><h3>${esc(p.name)}</h3></div>
          <div class="tags">${tags(p) || '<span class="badge muted">No clear win on the numbers</span>'}</div>
          <p class="why"><span>Pick this if you want</span>${esc(p.verdict)}</p>
          <div class="foot"><div><small>from</small><b class="num">${inr(now(p))}</b></div><div class="nx"><small>Next: ${day(p.deps[0][0])}</small>${seatBadge(p.deps[0])}</div></div>
          ${ctas(p, '')}</div></article>`).join('');
      const mx = n < 2 ? '' : `<div class="cmpC-pills" role="group" aria-label="Show trip">${m.ps.map((p, j) => `<button data-act="dot" data-i="${j}" aria-pressed="${j === 0}">${esc(p.places[0])}<small>${p.nights}N</small></button>`).join('')}</div>
        <div class="cmpC-mx" role="table" aria-label="Facts that differ" style="--c:${n}">
          <div class="mxr mxh" role="row"><span class="rl" role="columnheader">Fact</span>${m.ps.map((p) => `<span role="columnheader" class="mxc"><span class="ph"><img src="${p.img}" alt=""></span><b>${esc(p.name)}</b></span>`).join('')}</div>
          ${dif.map((r) => `<div class="mxr" role="row"><span class="rl" role="rowheader"><b>${r.l}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</span>${r.cells.map((h, j) => `<span role="cell" class="mxc ${m.w[m.ps[j].id + ':' + r.k] ? 'won ' : ''}${cellCls(r, i++)}">${winTag(m.w, m.ps[j].id, r.k)}${h}</span>`).join('')}</div>`).join('')}
        </div>`;
      return `<div class="cmp cmpC">${head(m, n > 1 ? `${n} trips, ${m.nd} real differences` : 'Compare trips')}
        <div class="wrap">
          <div class="cmpC-verd" style="--c:${c}">${verd}${m.slot ? `<div class="vc add">${addSlot()}</div>` : ''}</div>
          <div class="cmpC-h"><h2>Where they differ</h2>${key}</div>
          ${n < 2 ? empty1(m) : mx}
          ${diffOnly && n > 1 ? `<p class="cmpC-hid fine">${same.length} facts are the same on every trip and are hidden. <button class="cmp-link" data-act="diff">Show them</button></p>`
            : `<div class="cmpC-h"><h2>Same on ${n > 1 ? (n === 2 ? 'both trips' : 'all three') : 'this trip'}</h2><span class="fine">No need to compare these</span></div>
          <dl class="cmpC-same">${(n > 1 ? same : m.rows).map((r) => `<div class="${flash ? 'fin' : ''}"><dt>${r.l}</dt><dd>${r.cells[0]}</dd></div>`).join('')}</dl>`}
        </div></div>`;
    },
    mount: (s, rr) => mountAll(s, rr),
  };

  /* ---------- interactions (one delegated handler; re-assigned each render so it never stacks) ---------- */
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  async function copyLink(s, btn) {
    const inp = s.querySelector('#cmp-url'), msg = s.querySelector('.cmp-msg');
    let ok = false;
    try { await navigator.clipboard.writeText(inp.value); ok = true; } catch (_) {
      try { inp.focus(); inp.select(); ok = document.execCommand('copy'); } catch (__) { ok = false; }
    }
    if (!ok) { inp.focus(); inp.select(); }
    msg.textContent = ok ? `Link copied. It opens these ${ids.length} trips for anyone.` : 'Your browser blocked copying. The link is selected: press Ctrl+C.';
    const lab = btn.querySelector('span');
    if (ok) { lab.textContent = 'Copied'; btn.classList.add('ok'); setTimeout(() => { lab.textContent = 'Copy link'; btn.classList.remove('ok'); }, 2200); }
  }
  function swipe(s, sc, stepSel, gap) {
    const btns = [...s.querySelectorAll('[data-act="dot"]')];
    if (!sc || !btns.length) return;
    const step = () => { const el = sc.querySelector(stepSel); return el ? el.getBoundingClientRect().width + gap : 1; };
    sc.addEventListener('scroll', () => {
      const k = Math.min(btns.length - 1, Math.round(sc.scrollLeft / step()));
      btns.forEach((b, j) => b.setAttribute('aria-pressed', j === k));
    }, { passive: true });
    sc._go = (k) => sc.scrollTo({ left: k * step(), behavior: reduce() ? 'auto' : 'smooth' });
  }
  function mountAll(s, rerender) {
    const ch = document.querySelector('.chrome');
    s.style.setProperty('--cmp-top', (ch ? ch.offsetHeight : 0) + 'px');
    flash = false;
    const sc = s.querySelector('.cmpB-scroll') || s.querySelector('.cmpC-mx');
    if (s.querySelector('.cmpB-scroll')) swipe(s, sc, '.cardB', 10);
    else if (sc) swipe(s, sc, '.mxc:not(.rl)', 0);
    const inp = s.querySelector('#cmp-url');
    if (inp) inp.addEventListener('focus', () => inp.select());
    s.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !b.closest('.cmp')) return;
      const act = b.dataset.act, id = b.dataset.id;
      if (act === 'diff') { diffOnly = !diffOnly; flash = true; rerender(); }
      else if (act === 'save') {
        saved[id] = !saved[id];
        s.querySelectorAll(`.cmp-heart[data-id="${id}"]`).forEach((h) => {
          h.setAttribute('aria-pressed', !!saved[id]); h.title = saved[id] ? 'Saved' : 'Save';
          h.classList.remove('pop'); void h.offsetWidth; if (saved[id]) h.classList.add('pop');
        });
        const msg = s.querySelector('.cmp-msg');
        if (msg) msg.textContent = saved[id] ? `${TS.PKGS[id].name} saved. Find it under My trips → Saved.` : `${TS.PKGS[id].name} removed from Saved.`;
      } else if (act === 'rm') { if (ids.length > 1) { ids = ids.filter((x) => x !== id); picking = false; rerender(); } }
      else if (act === 'add') { picking = !picking; rerender(); }
      else if (act === 'pick') { if (ids.length < 3) ids.push(id); picking = false; flash = true; rerender(); }
      else if (act === 'copy') copyLink(s, b);
      else if (act === 'dot' && sc && sc._go) sc._go(+b.dataset.i);
    };
  }

  /* ---------- styles (scoped to .cmp) ---------- */
  const css = `
  .cmp { padding-bottom: 64px; }
  .cmp .cmp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .cmp > .top { border-bottom: 1px solid var(--line); }
  .cmp-hd { display: flex; justify-content: space-between; align-items: end; gap: 16px 24px; flex-wrap: wrap; padding: 20px 0 14px; }
  .cmp-hd h1 { font-size: clamp(28px, 3.4cqi, 40px); margin-top: 6px; }
  .cmp-hd-t p { margin-top: 8px; }
  .cmp-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .cmp-tog { display: inline-flex; align-items: center; gap: 10px; border: 1.5px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 7px 12px 7px 7px; font: 700 13.5px "DM Sans", sans-serif; cursor: pointer; }
  .cmp-tog i { width: 34px; height: 20px; border-radius: 999px; background: #C9CFD5; position: relative; transition: background .25s; flex: none; }
  .cmp-tog i::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .35s var(--ease); }
  .cmp-tog[aria-pressed="true"] { border-color: var(--pri); }
  .cmp-tog[aria-pressed="true"] i { background: var(--pri); }
  .cmp-tog[aria-pressed="true"] i::after { transform: translateX(14px); }
  .cmp-tog:disabled { opacity: .5; cursor: default; }
  .cmp-ct { font-size: 12px; color: var(--act-ink); background: color-mix(in srgb, var(--act) 18%, #fff); border-radius: 999px; padding: 2px 8px; }
  .cmp-share { display: flex; align-items: center; gap: 6px; border: 1.5px solid var(--line); border-radius: 12px; background: var(--bg2); padding-left: 10px; overflow: hidden; color: var(--mute); max-width: 100%; }
  .cmp-share input { border: 0; background: transparent; font: 600 13px "DM Sans", sans-serif; color: var(--ink2); padding: 9px 4px; width: 240px; min-width: 0; text-overflow: ellipsis; }
  .cmp-share input:focus { outline: none; }
  .cmp-share:focus-within { border-color: var(--pri); box-shadow: 0 0 0 3px var(--pri-soft); }
  .cmp-share button { display: inline-flex; align-items: center; gap: 6px; border: 0; border-left: 1.5px solid var(--line); background: #fff; color: var(--ink); font: 700 13px "DM Sans", sans-serif; padding: 9px 12px; cursor: pointer; white-space: nowrap; }
  .cmp-share button.ok { color: var(--ok); }
  .cmp-share button .ic { width: 16px; height: 16px; }
  .cmp-msg { flex-basis: 100%; text-align: right; font-size: 12.5px; font-weight: 700; color: var(--ok); min-height: 1em; }
  .cmp-msg:empty { display: none; }
  .cmp-meta { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin: 4px 0 10px; }
  .cmp-key { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: var(--ink2); }
  .cmp-key i { width: 16px; height: 12px; border-radius: 3px; background: color-mix(in srgb, var(--act) 16%, #fff); box-shadow: inset 3px 0 0 var(--act); }
  .cmp-hint { display: none; font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .cmp-one { margin-bottom: 12px; }

  /* diff tint + the motion: differing cells flash marigold when the toggle flips, returning rows ease in */
  .cmp .dif { background: color-mix(in srgb, var(--act) 11%, #fff); }
  .cmp .dif.fl { animation: cmpFlash 1.2s var(--ease) backwards; animation-delay: calc(min(var(--i, 0), 30) * 22ms); }
  .cmp .fin { animation: cmpIn .5s var(--ease) backwards; }
  @keyframes cmpFlash { 0% { background: color-mix(in srgb, var(--act) 60%, #fff); box-shadow: inset 0 0 0 2px var(--act); } 100% { background: color-mix(in srgb, var(--act) 11%, #fff); box-shadow: inset 0 0 0 2px transparent; } }
  @keyframes cmpIn { from { opacity: 0; transform: translateY(-6px); } }
  .cmp .dl { box-shadow: inset 3px 0 0 var(--act); }
  .cmp-heart.pop svg { animation: cmpPop .45s var(--ease); }
  @keyframes cmpPop { 40% { transform: scale(1.35); } }
  @media (prefers-reduced-motion: reduce) { .cmp .dif.fl, .cmp .fin, .cmp-heart.pop svg { animation: none; } }

  /* shared cell content */
  .cmp-price { display: grid; gap: 4px; justify-items: start; }
  .cmp-pr { font-size: 22px; letter-spacing: -.03em; font-weight: 800; }
  .cmp-price small, .cmp-ld small { color: var(--mute); font-size: 12px; font-weight: 600; display: block; }
  .cmp-li { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 14px; }
  .cmp-li li { padding-left: 16px; position: relative; }
  .cmp-li li::before { content: ""; position: absolute; left: 2px; top: .6em; width: 6px; height: 6px; border-radius: 2px; background: var(--pri); }
  .cmp-li.no li::before { background: none; content: "×"; width: auto; height: auto; top: -.05em; color: var(--warn); font-weight: 800; }
  .cmp-deps { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .cmp-deps li { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; }
  .cmp-deps .d { font-weight: 800; }
  .cmp-deps .badge .ic { width: 12px; height: 12px; }
  .cmp-dem { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--mute); font-weight: 700; margin-top: 8px; }
  .cmp-dem .ic { width: 14px; height: 14px; }
  .cmp-rt { display: grid; gap: 4px; }
  .cmp-ld { display: flex; gap: 10px; align-items: center; font-size: 14px; }
  .cmp-inc { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; }
  .cmp-inc .ic { width: 16px; height: 16px; color: var(--pri); margin-top: 2px; }
  .cmp-route { display: flex; flex-wrap: wrap; gap: 4px 6px; font-weight: 700; font-size: 14px; }
  .cmp-route i { font-style: normal; color: var(--mute); font-weight: 500; }
  .cmp-win { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 11.5px; font-weight: 800; color: var(--ok); background: var(--ok-soft); border-radius: 999px; padding: 3px 8px 3px 6px; }
  .cmp-win .ic { width: 12px; height: 12px; }
  .cmp-cta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cmp-cta .btn { padding-inline: 10px; }
  .cmp-heart, .cmp-x { width: 34px; height: 34px; border-radius: 50%; border: 0; background: rgba(255,255,255,.94); color: var(--ink); display: grid; place-items: center; cursor: pointer; box-shadow: 0 4px 12px -4px rgba(0,0,0,.35); }
  .cmp-heart .ic, .cmp-x .ic { width: 17px; height: 17px; }
  .cmp-heart[aria-pressed="true"] { color: #D1344B; }
  .cmp-heart[aria-pressed="true"] svg { fill: currentColor; }
  .cmp-x:disabled { opacity: .45; cursor: not-allowed; }
  .cmp .ov { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; z-index: 1; }
  .cmp-link { border: 0; background: none; color: var(--pri); font: 700 12.5px "DM Sans", sans-serif; cursor: pointer; padding: 0; text-decoration: underline; }

  /* add-a-trip slot */
  .cmp-add { display: grid; gap: 10px; align-content: start; }
  .cmp-addbtn { display: flex; gap: 12px; align-items: center; text-align: left; width: 100%; border: 2px dashed #B9C6DA; background: var(--bg2); color: var(--pri); border-radius: 14px; padding: 16px; cursor: pointer; font: inherit; }
  .cmp-addbtn:hover { border-color: var(--pri); }
  .cmp-addbtn > .ic { width: 34px; height: 34px; padding: 7px; border-radius: 50%; background: #fff; }
  .cmp-addbtn b { display: block; font-size: 15px; color: var(--ink); }
  .cmp-addbtn small { color: var(--mute); font-weight: 600; font-size: 12.5px; }
  .cmp-pick { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .cmp-pick button { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; border: 1.5px solid var(--line); background: #fff; border-radius: 12px; padding: 6px; cursor: pointer; font: inherit; color: var(--ink); }
  .cmp-pick button:hover { border-color: var(--pri); }
  .cmp-pick .ph { width: 48px; height: 40px; border-radius: 8px; flex: none; }
  .cmp-pick .t { flex: 1; min-width: 0; }
  .cmp-pick b { display: block; font-size: 13px; line-height: 1.25; }
  .cmp-pick small { font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .cmp-pick .badge { font-size: 10.5px; padding: 3px 7px; }

  /* ---------- A ---------- */
  .cmpA-t { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  .cmpA-t col.lab { width: 200px; }
  .cmpA-t thead th { position: sticky; top: var(--cmp-top, 0px); z-index: 3; background: #fff; vertical-align: bottom; text-align: left; padding: 12px 10px 14px; border-bottom: 1.5px solid var(--ink); font-weight: 400; }
  .cmpA-t thead th.lab { vertical-align: bottom; }
  .cmp-lg { display: block; font-size: 13px; color: var(--mute); font-weight: 600; margin-top: 4px; }
  .pkA { position: relative; display: grid; gap: 3px; }
  .pkA .ph { aspect-ratio: 2 / 1; border-radius: 12px; margin-bottom: 8px; }
  .pkA h3 { font-size: 18px; }
  .pkA-p { display: flex; gap: 6px; align-items: baseline; margin-top: 2px; }
  .pkA-p b { font-size: 16px; font-weight: 800; } .pkA-p small { color: var(--mute); font-size: 12px; font-weight: 600; }
  .cmpA-t th.slot { vertical-align: top; }
  .cmpA-t tbody th.lab { text-align: left; font-size: 14px; font-weight: 700; padding: 14px 12px; vertical-align: top; border-bottom: 1px solid var(--line); background: #fff; }
  .cmpA-t th.lab small { display: block; font-size: 12px; color: var(--mute); font-weight: 600; margin-top: 2px; line-height: 1.35; }
  .cmpA-t td { padding: 14px 12px; vertical-align: top; border-bottom: 1px solid var(--line); font-size: 14px; }
  .cmpA-t td.slot { background: repeating-linear-gradient(135deg, transparent 0 10px, #F6F8FB 10px 20px); }
  .cmpA-t tr.grp th { text-align: left; padding: 22px 12px 8px; border-bottom: 1px solid var(--line); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--pri); font-weight: 800; }
  .cmpA-t tr.act td, .cmpA-t tr.act th { border-bottom: 0; padding-top: 18px; }

  /* ---------- B ---------- */
  .cmpB-g { display: grid; grid-template-columns: 170px repeat(var(--c), minmax(0, 1fr)); grid-template-rows: repeat(var(--rows), auto); column-gap: 16px; position: relative; }
  .cmpB-g > .rail, .cmpB-g > .cardB { grid-row: 1 / span var(--rows); display: grid; grid-template-rows: subgrid; }
  .cmpB-g > .cardB.add { display: block; padding: 14px; border: 0; background: none; box-shadow: none; }
  .cardB { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fff; box-shadow: 0 26px 50px -42px rgba(20,32,42,.45); }
  .cardB > .c { padding: 12px 16px; border-top: 1px solid var(--line); font-size: 14px; }
  .cardB > .top { border-top: 0; padding: 0 0 14px; }
  .cardB .top .ph { aspect-ratio: 4 / 3; }
  .cmpB-dest { position: absolute; left: 10px; bottom: 10px; }
  .cardB .meta { padding: 14px 16px 0; display: grid; gap: 6px; align-content: start; }
  .cardB .meta h3 { font-size: 20px; }
  .cmpB-v { font-size: 13.5px; color: var(--ink2); }
  .cmpB-l { display: none; }
  .cardB > .end { display: grid; gap: 10px; align-content: end; padding: 14px 16px 16px; }
  .cmpB-tot { display: flex; align-items: baseline; gap: 6px; } .cmpB-tot span { color: var(--mute); font-size: 13px; font-weight: 600; } .cmpB-tot b { font-size: 24px; letter-spacing: -.03em; }
  .rail > .c { padding: 13px 8px 12px 12px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink2); background: #fff; }
  .rail > .c b { display: block; font-size: 13.5px; color: var(--ink); }
  .rail > .c small { display: block; font-size: 11.5px; color: var(--mute); font-weight: 600; line-height: 1.35; margin-top: 2px; }
  .rail > .top { border-top: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; padding-bottom: 14px; }
  .rail > .top p { font-weight: 800; font-size: 15px; color: var(--ink); }
  .rail > .end { border-top: 0; }
  .cmp-dots { display: none; justify-content: center; gap: 8px; margin-top: 14px; }
  .cmp-dots button { width: 10px; height: 10px; border-radius: 999px; border: 0; background: #C9CFD5; padding: 0; cursor: pointer; transition: width .3s var(--ease), background .3s; }
  .cmp-dots button[aria-pressed="true"] { width: 26px; background: var(--pri); }

  /* ---------- C ---------- */
  .cmpC-verd { display: grid; grid-template-columns: repeat(var(--c), minmax(0, 1fr)); gap: 16px; margin-top: 6px; }
  .vc { position: relative; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fff; display: grid; grid-template-rows: auto 1fr; box-shadow: 0 26px 50px -42px rgba(20,32,42,.45); }
  .vc.add { border: 0; box-shadow: none; overflow: visible; display: block; }
  .vc > .ph { aspect-ratio: 16 / 8; }
  .vc .b { padding: 16px; display: grid; gap: 12px; align-content: start; }
  .vc h3 { font-size: 20px; margin-top: 4px; }
  .vc .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .vc .tags .ic { width: 12px; height: 12px; }
  .vc .why { font-size: 15.5px; line-height: 1.45; font-weight: 600; border-left: 3px solid var(--act); padding-left: 12px; }
  .vc .why span { display: block; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); font-weight: 800; margin-bottom: 2px; }
  .vc .foot { display: flex; justify-content: space-between; align-items: end; gap: 10px; border-top: 1px solid var(--line); padding-top: 12px; }
  .vc .foot small { display: block; font-size: 12px; color: var(--mute); font-weight: 600; }
  .vc .foot b { font-size: 24px; letter-spacing: -.03em; }
  .vc .nx { text-align: right; display: grid; gap: 4px; justify-items: end; }
  .cmpC-h { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 36px 0 12px; }
  .cmpC-h h2 { font-size: 24px; }
  .cmpC-pills { display: none; gap: 6px; margin-bottom: 10px; }
  .cmpC-pills button { flex: 1; border: 1.5px solid var(--line); background: #fff; border-radius: 10px; padding: 7px 6px; font: 700 13px "DM Sans", sans-serif; color: var(--ink); cursor: pointer; }
  .cmpC-pills button small { display: block; font-size: 11px; color: var(--mute); font-weight: 600; }
  .cmpC-pills button[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-soft); color: var(--pri-ink); }
  .cmpC-mx { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: #fff; }
  .mxr { display: grid; grid-template-columns: 190px repeat(var(--c), minmax(0, 1fr)); }
  .mxr > * { padding: 14px 16px; border-top: 1px solid var(--line); font-size: 14px; }
  .mxr:first-child > * { border-top: 0; }
  .mxr .rl { background: #fff; box-shadow: inset 3px 0 0 var(--act); }
  .mxr .rl b { display: block; font-size: 14px; }
  .mxr .rl small { display: block; font-size: 11.5px; color: var(--mute); font-weight: 600; line-height: 1.35; margin-top: 2px; }
  .mxh > * { background: var(--bg2); display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
  .mxh .rl { box-shadow: none; background: var(--bg2); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); font-weight: 800; }
  .mxh .ph { width: 38px; height: 38px; border-radius: 50%; flex: none; }
  .mxc.won { box-shadow: inset 0 3px 0 var(--ok); }
  .mxc .cmp-win { margin: 0 0 8px; }
  .cmpC-hid { margin-top: 18px; }
  .cmpC-same { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; margin: 0; }
  .cmpC-same > div { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
  .cmpC-same dt { font-weight: 700; font-size: 14px; color: var(--ink2); }
  .cmpC-same dd { margin: 0; font-size: 14px; }

  /* ---------- phone ---------- */
  @container site (max-width: 700px) {
    .cmp-hd { padding-top: 14px; }
    .cmp-bar { width: 100%; }
    .cmp-tog { width: 100%; }
    .cmp-tog .cmp-ct { margin-left: auto; }
    .cmp-share { width: 100%; }
    .cmp-share input { flex: 1; width: auto; }
    .cmp-msg { text-align: left; }
    .cmp-meta { flex-direction: column; align-items: flex-start; gap: 4px; }
    .cmp-hint { display: block; }

    /* A: swipe region, pinned row names */
    .cmpA-scroll { overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-left: 100px; overscroll-behavior-x: contain; border-top: 1px solid var(--line); }
    .cmpA-t { width: calc(100px + var(--c) * 214px); }
    .cmpA-t col.lab { width: 100px; }
    .cmpA-t thead th { position: static; padding: 10px 8px 12px; }
    .cmpA-t th.lab { position: sticky !important; left: 0; z-index: 2; background: #fff; box-shadow: 8px 0 12px -10px rgba(20,32,42,.4); }
    .cmpA-t th.lab.dl { box-shadow: inset 3px 0 0 var(--act), 8px 0 12px -10px rgba(20,32,42,.4); }
    .cmpA-t tbody th.lab { font-size: 12.5px; padding: 12px 8px 12px 10px; }
    .cmpA-t th.lab small { font-size: 11px; }
    .cmpA-t thead th.lab .eyebrow { font-size: 10px; }
    .cmpA-t .cmp-lg { font-size: 11.5px; }
    .cmpA-t thead th:not(.lab), .cmpA-t td { scroll-snap-align: start; }
    .cmpA-t td { padding: 12px 10px; font-size: 13.5px; }
    .pkA h3 { font-size: 16px; }
    .cmpA-t tr.grp th { padding: 18px 0 6px; }
    .cmpA-t tr.grp th span { position: sticky; left: 10px; }
    .cmp-cta { grid-template-columns: 1fr; }

    /* B: pinned rail, cards swipe */
    .cmpB-scroll { overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-left: 98px; overscroll-behavior-x: contain; padding-bottom: 6px; }
    .cmpB-g { grid-template-columns: 88px repeat(var(--c), 236px); column-gap: 10px; width: max-content; }
    .cmpB-g > .rail { position: sticky; left: 0; z-index: 2; background: #fff; box-shadow: 8px 0 12px -10px rgba(20,32,42,.4); }
    .rail > .c { padding: 12px 6px 10px 2px; font-size: 12px; }
    .rail > .c b { font-size: 12.5px; }
    .rail > .c small { display: none; }
    .rail > .top p { font-size: 13px; }
    .cardB, .cmpB-g > .cardB.add { scroll-snap-align: start; }
    .cardB > .c { padding: 11px 12px; font-size: 13.5px; }
    .cardB .top .ph { aspect-ratio: 16 / 10; }
    .cardB .meta { padding: 12px 12px 0; } .cardB .meta h3 { font-size: 17px; }
    .cmp-dots { display: flex; }

    /* C: verdict strip + one-trip-at-a-time matrix */
    .cmpC-verd { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 86%; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; padding-bottom: 8px; overscroll-behavior-x: contain; }
    .vc { scroll-snap-align: start; }
    .cmpC-h { margin-top: 26px; } .cmpC-h h2 { font-size: 20px; }
    .cmpC-pills { display: flex; }
    .cmpC-mx { overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-left: 96px; overscroll-behavior-x: contain; }
    .mxr { grid-template-columns: 96px repeat(var(--c), calc(100cqi - 32px - 98px)); width: max-content; }
    .mxr > * { padding: 12px 12px; font-size: 13.5px; }
    .mxr .rl { position: sticky; left: 0; z-index: 2; padding-left: 10px; box-shadow: inset 3px 0 0 var(--act), 8px 0 12px -10px rgba(20,32,42,.4); }
    .mxh .rl { box-shadow: 8px 0 12px -10px rgba(20,32,42,.4); }
    .mxr .rl b { font-size: 12.5px; } .mxr .rl small { display: none; }
    .mxr > .mxc { scroll-snap-align: start; }
    .cmpC-same { grid-template-columns: 1fr; }
    .cmpC-same > div { grid-template-columns: 110px 1fr; }
  }`;

  TS.register({ id: 'compare', label: 'Compare', group: 'v2.5 · customer', css, variants: [A, B, C] });
})();

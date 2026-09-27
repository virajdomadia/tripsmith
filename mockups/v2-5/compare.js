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

  /* ---------- extra facts for D and E: Tripsmith's own comfort / adventure ratings and the night plan ---------- */
  const Z = {
    manali: { comfort: 3, adv: 4, cB: '3★ hotels, then a village homestay', aB: 'Village walks, optional Kheerganga trek',
      plan: [['Manali', 2, 'Snow Valley Resorts'], ['Kasol', 2, 'Parvati Kuteer'], ['Tosh', 1, 'Tosh homestay']] },
    shimla: { comfort: 3.5, adv: 2, cB: '3★ hotels and a private sedan', aB: 'Sightseeing, Solang is optional',
      plan: [['Shimla', 2, 'Hotel Willow Banks'], ['Manali', 2, 'Snow Valley Resorts']] },
    kasol: { comfort: 2, adv: 3, cB: 'Swiss tents by the river, overnight Volvo', aB: 'Chalal trail and a riverside camp',
      plan: [['Kasol', 2, 'Riverside camp']] },
    leh: { comfort: 3.5, adv: 5, cB: '4★ in Leh, camps at Nubra and Pangong', aB: 'Khardung La at 5,359 m, Hunder dunes',
      plan: [['Leh', 2, 'The Grand Dragon'], ['Nubra', 2, 'Nubra Organic Retreat'], ['Pangong', 1, 'Lakeside camp'], ['Leh', 1, 'The Grand Dragon']] },
    munnar: { comfort: 4.5, adv: 2, cB: '4★ tea resort and a private houseboat', aB: 'Estate walk and a backwater cruise',
      plan: [['Munnar', 3, 'Tea County'], ['Alleppey', 1, 'Private houseboat']] },
    jaipur: { comfort: 5, adv: 1, cB: 'Heritage hotels and a private car', aB: 'Forts and palaces at an easy pace',
      plan: [['Jaipur', 2, 'Umaid Mahal'], ['Jodhpur', 1, 'Ratan Vilas'], ['Udaipur', 2, 'Lake Pichola Hotel']] },
    goa: { comfort: 4, adv: 1.5, cB: '4★ waterfront hotel', aB: 'Beaches, a fort and a sunset cruise',
      plan: [['North Goa', 3, 'Acron Waterfront']] },
  };
  const PZ = (id) => Object.assign(P(id), Z[id]);
  const pairRows = (ps) => ROWS.map((r) => Object.assign({}, r, { d: ps.length > 1 && new Set(ps.map(r.v).map(String)).size > 1, cells: ps.map((p) => r.h(p)) }));

  /* ================= D · Head to head ================= */
  let vs = null, split = 50, nudged = false;
  const vsPair = () => {
    let pr = (vs || []).filter((id) => ids.includes(id));
    for (const id of ids) if (pr.length < 2 && !pr.includes(id)) pr.push(id);
    vs = pr;
    return pr;
  };
  const leanOf = (l) => (l >= 60 ? 0 : l <= 40 ? 1 : -1);
  const leanBar = (ps, l) => {
    const k = ps.length > 1 ? leanOf(l) : 0, p = ps[k];
    if (k < 0) return `<p class="vs-lean-t"><b>Even so far.</b> Drag the divider toward the trip you like more.</p>`;
    return `<p class="vs-lean-t"><span class="eyebrow">${ps.length > 1 ? 'Leaning towards' : 'Your pick'}</span><b>${esc(p.name)}</b><small>from <span class="num">${inr(now(p))}</span> · next ${day(p.deps[0][0])}, ${p.deps[0][1]} seats left</small></p>${ctas(p, 'sm')}`;
  };
  const D = {
    id: 'D', name: 'Head to head',
    note: 'Two trips go head to head on one full-bleed photo split. Drag the marigold "vs" handle (or focus it and use the arrow keys) and the photos, names and prices slide with it; lean past 60 % and the bar under the photo offers Book now and Enquire for the trip you are leaning towards. A third trip waits on the bench and swaps into either side. Below, a centre spine puts each fact between the two trips, with differing rows tinted and the winning side marked, then a night-by-night timeline shows where you sleep on each trip. On a phone the split stays full width at 300 px, the two trip names pin to the top while you scroll the spine, and each fact label sits above its two values.',
    tradeoff: 'The most memorable and photo-led layout, but only two trips are ever side by side, so a third one has to be swapped in.',
    render() {
      const m = model(), ps = vsPair().map(PZ), two = ps.length > 1;
      const bench = ids.filter((id) => !vs.includes(id)).map(PZ);
      const rows = pairRows(ps), w = winners(ps), nd = rows.filter((r) => r.d).length;
      const vis = diffOnly && two ? rows.filter((r) => r.d) : rows;
      const L = ps[0], R = ps[1];
      const cap = (p, side) => `<div class="vs-cap ${side}"><div class="ov">${heart(p)}${rm(p)}</div>
          <span class="eyebrow">${esc(p.dest)} · ${p.nights} nights</span><h2>${esc(p.name)}</h2>
          <p class="vs-pr"><b class="num">${inr(now(p))}</b><small>per person</small></p>${stars(p.rating)}
          <div class="vs-cap-cta">${ctas(p, 'sm')}</div></div>`;
      const stage = `<div class="vs-stage${two ? '' : ' one'}${!nudged && two ? ' intro' : ''}" style="--l:${two ? split : 100}">
          ${two ? `<div class="vs-side r ph"><img src="${R.img}" alt="${esc(R.alt)}"></div>` : ''}
          <div class="vs-side l ph"><img src="${L.img}" alt="${esc(L.alt)}"></div>
          <div class="vs-shade" aria-hidden="true"></div>
          ${cap(L, 'l')}${two ? cap(R, 'r') : ''}
          ${two ? `<div class="vs-div" role="slider" tabindex="0" aria-label="Divide the photo between ${esc(L.name)} and ${esc(R.name)}" aria-valuemin="15" aria-valuemax="85" aria-valuenow="${split}" aria-valuetext="${leanOf(split) < 0 ? 'Even' : 'Leaning ' + esc(ps[leanOf(split)].name)}"><span class="vs-knob">vs</span></div>` : ''}
        </div>`;
      const swapBtns = (b) => ps.map((p, k) => `<button class="btn line sm" data-act="vs-swap" data-id="${b.id}" data-k="${k}">Swap for ${esc(p.places[0])}</button>`).join('');
      const benchHtml = `<div class="vs-bench"><span class="eyebrow">${bench.length ? 'On the bench' : two ? 'In the ring' : 'Needs a rival'}</span>
          ${bench.map((b) => `<div class="vs-chip"><span class="ph"><img src="${b.img}" alt=""></span><span class="t"><b>${esc(b.name)}</b><small>${b.nights} nights · from <span class="num">${inr(now(b))}</span></small></span><span class="vs-chip-b">${swapBtns(b)}${heart(b)}${rm(b)}</span></div>`).join('')}
          ${two ? `<button class="btn line sm vs-flip" data-act="vs-flip">${ICON.arrowR}Swap sides</button>` : ''}
          ${m.slot ? addSlot() : ''}</div>`;
      let i = 0, lastG = '';
      const spine = vis.map((r) => {
        const g = r.g !== lastG ? `<div class="vs-g"><span>${r.g}</span></div>` : '';
        lastG = r.g;
        const v = (k) => `<div class="v ${k ? 'r' : 'l'}${w[ps[k].id + ':' + r.k] ? ' won' : ''}">${r.cells[k]}${winTag(w, ps[k].id, r.k)}</div>`;
        return `${g}<div class="vs-row ${cellCls(r, i++)}">${v(0)}<div class="k${r.d ? ' dl' : ''}"><b>${r.l}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</div>${two ? v(1) : ''}</div>`;
      }).join('');
      const maxN = Math.max(...ps.map((p) => p.nights));
      const lane = (p, k) => {
        let n = 0;
        const blocks = p.plan.map(([pl, c, h], j) => { const st = n + 1; n += c; return `<div class="nb" style="grid-column:${st} / span ${c};--j:${j + k * 4}"><b>${esc(pl)}</b><small>${c} night${c > 1 ? 's' : ''} · ${esc(h)}</small></div>`; }).join('');
        return `<div class="vs-lane" role="listitem" aria-label="${esc(p.name)}" style="--n:${maxN}"><span class="ln"><span class="ph"><img src="${p.img}" alt=""></span>${esc(p.places[0])}<small>${p.nights}N</small></span><div class="tr">${blocks}${n < maxN ? `<div class="nb home" style="grid-column:${n + 1} / span ${maxN - n}"><small>Home ${maxN - n} night${maxN - n > 1 ? 's' : ''} earlier</small></div>` : ''}</div></div>`;
      };
      return `<div class="cmp cmpD">${head(m, two ? `${esc(L.places[0])} <span class="vs-v">vs</span> ${esc(R.places[0])}` : 'Compare trips')}
        <div class="wrap">
          ${stage}
          <div class="vs-lean" aria-live="polite">${leanBar(ps, split)}</div>
          ${benchHtml}
          ${two ? '' : empty1(m)}
          <div class="cmpC-h"><h2>Fact by fact</h2>${two ? `<span class="fine">${nd} of ${ROWS.length} facts differ</span>` : ''}${key}</div>
          <div class="vs-spine${two ? '' : ' one'}">
            <div class="vs-heads"><span class="l">${esc(L.name)}</span><span class="k" aria-hidden="true">vs</span>${two ? `<span class="r">${esc(R.name)}</span>` : ''}</div>
            ${spine}
            <div class="vs-row act"><div class="v l">${ctas(L, '')}</div><div class="k"><b>Ready?</b><small>Holds your seats for 15 min</small></div>${two ? `<div class="v r">${ctas(R, '')}</div>` : ''}</div>
          </div>
          <div class="cmpC-h"><h2>Night by night</h2><span class="fine">Where you sleep each night</span></div>
          <div class="vs-tl" role="list" style="--n:${maxN}">
            <div class="vs-nights" aria-hidden="true"><span></span><div class="tr">${Array.from({ length: maxN }, (_, k) => `<span>Night ${k + 1}</span>`).join('')}</div></div>
            ${ps.map(lane).join('')}
          </div>
        </div></div>`;
    },
    mount(s, rr) {
      mountAll(s, rr);
      const base = s.onclick;
      s.onclick = (e) => {
        const b = e.target.closest('[data-act]');
        if (b && b.dataset.act === 'vs-swap') { vs[+b.dataset.k] = b.dataset.id; flash = true; rr(); return; }
        if (b && b.dataset.act === 'vs-flip') { vs.reverse(); split = 100 - split; rr(); return; }
        if (base) base(e);
      };
      const st = s.querySelector('.vs-stage'), dv = s.querySelector('.vs-div');
      if (!st || !dv) return;
      const ps = vs.map(PZ), lean = s.querySelector('.vs-lean');
      let lastK = leanOf(split);
      const set = (l) => {
        split = Math.round(Math.max(15, Math.min(85, l)));
        st.style.setProperty('--l', split);
        const k = leanOf(split);
        dv.setAttribute('aria-valuenow', split);
        dv.setAttribute('aria-valuetext', k < 0 ? 'Even' : 'Leaning ' + ps[k].name);
        st.classList.toggle('lean-l', k === 0); st.classList.toggle('lean-r', k === 1);
        if (k !== lastK) { lastK = k; lean.innerHTML = leanBar(ps, split); lean.classList.remove('in'); void lean.offsetWidth; lean.classList.add('in'); }
      };
      const stop = () => { if (st.classList.contains('intro')) { st.classList.remove('intro'); nudged = true; } };
      if (st.classList.contains('intro')) { if (reduce()) stop(); else setTimeout(stop, 2200); }
      set(split);
      const at = (e) => { const r = st.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; };
      let drag = false;
      st.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, a') || e.button > 0) return;
        drag = true; stop(); st.classList.add('drag'); st.setPointerCapture(e.pointerId); set(at(e));
      });
      st.addEventListener('pointermove', (e) => { if (drag) set(at(e)); });
      const end = () => { drag = false; st.classList.remove('drag'); };
      st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
      dv.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
        if (d != null) { e.preventDefault(); stop(); set(split + d); }
        else if (e.key === 'Home') { e.preventDefault(); set(15); } else if (e.key === 'End') { e.preventDefault(); set(85); }
      });
    },
  };

  /* ================= E · Your ranking ================= */
  const FAC = [
    { k: 'price', l: 'Low price', c: 'var(--pri)', f: (p) => now(p), inv: true, why: (p) => `from ${inr(now(p))}` },
    { k: 'comfort', l: 'Comfort', c: 'var(--act)', f: (p) => p.comfort, why: (p) => p.cB },
    { k: 'adv', l: 'Adventure', c: 'var(--warn)', f: (p) => p.adv, why: (p) => p.aB },
    { k: 'len', l: 'More days', c: 'var(--ok)', f: (p) => p.nights, why: (p) => `${p.nights} nights, ${p.places.length} places` },
    { k: 'rating', l: 'Reviews', c: '#6B3FA0', f: (p) => p.rating, why: (p) => `${p.rating.toFixed(1)} from ${p.reviews} travellers` },
  ];
  const LEVEL = ['Ignore', 'A little', 'Matters', 'A lot', 'Top priority'];
  const PRESETS = [
    { id: 'budget', l: 'Weekend on a budget', w: { price: 4, comfort: 1, adv: 2, len: 0, rating: 2 } },
    { id: 'comfort', l: 'Comfort first', w: { price: 1, comfort: 4, adv: 0, len: 2, rating: 3 } },
    { id: 'adv', l: 'Big adventure', w: { price: 1, comfort: 0, adv: 4, len: 3, rating: 2 } },
  ];
  const wt = { price: 3, comfort: 2, adv: 2, len: 1, rating: 2 };
  const openFacts = {};
  const RANGE = {};
  const rangeOf = (f) => {
    if (!RANGE[f.k]) { const v = Object.keys(TS.PKGS).map((id) => f.f(PZ(id))); RANGE[f.k] = [Math.min(...v), Math.max(...v)]; }
    return RANGE[f.k];
  };
  const normF = (f, p) => { const [a, b] = rangeOf(f); const x = b === a ? 1 : (f.f(p) - a) / (b - a); return f.inv ? 1 - x : x; };
  const scoreOf = (p) => {
    const tot = FAC.reduce((s, f) => s + wt[f.k], 0);
    const parts = FAC.map((f) => ({ f, n: normF(f, p), pts: tot ? (wt[f.k] * normF(f, p) / tot) * 100 : 0 }));
    return { tot, parts, score: Math.round(parts.reduce((s, x) => s + x.pts, 0)) };
  };
  const ranked = () => ids.map(PZ).map((p) => Object.assign(p, { sc: scoreOf(p) })).sort((a, b) => b.sc.score - a.sc.score || now(a) - now(b));
  const wq = () => '&w=' + FAC.map((f) => wt[f.k]).join('');
  const liveHtml = (p, rank, n) => {
    const { tot, parts, score } = p.sc;
    const strong = parts.filter((x) => wt[x.f.k] > 0 && x.n >= 0.6).sort((a, b) => b.pts - a.pts).slice(0, 2);
    return `<div class="sc-top"><span class="sc-rank num">${rank}</span><span class="sc-rk">${rank === 1 && n > 1 ? 'Best match for you' : `of ${n}`}</span>
        <span class="sc-score"><b class="num">${tot ? score : '–'}</b><small>/ 100 match</small></span></div>
      <div class="sc-bar" role="img" aria-label="${tot ? `Match ${score} out of 100: ${parts.filter((x) => x.pts >= 1).map((x) => `${x.f.l} ${Math.round(x.pts)}`).join(', ')}` : 'No weights set'}">${parts.map((x) => `<i style="width:${x.pts.toFixed(1)}%;background:${x.f.c}"></i>`).join('')}</div>
      <p class="sc-why">${tot ? (strong.length ? `Strong on ${strong.map((x) => `<b>${x.f.l.toLowerCase()}</b> (${esc(x.f.why(p))})`).join(' and ')}.` : 'No standout on what you picked; it sits mid-table on every count.') : 'Move a slider to rank the trips.'}</p>`;
  };
  const E = {
    id: 'E', name: 'Your ranking',
    note: 'The traveller tells the page what matters: five sliders for low price, comfort, adventure, more days and reviews, or one of three presets (Weekend on a budget, Comfort first, Big adventure). Each trip gets a match score out of 100 with a coloured bar showing where its points came from and a plain line on why, and the ranked tickets slide into their new order live as the sliders move. The weights ride in the share link. Every ticket keeps the photo, ♡, ×, price, next three departures, leader and Book/Enquire, and opens to the full fact list with differing rows tinted. On a phone the sliders sit in a compact panel above the list and each ticket stacks the photo over its facts, with fact labels in a pinned left column.',
    tradeoff: 'Answers "which one suits me" directly, but the comfort and adventure scores are Tripsmith\'s own ratings, so each ticket has to show what they are based on.',
    render() {
      const m = model(), rk = ranked(), n = rk.length;
      const hd = head(m, n > 1 ? 'Rank these trips your way' : 'Compare trips').replace(esc(url()), esc(url() + wq()));
      const sliders = FAC.map((f) => `<label class="sc-sl" style="--c:${f.c}"><span class="t"><i aria-hidden="true"></i>${f.l}<output class="lv">${LEVEL[wt[f.k]]}</output></span>
          <input type="range" min="0" max="4" step="1" value="${wt[f.k]}" data-f="${f.k}" aria-valuetext="${LEVEL[wt[f.k]]}" style="--v:${wt[f.k] * 25}%"></label>`).join('');
      const presetOn = (p) => FAC.every((f) => p.w[f.k] === wt[f.k]);
      const tickets = rk.map((p, j) => {
        const fr = m.vis.map((r) => `<div class="${cellCls(r)}"><dt>${r.l}</dt><dd>${r.h(p)}${winTag(m.w, p.id, r.k)}</dd></div>`).join('');
        return `<article class="sc-t${j === 0 && n > 1 ? ' first' : ''}" data-id="${p.id}" aria-label="${esc(p.name)}">
          <div class="ph"><img src="${p.img}" alt="${esc(p.alt)}"><div class="ov">${heart(p)}${rm(p)}</div><span class="badge new sc-dest">${esc(p.dest)} · ${p.nights}N</span></div>
          <div class="sc-b">
            <div class="sc-live">${liveHtml(p, j + 1, n)}</div>
            <h3>${esc(p.name)}</h3>
            <p class="cmp-route">${p.places.map(esc).join(`<i aria-hidden="true">→</i>`)}</p>
            <div class="sc-row"><div>${priceCell(p)}</div><div class="sc-ld">${leaderCell(p)}${ratingCell(p)}</div></div>
            <div class="sc-deps"><span class="eyebrow">Next departures</span>${depsCell(p)}</div>
            ${ctas(p, '')}
            <details class="sc-facts" data-id="${p.id}"${openFacts[p.id] ? ' open' : ''}><summary>${ICON.chevD}All ${diffOnly && n > 1 ? m.vis.length : ROWS.length} facts${n > 1 ? ` · ${m.nd} differ` : ''}</summary><dl>${fr}</dl></details>
          </div></article>`;
      }).join('');
      return `<div class="cmp cmpE">${hd}
        <div class="wrap">${empty1(m)}
          <div class="sc-grid">
            <aside class="sc-panel" aria-label="What matters to you">
              <h2>What matters to you?</h2><p class="fine">Drag to weigh each one. The list re-ranks as you go.</p>
              <div class="sc-pre" role="group" aria-label="Presets">${PRESETS.map((p) => `<button data-act="sc-pre" data-p="${p.id}" aria-pressed="${presetOn(p)}">${p.l}</button>`).join('')}</div>
              <div class="sc-sls">${sliders}</div>
              <p class="sc-note">${ICON.info}<span>Comfort and adventure are Tripsmith ratings out of 5, set per trip by the ops team. Each ticket says what they are based on.</span></p>
            </aside>
            <div class="sc-main"><div class="cmp-meta">${key}<span class="cmp-hint">Weights travel with the share link.</span></div>
              <div class="sc-list">${tickets}</div>
              ${m.slot ? `<div class="sc-add">${addSlot()}</div>` : ''}
            </div>
          </div>
        </div></div>`;
    },
    mount(s, rr) {
      mountAll(s, rr);
      const list = s.querySelector('.sc-list'), inp = s.querySelector('#cmp-url');
      if (!list) return;
      s.querySelectorAll('.sc-facts').forEach((d) => d.addEventListener('toggle', () => { openFacts[d.dataset.id] = d.open; }));
      const update = () => {
        const rk = ranked(), n = rk.length;
        const before = new Map([...list.children].map((c) => [c.dataset.id, c.getBoundingClientRect().top]));
        rk.forEach((p, j) => {
          const t = list.querySelector(`.sc-t[data-id="${p.id}"]`);
          t.querySelector('.sc-live').innerHTML = liveHtml(p, j + 1, n);
          t.classList.toggle('first', j === 0 && n > 1);
          list.appendChild(t);
        });
        if (!reduce()) [...list.children].forEach((t) => {
          const dy = before.get(t.dataset.id) - t.getBoundingClientRect().top;
          if (!dy) return;
          t.style.transition = 'none'; t.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => requestAnimationFrame(() => { t.style.transition = ''; t.style.transform = ''; }));
        });
        if (inp) inp.value = url() + wq();
        s.querySelectorAll('.sc-sl input').forEach((r) => {
          r.value = wt[r.dataset.f]; r.style.setProperty('--v', wt[r.dataset.f] * 25 + '%');
          r.setAttribute('aria-valuetext', LEVEL[wt[r.dataset.f]]);
          r.closest('.sc-sl').querySelector('.lv').textContent = LEVEL[wt[r.dataset.f]];
        });
        s.querySelectorAll('[data-act="sc-pre"]').forEach((b) => { const p = PRESETS.find((x) => x.id === b.dataset.p); b.setAttribute('aria-pressed', FAC.every((f) => p.w[f.k] === wt[f.k])); });
      };
      s.querySelector('.sc-sls').addEventListener('input', (e) => { const r = e.target.closest('input[data-f]'); if (!r) return; wt[r.dataset.f] = +r.value; update(); });
      const base = s.onclick;
      s.onclick = (e) => {
        const b = e.target.closest('[data-act="sc-pre"]');
        if (b) { Object.assign(wt, PRESETS.find((x) => x.id === b.dataset.p).w); update(); return; }
        if (base) base(e);
      };
    },
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
  .cmp-dots button { width: 10px; height: 10px; border-radius: 999px; border: 0; background: #C9CFD5; padding: 0; cursor: pointer; transition: background .3s; }
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
  .vc .why { font-size: 15.5px; line-height: 1.45; font-weight: 600; background: var(--warn-soft); border-radius: 10px; padding: 8px 12px; }
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

  /* ---------- D · head to head ---------- */
  @property --l { syntax: '<number>'; inherits: true; initial-value: 50; }
  .vs-v { display: inline-grid; place-items: center; width: 1.5em; height: 1.5em; border-radius: 50%; background: var(--act); color: var(--ink); font-size: .55em; vertical-align: .35em; margin: 0 .15em; letter-spacing: 0; }
  .vs-stage { --l: 50; position: relative; height: clamp(360px, 44cqi, 520px); border-radius: 22px; overflow: hidden; background: #14202A; touch-action: pan-y; user-select: none; cursor: ew-resize; isolation: isolate; box-shadow: 0 40px 70px -50px rgba(20,32,42,.7); }
  .vs-stage.one { cursor: default; }
  .vs-side { position: absolute; inset: 0; }
  .vs-side img { transform: scale(1.08) translateX(calc((var(--l) - 50) * .08%)); transition: transform .6s var(--ease), filter .4s; }
  .vs-side.l { clip-path: inset(0 calc(100% - var(--l) * 1%) 0 0); z-index: 1; }
  .vs-stage.lean-r .vs-side.l img, .vs-stage.lean-l .vs-side.r img { filter: saturate(.55) brightness(.8); }
  .vs-shade { position: absolute; inset: 0; z-index: 2; pointer-events: none; background: linear-gradient(180deg, rgba(10,18,28,.15) 0%, rgba(10,18,28,0) 35%, rgba(10,18,28,.78) 100%); }
  .vs-cap { position: absolute; bottom: 0; z-index: 3; padding: 24px 28px; color: #fff; display: grid; gap: 6px; max-width: 44%; transition: opacity .3s, transform .5s var(--ease); }
  .vs-cap.l { left: 0; justify-items: start; opacity: clamp(0, (var(--l) - 28) / 16, 1); transform: translateX(calc((var(--l) - 50) * .4px)); }
  .vs-cap.r { right: 0; text-align: right; justify-items: end; opacity: clamp(0, (72 - var(--l)) / 16, 1); transform: translateX(calc((var(--l) - 50) * .4px)); }
  .vs-stage.one .vs-cap.l { opacity: 1; transform: none; max-width: 60%; }
  .vs-cap .eyebrow { color: rgba(255,255,255,.8); }
  .vs-cap h2 { font-size: clamp(24px, 2.8cqi, 36px); line-height: 1.05; letter-spacing: -.02em; color: #fff; }
  .vs-pr { display: flex; gap: 6px; align-items: baseline; }
  .vs-pr b { font-size: 26px; font-weight: 800; letter-spacing: -.03em; } .vs-pr small { font-size: 12.5px; opacity: .8; font-weight: 600; }
  .vs-cap .stars b { color: #fff; }
  .vs-cap .ov { position: static; margin-bottom: 4px; }
  .vs-cap-cta { margin-top: 6px; } .vs-cap-cta .btn.line { background: rgba(255,255,255,.14); color: #fff; border-color: rgba(255,255,255,.45); backdrop-filter: blur(6px); }
  .vs-div { position: absolute; top: 0; bottom: 0; left: calc(var(--l) * 1%); width: 44px; margin-left: -22px; z-index: 4; display: grid; place-items: center; cursor: ew-resize; outline: none; }
  .vs-div::before { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; width: 3px; margin-left: -1.5px; background: #fff; box-shadow: 0 0 18px rgba(0,0,0,.35); }
  .vs-knob { position: relative; width: 54px; height: 54px; border-radius: 50%; background: var(--act); color: var(--ink); display: grid; place-items: center; font: 800 16px "DM Sans", sans-serif; letter-spacing: .02em; box-shadow: 0 0 0 4px #fff, 0 12px 26px -8px rgba(0,0,0,.55); transition: transform .3s var(--ease); }
  .vs-knob::before, .vs-knob::after { content: ""; position: absolute; top: 50%; margin-top: -5px; border: 5px solid transparent; }
  .vs-knob::before { left: -20px; border-right-color: #fff; } .vs-knob::after { right: -20px; border-left-color: #fff; }
  .vs-stage.drag .vs-knob, .vs-div:hover .vs-knob { transform: scale(1.1); }
  .vs-div:focus-visible .vs-knob { box-shadow: 0 0 0 4px #fff, 0 0 0 8px var(--pri); }
  .vs-stage.intro { animation: vsNudge 2s var(--ease) .5s both; }
  @keyframes vsNudge { 0% { --l: 50; } 30% { --l: 62; } 62% { --l: 40; } 100% { --l: 50; } }
  .vs-lean { display: flex; justify-content: space-between; align-items: center; gap: 12px 20px; flex-wrap: wrap; margin: 14px 0 0; padding: 14px 18px; border-radius: 16px; border: 1.5px solid var(--line); background: #fff; min-height: 70px; }
  .vs-lean.in { animation: cmpIn .45s var(--ease); }
  .vs-lean-t { display: grid; gap: 2px; font-size: 14.5px; }
  .vs-lean-t b { font-size: 17px; } .vs-lean-t small { color: var(--mute); font-weight: 600; font-size: 12.5px; }
  .vs-lean:has(.cmp-cta) { border-color: var(--act); box-shadow: inset 4px 0 0 var(--act); }
  .vs-lean .cmp-cta { min-width: 240px; }
  .vs-bench { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .vs-bench > .eyebrow { flex-basis: 100%; }
  .vs-chip { display: flex; align-items: center; gap: 10px; border: 1.5px solid var(--line); border-radius: 14px; padding: 6px 8px 6px 6px; background: var(--bg2); flex: 1 1 420px; min-width: 0; }
  .vs-chip .ph { width: 64px; height: 48px; border-radius: 10px; flex: none; }
  .vs-chip .t { flex: 1; min-width: 0; } .vs-chip b { display: block; font-size: 14px; } .vs-chip small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .vs-chip-b { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .vs-chip .cmp-heart, .vs-chip .cmp-x { width: 30px; height: 30px; box-shadow: none; border: 1.5px solid var(--line); }
  .vs-flip .ic { width: 15px; height: 15px; }
  .vs-bench .cmp-add { flex: 1 1 300px; }
  .vs-spine { border: 1px solid var(--line); border-radius: 18px; background: #fff; }
  .vs-heads, .vs-row { display: grid; grid-template-columns: minmax(0, 1fr) 210px minmax(0, 1fr); }
  .vs-spine.one .vs-heads, .vs-spine.one .vs-row { grid-template-columns: 210px minmax(0, 1fr); }
  .vs-heads { position: sticky; top: var(--cmp-top, 0px); z-index: 3; background: #14202A; color: #fff; border-radius: 17px 17px 0 0; font-weight: 800; font-size: 14.5px; }
  .vs-heads > * { padding: 12px 18px; } .vs-heads .l { text-align: right; } .vs-heads .k { text-align: center; color: var(--act); text-transform: uppercase; letter-spacing: .14em; font-size: 12px; align-self: center; }
  .vs-spine.one .vs-heads .l, .vs-spine.one .vs-row .v.l { order: 2; }
  .vs-spine.one .vs-heads .l { text-align: left; }
  .vs-g { padding: 20px 18px 6px; text-align: center; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--pri); font-weight: 800; border-top: 1px solid var(--line); }
  .vs-row { border-top: 1px solid var(--line); }
  .vs-row > * { padding: 14px 18px; font-size: 14px; }
  .vs-row .k { text-align: center; background: var(--bg2); display: grid; align-content: start; gap: 2px; }
  .vs-row .k b { font-size: 13.5px; } .vs-row .k small { font-size: 11.5px; color: var(--mute); font-weight: 600; line-height: 1.35; }
  .vs-row .k.dl { box-shadow: inset 0 3px 0 var(--act); }
  .vs-row .v.l { display: grid; justify-items: end; text-align: right; align-content: start; }
  .vs-row .v.l .cmp-route, .vs-row .v.l .cmp-inc, .vs-row .v.l .cmp-ld, .vs-row .v.l .cmp-deps li { justify-content: flex-end; }
  .vs-row .v.l .cmp-inc { flex-direction: row-reverse; }
  .vs-row .v.l .cmp-li li { padding: 0 16px 0 0; } .vs-row .v.l .cmp-li li::before { left: auto; right: 2px; }
  .vs-row .v.l .cmp-price, .vs-row .v.l .cmp-rt { justify-items: end; }
  .vs-row .v.won { box-shadow: inset 0 -3px 0 var(--ok); }
  .vs-spine.one .vs-row .v.l { justify-items: start; text-align: left; }
  .vs-row.act .v { display: block; }
  .vs-tl { display: grid; gap: 10px; }
  .vs-nights, .vs-lane { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px; align-items: center; }
  .vs-tl .tr { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 6px; }
  .vs-nights .tr span { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); padding-left: 4px; white-space: nowrap; overflow: hidden; }
  .vs-lane .ln { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 14px; }
  .vs-lane .ln small { color: var(--mute); font-weight: 700; font-size: 12px; margin-left: auto; }
  .vs-lane .ln .ph { width: 40px; height: 40px; border-radius: 50%; flex: none; }
  .nb { border-radius: 12px; padding: 12px 14px; background: var(--pri); color: #fff; display: grid; gap: 2px; min-width: 0; transform-origin: left; animation: vsGrow .7s var(--ease) backwards; animation-delay: calc(var(--j, 0) * 90ms + 150ms); }
  .vs-lane:nth-child(3) .nb:not(.home) { background: var(--act); color: var(--ink); }
  .nb:nth-child(even):not(.home) { filter: brightness(1.12); }
  .nb b { font-size: 14px; } .nb small { font-size: 12px; font-weight: 600; opacity: .85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nb.home { background: repeating-linear-gradient(135deg, transparent 0 8px, #EEF1F5 8px 16px); color: var(--mute); border: 1.5px dashed #C9CFD5; align-content: center; animation: none; }
  @keyframes vsGrow { from { transform: scaleX(0); opacity: 0; } }

  /* ---------- E · your ranking ---------- */
  .sc-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; margin-top: 8px; }
  .sc-panel { position: sticky; top: calc(var(--cmp-top, 0px) + 16px); border-radius: 20px; background: #14202A; color: #fff; padding: 22px 20px; display: grid; gap: 14px; box-shadow: 0 40px 70px -50px rgba(20,32,42,.8); }
  .sc-panel h2 { font-size: 22px; color: #fff; letter-spacing: -.02em; }
  .sc-panel .fine { color: #B7C0C8; margin-top: -8px; }
  .sc-pre { display: flex; flex-wrap: wrap; gap: 6px; }
  .sc-pre button { border: 1.5px solid rgba(255,255,255,.25); background: transparent; color: #fff; border-radius: 999px; padding: 6px 11px; font: 700 12.5px "DM Sans", sans-serif; cursor: pointer; transition: background .25s, border-color .25s; }
  .sc-pre button:hover { border-color: #fff; }
  .sc-pre button[aria-pressed="true"] { background: var(--act); border-color: var(--act); color: var(--ink); }
  .sc-sls { display: grid; gap: 14px; }
  .sc-sl { display: grid; gap: 6px; min-width: 0; }
  .sc-sl .t { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
  .sc-sl .t i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); flex: none; }
  .sc-sl .lv { margin-left: auto; font-size: 12px; color: #B7C0C8; font-weight: 700; }
  .sc-sl input { -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 999px; margin: 6px 0; cursor: pointer; background: linear-gradient(90deg, var(--c) var(--v), rgba(255,255,255,.18) var(--v)); }
  .sc-sl input::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 4px solid var(--c); box-shadow: 0 4px 10px rgba(0,0,0,.4); transition: transform .2s var(--ease); }
  .sc-sl input::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 4px solid var(--c); }
  .sc-sl input:active::-webkit-slider-thumb { transform: scale(1.2); }
  .sc-sl input:focus-visible { outline: 3px solid var(--act); outline-offset: 4px; }
  .sc-note { display: flex; gap: 8px; font-size: 12px; line-height: 1.45; color: #B7C0C8; border-top: 1px solid rgba(255,255,255,.14); padding-top: 12px; }
  .sc-note .ic { width: 15px; height: 15px; flex: none; margin-top: 1px; }
  .sc-list { display: grid; gap: 18px; }
  .sc-t { display: grid; grid-template-columns: minmax(0, 38%) minmax(0, 1fr); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; background: #fff; box-shadow: 0 26px 50px -42px rgba(20,32,42,.45); transition: transform .6s var(--ease), box-shadow .4s, border-color .4s; }
  .sc-t.first { border-color: var(--act); box-shadow: 0 0 0 2px var(--act), 0 30px 60px -40px rgba(242,169,59,.7); }
  .sc-t > .ph { min-height: 100%; }
  .sc-t > .ph img { transition: transform 1.2s var(--ease); } .sc-t:hover > .ph img { transform: scale(1.05); }
  .sc-dest { position: absolute; left: 10px; bottom: 10px; }
  .sc-b { padding: 18px 20px 20px; display: grid; gap: 12px; align-content: start; min-width: 0; }
  .sc-b h3 { font-size: 22px; letter-spacing: -.02em; }
  .sc-top { display: flex; align-items: center; gap: 10px; }
  .sc-rank { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--pri-soft); color: var(--pri); font-weight: 800; font-size: 20px; animation: cmpPop .5s var(--ease); }
  .sc-t.first .sc-rank { background: var(--act); color: var(--ink); }
  .sc-rk { font-size: 12.5px; font-weight: 800; color: var(--mute); text-transform: uppercase; letter-spacing: .08em; }
  .sc-t.first .sc-rk { color: var(--act-ink); }
  .sc-score { margin-left: auto; display: flex; align-items: baseline; gap: 4px; } .sc-score b { font-size: 30px; font-weight: 800; letter-spacing: -.04em; } .sc-score small { font-size: 12px; color: var(--mute); font-weight: 700; }
  .sc-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: #EEF1F5; }
  .sc-bar i { display: block; height: 100%; animation: vsGrow .8s var(--ease) backwards; transform-origin: left; }
  .sc-why { font-size: 13.5px; color: var(--ink2); line-height: 1.45; }
  .sc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
  .sc-ld { display: grid; gap: 8px; align-content: start; }
  .sc-deps { display: grid; gap: 6px; }
  .sc-facts { border-top: 1px solid var(--line); padding-top: 10px; }
  .sc-facts summary { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 800; font-size: 13.5px; color: var(--pri); list-style: none; }
  .sc-facts summary::-webkit-details-marker { display: none; }
  .sc-facts summary .ic { width: 16px; height: 16px; transition: transform .3s var(--ease); }
  .sc-facts[open] summary .ic { transform: rotate(180deg); }
  .sc-facts dl { margin: 10px 0 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .sc-facts dl > div { display: grid; grid-template-columns: 130px minmax(0, 1fr); border-top: 1px solid var(--line); }
  .sc-facts dl > div:first-child { border-top: 0; }
  .sc-facts dt { padding: 10px 12px; font-weight: 700; font-size: 13px; color: var(--ink2); background: var(--bg2); }
  .sc-facts .dif dt { box-shadow: inset 3px 0 0 var(--act); background: color-mix(in srgb, var(--act) 16%, #fff); }
  .sc-facts dd { margin: 0; padding: 10px 12px; font-size: 13.5px; min-width: 0; }
  .sc-add { margin-top: 18px; max-width: 420px; }
  @media (prefers-reduced-motion: reduce) {
    .vs-stage.intro, .vs-lean.in, .nb, .sc-rank, .sc-bar i { animation: none; }
    .vs-side img, .vs-cap, .sc-t, .sc-bar i, .sc-t > .ph img { transition: none; }
  }

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

    /* D: shorter split, captions trimmed, labels above their two values, names pinned */
    .vs-stage { height: 300px; border-radius: 16px; }
    .vs-cap { padding: 14px; max-width: 48%; gap: 4px; }
    .vs-cap h2 { font-size: 18px; }
    .vs-cap .eyebrow { font-size: 10px; letter-spacing: .08em; }
    .vs-pr b { font-size: 18px; } .vs-pr small, .vs-cap .stars, .vs-cap-cta { display: none; }
    .vs-cap .cmp-heart, .vs-cap .cmp-x { width: 30px; height: 30px; }
    .vs-knob { width: 44px; height: 44px; font-size: 14px; }
    .vs-lean { padding: 12px 14px; } .vs-lean .cmp-cta { min-width: 0; width: 100%; grid-template-columns: 1fr 1fr; }
    .vs-chip { flex-wrap: wrap; flex-basis: 100%; }
    .vs-chip-b { width: 100%; justify-content: flex-start; }
    .vs-heads, .vs-row { grid-template-columns: 1fr 1fr; }
    .vs-spine.one .vs-heads, .vs-spine.one .vs-row { grid-template-columns: 1fr; }
    .vs-heads { font-size: 13px; border-radius: 15px 15px 0 0; }
    .vs-heads > * { padding: 10px 12px; } .vs-heads .l { text-align: left; } .vs-heads .k { display: none; }
    .vs-row .k { grid-column: 1 / -1; grid-row: 1; text-align: left; padding: 8px 12px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
    .vs-row .k small { font-size: 11px; }
    .vs-row > .v { padding: 12px; font-size: 13.5px; min-width: 0; }
    .vs-row .v.l { justify-items: start; text-align: left; border-right: 1px solid var(--line); }
    .vs-row .v.l .cmp-route, .vs-row .v.l .cmp-inc, .vs-row .v.l .cmp-ld, .vs-row .v.l .cmp-deps li { justify-content: flex-start; }
    .vs-row .v.l .cmp-inc { flex-direction: row; }
    .vs-row .v.l .cmp-li li { padding: 0 0 0 16px; } .vs-row .v.l .cmp-li li::before { right: auto; left: 2px; }
    .vs-row .v.l .cmp-price, .vs-row .v.l .cmp-rt { justify-items: start; }
    .vs-row .cmp-deps li { flex-direction: column; align-items: flex-start; gap: 2px; }
    .vs-row .cmp-deps .badge { white-space: normal; }
    .vs-row .cmp-ld { flex-direction: column; align-items: flex-start; }
    .vs-row.act .cmp-cta { grid-template-columns: 1fr; }
    .vs-g { text-align: left; padding: 16px 12px 6px; }
    .vs-nights, .vs-lane { grid-template-columns: 1fr; gap: 6px; }
    .vs-nights > span { display: none; }
    .vs-nights .tr span { font-size: 9.5px; letter-spacing: .04em; padding-left: 2px; }
    .vs-tl .tr { gap: 4px; }
    .nb { padding: 9px 8px; border-radius: 10px; } .nb b { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nb small { display: none; }
    .nb.home small { display: block; font-size: 10.5px; white-space: normal; }

    /* E: panel above, tickets stack */
    .sc-grid { grid-template-columns: 1fr; gap: 16px; }
    .sc-panel { position: static; padding: 18px 16px; gap: 12px; }
    .sc-panel h2 { font-size: 19px; }
    .sc-sls { grid-template-columns: 1fr 1fr; gap: 10px 14px; }
    .sc-sl .t { font-size: 13px; flex-wrap: wrap; } .sc-sl .lv { margin-left: 18px; flex-basis: 100%; }
    .sc-t { grid-template-columns: 1fr; border-radius: 16px; }
    .sc-t > .ph { aspect-ratio: 16 / 9; min-height: 0; }
    .sc-b { padding: 14px; }
    .sc-b h3 { font-size: 19px; }
    .sc-score b { font-size: 24px; }
    .sc-row { grid-template-columns: 1fr; }
    .sc-facts dl > div { grid-template-columns: 100px minmax(0, 1fr); }
    .sc-facts dt { font-size: 12px; padding: 10px 8px 10px 10px; }
    .sc-facts dd { font-size: 13px; padding: 10px; }
    .sc-facts .cmp-deps li { flex-direction: column; align-items: flex-start; gap: 2px; }
  }`;

  TS.register({ id: 'compare', label: 'Compare', group: 'v2.5 · customer', css, variants: [A, B, C, D, E] });
})();

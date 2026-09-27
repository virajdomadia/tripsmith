/* Counter booking (/admin/bookings/new, R56 · P18). Converting enquiry EQ-2291: Priya Nair phoned about Kerala.
   One shared booking state + one quote function (fares → deal → early-bird → coupon → manual; add-ons never discounted).
   Five layouts: A desk two-pane · B call script · C wizard + receipt · D quote sheet · E WhatsApp to booking. "Now" = Sun 27 Sep 2026, 14:12 IST. */
(() => {
  const TS = window.TS;
  const { inr, esc, ICON } = TS;

  /* ---------- data (seed: api/content/packages/munnar_alleppey_houseboat.py) ---------- */
  const PKG = TS.PKGS.munnar;
  const DEPS = [
    { date: 'Fri 13 Nov 2026', short: '13 Nov', days: 47, total: 12, left: 7, dbl: 22999, tpl: 20999, child: 13499, sup: 9500, deal: 5, dealName: 'Kerala winter deal', g: true, eb1: '29 Sep', due: '14 Oct' },
    { date: 'Fri 18 Dec 2026', short: '18 Dec', days: 82, total: 10, left: 4, dbl: 25999, tpl: 23999, child: 15499, sup: 11000, deal: 0, dealName: '', g: false, eb1: '3 Nov', due: '18 Nov' },
    { date: 'Fri 15 Jan 2027', short: '15 Jan', days: 110, total: 12, left: 11, dbl: 21999, tpl: 19999, child: 12999, sup: 9000, deal: 0, dealName: '', g: true, eb1: '1 Dec', due: '16 Dec' },
    { date: 'Fri 12 Feb 2027', short: '12 Feb', days: 138, total: 12, left: 12, dbl: 21999, tpl: 19999, child: 12999, sup: 9000, deal: 0, dealName: '', g: false, eb1: '29 Dec', due: '13 Jan' },
  ];
  const COUPON = { code: 'FAMILY2000', off: 2000, min: 3 };
  const CUSTS = [
    { id: 'priya', name: 'Priya Nair', phone: '+91 98470 11234', email: 'priya.nair@customer.in', state: 'Kerala', since: 'Nov 2024',
      trips: [{ name: 'North Goa Beaches', when: 'Dec 2024', ref: 'TS-4HD9QW', amt: 43497, st: 'Completed' }] },
    { id: 'prakash', name: 'Prakash Nair', phone: '+91 98470 55602', email: 'prakash.nair@customer.in', state: 'Kerala', since: 'Jun 2026', trips: [] },
    { id: 'priyan', name: 'Priya Narayanan', phone: '+91 99001 43218', email: 'priya.narayanan@customer.in', state: 'Karnataka', since: 'Aug 2026', trips: [] },
  ];
  const STATES = ['Kerala', 'Karnataka', 'Tamil Nadu', 'Maharashtra', 'Delhi', 'Telangana'];
  const CHANNELS = [['phone', 'Phone'], ['walkin', 'Walk-in'], ['whatsapp', 'WhatsApp'], ['enquiry', 'Enquiry'], ['web', 'Web']];
  const LONGM = { Nov: 'November', Dec: 'December', Jan: 'January', Feb: 'February' };
  const REF = 'TS-8KQ2MN', LINK = 'https://rzp.io/l/demo-TB9X4K';

  const S0 = () => ({
    dep: 0, ad: 2, ch: 1, ac: true, kath: 0, nights: 0, pick: false,
    coupon: '', couponOk: false, couponMsg: '',
    manMode: 'inr', manV: '2000', reason: 'Repeat customer, 2024 Goa trip',
    q: '98470', cust: 'priya', nc: { name: 'Priya Nair', phone: '+91 98470 11234', email: '', state: 'Kerala' },
    trav: 'now', tn: ['Priya Nair', 'Arun Nair', 'Diya Nair'], ta: ['36', '38', '8'],
    settle: 'link', linkAmt: 'deposit', method: 'upi', ref: '', chan: 'enquiry', done: null, cstep: 0,
  });
  let S = S0();
  let CURV = 'A', SITE = null, shown = null, raf = 0, tick = 0, callStart = 0;
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ---------- the server quote ---------- */
  function adultFare(d, a) {
    if (a === 1) return d.dbl + d.sup;
    if (a % 2 === 0) return a * d.dbl;
    return (a - 3) * d.dbl + 3 * d.tpl;
  }
  function roomTxt(d, a) {
    if (a === 1) return `${inr(d.dbl)} + single room ${inr(d.sup)}`;
    if (a % 2 === 0) return `${a} × ${inr(d.dbl)} · twin sharing`;
    return a === 3 ? `3 × ${inr(d.tpl)} · triple room` : `${a - 3} × ${inr(d.dbl)} + 3 × ${inr(d.tpl)} triple`;
  }
  function Q() {
    const d = DEPS[S.dep], n = S.ad + S.ch;
    const adults = adultFare(d, S.ad), kids = S.ch * d.child, fares = adults + kids;
    const deal = d.deal ? Math.round((fares * d.deal) / 100) : 0;
    const ebPer = d.days >= 45 ? 1500 : d.days >= 30 ? 750 : 0;
    const eb = Math.max(0, Math.min(ebPer * n, fares - deal - 1));
    let rest = fares - deal - eb;
    const cp = S.couponOk ? Math.min(COUPON.off, rest - 1) : 0;
    rest -= cp;
    let man = 0, capped = false;
    const mv = Number(S.manV) || 0;
    if (mv > 0) {
      man = S.manMode === 'pct' ? Math.round((rest * Math.min(mv, 100)) / 100) : Math.round(mv);
      if (man > rest - 1) { man = rest - 1; capped = true; }
    }
    const fareNet = rest - man;
    const add = [];
    if (S.ac) add.push(['Houseboat AC upgrade', 'per booking', 4500]);
    if (S.kath) add.push(['Kathakali front-row seats', `${S.kath} × ${inr(600)}`, S.kath * 600]);
    if (S.nights) add.push(['Extra night in Munnar', `${n} × ${pl(S.nights, 'night', 'nights')} × ${inr(3200)}`, n * S.nights * 3200]);
    if (S.pick) add.push(['Late-night airport pickup', 'per booking', 1800]);
    const addT = add.reduce((a, x) => a + x[2], 0);
    const total = fareNet + addT;
    const deposit = Math.round(total * 0.25);
    const cust = CUSTS.find((c) => c.id === S.cust);
    const state = cust ? cust.state : S.nc.state;
    const gst = Math.round((total * 5) / 105);
    return { d, n, adults, kids, fares, deal, ebPer, eb, cp, man, capped, fareNet, add, addT, total, deposit, balance: total - deposit,
      depOK: d.days > 30, disc: deal + eb + cp + man, gst, state, needReason: man > 0 && !S.reason.trim() };
  }
  const payAmt = (q) => (S.settle === 'paid' ? q.total : S.settle === 'dep' ? q.deposit : S.linkAmt === 'deposit' ? q.deposit : q.total);
  const custName = () => { const c = CUSTS.find((x) => x.id === S.cust); return c ? c.name : S.cust === 'new' ? S.nc.name.trim() || 'New customer' : ''; };
  const custPhone = () => { const c = CUSTS.find((x) => x.id === S.cust); return c ? c.phone : S.nc.phone; };
  const custEmail = () => { const c = CUSTS.find((x) => x.id === S.cust); return c ? c.email : S.nc.email; };
  const firstName = () => custName().split(' ')[0] || 'the customer';

  function blockers(q) {
    const b = [];
    if (!S.cust) b.push('Pick the customer or create one');
    else if (S.cust === 'new' && (!S.nc.name.trim() || !S.nc.email.trim() || !S.nc.phone.trim())) b.push('New customer needs a name, phone and email');
    if (q.needReason) b.push('Give a reason for the manual discount');
    if (S.settle !== 'link' && S.method !== 'cash' && !S.ref.trim()) b.push(`Add the ${S.method === 'upi' ? 'UPI reference (UTR)' : 'bank reference'}`);
    if ((S.settle === 'dep' || (S.settle === 'link' && S.linkAmt === 'deposit')) && !q.depOK) b.push('Deposit closes 30 days before departure: take the full amount');
    return b;
  }
  const ctaLabel = (q) => (S.settle === 'link' ? `Send payment link · ${inr(payAmt(q))}` : S.settle === 'paid' ? `Record ${inr(q.total)} & confirm` : `Record deposit ${inr(q.deposit)} & confirm`);

  /* ---------- small parts ---------- */
  const stepper = (act, val, min, max, label) =>
    `<span class="ctr-stp"><button type="button" data-act="${act}" data-v="-1" aria-label="One fewer ${label}" ${val <= min ? 'disabled' : ''}>${ICON.minus}</button><output class="num" aria-label="${label}">${val}</output><button type="button" data-act="${act}" data-v="1" aria-label="One more ${label}" ${val >= max ? 'disabled' : ''}>${ICON.plus}</button></span>`;
  const sw = (act, on, label) => `<button type="button" class="ctr-sw" role="switch" aria-checked="${on}" aria-label="${label}" data-act="${act}"><i></i></button>`;
  const seg = (act, cur, opts) => `<span class="a-seg">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</span>`;

  const eqBanner = () => `<div class="a-note ctr-eq">${ICON.inbox}<div><b>Converting enquiry <a href="#">EQ-2291</a></b> · Priya Nair phoned on 27 Sep, 11:40 IST: “Munnar &amp; Alleppey Houseboat, 2 adults + 1 child, around 13 Nov”. <span>Trip, party and customer are pre-filled from it; saving marks the enquiry converted and links it to this booking.</span></div><span class="a-chip ${S.done ? 'ok' : 'info'}">${S.done ? `${ICON.check}Converted · ${REF}` : 'Will mark converted'}</span></div>`;

  const head = (h1, sub) => `<div class="a-head"><h1>${h1}</h1><p class="sub">${sub}</p><div class="acts"><a href="#" class="a-btn ghost sm">${ICON.chevL}Bookings</a><button type="button" class="a-btn ghost sm" data-act="reset">Start over</button></div></div>`;

  /* ---------- sections (same markup in every variant; CSS changes density) ---------- */
  function secTrip() {
    const L = TS.LEADERS[PKG.leader];
    return `<div class="ctr-pk"><img src="${PKG.img}" alt="Tea estates above Munnar" width="84" height="64"><div><b>${esc(PKG.name)}</b><small>Kerala · 4 nights · Ex-Bengaluru · leader ${L.name}</small></div><button type="button" class="a-btn ghost sm">Change</button></div>
      <div class="ctr-deps" role="group" aria-label="Departure">${DEPS.map((d, i) => {
        const booked = d.total - d.left;
        return `<button type="button" class="ctr-dp" data-act="dep" data-v="${i}" aria-pressed="${i === S.dep}">
          <span class="dd"><b>${d.date}</b><small>${d.g ? 'Guaranteed · ' : ''}${booked} of ${d.total} booked</small></span>
          <span class="pr"><b class="num">${inr(d.dbl)}</b><small>per adult, twin</small></span>
          <span class="tg">${d.deal ? `<span class="a-chip warn">${d.deal}% deal</span>` : ''}<span class="a-chip ok">Early bird −${inr(1500)}</span></span>
          <span class="a-meter" style="--v:${Math.round((booked / d.total) * 100)}%"></span>
          <span class="sl num ${d.left <= 4 ? 'lo' : ''}">${d.left} left</span></button>`;
      }).join('')}</div>
      <p class="ctr-hint">${ICON.info}The counter can book until the morning of departure; the website closes 2 days before.</p>`;
  }
  function secParty() {
    const d = DEPS[S.dep], n = S.ad + S.ch, full = n >= d.left;
    return `<div class="ctr-party">
        <div class="ctr-pr"><div><b>Adults</b><small>12 years and up · ${roomTxt(d, S.ad)}</small></div>${stepper('ad', S.ad, 1, full ? S.ad : 99, 'adult')}</div>
        <div class="ctr-pr"><div><b>Children</b><small>5–11 years, sharing · ${inr(d.child)} each</small></div>${stepper('ch', S.ch, 0, full ? S.ch : 99, 'child')}</div>
      </div>
      <div class="ctr-cap"><span class="a-meter" style="--v:${Math.round(((d.total - d.left) / d.total) * 100)}%;--h:${Math.round((n / d.total) * 100)}%"></span>
        <span class="num">Party of <b>${n}</b> · <b>${d.left}</b> seats left on ${d.short}, so the cap is ${d.left}</span>${full ? '<span class="a-chip warn">At the seat limit</span>' : ''}</div>`;
  }
  function secAddons() {
    const n = S.ad + S.ch;
    const row = (t, p, unit, ctl, amt) => `<div class="ctr-ao"><div><b>${t}</b><p>${p}</p><small>${unit}</small></div><div class="ctl">${ctl}</div><span class="amt num">${amt ? inr(amt) : '—'}</span></div>`;
    return `<div class="ctr-aos">
      ${row('Houseboat AC upgrade', 'Air-conditioned bedroom for the night on the Vembanad backwaters.', `${inr(4500)} per booking`, sw('ac', S.ac, 'Houseboat AC upgrade'), S.ac ? 4500 : 0)}
      ${row('Kathakali front-row seats', 'First two rows in Fort Kochi, with the make-up session from five.', `${inr(600)} per traveller`, stepper('kath', S.kath, 0, n, 'Kathakali seat'), S.kath * 600)}
      ${row('Extra night in Munnar', 'Another night at Tea Valley Resort, breakfast and dinner.', `${inr(3200)} per traveller per night · max 2`, seg('nights', S.nights, [[0, 'None'], [1, '1 night'], [2, '2 nights']]), S.nights * n * 3200)}
      ${row('Late-night airport pickup', 'For flights landing at Kochi after 10 pm.', `${inr(1800)} per booking`, sw('pick', S.pick, 'Late-night airport pickup'), S.pick ? 1800 : 0)}
      </div><p class="ctr-hint">${ICON.info}Add-ons are never discounted, and they count toward the deposit.</p>`;
  }
  const cpMsg = () => (S.couponOk ? `<span class="ok">${ICON.check}${COUPON.code} applied · −${inr(COUPON.off)} on fares</span>` : S.couponMsg ? `<span class="err">${esc(S.couponMsg)}</span>` : `<span>Live for this trip: <button type="button" class="ctr-lnk" data-act="cpfill">${COUPON.code}</button> (3+ travellers)</span>`);
  const manMsg = () => {
    const q = Q();
    if (q.needReason) return `<span class="err">A reason is required. It prints on the invoice and in the history.</span>`;
    if (q.capped) return `<span class="err">Capped at ${inr(q.man)}: fares can't go below ₹1.</span>`;
    return q.man ? `<span class="ok">${ICON.check}−${inr(q.man)} · shows on the invoice and in the booking history</span>` : `<span>Optional. ₹ or % of fares, never below ₹1, and never an increase.</span>`;
  };
  function secDisc() {
    const q = Q(), d = q.d;
    return `<div class="ctr-auto">
        ${d.deal ? `<div class="ctr-ar"><span class="a-chip ok">${ICON.check}Auto</span><span><b>${d.dealName}</b> · ${d.deal}% off fares</span><b class="num">−${inr(q.deal)}</b></div>` : `<div class="ctr-ar dim"><span class="a-chip mute">None</span><span>No deal on ${d.short}</span><b class="num">₹0</b></div>`}
        <div class="ctr-ar"><span class="a-chip ok">${ICON.check}Auto</span><span><b>Early bird</b> · ${inr(q.ebPer)} × ${q.n} · tier ends ${d.eb1}</span><b class="num">−${inr(q.eb)}</b></div>
      </div>
      <div class="a-row2 ctr-dx">
        <div class="a-field"><label for="ctr-cp">Coupon</label><div class="ctr-inl"><input id="ctr-cp" data-in="coupon" value="${esc(S.coupon)}" placeholder="Code" autocomplete="off" spellcheck="false"><button type="button" class="a-btn ghost sm" data-act="cpapply">Apply</button></div><span class="hint" data-slot="cpm">${cpMsg()}</span></div>
        <div class="a-field"><label for="ctr-mv">Manual discount</label><div class="ctr-inl">${seg('manmode', S.manMode, [['inr', '₹'], ['pct', '%']])}<input id="ctr-mv" class="num" data-in="manv" inputmode="numeric" value="${esc(S.manV)}" placeholder="${S.manMode === 'pct' ? '0–100' : 'Amount'}" aria-label="Manual discount amount">${S.manV ? `<button type="button" class="a-btn ghost sm" data-act="mclear" aria-label="Remove manual discount">${ICON.x}</button>` : ''}</div></div>
      </div>
      <div class="a-field ctr-reason"><label for="ctr-rs">Reason for the manual discount <em>${Number(S.manV) > 0 ? 'required' : 'if used'}</em></label><input id="ctr-rs" data-in="reason" value="${esc(S.reason)}" placeholder="e.g. Repeat customer, 2024 Goa trip"><span class="hint" data-slot="mm">${manMsg()}</span></div>`;
  }
  function custResults() {
    const q = S.q.trim().toLowerCase(), dig = q.replace(/\D/g, '');
    let out = '';
    if (S.cust === 'new') {
      out = `<div class="ctr-new"><div class="a-row2">
        <div class="a-field"><label>Full name</label><input data-in="nc" data-f="name" value="${esc(S.nc.name)}"></div>
        <div class="a-field"><label>Mobile</label><input data-in="nc" data-f="phone" inputmode="tel" value="${esc(S.nc.phone)}"></div>
        <div class="a-field"><label>Email</label><input data-in="nc" data-f="email" type="email" value="${esc(S.nc.email)}" placeholder="Links the booking to their My trips"></div>
        <div class="a-field"><label>State (for GST)</label><select data-in="nc" data-f="state">${STATES.map((s) => `<option ${s === S.nc.state ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div><button type="button" class="ctr-lnk" data-act="cust" data-v="">Back to search</button></div>`;
      return out;
    }
    const hits = !q ? [] : CUSTS.filter((c) => (dig.length >= 3 && c.phone.replace(/\D/g, '').includes(dig)) || (c.name + ' ' + c.email).toLowerCase().includes(q));
    const list = hits.length ? hits : S.cust ? CUSTS.filter((c) => c.id === S.cust) : [];
    out += list.map((c) => {
      const on = c.id === S.cust;
      return `<div class="ctr-cu ${on ? 'on' : ''}"><button type="button" class="ctr-cub" data-act="cust" data-v="${c.id}" aria-pressed="${on}">
        <span class="ctr-av">${c.name.split(' ').map((w) => w[0]).join('')}</span><span class="who"><b>${c.name}</b><small>${c.phone} · ${c.email}</small></span>
        <span class="a-chip ${c.trips.length ? 'pri' : 'mute'}">${c.trips.length ? pl(c.trips.length, 'past trip', 'past trips') : 'No trips yet'}</span>${on ? `<span class="a-chip ok">${ICON.check}Selected</span>` : ''}</button>
        ${on && c.trips.length ? `<div class="ctr-past">${c.trips.map((t) => `<span>${ICON.ticket}<b>${t.name}</b> · ${t.when} · ${t.ref} · ${inr(t.amt)}</span><span class="a-chip ok">${t.st}</span>`).join('')}</div>` : ''}
        ${on ? `<p class="ctr-link">${ICON.link}Account linked by email: this booking shows in ${c.name.split(' ')[0]}'s My trips. GST state: ${c.state}.</p>` : ''}</div>`;
    }).join('');
    if (q && !hits.length) out += `<p class="ctr-none">No customer matches “${esc(S.q)}”.</p>`;
    out += `<button type="button" class="a-btn ghost sm" data-act="cust" data-v="new">${ICON.plus}Create a new customer</button>`;
    return out;
  }
  const secCust = () => `<label class="a-search ctr-srch">${ICON.search}<input data-in="q" value="${esc(S.q)}" placeholder="Phone, email or name" aria-label="Find customer by phone, email or name"></label><div class="ctr-cres" data-slot="cres">${custResults()}</div>`;
  function secTrav() {
    const n = S.ad + S.ch;
    let rows = '';
    if (S.trav === 'now') {
      rows = `<div class="ctr-tv">${Array.from({ length: n }, (_, i) => {
        const kid = i >= S.ad;
        return `<div class="ctr-tr"><span class="lab">${kid ? `Child ${i - S.ad + 1}` : `Adult ${i + 1}`}${i === 0 ? ' · lead' : ''}</span>
          <input data-in="tn" data-i="${i}" value="${esc(S.tn[i] || '')}" placeholder="Full name as on ID" aria-label="Traveller ${i + 1} name">
          <input data-in="ta" data-i="${i}" class="num age" inputmode="numeric" value="${esc(S.ta[i] || '')}" placeholder="Age" aria-label="Traveller ${i + 1} age"></div>`;
      }).join('')}</div>`;
    } else rows = `<div class="a-note">${ICON.clock}<span>${firstName()} gets a link to add names, ages and ID. Reminders go out from 14 days before departure, and the manifest flags missing details.</span></div>`;
    return `<div class="ctr-inl">${seg('trav', S.trav, [['now', 'Enter now'], ['later', 'Customer adds later']])}</div>${rows}`;
  }
  function secSettle() {
    const q = Q();
    const opt = (v, t, p, ic) => `<button type="button" class="ctr-opt" data-act="settle" data-v="${v}" aria-pressed="${S.settle === v}" ${v === 'dep' && !q.depOK ? 'disabled' : ''}>${ic}<b>${t}</b><small>${p}</small></button>`;
    let det = '';
    if (S.settle === 'link') {
      det = `<div class="ctr-det"><span class="lab">Link amount</span>${seg('linkamt', S.linkAmt, [['full', `Full ${inr(q.total)}`], ['deposit', `Deposit ${inr(q.deposit)}`]])}
        <p>Razorpay Payment Link · seats held 24 h · share by copy, WhatsApp or email. A paid link settles through the same capture as the website.</p></div>`;
    } else {
      const lab = S.method === 'upi' ? 'UPI reference (UTR)' : S.method === 'bank' ? 'Bank transfer reference' : 'Cash receipt no. (optional)';
      det = `<div class="ctr-det"><span class="lab">Received by</span>${seg('method', S.method, [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank']])}
        <div class="a-field"><label for="ctr-ref">${lab}</label><input id="ctr-ref" data-in="ref" value="${esc(S.ref)}" placeholder="${S.method === 'upi' ? '4271 9953 0187' : S.method === 'bank' ? 'NEFT UTR' : 'Counter book no.'}" autocomplete="off"></div>
        <p>${S.settle === 'paid' ? `${inr(q.total)} received. Confirms at once and issues receipt RC/2026-27/0148.` : `${inr(q.deposit)} received today; ${inr(q.balance)} balance due ${q.d.due} (30 days before departure), with reminders at 7 and 3 days.`}</p></div>`;
    }
    return `<div class="ctr-opts" role="group" aria-label="How to settle">
        ${opt('link', 'Send payment link', 'Full or 25% deposit · holds seats 24 h', ICON.link)}
        ${opt('paid', 'Paid now', 'Cash, UPI or bank · instant confirm', ICON.rupee)}
        ${opt('dep', 'Deposit now', `25% today · balance by ${q.d.due}`, ICON.clock)}</div>${det}
      <div class="ctr-chan"><span class="lab">Channel</span>${seg('chan', S.chan, CHANNELS)}<span class="ctr-by">${ICON.user}Created by <b>Viraj D.</b></span></div>`;
  }
  const SECS = [
    ['Trip', secTrip, () => `${DEPS[S.dep].short} · ${DEPS[S.dep].left} left`],
    ['Party', secParty, () => `${pl(S.ad, 'adult', 'adults')}${S.ch ? ` + ${pl(S.ch, 'child', 'children')}` : ''}`],
    ['Add-ons', secAddons, () => { const q = Q(); return q.add.length ? `${pl(q.add.length, 'add-on', 'add-ons')} · ${inr(q.addT)}` : 'None'; }],
    ['Discounts', secDisc, () => `−${inr(Q().disc)}`],
    ['Customer', secCust, () => custName() || 'Not picked'],
    ['Travellers', secTrav, () => (S.trav === 'later' ? 'Later' : `${S.tn.slice(0, S.ad + S.ch).filter((x) => x && x.trim()).length} of ${S.ad + S.ch} named`)],
    ['Settle', secSettle, () => (S.settle === 'link' ? `Link · ${S.linkAmt === 'deposit' ? 'deposit' : 'full'}` : S.settle === 'paid' ? 'Paid now' : 'Deposit now')],
  ];

  /* ---------- quote renderings ---------- */
  function rows(q) {
    const r = [{ l: pl(S.ad, 'adult', 'adults'), s: roomTxt(q.d, S.ad), v: q.adults }];
    if (S.ch) r.push({ l: pl(S.ch, 'child', 'children'), s: `${S.ch} × ${inr(q.d.child)}`, v: q.kids });
    if (q.deal) r.push({ l: q.d.dealName, s: `${q.d.deal}% off fares`, v: -q.deal, t: 'neg' });
    if (q.eb) r.push({ l: 'Early bird', s: `${inr(q.ebPer)} × ${q.n} · book by ${q.d.eb1}`, v: -q.eb, t: 'neg' });
    if (q.cp) r.push({ l: `Coupon ${COUPON.code}`, s: '3+ travellers', v: -q.cp, t: 'neg' });
    if (q.man) r.push({ l: 'Manual discount', s: S.reason.trim() ? esc(S.reason.trim()) : 'Reason required', v: -q.man, t: 'neg' + (q.needReason ? ' bad' : '') });
    r.push({ l: 'Fares after discounts', s: '', v: q.fareNet, t: 'sub' });
    q.add.forEach((a) => r.push({ l: a[0], s: a[1], v: a[2], t: 'add' }));
    return r;
  }
  const gstTxt = (q) => (q.state === 'Karnataka' ? `CGST 2.5% ${inr(Math.round(q.gst / 2))} + SGST 2.5% ${inr(q.gst - Math.round(q.gst / 2))}` : `IGST 5% ${inr(q.gst)} · ${q.state}`);
  function cta(q, compact) {
    const b = blockers(q);
    return `${b.length ? `<ul class="ctr-blk">${b.map((x) => `<li>${ICON.info}${x}</li>`).join('')}</ul>` : ''}
      <button type="button" class="a-btn act ctr-go" data-act="go" ${b.length ? 'disabled' : ''}>${S.settle === 'link' ? ICON.link : ICON.check}${ctaLabel(q)}${compact ? '<kbd>Ctrl ↵</kbd>' : ''}</button>
      ${compact ? '' : `<p class="ctr-sm">${S.settle === 'link' ? `Holds ${pl(q.n, 'seat', 'seats')} on ${q.d.short} for 24 h.` : 'Voucher, receipt and emails go out exactly as for web bookings.'}</p>`}`;
  }

  // A · side panel
  const qa = () => {
    const q = Q();
    return `<section><div class="ctr-qh"><h2>Live quote</h2><span class="ctr-live">Server quote</span></div><small class="ctr-qs">${esc(PKG.name)} · ${q.d.date} · ${pl(q.n, 'traveller', 'travellers')}</small></section>
      <section><dl class="ctr-ql">${rows(q).map((r) => `<div class="${r.t || ''}"><dt>${r.l}${r.s ? `<small>${r.s}</small>` : ''}</dt><dd class="num">${r.v < 0 ? '−' + inr(-r.v) : inr(r.v)}</dd></div>`).join('')}</dl></section>
      <section class="ctr-tot"><div><span>Total</span><b class="num" data-total>${inr(q.total)}</b></div><small>Includes ${gstTxt(q)}</small></section>
      <section><dl class="a-kv"><div><dt>Deposit today · 25%</dt><dd>${inr(q.deposit)}</dd></div><div><dt>Balance due ${q.d.due}</dt><dd>${inr(q.balance)}</dd></div></dl></section>
      <section>${cta(q)}<p class="ctr-sm">Channel <b>${CHANNELS.find((c) => c[0] === S.chan)[1]}</b> · created by <b>Viraj D.</b> · no upward price override</p></section>`;
  };
  // B · ledger bar + read-back script
  const qb = () => {
    const q = Q();
    return `<div class="ctr-ledger"><span><small>Fares</small><b class="num">${inr(q.fares)}</b></span><i>−</i><span><small>Discounts</small><b class="num">${inr(q.disc)}</b></span><i>+</i><span><small>Add-ons</small><b class="num">${inr(q.addT)}</b></span><i>=</i>
      <span class="tot"><small>Total · GST incl.</small><b class="num" data-total>${inr(q.total)}</b></span><span class="dep"><small>Deposit 25%</small><b class="num">${inr(q.deposit)}</b></span><div class="go">${cta(q, true)}</div></div>`;
  };
  const rb = () => {
    const q = Q(), d = q.d;
    const discs = [q.deal ? `our ${d.dealName}` : '', q.eb ? 'the early-bird price' : '', q.cp ? 'your family coupon' : '', q.man ? `${inr(q.man)} off${/repeat/i.test(S.reason) ? ' as a returning traveller' : ''}` : ''].filter(Boolean);
    const party = `${pl(S.ad, 'adult', 'adults')}${S.ch ? ` and ${pl(S.ch, 'child', 'children')}` : ''}`;
    const addTxt = q.add.length ? `, plus ${inr(q.addT)} for ${q.add.map((a) => a[0].toLowerCase().replace('houseboat ac', 'the AC houseboat')).join(' and ')}` : '';
    const pay = S.settle === 'link' ? `I'm sending a payment link to your WhatsApp now${S.linkAmt === 'deposit' ? ` for ${inr(q.deposit)}, and the ${inr(q.balance)} balance is due by ${d.due}` : ` for the full ${inr(q.total)}`}. It holds your ${pl(q.n, 'seat', 'seats')} for 24 hours.`
      : S.settle === 'paid' ? `Once your ${S.method === 'cash' ? 'cash' : S.method === 'upi' ? 'UPI payment' : 'transfer'} of ${inr(q.total)} is in, you're confirmed and the receipt comes by email.`
      : `Pay ${inr(q.deposit)} today to confirm, and the ${inr(q.balance)} balance by ${d.due}.`;
    return `<span class="lab">${ICON.chat}Read back to ${esc(firstName())}</span><p>“That's ${esc(PKG.name)} on ${d.date.replace(/^Fri (\d+) (\w+) (\d+)$/, (m, a, b) => `Friday ${a} ${LONGM[b]}`)} for ${party}. ${discs.length ? `With ${discs.length > 1 ? discs.slice(0, -1).join(', ') + ' and ' + discs[discs.length - 1] : discs[0]}, the trip` : 'The trip'} comes to ${inr(q.fareNet)}${addTxt}: <b>${inr(q.total)}</b> in all, GST included. ${pay}”</p>`;
  };
  // C · receipt
  const qc = () => {
    const q = Q();
    const stamp = S.done ? `<span class="ctr-stamp ${S.done.kind === 'link' ? '' : 'ok'}">${S.done.kind === 'link' ? 'Link sent' : S.done.kind === 'paid' ? 'Paid' : 'Deposit paid'}</span>` : '';
    return `<div class="ctr-rc">${stamp}<header><span class="lg"><i></i>Tripsmith</span><span>Counter quote · ${S.done ? REF : 'draft'}</span></header>
      <dl class="ctr-rm"><div><dt>Trip</dt><dd>${esc(PKG.name)}</dd></div><div><dt>Departs</dt><dd>${q.d.date}</dd></div><div><dt>For</dt><dd>${esc(custName() || '—')}</dd></div><div><dt>Quoted</dt><dd>27 Sep 2026, 14:12 IST</dd></div></dl>
      <div class="ctr-rl">${rows(q).map((r) => `<div class="${r.t || ''}"><span>${r.l}${r.s ? `<small>${r.s}</small>` : ''}</span><i></i><b class="num">${r.v < 0 ? '−' + inr(-r.v) : inr(r.v)}</b></div>`).join('')}</div>
      <div class="ctr-rt"><span>Total</span><b class="num" data-total>${inr(q.total)}</b></div>
      <p class="ctr-rg">Includes ${gstTxt(q)} · SAC 998555</p>
      <div class="ctr-rd"><div><span>Deposit today (25%)</span><b class="num">${inr(q.deposit)}</b></div><div><span>Balance by ${q.d.due}</span><b class="num">${inr(q.balance)}</b></div></div>
      <footer>Priced by the server, same as the website · ${CHANNELS.find((c) => c[0] === S.chan)[1]} · Viraj D.</footer></div>`;
  };
  const SLOTS = { qa, qb, rb, qc, cpm: cpMsg, mm: manMsg, cres: custResults };

  /* ---------- final state ---------- */
  const cdFmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
  function doneCard() {
    const q = Q(), D = S.done, amt = D.amount, d = q.d;
    const left = Math.max(0, D.at + 864e5 - Date.now());
    if (D.kind === 'link') {
      const msg = `Hi ${firstName()}, here is your Tripsmith payment link for ${PKG.name} (${d.short}, ${pl(q.n, 'traveller', 'travellers')}): ${inr(amt)}${S.linkAmt === 'deposit' ? ' deposit' : ''}. Your seats are held for 24 hours. ${LINK}`;
      const wa = `https://wa.me/${custPhone().replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
      const mail = `mailto:${custEmail()}?subject=${encodeURIComponent(`Your Tripsmith payment link · ${REF}`)}&body=${encodeURIComponent(msg)}`;
      return `<div class="a-card ctr-done"><div class="a-card-b">
        <div class="ctr-dh"><span class="a-chip warn">${ICON.clock}Awaiting payment</span><span class="a-chip info">${ICON.lock}${pl(q.n, 'seat', 'seats')} held</span><span class="a-chip mute">${REF}</span></div>
        <h2>Payment link sent to ${esc(custName())}</h2>
        <p class="ctr-dm">${esc(PKG.name)} · ${d.date} · ${pl(S.ad, 'adult', 'adults')}${S.ch ? ` + ${pl(S.ch, 'child', 'children')}` : ''} · ${inr(amt)} ${S.linkAmt === 'deposit' ? `deposit, ${inr(q.total - amt)} balance due ${d.due}` : 'in full'}</p>
        <div class="ctr-lk">${ICON.link}<code>${LINK}</code><button type="button" class="a-btn ghost sm" data-act="copy">${ICON.copy}<span>Copy</span></button></div>
        <div class="ctr-cd"><div><span>Link expires in</span><b class="num" data-cd>${cdFmt(left)}</b><small>Mon 28 Sep, 14:12 IST</small></div><span class="a-meter" data-cdbar style="--v:${((left / 864e5) * 100).toFixed(2)}%"></span></div>
        <div class="ctr-share"><button type="button" class="a-btn" data-act="copy">${ICON.copy}<span>Copy link</span></button><a class="a-btn ctr-wa" href="${wa}" target="_blank" rel="noopener">${ICON.wa}WhatsApp ${esc(custPhone())}</a><a class="a-btn ghost" href="${mail}">${ICON.mail}Email</a></div>
        <p class="ctr-hint">${ICON.info}${d.short} now shows ${d.left - q.n} seats left on the site. If the link lapses, the seats are released, the history logs it and the waitlist gets an offer.</p>
        ${timeline(q)}
        <div class="ctr-dact"><a href="#" class="a-btn ghost sm">Open booking ${REF}</a><button type="button" class="a-btn ghost sm" data-act="edit">Back to the form</button><button type="button" class="a-btn danger sm" data-act="edit">Cancel link</button></div>
      </div></div>`;
    }
    const paidAll = D.kind === 'paid';
    return `<div class="a-card ctr-done"><div class="a-card-b">
      <div class="ctr-dh"><span class="a-chip ok">${ICON.check}Confirmed</span><span class="a-chip ${paidAll ? 'ok' : 'warn'}">${paidAll ? 'Fully paid' : `Balance ${inr(q.balance)} due ${d.due}`}</span><span class="a-chip mute">${REF}</span></div>
      <h2>${esc(custName())} is booked</h2>
      <p class="ctr-dm">${inr(amt)} received by ${S.method === 'upi' ? 'UPI' : S.method === 'bank' ? 'bank transfer' : 'cash'}${S.ref.trim() ? ` · ref ${esc(S.ref.trim())}` : ''} · ${esc(PKG.name)} · ${d.date}</p>
      <div class="ctr-docs"><a href="#" class="ctr-doc">${ICON.file}<span><b>Receipt RC/2026-27/0148</b><small>${inr(amt)} · emailed to ${esc(custEmail())}</small></span></a>
        ${paidAll ? `<a href="#" class="ctr-doc">${ICON.file}<span><b>Tax invoice TS/2026-27/0093</b><small>Fully paid · ${gstTxt(q)}</small></span></a>` : `<a href="#" class="ctr-doc">${ICON.clock}<span><b>Balance reminders set</b><small>7 and 3 days before ${d.due}, and on the day</small></span></a>`}
        <a href="#" class="ctr-doc">${ICON.ticket}<span><b>Voucher</b><small>${paidAll ? 'Trip pack unlocks now' : 'Shows “Balance due” until paid'}</small></span></a></div>
      ${timeline(q)}
      <div class="ctr-dact"><a href="#" class="a-btn ghost sm">Open booking ${REF}</a><button type="button" class="a-btn ghost sm" data-act="reset">New booking</button></div>
    </div></div>`;
  }
  function timeline(q) {
    const ch = CHANNELS.find((c) => c[0] === S.chan)[1];
    const it = [
      ['14:12', 'Viraj D.', `Booking ${REF} created · channel ${ch} · ${pl(q.n, 'traveller', 'travellers')}`],
      ['14:12', 'System', 'Enquiry EQ-2291 marked converted and linked'],
    ];
    if (q.man) it.push(['14:12', 'Viraj D.', `Manual discount −${inr(q.man)}: “${esc(S.reason.trim())}”`]);
    it.push(S.done.kind === 'link' ? ['14:12', 'System', `Payment link ${inr(S.done.amount)} sent · seats held until 28 Sep, 14:12`] : ['14:12', 'Viraj D.', `${inr(S.done.amount)} recorded · ${S.method.toUpperCase()} · receipt RC/2026-27/0148`]);
    return `<div class="a-tl ctr-tl">${it.map(([t, w, x]) => `<div class="a-tl-i"><span class="t">${t}</span><span class="w">${w}</span><span class="x">${x}</span></div>`).join('')}</div>`;
  }

  /* ---------- variants ---------- */
  const A = {
    id: 'A', name: 'Desk two-pane',
    note: 'R56 as written: the seven steps stack down the left as numbered cards, all open at once, and the live server quote sits in a sticky panel on the right with deposit, GST and the settle button. Every change re-prices the panel and the total counts to its new value. On a phone the steps run first and the quote drops under them as a full-width card.',
    tradeoff: 'Nothing is hidden, so it is the easiest to audit, but it is a long scroll during a live call.',
    render() {
      CURV = 'A';
      const body = S.done
        ? `<div class="a-split"><div>${doneCard()}</div><aside class="a-panel ctr-qp" data-slot="qa">${qa()}</aside></div>`
        : `<div class="a-split"><div class="ctr-steps">${SECS.map(([t, fn, sum], i) => `<section class="a-card ctr-sc" data-sec="${i + 1}"><div class="a-card-h"><h2><span class="ctr-sn">${i + 1}</span>${t}</h2><div class="acts"><span class="ctr-sum">${sum()}</span></div></div><div class="a-card-b">${fn()}</div></section>`).join('')}</div>
            <aside class="a-panel ctr-qp" data-slot="qa">${qa()}</aside></div>`;
      return TS.adminShell('Bookings', `<div class="ctr-bk ctr-a">${head('New booking', 'Counter booking · the quote is built by the server, exactly as on the website')}${eqBanner()}${body}</div>`);
    },
  };
  const CUES = [
    '“Which date suits you? 13 November has 7 of 12 seats left, and it is guaranteed to run.”',
    '“Is it the two of you and your daughter? How old is she?”',
    '“Would you like the AC room on the houseboat, or front-row seats for the Kathakali?”',
    '“You travelled with us to Goa, so I can take something off for you.”',
    '“Can I confirm the mobile and email on your account?”',
    '“Shall I take everyone’s names now, or would you rather fill them in from the link?”',
    '“I’ll send the payment link on WhatsApp; it holds your seats for 24 hours.”',
  ];
  const B = {
    id: 'B', name: 'Call script',
    note: 'Built for the phone: a live call bar with a timer, then one dense sheet where each step is a row with the line to say on the left and compact controls on the right. Alt+1 to Alt+7 jump between rows and Ctrl+Enter sends the link. A read-back script under the sheet rewrites itself as the quote changes, and the running sum sits in a sticky ledger bar along the bottom. On a phone the cue sits above each row and the ledger wraps into two lines.',
    tradeoff: 'Fastest with a keyboard and a caller on the line, but the dense rows and script feel busy for a walk-in at the desk.',
    render() {
      CURV = 'B';
      const el = callStart ? Date.now() - callStart + 252e3 : 252e3;
      const call = `<div class="ctr-call"><span class="rec" aria-hidden="true"></span><b>On call · Priya Nair</b><span>${ICON.phone}+91 98470 11234</span><span class="num" data-call>${cdFmt(el).slice(3)}</span><span class="keys"><kbd>Alt</kbd>+<kbd>1–7</kbd> jump · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> send</span></div>`;
      const body = S.done ? doneCard()
        : `<div class="a-card ctr-sheet">${SECS.map(([t, fn, sum], i) => `<div class="ctr-row" data-sec="${i + 1}"><div class="ctr-cue"><div class="h"><span class="ctr-sn">${i + 1}</span><b>${t}</b><kbd>Alt ${i + 1}</kbd></div><q>${CUES[i].slice(1, -1)}</q><span class="ctr-sum">${sum()}</span></div><div class="ctr-ctl">${fn()}</div></div>`).join('')}
            <div class="ctr-rb" data-slot="rb">${rb()}</div></div><div class="ctr-lw" data-slot="qb">${qb()}</div>`;
      return TS.adminShell('Bookings', `<div class="ctr-bk ctr-b">${head('New booking · phone', 'Say the line, set the row, move on. Totals come from the server as you go.')}${call}${eqBanner()}${body}</div>`);
    },
  };
  const WHY = [
    'Pick the departure. The counter can sell until departure morning.',
    'Party size is capped at the seats left on this date.',
    'Priced by the server; never discounted.',
    'Deal and early-bird apply on their own. Manual discounts need a reason.',
    'Find them by phone, email or name, or create a new customer.',
    'Names now, or the customer fills them in later.',
    'Send a link, record a payment, or take a deposit.',
  ];
  const C = {
    id: 'C', name: 'Wizard and receipt',
    note: 'One big step card at a time under a seven-stop progress rail that shows each step’s answer, so you can jump back to any stop. The quote is a printed-style receipt on the right with dotted leaders; it re-prices on every change, and on sending it gets a “Link sent” or “Paid” stamp. On a phone the rail scrolls sideways inside itself and the receipt follows the step card.',
    tradeoff: 'Calmest for a walk-in or a new staff member, but it takes the most clicks, and earlier answers are one tap away rather than on screen.',
    render() {
      CURV = 'C';
      const i = S.cstep;
      const rail = `<ol class="ctr-rail" style="--p:${((S.done ? 6 : i) / 6) * 100}%">${SECS.map(([t, , sum], k) => `<li><button type="button" data-act="goto" data-v="${k}" aria-current="${k === i && !S.done ? 'step' : 'false'}" class="${k < i || S.done ? 'past' : ''}"><span class="dot">${k < i || S.done ? ICON.check : k + 1}</span><b>${t}</b><small>${sum()}</small></button></li>`).join('')}</ol>`;
      const [t, fn] = SECS[i];
      const stage = S.done ? doneCard()
        : `<section class="ctr-big" data-sec="${i + 1}" data-k="${i}"><header><span class="eyebrow">Step ${i + 1} of 7</span><h2>${t}</h2><p>${WHY[i]}</p></header><div class="ctr-bb">${fn()}</div>
            <footer>${i ? `<button type="button" class="a-btn ghost" data-act="cprev">${ICON.chevL}Back</button>` : '<span></span>'}${i < 6 ? `<button type="button" class="a-btn" data-act="cnext">Next: ${SECS[i + 1][0]}${ICON.chevR}</button>` : `<div class="ctr-fin" data-slot="cfin">${cfin()}</div>`}</footer></section>`;
      return TS.adminShell('Bookings', `<div class="ctr-bk ctr-c">${head('New booking', 'Counter booking · step by step, with the server’s receipt beside you')}${eqBanner()}${rail}<div class="ctr-cw"><div class="ctr-stage">${stage}</div><aside data-slot="qc">${qc()}</aside></div></div>`);
    },
  };
  const cfin = () => cta(Q());
  SLOTS.cfin = cfin;

  /* ---------- D · quote sheet: the quote is the form ---------- */
  let DED = 'disc';
  const DEDS = { cust: ['Bill to', secCust], trip: ['Trip and departure', secTrip], party: ['Party', secParty], disc: ['Discounts', secDisc], addons: ['Add-ons', secAddons], trav: ['Travellers', secTrav], settle: ['Settle', secSettle] };
  const chanName = () => CHANNELS.find((c) => c[0] === S.chan)[1];
  function dItems() {
    const q = Q(), d = q.d, it = [];
    const open = (ed) => DED === ed && !S.done;
    const H = (t, cols) => it.push({ html: `<div class="ctr-ih"><span>${t}</span>${cols ? '<span class="c q">Qty</span><span class="c r">Rate</span><span class="c a">Amount</span>' : ''}</div>` });
    const L = (ed, lab, sub, qty, rate, amt, cls) => it.push({ ed, html: `<button type="button" class="ctr-il ${cls || ''}${open(ed) ? ' sel' : ''}" data-act="dline" data-v="${ed}" aria-expanded="${open(ed)}"><span class="it"><b>${lab}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="c q num">${qty}</span><span class="c r num">${rate}</span><span class="c a num">${amt}</span></button>` });
    const K = (ed, lab, val, sub, cls) => it.push({ ed, html: `<button type="button" class="ctr-il kv ${cls || ''}${open(ed) ? ' sel' : ''}" data-act="dline" data-v="${ed}" aria-expanded="${open(ed)}"><span class="k">${lab}</span><span class="it"><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>` });
    const T = (lab, amt, cls, sub) => it.push({ html: `<div class="ctr-is ${cls || ''}"><span class="it"><b>${lab}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="c a num">${amt}</span></div>` });
    const c = CUSTS.find((x) => x.id === S.cust);
    H('Bill to');
    K('cust', 'Customer', esc(custName() || 'Pick or create a customer'), S.cust ? `${esc(custPhone() || 'mobile needed')} · ${esc(custEmail() || 'email needed')}${c && c.trips.length ? ` · ${pl(c.trips.length, 'past trip', 'past trips')}` : ''} · GST state ${esc(q.state)}` : 'Search by phone, email or name', S.cust ? '' : 'gh');
    K('trip', 'Trip', esc(PKG.name), `${d.date} · ${d.g ? 'guaranteed · ' : ''}${d.left} of ${d.total} seats left · counter sells until departure morning`);
    H('Fares', true);
    const aRate = S.ad === 1 ? inr(d.dbl + d.sup) : S.ad % 2 === 0 ? inr(d.dbl) : S.ad === 3 ? inr(d.tpl) : 'mixed';
    L('party', pl(S.ad, 'Adult', 'Adults'), roomTxt(d, S.ad), S.ad, aRate, inr(q.adults));
    if (S.ch) L('party', pl(S.ch, 'Child', 'Children'), '5–11 years, sharing', S.ch, inr(d.child), inr(q.kids));
    else L('party', '+ Add a child', `Party is capped at ${d.left} on ${d.short}`, '', '', '', 'gh');
    if (q.deal) L('disc', d.dealName, `${d.deal}% off fares · applies on its own`, '', `${d.deal}%`, `−${inr(q.deal)}`, 'neg');
    if (q.eb) L('disc', 'Early bird', `Applies on its own · tier ends ${d.eb1}`, q.n, `−${inr(q.ebPer)}`, `−${inr(q.eb)}`, 'neg');
    if (q.cp) L('disc', `Coupon ${COUPON.code}`, '3+ travellers', 1, '', `−${inr(q.cp)}`, 'neg');
    else L('disc', '+ Coupon code', `${COUPON.code} is live for this trip (3+ travellers)`, '', '', '', 'gh');
    if (q.man) L('disc', 'Manual discount', q.needReason ? 'Reason required: it prints on the invoice' : `“${esc(S.reason.trim())}”`, '', S.manMode === 'pct' ? `${esc(S.manV)}%` : '', `−${inr(q.man)}`, 'neg' + (q.needReason ? ' bad' : ''));
    else L('disc', '+ Manual discount', '₹ or %, with a required reason · fares never below ₹1', '', '', '', 'gh');
    T('Fares after discounts', inr(q.fareNet), 'sub');
    H('Add-ons · never discounted', true);
    q.add.forEach((a) => L('addons', a[0], a[1], '', '', inr(a[2])));
    L('addons', q.add.length < 4 ? '+ Add an add-on' : 'Change add-ons', q.add.length < 4 ? `${4 - q.add.length} more for this trip` : 'All four are on', '', '', '', 'gh');
    it.push({ html: `<div class="ctr-is tot"><span class="it"><b>Total</b><small>Includes ${gstTxt(q)} · SAC 998555</small></span><span class="c a num" data-total>${inr(q.total)}</span></div>` });
    T('Deposit today · 25%', inr(q.deposit), 'dim', q.depOK ? '' : 'Closed: under 30 days to departure');
    T(`Balance due ${d.due}`, inr(q.balance), 'dim');
    H('Travellers');
    const names = S.tn.slice(0, q.n).map((x) => (x || '').trim()).filter(Boolean);
    K('trav', 'Names', S.trav === 'later' ? `${esc(firstName())} adds them later` : names.length ? esc(names.join(', ')) : 'No names yet', SECS[5][2]());
    H('Payment');
    K('settle', 'Settle', SECS[6][2](), `${S.settle === 'link' ? `${inr(payAmt(q))} Payment Link · seats held 24 h` : S.settle === 'paid' ? `${inr(q.total)} by ${S.method.toUpperCase()}` : `${inr(q.deposit)} now by ${S.method.toUpperCase()}, balance by ${d.due}`} · channel ${chanName()} · created by Viraj D.`);
    return it;
  }
  function dl(part) {
    const it = dItems();
    let cut = it.length - 1;
    if (DED && !S.done) it.forEach((x, i) => { if (x.ed === DED) cut = i; });
    return (part ? it.slice(cut + 1) : it.slice(0, cut + 1)).map((x) => x.html).join('');
  }
  const dEd = () => {
    if (!DED || S.done) return '';
    const [t, fn] = DEDS[DED];
    return `<div class="ctr-ied" role="region" aria-label="Edit ${t}"><div class="ctr-iedh"><span class="lab">${ICON.chevD}Editing · ${t}</span><small>The sheet re-prices as you type · <kbd>Esc</kbd> closes</small><button type="button" class="a-btn ghost sm" data-act="dline" data-v="">Done</button></div>${fn()}</div>`;
  };
  const dcta = () => {
    const q = Q();
    return `<div class="t"><small>Total · GST incl.</small><b class="num" data-total>${inr(q.total)}</b><small>${S.settle === 'paid' ? 'Paid in full now' : `Deposit ${inr(q.deposit)} · balance ${inr(q.balance)}`}</small></div><div class="go">${cta(q, true)}</div>`;
  };
  Object.assign(SLOTS, { dl0: () => dl(0), dl1: () => dl(1), dcta });
  const D = {
    id: 'D', name: 'Quote sheet',
    note: 'The quote is the form. A spreadsheet-style quote sheet with numbered rows (bill to, trip, fares, the automatic deal and early bird, coupon, manual discount with its reason, add-ons, total with GST, deposit, travellers, payment); click any line, or arrow to it and press Enter, and its editor unfolds right under that line while every figure around it re-prices from the server. Empty lines such as “+ Coupon code” or “+ Add an add-on” are ghost rows you click to fill. A sticky bar carries the total and the send button; on sending, the sheet is stamped and the link or receipt card sits above it. On a phone the Qty and Rate columns fold into each line’s subtitle and the editor spans the full width.',
    tradeoff: 'What you edit is exactly what the customer reads, so the form and the quote can never disagree, but a new staff member has to learn that lines are clickable, and only one group is open at a time.',
    render() {
      CURV = 'D';
      const stamp = S.done ? `<span class="ctr-stamp ${S.done.kind === 'link' ? '' : 'ok'}">${S.done.kind === 'link' ? 'Link sent' : S.done.kind === 'paid' ? 'Paid' : 'Deposit paid'}</span>` : '';
      const doc = `<article class="ctr-inv" aria-label="Quote sheet">${stamp}<header class="ctr-ivh"><div><span class="lab">Quote sheet</span><h2>${S.done ? REF : 'Q-2291'}<em>${S.done ? 'issued' : 'draft'}</em></h2><small>${esc(PKG.name)} · from enquiry EQ-2291 · 27 Sep 2026, 14:12 IST</small></div><span class="ctr-live">Server-priced</span></header>
        <div data-slot="dl0">${dl(0)}</div>${dEd()}<div data-slot="dl1">${dl(1)}</div></article>`;
      const tip = `<p class="ctr-ivtip">${ICON.info}<span>Every line is a cell: click one to change it. <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> opens · <kbd>Esc</kbd> closes · <kbd>Ctrl ↵</kbd> sends.</span></p>`;
      const body = S.done ? `<div class="ctr-dw">${doneCard()}${doc}</div>` : `${tip}${doc}<div class="ctr-ivf" data-slot="dcta">${dcta()}</div>`;
      return TS.adminShell('Bookings', `<div class="ctr-bk ctr-d">${head('New booking · quote sheet', 'The quote is the form: click any line to change it, and the server re-prices the sheet')}${eqBanner()}${body}</div>`);
    },
  };

  /* ---------- E · WhatsApp to booking ---------- */
  let EED = null;
  const tokOn = (k) => ({ d0: S.dep === 0, d1: S.dep === 1, party: S.ad === 2 && S.ch === 1, ac: S.ac, cp: S.couponOk, rep: Number(S.manV) > 0 && /goa/i.test(S.reason), adv: S.settle === 'link' && S.linkAmt === 'deposit' })[k];
  const TOKL = { d0: 'Departure', d1: 'Departure', party: 'Party 2 + 1', ac: 'Add-on', cp: 'Coupon', rep: 'Manual discount', adv: 'Deposit link' };
  const tok = (k, txt) => { const on = tokOn(k); return `<button type="button" class="ctr-tk${on ? ' on' : ''}" data-act="tok" data-v="${k}" aria-pressed="${on}">${txt}<span class="ctr-tkl">${on ? ICON.check : ICON.plus}${TOKL[k]}</span></button>`; };
  const THREAD = () => [
    ['in', '11:52', `Hi, this is Priya. I spoke to your team earlier about Munnar &amp; Alleppey. ${tok('d0', '13 Nov')} works best, or ${tok('d1', '18 Dec')} if November is full.`],
    ['in', '11:53', `It's ${tok('party', 'me, my husband Arun and our daughter Diya')}. She is 8.`],
    ['in', '11:54', `Can we get the ${tok('ac', 'AC room on the houseboat')}? Diya can't sleep in the heat.`],
    ['out', '11:55', `Of course. The AC upgrade is ${inr(4500)} for the night. Would you like Kathakali seats or an extra night in Munnar too?`],
    ['in', '11:56', `Just the AC. Is there a ${tok('cp', 'family offer')}? We ${tok('rep', 'went to Goa with you last year')}.`],
    ['in', '11:57', `Please send the link. I'll pay ${tok('adv', 'the advance')} now and the rest later.`],
  ];
  const ADDN = { 'Houseboat AC upgrade': 'the AC houseboat room', 'Kathakali front-row seats': 'Kathakali front-row seats', 'Extra night in Munnar': 'an extra night in Munnar', 'Late-night airport pickup': 'a late-night airport pickup' };
  function draftTxt(q) {
    const d = q.d;
    const join = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0]);
    const discs = [q.deal ? `the ${d.dealName}` : '', q.eb ? 'the early-bird price' : '', q.cp ? `coupon ${COUPON.code}` : '', q.man ? `${inr(q.man)} off${/repeat|goa/i.test(S.reason) ? ' as a returning traveller' : ''}` : ''].filter(Boolean);
    const party = `${pl(S.ad, 'adult', 'adults')}${S.ch ? ` + ${pl(S.ch, 'child', 'children')}` : ''}`;
    const adds = q.add.length ? `, with ${join(q.add.map((a) => ADDN[a[0]]))}` : '';
    const pay = S.settle === 'link'
      ? (S.linkAmt === 'deposit' ? `Pay the ${inr(q.deposit)} advance on the link below to hold your ${pl(q.n, 'seat', 'seats')} for 24 hours; the ${inr(q.balance)} balance is due by ${d.due}.` : `Pay the full amount on the link below; it holds your ${pl(q.n, 'seat', 'seats')} for 24 hours.`)
      : S.settle === 'paid' ? `Once your ${S.method === 'cash' ? 'cash payment' : S.method === 'upi' ? 'UPI payment' : 'bank transfer'} of ${inr(q.total)} is in, you are confirmed and the receipt comes by email.`
      : `Pay the ${inr(q.deposit)} deposit today to confirm; the ${inr(q.balance)} balance is due by ${d.due}.`;
    return `Hi ${esc(firstName())}, here is your quote for ${esc(PKG.name)} on ${d.date} for ${party}${adds}. ${discs.length ? `After ${join(discs)}, it` : 'It'} comes to <b>${inr(q.total)}</b>, GST included. ${pay}`;
  }
  function ethr() {
    const q = Q();
    let h = `<div class="ctr-day"><span>Today</span></div><p class="ctr-wtip">${ICON.info}Tap a highlighted phrase to apply or undo it.</p>` + THREAD().map(([w, t, x]) => `<div class="ctr-msg ${w}"><p>${x}</p><time>${t}${w === 'out' ? ' · Read' : ''}</time></div>`).join('');
    if (S.done) {
      h += `<div class="ctr-msg out new"><p>${draftTxt(q)}</p><time>14:12 · Delivered</time></div>`;
      if (S.done.kind === 'link') {
        const left = Math.max(0, S.done.at + 864e5 - Date.now());
        h += `<div class="ctr-msg out new ctr-paym"><div class="pl">${ICON.link}<span><b>Tripsmith · pay ${inr(S.done.amount)}</b><small>${LINK.replace('https://', '')}</small></span></div><p class="exp">${pl(q.n, 'seat', 'seats')} held · link expires in <b class="num" data-cd>${cdFmt(left)}</b></p><time>14:12 · Delivered</time></div>
          <div class="ctr-typing" role="status"><i></i><i></i><i></i><span>Priya is typing</span></div>`;
      } else h += `<div class="ctr-msg out new ctr-paym"><div class="pl">${ICON.check}<span><b>Received ${inr(S.done.amount)} by ${S.method === 'upi' ? 'UPI' : S.method === 'bank' ? 'bank transfer' : 'cash'}</b><small>Receipt RC/2026-27/0148 attached · ${REF}</small></span></div><time>14:12 · Delivered</time></div>`;
    }
    return h;
  }
  function ecmp() {
    const q = Q();
    if (S.done) return `<div class="ctr-cmps">${ICON.check}<span>Sent on WhatsApp at 14:12 from Tripsmith Business · booking ${REF}</span><button type="button" class="a-btn ghost sm" data-act="edit">Back to the draft</button></div>`;
    return `<div class="ctr-cmpd"><span class="lab">${ICON.chat}Reply written from the server quote</span><p>${draftTxt(q)}</p><span class="att">${ICON.file}Quote PDF${S.settle === 'link' ? ` · ${ICON.link}Payment Link ${inr(payAmt(q))}` : ''}</span></div><div class="ctr-cmpa">${cta(q, true)}</div>`;
  }
  function eSrc(i) {
    const q = Q(), b = blockers(q), need = (re) => b.some((x) => re.test(x));
    switch (i) {
      case 0: return S.dep <= 1 ? ['chat', 'Chat 11:52'] : ['you', 'You set'];
      case 1: return tokOn('party') ? ['chat', 'Chat 11:53'] : ['you', 'You set'];
      case 2: return S.ac && !S.kath && !S.nights && !S.pick ? ['chat', 'Chat 11:54'] : ['you', 'You set'];
      case 3: return q.needReason ? ['need', 'Needs a reason'] : q.cp || q.man ? ['chat', 'Chat 11:56'] : ['auto', 'Auto'];
      case 4: return need(/customer/i) ? ['need', 'Needs you'] : S.cust === 'priya' ? ['chat', 'Matched by number'] : ['you', 'You set'];
      case 5: return S.trav === 'later' ? ['you', 'Customer adds'] : tokOn('party') ? ['chat', 'Names 11:53'] : ['you', 'You set'];
      default: return need(/reference|Deposit closes/) ? ['need', 'Needs you'] : tokOn('adv') ? ['chat', 'Chat 11:57'] : ['you', 'You set'];
    }
  }
  function efl() {
    const src = SECS.map((_, i) => eSrc(i));
    const chat = src.filter((s) => s[0] === 'chat').length, need = src.filter((s) => s[0] === 'need').length;
    return `<div class="ctr-xph"><h2>Booking draft</h2><span class="a-chip ok">${chat} of 7 from the chat</span>${need ? `<span class="a-chip warn">${need} need you</span>` : ''}</div>
      <div class="ctr-xfs">${SECS.map(([t, , sum], i) => `<button type="button" class="ctr-xf${EED === i ? ' on' : ''}" data-act="efield" data-v="${i}" aria-expanded="${EED === i}"><span class="l">${t}</span><span class="v">${esc(sum())}</span><span class="src ${src[i][0]}">${src[i][1]}</span>${ICON.chevD}</button>`).join('')}</div>`;
  }
  const eEd = () => (EED === null || S.done ? '' : `<div class="ctr-xe" role="region" aria-label="Edit ${SECS[EED][0]}"><div class="ctr-iedh"><span class="lab">Edit · ${SECS[EED][0]}</span><button type="button" class="a-btn ghost sm" data-act="efield" data-v="${EED}">Done</button></div>${SECS[EED][1]()}</div>`);
  const eq = () => {
    const q = Q();
    return `<div class="ctr-xq"><div class="h"><span class="lab">Live quote</span><span class="ctr-live">Server quote</span></div>
      <dl><div><dt>Fares</dt><dd class="num">${inr(q.fares)}</dd></div><div><dt>Discounts</dt><dd class="num">−${inr(q.disc)}</dd></div><div><dt>Add-ons</dt><dd class="num">${inr(q.addT)}</dd></div></dl>
      <div class="tot"><span>Total</span><b class="num" data-total>${inr(q.total)}</b></div>
      <small>Includes ${gstTxt(q)} · deposit ${inr(q.deposit)} · balance ${inr(q.balance)} by ${q.d.due}</small><small>Channel ${chanName()} · created by Viraj D.</small></div>`;
  };
  Object.assign(SLOTS, { ethr, ecmp, efl, eq });
  const E = {
    id: 'E', name: 'WhatsApp to booking',
    note: 'Built for the WhatsApp half of the desk: the customer’s thread sits on the left, and the phrases that map to booking fields (“13 Nov”, “me, my husband Arun and our daughter Diya”, “AC room on the houseboat”, “family offer”, “went to Goa with you last year”, “the advance”) are highlighted with what they set. Tap one to apply or undo it. The right rail is the booking draft: each of the seven fields shows where its value came from (chat, auto, you, or needs you) and opens its editor on tap, above the live server quote. The reply under the thread rewrites itself from the quote, and sending drops the message and the payment-link card into the thread with a live 24 h countdown. Extraction is plain phrase matching on dates, counts, add-on names and offer words, so it costs nothing per use. On a phone the thread runs first and the draft follows.',
    tradeoff: 'Fastest when the customer is already typing and the reply is the deliverable, but it leans on the thread: a walk-in with no chat gets an empty left side and the rail does all the work.',
    render() {
      CURV = 'E';
      const thread = `<section class="ctr-wat" aria-label="WhatsApp thread with Priya Nair"><header><span class="ctr-av">PN</span><span class="who"><b>Priya Nair</b><small>+91 98470 11234 · WhatsApp · customer since Nov 2024</small></span><span class="a-chip ok">${ICON.check}Known customer</span></header>
        <div class="ctr-msgs" data-slot="ethr">${ethr()}</div><div class="ctr-cmp" data-slot="ecmp">${ecmp()}</div></section>`;
      const side = S.done ? `<aside class="ctr-xp">${doneCard()}</aside>` : `<aside class="ctr-xp"><div class="a-card"><div data-slot="efl">${efl()}</div>${eEd()}<div data-slot="eq">${eq()}</div></div></aside>`;
      return TS.adminShell('Bookings', `<div class="ctr-bk ctr-e">${head('New booking · from WhatsApp', 'Tap the highlighted words to fill the booking; the reply writes itself from the server quote')}${eqBanner()}<div class="ctr-ew">${thread}${side}</div></div>`);
    },
  };

  /* ---------- behaviour ---------- */
  const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  function countTo(to) {
    const els = SITE.querySelectorAll('[data-total]');
    if (shown === null || shown === to || reduce()) { shown = to; els.forEach((e) => { e.textContent = inr(to); }); return; }
    const from = shown, t0 = performance.now();
    cancelAnimationFrame(raf);
    els.forEach((e) => { e.textContent = inr(from); e.classList.add('ctr-tick'); });
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 520), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      SITE.querySelectorAll('[data-total]').forEach((e) => { e.textContent = inr(v); if (k === 1) e.classList.remove('ctr-tick'); });
      shown = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  const V = () => ({ A, B, C, D, E })[CURV];
  function focusKey(el) {
    if (!el || !el.dataset || !SITE.contains(el)) return null;
    if (el.dataset.in) return `[data-in="${el.dataset.in}"]${el.dataset.i != null ? `[data-i="${el.dataset.i}"]` : ''}${el.dataset.f ? `[data-f="${el.dataset.f}"]` : ''}`;
    if (el.dataset.act) return `[data-act="${el.dataset.act}"]${el.dataset.v != null ? `[data-v="${el.dataset.v}"]` : ''}`;
    return null;
  }
  function draw() {
    const k = focusKey(document.activeElement);
    SITE.innerHTML = V().render();
    if (k) { const n = SITE.querySelector(k); if (n && !n.disabled) n.focus({ preventScroll: true }); }
    countTo(Q().total);
  }
  function refresh() {
    const a = document.activeElement;
    SITE.querySelectorAll('[data-slot]').forEach((el) => {
      if (el.contains(a) || !SLOTS[el.dataset.slot]) return;
      el.innerHTML = SLOTS[el.dataset.slot]();
    });
    countTo(Q().total);
  }
  function clampParty() {
    const d = DEPS[S.dep];
    while (S.ad + S.ch > d.left) { if (S.ch) S.ch--; else S.ad--; }
    S.kath = Math.min(S.kath, S.ad + S.ch);
    while (S.tn.length < S.ad + S.ch) { S.tn.push(''); S.ta.push(''); }
  }
  function applyCoupon() {
    const c = S.coupon.trim().toUpperCase();
    S.couponOk = false; S.couponMsg = '';
    if (!c) return;
    if (c !== COUPON.code) S.couponMsg = `“${c}” isn't a live coupon for this trip.`;
    else if (S.ad + S.ch < COUPON.min) S.couponMsg = `${COUPON.code} needs 3 or more travellers.`;
    else { S.couponOk = true; S.coupon = c; }
  }
  function applyTok(k) {
    const on = tokOn(k);
    if (k === 'd0' || k === 'd1') { S.dep = k === 'd0' ? 0 : 1; clampParty(); if (S.couponOk) applyCoupon(); }
    else if (k === 'party') {
      if (!on) { S.ad = 2; S.ch = 1; clampParty(); }
      S.trav = 'now';
      ['Priya Nair', 'Arun Nair', 'Diya Nair'].forEach((x, i) => { if (!(S.tn[i] || '').trim()) { S.tn[i] = x; S.ta[i] = ['36', '38', '8'][i]; } });
      if (S.couponOk || S.couponMsg) applyCoupon();
    } else if (k === 'ac') S.ac = !S.ac;
    else if (k === 'cp') { if (on) { S.couponOk = false; S.coupon = ''; S.couponMsg = ''; } else { S.coupon = COUPON.code; applyCoupon(); } }
    else if (k === 'rep') { if (on) { S.manV = ''; S.reason = ''; } else { S.manMode = 'inr'; S.manV = '2000'; S.reason = 'Repeat customer, 2024 Goa trip'; } }
    else if (k === 'adv') { if (on) S.linkAmt = 'full'; else { S.settle = 'link'; S.linkAmt = 'deposit'; } }
  }
  function go() {
    const q = Q();
    if (blockers(q).length) return false;
    S.done = { kind: S.settle, at: Date.now(), amount: payAmt(q) };
    return true;
  }
  function copyLink(btn) {
    const lab = btn.querySelector('span');
    const done = (t) => { if (lab) { lab.textContent = t; setTimeout(() => { lab.textContent = btn.closest('.ctr-share') ? 'Copy link' : 'Copy'; }, 1600); } };
    try { navigator.clipboard.writeText(LINK).then(() => done('Copied'), () => done('Press Ctrl+C')); } catch (_) { done('Press Ctrl+C'); }
  }
  function onClick(e) {
    if (!SITE.querySelector('.ctr-bk')) return;
    const b = e.target.closest('[data-act]');
    if (!b || !SITE.contains(b) || b.disabled) return;
    const act = b.dataset.act, v = b.dataset.v, n = S.ad + S.ch, d = DEPS[S.dep];
    switch (act) {
      case 'dep': S.dep = +v; clampParty(); if (S.couponOk) applyCoupon(); break;
      case 'ad': if (+v < 0 ? S.ad > 1 : n < d.left) S.ad += +v; clampParty(); if (S.couponOk || S.couponMsg) applyCoupon(); break;
      case 'ch': if (+v < 0 ? S.ch > 0 : n < d.left) S.ch += +v; clampParty(); if (S.couponOk || S.couponMsg) applyCoupon(); break;
      case 'ac': S.ac = !S.ac; break;
      case 'pick': S.pick = !S.pick; break;
      case 'kath': S.kath = Math.max(0, Math.min(n, S.kath + +v)); break;
      case 'nights': S.nights = +v; break;
      case 'cpfill': S.coupon = COUPON.code; applyCoupon(); break;
      case 'cpapply': applyCoupon(); break;
      case 'manmode': S.manMode = v; if (v === 'pct' && +S.manV > 100) S.manV = '10'; break;
      case 'mclear': S.manV = ''; S.reason = ''; break;
      case 'cust': S.cust = v; break;
      case 'trav': S.trav = v; break;
      case 'settle': S.settle = v; break;
      case 'linkamt': S.linkAmt = v; break;
      case 'method': S.method = v; break;
      case 'chan': S.chan = v; break;
      case 'go': if (!go()) return; break;
      case 'edit': S.done = null; break;
      case 'reset': S = S0(); break;
      case 'goto': S.cstep = +v; if (S.done) S.done = null; break;
      case 'cnext': S.cstep = Math.min(6, S.cstep + 1); break;
      case 'cprev': S.cstep = Math.max(0, S.cstep - 1); break;
      case 'copy': copyLink(b); return;
      case 'dline': if (S.done) { S.done = null; DED = v || null; } else DED = !v || DED === v ? null : v; break;
      case 'efield': EED = EED === +v ? null : +v; break;
      case 'tok': applyTok(v); break;
      default: return;
    }
    e.preventDefault();
    draw();
  }
  function onInput(e) {
    if (!SITE.querySelector('.ctr-bk')) return;
    const t = e.target, k = t.dataset && t.dataset.in;
    if (!k) return;
    if (k === 'coupon') { S.coupon = t.value; S.couponOk = false; S.couponMsg = ''; }
    else if (k === 'manv') { t.value = t.value.replace(/\D/g, '').slice(0, S.manMode === 'pct' ? 3 : 6); if (S.manMode === 'pct' && +t.value > 100) t.value = '100'; S.manV = t.value; }
    else if (k === 'reason') S.reason = t.value;
    else if (k === 'q') { S.q = t.value; }
    else if (k === 'nc') S.nc[t.dataset.f] = t.value;
    else if (k === 'tn') S.tn[+t.dataset.i] = t.value;
    else if (k === 'ta') { t.value = t.value.replace(/\D/g, '').slice(0, 2); S.ta[+t.dataset.i] = t.value; }
    else if (k === 'ref') S.ref = t.value;
    refresh();
  }
  function onKey(e) {
    if (!SITE.querySelector('.ctr-bk')) return;
    const t = e.target;
    if (e.key === 'Enter' && t.dataset && t.dataset.in === 'coupon') { e.preventDefault(); applyCoupon(); draw(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (go()) draw(); return; }
    if (e.key === 'Escape' && CURV === 'D' && DED) {
      e.preventDefault(); const was = DED; DED = null; draw();
      const r = SITE.querySelector(`.ctr-il[data-v="${was}"]`); if (r) r.focus({ preventScroll: true }); return;
    }
    if (e.key === 'Escape' && CURV === 'E' && EED !== null) {
      e.preventDefault(); const was = EED; EED = null; draw();
      const r = SITE.querySelector(`.ctr-xf[data-v="${was}"]`); if (r) r.focus({ preventScroll: true }); return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && t.classList && t.classList.contains('ctr-il')) {
      const all = [...SITE.querySelectorAll('.ctr-il')], i = all.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1);
      if (all[i]) { e.preventDefault(); all[i].focus(); }
      return;
    }
    if (e.altKey && /^[1-7]$/.test(e.key) && SITE.querySelector('.ctr-b')) {
      const sec = SITE.querySelector(`[data-sec="${e.key}"]`);
      if (!sec) return;
      e.preventDefault();
      const f = sec.querySelector('input, button:not([disabled]), select');
      sec.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
      sec.classList.remove('ctr-hit'); void sec.offsetWidth; sec.classList.add('ctr-hit');
      if (f) f.focus({ preventScroll: true });
    }
  }
  function onTick() {
    if (!SITE || !SITE.querySelector('.ctr-bk')) { clearInterval(tick); tick = 0; return; }
    const cds = SITE.querySelectorAll('[data-cd]');
    if (cds.length && S.done) {
      const left = Math.max(0, S.done.at + 864e5 - Date.now());
      cds.forEach((cd) => { cd.textContent = cdFmt(left); });
      const bar = SITE.querySelector('[data-cdbar]'); if (bar) bar.style.setProperty('--v', ((left / 864e5) * 100).toFixed(2) + '%');
    }
    const cl = SITE.querySelector('[data-call]');
    if (cl) cl.textContent = cdFmt(Date.now() - callStart + 252e3).slice(3);
  }
  function mount(site) {
    SITE = site;
    if (!callStart) callStart = Date.now();
    shown = null; countTo(Q().total);
    site.onclick = onClick; site.oninput = onInput; site.onkeydown = onKey;
    clearInterval(tick); tick = setInterval(onTick, 1000);
  }
  A.mount = B.mount = C.mount = D.mount = E.mount = mount;

  /* ---------- styles ---------- */
  const css = `
  .ctr-bk { display: grid; gap: 16px; min-width: 0; }
  .ctr-bk .ic { width: 16px; height: 16px; }
  .ctr-bk kbd { font: 700 11px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-bottom-width: 2px; border-radius: 6px; padding: 1px 6px; background: var(--a-surf); color: var(--mute); white-space: nowrap; }
  .ctr-eq { align-items: flex-start; flex-wrap: wrap; }
  .ctr-eq > div { flex: 1 1 320px; min-width: 0; } .ctr-eq a { color: inherit; font-weight: 800; }
  .ctr-eq span:not(.a-chip) { display: block; color: var(--ink2); margin-top: 2px; }
  .ctr-hint { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--mute); margin-top: 10px !important; }
  .ctr-hint .ic { width: 14px; height: 14px; margin-top: 2px; }
  .ctr-lnk { background: none; border: 0; padding: 0; font: 800 12.5px "DM Sans", sans-serif; color: var(--pri); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .ctr-sn { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: var(--ink); color: #fff; font-size: 12px; font-weight: 800; margin-right: 8px; flex: none; }
  .ctr-sum { font-size: 12.5px; font-weight: 700; color: var(--mute); font-variant-numeric: tabular-nums; }
  .ctr-steps { display: grid; gap: 14px; min-width: 0; }
  .ctr-steps .a-card-h h2 { display: flex; align-items: center; }
  .adm[data-dir="C"] .ctr-sc { padding-bottom: 6px; }

  /* trip */
  .ctr-pk { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
  .ctr-pk img { width: 84px; height: 64px; border-radius: 10px; object-fit: cover; flex: none; }
  .ctr-pk div { flex: 1; min-width: 0; } .ctr-pk b { display: block; font-size: 15px; } .ctr-pk small { color: var(--mute); font-size: 12.5px; font-weight: 600; }
  .ctr-deps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .ctr-dp { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 10px; align-items: center; text-align: left; border: 1.5px solid var(--a-line); background: var(--a-surf); border-radius: 12px; padding: 10px 12px; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s, background .2s, box-shadow .2s; }
  .ctr-dp:hover { border-color: var(--ink); }
  .ctr-dp[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-soft); box-shadow: inset 0 0 0 1px var(--pri); }
  .ctr-dp .dd b, .ctr-dp .pr b { display: block; font-size: 14px; font-weight: 800; }
  .ctr-dp small { font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .ctr-dp .pr { text-align: right; }
  .ctr-dp .tg { grid-column: 1 / -1; display: flex; gap: 5px; flex-wrap: wrap; }
  .ctr-dp .a-meter { display: block; height: 5px; }
  .ctr-dp .sl { font-size: 12px; font-weight: 800; color: var(--ok); text-align: right; } .ctr-dp .sl.lo { color: var(--warn); }

  /* party + steppers + switch */
  .ctr-party { display: grid; gap: 4px; }
  .ctr-pr { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--a-line); }
  .ctr-pr b { display: block; } .ctr-pr small { color: var(--mute); font-size: 12.5px; font-weight: 600; }
  .ctr-stp { display: inline-flex; align-items: center; border: 1.5px solid var(--a-line); border-radius: 10px; overflow: hidden; background: var(--a-surf); flex: none; }
  .ctr-stp button { width: 34px; height: 34px; border: 0; background: none; cursor: pointer; color: var(--ink); display: grid; place-items: center; }
  .ctr-stp button:hover { background: var(--bg2); } .ctr-stp button:disabled { color: #C3C9CF; cursor: default; background: none; }
  .ctr-stp output { min-width: 28px; text-align: center; font-weight: 800; }
  .ctr-cap { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-top: 10px; font-size: 13px; }
  .ctr-cap .a-meter { flex: 1 1 100%; }
  .ctr-sw { width: 42px; height: 24px; border-radius: 99px; border: 0; background: #CBD3DA; position: relative; cursor: pointer; flex: none; transition: background .2s; }
  .ctr-sw i { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .25s var(--ease); }
  .ctr-sw[aria-checked="true"] { background: var(--pri); } .ctr-sw[aria-checked="true"] i { transform: translateX(18px); }

  /* add-ons */
  .ctr-aos { display: grid; }
  .ctr-ao { display: grid; grid-template-columns: minmax(0, 1fr) auto 76px; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--a-line); }
  .ctr-ao:last-child { border-bottom: 0; }
  .ctr-ao b { font-size: 14px; } .ctr-ao p { font-size: 12.5px; color: var(--ink2); margin: 1px 0 !important; } .ctr-ao small { font-size: 12px; font-weight: 700; color: var(--mute); }
  .ctr-ao .amt { text-align: right; font-weight: 800; }

  /* discounts */
  .ctr-auto { display: grid; gap: 6px; margin-bottom: 14px; }
  .ctr-ar { display: flex; gap: 10px; align-items: center; font-size: 13.5px; padding: 8px 10px; border-radius: 10px; background: var(--ok-soft); }
  .ctr-ar.dim { background: var(--bg2); color: var(--mute); }
  .ctr-ar > span:nth-child(2) { flex: 1; min-width: 0; } .ctr-ar > b { color: var(--ok); } .ctr-ar.dim > b { color: var(--mute); }
  .ctr-inl { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ctr-inl input { flex: 1 1 110px; min-width: 0; }
  .ctr-inl .a-seg button { padding: 8px 11px; }
  .ctr-reason { margin-top: 12px; } .ctr-reason em { font-style: normal; font-weight: 700; color: var(--mute); font-size: 11.5px; margin-left: 6px; text-transform: uppercase; letter-spacing: .06em; }
  .ctr-bk .hint .ok { color: var(--ok); font-weight: 700; display: inline-flex; gap: 5px; align-items: center; } .ctr-bk .hint .err { color: #B42318; font-weight: 700; }
  .ctr-bk .hint .ic { width: 13px; height: 13px; }

  /* customer */
  .ctr-srch { max-width: none; margin-bottom: 10px; }
  .ctr-cres { display: grid; gap: 8px; justify-items: start; }
  .ctr-cu { width: 100%; border: 1.5px solid var(--a-line); border-radius: 12px; background: var(--a-surf); overflow: hidden; }
  .ctr-cu.on { border-color: var(--pri); }
  .ctr-cub { width: 100%; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 12px; background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .ctr-cu.on .ctr-cub { background: var(--pri-soft); }
  .ctr-av { width: 34px; height: 34px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 800; flex: none; }
  .ctr-cub .who { flex: 1 1 180px; min-width: 0; } .ctr-cub .who b { display: block; } .ctr-cub .who small { color: var(--mute); font-size: 12.5px; overflow-wrap: anywhere; }
  .ctr-past { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 12px; font-size: 13px; border-top: 1px solid var(--a-line); }
  .ctr-past > span:first-child { display: inline-flex; gap: 6px; align-items: center; flex: 1 1 240px; }
  .ctr-link { display: flex; gap: 6px; align-items: flex-start; font-size: 12.5px; color: var(--mute); padding: 0 12px 10px; margin-top: 8px !important; }
  .ctr-link .ic { width: 14px; height: 14px; margin-top: 2px; }
  .ctr-none { font-size: 13px; color: var(--mute); }
  .ctr-new { width: 100%; display: grid; gap: 10px; justify-items: start; } .ctr-new .a-row2 { width: 100%; }

  /* travellers */
  .ctr-tv { display: grid; gap: 8px; margin-top: 12px; }
  .ctr-tr { display: grid; grid-template-columns: 116px minmax(0, 1fr) 64px; gap: 8px; align-items: center; }
  .ctr-tr .lab { font-size: 12.5px; font-weight: 700; color: var(--mute); }
  .ctr-tr input { font: 500 14px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 10px; padding: 8px 10px; background: var(--a-surf); color: var(--ink); min-width: 0; width: 100%; }
  .ctr-tv + *, .ctr-bk .ctr-inl + .a-note { margin-top: 12px; }

  /* settle */
  .ctr-opts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .ctr-opt { display: grid; gap: 3px; justify-items: start; text-align: left; border: 1.5px solid var(--a-line); background: var(--a-surf); border-radius: 12px; padding: 12px; font: inherit; color: inherit; cursor: pointer; transition: border-color .2s, background .2s; }
  .ctr-opt .ic { width: 20px; height: 20px; color: var(--pri); margin-bottom: 4px; }
  .ctr-opt b { font-size: 14px; } .ctr-opt small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .ctr-opt:hover { border-color: var(--ink); } .ctr-opt[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-soft); box-shadow: inset 0 0 0 1px var(--pri); }
  .ctr-opt:disabled { opacity: .45; cursor: not-allowed; }
  .ctr-det { display: grid; gap: 10px; justify-items: start; margin-top: 12px; padding: 12px; border-radius: 12px; background: var(--bg2); }
  .ctr-det p { font-size: 12.5px; color: var(--ink2); } .ctr-det .a-field { width: min(100%, 360px); }
  .ctr-bk .lab { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
  .ctr-chan { display: flex; gap: 8px 12px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
  .ctr-chan .a-seg { flex-wrap: wrap; }
  .ctr-by { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--mute); margin-left: auto; } .ctr-by b { color: var(--ink); }

  /* shared quote bits */
  .ctr-blk { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 4px; }
  .ctr-blk li { display: flex; gap: 6px; align-items: flex-start; font-size: 12.5px; font-weight: 700; color: var(--warn); }
  .ctr-blk .ic { width: 14px; height: 14px; margin-top: 2px; }
  .ctr-go { width: 100%; justify-content: center; padding: 12px 14px; font-size: 14.5px; }
  .ctr-go kbd { margin-left: 6px; background: rgba(255,255,255,.5); border-color: rgba(20,32,42,.2); color: var(--ink); }
  .ctr-sm { font-size: 12px; color: var(--mute); margin-top: 6px !important; } .ctr-sm b { color: var(--ink); }
  .ctr-tick { color: var(--pri); }
  [data-total] { transition: color .4s; }

  /* A · panel */
  .ctr-qp .ctr-qh { display: flex; align-items: center; gap: 8px; } .ctr-qh h2 { font-size: 16px; }
  .ctr-live { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--ok); display: inline-flex; gap: 6px; align-items: center; }
  .ctr-live::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); animation: a-pulse 2s infinite; }
  .ctr-qs { font-size: 12.5px; color: var(--mute); font-weight: 600; }
  .ctr-ql { margin: 0; display: grid; gap: 7px; }
  .ctr-ql > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; }
  .ctr-ql dt small { display: block; font-size: 11.5px; color: var(--mute); font-weight: 600; }
  .ctr-ql dd { margin: 0; font-weight: 700; white-space: nowrap; }
  .ctr-ql .neg dd { color: var(--ok); } .ctr-ql .bad dt small { color: #B42318; font-weight: 700; }
  .ctr-ql .sub { border-top: 1px dashed var(--a-line); padding-top: 7px; font-weight: 700; }
  .ctr-ql .add dt::before { content: "+ "; color: var(--mute); }
  .ctr-tot > div { display: flex; justify-content: space-between; align-items: baseline; }
  .ctr-tot span { font-weight: 800; } .ctr-tot b { font-size: 30px; font-weight: 800; letter-spacing: -.03em; }
  .ctr-tot small { font-size: 12px; color: var(--mute); }

  /* B · call script */
  .ctr-call { display: flex; align-items: center; gap: 8px 16px; flex-wrap: wrap; background: var(--ink); color: #DDE4EA; border-radius: 12px; padding: 10px 14px; font-size: 13.5px; }
  .ctr-call b { color: #fff; } .ctr-call > span { display: inline-flex; gap: 6px; align-items: center; }
  .ctr-call .rec { width: 9px; height: 9px; border-radius: 50%; background: #E5484D; box-shadow: 0 0 0 4px rgba(229,72,77,.25); animation: a-pulse 1.4s infinite; }
  .ctr-call [data-call] { font-weight: 800; color: var(--act); }
  .ctr-call .keys { margin-left: auto; color: #9FB0BE; font-size: 12.5px; }
  .ctr-call kbd { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.2); color: #fff; }
  .ctr-sheet { overflow: hidden; }
  .ctr-row { display: grid; grid-template-columns: 250px minmax(0, 1fr); border-top: 1px solid var(--a-line); }
  .ctr-row:first-child { border-top: 0; }
  .ctr-cue { padding: 12px 14px; background: var(--bg2); display: grid; gap: 6px; align-content: start; border-right: 1px solid var(--a-line); }
  .ctr-cue .h { display: flex; align-items: center; } .ctr-cue .h kbd { margin-left: auto; }
  .ctr-cue q { font-size: 13px; font-style: italic; color: var(--ink2); border-left: 3px solid var(--act); padding-left: 9px; quotes: "“" "”"; }
  .ctr-ctl { padding: 12px 14px; min-width: 0; }
  .ctr-row:focus-within .ctr-cue { background: var(--pri-soft); } .ctr-row:focus-within .ctr-cue q { border-left-color: var(--pri); }
  .ctr-hit { animation: ctr-hit .9s var(--ease); }
  @keyframes ctr-hit { from { box-shadow: inset 4px 0 0 var(--act); } to { box-shadow: inset 0 0 0 transparent; } }
  .ctr-b .ctr-pk { margin-bottom: 8px; } .ctr-b .ctr-pk img { width: 56px; height: 42px; }
  .ctr-b .ctr-deps { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .ctr-b .ctr-dp { padding: 7px 9px; grid-template-columns: 1fr; gap: 3px; }
  .ctr-b .ctr-dp .pr { text-align: left; } .ctr-b .ctr-dp .pr small, .ctr-b .ctr-dp .dd small, .ctr-b .ctr-dp .tg { display: none; } .ctr-b .ctr-dp .sl { text-align: left; }
  .ctr-b .ctr-party { grid-template-columns: 1fr 1fr; gap: 12px; } .ctr-b .ctr-pr { border: 0; padding: 0; }
  .ctr-b .ctr-ao { padding: 6px 0; } .ctr-b .ctr-ao p { display: none; }
  .ctr-b .ctr-opt { padding: 9px 10px; } .ctr-b .ctr-opt small { display: none; }
  .ctr-b .ctr-hint { margin-top: 6px !important; }
  .ctr-rb { border-top: 2px solid var(--ink); padding: 14px; display: grid; gap: 6px; background: #FFFBF2; }
  .ctr-rb .lab { display: inline-flex; gap: 6px; align-items: center; color: var(--warn); }
  .ctr-rb p { font-size: 15px; line-height: 1.6; color: var(--ink); max-width: 80ch; } .ctr-rb p b { background: var(--act); padding: 0 4px; border-radius: 4px; }
  .ctr-lw { position: sticky; bottom: 0; z-index: 4; }
  .ctr-ledger { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; background: var(--ink); color: #fff; border-radius: 14px; padding: 10px 12px 10px 18px; box-shadow: 0 -10px 30px -12px rgba(20,32,42,.35); }
  .ctr-ledger > span { display: grid; } .ctr-ledger small { font-size: 11px; font-weight: 700; color: #9FB0BE; letter-spacing: .04em; }
  .ctr-ledger b { font-size: 15px; } .ctr-ledger i { font-style: normal; color: #6F8292; font-weight: 800; font-size: 18px; }
  .ctr-ledger .tot b { font-size: 24px; color: var(--act); letter-spacing: -.02em; }
  .ctr-ledger .dep { background: none; border: 0; border-left: 1px solid #33485A; border-radius: 0; box-shadow: none; cursor: default; padding: 0 0 0 14px; width: auto; display: grid; grid-template-columns: none; color: inherit; }
  .ctr-ledger .go { margin-left: auto; min-width: 260px; } .ctr-ledger .ctr-blk li { color: var(--act); }
  .ctr-ledger .ctr-tick { color: #fff; }

  /* C · wizard + receipt */
  .ctr-rail { list-style: none; margin: 0; padding: 0 0 4px; display: grid; grid-template-columns: repeat(7, minmax(112px, 1fr)); gap: 6px; position: relative; overflow-x: auto; }
  .ctr-rail::before { content: ""; position: absolute; left: 22px; right: 22px; top: 17px; height: 2px; background: var(--a-line); }
  .ctr-rail::after { content: ""; position: absolute; left: 22px; top: 17px; height: 2px; width: calc((100% - 44px) * var(--p) / 100); background: var(--pri); transition: width .5s var(--ease); }
  .ctr-rail button { position: relative; z-index: 1; width: 100%; display: grid; justify-items: start; gap: 2px; background: none; border: 0; padding: 0 4px; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .ctr-rail .dot { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--a-surf); border: 2px solid var(--a-line); font-weight: 800; font-size: 13px; color: var(--mute); margin-bottom: 4px; transition: background .25s, border-color .25s; }
  .ctr-rail .past .dot { background: var(--pri); border-color: var(--pri); color: #fff; }
  .ctr-rail [aria-current="step"] .dot { border-color: var(--pri); color: var(--pri); box-shadow: 0 0 0 4px var(--pri-soft); }
  .ctr-rail b { font-size: 13px; } .ctr-rail small { font-size: 11.5px; color: var(--mute); font-weight: 600; font-variant-numeric: tabular-nums; }
  .ctr-cw { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 22px; align-items: start; }
  .ctr-stage { min-width: 0; }
  .ctr-big { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 20px; padding: 26px 28px; display: grid; gap: 18px; box-shadow: 0 18px 40px -28px rgba(20,32,42,.35); animation: ctr-in .45s var(--ease); }
  @keyframes ctr-in { from { opacity: 0; transform: translateY(10px); } }
  .ctr-big header h2 { font-size: 30px; margin-top: 4px !important; } .ctr-big header p { color: var(--mute); font-weight: 600; margin-top: 6px !important; }
  .ctr-big footer { display: flex; justify-content: space-between; align-items: end; gap: 12px; border-top: 1px solid var(--a-line); padding-top: 16px; flex-wrap: wrap; }
  .ctr-big footer .a-btn { padding: 11px 18px; font-size: 14.5px; }
  .ctr-fin { flex: 0 1 380px; }
  .ctr-c .ctr-deps { gap: 10px; } .ctr-c .ctr-dp { padding: 14px 16px; }
  .ctr-rc { position: sticky; top: 12px; background: #FFFDF7; border: 1px solid #EDE6D6; border-bottom: 0; padding: 22px 22px 18px; font-size: 13.5px; box-shadow: 0 24px 40px -30px rgba(20,32,42,.45); }
  .ctr-rc::after { content: ""; position: absolute; left: -1px; right: -1px; bottom: -10px; height: 10px; background: linear-gradient(-45deg, transparent 7px, #FFFDF7 0) 0 0 / 14px 10px repeat-x, linear-gradient(45deg, transparent 7px, #FFFDF7 0) 0 0 / 14px 10px repeat-x; }
  .ctr-rc header { display: grid; justify-items: center; gap: 2px; padding-bottom: 12px; border-bottom: 2px dashed #D9CFBB; text-align: center; }
  .ctr-rc .lg { display: inline-flex; gap: 8px; align-items: center; font-weight: 800; font-size: 17px; letter-spacing: .14em; text-transform: uppercase; }
  .ctr-rc .lg i { width: 12px; height: 12px; border-radius: 50%; background: var(--act); box-shadow: 0 0 0 4px var(--pri); }
  .ctr-rc header > span:last-child { font-size: 11.5px; color: var(--mute); letter-spacing: .1em; text-transform: uppercase; font-weight: 700; }
  .ctr-rm { margin: 12px 0; display: grid; gap: 3px; font-size: 12.5px; }
  .ctr-rm > div { display: flex; gap: 10px; } .ctr-rm dt { width: 64px; color: var(--mute); flex: none; } .ctr-rm dd { margin: 0; font-weight: 700; min-width: 0; }
  .ctr-rl { display: grid; gap: 6px; border-top: 2px dashed #D9CFBB; padding-top: 12px; }
  .ctr-rl > div { display: flex; align-items: baseline; gap: 6px; }
  .ctr-rl span { min-width: 0; max-width: 70%; } .ctr-rl small { display: block; font-size: 11px; color: var(--mute); }
  .ctr-rl i { flex: 1; border-bottom: 1.5px dotted #C8BEA8; transform: translateY(-4px); min-width: 12px; }
  .ctr-rl b { white-space: nowrap; } .ctr-rl .neg b { color: var(--ok); } .ctr-rl .bad small { color: #B42318; font-weight: 700; }
  .ctr-rl .sub { font-weight: 800; padding-top: 4px; }
  .ctr-rt { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid var(--ink); border-bottom: 2px solid var(--ink); margin-top: 12px; padding: 8px 0; }
  .ctr-rt span { font-weight: 800; letter-spacing: .12em; text-transform: uppercase; font-size: 12.5px; } .ctr-rt b { font-size: 28px; letter-spacing: -.03em; }
  .ctr-rg { font-size: 11.5px; color: var(--mute); margin-top: 6px !important; }
  .ctr-rd { display: grid; gap: 4px; margin-top: 12px; font-size: 13px; } .ctr-rd > div { display: flex; justify-content: space-between; } .ctr-rd span { color: var(--mute); }
  .ctr-rc footer { margin-top: 14px; font-size: 11px; color: var(--mute); text-align: center; letter-spacing: .04em; }
  .ctr-stamp { position: absolute; top: 90px; right: 14px; transform: rotate(-12deg); border: 3px solid #B42318; color: #B42318; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; padding: 4px 12px; border-radius: 8px; font-size: 15px; background: rgba(255,253,247,.85); animation: ctr-stamp .5s var(--ease); }
  .ctr-stamp.ok { border-color: var(--ok); color: var(--ok); }
  @keyframes ctr-stamp { from { opacity: 0; transform: rotate(-12deg) scale(1.6); } }

  /* final state */
  .ctr-done .a-card-b { display: grid; gap: 14px; }
  .adm[data-dir="C"] .ctr-done .a-card-b { padding: 4px 0; }
  .ctr-c .ctr-done, .ctr-b .ctr-done { border-radius: 20px; } .ctr-c .ctr-done .a-card-b, .ctr-b .ctr-done .a-card-b { padding: 24px; }
  .ctr-done { animation: ctr-in .45s var(--ease); }
  .ctr-dh { display: flex; gap: 6px; flex-wrap: wrap; }
  .ctr-done h2 { font-size: 24px; } .ctr-dm { color: var(--ink2); font-size: 14px; }
  .ctr-lk { display: flex; align-items: center; gap: 10px; border: 1.5px dashed var(--pri); background: var(--pri-soft); border-radius: 12px; padding: 10px 12px; color: var(--pri-ink); }
  .ctr-lk code { flex: 1; min-width: 0; font: 700 14px ui-monospace, "SF Mono", Consolas, monospace; overflow-wrap: anywhere; }
  .ctr-cd { display: grid; gap: 8px; } .ctr-cd > div { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .ctr-cd span { font-size: 13px; color: var(--mute); font-weight: 700; } .ctr-cd b { font-size: 26px; letter-spacing: -.02em; } .ctr-cd small { color: var(--mute); font-size: 12.5px; }
  .ctr-cd .a-meter { display: block; }
  .ctr-share { display: flex; gap: 8px; flex-wrap: wrap; }
  .ctr-wa { background: var(--wa); } .ctr-wa:hover { background: #106a31; }
  .ctr-docs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .ctr-doc { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--a-line); border-radius: 12px; padding: 12px; text-decoration: none; }
  .ctr-doc .ic { width: 20px; height: 20px; color: var(--pri); } .ctr-doc b { display: block; font-size: 13.5px; } .ctr-doc small { font-size: 12px; color: var(--mute); overflow-wrap: anywhere; }
  .ctr-tl { margin-top: 4px; }
  .ctr-dact { display: flex; gap: 8px; flex-wrap: wrap; }

  /* D · quote sheet */
  .ctr-ivtip { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--mute); margin: 0; }
  .ctr-ivtip .ic { width: 15px; height: 15px; margin-top: 2px; flex: none; }
  .ctr-ivtip kbd { margin: 0 1px; }
  .ctr-inv { position: relative; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; counter-reset: r; box-shadow: 0 18px 40px -30px rgba(20,32,42,.35); min-width: 0; }
  .ctr-ivh { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 18px 20px 14px; border-bottom: 2px solid var(--ink); }
  .ctr-ivh > div { min-width: 0; }
  .ctr-ivh h2 { font-size: 26px; letter-spacing: -.02em; margin-top: 2px !important; }
  .ctr-ivh h2 em { font-style: normal; font-size: 11.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); margin-left: 8px; vertical-align: middle; }
  .ctr-ivh small { color: var(--mute); font-size: 12.5px; font-weight: 600; }
  .ctr-ih, .ctr-il, .ctr-is { display: grid; grid-template-columns: 38px minmax(0, 1fr) 52px 100px 112px; gap: 0 12px; align-items: center; }
  .ctr-ih { padding: 12px 20px 6px 0; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); border-bottom: 1px solid var(--a-line); background: color-mix(in srgb, var(--a-bg) 60%, var(--a-surf)); }
  .ctr-ih > span:first-child { grid-column: 2; } .ctr-ih .c { text-align: right; }
  .ctr-il, .ctr-is { width: 100%; padding: 9px 20px 9px 0; border: 0; border-bottom: 1px solid var(--a-line); background: none; font: inherit; color: inherit; text-align: left; counter-increment: r; position: relative; }
  .ctr-il::before, .ctr-is::before { content: counter(r); font: 700 11px ui-monospace, "SF Mono", Consolas, monospace; color: var(--mute); display: grid; place-items: center; align-self: stretch; border-right: 1px solid var(--a-line); margin: -9px 0; }
  .ctr-il { cursor: pointer; transition: background .15s, box-shadow .15s; }
  .ctr-il:hover { background: color-mix(in srgb, var(--pri) 6%, transparent); }
  .ctr-il:focus-visible { outline: 2px solid var(--pri); outline-offset: -2px; }
  .ctr-il.sel { background: var(--pri-soft); box-shadow: inset 3px 0 0 var(--pri); }
  .ctr-il.sel::before { color: var(--pri); font-weight: 800; }
  .ctr-il .it, .ctr-is .it { min-width: 0; }
  .ctr-il .it b, .ctr-is .it b { display: block; font-size: 14px; }
  .ctr-il .it small, .ctr-is .it small { display: block; font-size: 12px; color: var(--mute); font-weight: 600; overflow-wrap: anywhere; }
  .ctr-il .c, .ctr-is .c { text-align: right; font-size: 13.5px; white-space: nowrap; }
  .ctr-il .a, .ctr-is .a { font-weight: 800; font-size: 14px; }
  .ctr-is .it { grid-column: 2 / 5; }
  .ctr-il.neg .a, .ctr-il.neg .r { color: var(--ok); }
  .ctr-il.bad .it small { color: #B42318; font-weight: 700; }
  .ctr-il.gh .it b { color: var(--pri); font-weight: 700; }
  .ctr-il.kv { grid-template-columns: 38px 96px minmax(0, 1fr); }
  .ctr-il.kv .k { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); }
  .ctr-is.sub { background: color-mix(in srgb, var(--a-bg) 50%, var(--a-surf)); } .ctr-is.sub .it b { font-weight: 800; }
  .ctr-is.tot { border-top: 2px solid var(--ink); border-bottom: 2px solid var(--ink); padding-top: 12px; padding-bottom: 12px; }
  .ctr-is.tot .it b { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; } .ctr-is.tot .a { font-size: 28px; letter-spacing: -.03em; }
  .ctr-is.dim .it b { font-weight: 600; color: var(--ink2); font-size: 13.5px; } .ctr-is.dim .a { font-weight: 700; }
  .ctr-ied { margin-left: 38px; padding: 14px 20px 16px; border-bottom: 1px solid var(--a-line); border-left: 3px solid var(--pri); background: var(--a-surf); box-shadow: inset 0 12px 18px -18px rgba(20,32,42,.5); animation: ctr-drop .3s var(--ease); min-width: 0; }
  @keyframes ctr-drop { from { opacity: 0; transform: translateY(-6px); } }
  .ctr-iedh { display: flex; gap: 6px 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  .ctr-iedh .lab { display: inline-flex; gap: 6px; align-items: center; color: var(--pri); }
  .ctr-iedh small { font-size: 12px; color: var(--mute); flex: 1 1 200px; } .ctr-iedh .a-btn { margin-left: auto; }
  .ctr-inv .ctr-stamp { top: 22px; right: 20px; background: var(--a-surf); }
  .ctr-inv .ctr-live { margin-left: 0; flex: none; }
  .ctr-ivf { position: sticky; bottom: 0; z-index: 4; display: flex; gap: 10px 18px; align-items: center; flex-wrap: wrap; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 10px 12px 10px 18px; box-shadow: 0 -12px 30px -18px rgba(20,32,42,.4); }
  .ctr-ivf .t { display: grid; } .ctr-ivf .t small { font-size: 11.5px; color: var(--mute); font-weight: 700; } .ctr-ivf .t b { font-size: 24px; letter-spacing: -.02em; }
  .ctr-ivf .go { margin-left: auto; min-width: 280px; flex: 0 1 380px; }
  .ctr-dw { display: grid; gap: 16px; min-width: 0; }

  /* E · WhatsApp to booking */
  .ctr-ew { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 18px; align-items: start; }
  .ctr-wat { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); overflow: hidden; display: grid; min-width: 0; }
  .ctr-wat > header { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--a-line); background: color-mix(in srgb, var(--wa) 10%, var(--a-surf)); }
  .ctr-wat .who { flex: 1 1 200px; min-width: 0; } .ctr-wat .who b { display: block; } .ctr-wat .who small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .ctr-msgs { display: grid; gap: 8px; align-content: start; padding: 16px; background-color: var(--a-bg); background-image: radial-gradient(color-mix(in srgb, var(--ink) 8%, transparent) 1px, transparent 1.5px); background-size: 16px 16px; min-width: 0; }
  .ctr-day { justify-self: center; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); background: var(--a-surf); border-radius: 8px; padding: 3px 10px; }
  .ctr-wtip { justify-self: center; display: inline-flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 700; color: var(--mute); margin: 0; text-align: center; }
  .ctr-wtip .ic { width: 13px; height: 13px; flex: none; }
  .ctr-msg { max-width: 82%; min-width: 0; justify-self: start; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 4px 14px 14px 14px; padding: 8px 12px 6px; font-size: 14px; line-height: 1.7; box-shadow: 0 1px 1px rgba(20,32,42,.06); overflow-wrap: anywhere; }
  .ctr-msg.out { justify-self: end; border-radius: 14px 4px 14px 14px; background: color-mix(in srgb, var(--wa) 15%, var(--a-surf)); border-color: color-mix(in srgb, var(--wa) 30%, var(--a-line)); }
  .ctr-msg.new { animation: ctr-pop .4s var(--ease) both; } .ctr-msg.new + .ctr-msg.new { animation-delay: .18s; }
  @keyframes ctr-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
  .ctr-msg time { display: block; text-align: right; font-size: 11px; color: var(--mute); font-weight: 600; }
  .ctr-msg p b { background: color-mix(in srgb, var(--act) 55%, transparent); padding: 0 3px; border-radius: 4px; }
  .ctr-tk { display: inline; max-width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 0 3px; margin: 0 1px; border: 0; border-bottom: 2px dashed var(--warn); border-radius: 4px 4px 0 0; background: color-mix(in srgb, var(--act) 32%, transparent); transition: background .2s, border-color .2s; }
  .ctr-tk:hover { background: color-mix(in srgb, var(--act) 60%, transparent); }
  .ctr-tk.on { background: var(--ok-soft); border-bottom: 2px solid var(--ok); }
  .ctr-tkl { display: inline-flex; gap: 3px; align-items: center; margin-left: 5px; vertical-align: 1px; font-size: 10px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--warn); white-space: nowrap; }
  .ctr-tk.on .ctr-tkl { color: var(--ok); } .ctr-bk .ctr-tkl .ic { width: 11px; height: 11px; }
  .ctr-paym .pl { display: flex; gap: 10px; align-items: center; background: var(--a-surf); border-radius: 10px; padding: 8px 10px; line-height: 1.4; }
  .ctr-paym .pl .ic { width: 20px; height: 20px; color: var(--pri); flex: none; } .ctr-paym .pl span { min-width: 0; }
  .ctr-paym .pl b, .ctr-paym .pl small { display: block; } .ctr-paym .pl small { font-size: 12px; color: var(--mute); }
  .ctr-paym .exp { font-size: 12.5px; margin-top: 6px !important; }
  .ctr-typing { justify-self: start; display: inline-flex; gap: 4px; align-items: center; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 14px; padding: 8px 12px; font-size: 12px; color: var(--mute); }
  .ctr-typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--mute); animation: ctr-dot 1.2s infinite; }
  .ctr-typing i:nth-child(2) { animation-delay: .15s; } .ctr-typing i:nth-child(3) { animation-delay: .3s; } .ctr-typing span { margin-left: 6px; }
  @keyframes ctr-dot { 0%, 60%, 100% { opacity: .3; transform: none; } 30% { opacity: 1; transform: translateY(-3px); } }
  .ctr-cmp { border-top: 1px solid var(--a-line); padding: 12px 14px; display: grid; gap: 10px; background: var(--a-surf); min-width: 0; }
  .ctr-cmpd { border: 1.5px dashed color-mix(in srgb, var(--wa) 50%, var(--a-line)); border-radius: 14px; padding: 10px 12px; display: grid; gap: 6px; min-width: 0; }
  .ctr-cmpd .lab { display: inline-flex; gap: 6px; align-items: center; }
  .ctr-cmpd p { font-size: 14px; line-height: 1.55; } .ctr-cmpd p b { background: color-mix(in srgb, var(--act) 60%, transparent); padding: 0 4px; border-radius: 4px; }
  .ctr-cmpd .att { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; font-weight: 700; color: var(--mute); } .ctr-cmpd .att .ic { width: 14px; height: 14px; }
  .ctr-e .ctr-go { background: var(--wa); color: #fff; } .ctr-e .ctr-go:hover:not(:disabled) { background: #106a31; }
  .ctr-cmps { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--ok); font-weight: 700; } .ctr-cmps span { flex: 1 1 220px; }
  .ctr-xp { display: grid; gap: 12px; min-width: 0; position: sticky; top: 12px; }
  .ctr-xp > .a-card { overflow: hidden; }
  .ctr-xph { display: flex; gap: 6px 8px; align-items: center; flex-wrap: wrap; padding: 14px 16px 10px; } .ctr-xph h2 { font-size: 16px; margin-right: auto; }
  .ctr-xfs { display: grid; border-top: 1px solid var(--a-line); }
  .ctr-xf { display: grid; grid-template-columns: 84px minmax(0, 1fr) auto 14px; gap: 10px; align-items: center; width: 100%; padding: 10px 16px; background: none; border: 0; border-bottom: 1px solid var(--a-line); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: background .15s; }
  .ctr-xf:hover { background: color-mix(in srgb, var(--pri) 6%, transparent); } .ctr-xf.on { background: var(--pri-soft); box-shadow: inset 3px 0 0 var(--pri); }
  .ctr-xf .l { font-size: 11.5px; font-weight: 800; color: var(--mute); text-transform: uppercase; letter-spacing: .05em; }
  .ctr-xf .v { font-weight: 700; font-size: 13.5px; min-width: 0; overflow-wrap: anywhere; }
  .ctr-xf .src { font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 99px; white-space: nowrap; background: var(--bg2); color: var(--mute); }
  .ctr-xf .src.chat { background: color-mix(in srgb, var(--wa) 14%, transparent); color: var(--wa); }
  .ctr-xf .src.need { background: var(--warn-soft); color: var(--warn); } .ctr-xf .src.auto { background: var(--ok-soft); color: var(--ok); }
  .ctr-bk .ctr-xf .ic { width: 14px; height: 14px; color: var(--mute); transition: transform .2s; } .ctr-xf.on .ic { transform: rotate(180deg); }
  .ctr-xe { padding: 14px 16px; border-bottom: 1px solid var(--a-line); border-left: 3px solid var(--pri); animation: ctr-drop .3s var(--ease); min-width: 0; }
  .ctr-xe .ctr-deps, .ctr-xe .ctr-opts, .ctr-xe .a-row2 { grid-template-columns: 1fr; }
  .ctr-xe .ctr-ao { grid-template-columns: minmax(0, 1fr) auto; } .ctr-xe .ctr-ao .amt { grid-column: 2; grid-row: 1; align-self: start; } .ctr-xe .ctr-ao .ctl { grid-column: 1 / -1; }
  .ctr-xe .ctr-tr { grid-template-columns: minmax(0, 1fr) 60px; } .ctr-xe .ctr-tr .lab { grid-column: 1 / -1; }
  .ctr-xe .ctr-by { margin-left: 0; } .ctr-xe .ctr-pk .a-btn { display: none; }
  .ctr-xq { padding: 14px 16px 16px; display: grid; gap: 6px; } .ctr-xq .h { display: flex; align-items: center; }
  .ctr-xq dl { margin: 0; display: grid; gap: 4px; } .ctr-xq dl div { display: flex; justify-content: space-between; font-size: 13.5px; } .ctr-xq dd { margin: 0; font-weight: 700; }
  .ctr-xq .tot { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--a-line); padding-top: 8px; }
  .ctr-xq .tot span { font-weight: 800; } .ctr-xq .tot b { font-size: 28px; letter-spacing: -.03em; }
  .ctr-xq small { font-size: 12px; color: var(--mute); }
  .ctr-e .ctr-done .a-card-b { padding: 18px; } .ctr-e .ctr-docs { grid-template-columns: 1fr; }

  @media (prefers-reduced-motion: reduce) { .ctr-bk *, .ctr-bk *::before, .ctr-bk *::after { animation: none !important; transition: none !important; } }

  @container site (max-width: 700px) {
    .ctr-deps { grid-template-columns: 1fr; }
    .ctr-pk .a-btn { display: none; }
    .ctr-ao { grid-template-columns: minmax(0, 1fr) auto; } .ctr-ao .amt { grid-column: 2; grid-row: 1; align-self: start; } .ctr-ao .ctl { grid-column: 1 / -1; }
    .ctr-opts { grid-template-columns: 1fr; }
    .ctr-tr { grid-template-columns: minmax(0, 1fr) 64px; } .ctr-tr .lab { grid-column: 1 / -1; }
    .ctr-by { margin-left: 0; }
    .ctr-docs { grid-template-columns: 1fr; }
    .ctr-call .keys { display: none; }
    .ctr-row { grid-template-columns: 1fr; } .ctr-cue { border-right: 0; border-bottom: 1px solid var(--a-line); }
    .ctr-b .ctr-deps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ctr-b .ctr-party { grid-template-columns: 1fr; }
    .ctr-ledger { padding: 10px 12px; gap: 4px 10px; } .ctr-ledger i, .ctr-ledger > span:nth-child(1), .ctr-ledger > span:nth-child(3), .ctr-ledger > span:nth-child(5) { display: none; }
    .ctr-ledger .go { min-width: 0; flex: 1 1 100%; } .ctr-go kbd { display: none; }
    .adm[data-dir="B"] .ctr-lw { bottom: 62px; }
    .ctr-rail { grid-template-columns: repeat(7, 104px); }
    .ctr-cw { grid-template-columns: 1fr; }
    .ctr-big { padding: 18px 16px; border-radius: 16px; } .ctr-big header h2 { font-size: 24px; }
    .ctr-rc { position: static; }
    .ctr-fin { flex-basis: 100%; }
    .ctr-c .ctr-done .a-card-b, .ctr-b .ctr-done .a-card-b { padding: 16px; }
    .ctr-lk { flex-wrap: wrap; }
    .ctr-ih, .ctr-il, .ctr-is { grid-template-columns: 28px minmax(0, 1fr) auto; gap: 0 10px; padding-right: 12px; }
    .ctr-ih .q, .ctr-ih .r, .ctr-il .q, .ctr-il .r { display: none; }
    .ctr-is .it { grid-column: 2; }
    .ctr-il.kv { grid-template-columns: 28px minmax(0, 1fr); } .ctr-il.kv::before { grid-row: span 2; } .ctr-il.kv .k { grid-column: 2; }
    .ctr-ied { margin-left: 0; padding: 12px; }
    .ctr-ivh { padding: 14px 12px 12px; flex-wrap: wrap; } .ctr-ivh h2 { font-size: 22px; }
    .ctr-inv .ctr-stamp { top: auto; bottom: 14px; right: 12px; font-size: 13px; }
    .ctr-is.tot .a { font-size: 22px; }
    .ctr-ivf { padding: 10px 12px; } .ctr-ivf .go { min-width: 0; flex: 1 1 100%; }
    .adm[data-dir="B"] .ctr-ivf { bottom: 62px; }
    .ctr-ew { grid-template-columns: 1fr; }
    .ctr-xp { position: static; }
    .ctr-msgs { padding: 12px; } .ctr-msg { max-width: 94%; }
    .ctr-cmp { padding: 12px; }
    .ctr-xf { grid-template-columns: minmax(0, 1fr) auto 14px; gap: 4px 10px; } .ctr-xf .l { grid-column: 1 / -1; }
  }`;

  TS.register({ id: 'counter', label: 'Counter booking', group: 'v2.5 · owner', admin: true, css, variants: [A, B, C, D, E] });
})();

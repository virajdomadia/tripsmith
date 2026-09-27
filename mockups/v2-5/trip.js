/* v2.5 · customer — My trips → one booking (R43 balance in parts, R45 change-date entry, R46 add extras,
   R48 calendar + trip pack, R49 traveller details + readiness checklist, R54 Activity).
   Booking TB-7K2M9Q · Munnar & Alleppey Houseboat · departs Fri 13 Nov 2026 · today Sun 27 Sep 2026 (IST). */
(() => {
  const TS = window.TS;
  const { inr, esc, ICON, PKGS, LEADERS } = TS;
  const PKG = PKGS.munnar;
  const LEAD = LEADERS[PKG.leader];
  const TOTAL = 61497, CAP = 15000, MIN = 1000;
  const IMG = { hero: 'img/munnar-1.jpg', tea: 'img/munnar-2.jpg', boat: 'img/kerala-1.jpg', back: 'img/kerala-2.jpg' };

  /* ---------- module state (survives variant switches) ---------- */
  const S = { paid: 25000, amt: 10000, ticks: { id: false, tabs: true, rain: false }, miraId: '', idErr: '', pack: false, packAnim: false, tab: 'overview', seen: {}, log: [] };
  const bal = () => TOTAL - S.paid;
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return true; } };

  /* ---------- data ---------- */
  const TRAV = () => [
    { k: 'ananya', name: 'Ananya Rao', mono: 'AR', hue: '#1B4FD8', role: 'Lead booker · adult · 34', id: ['Aadhaar', 'XXXX XXXX 4821'], dob: '12 Mar 1992', em: 'Sunita Rao (mother) · +91 98450 12763', food: 'Vegetarian', med: 'None', done: true },
    { k: 'vikram', name: 'Vikram Rao', mono: 'VR', hue: '#B0501C', role: 'Adult · 36', id: ['Passport', 'XXXX 7730'], dob: '4 Jul 1990', em: 'Sunita Rao (mother) · +91 98450 12763', food: 'Non-veg', med: 'Mild asthma, carries an inhaler', done: true },
    { k: 'mira', name: 'Mira Rao', mono: 'MR', hue: '#1F7A4D', role: 'Child · 8', id: S.miraId ? ['Aadhaar', 'XXXX XXXX ' + S.miraId] : null, dob: '19 Feb 2018', em: 'Sunita Rao (mother) · +91 98450 12763', food: 'Vegetarian · allergic to peanuts', med: 'None', done: !!S.miraId },
  ];
  const detDone = () => TRAV().filter((t) => t.done).length;

  const OWNER = [
    { k: 'id', label: 'Carry a printed ID for every traveller', sub: 'Hotels in Munnar ask for a paper copy at check-in.' },
    { k: 'tabs', label: 'Motion-sickness tablets for the ghat road', sub: 'Kochi to Munnar is 4 hours of hairpin bends.' },
    { k: 'rain', label: 'A light rain jacket each', sub: 'Munnar gets evening showers into mid-November.' },
  ];

  // Readiness: 7 equal parts. frac 0..1, status: done | part | todo | locked
  const items = () => {
    const d = detDone(), b = bal();
    return [
      { k: 'det', label: 'Traveller details', sub: `${d} of 3 complete${d < 3 ? ' · Mira needs an ID' : ''}`, frac: d / 3, status: d === 3 ? 'done' : 'part', go: 'travellers' },
      { k: 'bal', label: 'Balance paid', sub: b > 0 ? `${inr(b)} due by Wed 14 Oct` : `Paid in full · ${inr(TOTAL)}`, frac: b > 0 ? 0 : 1, status: b > 0 ? 'todo' : 'done', go: 'payments' },
      { k: 'pack', label: 'Trip pack read', sub: b > 0 ? 'Unlocks Fri 6 Nov, once fully paid' : 'Unlocks Fri 6 Nov', frac: 0, status: 'locked', go: 'pack' },
      { k: 'cal', label: 'Added to calendar', sub: 'Google Calendar · 24 Sep', frac: 1, status: 'done', go: 'overview' },
      ...OWNER.map((o) => ({ k: o.k, owner: true, label: o.label, sub: o.sub, frac: S.ticks[o.k] ? 1 : 0, status: S.ticks[o.k] ? 'done' : 'todo' })),
    ];
  };
  const pct = () => Math.round((items().reduce((a, i) => a + i.frac, 0) / 7) * 100);
  const todoCount = () => items().filter((i) => i.status !== 'done').length;

  const PAYMENTS = () => [
    { t: '24 Sep, 11:42', what: 'Deposit (25 %)', how: 'UPI · Razorpay', amt: 15375 },
    { t: '26 Sep, 19:08', what: 'Balance · part 1', how: 'Card ending 4417 · Razorpay', amt: 9625 },
    ...S.log.map((p, i) => ({ t: '27 Sep, just now', what: `Balance · part ${i + 2}`, how: 'UPI · Razorpay', amt: p })),
  ];

  const ACTIVITY = () => [
    ...S.log.slice().reverse().map((p) => ({ t: '27 Sep, just now', who: 'You', x: `Paid ${inr(p)} towards the balance.`, tone: 'pay' })),
    ...(S.miraId ? [{ t: '27 Sep, just now', who: 'You', x: 'Added Mira Rao’s ID (Aadhaar ending ' + S.miraId + ').', tone: 'det' }] : []),
    { t: '26 Sep, 19:10', who: 'Tripsmith', x: 'Emailed the receipt to ananya.rao@customer.in.', tone: 'mail' },
    { t: '26 Sep, 19:08', who: 'You', x: `Paid ${inr(9625)} towards the balance. ${inr(36497)} left.`, tone: 'pay' },
    { t: '25 Sep, 21:34', who: 'You', x: 'Added Vikram Rao’s details.', tone: 'det' },
    { t: '24 Sep, 11:51', who: 'You', x: 'Added your own details.', tone: 'det' },
    { t: '24 Sep, 11:44', who: 'You', x: 'Added the trip to Google Calendar.', tone: 'cal' },
    { t: '24 Sep, 11:42', who: 'Tripsmith', x: 'Emailed your voucher. It shows “Balance due”.', tone: 'mail' },
    { t: '24 Sep, 11:42', who: 'You', x: `Paid the ${inr(15375)} deposit. Booking confirmed, 3 seats held on 13 Nov.`, tone: 'pay' },
  ];

  const EXTRAS = [
    { n: 'Kathakali show in Munnar', d: 'Front-row seats, 1 hour, Day 2 evening', p: 600, per: 'per traveller', tot: 1800 },
    { n: 'Tea factory tasting', d: 'Guided tasting at a working estate', p: 450, per: 'per traveller', tot: 1350 },
    { n: 'Extra night on the houseboat', d: 'Stay aboard till Wed 18 Nov, all meals', p: 9500, per: 'per booking', tot: 9500 },
  ];

  const DAYS = [
    ['Fri 13 Nov', 'Kochi → Munnar', 'Pickup at Kochi airport, 11:00. Four-hour drive up the ghat road with a stop at Cheeyappara falls. Check in to Tea County by 16:00.'],
    ['Sat 14 Nov', 'Eravikulam and Mattupetty', 'Nilgiri tahr at Eravikulam (gates 08:00, go early), Mattupetty dam and Echo Point after lunch.'],
    ['Sun 15 Nov', 'Tea estate walk', 'Guided walk through Kanan Devan estates at 07:30, Tea Museum at 11:00. Afternoon free.'],
    ['Mon 16 Nov', 'Munnar → Alleppey houseboat', 'Five-hour drive down to Punnamada. Board at 12:00, cruise Vembanad lake, dinner on board.'],
    ['Tue 17 Nov', 'Back to Kochi', 'Breakfast on the boat, check out at 09:00, drop at Kochi airport by 13:00.'],
  ];

  const GCAL = 'https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Munnar+%26+Alleppey+Houseboat+%C2%B7+TB-7K2M9Q&amp;dates=20261113/20261118&amp;location=Cochin+International+Airport,+Arrivals+Gate+3';
  const ICS = 'data:text/calendar;charset=utf-8,' + encodeURIComponent('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tripsmith//EN\r\nBEGIN:VEVENT\r\nUID:TB-7K2M9Q@tripsmith\r\nDTSTART;VALUE=DATE:20261113\r\nDTEND;VALUE=DATE:20261118\r\nSUMMARY:Munnar & Alleppey Houseboat (TB-7K2M9Q)\r\nLOCATION:Cochin International Airport\\, Arrivals Gate 3\r\nEND:VEVENT\r\nEND:VCALENDAR');
  const MAPS = 'https://www.google.com/maps/search/?api=1&amp;query=Cochin+International+Airport+Arrivals';

  /* ---------- shared blocks ---------- */
  const lockSvg = `<svg class="lks" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="sh" d="M8 11V8a4 4 0 0 1 8 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M12 15v2"/></svg>`;
  const av = (t, s = 40) => `<span class="tav" style="--s:${s}px;--h:${t.hue}" aria-hidden="true">${t.mono}</span>`;
  const statusIc = (st) => (st === 'done' ? ICON.check : st === 'locked' ? ICON.lock : st === 'part' ? '<i class="half"></i>' : '<i class="empty"></i>');

  const ring = (id, size = 132) => {
    const p = pct(), C = 326.73;
    const intro = !S.seen[id];
    return `<div class="ring ${intro ? 'intro' : ''}" style="--sz:${size}px" role="img" aria-label="Trip readiness ${p} percent"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52" style="--off:${(C * (1 - p / 100)).toFixed(2)}"/></svg><div class="c"><b class="num" data-count="${p}">${p}%</b><small>ready</small></div></div>`;
  };

  const segbar = (id) => {
    const intro = !S.seen[id];
    return `<div class="seg ${intro ? 'intro' : ''}" role="img" aria-label="Readiness ${pct()} percent: ${items().map((i) => `${i.label} ${i.status === 'done' ? 'done' : i.status === 'locked' ? 'locked' : i.status === 'part' ? 'partly done' : 'to do'}`).join(', ')}">${items().map((i, n) => `<span class="s ${i.status}" style="--f:${i.frac};--i:${n}" title="${esc(i.label)}"><i></i></span>`).join('')}</div>`;
  };

  const checklist = (opts = {}) => `<ul class="ck-list">${items().map((i) => {
    if (i.owner) return `<li><label class="ck ${i.status}"><input type="checkbox" data-act="tick" data-k="tick-${i.k}" data-tick="${i.k}" ${S.ticks[i.k] ? 'checked' : ''}><span class="box">${ICON.check}</span><span class="tx"><b>${esc(i.label)}</b><small>${esc(i.sub)}</small></span><span class="own">From Anjali</span></label></li>`;
    const cta = opts.links && i.status !== 'done' && i.go ? `<button class="lnk" data-act="tab" data-t="${i.go}" data-k="go-${i.k}">${i.k === 'bal' ? 'Pay' : i.k === 'det' ? 'Finish' : 'See'} ${ICON.chevR}</button>` : '';
    return `<li><div class="ck ${i.status}"><span class="st">${statusIc(i.status)}</span><span class="tx"><b>${esc(i.label)}</b><small>${esc(i.sub)}</small></span>${cta}</div></li>`;
  }).join('')}</ul>`;

  const heroBand = (cls = '') => `<header class="hero ${cls}"><div class="ph"><img src="${IMG.hero}" alt="Tea estates on the hills around Munnar"></div><div class="shade"></div><div class="in">
      <div class="chips"><span class="badge dep">${bal() > 0 ? 'Deposit paid' : 'Fully paid'}</span><span class="rf">TB-7K2M9Q</span></div>
      <h1>${esc(PKG.name)}</h1>
      <p class="when">Kerala · 4 nights · Fri 13 Nov → Tue 17 Nov 2026 · starts at Kochi airport</p>
      <p class="cdn"><b class="num">47</b> days to go</p></div></header>`;

  const payPanel = (p, opts = {}) => {
    const b = bal();
    const paidPct = Math.round((S.paid / TOTAL) * 100);
    if (b <= 0) return `<section class="card pay done" aria-labelledby="${p}-pay-h"><div class="payhd"><div><span class="eyebrow">Balance</span><h2 id="${p}-pay-h">Paid in full</h2><small>${inr(TOTAL)} across ${PAYMENTS().length} payments. The trip pack unlocks on Fri 6 Nov.</small></div><span class="okc">${ICON.check}</span></div><div class="meter" aria-hidden="true"><i style="--v:100%"></i></div></section>`;
    const a = Math.min(S.amt, b);
    return `<section class="card pay" aria-labelledby="${p}-pay-h">
      <div class="payhd"><div><span class="eyebrow">Balance due by Wed 14 Oct · 17 days</span><h2 id="${p}-pay-h" class="num">${inr(b)}</h2><small>Paid <b class="num">${inr(S.paid)}</b> of <span class="num">${inr(TOTAL)}</span> · reminders on 7 Oct, 11 Oct and 14 Oct</small></div></div>
      <div class="meter" role="img" aria-label="${paidPct} percent paid"><i style="--v:${paidPct}%"></i></div>
      <div class="amtrow"><div class="fld amt"><label for="${p}-amt">Pay now</label><div class="rs"><span aria-hidden="true">₹</span><input id="${p}-amt" type="text" inputmode="numeric" autocomplete="off" value="${a.toLocaleString('en-IN')}" data-amt-input aria-describedby="${p}-amt-h"></div></div>
      <div class="qchips" role="group" aria-label="Quick amounts">${[[10000, inr(10000)], [15000, inr(15000)], [b, 'Full ' + inr(b)]].map(([v, l]) => `<button type="button" class="qc" data-act="chip" data-amt="${v}" aria-pressed="${a === v}">${l}</button>`).join('')}</div></div>
      <p class="fine" id="${p}-amt-h" data-amt-help aria-live="polite">${helpText(a)}</p>
      <p class="split" data-amt-split ${a > CAP ? '' : 'hidden'}>${splitText(a)}</p>
      <button class="btn block pri" data-act="pay" data-k="${p}-pay">${ICON.shield} <span data-amt-btn>Pay ${inr(a)}</span></button>
      <p class="why">${ICON.info}<span><b>Why pay in parts?</b> Any amount from ${inr(MIN)} works. Razorpay’s test mode takes at most ${inr(CAP)} in one payment, so parts keep every payment under that cap. Each part confirms instantly and shows in Activity.</span></p>
      ${opts.hist ? payHist() : ''}
    </section>`;
  };
  const helpText = (a) => {
    const b = bal();
    if (!a || a < MIN) return `<span class="err">Enter at least ${inr(MIN)}.</span>`;
    if (a > b) return `<span class="err">That’s more than the ${inr(b)} you owe.</span>`;
    return a === b ? 'This clears the balance and puts you on track for the trip pack.' : `After this you’ll owe <b class="num">${inr(b - a)}</b>, due by Wed 14 Oct.`;
  };
  const splitText = (a) => {
    const parts = [];
    let r = a;
    while (r > 0) { parts.push(Math.min(CAP, r)); r -= CAP; }
    return `${ICON.info}<span>${inr(a)} is over the ${inr(CAP)} test cap, so it goes through as ${parts.length} payments one after another: ${parts.map((x) => `<b class="num">${inr(x)}</b>`).join(' + ')}.</span>`;
  };
  const payHist = () => `<div class="hist"><h3>Payments</h3><table class="tr"><thead><tr><th>When</th><th>What</th><th class="r">Amount</th></tr></thead><tbody>${PAYMENTS().map((x) => `<tr><td class="num">${x.t}</td><td>${x.what}<small>${x.how}</small></td><td class="r num">${inr(x.amt)}</td></tr>`).join('')}</tbody></table></div>`;

  const travCard = (t, p) => {
    if (t.done) return `<article class="tv ok"><header>${av(t)}<div><b>${t.name}</b><small>${t.role}</small></div><span class="badge sure">${ICON.check} Complete</span></header>
      <dl><div><dt>ID</dt><dd>${t.id[0]} · <span class="num mask">${t.id[1]}</span></dd></div><div><dt>Date of birth</dt><dd>${t.dob}</dd></div><div class="w"><dt>Emergency contact</dt><dd>${t.em}</dd></div><div><dt>Food</dt><dd><span class="food">${t.food}</span></dd></div><div><dt>Medical notes</dt><dd>${t.med}</dd></div></dl>
      <footer><button class="btn line sm" type="button">Edit ${t.k === 'ananya' ? 'my' : esc(t.name.split(' ')[0]) + '’s'} details</button></footer></article>`;
    return `<article class="tv miss"><header>${av(t)}<div><b>${t.name}</b><small>${t.role}</small></div><span class="badge fill">1 field left</span></header>
      <div class="form">
        <div class="idrow"><div class="fld"><label for="${p}-mt">ID type</label><select id="${p}-mt"><option>Aadhaar</option><option>Passport</option><option>Driving licence</option><option>Voter ID</option></select></div>
        <div class="fld"><label for="${p}-mi">ID number <em>required</em></label><input id="${p}-mi" data-mira inputmode="numeric" autocomplete="off" placeholder="12-digit Aadhaar" aria-describedby="${p}-mi-h" ${S.idErr ? 'aria-invalid="true"' : ''}><small id="${p}-mi-h" class="${S.idErr ? 'err' : 'hint'}">${S.idErr ? esc(S.idErr) : 'We keep only the last 4 digits on screen.'}</small></div></div>
        <div class="fld"><span class="lab">Food</span><div class="foods" role="radiogroup" aria-label="Food for Mira">${['Veg', 'Non-veg', 'Jain', 'Vegan'].map((f) => `<button type="button" role="radio" aria-checked="${f === 'Veg'}" class="qc">${f}</button>`).join('')}</div></div>
        <div class="fld"><label for="${p}-ma">Allergies</label><input id="${p}-ma" value="Peanuts"></div>
        <dl><div><dt>Date of birth</dt><dd>${t.dob}</dd></div><div><dt>Emergency contact</dt><dd>${t.em}</dd></div><div class="w"><dt>Medical notes</dt><dd>${t.med}</dd></div></dl>
      </div>
      <footer><button class="btn sm" type="button" data-act="saveid" data-k="${p}-save">Save Mira’s details</button></footer></article>`;
  };
  const travSection = (p, opts = {}) => `<section class="trs" aria-labelledby="${p}-tr-h">
      ${opts.noHead ? '' : `<div class="sh2"><div><h2 id="${p}-tr-h">Traveller details <span class="ct num">${detDone()} of 3</span></h2><p>Ananya, as lead booker you can fill in everyone. Details lock on <b>Tue 10 Nov</b>, 3 days before departure.</p></div></div>`}
      <div class="tvs">${TRAV().map((t) => travCard(t, p)).join('')}</div>
      <p class="demo">${ICON.info}<span><b>Demo site: use made-up ID numbers only.</b> IDs show masked everywhere, only the trip leader’s printed manifest has them in full, and we delete them 30 days after you’re back.</span></p>
    </section>`;

  const packInside = [['pin', 'Meeting point and time, with a Maps link'], ['phone', 'Anjali’s phone number'], ['bed', 'Hotel addresses and phones'], ['cal', 'Day-by-day plan'], ['info', 'Know before you go: weather, network, cash'], ['shield', '24×7 emergency number'], ['down', 'PDF to keep offline']];
  const pack = (p) => {
    if (!S.pack) return `<section class="card pack locked" aria-labelledby="${p}-pk-h"><div class="pk-hd"><span class="lkb">${lockSvg}</span><div><span class="eyebrow">Trip pack</span><h2 id="${p}-pk-h">Unlocks Fri 6 Nov</h2><p>7 days before departure, once the booking is fully paid.${bal() > 0 ? ` <b class="num">${inr(bal())}</b> still to pay.` : ' You’re fully paid, so it opens on the day.'}</p></div></div>
      <ul class="inside">${packInside.map(([ic, l]) => `<li>${ICON[ic]}<span>${l}</span></li>`).join('')}</ul>
      <div class="pk-ft"><button class="btn line sm" type="button" data-act="pack" data-k="${p}-pack" aria-pressed="false">${ICON.eye} Preview the unlocked pack</button><span class="fine">Mockup toggle: shows what you’ll see on 6 Nov.</span></div></section>`;
    return `<section class="card pack open ${S.packAnim ? 'opening' : ''}" aria-labelledby="${p}-pk-h"><div class="pk-hd"><span class="lkb">${lockSvg}</span><div><span class="eyebrow">Trip pack · unlocked 6 Nov</span><h2 id="${p}-pk-h">Everything for the road</h2><p>Open this on the day. It works offline once downloaded.</p></div><a class="btn sm" href="#" download>${ICON.down} PDF</a></div>
      <div class="pk-body">
        <div class="pk-grid">
          <div class="pk-box meet"><span class="eyebrow">Meeting point</span><b>Cochin International Airport, Arrivals Gate 3 (T1)</b><p><span class="num">Fri 13 Nov · 11:00</span> · look for the blue Tripsmith board</p><a href="${MAPS}" target="_blank" rel="noopener">${ICON.pin} Open in Google Maps</a></div>
          <div class="pk-box lead">${TS.avatar(PKG.leader, 44)}<div><span class="eyebrow">Your trip leader</span><b>${LEAD.name}</b><p>${LEAD.langs} · ${LEAD.years} years leading</p><a href="tel:${LEAD.phone.replace(/\s/g, '')}">${ICON.phone} <span class="num">${LEAD.phone}</span></a></div></div>
        </div>
        <div class="pk-hotels"><div class="hot"><div class="ph"><img src="${IMG.tea}" alt="Tea gardens near Tea County, Munnar" loading="lazy"></div><div><b>Tea County, Munnar</b> <small>13–16 Nov · 3 nights</small><p>Munnar–Kochi Road, Old Munnar, Kerala 685612</p><a href="tel:+914865230460">${ICON.phone} <span class="num">+91 4865 230 460</span></a></div></div>
          <div class="hot"><div class="ph"><img src="${IMG.boat}" alt="Kettuvallam houseboat on the Alleppey backwaters" loading="lazy"></div><div><b>Private houseboat, Alleppey</b> <small>16–17 Nov · 1 night</small><p>Boards at Finishing Point jetty, Punnamada, Alappuzha 688013</p><a href="tel:+919446018822">${ICON.phone} <span class="num">+91 94460 18822</span></a></div></div></div>
        <ol class="days">${DAYS.map(([d, t, x], i) => `<li><span class="dn num">Day ${i + 1}</span><div><b>${t}</b> <small>${d}</small><p>${x}</p></div></li>`).join('')}</ol>
        <div class="kbg"><h3>Know before you go</h3><dl><div><dt>Weather</dt><dd>14–24 °C in Munnar, 30 °C and humid in Alleppey. Evenings are cool up the hill.</dd></div><div><dt>Network</dt><dd>Jio and Airtel work in Munnar town; patchy on the backwaters.</dd></div><div><dt>Cash</dt><dd>Carry ₹3,000 in small notes. Tea stalls and the boat crew take cash only.</dd></div><div><dt>Local rules</dt><dd>Eravikulam is plastic-free. Quiet hours on the houseboat after 22:00.</dd></div><div><dt>Packing</dt><dd>Walking shoes, a light jacket, sunscreen, a small torch, printed IDs.</dd></div></dl></div>
        <div class="sos">${ICON.shield}<div><b>24×7 emergency · <span class="num">+91 80 4718 2290</span></b><small>Answers day and night while you’re on the trip. For police, fire or ambulance dial 112.</small></div></div>
      </div>
      <div class="pk-ft"><button class="btn line sm" type="button" data-act="pack" data-k="${p}-pack" aria-pressed="true">${ICON.lock} Back to locked view</button></div></section>`;
  };

  const calCard = (p) => `<section class="card cal" aria-labelledby="${p}-cal-h"><div class="cal-hd"><span class="cal-ic"><small>Nov</small><b class="num">13</b></span><div><h3 id="${p}-cal-h">On your calendar</h3><p class="fine">All-day, 13–17 Nov, at Kochi airport. A date change updates the same event.</p></div><span class="badge sure">${ICON.check} Added</span></div>
    <div class="row2"><a class="btn line sm" href="${GCAL}" target="_blank" rel="noopener">${ICON.cal} Google Calendar</a><a class="btn line sm" href="${ICS}" download="tripsmith-TB-7K2M9Q.ics">${ICON.down} Apple / Outlook (.ics)</a></div></section>`;

  const extrasCard = (p) => `<section class="card ext" aria-labelledby="${p}-ex-h"><div class="ex-hd"><h3 id="${p}-ex-h">Add extras</h3><span class="badge new">Until Fri 6 Nov</span></div>
    <ul>${EXTRAS.map((e) => `<li><div><b>${e.n}</b><small>${e.d} · ${inr(e.p)} ${e.per}</small></div><button class="btn line sm" type="button" aria-label="Add ${esc(e.n)} for ${inr(e.tot)}">${ICON.plus} <span class="num">${inr(e.tot)}</span></button></li>`).join('')}</ul>
    <p class="fine">Extras join your balance. Deals and coupons don’t apply to them.</p></section>`;

  const manageCard = (p) => `<section class="card mng" aria-labelledby="${p}-mg-h"><h3 id="${p}-mg-h">Change of plans</h3>
    <div class="mg"><div><b>Change date</b><p class="fine">Free until Wed 14 Oct. ₹1,000 per traveller from 15 to 29 Oct; after that, call us. One self-serve change per booking.</p></div><button class="btn line sm" type="button">${ICON.cal} Change date</button></div>
    <div class="mg"><div><b>Cancel booking</b><p class="fine">Refunds follow the <a href="#">cancellation policy</a>, capped at the <span class="num">${inr(S.paid)}</span> you’ve paid.</p></div><button class="btn line sm" type="button">Request cancellation</button></div></section>`;

  const voucherCard = () => `<section class="card vch"><h3>Voucher</h3><p class="fine">Shows “Balance due ${inr(bal())}” until you’ve paid in full. Show it at check-in.</p><div class="row2"><button class="btn sm" type="button">${ICON.down} Voucher (PDF)</button><a class="btn wa sm" href="#">${ICON.wa} WhatsApp us</a></div></section>`;

  const actIc = { pay: 'rupee', det: 'user', cal: 'cal', mail: 'mail' };
  const activity = (p, n = 99) => `<section class="card act" aria-labelledby="${p}-ac-h"><h3 id="${p}-ac-h">Activity</h3><ol class="feed">${ACTIVITY().slice(0, n).map((a) => `<li class="${a.tone}"><span class="fi">${ICON[actIc[a.tone]]}</span><div><p>${a.x}</p><small>${a.t} · ${a.who}</small></div></li>`).join('')}</ol>
    <p class="fine">Upcoming: balance reminders on 7 Oct and 11 Oct. Every change to your booking is logged here and can’t be edited.</p></section>`;

  const crumbs = `<div class="crumbs mtp-cr"><a href="#">My trips</a> / <span>TB-7K2M9Q</span></div>`;

  /* ================= Variant A · Mission control ================= */
  const renderA = () => {
    const p = pct();
    return `${TS.header('My trips')}<div class="mtp vA"><div class="wrap">${crumbs}
      <div class="mc">
        ${heroBand()}
        <section class="card rd" aria-labelledby="a-rd-h"><div class="rd-hd">${ring('A')}<div><span class="eyebrow">Trip readiness</span><h2 id="a-rd-h">${p === 100 ? 'All set for Kerala' : `${todoCount()} things before you go`}</h2><p class="fine">Tick them off any time before Fri 13 Nov.</p></div></div>${checklist()}</section>
      </div>
      <ol class="keyd" aria-label="Key dates">
        ${[['Today', 'Sun 27 Sep', 'now'], ['Balance due', 'Wed 14 Oct', bal() > 0 ? 'warn' : 'done'], ['Extras close · pack unlocks', 'Fri 6 Nov', ''], ['Details lock', 'Tue 10 Nov', ''], ['Departure', 'Fri 13 Nov', 'go']].map(([l, d, c]) => `<li class="${c}"><small>${l}</small><b>${d}</b></li>`).join('')}
      </ol>
      <div class="agrid"><div class="acol">${travSection('a')}${pack('a')}</div>
        <aside class="acol side">${payPanel('a')}${calCard('a')}${extrasCard('a')}${voucherCard()}${manageCard('a')}${activity('a', 6)}</aside></div>
    </div></div>`;
  };

  /* ================= Variant B · Journey line ================= */
  const renderB = () => {
    const b = bal();
    const intro = !S.seen.B;
    const node = (cls, date, rel, title, body) => `<li class="ms ${cls}"><span class="dot" aria-hidden="true"></span><div class="ms-hd"><span class="date"><b>${date}</b><small>${rel}</small></span><h2>${title}</h2></div><div class="ms-b">${body}</div></li>`;
    return `${TS.header('My trips')}<div class="mtp vB"><div class="wrap">${crumbs}
      <header class="bhd"><div class="ph"><img src="${IMG.back}" alt="Backwaters near Alleppey at dusk"></div><div class="bt"><div class="chips"><span class="badge dep">${b > 0 ? 'Deposit paid' : 'Fully paid'}</span><span class="rf">TB-7K2M9Q</span></div><h1>${esc(PKG.name)}</h1><p class="when">Fri 13 Nov → Tue 17 Nov 2026 · 2 adults, 1 child · led by ${LEAD.name}</p></div>
        <div class="bcd"><p class="cdn"><b class="num">47</b> days to go</p><div class="rline"><span class="num">${pct()}% ready</span>${segbar('B')}</div></div></header>
      <div class="bgrid"><ol class="jr ${intro ? 'intro' : ''}" aria-label="Your trip, step by step">
        ${node('past', '24 Sep', 'Booked', 'Deposit paid, seats held', `<p class="fine">Deposit ${inr(15375)} by UPI, then ${inr(9625)} by card on 26 Sep. Added to Google Calendar the same day.</p>`)}
        ${node('now', 'Today', 'Sun 27 Sep', 'Your checklist', `<div class="card">${checklist()}</div>`)}
        ${node(b > 0 ? 'due' : 'past', '14 Oct', b > 0 ? 'in 17 days' : 'Done', b > 0 ? `Pay the balance · ${inr(b)}` : 'Balance paid', payPanel('b', { hist: true }))}
        ${node('', '6 Nov', 'in 40 days', 'Extras close, trip pack opens', `${pack('b')}${extrasCard('b')}`)}
        ${node('', '10 Nov', 'in 44 days', `Traveller details lock <span class="ct num">${detDone()} of 3</span>`, travSection('b', { noHead: true }))}
        ${node('go', '13 Nov', 'in 47 days', 'Departure from Kochi', `<div class="card dep">${TS.avatar(PKG.leader, 44)}<div><b>Anjali meets you at Kochi airport</b><p class="fine">Time, gate and her phone number appear in the trip pack on 6 Nov.</p></div></div>`)}
        ${node('end', '17 Nov', 'in 51 days', 'Back home', '<p class="fine">Drop at Kochi airport by 13:00. We’ll ask how it went the next morning.</p>')}
      </ol>
      <aside class="bside"><div class="card sum"><span class="eyebrow">Booking</span><div class="brk"><div class="l"><span>2 adults × ${inr(21999)}</span><span class="num">${inr(43998)}</span></div><div class="l"><span>1 child (with bed)</span><span class="num">${inr(17499)}</span></div><div class="tot"><span>Total</span><b class="num">${inr(TOTAL)}</b></div><div class="l"><span>Paid so far</span><span class="num">${inr(S.paid)}</span></div><div class="l"><span>Balance</span><b class="num">${inr(b)}</b></div></div></div>
        ${calCard('b')}${voucherCard()}${manageCard('b')}${activity('b', 5)}</aside></div>
    </div></div>`;
  };

  /* ================= Variant C · Tabbed booking ================= */
  const TABS = [['overview', 'Overview'], ['travellers', 'Travellers'], ['payments', 'Payments'], ['pack', 'Trip pack'], ['activity', 'Activity']];
  const renderC = () => {
    const b = bal(), t = S.tab;
    const tabMeta = { overview: '', travellers: `<span class="ct num">${detDone()}/3</span>`, payments: b > 0 ? `<span class="ct due num">${inr(b)}</span>` : `<span class="ct num">${ICON.check}</span>`, pack: S.pack ? '' : ICON.lock, activity: `<span class="ct num">${ACTIVITY().length}</span>` };
    const panels = {
      overview: `<div class="ov"><div class="card"><div class="ov-hd"><h2 id="c-ov-h">Before you go</h2><span class="fine">${todoCount()} left</span></div>${checklist({ links: true })}</div>
          <div class="ovs">${calCard('c')}${extrasCard('c')}${manageCard('c')}</div></div>`,
      travellers: travSection('c'),
      payments: `<div class="pgC">${payPanel('c')}<div class="card"><h3>What you’re paying for</h3><div class="brk"><div class="l"><span>2 adults × ${inr(21999)}</span><span class="num">${inr(43998)}</span></div><div class="l"><span>1 child (with bed)</span><span class="num">${inr(17499)}</span></div><div class="tot"><span>Total</span><b class="num">${inr(TOTAL)}</b></div></div>${payHist()}<p class="fine">Miss 14 Oct and we hold the booking for 2 more days, then cancel it and refund what the policy allows.</p></div></div>`,
      pack: `<div class="pkC">${pack('c')}${voucherCard()}</div>`,
      activity: activity('c'),
    };
    return `${TS.header('My trips')}<div class="mtp vC"><div class="wrap">${crumbs}
      <header class="chd"><div class="ph"><img src="${IMG.tea}" alt="Tea rows near Munnar"></div><div class="ct1"><div class="chips"><span class="badge dep">${b > 0 ? 'Deposit paid' : 'Fully paid'}</span><span class="rf">TB-7K2M9Q</span></div><h1>${esc(PKG.name)}</h1><p class="when">Fri 13 Nov → Tue 17 Nov 2026 · Kochi airport · 2 adults, 1 child</p></div>
        <div class="cdbox"><b class="num">47</b><span>days to go</span></div></header>
      <div class="rstrip"><div class="rs-t"><b class="num">${pct()}%</b> ready <span class="fine">· ${todoCount()} to do</span></div>${segbar('C')}<div class="rs-l" aria-hidden="true">${items().map((i) => `<span class="${i.status}">${esc(i.owner ? i.label.split(' ').slice(0, 2).join(' ') : i.label)}</span>`).join('')}</div></div>
      <div class="ctabs" role="tablist" aria-label="Booking sections">${TABS.map(([k, l]) => `<button role="tab" id="ctab-${k}" data-act="tab" data-t="${k}" data-k="tab-${k}" aria-selected="${t === k}" aria-controls="cpanel" tabindex="${t === k ? 0 : -1}">${l} ${tabMeta[k]}</button>`).join('')}</div>
      <div class="cpanel" id="cpanel" role="tabpanel" aria-labelledby="ctab-${t}" tabindex="0">${panels[t]}</div>
    </div></div>`;
  };

  /* ---------- interaction (shared by all variants) ---------- */
  const parseAmt = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
  // boot calls mount after every render on the same #site element: bind delegated listeners once, keep the live variant in CUR.
  const CUR = { vid: 'A', rerender: null };
  const mount = (vid) => (site, rerender) => {
    CUR.vid = vid; CUR.rerender = rerender;
    const again = (key) => {
      CUR.rerender();
      const el = key && site.querySelector(`[data-k="${key}"]`);
      if (el) el.focus();
    };
    // intro motion: count the ring number up once
    if (!S.seen[vid] && !reduced()) {
      const n = site.querySelector('.ring [data-count]');
      if (n) {
        const to = +n.dataset.count, t0 = performance.now();
        const step = (now) => { const k = Math.min(1, (now - t0) / 1400); n.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + '%'; if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
    }
    S.seen[vid] = true;
    if (S.packAnim) setTimeout(() => { S.packAnim = false; }, 0);

    const upd = () => {
      const inp = site.querySelector('[data-amt-input]');
      if (!inp) return;
      const a = parseAmt(inp.value), b = bal();
      S.amt = a;
      const ok = a >= MIN && a <= b;
      site.querySelector('[data-amt-help]').innerHTML = helpText(a);
      const sp = site.querySelector('[data-amt-split]');
      sp.hidden = !(ok && a > CAP);
      if (ok && a > CAP) sp.innerHTML = splitText(a);
      site.querySelector('[data-amt-btn]').textContent = ok ? `Pay ${inr(a)}` : 'Pay';
      site.querySelector('[data-act="pay"]').disabled = !ok;
      inp.setAttribute('aria-invalid', String(!ok));
      site.querySelectorAll('[data-act="chip"]').forEach((c) => c.setAttribute('aria-pressed', String(+c.dataset.amt === a)));
    };

    // roving tabs (C) — the tablist is re-created each render
    const tl = site.querySelector('.mtp .ctabs');
    if (tl) tl.addEventListener('keydown', (e) => {
      const i = TABS.findIndex(([k]) => k === S.tab);
      let n = null;
      if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
      if (n === null) return;
      e.preventDefault(); S.tab = TABS[n][0]; again('tab-' + S.tab);
    });
    if (site.__mtpBound) return;
    site.__mtpBound = true;
    const inMtp = (el) => el && el.closest && el.closest('.mtp');

    site.addEventListener('input', (e) => { if (inMtp(e.target) && e.target.matches('[data-amt-input]')) upd(); });
    site.addEventListener('blur', (e) => { if (inMtp(e.target) && e.target.matches('[data-amt-input]') && S.amt) e.target.value = S.amt.toLocaleString('en-IN'); }, true);
    site.addEventListener('change', (e) => {
      const c = inMtp(e.target) && e.target.closest('[data-act="tick"]');
      if (c) { S.ticks[c.dataset.tick] = c.checked; again(c.dataset.k); }
    });
    site.addEventListener('click', (e) => {
      const b = inMtp(e.target) && e.target.closest('[data-act]');
      if (!b || b.dataset.act === 'tick') return;
      const vid = CUR.vid;
      const act = b.dataset.act;
      if (act === 'chip') { const inp = site.querySelector('[data-amt-input]'); inp.value = (+b.dataset.amt).toLocaleString('en-IN'); upd(); }
      else if (act === 'pay') {
        const a = Math.min(S.amt, bal());
        if (a < MIN) return;
        let r = a; while (r > 0) { const part = Math.min(CAP, r); S.log.push(part); r -= part; }
        S.paid += a; S.amt = Math.min(10000, bal());
        again(b.dataset.k);
      } else if (act === 'pack') { S.pack = !S.pack; S.packAnim = S.pack && !reduced(); again(b.dataset.k); }
      else if (act === 'saveid') {
        const v = (site.querySelector('[data-mira]') || {}).value || '';
        const d = v.replace(/\D/g, '');
        if (d.length !== 12) { S.idErr = 'Enter all 12 digits of the Aadhaar number (made-up is fine).'; again(); const i = site.querySelector('[data-mira]'); if (i) { i.value = v; i.focus(); } return; }
        S.idErr = ''; S.miraId = d.slice(-4); again(b.dataset.k);
      } else if (act === 'tab') {
        if (vid !== 'C') { const tgt = site.querySelector(b.dataset.t === 'payments' ? '.pay' : b.dataset.t === 'travellers' ? '.trs' : '.pack'); if (tgt) tgt.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); return; }
        S.tab = b.dataset.t; again('tab-' + S.tab);
      }
    });
  };

  /* ---------- shared by D and E ---------- */
  const firstTodo = () => (items().find((i) => i.status === 'todo' || i.status === 'part') || { k: null }).k;
  const FEED = () => ACTIVITY().map((a) => Object.assign({}, a, { x: a.x.replace('@example.com', '@customer.in') }));
  const feedLis = (list) => list.map((a) => `<li class="${a.tone}"><span class="fi">${ICON[actIc[a.tone]]}</span><div><p>${a.x}</p><small>${a.t} · ${a.who}</small></div></li>`).join('');
  const DEMO = `<p class="demo">${ICON.info}<span><b>Demo site: use made-up ID numbers only.</b> IDs show masked everywhere, only the trip leader’s printed manifest has them in full, and we delete them 30 days after you’re back.</span></p>`;
  const tickBox = (i, p, cls, text) => `<label class="${cls}"><input type="checkbox" data-act="tick" data-tick="${i.k}" data-k="${p}-tick-${i.k}" aria-label="Done: ${esc(i.label)}" ${S.ticks[i.k] ? 'checked' : ''}><span class="tbox" aria-hidden="true">${ICON.check}</span><span>${text}</span></label>`;
  const upcoming = () => (bal() > 0 ? 'Upcoming: balance reminders on 7 Oct, 11 Oct and 14 Oct. ' : '');

  /* ================= Variant D · Boarding pass ================= */
  const DUE = { det: 'Locks 10 Nov', bal: 'Due 14 Oct', pack: 'Opens 6 Nov', cal: 'Any time', id: 'By 13 Nov', tabs: 'By 13 Nov', rain: 'By 13 Nov' };
  const DONEON = { cal: '24 Sep', tabs: '25 Sep' };
  const BARS = 'TB7K2M9Q1311'.split('').reduce((a, c) => { const n = c.charCodeAt(0); return a.concat([1 + (n % 3), 1 + ((n >> 2) % 2)]); }, [])
    .map((w, i) => `<i class="${i % 2 ? 'g' : ''}" style="--w:${w}"></i>`).join('');

  const renderD = () => {
    const b = bal(), its = items(), intro = !S.seen.D;
    const open = S.dOpen === undefined ? firstTodo() : S.dOpen;
    const all = its.map((i, n) => ({ i, n }));
    const live = all.filter((x) => x.i.status !== 'done' && x.i.status !== 'locked');
    const later = all.filter((x) => x.i.status === 'locked');
    const torn = all.filter((x) => x.i.status === 'done');
    const body = (i) => (i.k === 'det' ? `<p class="fine">As lead booker you can fill in everyone. Details lock on <b>Tue 10 Nov</b>, 3 days before departure.</p>${travSection('d', { noHead: true })}`
      : i.k === 'bal' ? payPanel('d', { hist: true }) : i.k === 'pack' ? pack('d') : i.k === 'cal' ? calCard('d') : '');
    const coupon = ({ i, n }) => {
      const isOpen = !i.owner && open === i.k;
      const verb = isOpen ? 'Close' : i.status === 'done' ? 'View' : i.status === 'locked' ? 'Look inside' : i.k === 'bal' ? 'Pay' : 'Open';
      const ctl = i.owner ? tickBox(i, 'd', 'dtick', S.ticks[i.k] ? 'Done' : 'Mark done')
        : `<button type="button" class="lnk cp-tg" data-act="dopen" data-d="${i.k}" data-k="d-cp-${i.k}" aria-expanded="${isOpen}" aria-controls="d-cpb-${i.k}">${verb} ${ICON.chevD}</button>`;
      return `<li class="cp ${i.status}${isOpen ? ' open' : ''}" data-cp="${i.k}">
        <div class="cp-stub"><span class="cp-no num">0${n + 1}</span><small>${i.status === 'done' ? 'Torn off ' + (DONEON[i.k] || 'today') : DUE[i.k]}</small></div>
        <div class="cp-main"><div class="cp-hd"><div class="cp-tx"><b>${esc(i.label)}</b><small>${esc(i.sub)}</small></div>${i.status === 'done' ? '<span class="stamp" aria-hidden="true">Torn<br>off</span>' : ''}${ctl}</div>
        ${i.owner ? '' : `<div class="cp-b" id="d-cpb-${i.k}" ${isOpen ? '' : 'hidden'}>${body(i)}</div>`}</div></li>`;
    };
    const holes = its.map((i, n) => `<span class="hole ${i.status}" style="--i:${n}"></span>`).join('');
    const dlog = `<section class="card dlog" aria-labelledby="d-lg-h"><div class="ex-hd"><h3 id="d-lg-h">Ticket log</h3><span class="fine num">${FEED().length} entries</span></div>
      <ol>${FEED().map((a) => `<li><span class="num">${a.t}</span><p>${a.x}<small>${a.who}</small></p></li>`).join('')}</ol>
      <p class="fine">${upcoming()}Entries can’t be edited or deleted.</p></section>`;
    return `${TS.header('My trips')}<div class="mtp vD"><div class="wrap">${crumbs}
      <header class="bp ${intro ? 'intro' : ''}">
        <div class="bp-ph ph"><img src="${IMG.hero}" alt="Tea estates on the hills around Munnar"></div>
        <div class="bp-main">
          <div class="bp-top"><span class="bp-brand">Tripsmith · Holiday pass</span><span class="chips"><span class="badge dep">${b > 0 ? 'Deposit paid' : 'Fully paid'}</span><span class="rf">TB-7K2M9Q</span></span></div>
          <h1>${esc(PKG.name)}</h1>
          <div class="route" aria-label="Route: Kochi, Munnar, Alleppey"><div class="stop"><b>Kochi</b><small>Pickup 11:00</small></div><span class="leg" aria-hidden="true"><i></i><small>4 h by road</small></span><div class="stop"><b>Munnar</b><small>3 nights</small></div><span class="leg" aria-hidden="true"><i></i><small>5 h by road</small></span><div class="stop"><b>Alleppey</b><small>Houseboat, 1 night</small></div></div>
          <dl class="bp-meta">
            <div><dt>Depart</dt><dd>Fri 13 Nov · 11:00</dd></div><div><dt>Return</dt><dd>Tue 17 Nov · 13:00</dd></div><div><dt>Travellers</dt><dd>2 adults, 1 child</dd></div>
            <div><dt>Trip leader</dt><dd>${LEAD.name}</dd></div><div><dt>Meeting point</dt><dd>In the trip pack, 6 Nov</dd></div><div class="${b > 0 ? 'due' : ''}"><dt>Balance</dt><dd class="num">${b > 0 ? `${inr(b)} due 14 Oct` : 'Paid in full'}</dd></div>
          </dl>
        </div>
        <div class="bp-stub">
          <div class="cd"><small>Leaves in</small><b class="num">47</b><span>days</span></div>
          <div class="rd"><div class="holes" role="img" aria-label="Readiness ${pct()} percent: ${its.map((i) => `${i.label} ${i.status === 'done' ? 'done' : i.status === 'locked' ? 'locked' : 'to do'}`).join(', ')}">${holes}</div><small class="num">${pct()}% ready · ${todoCount()} coupons left</small></div>
          <div class="bars" aria-hidden="true">${BARS}</div>
        </div>
      </header>
      <div class="dgrid"><div class="dcol">
        <div class="cps-hd"><h2>Your coupons <span class="ct num">${live.length} to tear off</span></h2><p class="fine">Finish a task and its coupon tears off. Each stub shows the date it matters by.</p></div>
        <ol class="cps">${live.map(coupon).join('')}</ol>
        ${later.length ? `<h3 class="cps-h">Opens later</h3><ol class="cps">${later.map(coupon).join('')}</ol>` : ''}
        ${torn.length ? `<h3 class="cps-h">Torn off <span class="ct num">${torn.length}</span></h3><ol class="cps torn">${torn.map(coupon).join('')}</ol>` : ''}
      </div>
      <aside class="drail">${extrasCard('d')}${manageCard('d')}${voucherCard()}${dlog}</aside></div>
    </div></div>`;
  };

  /* ================= Variant E · One thing next ================= */
  const eQueue = () => items().filter((i) => i.status === 'todo' || i.status === 'part');
  const eNowKey = () => (S.eNow && items().some((i) => i.k === S.eNow) ? S.eNow : firstTodo());
  const nowCopy = (i) => ({
    det: ['Add Mira’s ID number', 'It’s the one field missing across your three travellers. Details lock on Tue 10 Nov.'],
    bal: [`Pay the ${inr(bal())} balance`, `Due Wed 14 Oct. Pay it all at once, or in parts from ${inr(MIN)}.`],
    pack: ['Your trip pack', bal() > 0 ? 'Opens Fri 6 Nov, once the balance is paid. Here is what will be inside.' : 'Opens Fri 6 Nov. You’re fully paid, so it opens on the day.'],
    cal: ['Add the trip to your calendar', 'All-day, 13–17 Nov, at Kochi airport.'],
  }[i.k] || [esc(i.label), `${esc(i.sub)} ${LEAD.name.split(' ')[0]} asks every Munnar group to do this.`]);
  const DONEMSG = { det: 'All three travellers are complete', bal: 'Balance paid in full', cal: 'On your calendar' };

  const renderE = () => {
    const its = items(), q = eQueue(), nk = eNowKey(), now = its.find((i) => i.k === nk);
    const upNext = q.filter((i) => i.k !== nk);
    const waiting = its.filter((i) => i.status === 'locked' && i.k !== nk);
    const done = its.filter((i) => i.status === 'done' && i.k !== nk);
    const intro = !S.seen.E, feed = FEED();
    const row = (i, btn) => `<li><div class="ck ${i.status}"><span class="st">${statusIc(i.status)}</span><span class="tx"><b>${esc(i.label)}</b><small>${esc(i.sub)}</small></span>${btn}</div></li>`;
    const go = (i, l) => `<button type="button" class="btn line sm" data-act="enow" data-e="${i.k}" data-k="e-go-${i.k}" aria-label="${l}: ${esc(i.label)}">${l}</button>`;
    const allTrav = () => `<details class="emini"><summary>${TRAV().filter((t) => t.done).map((t) => av(t, 28)).join('')}<span>See the complete travellers</span>${ICON.chevD}</summary><div class="tvs">${TRAV().filter((t) => t.done).map((t) => travCard(t, 'e')).join('')}</div>${DEMO}</details>`;
    const eBody = (i) => {
      if (i.k === 'det') return `<div class="trs"><div class="tvs">${TRAV().filter((t) => !t.done).map((t) => travCard(t, 'e')).join('')}</div>${DEMO}${allTrav()}</div>`;
      if (i.k === 'bal') return payPanel('e', { hist: true });
      if (i.k === 'pack') return pack('e');
      if (i.k === 'cal') return calCard('e');
      return `<div class="eown">${av({ hue: LEAD.hue, mono: LEAD.mono }, 36)}<p class="fine">From ${LEAD.name}, your trip leader. Nothing to upload, just tick it when it’s sorted.</p>${tickBox(i, 'e', 'etick', 'Yes, sorted')}</div>`;
    };
    let card;
    if (!now) card = `<div class="eclear"><span class="bigok">${ICON.check}</span><h2 data-k="e-now" tabindex="-1">Nothing to do until Fri 6 Nov</h2><p class="fine">Your trip pack opens that morning. We’ll email you when it does.</p></div>`;
    else if (now.status === 'done') {
      const nx = q[0];
      card = `<div class="eclear"><span class="bigok">${ICON.check}</span><span class="eyebrow">Done · ${pct()}% ready</span><h2 data-k="e-now" tabindex="-1">${DONEMSG[now.k] || 'Ticked off: ' + esc(now.label)}</h2>
        <p class="fine">${nx ? `${q.length} left before Kerala.` : 'That was the last task for now. The trip pack opens on Fri 6 Nov.'}</p>
        ${nx ? `<button type="button" class="btn pri" data-act="enow" data-e="" data-k="e-next">Next: ${esc(nx.label)} ${ICON.arrowR}</button>` : ''}</div>`;
    } else {
      const [t, s] = nowCopy(now);
      const tools = now.status === 'locked' ? (q.length ? `<button type="button" class="lnk" data-act="enow" data-e="" data-k="e-back">${ICON.chevL} Back to your next task</button>` : '')
        : upNext.length ? `<button type="button" class="lnk" data-act="enow" data-e="${upNext[0].k}" data-k="e-skip">Not now, show the next one ${ICON.chevR}</button>` : '';
      card = `<div class="enow-hd"><span class="eyebrow">${now.status === 'locked' ? 'Coming up · look inside' : `Now · ${q.length} left`}</span><h2 data-k="e-now" tabindex="-1">${t}</h2><p>${s}</p></div>
        <div class="eb">${eBody(now)}</div>${tools ? `<div class="etools">${tools}</div>` : ''}`;
    }
    const doneRow = (i) => {
      if (i.owner) return `<li><label class="ck done"><input type="checkbox" data-act="tick" data-k="e-dt-${i.k}" data-tick="${i.k}" checked><span class="box">${ICON.check}</span><span class="tx"><b>${esc(i.label)}</b><small>Ticked. Untick it if that changes.</small></span></label></li>`;
      if (i.k === 'cal') return `<li><div class="ck done"><span class="st">${ICON.check}</span><div class="tx"><b>${esc(i.label)}</b><small>${esc(i.sub)}. Add it somewhere else:</small><span class="row2 ecal"><a class="btn line sm" href="${GCAL}" target="_blank" rel="noopener">${ICON.cal} Google Calendar</a><a class="btn line sm" href="${ICS}" download="tripsmith-TB-7K2M9Q.ics">${ICON.down} Apple / Outlook (.ics)</a></span></div></div></li>`;
      if (i.k === 'det') return `<li><div class="ck done"><span class="st">${ICON.check}</span><div class="tx"><b>${esc(i.label)}</b><small>All 3 complete. Editable until Tue 10 Nov.</small>${allTrav()}</div></div></li>`;
      return row(i, '');
    };
    const more = [
      ['plus', 'Add extras', 'Kathakali, tea tasting or an extra houseboat night · until Fri 6 Nov', extrasCard('e')],
      ['cal', 'Change date or cancel', 'Date change is free until Wed 14 Oct', manageCard('e')],
      ['file', 'Voucher', bal() > 0 ? `Shows “Balance due ${inr(bal())}” until you’ve paid in full` : 'Ready to show at check-in', voucherCard()],
    ];
    const n = q.length;
    return `${TS.header('My trips')}<div class="mtp vE"><div class="wrap">${crumbs}
      <div class="es">
        <aside class="eph ${intro ? 'intro' : ''}"><div class="ph"><img src="${IMG.boat}" alt="Kettuvallam houseboat on the Alleppey backwaters"></div><div class="eshade"></div>
          <div class="etop chips"><span class="badge dep">${bal() > 0 ? 'Deposit paid' : 'Fully paid'}</span><span class="rf">TB-7K2M9Q</span></div>
          <div class="ebot"><p class="ecd"><b class="num">47</b><span>days to Kerala</span></p><h1>${esc(PKG.name)}</h1><p class="when">Fri 13 Nov → Tue 17 Nov 2026 · 2 adults, 1 child · led by ${LEAD.name}</p>
            <div class="erd"><span class="num">${pct()}% ready</span>${segbar('E')}</div></div></aside>
        <div class="ein">
          <div class="ehi"><span class="eyebrow">Hi Ananya</span><p class="etitle">${n ? `${n} thing${n === 1 ? '' : 's'} before Kerala. One at a time.` : 'You’re ready for Kerala.'}</p></div>
          <section class="enow ${now && now.status === 'done' ? 'isdone' : ''}" aria-live="polite" aria-label="Your next task">${card}</section>
          ${upNext.length ? `<section class="eq"><h3>Up next <span class="ct num">${upNext.length}</span></h3><ul class="ck-list">${upNext.map((i) => row(i, go(i, 'Do now'))).join('')}</ul></section>` : ''}
          <section class="eq"><h3>Coming up</h3><ul class="ck-list">${waiting.map((i) => row(i, go(i, 'Look inside'))).join('')}
            <li><div class="ck"><span class="st">${ICON.clock}</span><span class="tx"><b>Extras close</b><small>Fri 6 Nov, with the trip pack</small></span></div></li>
            <li><div class="ck"><span class="st">${ICON.clock}</span><span class="tx"><b>Traveller details lock</b><small>Tue 10 Nov, 3 days before departure</small></span></div></li></ul></section>
          ${done.length ? `<details class="edone"><summary><span>Done</span><span class="ct num">${done.length}</span>${ICON.chevD}</summary><ul class="ck-list">${done.map(doneRow).join('')}</ul></details>` : ''}
          <section class="emore" aria-label="More for this booking">${more.map(([ic, t, s, c]) => `<details class="exd"><summary><span class="exi">${ICON[ic]}</span><span class="tx"><b>${t}</b><small>${s}</small></span>${ICON.chevD}</summary><div class="exb">${c}</div></details>`).join('')}</section>
          <section class="eact" aria-labelledby="e-ac-h"><div class="ex-hd"><h3 id="e-ac-h">Activity</h3><span class="fine">Newest first</span></div><ol class="feed">${feedLis(feed.slice(0, 3))}</ol>
            <details class="emini"><summary><span>Show all ${feed.length} entries</span>${ICON.chevD}</summary><ol class="feed">${feedLis(feed.slice(3))}</ol></details>
            <p class="fine">${upcoming()}Every change to your booking is logged here and can’t be edited.</p></section>
        </div>
      </div>
    </div></div>`;
  };

  // D and E add two actions on top of the shared handler: open a coupon (D) and pick the focused task (E).
  const mountX = (vid) => {
    const base = mount(vid);
    return (site, rerender) => {
      base(site, rerender);
      if (vid === 'E' && !S.eNow) S.eNow = eNowKey();
      const done = items().filter((i) => i.status === 'done').map((i) => i.k);
      if (S.prevDone && !reduced()) done.filter((k) => S.prevDone.indexOf(k) < 0).forEach((k) => { const el = site.querySelector(`.mtp [data-cp="${k}"]`); if (el) el.classList.add('just'); });
      S.prevDone = done;
      if (site.__mtpXBound) return;
      site.__mtpXBound = true;
      site.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.mtp [data-act="dopen"], .mtp [data-act="enow"]');
        if (!b) return;
        let key = b.dataset.k;
        if (b.dataset.act === 'dopen') { const cur = S.dOpen === undefined ? firstTodo() : S.dOpen; S.dOpen = cur === b.dataset.d ? null : b.dataset.d; }
        else { S.eNow = b.dataset.e || null; key = 'e-now'; }
        CUR.rerender();
        const el = site.querySelector(`[data-k="${key}"]`);
        if (el) el.focus();
      });
    };
  };

  /* ---------- CSS ---------- */
  const css = `
  .mtp { padding-bottom: 60px; }
  .mtp-cr { padding-top: 6px; }
  .mtp .card { border: 1px solid var(--line); border-radius: 18px; padding: 18px 20px; display: grid; gap: 12px; background: #fff; min-width: 0; }
  .mtp h2 { font-size: 20px; } .mtp h3 { font-size: 16px; letter-spacing: -.02em; }
  .mtp .fine { font-size: 13px; color: var(--mute); }
  .mtp .fine a { color: var(--pri); font-weight: 700; }
  .mtp .ct { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; background: var(--bg2); color: var(--ink2); border-radius: 999px; padding: 2px 8px; letter-spacing: 0; vertical-align: middle; }
  .mtp .ct .ic { width: 12px; height: 12px; }
  .mtp .badge .ic { width: 13px; height: 13px; }
  .mtp .badge.dep { background: var(--act); color: var(--ink); }
  .mtp .rf { font: 800 12.5px "DM Sans", sans-serif; letter-spacing: .08em; border: 1px dashed currentColor; border-radius: 6px; padding: 3px 8px; opacity: .9; }
  .mtp .chips { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .mtp .row2 { display: flex; gap: 8px; flex-wrap: wrap; }
  .mtp .btn .ic { width: 16px; height: 16px; }
  .mtp .err { color: #B42318; font-weight: 700; }

  /* hero (A) — continues the shipped dark cover header */
  .mtp .hero { position: relative; border-radius: 20px; overflow: hidden; background: var(--ink); color: #fff; min-height: 300px; display: grid; align-items: end; }
  .mtp .hero .ph { position: absolute; inset: 0; background: var(--ink); } .mtp .hero .ph img { opacity: .72; }
  .mtp .hero .shade { position: absolute; inset: 0; background: linear-gradient(to top, #14202A 8%, rgba(20,32,42,.55) 55%, rgba(20,32,42,.05)); }
  .mtp .hero .in { position: relative; padding: 26px 28px; display: grid; gap: 8px; }
  .mtp .hero h1 { font-size: clamp(28px, 3.6cqi, 44px); color: #fff; max-width: 18ch; }
  .mtp .when { color: rgba(255,255,255,.85); font-size: 14.5px; font-weight: 600; }
  .mtp .cdn { color: var(--act); font-weight: 800; font-size: 20px; letter-spacing: -.02em; }
  .mtp .cdn b { font-size: 44px; letter-spacing: -.04em; line-height: 1; margin-right: 4px; }

  /* readiness ring */
  .mtp .ring { width: var(--sz); height: var(--sz); position: relative; flex: none; }
  .mtp .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .mtp .ring circle { fill: none; stroke-width: 11; }
  .mtp .ring .bg { stroke: var(--bg2); }
  .mtp .ring .fg { stroke: var(--pri); stroke-linecap: round; stroke-dasharray: 326.73; stroke-dashoffset: var(--off); transition: stroke-dashoffset .6s var(--ease); }
  .mtp .ring.intro .fg { animation: mtpRing 1.4s var(--ease) .15s both; }
  @keyframes mtpRing { from { stroke-dashoffset: 326.73; } }
  .mtp .ring .c { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
  .mtp .ring .c b { font-size: calc(var(--sz) * .25); font-weight: 800; letter-spacing: -.04em; line-height: 1; }
  .mtp .ring .c small { font-size: 12px; color: var(--mute); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }

  /* checklist */
  .mtp .ck-list { list-style: none; margin: 0; padding: 0; display: grid; }
  .mtp .ck-list li + li { border-top: 1px solid var(--line); }
  .mtp .ck { display: grid; grid-template-columns: 26px 1fr auto; gap: 12px; align-items: center; padding: 9px 0; position: relative; }
  .mtp label.ck { cursor: pointer; }
  .mtp .ck .tx { display: grid; min-width: 0; }
  .mtp .ck .tx b { font-size: 14.5px; }
  .mtp .ck .tx small { color: var(--mute); font-size: 12.5px; font-weight: 500; }
  .mtp .ck.done .tx b { color: var(--ink2); }
  .mtp .ck .st { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--bg2); color: var(--mute); }
  .mtp .ck .st .ic { width: 14px; height: 14px; }
  .mtp .ck.done .st { background: var(--ok); color: #fff; }
  .mtp .ck.part .st { background: var(--warn-soft); }
  .mtp .ck .st .half { width: 12px; height: 12px; border-radius: 50%; background: conic-gradient(var(--warn) 0 67%, transparent 0); box-shadow: inset 0 0 0 1.5px var(--warn); }
  .mtp .ck .st .empty { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 2px #9AA5AF; }
  .mtp .ck input { position: absolute; opacity: 0; width: 26px; height: 26px; margin: 0; left: 0; cursor: pointer; }
  .mtp .ck .box { width: 26px; height: 26px; border-radius: 8px; border: 2px solid #9AA5AF; display: grid; place-items: center; color: transparent; transition: background .2s, border-color .2s; }
  .mtp .ck .box .ic { width: 15px; height: 15px; }
  .mtp .ck input:checked + .box { background: var(--ok); border-color: var(--ok); color: #fff; }
  .mtp .ck input:focus-visible + .box { outline: 2px solid var(--pri); outline-offset: 3px; }
  .mtp .ck .own { font-size: 11px; font-weight: 700; color: var(--pri); background: var(--pri-soft); border-radius: 999px; padding: 3px 8px; white-space: nowrap; }
  .mtp .lnk { border: 0; background: none; font: 700 13px "DM Sans", sans-serif; color: var(--pri); display: inline-flex; align-items: center; gap: 2px; cursor: pointer; padding: 6px 4px; border-radius: 8px; }
  .mtp .lnk .ic { width: 14px; height: 14px; }

  /* segmented bar */
  .mtp .seg { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; height: 10px; }
  .mtp .seg .s { background: #E6EAF0; border-radius: 999px; overflow: hidden; position: relative; }
  .mtp .seg .s i { position: absolute; inset: 0; background: var(--ok); transform-origin: left; transform: scaleX(var(--f)); border-radius: inherit; }
  .mtp .seg .s.part i { background: var(--warn); }
  .mtp .seg .s.locked { background: repeating-linear-gradient(-45deg, #E6EAF0 0 4px, #F4F6F9 4px 8px); }
  .mtp .seg.intro .s i { animation: mtpSeg .7s var(--ease) both; animation-delay: calc(var(--i) * 90ms + 150ms); }
  @keyframes mtpSeg { from { transform: scaleX(0); } }

  /* pay panel */
  .mtp .pay { gap: 14px; }
  .mtp .pay .payhd { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
  .mtp .pay h2 { font-size: 34px; letter-spacing: -.04em; line-height: 1.05; }
  .mtp .pay .payhd small { color: var(--mute); font-size: 12.5px; font-weight: 600; display: block; margin-top: 4px; }
  .mtp .pay .payhd small b { color: var(--ink); }
  .mtp .meter { height: 8px; background: var(--bg2); border-radius: 999px; overflow: hidden; }
  .mtp .meter i { display: block; height: 100%; width: var(--v); background: linear-gradient(90deg, var(--pri), #4B77EA); border-radius: inherit; transition: width .6s var(--ease); }
  .mtp .pay.done .meter i { background: var(--ok); }
  .mtp .pay .okc { width: 44px; height: 44px; border-radius: 14px; background: var(--ok-soft); color: var(--ok); display: grid; place-items: center; }
  .mtp .amtrow { display: grid; gap: 8px; }
  .mtp .fld { display: grid; gap: 4px; min-width: 0; }
  .mtp .fld label, .mtp .fld .lab { font-size: 12px; font-weight: 700; color: var(--ink2); }
  .mtp .fld label em { font-style: normal; color: var(--warn); font-weight: 700; margin-left: 4px; }
  .mtp .fld input, .mtp .fld select { border: 1.5px solid var(--line); border-radius: 10px; padding: 10px 12px; font: 500 15px "DM Sans", sans-serif; width: 100%; background: #fff; color: var(--ink); min-width: 0; }
  .mtp .fld input:focus, .mtp .fld select:focus { border-color: var(--pri); outline: none; box-shadow: 0 0 0 3px var(--pri-soft); }
  .mtp .fld input[aria-invalid="true"] { border-color: #B42318; }
  .mtp .fld .hint, .mtp .fld small.err { font-size: 12px; color: var(--mute); }
  .mtp .fld small.err { color: #B42318; }
  .mtp .rs { display: flex; align-items: center; border: 1.5px solid var(--line); border-radius: 12px; padding-left: 14px; background: #fff; }
  .mtp .rs:focus-within { border-color: var(--pri); box-shadow: 0 0 0 3px var(--pri-soft); }
  .mtp .rs span { font-weight: 800; font-size: 22px; color: var(--mute); }
  .mtp .rs input { border: 0 !important; box-shadow: none !important; font: 800 24px "DM Sans", sans-serif; letter-spacing: -.02em; padding: 10px 12px 10px 6px; font-variant-numeric: tabular-nums; }
  .mtp .qchips, .mtp .foods { display: flex; gap: 6px; flex-wrap: wrap; }
  .mtp .qc { font: 700 13px "DM Sans", sans-serif; border: 1.5px solid var(--line); background: #fff; color: var(--ink); border-radius: 999px; padding: 7px 12px; cursor: pointer; font-variant-numeric: tabular-nums; }
  .mtp .qc:hover { border-color: var(--ink); }
  .mtp .qc[aria-pressed="true"], .mtp .qc[aria-checked="true"] { background: var(--pri-soft); border-color: var(--pri); color: var(--pri-ink); }
  .mtp .split { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; background: var(--warn-soft); color: #7A3A12; border-radius: 10px; padding: 9px 11px; }
  .mtp .split .ic, .mtp .why .ic { width: 16px; height: 16px; margin-top: 1px; }
  .mtp .why { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--ink2); background: var(--bg2); border-radius: 10px; padding: 10px 12px; }
  .mtp .hist h3 { margin-bottom: 6px; }
  .mtp table.tr { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  .mtp table.tr th { text-align: left; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); font-weight: 700; padding: 0 0 6px; }
  .mtp table.tr td { border-top: 1px solid var(--line); padding: 8px 8px 8px 0; vertical-align: top; }
  .mtp table.tr td small { display: block; color: var(--mute); font-size: 12px; }
  .mtp table.tr .r { text-align: right; padding-right: 0; font-weight: 700; }

  /* travellers */
  .mtp .trs { display: grid; gap: 14px; }
  .mtp .sh2 h2 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mtp .sh2 p { color: var(--ink2); font-size: 14px; margin-top: 4px; }
  .mtp .tvs { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
  .mtp .tv { border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: grid; gap: 12px; align-content: start; background: #fff; }
  .mtp .tv.miss { border: 1.5px solid var(--act); box-shadow: 0 16px 30px -24px rgba(217,143,31,.8); }
  .mtp .tv header { display: flex; gap: 10px; align-items: center; }
  .mtp .tv header > div { min-width: 0; flex: 1; }
  .mtp .tv header b { display: block; font-size: 15.5px; }
  .mtp .tv header small { color: var(--mute); font-size: 12.5px; font-weight: 600; }
  .mtp .tav { width: var(--s); height: var(--s); border-radius: 12px; flex: none; display: grid; place-items: center; background: color-mix(in srgb, var(--h) 14%, #fff); color: var(--h); font: 800 14px "DM Sans", sans-serif; }
  .mtp .tv dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
  .mtp .tv dl div.w { grid-column: 1 / -1; }
  .mtp .tv dt { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); font-weight: 700; }
  .mtp .tv dd { margin: 0; font-size: 13.5px; font-weight: 600; overflow-wrap: anywhere; }
  .mtp .mask { letter-spacing: .04em; }
  .mtp .food { background: var(--ok-soft); color: var(--ok); border-radius: 6px; padding: 1px 6px; font-size: 12.5px; }
  .mtp .tv .form { display: grid; gap: 10px; }
  .mtp .tv .idrow { display: grid; grid-template-columns: 110px 1fr; gap: 8px; }
  .mtp .tv footer { display: flex; }
  .mtp .demo { display: flex; gap: 10px; align-items: flex-start; }

  /* trip pack */
  .mtp .pack .pk-hd { display: flex; gap: 14px; align-items: center; }
  .mtp .pack .pk-hd > div { flex: 1; min-width: 0; }
  .mtp .pack .pk-hd p { color: var(--ink2); font-size: 14px; margin-top: 2px; }
  .mtp .lkb { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: var(--ink); color: var(--act); flex: none; }
  .mtp .lks { width: 26px; height: 26px; overflow: visible; }
  .mtp .pack.open .lkb { background: var(--ok-soft); color: var(--ok); }
  .mtp .pack.open .lks .sh { transform: translate(5px, -3px) rotate(18deg); transform-origin: 16px 11px; }
  .mtp .pack.locked { background: linear-gradient(180deg, #fff, var(--bg2)); }
  .mtp .inside { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
  .mtp .inside li { display: flex; gap: 8px; align-items: center; font-size: 13.5px; font-weight: 600; color: var(--ink2); background: #fff; border: 1px dashed #C9D2DC; border-radius: 10px; padding: 8px 10px; }
  .mtp .inside .ic { width: 16px; height: 16px; color: var(--mute); }
  .mtp .pk-ft { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .mtp .pk-body { display: grid; gap: 16px; }
  .mtp .pack.opening .lks .sh { animation: mtpShackle .6s var(--ease) both; }
  .mtp .pack.opening .pk-body { animation: mtpReveal .8s var(--ease) .25s both; }
  @keyframes mtpShackle { from { transform: none; } 50% { transform: translate(0, -5px); } }
  @keyframes mtpReveal { from { opacity: 0; clip-path: inset(0 0 100% 0); transform: translateY(-6px); } to { opacity: 1; clip-path: inset(0 0 0 0); } }
  .mtp .pk-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px; }
  .mtp .pk-box { border-radius: 14px; padding: 14px; background: var(--bg2); display: grid; gap: 4px; align-content: start; }
  .mtp .pk-box.meet { background: var(--ink); color: #fff; }
  .mtp .pk-box.meet .eyebrow { color: #AFC0D0; }
  .mtp .pk-box.meet p { color: rgba(255,255,255,.8); font-size: 13.5px; }
  .mtp .pk-box.lead { display: flex; gap: 12px; align-items: flex-start; }
  .mtp .pk-box.lead p { font-size: 12.5px; color: var(--mute); }
  .mtp .pk-box a, .mtp .hot a { display: inline-flex; gap: 6px; align-items: center; font-weight: 700; font-size: 13.5px; color: var(--pri); text-decoration: none; margin-top: 4px; }
  .mtp .pk-box.meet a { color: var(--act); }
  .mtp .pk-box a .ic, .mtp .hot a .ic { width: 15px; height: 15px; }
  .mtp .pk-hotels { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .mtp .hot { display: flex; gap: 12px; border: 1px solid var(--line); border-radius: 14px; padding: 10px; align-items: flex-start; }
  .mtp .hot .ph { width: 76px; aspect-ratio: 1; border-radius: 10px; flex: none; }
  .mtp .hot small { color: var(--mute); font-weight: 600; font-size: 12px; }
  .mtp .hot p { font-size: 13px; color: var(--ink2); }
  .mtp .days { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .mtp .days li { display: grid; grid-template-columns: 64px 1fr; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
  .mtp .days .dn { font-weight: 800; font-size: 13px; color: var(--pri); }
  .mtp .days small { color: var(--mute); font-weight: 600; font-size: 12.5px; }
  .mtp .days p { font-size: 13.5px; color: var(--ink2); }
  .mtp .kbg dl { margin: 8px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .mtp .kbg dt { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); font-weight: 700; }
  .mtp .kbg dd { margin: 0; font-size: 13.5px; }
  .mtp .sos { display: flex; gap: 10px; align-items: flex-start; background: #FDECEA; color: #7A1D14; border-radius: 12px; padding: 12px 14px; }
  .mtp .sos small { display: block; font-size: 12.5px; color: #8B3A30; }

  /* side cards */
  .mtp .cal-hd { display: flex; gap: 12px; align-items: center; }
  .mtp .cal-hd > div { flex: 1; min-width: 0; }
  .mtp .cal-ic { width: 46px; flex: none; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); text-align: center; display: grid; }
  .mtp .cal-ic small { background: #D93025; color: #fff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; padding: 2px 0; }
  .mtp .cal-ic b { font-size: 20px; padding: 2px 0 4px; }
  .mtp .ex-hd { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .mtp .ext ul { list-style: none; margin: 0; padding: 0; display: grid; }
  .mtp .ext li { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
  .mtp .ext li b { display: block; font-size: 14px; }
  .mtp .ext li small { color: var(--mute); font-size: 12.5px; }
  .mtp .mg { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding-top: 10px; border-top: 1px solid var(--line); }
  .mtp .mg b { font-size: 14px; }
  .mtp .feed { list-style: none; margin: 0; padding: 0; display: grid; }
  .mtp .feed li { display: grid; grid-template-columns: 30px 1fr; gap: 10px; padding: 8px 0; position: relative; }
  .mtp .feed li + li::before { content: ""; position: absolute; left: 14px; top: -8px; height: 16px; width: 2px; background: var(--line); }
  .mtp .feed .fi { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--bg2); color: var(--ink2); }
  .mtp .feed .fi .ic { width: 15px; height: 15px; }
  .mtp .feed li.pay .fi { background: var(--ok-soft); color: var(--ok); }
  .mtp .feed li.det .fi { background: var(--pri-soft); color: var(--pri); }
  .mtp .feed p { font-size: 13.5px; }
  .mtp .feed small { color: var(--mute); font-size: 12px; font-weight: 600; }

  /* ===== A · Mission control ===== */
  .mtp.vA .mc { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; margin-top: 12px; }
  .mtp.vA .hero { min-height: 100%; }
  .mtp.vA .rd { align-content: start; }
  .mtp.vA .rd-hd { display: flex; gap: 18px; align-items: center; }
  .mtp.vA .keyd { list-style: none; margin: 16px 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .mtp.vA .keyd li { padding: 12px 16px; display: grid; gap: 2px; border-left: 1px solid var(--line); position: relative; }
  .mtp.vA .keyd li:first-child { border-left: 0; }
  .mtp.vA .keyd small { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); font-weight: 700; }
  .mtp.vA .keyd b { font-size: 15px; }
  .mtp.vA .keyd li.now { background: var(--pri-soft); } .mtp.vA .keyd li.now b { color: var(--pri); }
  .mtp.vA .keyd li.warn { background: var(--warn-soft); } .mtp.vA .keyd li.warn b { color: var(--warn); }
  .mtp.vA .keyd li.go { background: var(--ink); } .mtp.vA .keyd li.go b { color: var(--act); } .mtp.vA .keyd li.go small { color: #AFC0D0; }
  .mtp.vA .agrid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 24px; margin-top: 24px; align-items: start; }
  .mtp.vA .acol { display: grid; gap: 20px; min-width: 0; }

  /* ===== B · Journey line ===== */
  .mtp.vB .bhd { display: grid; grid-template-columns: 180px 1fr auto; gap: 20px; align-items: center; margin-top: 12px; background: var(--ink); color: #fff; border-radius: 20px; padding: 12px; }
  .mtp.vB .bhd .ph { aspect-ratio: 4 / 3; border-radius: 12px; }
  .mtp.vB .bhd h1 { font-size: clamp(24px, 3cqi, 34px); color: #fff; margin: 6px 0 4px; }
  .mtp.vB .bcd { padding-right: 12px; display: grid; gap: 8px; min-width: 240px; }
  .mtp.vB .rline { display: grid; gap: 6px; font-size: 13px; font-weight: 700; color: #D6DEE6; }
  .mtp.vB .rline .seg .s { background: rgba(255,255,255,.16); }
  .mtp.vB .rline .seg .s.locked { background: repeating-linear-gradient(-45deg, rgba(255,255,255,.16) 0 4px, rgba(255,255,255,.05) 4px 8px); }
  .mtp.vB .bgrid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; margin-top: 28px; align-items: start; }
  .mtp.vB .jr { list-style: none; margin: 0; padding: 0; display: grid; position: relative; }
  .mtp.vB .jr::before { content: ""; position: absolute; left: 88px; top: 10px; bottom: 10px; width: 3px; background: var(--line); border-radius: 3px; }
  .mtp.vB .jr::after { content: ""; position: absolute; left: 88px; top: 10px; width: 3px; height: 150px; background: var(--pri); border-radius: 3px; transform-origin: top; }
  .mtp.vB .jr.intro::after { animation: mtpDraw 1.1s var(--ease) .1s both; }
  @keyframes mtpDraw { from { transform: scaleY(0); } }
  .mtp.vB .ms { display: grid; grid-template-columns: 76px 1fr; column-gap: 34px; row-gap: 10px; position: relative; padding-bottom: 30px; }
  .mtp.vB .ms .dot { position: absolute; left: 82px; top: 4px; width: 15px; height: 15px; border-radius: 50%; background: #fff; border: 3px solid #B8C2CC; z-index: 1; }
  .mtp.vB .ms.past .dot { background: var(--pri); border-color: var(--pri); }
  .mtp.vB .ms.now .dot { background: var(--pri); border-color: #fff; box-shadow: 0 0 0 3px var(--pri), 0 0 0 9px var(--pri-soft); }
  .mtp.vB .ms.due .dot { border-color: var(--warn); }
  .mtp.vB .ms.go .dot { background: var(--act); border-color: var(--act); }
  .mtp.vB .jr.intro .ms { animation: mtpIn .6s var(--ease) both; }
  .mtp.vB .jr.intro .ms:nth-child(2) { animation-delay: .1s; } .mtp.vB .jr.intro .ms:nth-child(3) { animation-delay: .2s; } .mtp.vB .jr.intro .ms:nth-child(n+4) { animation-delay: .3s; }
  @keyframes mtpIn { from { opacity: 0; transform: translateY(10px); } }
  .mtp.vB .ms-hd { display: contents; }
  .mtp.vB .date { grid-row: 1 / span 2; text-align: right; display: grid; align-content: start; }
  .mtp.vB .date b { font-size: 16px; letter-spacing: -.02em; }
  .mtp.vB .date small { font-size: 12px; color: var(--mute); font-weight: 600; }
  .mtp.vB .ms.now .date b { color: var(--pri); }
  .mtp.vB .ms.due .date b { color: var(--warn); }
  .mtp.vB .ms h2 { font-size: 19px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .mtp.vB .ms-b { grid-column: 2; display: grid; gap: 12px; min-width: 0; }
  .mtp.vB .ms.past h2, .mtp.vB .ms.end h2 { color: var(--ink2); }
  .mtp.vB .card.dep { display: flex; gap: 12px; align-items: center; background: var(--bg2); border: 0; }
  .mtp.vB .bside { display: grid; gap: 14px; position: sticky; top: 16px; }
  .mtp.vB .sum .brk { display: grid; gap: 6px; font-size: 14px; }
  .mtp.vB .sum .tot b { font-size: 22px; }
  .mtp .brk .l { display: flex; justify-content: space-between; gap: 12px; }
  .mtp .brk .tot { display: flex; justify-content: space-between; align-items: baseline; border-top: 1.5px solid var(--ink); padding-top: 8px; margin-top: 2px; }
  .mtp .brk .tot b { font-size: 24px; font-weight: 800; letter-spacing: -.03em; }

  /* ===== C · Tabbed ===== */
  .mtp.vC .chd { display: grid; grid-template-columns: 120px 1fr auto; gap: 18px; align-items: center; margin-top: 12px; }
  .mtp.vC .chd .ph { aspect-ratio: 1; border-radius: 16px; }
  .mtp.vC .chd .rf { color: var(--ink2); }
  .mtp.vC .chd h1 { font-size: clamp(26px, 3.2cqi, 38px); margin: 6px 0 4px; }
  .mtp.vC .chd .when { color: var(--mute); }
  .mtp.vC .cdbox { background: var(--ink); color: #fff; border-radius: 16px; padding: 14px 20px; text-align: center; display: grid; }
  .mtp.vC .cdbox b { font-size: 40px; letter-spacing: -.04em; line-height: 1; color: var(--act); }
  .mtp.vC .cdbox span { font-size: 12px; font-weight: 700; color: #C9D3DC; }
  .mtp.vC .rstrip { margin-top: 18px; display: grid; gap: 8px; background: var(--bg2); border-radius: 16px; padding: 14px 16px; }
  .mtp.vC .rs-t { font-weight: 700; } .mtp.vC .rs-t b { font-size: 20px; letter-spacing: -.03em; }
  .mtp.vC .rs-l { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; font-size: 11px; font-weight: 700; color: var(--mute); line-height: 1.25; }
  .mtp.vC .rs-l .done { color: var(--ok); } .mtp.vC .rs-l .part { color: var(--warn); }
  .mtp.vC .ctabs { display: flex; gap: 2px; margin-top: 18px; border-bottom: 1.5px solid var(--line); overflow-x: auto; scrollbar-width: none; }
  .mtp.vC .ctabs button { border: 0; background: none; font: 700 14.5px "DM Sans", sans-serif; color: var(--mute); padding: 12px 14px; display: inline-flex; gap: 6px; align-items: center; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1.5px; white-space: nowrap; border-radius: 8px 8px 0 0; }
  .mtp.vC .ctabs button:hover { color: var(--ink); }
  .mtp.vC .ctabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--pri); }
  .mtp.vC .ctabs .ic { width: 14px; height: 14px; }
  .mtp.vC .ctabs .ct.due { background: var(--warn-soft); color: var(--warn); }
  .mtp.vC .cpanel { padding-top: 20px; animation: mtpIn .35s var(--ease) both; }
  .mtp.vC .ov { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; }
  .mtp.vC .ov-hd { display: flex; justify-content: space-between; align-items: baseline; }
  .mtp.vC .ovs, .mtp.vC .pkC { display: grid; gap: 14px; }
  .mtp.vC .pkC { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; }
  .mtp.vC .pgC { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  .mtp.vC .act { max-width: 720px; }

  @container site (max-width: 700px) {
    .mtp .card { padding: 16px; }
    .mtp .hero { min-height: 260px; } .mtp .hero .in { padding: 20px; }
    .mtp .cdn b { font-size: 36px; }
    .mtp .pk-grid, .mtp .pk-hotels, .mtp .kbg dl { grid-template-columns: 1fr; }
    .mtp .tvs { grid-template-columns: 1fr; }
    .mtp .tv .idrow { grid-template-columns: 1fr; }
    .mtp .mg { flex-direction: column; align-items: stretch; }
    .mtp .ck .own { display: none; }
    .mtp .pack .pk-hd { flex-wrap: wrap; }
    .mtp.vA .mc, .mtp.vA .agrid { grid-template-columns: 1fr; }
    .mtp.vA .rd-hd { gap: 14px; }
    .mtp.vA .keyd { grid-template-columns: 1fr 1fr; }
    .mtp.vA .keyd li { border-left: 0; border-top: 1px solid var(--line); }
    .mtp.vA .keyd li:nth-child(-n+2) { border-top: 0; }
    .mtp.vA .keyd li.go { grid-column: 1 / -1; }
    .mtp.vA .agrid .side { order: -1; }
    .mtp.vB .bhd { grid-template-columns: 1fr; gap: 12px; }
    .mtp.vB .bhd .ph { aspect-ratio: 16 / 9; }
    .mtp.vB .bhd .bt, .mtp.vB .bcd { padding: 0 6px 6px; min-width: 0; }
    .mtp.vB .bgrid { grid-template-columns: 1fr; }
    .mtp.vB .bside { position: static; }
    .mtp.vB .jr::before, .mtp.vB .jr::after { left: 6px; }
    .mtp.vB .ms { grid-template-columns: 1fr; padding-left: 30px; column-gap: 0; }
    .mtp.vB .ms .dot { left: 0; }
    .mtp.vB .date { grid-row: auto; text-align: left; display: flex; gap: 8px; align-items: baseline; }
    .mtp.vB .ms-b { grid-column: 1; }
    .mtp.vC .chd { grid-template-columns: 64px 1fr; }
    .mtp.vC .chd .ph { grid-row: 1; }
    .mtp.vC .cdbox { grid-column: 1 / -1; display: flex; gap: 8px; align-items: baseline; justify-content: center; padding: 10px; }
    .mtp.vC .rs-l { display: none; }
    .mtp.vC .ov, .mtp.vC .pkC, .mtp.vC .pgC { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mtp .ring.intro .fg, .mtp .seg.intro .s i, .mtp.vB .jr.intro::after, .mtp.vB .jr.intro .ms, .mtp .pack.opening .lks .sh, .mtp .pack.opening .pk-body, .mtp.vC .cpanel { animation: none !important; }
  }

  /* tick pill (D, E) */
  .mtp .dtick, .mtp .etick { position: relative; display: inline-flex; gap: 8px; align-items: center; flex: none; font: 700 13px "DM Sans", sans-serif; cursor: pointer; border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 14px 6px 7px; background: #fff; white-space: nowrap; }
  .mtp .dtick input, .mtp .etick input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; width: 100%; height: 100%; }
  .mtp .tbox { width: 22px; height: 22px; border-radius: 7px; border: 2px solid #9AA5AF; display: grid; place-items: center; color: transparent; transition: background .2s, border-color .2s; }
  .mtp .tbox .ic { width: 13px; height: 13px; }
  .mtp .dtick input:checked + .tbox, .mtp .etick input:checked + .tbox { background: var(--ok); border-color: var(--ok); color: #fff; }
  .mtp .dtick:has(input:checked), .mtp .etick:has(input:checked) { border-color: var(--ok); background: var(--ok-soft); color: var(--ok); }
  .mtp .dtick:has(input:focus-visible), .mtp .etick:has(input:focus-visible) { outline: 2px solid var(--pri); outline-offset: 2px; }

  /* ===== D · Boarding pass ===== */
  .mtp.vD .bp { margin-top: 12px; display: grid; grid-template-columns: 200px minmax(0, 1fr) 240px; background: var(--ink); color: #fff; border-radius: 22px; overflow: hidden; position: relative; }
  .mtp.vD .bp-ph { min-height: 100%; } .mtp.vD .bp-ph img { opacity: .9; }
  .mtp.vD .bp-main { padding: 22px 26px; display: grid; gap: 14px; align-content: start; min-width: 0; }
  .mtp.vD .bp-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; }
  .mtp.vD .bp-brand { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #AFC0D0; font-weight: 800; }
  .mtp.vD .bp h1 { font-size: 16px; font-weight: 700; color: #D6DEE6; letter-spacing: 0; }
  .mtp.vD .route { display: grid; grid-template-columns: auto minmax(24px, 1fr) auto minmax(24px, 1fr) auto; align-items: start; gap: 12px; }
  .mtp.vD .stop { display: grid; min-width: 0; }
  .mtp.vD .stop b { font-size: clamp(24px, 3.2cqi, 38px); letter-spacing: -.04em; line-height: 1.05; }
  .mtp.vD .stop small { font-size: 12px; color: #AFC0D0; font-weight: 700; }
  .mtp.vD .leg { display: grid; gap: 4px; padding-top: 16px; text-align: center; }
  .mtp.vD .leg i { height: 0; border-top: 2px dashed rgba(255,255,255,.4); position: relative; }
  .mtp.vD .leg i::after { content: ""; position: absolute; right: -2px; top: -6px; width: 8px; height: 8px; border-top: 2px solid rgba(255,255,255,.6); border-right: 2px solid rgba(255,255,255,.6); transform: rotate(45deg); }
  .mtp.vD .leg small { font-size: 11px; color: #AFC0D0; font-weight: 600; white-space: nowrap; }
  .mtp.vD .bp-meta { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 18px; border-top: 1px solid rgba(255,255,255,.14); padding-top: 14px; }
  .mtp.vD .bp-meta dt { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: #AFC0D0; font-weight: 700; }
  .mtp.vD .bp-meta dd { margin: 2px 0 0; font-size: 14px; font-weight: 700; }
  .mtp.vD .bp-meta .due dd { color: var(--act); }
  .mtp.vD .bp-stub { border-left: 2px dashed rgba(255,255,255,.3); padding: 22px; display: grid; gap: 14px; align-content: space-between; position: relative; background: #1B2A36; min-width: 0; }
  .mtp.vD .bp-stub::before, .mtp.vD .bp-stub::after { content: ""; position: absolute; left: -13px; width: 24px; height: 24px; border-radius: 50%; background: var(--bg); }
  .mtp.vD .bp-stub::before { top: -12px; } .mtp.vD .bp-stub::after { bottom: -12px; }
  .mtp.vD .cd { display: grid; }
  .mtp.vD .cd small { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #AFC0D0; font-weight: 800; }
  .mtp.vD .cd b { font-size: 72px; line-height: .95; letter-spacing: -.05em; color: var(--act); }
  .mtp.vD .cd span { font-weight: 800; font-size: 16px; }
  .mtp.vD .rd { display: grid; gap: 8px; }
  .mtp.vD .rd small { font-size: 12.5px; color: #D6DEE6; font-weight: 700; }
  .mtp.vD .holes { display: flex; gap: 7px; flex-wrap: wrap; }
  .mtp.vD .hole { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,.4); flex: none; }
  .mtp.vD .hole.done { background: var(--bg); border-color: var(--bg); }
  .mtp.vD .hole.part { background: conic-gradient(var(--act) 0 67%, transparent 0); border-color: var(--act); }
  .mtp.vD .hole.locked { border-style: dashed; opacity: .6; }
  .mtp.vD .bp.intro .hole.done, .mtp.vD .bp.intro .hole.part { animation: dPunch .45s var(--ease) both; animation-delay: calc(var(--i) * 110ms + 300ms); }
  @keyframes dPunch { from { transform: scale(0); } 70% { transform: scale(1.25); } }
  .mtp.vD .bars { display: flex; height: 40px; gap: 2px; }
  .mtp.vD .bars i { flex: var(--w) 1 0; min-width: 0; background: #fff; opacity: .85; }
  .mtp.vD .bars i.g { background: transparent; }
  .mtp.vD .bp.intro { animation: mtpIn .6s var(--ease) both; }

  .mtp.vD .dgrid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 28px; margin-top: 28px; align-items: start; }
  .mtp.vD .dcol { display: grid; gap: 12px; min-width: 0; align-content: start; }
  .mtp.vD .cps-hd h2 { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .mtp.vD .cps-hd p { margin-top: 2px; }
  .mtp.vD .cps-h { margin-top: 10px; display: flex; gap: 8px; align-items: center; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); }
  .mtp.vD .cps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .mtp.vD .cp { display: grid; grid-template-columns: 104px minmax(0, 1fr); background: #fff; border: 1px solid var(--line); border-radius: 16px; position: relative; transition: box-shadow .3s, border-color .3s; }
  .mtp.vD .cp.open { border-color: var(--ink); box-shadow: 0 18px 36px -28px rgba(20,32,42,.6); }
  .mtp.vD .cp-stub { border-right: 2px dashed var(--line); padding: 14px 12px; display: grid; align-content: start; gap: 4px; position: relative; background: var(--bg2); border-radius: 15px 0 0 15px; }
  .mtp.vD .cp-stub::before, .mtp.vD .cp-stub::after { content: ""; position: absolute; right: -9px; width: 16px; height: 16px; border-radius: 50%; background: var(--bg); border: 1px solid var(--line); }
  .mtp.vD .cp-stub::before { top: -9px; clip-path: inset(50% 0 0 0); } .mtp.vD .cp-stub::after { bottom: -9px; clip-path: inset(0 0 50% 0); }
  .mtp.vD .cp-no { font-size: 28px; font-weight: 800; letter-spacing: -.04em; color: var(--pri); line-height: 1; }
  .mtp.vD .cp-stub small { font-size: 11.5px; font-weight: 700; color: var(--mute); }
  .mtp.vD .cp.todo[data-cp="bal"] .cp-stub small { color: var(--warn); }
  .mtp.vD .cp.part .cp-no { color: var(--warn); }
  .mtp.vD .cp-main { padding: 14px 16px; display: grid; gap: 14px; min-width: 0; }
  .mtp.vD .cp-hd { display: flex; gap: 12px; align-items: center; }
  .mtp.vD .cp-tx { flex: 1; min-width: 0; display: grid; }
  .mtp.vD .cp-tx b { font-size: 15.5px; }
  .mtp.vD .cp-tx small { color: var(--mute); font-size: 13px; font-weight: 500; }
  .mtp.vD .cp-tg { flex: none; }
  .mtp.vD .cp-tg .ic { transition: transform .3s var(--ease); }
  .mtp.vD .cp-tg[aria-expanded="true"] .ic { transform: rotate(180deg); }
  .mtp.vD .cp-b { display: grid; gap: 12px; }
  .mtp.vD .cp-b[hidden] { display: none; }
  .mtp.vD .cp-b > .card { border: 0; padding: 0; background: none; }
  .mtp.vD .cp.locked .cp-no { color: var(--mute); }
  .mtp.vD .cp.done { background: transparent; border-style: dashed; }
  .mtp.vD .cp.done .cp-stub { background: transparent; }
  .mtp.vD .cp.done .cp-no { color: var(--ok); }
  .mtp.vD .cp.done .cp-tx b { color: var(--ink2); }
  .mtp.vD .stamp { flex: none; border: 2px solid var(--ok); color: var(--ok); border-radius: 8px; padding: 3px 8px; font: 800 10.5px/1.15 "DM Sans", sans-serif; text-transform: uppercase; letter-spacing: .1em; transform: rotate(-7deg); text-align: center; }
  .mtp.vD .cp.just { animation: dTear .7s var(--ease) both; }
  .mtp.vD .cp.just .stamp { animation: dStamp .5s var(--ease) .25s both; }
  @keyframes dTear { 35% { transform: translate(8px, -4px) rotate(1.2deg); } }
  @keyframes dStamp { from { transform: rotate(-7deg) scale(1.9); opacity: 0; } }
  .mtp.vD .drail { display: grid; gap: 14px; min-width: 0; }
  .mtp.vD .dlog { background: #FFFDF6; border-style: dashed; }
  .mtp.vD .dlog ol { list-style: none; margin: 0; padding: 0; display: grid; }
  .mtp.vD .dlog li { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 10px; padding: 8px 0; border-top: 1px dashed #D9D2BF; font-size: 13px; }
  .mtp.vD .dlog li > span { color: var(--mute); font-weight: 700; font-size: 12px; }
  .mtp.vD .dlog li small { display: block; color: var(--mute); font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin-top: 2px; }

  /* ===== E · One thing next ===== */
  .mtp.vE .es { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 32px; margin-top: 12px; align-items: start; }
  .mtp.vE .eph { position: sticky; top: 16px; height: 640px; border-radius: 26px; overflow: hidden; color: #fff; display: grid; align-content: space-between; background: var(--ink); }
  .mtp.vE .eph .ph { position: absolute; inset: 0; }
  .mtp.vE .eph.intro .ph img { animation: eZoom 2.6s var(--ease) both; }
  @keyframes eZoom { from { transform: scale(1.1); } }
  .mtp.vE .eshade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(20,32,42,.95) 6%, rgba(20,32,42,.45) 48%, rgba(20,32,42,0) 70%), linear-gradient(to bottom, rgba(20,32,42,.5), rgba(20,32,42,0) 22%); }
  .mtp.vE .etop, .mtp.vE .ebot { position: relative; padding: 22px 26px; }
  .mtp.vE .ebot { display: grid; gap: 8px; }
  .mtp.vE .ecd { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .mtp.vE .ecd b { font-size: 112px; line-height: .85; letter-spacing: -.06em; color: var(--act); }
  .mtp.vE .ecd span { font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
  .mtp.vE .eph.intro .ecd b { animation: mtpIn .8s var(--ease) .2s both; }
  .mtp.vE .eph h1 { font-size: clamp(24px, 2.8cqi, 34px); color: #fff; }
  .mtp.vE .erd { display: grid; gap: 6px; font-size: 13px; font-weight: 700; color: #D6DEE6; margin-top: 6px; }
  .mtp.vE .erd .seg .s { background: rgba(255,255,255,.2); }
  .mtp.vE .erd .seg .s.locked { background: repeating-linear-gradient(-45deg, rgba(255,255,255,.2) 0 4px, rgba(255,255,255,.06) 4px 8px); }
  .mtp.vE .ein { display: grid; gap: 22px; min-width: 0; align-content: start; }
  .mtp.vE .etitle { font-size: clamp(24px, 2.6cqi, 32px); font-weight: 800; letter-spacing: -.03em; line-height: 1.15; margin-top: 4px; }
  .mtp.vE .enow { border: 2px solid var(--ink); border-radius: 22px; padding: 22px; display: grid; gap: 16px; background: #fff; box-shadow: 0 30px 50px -40px rgba(20,32,42,.8); animation: eDeal .5s var(--ease) both; min-width: 0; }
  .mtp.vE .enow.isdone { border-color: var(--ok); }
  @keyframes eDeal { from { opacity: 0; transform: translateY(14px) scale(.98); } }
  .mtp.vE .enow-hd { display: grid; gap: 4px; }
  .mtp.vE .enow-hd h2 { font-size: 26px; letter-spacing: -.03em; }
  .mtp.vE .enow-hd p { color: var(--ink2); font-size: 14.5px; }
  .mtp.vE .enow h2:focus { outline: none; }
  .mtp.vE .enow h2:focus-visible { outline: 2px solid var(--pri); outline-offset: 4px; border-radius: 6px; }
  .mtp.vE .eb { display: grid; gap: 12px; min-width: 0; }
  .mtp.vE .eb > .card { border: 0; padding: 0; background: none; }
  .mtp.vE .etools { display: flex; justify-content: flex-end; border-top: 1px solid var(--line); padding-top: 10px; }
  .mtp.vE .eown { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; }
  .mtp.vE .eown .etick { grid-column: 1 / -1; justify-self: start; font-size: 15px; padding: 10px 18px 10px 10px; }
  .mtp.vE .eclear { display: grid; justify-items: start; gap: 8px; }
  .mtp.vE .eclear h2 { font-size: 26px; letter-spacing: -.03em; }
  .mtp.vE .bigok { width: 56px; height: 56px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; animation: ePop .55s var(--ease) both; }
  .mtp.vE .bigok .ic { width: 28px; height: 28px; }
  @keyframes ePop { from { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.12); } }
  .mtp.vE .eq h3, .mtp.vE .edone summary { display: flex; gap: 8px; align-items: center; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); font-weight: 800; }
  .mtp.vE .eq .ck-list { margin-top: 4px; }
  .mtp.vE .eq .st .ic { color: var(--mute); }
  .mtp.vE details > summary { list-style: none; cursor: pointer; }
  .mtp.vE details > summary::-webkit-details-marker { display: none; }
  .mtp.vE details > summary > .ic { width: 16px; height: 16px; transition: transform .3s var(--ease); flex: none; }
  .mtp.vE details[open] > summary > .ic { transform: rotate(180deg); }
  .mtp.vE .edone { border-top: 1.5px solid var(--line); padding-top: 12px; }
  .mtp.vE .edone summary { padding: 4px 0; }
  .mtp.vE .edone .ck-list { margin-top: 4px; }
  .mtp.vE .ecal { margin-top: 8px; }
  .mtp.vE .emini { margin-top: 6px; }
  .mtp.vE .emini > summary { display: inline-flex; gap: 6px; align-items: center; font: 700 13px "DM Sans", sans-serif; color: var(--pri); padding: 4px 0; }
  .mtp.vE .emini > summary .tav { border-radius: 50%; margin-right: -10px; box-shadow: 0 0 0 2px #fff; font-size: 11px; }
  .mtp.vE .emini > summary .tav + span, .mtp.vE .emini > summary .tav:last-of-type { margin-right: 4px; }
  .mtp.vE .emini[open] > .tvs, .mtp.vE .emini[open] > .demo { margin-top: 10px; }
  .mtp.vE .emore { display: grid; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
  .mtp.vE .exd + .exd { border-top: 1px solid var(--line); }
  .mtp.vE .exd > summary { display: grid; grid-template-columns: 36px minmax(0, 1fr) 16px; gap: 12px; align-items: center; padding: 14px 16px; }
  .mtp.vE .exd > summary:hover { background: var(--bg2); }
  .mtp.vE .exd > summary:focus-visible { outline: 2px solid var(--pri); outline-offset: -2px; }
  .mtp.vE .exi { width: 36px; height: 36px; border-radius: 10px; background: var(--bg2); color: var(--ink2); display: grid; place-items: center; }
  .mtp.vE .exi .ic { width: 17px; height: 17px; }
  .mtp.vE .exd .tx { display: grid; min-width: 0; } .mtp.vE .exd .tx b { font-size: 14.5px; } .mtp.vE .exd .tx small { color: var(--mute); font-size: 12.5px; }
  .mtp.vE .exb { padding: 0 16px 14px; }
  .mtp.vE .exb > .card { border: 0; padding: 0; }
  .mtp.vE .exb > .card > h3:first-child, .mtp.vE .exb .ex-hd h3 { display: none; }
  .mtp.vE .eact { display: grid; gap: 8px; }

  @container site (max-width: 700px) {
    .mtp .dtick, .mtp .etick { white-space: normal; }
    .mtp.vD .bp { grid-template-columns: 1fr; border-radius: 20px; }
    .mtp.vD .bp-ph { min-height: 0; height: 130px; }
    .mtp.vD .bp-main { padding: 18px; }
    .mtp.vD .route { gap: 6px; grid-template-columns: auto minmax(12px, 1fr) auto minmax(12px, 1fr) auto; }
    .mtp.vD .stop b { font-size: 21px; }
    .mtp.vD .leg small { display: none; }
    .mtp.vD .leg { padding-top: 12px; }
    .mtp.vD .bp-meta { grid-template-columns: 1fr 1fr; }
    .mtp.vD .bp-stub { border-left: 0; border-top: 2px dashed rgba(255,255,255,.3); padding: 18px; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 14px 18px; }
    .mtp.vD .bp-stub::before { left: -12px; top: -13px; } .mtp.vD .bp-stub::after { left: auto; right: -12px; top: -13px; bottom: auto; }
    .mtp.vD .cd b { font-size: 56px; }
    .mtp.vD .bars { grid-column: 1 / -1; height: 30px; }
    .mtp.vD .dgrid { grid-template-columns: 1fr; gap: 24px; }
    .mtp.vD .cp { grid-template-columns: 1fr; }
    .mtp.vD .cp-stub { border-right: 0; border-bottom: 2px dashed var(--line); border-radius: 15px 15px 0 0; display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; }
    .mtp.vD .cp-stub::before { right: auto; left: -9px; top: auto; bottom: -9px; clip-path: inset(0 0 0 50%); }
    .mtp.vD .cp-stub::after { right: -9px; bottom: -9px; clip-path: inset(0 50% 0 0); }
    .mtp.vD .cp-no { font-size: 20px; }
    .mtp.vD .cp-main { padding: 12px 14px; }
    .mtp.vD .cp-hd { flex-wrap: wrap; }
    .mtp.vD .cp-tx { flex-basis: 70%; }
    .mtp.vD .dlog li { grid-template-columns: 1fr; gap: 2px; }
    .mtp.vE .es { grid-template-columns: 1fr; gap: 20px; }
    .mtp.vE .eph { position: relative; top: auto; height: 380px; border-radius: 20px; }
    .mtp.vE .etop, .mtp.vE .ebot { padding: 18px; }
    .mtp.vE .ecd b { font-size: 80px; }
    .mtp.vE .enow { padding: 16px; border-radius: 18px; }
    .mtp.vE .enow-hd h2, .mtp.vE .eclear h2 { font-size: 22px; }
    .mtp.vE .etools { justify-content: flex-start; }
    .mtp.vE .exd > summary { padding: 12px 14px; }
    .mtp.vE .exb { padding: 0 14px 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mtp.vD .bp.intro, .mtp.vD .bp.intro .hole, .mtp.vD .cp.just, .mtp.vD .cp.just .stamp, .mtp.vE .eph.intro .ph img, .mtp.vE .eph.intro .ecd b, .mtp.vE .enow, .mtp.vE .bigok { animation: none !important; }
    .mtp .tbox, .mtp.vD .cp, .mtp.vD .cp-tg .ic, .mtp.vE details > summary > .ic { transition: none !important; }
  }
  `;

  TS.register({
    id: 'trip', label: 'My trip', group: 'v2.5 · customer', css,
    variants: [
      { id: 'A', name: 'Mission control', render: renderA, mount: mount('A'),
        note: 'Extends the shipped booking page: the dark cover header with the countdown sits beside a readiness ring that fills on load and counts up, with the live checklist under it (tick Anjali’s items and the ring moves). A key-dates strip reads today → balance due → pack unlocks → details lock → departure. Below, traveller cards and the trip pack on the left; balance, calendar, extras, voucher, change of plans and Activity down a 380px rail. On phone the rail jumps above the travellers so “pay the balance” is the second thing you see after readiness.',
        tradeoff: 'Everything is on one screen, so it is the longest page and the extras and Activity sit low on desktop.' },
      { id: 'B', name: 'Journey line', render: renderB, mount: mount('B'),
        note: 'The booking as a vertical route: Booked (24 Sep) → Today (checklist) → Balance due 14 Oct (pay in parts) → 6 Nov extras close and the trip pack opens → 10 Nov details lock (traveller cards) → 13 Nov departure → 17 Nov home. Each action lives on the date it matters; the rail draws down to “today” on load and the header carries a 7-segment readiness bar. A sticky side card keeps the price, calendar, voucher, change date, cancel and Activity. On phone the dates move above each step and the side card follows the route.',
        tradeoff: 'Makes deadlines obvious, but a customer hunting one thing (say, Vikram’s ID) has to know which date it hangs off.' },
      { id: 'C', name: 'Tabbed booking', render: renderC, mount: mount('C'),
        note: 'A compact header with the countdown, a labelled 7-segment readiness strip that fills segment by segment on load, then tabs: Overview (checklist with “Pay / Finish” jumps, calendar, extras, change of plans), Travellers, Payments (pay in parts + history + price), Trip pack (lock icon until 6 Nov) and Activity. Tabs carry live counts (2/3, balance due) and support arrow keys. On phone the tabs scroll sideways and every panel stacks to one column.',
        tradeoff: 'Short and tidy, but the balance and missing ID hide behind tabs unless the checklist sends you there.' },
      { id: 'D', name: 'Boarding pass', render: renderD, mount: mountX('D'),
        note: 'The booking as a holiday pass. A wide dark pass carries the route (Kochi → Munnar → Alleppey with drive times), depart and return, travellers, leader, where the meeting point will appear and the balance due; its perforated stub holds a big countdown, seven punch holes for readiness (punched one by one on load) and a barcode of the booking ref. Below, every task is a numbered tear-off coupon with the date it matters by on its stub: open the balance coupon to pay in parts, the traveller coupon for the ID cards, the trip-pack coupon for the locked pack and its preview; Anjali’s items tick straight from the coupon. Finishing a task tears the coupon off with a stamp and drops it into the “Torn off” pile. Extras, change of plans, voucher and a receipt-style ticket log sit in the right rail. On phone the pass stacks, the stub’s perforation turns horizontal, and each coupon’s stub becomes a strip across its top.',
        tradeoff: 'The most memorable page and very easy to scan, but coupons open one at a time and the pass header costs a full screen on phone before the first coupon.' },
      { id: 'E', name: 'One thing next', render: renderE, mount: mountX('E'),
        note: 'Photo-led focus mode. The houseboat photo fills a tall sticky panel with a huge countdown and the readiness bar over it; beside it the page shows one task, the next one, as a big card with its real controls (Mira’s ID form, pay in parts, Anjali’s tick items, the locked trip pack with its preview). Finish it and the card flips to a done state with “Next: …”; “Not now” moves to the next one. Up next and Coming up (pack unlocks 6 Nov, extras close, details lock) are one-line rows with “Do now” or “Look inside”, Done folds away with the calendar links, and extras, change date or cancel, voucher and Activity sit in folded rows below. On phone the photo becomes a 380px band and the one task follows straight after it.',
        tradeoff: 'Calmest and most phone-friendly, but it hides the full picture: someone who wants to see every traveller and payment at once has to unfold sections.' },
    ],
  });
})();

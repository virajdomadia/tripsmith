/* Admin redesign · Enquiries A2 "Refined A".
   Keeps A's bones (list on the left sorted longest-waiting first, detail panel on the right, same people and refs)
   and sharpens it for one operator answering 5–15 enquiries a day from a laptop and a phone.
   Loads after admin-ops.js (and adm-dash.js); registers as a new variant and slots in right after A.
   "Now" is Sun 27 Sep 2026, 4:20 pm IST. */
(() => {
  const TS = window.TS;
  const { inr, lakh, esc, ICON, PKGS } = TS;

  /* ---------- helpers ---------- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const T0 = Date.UTC(2026, 8, 27);
  const isoAdd = (n) => new Date(T0 + n * 864e5).toISOString().slice(0, 10);
  const dayDiff = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - T0) / 864e5);
  const dayName = (iso) => { const x = new Date(`${iso}T00:00:00Z`); return `${WD[x.getUTCDay()]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
  const party = (a, c = 0) => `${a} ${a === 1 ? 'adult' : 'adults'}${c ? `, ${c} ${c === 1 ? 'child' : 'children'}` : ''}`;
  const first = (n) => n.split(' ')[0];
  const dur = (m) => (m >= 1440 ? `${Math.floor(m / 1440)} ${Math.floor(m / 1440) === 1 ? 'day' : 'days'}` : m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`);
  const V25 = '<span class="a-chip ad-eq2-v25" title="New in v2.5">v2.5</span>';
  const ic = (k, s = 14) => ICON[k].replace('class="ic"', `class="ic" style="width:${s}px;height:${s}px"`);
  const NOW_T = 'Today, 4:20 pm';
  const TARGET = 120; // first-reply target, minutes

  /* ---------- vocab ---------- */
  const TYPES = { standard: 'Standard', custom: 'Customise', contact: 'Contact', callback: 'Callback request', group: 'Group enquiry', chat: 'From concierge' };
  const SRC = { form: ['Form', 'file', ''], callback: ['Callback', 'phone', ''], whatsapp: ['WhatsApp', 'wa', 'wa'], concierge: ['Concierge', 'chat', ''] };
  // Won and Lost are the shipped Converted and Closed; Quoted is the one new status.
  const STAGES = { new: ['pri', 'New'], contacted: ['warn', 'Contacted'], quoted: ['info', 'Quoted'], won: ['ok', 'Won'], lost: ['mute', 'Lost'] };
  const LOST_WHY = ['Price too high', 'Dates did not work', 'Chose another option', 'No reply after 3 follow-ups', 'Just browsing'];

  /* ---------- next departures with seats (same seat maths as the desk and calendar) ---------- */
  const DATES = {
    kasol: [['Fri 2 Oct', 2], ['Fri 9 Oct', 15]],
    shimla: [['Sun 4 Oct', 7], ['Sat 26 Dec', 6]],
    goa: [['Fri 9 Oct', 0], ['Sun 1 Nov', 14], ['Fri 20 Nov', 18]],
    leh: [['Sun 11 Oct', 2]],
    manali: [['Fri 16 Oct', 8], ['Sat 31 Oct', 10]],
    munnar: [['Sun 18 Oct', 4], ['Sun 15 Nov', 12], ['Sun 22 Nov', 9]],
    jaipur: [['Fri 23 Oct', 13], ['Fri 30 Oct', 11], ['Fri 11 Dec', 18]],
  };

  /* ---------- seed: the same twelve as A, with the thread each one already has ---------- */
  const E = (ref, name, ph, em, pkg, type, src, month, a, c, status, recv, at, ago, o = {}) => ({ ref, name, ph, em, pkg, type, src, month, a, c, status, recv, at, ago,
    wait: 0, budget: 0, dates: '', changes: '', msg: '', device: 'Mobile · Chrome on Android', th: [], log: [], booking: '', fu: '', fuT: '', why: '', past: [], others: [], answered: false, ...o });
  const ENQ = [
    E('TS-9P2LXA', 'Ritika Sharma', '98111 20457', 'ritika.sharma@customer.in', 'leh', 'callback', 'callback', 'Jun 2027', 2, 0, 'new', '6 h ago', 'Today, 10:20 am', 360,
      { wait: 360, fu: isoAdd(0), fuT: '6:00 pm', msg: 'Please call after 6 pm. We want to know how the oxygen on board works and whether my mother (62) should do Khardung La.',
        others: [['TS-1KB7QE', 'General enquiry', 'Lost · Just browsing', 'Mar 2026']] }),
    E('TS-4MW8TE', 'Devansh Agarwal', '99300 71842', 'devansh@customer.in', 'jaipur', 'group', 'form', 'Dec 2026', 14, 0, 'new', '3 h ago', 'Today, 1:20 pm', 180,
      { wait: 180, dates: '11–16 Dec', budget: 30000, device: 'Desktop · Chrome on Windows', msg: 'Company offsite for 14. Need one coach for the whole trip, a conference room in Udaipur for half a day, and a GST invoice.' }),
    E('TS-7F3K2Q', 'Neha Kapoor', '98450 66120', 'neha.kapoor@customer.in', 'munnar', 'custom', 'form', 'Nov 2026', 2, 1, 'new', '48 min ago', 'Today, 3:32 pm', 48,
      { wait: 48, budget: 30000, dates: 'Around 14–19 Nov', changes: 'Two nights on the houseboat instead of one, and a Kochi city day at the end before our flight home.',
        msg: 'Our daughter is 6. Is the houseboat safe for her, and can we get a vegetarian cook on board?' }),
    E('TS-2HD6RB', 'Suresh Venkataraman', '94440 18273', 'suresh.v@customer.in', 'shimla', 'chat', 'concierge', 'Dec 2026', 2, 2, 'new', '21 min ago', 'Today, 3:59 pm', 21,
      { wait: 21, msg: 'Handed over by the concierge: wants snow almost certain in the last week of December and asked about heated rooms in Manali.' }),
    E('TS-8QK3NV', 'Aisha Khan', '98670 30491', 'aisha.khan@customer.in', 'goa', 'standard', 'form', 'Nov 2026', 2, 0, 'new', '12 min ago', 'Today, 4:08 pm', 12,
      { wait: 12, dates: '20–23 Nov', device: 'Mobile · Safari on iPhone' }),
    E('TS-5JT9WC', 'Manoj Tiwari', '98390 55104', 'manoj.tiwari@customer.in', 'manali', 'standard', 'form', 'Oct 2026', 3, 0, 'contacted', 'Yesterday', 'Sat 26 Sep, 9:15 am', 1865,
      { fu: isoAdd(0), fuT: '5:30 pm', answered: true, th: [['note', 'Sat 26 Sep, 11:44 am', 'Called. Wants the Kheerganga trek included; sending a revised quote with a porter.']] }),
    E('TS-6RB2YH', 'Lakshmi Narayanan', '94430 27719', 'lakshmi.n@customer.in', '', 'contact', 'form', '', 2, 0, 'contacted', '2 days ago', 'Fri 25 Sep, 2:40 pm', 2980,
      { msg: 'Do you run Kerala trips in the monsoon, or only from September?',
        th: [['out', 'Fri 25 Sep, 5:10 pm', 'Hi Lakshmi, we run Munnar & Alleppey every week from October to March. The monsoon months are lovely but the houseboats run a shorter loop, so we start in October. The October dates are on the package page.']] }),
    E('TS-3ZC7MP', 'Gaurav Bhatia', '98180 44926', 'gaurav.bhatia@customer.in', 'leh', 'custom', 'form', 'Jul 2027', 4, 0, 'quoted', '3 days ago', 'Thu 24 Sep, 11:05 am', 4755,
      { fu: '2026-10-01', changes: 'Add Tso Moriri and one extra night in Leh to acclimatise.',
        th: [['out', 'Thu 24 Sep, 3:02 pm', 'Hi Gaurav, the Tso Moriri add-on is 2 nights with a camp by the lake, plus the extra night in Leh. The revised quote for 4 is attached. Happy to talk it through.', 'Leh + Tso Moriri quote.pdf'],
          ['note', 'Thu 24 Sep, 3:04 pm', 'Quoted ₹41,500 per person with Tso Moriri. Follow up on 1 Oct.']] }),
    E('TS-2TQ8LU', 'Sana Mirza', '99200 81736', 'sana.mirza@customer.in', 'goa', 'group', 'whatsapp', 'Jan 2027', 9, 0, 'contacted', '4 days ago', 'Wed 23 Sep, 8:12 pm', 5648,
      { wait: 4698, dates: '16–19 Jan', msg: 'Bachelorette trip for 9. Can we have the whole floor at the hotel?',
        th: [['out', 'Wed 23 Sep, 9:30 pm', 'Hi Sana, a whole floor at Acron Waterfront is possible for 9 in January. Which dates are you looking at?'],
          ['in', 'Thu 24 Sep, 10:02 am', '16 to 19 January. Can you hold the floor for us? We will pay a deposit this week.']] }),
    E('TS-1XN4GS', 'Meenakshi Pillai', '94472 30918', 'meenakshi.pillai@customer.in', 'munnar', 'standard', 'form', 'Oct 2026', 2, 0, 'won', '12 Sep', 'Sat 12 Sep, 7:48 pm', 21150,
      { booking: 'TB-5DC9MU', past: [['TB-5DC9MU', 'Munnar & Alleppey Houseboat', 'Sun 18 Oct', 'Confirmed · paid']],
        th: [['out', 'Sat 12 Sep, 9:02 pm', 'Hi Meenakshi, the 18 Oct departure has seats and FESTIVE10 takes 10% off until 20 Sep.'], ['note', 'Sat 19 Sep, 10:05 am', 'Booked 18 Oct with FESTIVE10.']] }),
    E('TS-9WE5KD', 'Pranav Hegde', '99800 16453', 'pranav.hegde@customer.in', 'kasol', 'standard', 'form', 'Oct 2026', 4, 0, 'lost', '15 Sep', 'Tue 15 Sep, 6:30 pm', 17630,
      { why: 'Chose another option', th: [['out', 'Tue 15 Sep, 7:10 pm', 'Hi Pranav, the 2 Oct weekend has seats for 4. Want me to hold them?'],
        ['in', 'Wed 16 Sep, 11:50 am', 'Thanks, we have decided to drive up ourselves this time.'], ['note', 'Wed 16 Sep, 12:30 pm', 'Chose a self-drive trip instead.']] }),
    E('TS-6YH3BF', 'Harpreet Kaur', '98723 90114', 'harpreet.kaur@customer.in', 'kasol', 'callback', 'callback', 'Sep 2026', 2, 0, 'won', '2 Sep', 'Wed 2 Sep, 11:10 am', 36070,
      { booking: 'TB-1ZF5WE', past: [['TB-1ZF5WE', 'Kasol Riverside Weekend', 'Fri 25 Sep', 'Travelled']], others: [['TS-4AA9KM', 'Leh · Nubra · Pangong', 'New', 'Today']],
        th: [['note', 'Wed 2 Sep, 12:05 pm', 'Called back. Booking the 25 Sep weekend for two.']] }),
  ];
  const eBy = (r) => ENQ.find((e) => e.ref === r);

  /* ---------- derived ---------- */
  const isOpen = (e) => e.status !== 'won' && e.status !== 'lost';
  const thread = (e) => {
    const p = e.pkg ? PKGS[e.pkg] : null;
    const facts = [['Trip', p ? p.name : 'General question'], e.month ? ['Month', e.month] : null, ['Party', party(e.a, e.c)],
      e.dates ? ['Dates', e.dates] : null, e.budget ? ['Budget', `${inr(e.budget)} per person`] : null, e.changes ? ['Changes', e.changes] : null].filter(Boolean);
    const T = [{ k: 'in', t: e.at, body: `<dl class="ad-eq2-form">${facts.map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>${e.msg ? `<span class="tx">${esc(e.msg)}</span>` : `<span class="muted">No message, just the ${TYPES[e.type].toLowerCase()} form.</span>`}` }];
    T.push({ k: 'sys', body: e.src === 'whatsapp' ? 'Logged by you from WhatsApp' : e.src === 'concierge' ? 'Handed over by the concierge · you were alerted' : `${TYPES[e.type]} form · confirmation emailed · you were alerted` });
    e.th.forEach(([k, t, x, att]) => T.push({ k, t, body: `<span class="tx">${esc(x)}</span>`, att: att || '' }));
    if (e.booking && !e.log.some((m) => m.k === 'sys' && m.body.includes(e.booking))) T.push({ k: 'sys', body: `Won · converted to booking ${e.booking}` });
    if (e.status === 'lost' && e.why && !e.log.length) T.push({ k: 'sys', body: `Marked lost · ${e.why}` });
    return T.concat(e.log);
  };
  const lastSpeaker = (e) => { const T = thread(e).filter((m) => m.k === 'in' || m.k === 'out'); return T[T.length - 1].k; };
  const needsReply = (e) => isOpen(e) && !e.answered && lastSpeaker(e) === 'in';
  const fuDue = (e) => isOpen(e) && e.fu && dayDiff(e.fu) <= 0;
  const est = (e) => (e.pkg ? PKGS[e.pkg].from * (e.a + e.c) : 0);
  const sla = (e) => {
    if (!needsReply(e)) return null;
    const w = e.wait;
    if (w >= TARGET) return ['bad', `Waiting ${dur(w)} · over target`];
    if (w >= 45) return ['warn', `Waiting ${dur(w)} · ${dur(TARGET - w)} to target`];
    return ['ok', `Waiting ${dur(w)} · on target`];
  };
  const fuWord = (e) => {
    if (!e.fu || !isOpen(e)) return '';
    const d = dayDiff(e.fu);
    return d < 0 ? `Follow-up overdue · ${dayName(e.fu)}` : d === 0 ? `Follow up today${e.fuT ? ` · ${e.fuT}` : ''}` : d === 1 ? 'Follow up tomorrow' : `Follow up ${dayName(e.fu)}`;
  };
  const stChip = (e) => `<span class="a-chip ${STAGES[e.status][0]}">${e.status === 'won' ? ic('check', 12) : ''}${STAGES[e.status][1]}${e.status === 'lost' && e.why ? ` · ${esc(e.why)}` : ''}</span>`;
  const srcChip = (e) => { const [l, k, cls] = SRC[e.src]; return `<span class="a-chip mute ad-eq2-src ${cls}">${ic(k, 12)}${l}</span>`; };
  const slaChip = (e) => { const s = sla(e); return s ? `<span class="a-chip ${s[0]}">${ic('clock', 12)}${s[1]}</span>` : ''; };
  const fuChip = (e) => (fuWord(e) ? `<span class="a-chip ${fuDue(e) ? 'warn' : 'info'}">${ic('cal', 12)}${fuWord(e)}</span>` : '');
  const tripLine = (e) => [e.pkg ? PKGS[e.pkg].name : 'General question', e.month, party(e.a, e.c)].filter(Boolean).join(' · ');

  const CHIPS = [
    ['all', 'All', () => true], ['new', 'New', (e) => e.status === 'new'], ['reply', 'Needs reply', needsReply], ['today', 'Follow up today', fuDue],
    ['quoted', 'Quoted', (e) => e.status === 'quoted'], ['won', 'Won', (e) => e.status === 'won'], ['lost', 'Lost', (e) => e.status === 'lost'],
  ];
  const rank = (e) => (needsReply(e) ? 0 : fuDue(e) ? 1 : isOpen(e) ? 2 : 3);
  const nextDates = (e) => {
    if (!e.pkg) return [];
    const inMonth = e.month && e.month.endsWith('2026') ? e.month.slice(0, 3) : '';
    const all = (DATES[e.pkg] || []).filter(([, s]) => s > 0);
    const m = inMonth ? all.filter(([d]) => d.endsWith(inMonth)) : [];
    return (m.length ? m : e.month && !e.month.endsWith('2026') ? [] : all).slice(0, 2);
  };
  const fitDate = (e) => nextDates(e).find(([, s]) => s >= e.a + e.c) || null;

  /* ---------- trip facts for snippets and templates ---------- */
  const priceLine = (e) => { const p = e.pkg ? PKGS[e.pkg] : null; return p ? `${p.name} starts at ${inr(p.from)} per person for ${p.nights} nights, with ${p.meals.toLowerCase()}. For ${party(e.a, e.c)} that comes to about ${inr(est(e))}.` : 'Our Kerala trips run every week from October to March.'; };
  const datesLine = (e) => {
    const d = nextDates(e);
    if (d.length) return `Next dates with seats: ${d.map(([x, s]) => `${x} (${s} left)`).join(', ')}.`;
    if (e.month && !e.month.endsWith('2026')) return `Dates for ${e.month} open for booking on 1 Jan 2027, and I can note your preferred dates now.`;
    return 'I will send the next dates as soon as they open.';
  };
  const SNIPS = [
    ['Price from', priceLine],
    ['Next dates', datesLine],
    ['Deposit', () => 'You can hold seats with a 25% deposit and pay the balance 30 days before departure.'],
    ['Call time', () => 'What time suits you for a 10-minute call today?'],
    ['Itinerary', (e) => (e.pkg ? `I have attached the day-by-day ${PKGS[e.pkg].name} itinerary.` : 'I can send a day-by-day itinerary once you pick a trip.')],
  ];
  const TPLS = {
    first: ['First reply · trip facts', (e) => `Hi ${first(e.name)},\n\nThanks for your enquiry. ${priceLine(e)}\n\n${datesLine(e)}\n\nYou can hold seats with a 25% deposit and pay the balance 30 days before departure. Would a quick call today suit you?\n\nViraj, Tripsmith`],
    group: ['Group enquiry', (e) => `Hi ${first(e.name)},\n\nThanks for thinking of us for ${e.a + e.c} people. For groups of 9 or more we run a private departure: one vehicle for the whole trip, rooms together where the hotel allows, and a GST invoice on request. ${priceLine(e)}\n\nCould you confirm the dates and where you start from? I will send a group quote within a day.\n\nViraj, Tripsmith`],
    nudge: ['Quote follow-up', (e) => `Hi ${first(e.name)},\n\nJust checking in on the ${e.pkg ? PKGS[e.pkg].name : 'trip'} quote. ${datesLine(e)} Seats go fast before Diwali, so shall I hold them for 24 hours while you decide?\n\nViraj, Tripsmith`],
  };

  /* ---------- state ---------- */
  const st = { chip: 'all', q: '', sort: 'wait', sel: 'TS-7F3K2Q', view: 'list', mode: 'reply', draft: {}, att: true, picked: [], convert: false, lost: false, flash: '', anim: true, fresh: 0 };
  const matchQ = (e) => !st.q || [e.name, e.ph.replace(/\s/g, ''), e.ref, e.pkg ? PKGS[e.pkg].name : ''].some((s) => s.toLowerCase().includes(st.q.toLowerCase().replace(/\s/g, '')));
  const rows = () => {
    const f = CHIPS.find((c) => c[0] === st.chip)[2];
    const r = ENQ.filter((e) => f(e));
    return st.sort === 'wait' ? r.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? b.wait - a.wait : a.ago - b.ago)) : r.sort((a, b) => a.ago - b.ago);
  };

  /* ---------- CSS ---------- */
  const css = `
  .ad-eq2 { display: grid; gap: 14px; min-width: 0; }
  .ad-eq2 .mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12px; letter-spacing: .02em; }
  .ad-eq2 .muted { color: var(--mute); }
  .ad-eq2 .lnk { color: var(--pri); font: inherit; font-weight: 700; text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; }
  .ad-eq2 .lnk:hover { text-decoration: underline; }
  .ad-eq2 button { font-family: "DM Sans", sans-serif; }
  .ad-eq2 :focus-visible { outline: 2px solid var(--pri); outline-offset: 2px; }
  .ad-eq2 .a-chip .ic { flex: none; }
  .ad-eq2-v25 { font-size: 10px; letter-spacing: .06em; padding: 1px 6px; background: transparent !important; color: var(--pri) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pri) 45%, transparent); vertical-align: middle; }
  .ad-eq2-h3 { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--mute); margin: 0; display: flex; align-items: center; gap: 8px; }
  .ad-eq2-h3 .r { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 600; }

  /* filters */
  .ad-eq2-filters { display: grid; gap: 10px; }
  .ad-eq2-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .ad-eq2-chips button { font: 700 13px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 999px; padding: 6px 12px; display: inline-flex; gap: 7px; align-items: center; cursor: pointer; white-space: nowrap; transition: background .2s, border-color .2s, color .2s; }
  .ad-eq2-chips button:hover { border-color: var(--ink); }
  .ad-eq2-chips button .n { font-size: 11.5px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--mute); }
  .ad-eq2-chips button.hot .n { background: var(--act); color: var(--ink); border-radius: 999px; padding: 0 6px; }
  .ad-eq2-chips button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .ad-eq2-chips button[aria-pressed="true"] .n { color: #fff; }
  .ad-eq2-chips button.hot[aria-pressed="true"] .n { color: var(--ink); }
  .ad-eq2 .a-search { max-width: 420px; }

  /* list */
  .ad-eq2 .a-split { grid-template-columns: minmax(0, 1fr) 440px; }
  .ad-eq2-list { overflow: hidden; }
  .ad-eq2-bulk { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 9px 14px; background: var(--pri-soft); color: var(--pri-ink); font-size: 13px; font-weight: 700; border-bottom: 1px solid var(--a-line); }
  .ad-eq2-bulk .sp { margin-left: auto; }
  .ad-eq2-lh { display: flex; align-items: center; gap: 10px; padding: 9px 14px 9px 0; border-bottom: 1px solid var(--a-line); font-size: 12px; font-weight: 700; color: var(--mute); }
  .ad-eq2-lh label { display: grid; place-items: center; width: 44px; }
  .ad-eq2-lh .sp { margin-left: auto; }
  .ad-eq2 input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--pri); cursor: pointer; margin: 0; }
  .ad-eq2-ul { list-style: none; margin: 0; padding: 0; }
  .ad-eq2-row { display: grid; grid-template-columns: 44px minmax(0, 1fr); border-top: 1px solid var(--a-line); transition: background .2s; }
  .ad-eq2-row:first-child { border-top: 0; }
  .ad-eq2-row[hidden] { display: none; }
  .ad-eq2-row:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .ad-eq2-row.picked { background: color-mix(in srgb, var(--act) 12%, var(--a-surf)); }
  .ad-eq2-row.on { background: var(--pri-soft); }
  .ad-eq2-row.dim .nm, .ad-eq2-row.dim .l2 { color: var(--mute); }
  .ad-eq2-row .pk { display: grid; justify-content: center; padding-top: 15px; cursor: pointer; }
  .ad-eq2-row .go { display: grid; gap: 5px; padding: 12px 14px 12px 0; text-align: left; background: none; border: 0; font: inherit; color: var(--ink); cursor: pointer; min-width: 0; }
  .ad-eq2-row .l1 { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
  .ad-eq2-row .nm { font-size: 14.5px; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .ad-eq2-row.unread .nm::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--pri); margin-right: 7px; vertical-align: 2px; }
  .ad-eq2-row .ref { color: var(--mute); font-size: 11.5px; white-space: nowrap; }
  .ad-eq2-row .val { margin-left: auto; font-weight: 800; font-size: 13.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ad-eq2-row .val small { font-weight: 600; color: var(--mute); font-size: 11.5px; margin-right: 3px; }
  .ad-eq2-row .l2 { font-size: 13px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ad-eq2-row .l3 { display: flex; gap: 4px; flex-wrap: wrap; }
  .ad-eq2-src.wa { color: var(--wa); background: color-mix(in srgb, var(--wa) 11%, var(--a-surf)); }
  .ad-eq2-foot { display: flex; gap: 8px 16px; flex-wrap: wrap; justify-content: space-between; padding: 10px 14px; border-top: 1px solid var(--a-line); font-size: 12px; color: var(--mute); font-weight: 600; }
  .ad-eq2-kb { display: flex; gap: 10px; flex-wrap: wrap; }
  .ad-eq2 kbd { font: 700 10.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-bottom-width: 2px; border-radius: 5px; padding: 0 5px; background: var(--bg2); color: var(--ink2); }

  /* panel */
  .ad-eq2-panel { min-width: 0; }
  .ad-eq2-panel.in > section { animation: ad-eq2-in .32s var(--ease) both; }
  .ad-eq2-back { display: none; justify-self: start; }
  .ad-eq2-ph .top { display: flex; gap: 8px; align-items: center; justify-content: space-between; font-size: 12px; color: var(--mute); font-weight: 700; flex-wrap: wrap; }
  .ad-eq2-ph h2 { font-size: 21px; letter-spacing: -.02em; margin: 0; }
  .ad-eq2-ph .trip { font-size: 13.5px; color: var(--ink2); }
  .ad-eq2-ph .trip b { font-variant-numeric: tabular-nums; }
  .ad-eq2-ph .chips { display: flex; gap: 4px; flex-wrap: wrap; }
  .ad-eq2-contact { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
  .ad-eq2-flash { margin: 10px var(--a-pad) 0; }
  .ad-eq2-flash[hidden] { display: none; }

  /* stepper */
  .ad-eq2-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.25fr); gap: 4px; }
  .ad-eq2-steps li { display: flex; gap: 4px; min-width: 0; }
  .ad-eq2-steps button { flex: 1; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px; font: 700 12.5px "DM Sans", sans-serif; padding: 7px 4px; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--mute); border-radius: 8px; cursor: pointer; white-space: nowrap; transition: background .2s, border-color .2s, color .2s; }
  .ad-eq2-steps button:hover { border-color: var(--ink); color: var(--ink); }
  .ad-eq2-steps button .ic { width: 12px; height: 12px; }
  .ad-eq2-steps button.done { background: var(--bg2); color: var(--ink2); }
  .ad-eq2-steps button[aria-pressed="true"] { background: var(--pri); border-color: var(--pri); color: #fff; }
  .ad-eq2-steps button.won[aria-pressed="true"] { background: var(--ok); border-color: var(--ok); }
  .ad-eq2-steps button.lost[aria-pressed="true"] { background: var(--ink2); border-color: var(--ink2); }
  .ad-eq2-lost { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; background: var(--bg2); border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .ad-eq2-lost .a-select { flex: 1 1 180px; min-width: 0; }
  .ad-eq2-hint { font-size: 12px; color: var(--mute); }

  /* convert */
  .ad-eq2-cv .a-btn.act { justify-content: center; }
  .ad-eq2-pre { display: grid; gap: 10px; background: color-mix(in srgb, var(--act) 9%, var(--a-surf)); border: 1px solid color-mix(in srgb, var(--act) 40%, var(--a-surf)); border-radius: 12px; padding: 12px; }
  .ad-eq2-pre h3 { margin: 0; font-size: 14px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ad-eq2-pre ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
  .ad-eq2-pre li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 2px 8px; align-items: start; font-size: 13px; }
  .ad-eq2-pre li .no { width: 20px; height: 20px; border-radius: 50%; background: var(--a-surf); border: 1px solid var(--a-line); display: grid; place-items: center; font-size: 11px; font-weight: 800; }
  .ad-eq2-pre li small { display: block; color: var(--mute); font-size: 11.5px; font-weight: 700; }
  .ad-eq2-pre .acts { display: flex; gap: 6px; flex-wrap: wrap; }

  /* follow-up */
  .ad-eq2-fu { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .ad-eq2-fu button { font: 700 12.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 999px; padding: 5px 11px; cursor: pointer; transition: background .2s, border-color .2s, color .2s; }
  .ad-eq2-fu button:hover { border-color: var(--ink); }
  .ad-eq2-fu button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .ad-eq2-fu input[type="date"] { font: 600 12.5px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 999px; padding: 4px 10px; background: var(--a-surf); color: var(--ink); }

  /* thread */
  .ad-eq2-th { display: grid; gap: 10px; max-height: 380px; overflow-y: auto; padding: 2px; align-content: start; }
  .ad-eq2-m { display: grid; gap: 3px; max-width: 90%; }
  .ad-eq2-m .meta { font-size: 11.5px; color: var(--mute); font-weight: 700; display: flex; gap: 5px; align-items: center; }
  .ad-eq2-m .bub { background: var(--bg2); border: 1px solid var(--a-line); border-radius: 4px 12px 12px 12px; padding: 9px 11px; font-size: 13.5px; line-height: 1.5; min-width: 0; overflow-wrap: anywhere; }
  .ad-eq2-m .tx { white-space: pre-line; }
  .ad-eq2-m.out { justify-self: end; } .ad-eq2-m.out .meta { justify-content: flex-end; }
  .ad-eq2-m.out .bub { background: var(--pri-soft); border-color: color-mix(in srgb, var(--pri) 22%, var(--a-surf)); border-radius: 12px 4px 12px 12px; }
  .ad-eq2-m.note { max-width: 100%; }
  .ad-eq2-m.note .meta { color: var(--warn); }
  .ad-eq2-m.note .bub { background: color-mix(in srgb, var(--act) 12%, var(--a-surf)); border: 1px dashed color-mix(in srgb, var(--act) 60%, var(--a-surf)); border-radius: 10px; }
  .ad-eq2-m .att { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 700; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 8px; padding: 3px 8px; margin-top: 6px; }
  .ad-eq2-m.fresh { animation: ad-eq2-in .35s var(--ease) both; }
  .ad-eq2-sys { justify-self: center; font-size: 11.5px; color: var(--mute); font-weight: 700; border: 1px solid var(--a-line); border-radius: 999px; padding: 2px 10px; text-align: center; }
  .ad-eq2-form { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 3px 12px; margin: 0 0 7px; font-size: 13px; }
  .ad-eq2-form dt { color: var(--mute); } .ad-eq2-form dd { margin: 0; font-weight: 700; }

  /* composer */
  .ad-eq2-comp { display: grid; gap: 8px; }
  .ad-eq2-comp .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-eq2-comp .a-seg button { display: inline-flex; gap: 5px; align-items: center; }
  .ad-eq2-comp .a-seg .ic { width: 13px; height: 13px; }
  .ad-eq2-comp .a-select { flex: 1 1 150px; min-width: 0; }
  .ad-eq2-comp .to { font-size: 12px; color: var(--mute); overflow-wrap: anywhere; }
  .ad-eq2-snips { display: flex; gap: 5px; flex-wrap: wrap; }
  .ad-eq2-snips button { font: 700 12px "DM Sans", sans-serif; border: 1px dashed var(--a-line); background: var(--a-surf); color: var(--ink2); border-radius: 999px; padding: 4px 10px; cursor: pointer; transition: border-color .2s, color .2s, transform .2s var(--ease); }
  .ad-eq2-snips button:hover { border-color: var(--pri); color: var(--pri); transform: translateY(-1px); }
  .ad-eq2-tx { font: 500 14px/1.5 "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 10px; padding: 9px 11px; min-height: 104px; resize: vertical; width: 100%; color: var(--ink); background: var(--a-surf); }
  .ad-eq2-tx:focus { outline: 2px solid var(--pri); outline-offset: 0; border-color: transparent; }
  .ad-eq2-comp.isnote .ad-eq2-tx { background: color-mix(in srgb, var(--act) 7%, var(--a-surf)); border-style: dashed; border-color: color-mix(in srgb, var(--act) 60%, var(--a-surf)); }
  .ad-eq2-comp .send { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ad-eq2-comp .send label { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .ad-eq2-comp .send .a-btn { margin-left: auto; }

  /* related */
  .ad-eq2-rel { display: grid; gap: 6px; font-size: 13px; }
  .ad-eq2-rel > div { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }

  /* phone dock */
  .ad-eq2-dock { display: none; }

  @keyframes ad-eq2-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .ad-eq2, .ad-eq2 * { animation: none !important; transition: none !important; } }

  @container site (max-width: 700px) {
    .ad-eq2[data-view="list"] .ad-eq2-panel { display: none; }
    .ad-eq2[data-view="panel"] .ad-eq2-list, .ad-eq2[data-view="panel"] .ad-eq2-filters, .ad-eq2[data-view="panel"] > .a-head { display: none; }
    .ad-eq2-chips { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
    .ad-eq2-chips button { flex: none; }
    .ad-eq2 .a-bar { flex-wrap: wrap; }
    .ad-eq2 .a-search { min-width: 0; max-width: none; flex: 1 1 100%; }
    .ad-eq2-kb, .ad-eq2-lh .kbh { display: none; }
    .ad-eq2-row .go { padding: 12px 12px 12px 0; }
    .ad-eq2-row .ref { display: none; }
    .ad-eq2-back { display: inline-flex; }
    .ad-eq2-contact { display: none; }
    .ad-eq2-th { max-height: none; }
    .ad-eq2-m { max-width: 94%; }
    .ad-eq2-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .ad-eq2-steps li.split { grid-column: 1 / -1; }
    .ad-eq2-panel { border-radius: var(--a-r); }
    .ad-eq2-dock { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; position: sticky; bottom: 0; z-index: 4; padding: 8px; background: var(--a-surf); border-top: 1px solid var(--a-line); border-radius: 0 0 var(--a-r) var(--a-r); box-shadow: 0 -12px 24px -20px rgba(20,32,42,.4); }
    .ad-eq2-dock .a-btn { flex-direction: column; gap: 2px; padding: 7px 4px; font-size: 12px; justify-content: center; }
  }`;

  /* ---------- render ---------- */
  const rowHtml = (e) => {
    const v = est(e);
    return `<li class="ad-eq2-row ${st.sel === e.ref ? 'on' : ''} ${needsReply(e) ? 'unread' : ''} ${isOpen(e) ? '' : 'dim'} ${st.picked.includes(e.ref) ? 'picked' : ''}" data-q2li="${e.ref}">
      <label class="pk"><input type="checkbox" data-q2pick="${e.ref}" ${st.picked.includes(e.ref) ? 'checked' : ''} aria-label="Select ${esc(e.name)}"></label>
      <button class="go" data-q2row="${e.ref}" aria-current="${st.sel === e.ref}">
        <span class="l1"><span class="nm">${esc(e.name)}</span><span class="ref mono">${e.ref}</span><span class="val">${v ? `<small>${e.status === 'won' ? 'booked' : 'est.'}</small>${lakh(v)}` : '<small>No trip yet</small>'}</span></span>
        <span class="l2">${esc(tripLine(e))}</span>
        <span class="l3">${srcChip(e)}${slaChip(e)}${stChip(e)}${fuChip(e)}</span>
      </button></li>`;
  };

  const convertBlock = (e) => {
    const p = e.pkg ? PKGS[e.pkg] : null;
    if (e.status === 'won') return `<section class="ad-eq2-cv"><h4 class="ad-eq2-h3">Booking</h4><span style="font-size:13.5px">${ic('check')} Won · converted to <a href="#" class="lnk mono">${e.booking}</a></span></section>`;
    const d = fitDate(e), pax = e.a + e.c;
    const pre = [
      ['1', 'Trip', p ? p.name : 'Not chosen yet', p ? 'ok' : 'warn', p ? 'Pre-filled' : 'You pick'],
      ['1', 'Departure', d ? `${d[0]} · ${d[1]} seats left` : e.month ? `${e.month} · no open date yet` : 'No month given', d ? 'ok' : 'warn', d ? 'Suggested' : 'You pick'],
      ['2', 'Party', `${party(e.a, e.c)}${d && pax > d[1] ? ' · more than the seats left' : ''}`, 'ok', 'Pre-filled'],
      ['4', 'Discounts', e.budget ? `Deal and early-bird apply by themselves · their budget ${inr(e.budget)} pp noted` : 'Deal and early-bird apply by themselves', 'mute', 'Automatic'],
      ['5', 'Customer', `${esc(e.name)} · +91 ${e.ph} · ${e.em}`, 'ok', e.past.length || e.others.length ? 'Matched' : 'New account'],
      ['7', 'Note on the booking', `From enquiry ${e.ref}${e.changes ? ` · ${esc(e.changes)}` : ''}`, 'ok', 'Pre-filled'],
    ];
    return `<section class="ad-eq2-cv">
      ${st.convert ? `<div class="ad-eq2-pre" id="eq2-pre"><h3>${ic('ticket', 16)}Convert to booking ${V25}</h3>
          <span class="ad-eq2-hint">Opens the counter booking wizard with this filled in. You check the live quote, then settle.</span>
          <ol>${pre.map(([n, k, v, tone, w]) => `<li><span class="no">${n}</span><span><small>${k}</small>${v}</span><span class="a-chip ${tone}">${w}</span></li>`).join('')}</ol>
          <span class="ad-eq2-hint">When the booking is saved this enquiry is marked Won and linked to it.</span>
          <div class="acts"><button class="a-btn act sm" data-q2go>${ic('arrowR')}Open counter booking</button><button class="a-btn ghost sm" data-q2noconv>Not now</button></div></div>`
        : `<button class="a-btn act" data-q2conv>${ic('ticket', 16)}Convert to booking <kbd>C</kbd></button>
          <span class="ad-eq2-hint">Pre-fills the counter wizard: trip${fitDate(e) ? `, ${fitDate(e)[0]}` : ''}, ${party(e.a, e.c)}, ${esc(first(e.name))}'s details. ${V25}</span>`}
    </section>`;
  };

  const panel = (e) => {
    if (!e) return '<section><div class="a-empty">Pick an enquiry to read it and reply here.</div></section>';
    const p = e.pkg ? PKGS[e.pkg] : null;
    const ph = e.ph.replace(/\s/g, '');
    const waText = encodeURIComponent(`Hi ${first(e.name)}, this is Viraj from Tripsmith about your enquiry ${e.ref}.`);
    const subj = `Your Tripsmith enquiry ${e.ref}${p ? ` · ${p.name}` : ''}`;
    const tel = `tel:+91${ph}`, wa = `https://wa.me/91${ph}?text=${waText}`, mail = `mailto:${e.em}?subject=${encodeURIComponent(subj)}`;
    const order = ['new', 'contacted', 'quoted'];
    const cur = order.indexOf(e.status);
    const T = thread(e);
    const draft = st.draft[e.ref + st.mode] ?? (st.mode === 'reply' ? `Hi ${first(e.name)},\n\n` : '');
    const fuSet = (iso) => e.fu === iso;
    return `
      <section class="ad-eq2-ph">
        <button class="a-btn ghost sm ad-eq2-back" data-q2back>${ic('chevL')}All enquiries</button>
        <div class="top"><span><span class="mono">${e.ref}</span> · received ${e.recv}</span>${srcChip(e)}</div>
        <h2>${esc(e.name)}</h2>
        <div class="trip">${esc(tripLine(e))}${est(e) ? ` · <b>${e.status === 'won' ? '' : 'about '}${inr(est(e))}</b>` : ''}</div>
        <div class="chips">${stChip(e)}${slaChip(e)}${fuChip(e)}</div>
        <div class="ad-eq2-contact"><a href="${tel}" class="a-btn sm">${ICON.phone}Call</a><a href="${wa}" target="_blank" rel="noopener" class="a-btn ghost sm">${ICON.wa}WhatsApp</a><a href="${mail}" class="a-btn ghost sm">${ICON.mail}Email</a></div>
      </section>
      <div class="a-note ad-eq2-flash" role="status" ${st.flash ? '' : 'hidden'}>${ICON.check}<span>${st.flash}</span></div>
      <section><h4 class="ad-eq2-h3">Stage<span class="r">${e.status === 'lost' ? 'Closed in the shipped app' : e.status === 'won' ? 'Converted in the shipped app' : ''}</span></h4>
        <ol class="ad-eq2-steps" aria-label="Stage">
          ${order.map((s, i) => `<li><button data-q2st="${s}" class="${cur > i || e.status === 'won' ? 'done' : ''}" aria-pressed="${e.status === s}">${cur > i || e.status === 'won' ? ic('check', 12) : ''}${STAGES[s][1]}${s === 'quoted' ? '*' : ''}</button></li>`).join('')}
          <li class="split"><button data-q2st="won" class="won" aria-pressed="${e.status === 'won'}">Won</button><button data-q2st="lost" class="lost" aria-pressed="${e.status === 'lost'}">Lost</button></li>
        </ol>
        ${st.lost ? `<div class="ad-eq2-lost"><label for="eq2-why">Why was it lost?</label><select class="a-select" id="eq2-why">${LOST_WHY.map((w) => `<option ${e.why === w ? 'selected' : ''}>${w}</option>`).join('')}</select><button class="a-btn sm" data-q2lost>Mark lost</button><button class="a-btn ghost sm" data-q2lostx>Cancel</button></div>` : ''}
        <span class="ad-eq2-hint">* Quoted is new in v2.5. Won comes from Convert to booking; Lost asks for a reason.</span></section>
      ${convertBlock(e)}
      ${isOpen(e) ? `<section><h4 class="ad-eq2-h3">Follow up<span class="r">${fuWord(e) || 'Not set'}</span></h4>
        <div class="ad-eq2-fu" role="group" aria-label="Follow-up date">
          <button data-q2fu="0" aria-pressed="${fuSet(isoAdd(0))}">Today</button><button data-q2fu="1" aria-pressed="${fuSet(isoAdd(1))}">Tomorrow</button><button data-q2fu="4" aria-pressed="${fuSet(isoAdd(4))}">${dayName(isoAdd(4))}</button>
          <input type="date" id="eq2-fu" value="${e.fu}" min="${isoAdd(0)}" aria-label="Pick a follow-up date">
          ${e.fu ? '<button data-q2fu="x">Clear</button>' : ''}</div></section>` : ''}
      <section><h4 class="ad-eq2-h3">Conversation<span class="r">${((n) => n === 1 ? "1 message" : n + " messages and notes")(T.filter((m) => m.k !== "sys").length)}</span></h4>
        <div class="ad-eq2-th" id="eq2-th" aria-live="polite">${T.map((m, i) => m.k === 'sys' ? `<div class="ad-eq2-sys">${m.body}</div>`
          : `<div class="ad-eq2-m ${m.k} ${st.fresh && i === T.length - 1 ? 'fresh' : ''}"><span class="meta">${m.k === 'in' ? `${esc(first(e.name))}${i === 0 ? ` · ${SRC[e.src][0].toLowerCase()}` : ''}` : m.k === 'note' ? `${ic('lock', 12)}Internal note · only you see this` : `You · ${m.via || 'email'}`} · ${m.t}</span><div class="bub">${m.body}${m.att ? `<div class="att">${ic('file', 13)}${esc(m.att)}</div>` : ''}</div></div>`).join('')}</div>
        <div class="ad-eq2-comp ${st.mode === 'note' ? 'isnote' : ''}">
          <div class="row"><div class="a-seg" role="group" aria-label="Write"><button data-q2mode="reply" aria-pressed="${st.mode === 'reply'}">${ICON.mail}Reply by email</button><button data-q2mode="note" aria-pressed="${st.mode === 'note'}">${ICON.lock}Internal note</button></div>
            ${st.mode === 'reply' ? `<select class="a-select" id="eq2-tpl" aria-label="Insert a template"><option value="">Template…</option>${Object.entries(TPLS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>` : ''}</div>
          ${st.mode === 'reply' ? `<span class="to">To ${e.em} · ${esc(subj)}</span><div class="ad-eq2-snips" aria-label="Quick replies">${SNIPS.map(([l], i) => `<button data-q2snip="${i}">+ ${l}</button>`).join('')}</div>` : ''}
          <label for="eq2-tx" style="position:absolute;left:-9999px">${st.mode === 'reply' ? 'Reply' : 'Internal note'}</label>
          <textarea class="ad-eq2-tx" id="eq2-tx" placeholder="${st.mode === 'reply' ? 'Write your reply' : 'Called, quoted, promised to…'}">${esc(draft)}</textarea>
          <div class="send">${st.mode === 'reply' && p ? `<label><input type="checkbox" id="eq2-att" ${st.att ? 'checked' : ''}>Attach itinerary PDF</label>` : ''}
            <span class="ad-eq2-hint"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span>
            <button class="a-btn sm ${st.mode === 'note' ? 'act' : ''}" data-q2send>${st.mode === 'reply' ? `${ICON.mail}Send reply` : `${ICON.lock}Save note`}</button></div>
        </div></section>
      <section><h4 class="ad-eq2-h3">Same customer<span class="r">+91 ${e.ph}</span></h4>
        <div class="ad-eq2-rel">
          <div><b style="font-size:12.5px">Past trips</b></div>
          ${e.past.length ? e.past.map(([r, pk, d, s]) => `<div><a href="#" class="lnk mono">${r}</a><span>${pk}</span><span class="muted">· ${d} · ${s}</span></div>`).join('') : '<div class="muted">No trips with us yet.</div>'}
          <div style="margin-top:4px"><b style="font-size:12.5px">Other enquiries from this number</b></div>
          ${e.others.length ? e.others.map(([r, pk, s, w]) => `<div><a href="#" class="lnk mono">${r}</a><span>${pk}</span><span class="muted">· ${s} · ${w}</span></div>`).join('') : '<div class="muted">None, this is the first.</div>'}
        </div></section>
      <div class="ad-eq2-dock" aria-label="Actions">
        <a href="${tel}" class="a-btn sm">${ICON.phone}Call</a><a href="${wa}" target="_blank" rel="noopener" class="a-btn ghost sm">${ICON.wa}WhatsApp</a>
        <button class="a-btn ghost sm" data-q2dock="reply">${ICON.mail}Reply</button>
        ${e.status === 'won' ? `<a href="#" class="a-btn ghost sm">${ICON.ticket}Booking</a>` : `<button class="a-btn act sm" data-q2conv>${ICON.ticket}Convert</button>`}
      </div>`;
  };

  const render = () => {
    const R = rows().filter(matchQ);
    const sel = eBy(st.sel);
    const cnt = (k) => ENQ.filter(CHIPS.find((c) => c[0] === k)[2]).length;
    const oldest = ENQ.filter(needsReply).reduce((m, e) => Math.max(m, e.wait), 0);
    const over = ENQ.filter((e) => needsReply(e) && e.wait >= TARGET).length;
    const allPicked = R.length && R.every((e) => st.picked.includes(e.ref));
    const main = `<div class="ad-eq2" data-view="${st.view}">
      <div class="a-head"><h1>Enquiries</h1>
        <div class="sub">${cnt('reply')} need a reply · ${over} over the 2 h target · ${cnt('today')} to follow up today${oldest ? ` · oldest waiting ${dur(oldest)}` : ''}</div>
        <div class="acts"><a href="#" class="a-btn ghost sm">${ICON.plus}Log a call or WhatsApp</a><a href="#" class="a-btn ghost sm">${ICON.down}Export CSV</a></div></div>
      <div class="ad-eq2-filters">
        <div class="ad-eq2-chips" role="group" aria-label="Saved filters">${CHIPS.map(([k, l]) => `<button data-q2chip="${k}" class="${k === 'reply' || k === 'today' ? 'hot' : ''}" aria-pressed="${st.chip === k}">${l} <span class="n">${cnt(k)}</span></button>`).join('')}</div>
        <div class="a-bar">
          <label class="a-search">${ICON.search}<input type="search" id="eq2-q" value="${esc(st.q)}" placeholder="Name, phone, ref or trip" aria-label="Search enquiries"></label>
          <div class="a-seg" role="group" aria-label="Sort"><button data-q2sort="wait" aria-pressed="${st.sort === 'wait'}">Longest waiting first</button><button data-q2sort="new" aria-pressed="${st.sort === 'new'}">Newest</button></div>
        </div>
      </div>
      <div class="a-split">
        <div class="a-card flush ad-eq2-list">
          ${st.picked.length ? `<div class="ad-eq2-bulk" role="region" aria-label="Bulk actions"><span>${st.picked.length} selected</span>
            <button class="a-btn sm" data-q2bulk="contacted">${ic('check')}Mark contacted</button><button class="a-btn ghost sm" data-q2bulk="0">Follow up today</button><button class="a-btn ghost sm" data-q2bulk="1">Follow up tomorrow</button>
            <button class="lnk sp" data-q2bulk="clear">Clear</button></div>`
          : `<div class="ad-eq2-lh"><label><input type="checkbox" data-q2all ${allPicked ? 'checked' : ''} aria-label="Select all shown"></label><span id="eq2-count">${R.length} shown</span><span class="sp kbh">Needs reply first, then follow-ups due</span></div>`}
          <ul class="ad-eq2-ul" aria-label="Enquiries">${R.map(rowHtml).join('') || '<li><div class="a-empty">Nothing here. Every enquiry in this view is answered.</div></li>'}</ul>
          <div class="ad-eq2-foot"><span>Latest ${ENQ.length} of 76 · page 1 of 7</span>
            <span class="ad-eq2-kb"><span><kbd>J</kbd> <kbd>K</kbd> move</span><span><kbd>R</kbd> reply</span><span><kbd>C</kbd> convert</span><span><kbd>F</kbd> follow up</span><span><kbd>X</kbd> select</span></span></div>
        </div>
        <aside class="a-panel ad-eq2-panel ${st.anim ? 'in' : ''}" aria-label="Selected enquiry">${panel(sel)}</aside>
      </div>
    </div>`;
    st.anim = false; st.fresh = 0;
    return TS.adminShell('Enquiries', main);
  };

  /* ---------- actions ---------- */
  const log = (e, k, body, extra = {}) => { e.log.push({ k, t: NOW_T, body, ...extra }); };
  const setStatus = (e, s, why = '') => {
    if (e.status === s && s !== 'lost') return;
    e.status = s; if (s !== 'new') e.wait = 0;
    if (s === 'lost') { e.why = why; e.fu = ''; e.fuT = ''; }
    log(e, 'sys', s === 'lost' ? `Marked lost · ${esc(why)}` : `Moved to ${STAGES[s][1]}`);
    st.flash = s === 'lost' ? `${esc(first(e.name))} marked lost · ${esc(why)}` : `${esc(first(e.name))} moved to ${STAGES[s][1]}`;
  };
  const setFu = (e, iso) => {
    e.fu = iso; e.fuT = '';
    if (iso) log(e, 'sys', `Follow-up set for ${dayDiff(iso) === 0 ? 'today' : dayName(iso)}`);
    st.flash = iso ? `${dayDiff(iso) === 0 ? `Follow up today · ${esc(first(e.name))} is in the Follow up today filter` : `Follow up on ${dayName(iso)}`}` : 'Follow-up cleared';
  };

  let cur = { site: null, rerender: null };
  const mount = (site, rerender) => {
    cur = { site, rerender };
    const $ = (s) => site.querySelector(s), $$ = (s) => site.querySelectorAll(s);
    const e = eBy(st.sel);
    const tx = $('#eq2-tx');
    const keep = () => { if (tx && e) st.draft[e.ref + st.mode] = tx.value; };
    const go = (fn) => (ev) => { if (ev) ev.preventDefault(); keep(); fn(ev); rerender(); };
    const pick = (ref) => { if (st.sel !== ref) { st.sel = ref; st.convert = false; st.lost = false; st.flash = ''; st.anim = true; } st.view = 'panel'; };

    $$('[data-q2chip]').forEach((b) => b.addEventListener('click', go(() => { st.chip = b.dataset.q2chip; st.picked = []; })));
    $$('[data-q2sort]').forEach((b) => b.addEventListener('click', go(() => { st.sort = b.dataset.q2sort; })));
    $$('[data-q2row]').forEach((b) => b.addEventListener('click', go(() => {
      pick(b.dataset.q2row);
      requestAnimationFrame(() => { const pn = site.querySelector('.ad-eq2-panel'); if (pn && site.clientWidth <= 700) pn.scrollIntoView({ block: 'start' }); });
    })));
    $$('[data-q2pick]').forEach((c) => c.addEventListener('change', go(() => {
      const r = c.dataset.q2pick; st.picked = c.checked ? [...st.picked, r] : st.picked.filter((x) => x !== r);
    })));
    const all = $('[data-q2all]');
    if (all) all.addEventListener('change', go(() => { st.picked = all.checked ? rows().filter(matchQ).map((x) => x.ref) : []; }));
    $$('[data-q2bulk]').forEach((b) => b.addEventListener('click', go(() => {
      const k = b.dataset.q2bulk, list = st.picked.map(eBy).filter(Boolean);
      if (k === 'contacted') {
        list.forEach((x) => { if (x.status === 'new') { x.status = 'contacted'; } x.wait = 0; x.answered = true; log(x, 'sys', 'Marked contacted'); });
        st.flash = `${list.length} marked contacted`;
      } else if (k !== 'clear') {
        list.forEach((x) => { if (isOpen(x)) { x.fu = isoAdd(Number(k)); x.fuT = ''; log(x, 'sys', `Follow-up set for ${k === '0' ? 'today' : dayName(isoAdd(1))}`); } });
        st.flash = `${list.length} set to follow up ${k === '0' ? 'today' : 'tomorrow'}`;
      }
      st.picked = [];
    })));
    const back = $('[data-q2back]'); if (back) back.addEventListener('click', go(() => { st.view = 'list'; }));

    if (!e) return;
    $$('[data-q2st]').forEach((b) => b.addEventListener('click', go(() => {
      const s = b.dataset.q2st;
      st.lost = false;
      if (s === 'won') { if (e.status !== 'won') st.convert = true; return; }
      if (s === 'lost') { st.lost = true; st.convert = false; return; }
      setStatus(e, s); if (s !== 'new') e.answered = true; else e.answered = false;
    })));
    const lost = $('[data-q2lost]');
    if (lost) lost.addEventListener('click', go(() => { setStatus(e, 'lost', $('#eq2-why').value); st.lost = false; }));
    const lostx = $('[data-q2lostx]'); if (lostx) lostx.addEventListener('click', go(() => { st.lost = false; }));
    $$('[data-q2conv]').forEach((b) => b.addEventListener('click', go(() => { st.convert = true; st.lost = false; st.view = 'panel'; })));
    const noc = $('[data-q2noconv]'); if (noc) noc.addEventListener('click', go(() => { st.convert = false; }));
    const cgo = $('[data-q2go]');
    if (cgo) cgo.addEventListener('click', go(() => {
      e.booking = 'TB-8NC2WQ'; e.status = 'won'; e.wait = 0; e.fu = ''; e.fuT = ''; e.answered = true;
      e.past = [['TB-8NC2WQ', e.pkg ? PKGS[e.pkg].name : 'Custom trip', fitDate(e) ? fitDate(e)[0] : 'Date to confirm', 'Awaiting payment']];
      log(e, 'sys', `Won · converted to booking ${e.booking} at the counter`);
      st.convert = false; st.fresh = 1;
      st.flash = `Counter wizard opened pre-filled. Saved as <b class="mono">TB-8NC2WQ</b>, so ${esc(first(e.name))} is now Won and linked.`;
    }));
    $$('[data-q2fu]').forEach((b) => b.addEventListener('click', go(() => { const k = b.dataset.q2fu; setFu(e, k === 'x' ? '' : isoAdd(Number(k))); })));
    const fu = $('#eq2-fu'); if (fu) fu.addEventListener('change', go(() => { if (fu.value && fu.value >= isoAdd(0)) setFu(e, fu.value); }));

    $$('[data-q2mode]').forEach((b) => b.addEventListener('click', go(() => { st.mode = b.dataset.q2mode; })));
    if (tx) {
      tx.addEventListener('input', keep);
      tx.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); const s = $('[data-q2send]'); if (s) s.click(); } });
    }
    const add = (text) => {
      const v = tx.value.replace(/\s+$/, '');
      tx.value = v && !/,$/.test(v) ? `${v} ${text}` : v ? `${v}\n\n${text}` : text;
      keep(); tx.focus(); tx.setSelectionRange(tx.value.length, tx.value.length);
    };
    $$('[data-q2snip]').forEach((b) => b.addEventListener('click', () => add(SNIPS[Number(b.dataset.q2snip)][1](e))));
    const tpl = $('#eq2-tpl');
    if (tpl) tpl.addEventListener('change', () => { if (!tpl.value) return; tx.value = TPLS[tpl.value][1](e); keep(); tpl.value = ''; tx.focus(); });
    const att = $('#eq2-att'); if (att) att.addEventListener('change', () => { st.att = att.checked; });
    const send = $('[data-q2send]');
    if (send) send.addEventListener('click', () => {
      const body = tx.value.trim();
      if (!body || body === `Hi ${first(e.name)},`) { tx.focus(); return; }
      if (st.mode === 'reply') {
        log(e, 'out', `<span class="tx">${esc(body)}</span>`, { via: 'email', att: st.att && e.pkg ? `${PKGS[e.pkg].name} itinerary.pdf` : '' });
        e.wait = 0; e.answered = false;
        if (e.status === 'new') { e.status = 'contacted'; st.flash = `Sent to ${esc(e.em)} · moved to Contacted`; } else st.flash = `Sent to ${esc(e.em)}`;
      } else { log(e, 'note', `<span class="tx">${esc(body)}</span>`); st.flash = 'Note saved · only you see it'; }
      st.draft[e.ref + st.mode] = ''; st.fresh = 1;
      rerender();
      const th = site.querySelector('#eq2-th'); if (th) th.scrollTop = th.scrollHeight;
    });

    const q = $('#eq2-q');
    if (q) q.addEventListener('input', () => {
      st.q = q.value.trim(); let n = 0;
      site.querySelectorAll('[data-q2li]').forEach((li) => { const ok = matchQ(eBy(li.dataset.q2li)); li.hidden = !ok; if (ok) n++; });
      const c = site.querySelector('#eq2-count'); if (c) c.textContent = `${n} shown`;
    });
    const th = $('#eq2-th'); if (th) th.scrollTop = th.scrollHeight;
  };

  /* keyboard: one document listener, active only while this variant is on screen */
  const onKey = (ev) => {
    const { site, rerender } = cur;
    if (!site || !site.isConnected || !site.querySelector('.ad-eq2')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) { if (ev.key === 'Escape') t.blur(); return; }
    const k = ev.key.toLowerCase();
    const list = rows().filter(matchQ), i = list.findIndex((x) => x.ref === st.sel);
    const e = eBy(st.sel);
    const keepDraft = () => { const tx = site.querySelector('#eq2-tx'); if (tx && e) st.draft[e.ref + st.mode] = tx.value; };
    const focus = (sel) => { const el = site.querySelector(sel); if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); } };
    if (k === 'j' || k === 'k') {
      const n = list[Math.min(list.length - 1, Math.max(0, i + (k === 'j' ? 1 : -1)))]; if (!n) return;
      ev.preventDefault(); keepDraft();
      if (n.ref !== st.sel) { st.sel = n.ref; st.convert = false; st.lost = false; st.flash = ''; st.anim = true; }
      rerender(); focus(`[data-q2row="${n.ref}"]`);
    } else if (k === 'r' && e) {
      ev.preventDefault(); keepDraft(); st.mode = 'reply'; st.view = 'panel'; rerender(); focus('#eq2-tx');
    } else if (k === 'c' && e && e.status !== 'won') {
      ev.preventDefault(); keepDraft(); st.convert = true; st.lost = false; st.view = 'panel'; rerender(); focus('[data-q2go]');
    } else if (k === 'f' && e && isOpen(e)) {
      ev.preventDefault(); keepDraft(); st.view = 'panel'; rerender(); focus('#eq2-fu');
    } else if (k === 'x' && e) {
      ev.preventDefault(); keepDraft(); st.picked = st.picked.includes(e.ref) ? st.picked.filter((x) => x !== e.ref) : [...st.picked, e.ref]; rerender(); focus(`[data-q2row="${e.ref}"]`);
    } else if (k === 'escape') {
      if (st.convert || st.lost) { st.convert = false; st.lost = false; rerender(); } else if (st.view === 'panel') { st.view = 'list'; rerender(); }
    }
  };
  if (!window.__adEq2Keys && typeof document.addEventListener === 'function') { document.addEventListener('keydown', onKey); window.__adEq2Keys = true; }

  /* ---------- register, right after A ---------- */
  TS.addVariants('enquiries', [{
    id: 'A2', name: 'Refined A', render, mount,
    note: 'Same bones as A: list on the left, longest waiting first, the enquiry in a panel on the right, the same twelve people. What changed: <b>rows you can scan</b> instead of a seven-column table, each with trip, month and party, where it came from (form, callback, WhatsApp, concierge), how long they have waited against a <b>2-hour first-reply target</b> in words and colour, the stage and a rough value in rupees. Status tabs become <b>saved filter chips</b> for the jobs of the day (New, Needs reply, Follow up today, Quoted, Won, Lost) with counts. The panel reads as a <b>conversation</b> (their form, your emails, dashed internal notes) with the composer under it: quick-reply snippets and templates that drop in the price from and the next dates with seats left. Status becomes a <b>stepper</b> (New, Contacted, a new Quoted, then Won or Lost with a reason), a follow-up date lands the enquiry in Follow up today, and <b>Convert to booking</b> shows exactly what it pre-fills in the counter wizard. Past trips and other enquiries from the same number sit at the bottom. J and K move, R replies, C converts, F sets a follow-up, X selects for the bulk bar. On a phone it is list first, then the enquiry full screen with a back button and a sticky Call, WhatsApp, Reply, Convert bar.',
    tradeoff: 'The rows are taller than A’s table, so about eight enquiries show at once instead of twelve, and sorting by package or type moves into search and Reports.',
  }], css);
  const scr = TS.SCREENS.find((x) => x.id === 'enquiries');
  scr.variants.splice(1, 0, scr.variants.pop());
})();

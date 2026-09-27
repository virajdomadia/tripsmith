/* Admin kit + five admin styles (A Ink rail · B Command · C Operator · D Studio · E Night desk).
   Every admin screen is written ONCE with the kit classes below and TS.adminShell(active, html);
   the global "Admin style" switch sets data-dir on .adm and restyles all of them.

   KIT (use only these for admin chrome; screen-specific CSS may add layout on top):
   .a-head > h1 + .sub + .acts            page header (title, one-line context, actions)
   .a-btn[.act|.ghost|.sm|.danger]         buttons: cobalt primary · marigold action · ghost · small · danger
   .a-card > .a-card-h (h2 + .acts) + .a-card-b     a surface; .a-card.flush has no body padding (tables)
   .a-kpis > .a-kpi > .k (label) .v (value, .num) .d(.up|.down) (delta/context)
   .a-tw > table.a-table   th/td; td.num / th.num right-aligned; tr.sel selected; tr.dim muted
   .a-chip.ok|.warn|.bad|.info|.mute|.pri  status pill (always with a word, never colour alone)
   .a-tabs > button[aria-selected=true] (+ .ct count)
   .a-bar > .a-search (input + icon) .a-select .a-seg (segmented: button[aria-pressed])
   .a-field > label + input|select|textarea + .hint|.err ; .a-row2 / .a-row3 field grids
   .a-split  list (left) + .a-panel detail (right, sticky)
   .a-tl > .a-tl-i (.t time, .w who, .x text)   timeline
   .a-meter[style="--v:62%"] (+ .held segment via --h)   fill bar
   .a-kv > div > dt + dd                    label/value list
   .a-empty                                 empty state
   .a-note                                  inline notice (info)

   E is a DARK style: it redefines the kit + product tokens (--ink is light there). Screen CSS should colour
   with tokens only; where a module hard-codes a light colour (#fff, #FDECEA…) or uses var(--ink) as a fill,
   the "E · module overrides" block at the end of this file re-tints it — add a line there for new cases.
*/
(() => {
  const { ICON } = window.TS;
  const NAV = [
    ['Dashboard', 'grid'], ['Calendar', 'cal', 'new'], ['Bookings', 'ticket', 3], ['Enquiries', 'inbox', 5],
    ['Packages', 'pkg'], ['Destinations', 'pin'], ['Reviews', 'quote', 2], ['Coupons', 'percent'], ['Reports', 'chart', 'new'],
  ];
  const NAV_E = [['Today', ['Dashboard', 'Calendar']], ['Sell', ['Bookings', 'Enquiries', 'Coupons']],
    ['Catalogue', ['Packages', 'Destinations', 'Reviews']], ['Insight', ['Reports']]];
  const KEY_E = { Dashboard: 'D', Calendar: 'C', Bookings: 'B', Enquiries: 'E', Coupons: 'O', Packages: 'P', Destinations: 'T', Reviews: 'V', Reports: 'R' };
  const badge = (c) => (c === 'new' ? '<span class="nw">NEW</span>' : c ? `<span class="ct num">${c}</span>` : '');
  const TODAY_STRIP = `<div class="a-today" aria-label="Today">
      <span class="lab">Sun 27 Sep</span>
      <span><b class="num">2</b> departures this week</span>
      <span><b class="num">3</b> holds expire today</span>
      <span><b class="num">₹1.18 L</b> balances due in 7 days</span>
      <span><b class="num">9</b> travellers missing details</span>
      <span class="live"><i></i>Live</span></div>`;

  const shells = {
    A: (active, main) => `<aside class="sb"><a class="logo" href="#"><i></i>Tripsmith</a><nav>${NAV.map(([l, ic, c]) =>
        `<a href="#" class="nv ${l === active ? 'on' : ''}">${ICON[ic]}<span class="lbl">${l}</span>${badge(c)}</a>`).join('')}</nav>
        <a href="#" class="nv view">${ICON.eye}<span class="lbl">View site</span></a>
        <div class="who"><i>VD</i><span><b>Viraj D.</b>Owner</span></div></aside><div class="main">${main}</div>`,
    B: (active, main) => `<aside class="sb"><a class="logo" href="#" aria-label="Tripsmith"><i></i></a><nav>${NAV.map(([l, ic, c]) =>
        `<a href="#" class="nv ${l === active ? 'on' : ''}" title="${l}">${ICON[ic]}<span class="lbl">${l}</span>${c && c !== 'new' ? `<span class="dot num">${c}</span>` : ''}</a>`).join('')}</nav>
        <div class="who"><i>VD</i></div></aside>
        <div class="col"><div class="tb"><div class="crumb">Admin <span>/</span> <b>${active}</b></div>
          <label class="gsearch">${ICON.search}<input id="adm-gsearch" placeholder="Search bookings, people, packages" aria-label="Search"><kbd>Ctrl K</kbd></label>
          ${active === 'Bookings' ? '' : `<a href="#" class="a-btn sm act">${ICON.plus}New booking</a>`}<span class="bell" aria-label="3 alerts">${ICON.info}<i></i></span></div>
          <div class="main">${main}</div></div>`,
    C: (active, main) => `<div class="col"><header class="tn"><a class="logo" href="#"><i></i>Tripsmith <small>Operator</small></a><nav>${NAV.map(([l, ic, c]) =>
        `<a href="#" class="nv ${l === active ? 'on' : ''}">${l}${c && c !== 'new' ? ` <span class="ct num">${c}</span>` : ''}</a>`).join('')}</nav>
        <span class="who"><i>VD</i></span></header>${TODAY_STRIP}<div class="main">${main}</div></div>`,
    // D · Studio: floating sidebar card on a tinted canvas, greeting bar, next-departure photo card
    D: (active, main) => `<aside class="sb"><a class="logo" href="#"><i></i>Tripsmith</a><nav>${NAV.map(([l, ic, c]) =>
        `<a href="#" class="nv ${l === active ? 'on' : ''}">${ICON[ic]}<span class="lbl">${l}</span>${badge(c)}</a>`).join('')}</nav>
        <a href="#" class="nx"><span class="ph"><img src="img/kasol-1.jpg" alt="Riverside camp at Kasol"></span>
          <small>Next out · Fri 2 Oct</small><b>Kasol Riverside Weekend</b>
          <span class="a-meter" style="--v:80%;--h:10%" aria-hidden="true"></span><em><span class="num">16</span> of 20 booked · <span class="num">2</span> held</em></a>
        <div class="who"><i>VD</i><span><b>Viraj D.</b>Owner</span></div></aside>
        <div class="col"><div class="tb"><div class="hi"><small>Sunday, 27 September</small><b>Namaste, Viraj</b></div>
          <label class="gsearch">${ICON.search}<input placeholder="Search bookings, people, packages" aria-label="Search"></label>
          ${active === 'Bookings' ? '' : `<a href="#" class="a-btn act sm">${ICON.plus}New booking</a>`}</div>
          <div class="main">${main}</div></div>`,
    // E · Night desk: dark mode, grouped nav with go-to shortcuts, status bar
    E: (active, main) => `<aside class="sb"><a class="logo" href="#"><i></i>Tripsmith <small>Night desk</small></a>
        <label class="gsearch">${ICON.search}<input placeholder="Jump to…" aria-label="Jump to"><kbd>/</kbd></label>
        <div class="navs">${NAV_E.map(([g, items]) => `<p class="gh">${g}</p><nav aria-label="${g}">${items.map((l) => {
          const [, ic, c] = NAV.find((n) => n[0] === l);
          return `<a href="#" class="nv ${l === active ? 'on' : ''}">${ICON[ic]}<span class="lbl">${l}</span>${badge(c)}<kbd>G ${KEY_E[l]}</kbd></a>`;
        }).join('')}</nav>`).join('')}</div>
        <div class="who"><i>VD</i><span><b>Viraj D.</b>Owner · on shift</span></div></aside>
        <div class="col"><div class="main">${main}</div>
          <footer class="stb" aria-label="Status"><span class="live"><i></i>Live</span>
            <span><b class="num">3</b> holds expire today</span><span><b class="num">2</b> departures this week</span>
            <span><b class="num">₹1.18 L</b> due in 7 days</span><span class="clk num">Sun 27 Sep · 21:40 IST</span></footer></div>`,
  };

  window.TS.adminDir = 'A';
  window.TS.adminShell = (active, main) => {
    const d = window.TS.adminDir;
    return `<div class="adm" data-dir="${d}">${shells[d](active, main)}</div>`;
  };

  const css = `
  /* ---------- kit: shared geometry ---------- */
  .adm { --a-bg: var(--bg2); --a-surf: #fff; --a-line: var(--line); --a-r: 16px; --a-pad: 18px; --a-fs: 14px; --a-th: #5E6B76;
    --ink-soft: #B9C3CC; --ink-line: #2A3945; min-height: 780px; background: var(--a-bg); font-size: var(--a-fs); }
  .adm .main { padding: 22px 28px 44px; display: grid; gap: 18px; align-content: start; min-width: 0; }
  .adm .logo i { width: 26px; height: 26px; }
  .a-head { display: flex; align-items: end; gap: 10px 16px; flex-wrap: wrap; }
  .a-head h1 { font-size: 26px; }
  .a-head .sub { color: var(--mute); font-size: 14px; font-weight: 600; flex-basis: 100%; order: 3; margin-top: -4px; }
  .a-head .acts { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
  .a-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 15px; border-radius: 10px; font: 700 13.5px "DM Sans", sans-serif; border: 1.5px solid transparent;
    background: var(--pri); color: #fff; text-decoration: none; cursor: pointer; white-space: nowrap; transition: background .2s, border-color .2s, transform .2s var(--ease); }
  .a-btn:hover { background: var(--pri-ink); }
  .a-btn:active { transform: translateY(1px); }
  .a-btn .ic { width: 16px; height: 16px; }
  .a-btn.act { background: var(--act); color: var(--ink); } .a-btn.act:hover { background: var(--act-ink); }
  .a-btn.ghost { background: var(--a-surf); color: var(--ink); border-color: var(--a-line); } .a-btn.ghost:hover { border-color: var(--ink); }
  .a-btn.danger { background: var(--a-surf); color: #B42318; border-color: #F3C9C4; }
  .a-btn.sm { padding: 6px 11px; font-size: 12.5px; border-radius: 8px; }
  .a-btn[disabled] { opacity: .45; pointer-events: none; }
  .a-card { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); min-width: 0; }
  .a-card-h { display: flex; align-items: center; gap: 10px; padding: 14px var(--a-pad) 0; flex-wrap: wrap; }
  .a-card-h h2 { font-size: 16px; letter-spacing: -.02em; }
  .a-card-h .acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
  .a-card-b { padding: 14px var(--a-pad) var(--a-pad); }
  .a-card.flush .a-card-b { padding: 10px 0 0; }
  .a-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  .a-kpi { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); padding: 14px 16px; display: grid; gap: 4px; }
  .a-kpi .k { font-size: 12px; font-weight: 700; color: var(--mute); letter-spacing: .02em; }
  .a-kpi .v { font-size: 26px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
  .a-kpi .d { font-size: 12.5px; font-weight: 600; color: var(--mute); } .a-kpi .d.up { color: var(--ok); } .a-kpi .d.down { color: #B42318; }
  .a-tw { overflow-x: auto; }
  .a-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .a-table th { text-align: left; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--a-th); font-weight: 700; padding: 8px 12px; border-bottom: 1px solid var(--a-line); white-space: nowrap; }
  .a-table td { padding: 11px 12px; border-bottom: 1px solid var(--a-line); vertical-align: middle; }
  .a-table th:first-child, .a-table td:first-child { padding-left: var(--a-pad); } .a-table th:last-child, .a-table td:last-child { padding-right: var(--a-pad); }
  .a-table tr:last-child td { border-bottom: 0; }
  .a-table tbody tr:hover { background: color-mix(in srgb, var(--pri) 4%, transparent); }
  .a-table tr.sel { background: var(--pri-soft); } .a-table tr.dim td { color: var(--mute); }
  .a-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .a-table td b { font-weight: 700; } .a-table td small { display: block; color: var(--mute); font-size: 12px; }
  .a-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; background: #EEF0F2; color: #4D5A65; }
  .a-chip.ok { background: var(--ok-soft); color: var(--ok); } .a-chip.warn { background: var(--warn-soft); color: var(--warn); }
  .a-chip.bad { background: #FDECEA; color: #B42318; } .a-chip.info, .a-chip.pri { background: var(--pri-soft); color: var(--pri-ink); }
  .a-chip .ic { width: 12px; height: 12px; }
  .a-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--a-line); }
  .a-tabs button { font: 700 13.5px "DM Sans", sans-serif; background: none; border: 0; padding: 9px 12px 11px; color: var(--mute); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: inline-flex; gap: 6px; align-items: center; }
  .a-tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--pri); }
  .a-tabs .ct { background: var(--act); color: var(--ink); border-radius: 999px; font-size: 11px; padding: 0 6px; }
  .a-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .a-search { display: flex; align-items: center; gap: 8px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 10px; padding: 0 10px; min-width: 220px; flex: 1 1 220px; max-width: 360px; }
  .a-search .ic { width: 16px; height: 16px; color: var(--mute); }
  .a-search input { border: 0; outline: 0; font: 500 13.5px "DM Sans", sans-serif; padding: 9px 0; width: 100%; background: transparent; color: var(--ink); }
  .a-select { font: 600 13px "DM Sans", sans-serif; border: 1px solid var(--a-line); background: var(--a-surf); border-radius: 10px; padding: 8px 10px; color: var(--ink); }
  .a-seg { display: inline-flex; border: 1px solid var(--a-line); border-radius: 10px; overflow: hidden; background: var(--a-surf); }
  .a-seg button { font: 700 12.5px "DM Sans", sans-serif; background: none; border: 0; padding: 7px 11px; cursor: pointer; color: var(--mute); }
  .a-seg button + button { border-left: 1px solid var(--a-line); }
  .a-seg button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .a-field { display: grid; gap: 5px; min-width: 0; }
  .a-field label { font-size: 12.5px; font-weight: 700; }
  .a-field input, .a-field select, .a-field textarea { font: 500 14px "DM Sans", sans-serif; border: 1px solid var(--a-line); border-radius: 10px; padding: 9px 11px; background: var(--a-surf); color: var(--ink); width: 100%; }
  .a-field textarea { min-height: 84px; resize: vertical; }
  .a-field input:focus, .a-field select:focus, .a-field textarea:focus { outline: 2px solid var(--pri); outline-offset: 0; border-color: transparent; }
  .a-field .hint { font-size: 12px; color: var(--mute); } .a-field .err { font-size: 12px; color: #B42318; font-weight: 600; }
  .a-row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .a-row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .a-split { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
  .a-panel { background: var(--a-surf); border: 1px solid var(--a-line); border-radius: var(--a-r); position: sticky; top: 12px; display: grid; }
  .a-panel > section { padding: 14px var(--a-pad); border-top: 1px solid var(--a-line); display: grid; gap: 8px; }
  .a-panel > section:first-child { border-top: 0; }
  .a-tl { display: grid; gap: 0; }
  .a-tl-i { display: grid; grid-template-columns: 74px 16px minmax(0, 1fr); gap: 0 10px; font-size: 13px; padding-bottom: 12px; position: relative; }
  .a-tl-i::before { content: ""; grid-column: 2; grid-row: 1 / span 2; width: 9px; height: 9px; border-radius: 50%; background: var(--pri); margin: 5px auto 0; box-shadow: 0 0 0 3px var(--pri-soft); }
  .a-tl-i::after { content: ""; position: absolute; left: calc(74px + 10px + 7.5px); top: 18px; bottom: 0; width: 1px; background: var(--a-line); }
  .a-tl-i:last-child::after { display: none; }
  .a-tl-i .t { color: var(--mute); font-size: 12px; font-variant-numeric: tabular-nums; grid-row: 1 / span 2; }
  .a-tl-i .w { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); }
  .a-tl-i .x { grid-column: 3; }
  .a-meter { --v: 50%; --h: 0%; height: 8px; border-radius: 99px; background: #E6EBEF; position: relative; overflow: hidden; }
  .a-meter::before { content: ""; position: absolute; inset: 0 auto 0 0; width: calc(var(--v) + var(--h)); background: color-mix(in srgb, var(--act) 70%, #fff); border-radius: inherit; }
  .a-meter::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--v); background: var(--pri); border-radius: inherit; }
  .a-kv { display: grid; gap: 8px; margin: 0; }
  .a-kv > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; }
  .a-kv dt { color: var(--mute); } .a-kv dd { margin: 0; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .a-empty { text-align: center; color: var(--mute); padding: 30px 16px; font-size: 14px; }
  .a-note { display: flex; gap: 10px; background: var(--pri-soft); color: var(--pri-ink); border-radius: 12px; padding: 10px 12px; font-size: 13px; }
  .a-note .ic { width: 16px; height: 16px; margin-top: 2px; }

  /* ---------- A · Ink rail (evolved from today's shell) ---------- */
  .adm[data-dir="A"] { display: grid; grid-template-columns: 236px minmax(0, 1fr); }
  .adm[data-dir="A"] .sb { background: var(--ink); color: var(--ink-soft); padding: 18px 14px; display: flex; flex-direction: column; gap: 3px; }
  .adm[data-dir="A"] .sb nav { display: grid; gap: 2px; }
  .adm[data-dir="A"] .sb .logo { color: #fff; margin: 0 8px 18px; font-size: 18px; }
  .adm[data-dir="A"] .sb a.nv { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none; color: var(--ink-soft); }
  .adm[data-dir="A"] .sb a.nv:hover { background: rgba(255,255,255,.06); color: #fff; }
  .adm[data-dir="A"] .sb a.nv.on { background: var(--pri); color: #fff; }
  .adm[data-dir="A"] .sb a.nv .ct { margin-left: auto; background: var(--act); color: var(--ink); border-radius: 999px; font-size: 11px; font-weight: 800; padding: 1px 7px; }
  .adm[data-dir="A"] .sb a.nv .nw { margin-left: auto; font-size: 10px; font-weight: 800; letter-spacing: .08em; color: var(--act); }
  .adm[data-dir="A"] .sb .view { margin-top: auto; }
  .adm[data-dir="A"] .sb .who { border-top: 1px solid var(--ink-line); padding: 12px 10px 0; display: flex; gap: 10px; align-items: center; font-size: 13px; }
  .adm .who i { width: 32px; height: 32px; border-radius: 50%; background: var(--act); color: var(--ink); display: inline-grid; place-items: center; font-style: normal; font-weight: 800; font-size: 12px; flex: none; }
  .adm[data-dir="A"] .sb .who b { color: #fff; display: block; }

  /* ---------- B · Command (icon rail + top bar, dense) ---------- */
  .adm[data-dir="B"] { --a-bg: #fff; --a-surf: #fff; --a-r: 10px; --a-pad: 14px; --a-fs: 13.5px; --a-line: #E6EAEE;
    display: grid; grid-template-columns: 76px minmax(0, 1fr); }
  .adm[data-dir="B"] .sb { background: var(--bg2); border-right: 1px solid var(--a-line); display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 6px; }
  .adm[data-dir="B"] .sb .logo { margin-bottom: 14px; }
  .adm[data-dir="B"] .sb nav { display: grid; gap: 2px; width: 100%; }
  .adm[data-dir="B"] .sb a.nv { display: grid; justify-items: center; gap: 3px; padding: 8px 2px; border-radius: 10px; text-decoration: none; color: var(--mute); font-size: 10.5px; font-weight: 700; position: relative; }
  .adm[data-dir="B"] .sb a.nv .ic { width: 20px; height: 20px; }
  .adm[data-dir="B"] .sb a.nv:hover { color: var(--ink); background: #fff; }
  .adm[data-dir="B"] .sb a.nv.on { color: var(--pri); background: #fff; box-shadow: 0 1px 0 var(--a-line), 0 0 0 1px var(--a-line); }
  .adm[data-dir="B"] .sb .dot { position: absolute; top: 3px; right: 12px; background: var(--act); color: var(--ink); font-size: 10px; font-weight: 800; border-radius: 99px; padding: 0 5px; }
  .adm[data-dir="B"] .sb .who { margin-top: auto; }
  .adm[data-dir="B"] .col { display: grid; grid-template-rows: auto 1fr; min-width: 0; }
  .adm[data-dir="B"] .tb { display: flex; align-items: center; gap: 12px; padding: 10px 24px; border-bottom: 1px solid var(--a-line); position: sticky; top: 0; background: rgba(255,255,255,.92); backdrop-filter: blur(8px); z-index: 5; }
  .adm[data-dir="B"] .crumb { font-size: 13px; color: var(--mute); white-space: nowrap; } .adm[data-dir="B"] .crumb b { color: var(--ink); } .adm[data-dir="B"] .crumb span { margin: 0 4px; }
  .adm[data-dir="B"] .gsearch { margin-left: auto; display: flex; align-items: center; gap: 8px; background: var(--bg2); border: 1px solid var(--a-line); border-radius: 10px; padding: 0 8px 0 10px; width: min(420px, 40%); }
  .adm[data-dir="B"] .gsearch .ic { width: 16px; height: 16px; color: var(--mute); }
  .adm[data-dir="B"] .gsearch input { border: 0; background: none; outline: 0; font: 500 13px "DM Sans", sans-serif; padding: 8px 0; width: 100%; color: var(--ink); }
  .adm[data-dir="B"] .gsearch kbd { font: 700 11px "DM Sans", sans-serif; color: var(--mute); border: 1px solid var(--a-line); border-radius: 6px; padding: 1px 5px; background: #fff; white-space: nowrap; }
  .adm[data-dir="B"] .bell { position: relative; color: var(--mute); display: grid; } .adm[data-dir="B"] .bell i { position: absolute; top: -1px; right: -1px; width: 7px; height: 7px; border-radius: 50%; background: var(--act); }
  .adm[data-dir="B"] .main { padding: 18px 24px 40px; gap: 14px; }
  .adm[data-dir="B"] .a-head h1 { font-size: 22px; }
  .adm[data-dir="B"] .a-kpi { padding: 10px 14px; } .adm[data-dir="B"] .a-kpi .v { font-size: 22px; }
  .adm[data-dir="B"] .a-table td { padding: 8px 10px; } .adm[data-dir="B"] .a-table th { padding: 7px 10px; background: var(--bg2); }
  .adm[data-dir="B"] .a-card { box-shadow: none; }
  .adm[data-dir="B"] .a-split { grid-template-columns: minmax(0, 1fr) 400px; }

  /* ---------- C · Operator (top nav + live Today strip, hairline sections) ---------- */
  .adm[data-dir="C"] { --a-bg: #fff; --a-surf: #fff; --a-r: 8px; --a-pad: 0px; --a-line: #E1E6EA; }
  .adm[data-dir="C"] .col { display: grid; min-width: 0; align-content: start; }
  .adm[data-dir="C"] .tn { background: var(--ink); color: var(--ink-soft); display: flex; align-items: center; gap: 18px; padding: 0 24px; min-height: 54px; flex-wrap: wrap; }
  .adm[data-dir="C"] .tn .logo { color: #fff; font-size: 17px; } .adm[data-dir="C"] .tn .logo small { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--act); font-weight: 800; margin-left: 4px; }
  .adm[data-dir="C"] .tn nav { display: flex; gap: 2px; flex-wrap: wrap; }
  .adm[data-dir="C"] .tn a.nv { color: var(--ink-soft); text-decoration: none; font-weight: 700; font-size: 13.5px; padding: 17px 10px 15px; border-bottom: 3px solid transparent; }
  .adm[data-dir="C"] .tn a.nv:hover { color: #fff; } .adm[data-dir="C"] .tn a.nv.on { color: #fff; border-bottom-color: var(--act); }
  .adm[data-dir="C"] .tn .ct { color: var(--act); font-weight: 800; }
  .adm[data-dir="C"] .tn .who { margin-left: auto; }
  .adm[data-dir="C"] .a-today { display: flex; gap: 8px 22px; flex-wrap: wrap; align-items: center; padding: 9px 24px; background: #FFF7EA; border-bottom: 1px solid #F3DDB5; font-size: 13px; color: var(--ink2); }
  .adm[data-dir="C"] .a-today .lab { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--warn); }
  .adm[data-dir="C"] .a-today b { color: var(--ink); }
  .adm[data-dir="C"] .a-today .live { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; font-weight: 700; color: var(--ok); }
  .adm[data-dir="C"] .a-today .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); animation: a-pulse 2s infinite; }
  @keyframes a-pulse { 50% { opacity: .3; } }
  .adm[data-dir="C"] .main { padding: 22px 24px 44px; gap: 26px; }
  .adm[data-dir="C"] .a-head { border-bottom: 1px solid var(--a-line); padding-bottom: 14px; }
  .adm[data-dir="C"] .a-head h1 { font-size: 24px; }
  .adm[data-dir="C"] .a-card { border: 0; border-radius: 0; }
  .adm[data-dir="C"] .a-card-h { border-bottom: 2px solid var(--ink); padding: 0 0 8px; }
  .adm[data-dir="C"] .a-card-h h2 { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
  .adm[data-dir="C"] .a-card-b { padding: 12px 0 0; }
  .adm[data-dir="C"] .a-kpis { gap: 0; border: 1px solid var(--a-line); border-radius: 8px; overflow: hidden; }
  .adm[data-dir="C"] .a-kpi { border: 0; border-radius: 0; border-left: 1px solid var(--a-line); margin-left: -1px; }
  .adm[data-dir="C"] .a-table th { padding-left: 8px; padding-right: 8px; } .adm[data-dir="C"] .a-table td { padding: 10px 8px; }
  .adm[data-dir="C"] .a-table th:first-child, .adm[data-dir="C"] .a-table td:first-child { padding-left: 0; }
  .adm[data-dir="C"] .a-panel { border-radius: 8px; --a-pad: 16px; }

  /* ---------- D · Studio (floating sidebar card on a tinted canvas, big type, soft layered surfaces) ---------- */
  .adm[data-dir="D"] { --a-bg: #EDF1F8; --a-surf: #fff; --a-line: #E3E8F0; --a-r: 22px; --a-pad: 22px; --a-fs: 15px; --a-th: #5E6B76;
    --d-sh: 0 1px 2px rgba(20,32,42,.04), 0 14px 34px -20px rgba(27,52,110,.22); --d-well: #E5EAF4;
    display: grid; grid-template-columns: 236px minmax(0, 1fr); gap: 0 10px; padding: 16px;
    background: radial-gradient(900px 420px at 88% -8%, #DFE7FA, transparent 62%), radial-gradient(700px 380px at -10% 110%, #FBEFD9, transparent 60%), var(--a-bg); }
  .adm[data-dir="D"] .sb { position: sticky; top: 16px; align-self: start; min-height: 748px; background: #fff; border-radius: 26px; box-shadow: var(--d-sh);
    padding: 20px 14px 14px; display: flex; flex-direction: column; gap: 4px; }
  .adm[data-dir="D"] .sb .logo { margin: 0 10px 18px; font-size: 19px; }
  .adm[data-dir="D"] .sb nav { display: grid; gap: 2px; }
  .adm[data-dir="D"] .sb a.nv { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px; font-size: 14.5px; font-weight: 600; color: var(--ink2); text-decoration: none; transition: background .2s, color .2s; }
  .adm[data-dir="D"] .sb a.nv .ic { width: 19px; height: 19px; color: var(--mute); }
  .adm[data-dir="D"] .sb a.nv:hover { background: var(--bg2); color: var(--ink); }
  .adm[data-dir="D"] .sb a.nv.on { background: var(--pri-soft); color: var(--pri-ink); font-weight: 800; }
  .adm[data-dir="D"] .sb a.nv.on .ic { color: var(--pri); }
  .adm[data-dir="D"] .sb a.nv .ct { margin-left: auto; background: var(--act); color: var(--ink); border-radius: 999px; font-size: 11.5px; font-weight: 800; padding: 1px 8px; }
  .adm[data-dir="D"] .sb a.nv .nw { margin-left: auto; font-size: 10px; font-weight: 800; letter-spacing: .08em; color: var(--pri); background: var(--pri-soft); border-radius: 99px; padding: 2px 7px; }
  .adm[data-dir="D"] .sb a.nv.on .nw { background: #fff; }
  .adm[data-dir="D"] .nx { margin-top: auto; display: grid; gap: 3px; padding: 8px 8px 12px; border-radius: 20px; background: var(--bg2); text-decoration: none; color: var(--ink); transition: transform .3s var(--ease); }
  .adm[data-dir="D"] .nx:hover { transform: translateY(-2px); }
  .adm[data-dir="D"] .nx .ph { height: 96px; border-radius: 14px; margin-bottom: 6px; }
  .adm[data-dir="D"] .nx small { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--warn); padding: 0 4px; }
  .adm[data-dir="D"] .nx b { font-size: 14.5px; letter-spacing: -.02em; padding: 0 4px; }
  .adm[data-dir="D"] .nx .a-meter { height: 6px; margin: 6px 4px 2px; background: #fff; }
  .adm[data-dir="D"] .nx em { font-style: normal; font-size: 12px; color: var(--mute); font-weight: 600; padding: 0 4px; }
  .adm[data-dir="D"] .sb .who { display: flex; gap: 10px; align-items: center; padding: 12px 8px 2px; font-size: 13px; color: var(--mute); }
  .adm[data-dir="D"] .sb .who b { display: block; color: var(--ink); }
  .adm[data-dir="D"] .col { display: grid; grid-template-rows: auto 1fr; min-width: 0; }
  .adm[data-dir="D"] .tb { display: flex; align-items: center; gap: 12px; padding: 8px 6px 4px 22px; }
  .adm[data-dir="D"] .tb .hi { display: grid; line-height: 1.25; margin-right: auto; }
  .adm[data-dir="D"] .tb .hi small { font-size: 13px; color: var(--mute); font-weight: 600; }
  .adm[data-dir="D"] .tb .hi b { font-size: 17px; letter-spacing: -.02em; }
  .adm[data-dir="D"] .gsearch { display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 999px; padding: 0 16px; width: min(380px, 42%); box-shadow: var(--d-sh); }
  .adm[data-dir="D"] .gsearch .ic { width: 17px; height: 17px; color: var(--mute); }
  .adm[data-dir="D"] .gsearch input { border: 0; background: none; outline: 0; font: 500 14px "DM Sans", sans-serif; padding: 11px 0; width: 100%; color: var(--ink); }
  .adm[data-dir="D"] .gsearch:focus-within { box-shadow: 0 0 0 2px var(--pri), var(--d-sh); }
  .adm[data-dir="D"] .tb .a-btn { border-radius: 999px; padding: 10px 16px; font-size: 13.5px; }
  .adm[data-dir="D"] .main { padding: 18px 6px 44px 22px; gap: 22px; }
  .adm[data-dir="D"] .a-head h1 { font-size: 34px; letter-spacing: -.04em; }
  .adm[data-dir="D"] .a-head .sub { font-size: 15px; font-weight: 500; }
  .adm[data-dir="D"] .a-card, .adm[data-dir="D"] .a-kpi, .adm[data-dir="D"] .a-panel { border-color: transparent; box-shadow: var(--d-sh); }
  .adm[data-dir="D"] .a-card-h { padding-top: 18px; } .adm[data-dir="D"] .a-card-h h2 { font-size: 18px; }
  .adm[data-dir="D"] .a-kpis { gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .adm[data-dir="D"] .a-kpi { padding: 18px 20px; gap: 6px; }
  .adm[data-dir="D"] .a-kpi .k { font-size: 13px; letter-spacing: 0; }
  .adm[data-dir="D"] .a-kpi .v { font-size: 32px; letter-spacing: -.04em; }
  .adm[data-dir="D"] .a-btn { border-radius: 12px; padding: 10px 17px; font-size: 14px; }
  .adm[data-dir="D"] .a-btn.sm { border-radius: 10px; padding: 7px 12px; font-size: 13px; }
  .adm[data-dir="D"] .a-btn.ghost { border-color: var(--a-line); box-shadow: 0 1px 2px rgba(20,32,42,.05); }
  .adm[data-dir="D"] .a-table { font-size: 14px; }
  .adm[data-dir="D"] .a-table th { text-transform: none; letter-spacing: 0; font-size: 12.5px; padding: 10px 14px; }
  .adm[data-dir="D"] .a-table td { padding: 14px; border-bottom-color: #EEF1F6; }
  .adm[data-dir="D"] .a-table tbody tr:hover { background: #F6F8FD; }
  .adm[data-dir="D"] .a-chip { font-size: 12px; padding: 4px 10px; }
  .adm[data-dir="D"] .a-tabs { border-bottom: 0; background: var(--d-well); padding: 4px; border-radius: 14px; gap: 2px; width: max-content; max-width: 100%; }
  .adm[data-dir="D"] .a-tabs button { border: 0; margin: 0; padding: 7px 13px; border-radius: 10px; color: var(--ink2); }
  .adm[data-dir="D"] .a-tabs button[aria-selected="true"] { background: #fff; color: var(--ink); box-shadow: 0 1px 3px rgba(20,32,42,.12); }
  .adm[data-dir="D"] .ops-q .a-tabs { margin: 0 var(--a-pad) 8px; }
  .adm[data-dir="D"] .a-seg { border: 0; background: var(--d-well); padding: 3px; border-radius: 12px; gap: 2px; }
  .adm[data-dir="D"] .a-seg button { border-radius: 9px; color: var(--ink2); }
  .adm[data-dir="D"] .a-seg button + button { border-left: 0; }
  .adm[data-dir="D"] .a-seg button[aria-pressed="true"] { background: #fff; color: var(--ink); box-shadow: 0 1px 3px rgba(20,32,42,.12); }
  .adm[data-dir="D"] .a-search, .adm[data-dir="D"] .a-select { border-radius: 12px; border-color: transparent; box-shadow: 0 1px 2px rgba(20,32,42,.06), 0 0 0 1px var(--a-line); }
  .adm[data-dir="D"] .a-field input, .adm[data-dir="D"] .a-field select, .adm[data-dir="D"] .a-field textarea { background: #F6F8FC; border-color: #E1E7F0; border-radius: 12px; padding: 11px 13px; font-size: 14.5px; }
  .adm[data-dir="D"] .a-field input:focus, .adm[data-dir="D"] .a-field select:focus, .adm[data-dir="D"] .a-field textarea:focus { background: #fff; }
  .adm[data-dir="D"] .a-field label { font-size: 13px; }
  .adm[data-dir="D"] .a-panel { top: 16px; }
  .adm[data-dir="D"] .a-panel > section { border-top-color: #EEF1F6; padding: 18px var(--a-pad); }
  .adm[data-dir="D"] .a-note { border-radius: 14px; padding: 12px 14px; }
  .adm[data-dir="D"] .a-meter { background: var(--d-well); }
  .adm[data-dir="D"] .cat-li { background: transparent; padding: 0; }
  .adm[data-dir="D"] .cat-li .cat-li-body { gap: 16px; }
  .adm[data-dir="D"] .cat-li .cat-li-photo { border-radius: 26px; box-shadow: var(--d-sh); }
  .adm[data-dir="D"] .cat-li .cat-li-form { background: #fff; border-radius: 26px; padding: 36px 32px; box-shadow: var(--d-sh); width: min(440px, 100%); }
  .adm[data-dir="D"] .cat-li .cat-li-form h1 { font-size: 34px; letter-spacing: -.04em; }

  /* ---------- E · Night desk (full dark mode) ----------
     Contrast on the surface #141D26: ink 14.9:1 · ink2 10.4:1 · mute 6.5:1 · pri #7C9CFA 6.5:1 · ok 7.2:1 · warn 7.8:1 · bad 6.9:1.
     Filled cobalt is --e-fill #3461E8 with white text (5.2:1; 3.6:1 against the canvas). Field borders #5B6C7B are 3.1:1. */
  .adm[data-dir="E"] { --a-bg: #0C131A; --a-surf: #141D26; --a-line: #243240; --a-r: 14px; --a-th: #93A2B0;
    --bg: #141D26; --bg2: #1A2530; --ink: #E7ECF1; --ink2: #C2CCD6; --mute: #93A2B0; --line: #243240;
    --pri: #7C9CFA; --pri-ink: #B4C6FF; --pri-soft: #1C2A4D; --act: #F2A93B; --act-ink: #FFBE5C;
    --ok: #5CC68E; --ok-soft: #13301F; --warn: #F3A86B; --warn-soft: #3A2616; --star: #F2B24E;
    --ink-soft: #B6C2CD; --ink-line: #243240;
    --e-fill: #3461E8; --e-fill-h: #3F6BEE; --e-on: #0C131A; --e-raise: #253442; --e-field: #0F171F; --e-fline: #5B6C7B;
    --e-bad: #FF8F85; --e-bad-soft: #3D1A1A; --e-track: #22303B; --e-side: #080E13;
    display: grid; grid-template-columns: 236px minmax(0, 1fr); color: var(--ink); color-scheme: dark; }
  .adm[data-dir="E"] ::placeholder { color: #7D8A96; }
  .adm[data-dir="E"] .sb { background: var(--e-side); border-right: 1px solid #1B2631; padding: 16px 12px 12px; display: flex; flex-direction: column; gap: 10px; color: var(--ink-soft); }
  .adm[data-dir="E"] .sb .logo { color: #fff; font-size: 17px; margin: 0 6px 4px; flex-wrap: wrap; gap: 4px 10px; }
  .adm[data-dir="E"] .sb .logo i { background: var(--e-fill); }
  .adm[data-dir="E"] .sb .logo small { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--act); font-weight: 800; }
  .adm[data-dir="E"] .gsearch { display: flex; align-items: center; gap: 8px; background: var(--a-surf); border: 1px solid var(--a-line); border-radius: 10px; padding: 0 6px 0 10px; }
  .adm[data-dir="E"] .gsearch:focus-within { border-color: var(--pri); }
  .adm[data-dir="E"] .gsearch .ic { width: 15px; height: 15px; color: var(--mute); }
  .adm[data-dir="E"] .gsearch input { border: 0; background: none; outline: 0; font: 500 13px "DM Sans", sans-serif; padding: 8px 0; width: 100%; min-width: 0; color: var(--ink); }
  .adm[data-dir="E"] .sb kbd { font: 700 10.5px "DM Sans", sans-serif; color: #8392A0; border: 1px solid #2A3845; border-bottom-width: 2px; border-radius: 5px; padding: 0 5px; white-space: nowrap; background: transparent; }
  .adm[data-dir="E"] .navs { display: grid; gap: 2px; }
  .adm[data-dir="E"] .navs .gh { margin: 10px 8px 4px; font-size: 10.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #75869A; }
  .adm[data-dir="E"] .navs nav { display: grid; gap: 1px; }
  .adm[data-dir="E"] .sb a.nv { display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 10px; border-radius: 8px; font-size: 13.5px; font-weight: 600; color: var(--ink-soft); text-decoration: none; transition: background .2s, color .2s; }
  .adm[data-dir="E"] .sb a.nv .ic { width: 17px; height: 17px; color: #75869A; }
  .adm[data-dir="E"] .sb a.nv kbd { margin-left: auto; opacity: 0; transition: opacity .2s; }
  .adm[data-dir="E"] .sb a.nv:hover { background: #111A22; color: #fff; } .adm[data-dir="E"] .sb a.nv:hover kbd { opacity: 1; }
  .adm[data-dir="E"] .sb a.nv.on { background: linear-gradient(90deg, rgba(124,156,250,.2), rgba(124,156,250,.05)); color: #fff; box-shadow: inset 2px 0 0 var(--pri); }
  .adm[data-dir="E"] .sb a.nv.on .ic { color: var(--pri); } .adm[data-dir="E"] .sb a.nv.on kbd { opacity: 1; }
  .adm[data-dir="E"] .sb a.nv .ct { margin-left: auto; background: var(--act); color: var(--e-on); border-radius: 999px; font-size: 11px; font-weight: 800; padding: 0 7px; }
  .adm[data-dir="E"] .sb a.nv .ct + kbd { margin-left: 0; }
  .adm[data-dir="E"] .sb a.nv .nw { margin-left: auto; font-size: 9.5px; font-weight: 800; letter-spacing: .1em; color: var(--act); }
  .adm[data-dir="E"] .sb a.nv .nw + kbd { margin-left: 0; }
  .adm[data-dir="E"] .sb .who { margin-top: auto; border-top: 1px solid #1B2631; padding: 12px 6px 0; display: flex; gap: 10px; align-items: center; font-size: 12.5px; }
  .adm[data-dir="E"] .sb .who b { display: block; color: #fff; font-size: 13px; }
  .adm[data-dir="E"] .col { display: grid; grid-template-rows: 1fr auto; min-width: 0; }
  .adm[data-dir="E"] .main { padding: 24px 28px 40px; }
  .adm[data-dir="E"] .stb { position: sticky; bottom: 0; z-index: 6; display: flex; align-items: center; gap: 6px 20px; flex-wrap: wrap; padding: 7px 20px; background: var(--e-side); border-top: 1px solid #1B2631; font-size: 12px; color: var(--mute); }
  .adm[data-dir="E"] .stb b { color: var(--act); font-weight: 800; }
  .adm[data-dir="E"] .stb .live { display: inline-flex; gap: 6px; align-items: center; font-weight: 800; color: var(--ok); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
  .adm[data-dir="E"] .stb .live::before { display: none; }
  .adm[data-dir="E"] .stb .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); animation: a-pulse 2s infinite; }
  .adm[data-dir="E"] .stb .clk { margin-left: auto; }
  .adm[data-dir="E"] .who i { color: var(--e-on); }
  /* E · kit re-tints */
  .adm[data-dir="E"] .a-head h1 { color: #fff; }
  .adm[data-dir="E"] .a-card, .adm[data-dir="E"] .a-kpi, .adm[data-dir="E"] .a-panel { box-shadow: inset 0 1px 0 rgba(255,255,255,.03); }
  .adm[data-dir="E"] .a-kpi .v { color: #fff; }
  .adm[data-dir="E"] .a-kpi .d.down, .adm[data-dir="E"] .a-field .err { color: var(--e-bad); }
  .adm[data-dir="E"] .a-btn { background: var(--e-fill); color: #fff; }
  .adm[data-dir="E"] .a-btn:hover { background: var(--e-fill-h); }
  .adm[data-dir="E"] .a-btn.act { background: var(--act); color: var(--e-on); } .adm[data-dir="E"] .a-btn.act:hover { background: var(--act-ink); }
  .adm[data-dir="E"] .a-btn.ghost { background: transparent; color: var(--ink); border-color: #34434F; } .adm[data-dir="E"] .a-btn.ghost:hover { border-color: var(--ink2); background: #1A2530; }
  .adm[data-dir="E"] .a-btn.danger { background: transparent; color: var(--e-bad); border-color: #5A2C2A; }
  .adm[data-dir="E"] .a-chip { background: #22303B; color: var(--ink2); }
  .adm[data-dir="E"] .a-chip.ok { background: var(--ok-soft); color: var(--ok); } .adm[data-dir="E"] .a-chip.warn { background: var(--warn-soft); color: var(--warn); }
  .adm[data-dir="E"] .a-chip.bad { background: var(--e-bad-soft); color: var(--e-bad); }
  .adm[data-dir="E"] .a-chip.info, .adm[data-dir="E"] .a-chip.pri { background: var(--pri-soft); color: var(--pri-ink); }
  .adm[data-dir="E"] .a-table th { background: #111922; }
  .adm[data-dir="E"] .a-table tbody tr:hover { background: rgba(124,156,250,.06); }
  .adm[data-dir="E"] .a-table tr.sel { background: var(--pri-soft); }
  .adm[data-dir="E"] .a-tabs .ct { background: var(--act); color: var(--e-on); }
  .adm[data-dir="E"] .a-seg button[aria-pressed="true"] { background: var(--e-fill); color: #fff; }
  .adm[data-dir="E"] .a-search, .adm[data-dir="E"] .a-select, .adm[data-dir="E"] .a-seg { background: var(--e-field); border-color: #34434F; }
  .adm[data-dir="E"] .a-field input, .adm[data-dir="E"] .a-field select, .adm[data-dir="E"] .a-field textarea { background: var(--e-field); border-color: var(--e-fline); color: var(--ink); }
  .adm[data-dir="E"] .a-field input:focus, .adm[data-dir="E"] .a-field select:focus, .adm[data-dir="E"] .a-field textarea:focus { outline-color: var(--pri); }
  .adm[data-dir="E"] .a-meter { background: var(--e-track); }
  .adm[data-dir="E"] .a-meter::before { background: color-mix(in srgb, var(--act) 60%, var(--a-surf)); }
  .adm[data-dir="E"] .a-note { background: var(--pri-soft); color: var(--pri-ink); }
  .adm[data-dir="E"] .ts-av { box-shadow: 0 0 0 2px var(--a-surf); }
  .adm[data-dir="E"] .ph { background: #1F2A34; }
  .adm[data-dir="E"] .stars > span.off, .adm[data-dir="E"] .stars .off { color: #3A4854; }
  .adm[data-dir="E"] kbd { color: var(--mute); }
  .adm[data-dir="E"] [style*="#B42318"] { color: var(--e-bad) !important; }
  .adm[data-dir="E"] .logo { color: var(--pri); }
  /* E · module overrides (calendar · counter · reports · ops · catalog hard-code light fills or use --ink as a fill) */
  .adm[data-dir="E"] .cal { --st-open: #E9A94B; --st-low: #FF8F85; }
  .adm[data-dir="E"] .cal-leg i.hh { background: repeating-linear-gradient(135deg, var(--mute) 0 2px, var(--a-surf) 2px 4px); }
  .adm[data-dir="E"] .cal-wl, .adm[data-dir="E"] .ga-dn em, .adm[data-dir="E"] .gb-days span.today { color: var(--e-on); }
  .adm[data-dir="E"] .cal-bar { background: color-mix(in srgb, var(--c) 22%, var(--e-track)); }
  .adm[data-dir="E"] .cal-bar i.h, .adm[data-dir="E"] .ag-seats i.h { background: repeating-linear-gradient(135deg, var(--c) 0 2px, color-mix(in srgb, var(--c) 30%, var(--a-surf)) 2px 4px); }
  .adm[data-dir="E"] .ga-c.out .ga-dn, .adm[data-dir="E"] .ga-c.past .ga-dn { color: #7D8A96; }
  .adm[data-dir="E"] .ga-chip[aria-pressed="true"], .adm[data-dir="E"] .gb-bar[aria-pressed="true"],
  .adm[data-dir="E"] .ga-chip[aria-pressed="true"] .w, .adm[data-dir="E"] .gb-bar[aria-pressed="true"] .w { color: var(--e-on); }
  .adm[data-dir="E"] .ga-chip[aria-pressed="true"] .cal-bar, .adm[data-dir="E"] .gb-bar[aria-pressed="true"] .cal-bar { background: rgba(12,19,26,.25); }
  .adm[data-dir="E"] .ga-chip[aria-pressed="true"] .cal-bar i, .adm[data-dir="E"] .gb-bar[aria-pressed="true"] .cal-bar i { background: var(--e-on); }
  .adm[data-dir="E"] .ga-chip[aria-pressed="true"] .cal-bar i.h, .adm[data-dir="E"] .gb-bar[aria-pressed="true"] .cal-bar i.h { background: repeating-linear-gradient(135deg, var(--e-on) 0 2px, rgba(12,19,26,.3) 2px 4px); }
  .adm[data-dir="E"] .ag-seats i { background: var(--e-track); }
  .adm[data-dir="E"] .hm-d { background: color-mix(in srgb, var(--e-fill) var(--f), var(--a-surf)); }
  .adm[data-dir="E"] .hm-tot { background: color-mix(in srgb, var(--ink) calc(var(--f) * .45), var(--a-surf)); }
  .adm[data-dir="E"] .hm-tot.dk { background: color-mix(in srgb, var(--ink) min(100%, calc(var(--f) * 1.1)), var(--a-surf)); color: var(--e-on); }
  .adm[data-dir="E"] .ctr-sw i, .adm[data-dir="E"] .cat-sw i { background: #E7ECF1; }
  .adm[data-dir="E"] .ctr-il.bad .it small { color: var(--e-bad); }
  .adm[data-dir="E"] .ctr-sn { background: var(--pri-soft); color: var(--pri-ink); }
  .adm[data-dir="E"] .ctr-av, .adm[data-dir="E"] .cat-day .n { background: var(--e-raise); color: #fff; }
  .adm[data-dir="E"] .ctr-stp button:disabled { color: #4A5866; }
  .adm[data-dir="E"] .ctr-sw, .adm[data-dir="E"] .cat-sw { background: #3A4A58; }
  .adm[data-dir="E"] .ctr-sw[aria-checked="true"] { background: var(--e-fill); } .adm[data-dir="E"] .cat-sw[aria-checked="true"] { background: #2E9D63; }
  .adm[data-dir="E"] .ctr-bk .hint .err, .adm[data-dir="E"] .ctr-ql .bad dt small, .adm[data-dir="E"] .ctr-rl .bad small { color: var(--e-bad); }
  .adm[data-dir="E"] .ctr-go kbd { background: rgba(255,255,255,.3); border-color: rgba(12,19,26,.25); color: var(--e-on); }
  .adm[data-dir="E"] .ctr-call, .adm[data-dir="E"] .ctr-ledger { background: var(--e-side); border: 1px solid #2A3845; }
  .adm[data-dir="E"] .ctr-ledger { box-shadow: 0 -12px 30px -12px rgba(0,0,0,.6); }
  .adm[data-dir="E"] .ctr-ledger .dep, .adm[data-dir="D"] .ctr-ledger .dep { background: none; border-width: 0 0 0 1px; border-radius: 0; cursor: default; padding: 0 0 0 14px; width: auto; grid-template-columns: none; }
  .adm[data-dir="E"] .ctr-lw { bottom: 38px; }
  .adm[data-dir="E"] .ctr-rb { background: color-mix(in srgb, var(--act) 7%, var(--a-surf)); border-top-color: var(--act); }
  .adm[data-dir="E"] .ctr-rb p b { color: var(--e-on); }
  .adm[data-dir="E"] .ctr-rail .past .dot { color: var(--e-on); }
  .adm[data-dir="E"] .ctr-rc { background: #1A222B; border-color: #2E3A45; box-shadow: 0 24px 40px -24px rgba(0,0,0,.7); }
  .adm[data-dir="E"] .ctr-rc::after { background: linear-gradient(-45deg, transparent 7px, #1A222B 0) 0 0 / 14px 10px repeat-x, linear-gradient(45deg, transparent 7px, #1A222B 0) 0 0 / 14px 10px repeat-x; }
  .adm[data-dir="E"] .ctr-rc header, .adm[data-dir="E"] .ctr-rl { border-color: #3A4652; }
  .adm[data-dir="E"] .ctr-rl i { border-bottom-color: #3A4652; }
  .adm[data-dir="E"] .ctr-stamp { border-color: var(--e-bad); color: var(--e-bad); background: rgba(26,34,43,.88); }
  .adm[data-dir="E"] .ctr-stamp.ok { border-color: var(--ok); color: var(--ok); }
  .adm[data-dir="E"] .rpt { --c1: #7C9CFA; --c2: #E0A04A; --rg: #202C36; --rbase: #3A4854; --rband: #182439; --rhov: rgba(255,255,255,.05); --rtrack: var(--e-track); }
  .adm[data-dir="E"] .rpt .rsvg .ar { fill-opacity: .22; }
  .adm[data-dir="E"] .rpt .rdate input { color-scheme: dark; }
  .adm[data-dir="E"] .rpt .rtip { box-shadow: 0 12px 30px -10px rgba(0,0,0,.7); }
  .adm[data-dir="E"] .rpt.dark .a-seg button[aria-pressed="true"] { color: #fff; }
  .adm[data-dir="E"] .ops-legend i.h { background: color-mix(in srgb, var(--act) 60%, var(--a-surf)); }
  .adm[data-dir="E"] .ops-legend i.f { background: var(--e-track); }
  .adm[data-dir="E"] .ops-flag.bad .n, .adm[data-dir="E"] .ops-next.bad .eyeb, .adm[data-dir="E"] .ops-wait.long { color: var(--e-bad); }
  .adm[data-dir="E"] .ops-next.bad::before { background: var(--e-bad); }
  .adm[data-dir="E"] .ops-step.bad { background: var(--e-bad-soft); border-color: color-mix(in srgb, var(--e-bad) 30%, transparent); }
  .adm[data-dir="E"] .ops-tlf button[aria-pressed="true"] { background: var(--e-fill); border-color: var(--e-fill); color: #fff; }
  .adm[data-dir="E"] .cat-rules li.ok .ic { color: var(--e-on); }
  .adm[data-dir="E"] .cat-rules li.no .ic { color: var(--e-bad); background: var(--e-bad-soft); }
  .adm[data-dir="E"] .cat-guard { border-color: color-mix(in srgb, var(--warn) 35%, transparent); }
  .adm[data-dir="E"] .cat-pills button[aria-pressed="true"] { background: var(--e-fill); border-color: var(--e-fill); color: #fff; }
  .adm[data-dir="E"] .cat-day .meals i, .adm[data-dir="E"] .cat-mo i { color: #6F7D8A; }
  .adm[data-dir="E"] .cat-ladder li::before { border-color: #4A5866; }
  .adm[data-dir="E"] .cat-ladder li.on::before { border-color: var(--act); }
  .adm[data-dir="E"] .cat-dcard .pos { color: var(--e-on); }
  .adm[data-dir="E"] .cat-dcard.sel { box-shadow: inset 0 0 0 1px var(--pri), 0 10px 24px -14px rgba(124,156,250,.45); }
  .adm[data-dir="E"] .cat-savebar { box-shadow: 0 12px 30px -14px rgba(0,0,0,.7); bottom: 46px; }
  .adm[data-dir="E"] .cat-li-mock { background: rgba(20,29,38,.94); border-color: #4A5866; color: var(--ink2); }
  .adm[data-dir="E"] .cat-li { background: radial-gradient(700px 400px at 80% 20%, rgba(52,97,232,.16), transparent 65%), var(--a-bg); }
  .adm[data-dir="E"] .cat-li .cat-li-photo { margin: 16px 0 16px 16px; border-radius: 18px; }
  .adm[data-dir="E"] .cat-li .cat-li-form .logo { color: #fff; }
  .adm[data-dir="E"] .cat-li .cat-li-form h1 { color: #fff; }


  /* D: keep wide tables inside the card at desktop width */
  .adm[data-dir="D"] .a-split { grid-template-columns: minmax(0, 1fr) 330px; }
  .adm[data-dir="D"] .a-table { font-size: 13.5px; } .adm[data-dir="D"] .a-table td:first-child { white-space: nowrap; }
  .adm[data-dir="D"] .a-table td { padding: 10px 9px; } .adm[data-dir="D"] .a-table th { padding: 8px 9px; }
  /* ---------- phone (all styles) ---------- */
  @container site (max-width: 700px) {
    .adm[data-dir="A"], .adm[data-dir="B"] { grid-template-columns: 1fr; }
    .adm[data-dir="A"] .sb { flex-direction: row; flex-wrap: wrap; padding: 10px; }
    .adm[data-dir="A"] .sb nav { display: flex; flex-wrap: wrap; }
    .adm[data-dir="A"] .sb .logo { margin: 0 6px 0 4px; }
    .adm[data-dir="A"] .sb a.nv { padding: 6px 9px; font-size: 12.5px; }
    .adm[data-dir="A"] .sb a.nv:not(.on) .lbl, .adm[data-dir="A"] .sb .who, .adm[data-dir="A"] .sb .view { display: none; }
    .adm[data-dir="B"] .sb { order: 2; flex-direction: row; position: sticky; bottom: 0; padding: 4px; border-right: 0; border-top: 1px solid var(--a-line); z-index: 6; }
    .adm[data-dir="B"] .sb .logo, .adm[data-dir="B"] .sb .who { display: none; }
    .adm[data-dir="B"] .sb nav { display: flex; overflow-x: auto; }
    .adm[data-dir="B"] .sb a.nv { min-width: 64px; }
    .adm[data-dir="B"] .tb { padding: 8px 12px; } .adm[data-dir="B"] .gsearch { width: auto; flex: 1; } .adm[data-dir="B"] .gsearch kbd, .adm[data-dir="B"] .crumb, .adm[data-dir="B"] .tb .a-btn { display: none; }
    .adm[data-dir="C"] .tn { padding: 8px 12px; gap: 6px; } .adm[data-dir="C"] .tn nav { overflow-x: auto; flex-wrap: nowrap; width: 100%; order: 3; }
    .adm[data-dir="C"] .tn a.nv { padding: 8px; white-space: nowrap; } .adm[data-dir="C"] .a-today { padding: 8px 12px; gap: 4px 14px; }
    .adm .main, .adm[data-dir="B"] .main, .adm[data-dir="C"] .main { padding: 16px 14px 30px; }
    .a-split { grid-template-columns: 1fr !important; } .a-panel { position: static; }
    .a-row2, .a-row3 { grid-template-columns: 1fr; }
    .a-head h1 { font-size: 22px !important; }
    /* D · the sidebar card becomes a top card with a scrolling pill nav */
    .adm[data-dir="D"] { grid-template-columns: minmax(0, 1fr); padding: 10px; gap: 8px; }
    .adm[data-dir="D"] .sb { position: static; min-height: 0; flex-direction: row; flex-wrap: wrap; align-items: center; padding: 12px; border-radius: 20px; gap: 8px; }
    .adm[data-dir="D"] .sb .logo { margin: 0 4px; font-size: 17px; }
    .adm[data-dir="D"] .sb nav { display: flex; overflow-x: auto; flex: 1 1 100%; gap: 4px; padding-bottom: 2px; }
    .adm[data-dir="D"] .sb a.nv { flex: none; padding: 8px 12px; font-size: 13.5px; white-space: nowrap; }
    .adm[data-dir="D"] .sb a.nv:not(.on) .ic { display: none; }
    .adm[data-dir="D"] .nx, .adm[data-dir="D"] .sb .who, .adm[data-dir="D"] .tb .gsearch, .adm[data-dir="D"] .tb .hi small { display: none; }
    .adm[data-dir="D"] .tb { padding: 6px 4px 0; }
    .adm[data-dir="D"] .main { padding: 12px 2px 30px !important; gap: 16px; }
    .adm[data-dir="D"] .a-head h1 { font-size: 26px !important; }
    .adm[data-dir="D"] .a-kpi .v { font-size: 24px; }
    .adm[data-dir="D"] .a-tabs, .adm[data-dir="D"] .a-seg { overflow-x: auto; flex-wrap: nowrap; }
    .adm[data-dir="D"] .a-tabs button, .adm[data-dir="D"] .a-seg button { white-space: nowrap; }
    .adm[data-dir="D"] .cat-li .cat-li-form { padding: 24px 18px; }
    /* E · the side panel becomes a dark top bar with one scrolling row of links */
    .adm[data-dir="E"] { grid-template-columns: minmax(0, 1fr); }
    .adm[data-dir="E"] .sb { flex-direction: row; flex-wrap: wrap; align-items: center; padding: 10px 10px 6px; gap: 8px; border-right: 0; border-bottom: 1px solid #1B2631; }
    .adm[data-dir="E"] .sb .logo { margin: 0 4px; }
    .adm[data-dir="E"] .sb .gsearch { margin-left: auto; flex: 0 1 150px; }
    .adm[data-dir="E"] .sb .gsearch kbd, .adm[data-dir="E"] .navs .gh, .adm[data-dir="E"] .sb a.nv kbd, .adm[data-dir="E"] .sb .who { display: none; }
    .adm[data-dir="E"] .navs { display: flex; overflow-x: auto; flex: 1 1 100%; gap: 2px; padding-bottom: 2px; }
    .adm[data-dir="E"] .navs nav { display: flex; gap: 2px; }
    .adm[data-dir="E"] .sb a.nv { white-space: nowrap; padding: 7px 10px; }
    .adm[data-dir="E"] .sb a.nv.on { box-shadow: inset 0 -2px 0 var(--pri); }
    .adm[data-dir="E"] .main { padding: 16px 14px 30px; }
    .adm[data-dir="E"] .stb { padding: 7px 12px; gap: 4px 12px; }
    .adm[data-dir="E"] .stb > span:nth-child(n+3) { display: none; }
    .adm[data-dir="E"] .ctr-lw { bottom: 36px; }
    .adm[data-dir="E"] .cat-savebar { bottom: 44px; }
    .adm[data-dir="E"] .cat-li .cat-li-photo { margin: 12px 12px 0; }
  }`;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* Switcher: Screen × Layout variant × Admin style × View. Deep link: #calendar-B-C (screen-layout-style, bare token).
   Remembers the last picks per viewer. */
(() => {
  const TS = window.TS;
  const { SCREENS } = TS;
  const $ = (q) => document.querySelector(q);
  const site = $('#site'), frame = $('#frame'), scr = $('#screens'), vars = $('#vars'), dirs = $('#dirs');
  const GROUPS = ['v2.5 · customer', 'v2.5 · owner', 'Admin redesign'];
  let cur = SCREENS[0].id, pick = {};

  try {
    Object.assign(pick, JSON.parse(localStorage.getItem('ts-p0-pick') || '{}'));
    cur = localStorage.getItem('ts-p0-screen') || cur;
    TS.adminDir = localStorage.getItem('ts-p0-dir') || 'A';
  } catch (_) {}
  const h = location.hash.slice(1).split('-');
  if (SCREENS.some((s) => s.id === h[0])) { cur = h[0]; if (h[1]) pick[cur] = h[1]; if (/^[A-E]$/.test(h[2] || '')) TS.adminDir = h[2]; }
  if (!SCREENS.some((s) => s.id === cur)) cur = SCREENS[0].id;
  if (!/^[A-E]$/.test(TS.adminDir)) TS.adminDir = 'A';

  GROUPS.forEach((g) => {
    const list = SCREENS.filter((s) => s.group === g);
    if (!list.length) return;
    const l = document.createElement('span'); l.className = 'gl'; l.textContent = g; scr.appendChild(l);
    list.forEach((s) => { const b = document.createElement('button'); b.textContent = s.label; b.dataset.s = s.id; scr.appendChild(b); });
  });

  function render() {
    const s = SCREENS.find((x) => x.id === cur);
    const vid = s.variants.some((v) => v.id === pick[cur]) ? pick[cur] : s.variants[0].id;
    const v = s.variants.find((x) => x.id === vid);
    vars.hidden = s.variants.length < 2;
    vars.querySelectorAll('button').forEach((b) => b.remove());
    s.variants.forEach((x) => {
      const b = document.createElement('button');
      b.textContent = x.id; b.title = x.name; b.dataset.v = x.id;
      b.setAttribute('aria-pressed', x.id === vid);
      vars.appendChild(b);
    });
    dirs.hidden = true; // admin style locked to A (picked 2026-09-27)
    TS.adminDir = 'A';
    dirs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.d === TS.adminDir));
    scr.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === cur));
    const dirName = { A: 'Ink rail', B: 'Command', C: 'Operator', D: 'Studio', E: 'Night desk' }[TS.adminDir];
    const title = s.variants.length > 1 ? `${s.label} — ${v.id} · ${v.name}` : s.label;
    $('#note').innerHTML = `<b>${title}${s.admin ? ` <small style="font-weight:600;color:var(--c-mute)">· admin style ${TS.adminDir} ${dirName}</small>` : ''}</b><p>${v.note}</p>${v.tradeoff ? `<p class="tradeoff"><b>Trade-off:</b> ${v.tradeoff}</p>` : ''}`;
    site.innerHTML = v.render();
    if (v.mount) v.mount(site, render);
    try {
      localStorage.setItem('ts-p0-screen', cur);
      localStorage.setItem('ts-p0-pick', JSON.stringify(pick));
      localStorage.setItem('ts-p0-dir', TS.adminDir);
    } catch (_) {}
  }
  scr.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cur = b.dataset.s; render(); });
  vars.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pick[cur] = b.dataset.v; render(); });
  dirs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; TS.adminDir = b.dataset.d; render(); });
  $('#views').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    frame.className = 'frame ' + b.dataset.w;
    $('#views').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  });
  if (!SCREENS.length) { site.innerHTML = '<p style="padding:40px">No screens registered.</p>'; return; }
  render();
})();

// Smoke check for a screen module: node mockups/v2-5/check.js <module.js>
// Loads lib + admin kit + the module in a stub DOM, renders every variant in every admin style,
// and fails on a throw, an empty render, "undefined"/"NaN" in the HTML, or a missing image file.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = __dirname, mod = process.argv[2];
const noop = () => {};
const el = () => ({ appendChild: noop, set textContent(v) {}, style: {}, dataset: {}, setAttribute: noop, querySelectorAll: () => [] });
const ctx = { window: {}, document: { createElement: el, head: { appendChild: noop }, querySelector: () => null }, localStorage: { getItem: () => null, setItem: noop }, location: { hash: '' }, console, matchMedia: () => ({ matches: false }), requestAnimationFrame: noop, performance: { now: () => 0 }, setTimeout, clearTimeout };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['lib.js', 'admin.js', mod]) vm.runInContext(fs.readFileSync(path.resolve(dir, f), 'utf8'), ctx, { filename: f });
const TS = ctx.TS; let bad = 0, n = 0;
for (const s of TS.SCREENS) for (const v of s.variants) for (const d of s.admin ? ['A', 'B', 'C'] : ['A']) {
  TS.adminDir = d; let html;
  try { html = v.render(); } catch (e) { console.error(`✗ ${s.id}/${v.id}/${d} threw: ${e.stack}`); bad++; continue; }
  n++;
  if (typeof html !== 'string' || html.length < 500) { console.error(`✗ ${s.id}/${v.id}/${d}: render too short`); bad++; }
  for (const w of ['undefined', 'NaN', '[object Object]']) if (html.includes(w)) { console.error(`✗ ${s.id}/${v.id}/${d}: contains "${w}"`); bad++; }
  for (const m of html.matchAll(/(?:src="|url\(['"]?)(img\/[^"')]+)/g)) if (!fs.existsSync(path.resolve(dir, '..', m[1]))) { console.error(`✗ ${s.id}/${v.id}: missing ${m[1]}`); bad++; }
  if (s.admin && !html.includes('class="adm"')) { console.error(`✗ ${s.id}/${v.id}: admin screen not wrapped in TS.adminShell`); bad++; }
}
console.log(`${TS.SCREENS.map((s) => s.id).join(', ')}: ${n} renders, ${bad} problems`);
process.exit(bad ? 1 : 0);

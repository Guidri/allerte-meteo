// Genera allerte.json: l'ultimo bollettino di criticità della Protezione Civile (CC BY 4.0,
// github.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica) in forma compatta,
// per le app di Guidri (Radar Vento & Mare, Dove Dormire in Tenda, Non Re-stare a Secco).
// Gira su GitHub Actions ogni 30 minuti; le app leggono il file da raw.githubusercontent.com,
// che non ha il limite di 60 richieste/ora dell'API GitHub (problema dei telefoni su rete mobile).
import fs from 'node:fs';
const REPO = 'pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/files`;
const API = `https://api.github.com/repos/${REPO}`;
const TOKEN = process.env.GITHUB_TOKEN;
const TOLLERANZA = 0.004; // gradi (~400 m): semplificazione dei contorni delle zone

const json = async (url, api = false) => {
  const h = { 'User-Agent': 'allerte-meteo-guidri' };
  if (api) { h.Accept = 'application/vnd.github+json'; if (TOKEN) h.Authorization = `Bearer ${TOKEN}`; }
  const r = await fetch(url, { headers: h });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

async function ultimoId() {
  const trova = (c) => (c.files || []).map((f) => /^files\/(?:[a-z]+\/)?(\d{8}_\d{4})[._]/.exec(f.filename)?.[1]).filter(Boolean).sort().pop();
  let id = trova(await json(`${API}/commits/master`, true));
  if (id) return id;
  for (const c of (await json(`${API}/commits?per_page=8`, true)).slice(1)) {
    id = trova(await json(`${API}/commits/${c.sha}`, true));
    if (id) return id;
  }
  throw new Error('nessun bollettino negli ultimi commit');
}

const livello = (t) => (/ROSSA/i.test(t) ? 3 : /ARANCIONE/i.test(t) ? 2 : /GIALLA/i.test(t) ? 1 : 0);
const RISCHI = [['Per rischio temporali', 'temporali'], ['Per rischio idrogeologico', 'idrogeologico'], ['Per rischio idraulico', 'idraulico']];

// Douglas-Peucker
function semplifica(pts, tol) {
  if (pts.length < 5) return pts;
  const d2 = ([x, y], [x1, y1], [x2, y2]) => {
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
    let t = l ? ((x - x1) * dx + (y - y1) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx - x, py = y1 + t * dy - y; return px * px + py * py;
  };
  const tieni = new Uint8Array(pts.length); tieni[0] = tieni[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop(); let max = 0, i = -1;
    for (let k = a + 1; k < b; k++) { const d = d2(pts[k], pts[a], pts[b]); if (d > max) { max = d; i = k; } }
    if (max > tol * tol) { tieni[i] = 1; pila.push([a, i], [i, b]); }
  }
  return pts.filter((_, k) => tieni[k]);
}

function zoneDaTopo(topo) {
  const t = topo.transform;
  const archi = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => (t ? (x += dx, y += dy, [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]) : [dx, dy])); });
  const anello = (ind) => { const p = []; for (const i of ind) { const a = i >= 0 ? archi[i] : archi[~i].slice().reverse(); a.forEach((q, k) => { if (k > 0 || !p.length) p.push(q); }); } return p; };
  const r5 = (v) => Math.round(v * 1e3) / 1e3;
  const zone = [];
  for (const g of Object.values(topo.objects)[0].geometries || []) {
    const p = g.properties || {};
    let pol = g.type === 'Polygon' ? [g.arcs.map(anello)] : g.type === 'MultiPolygon' ? g.arcs.map((x) => x.map(anello)) : null;
    if (!pol) continue;
    pol = pol.map((rings) => rings.map((r) => semplifica(r, TOLLERANZA).map(([x, y]) => [r5(x), r5(y)])).filter((r) => r.length >= 4)).filter((rings) => rings.length);
    zone.push({
      nome: p['Nome zona'] || 'zona di allerta',
      livello: livello(p['Rappresentata nella mappa']),
      rischi: RISCHI.map(([c, tipo]) => ({ tipo, livello: livello(p[c]) })).filter((x) => x.livello > 0),
      poligoni: pol,
    });
  }
  return zone;
}

const id = await ultimoId();
const vecchio = fs.existsSync('allerte.json') ? JSON.parse(fs.readFileSync('allerte.json', 'utf8')) : null;
if (vecchio?.id === id && !process.env.FORZA) { console.log(`Nessun bollettino nuovo (${id})`); process.exit(0); }
const meta = await json(`${RAW}/${id}.json`);
const oggi = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
const domani = new Date(Date.UTC(+id.slice(0, 4), +id.slice(4, 6) - 1, +id.slice(6, 8) + 1)).toISOString().slice(0, 10);
const giorni = { [oggi]: zoneDaTopo(await json(meta.today?.topo_json || `${RAW}/topojson/${id}_today.json`)) };
try { giorni[domani] = zoneDaTopo(await json(meta.tomorrow?.topo_json || `${RAW}/topojson/${id}_tomorrow.json`)); } catch (e) { console.warn('domani non disponibile', e.message); }
const out = { formato: 1, id, nome: meta.name || `Bollettino ${id}`, emesso: meta.date || null, generato: new Date().toISOString(),
  fonte: 'Dipartimento della Protezione Civile - bollettino di criticità (CC BY 4.0)', giorni };
fs.writeFileSync('allerte.json', JSON.stringify(out));
console.log(`Scritto allerte.json: ${id}, ${(fs.statSync('allerte.json').size / 1024).toFixed(0)} KB`);

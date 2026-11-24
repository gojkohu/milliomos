'use strict';
const $ = s => document.querySelector(s);
const TEMAK = ['Film', 'Sport', 'Általános műveltség', 'Politika'];
const ALAP_SZINTEK = [5000, 10000, 20000, 50000, 100000, 200000, 300000, 500000, 800000, 1500000, 3000000, 5000000, 10000000, 20000000, 40000000];
const BIZTOS = [4, 9]; // az 5. és a 10. kérdés garantált
const BETUK = ['A', 'B', 'C', 'D'];
const SZOLGALTATOK = {
  anthropic: { nev: 'Claude (Anthropic)', kulcs: true, modell: true, url: false, sugo: 'Anthropic API-kulcs (console.anthropic.com).' },
  openai: { nev: 'ChatGPT (OpenAI)', kulcs: true, modell: true, url: false, sugo: 'OpenAI API-kulcs (platform.openai.com).' },
  gemini: { nev: 'Gemini (Google)', kulcs: true, modell: true, url: false, sugo: 'Google AI Studio API-kulcs.' },
  kompatibilis: { nev: 'Más (OpenAI-kompatibilis)', kulcs: true, modell: true, url: true, sugo: 'Mistral, OpenRouter, Groq, helyi Ollama stb.: add meg az alap URL-t és a modellt. Helyi modellhez a kulcs üres lehet.' },
  demo: { nev: 'Demó (AI nélkül)', kulcs: false, modell: false, url: false, sugo: 'Beépített általános műveltségi kérdések – csak kipróbáláshoz.' },
};
const fmt = (p, n) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: p, maximumFractionDigits: 0 }).format(n);

const be = { tema: 'Általános műveltség', penznem: 'HUF', fodij: 40000000, szolg: 'anthropic', kulcs: '', modell: '', alapUrl: '', alapModell: ALAP_MODELL };
let j = null; // a folyó játék
let hangOn = true;

try { Object.assign(be, JSON.parse(localStorage.getItem('milliomos-beallitas') || '{}')); be.kulcs = sessionStorage.getItem('milliomos-kulcs') || ''; } catch {}

function kepernyo(id) { document.querySelectorAll('.kepernyo').forEach(e => e.classList.toggle('aktiv', e.id === id)); }

// ---- hang ----
let ac;
function hang(minta) {
  if (!hangOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    let t = ac.currentTime;
    for (const [f, d, tip] of minta) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = tip || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.15, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d); t += d * .8;
    }
  } catch {}
}
const HANG = { ok: [[523, .15], [659, .15], [784, .15], [1046, .4]], rossz: [[220, .3, 'sawtooth'], [165, .6, 'sawtooth']], veg: [[392, .12], [392, .12]], seg: [[660, .1], [880, .2]], nyer: [[523, .2], [659, .2], [784, .2], [1046, .2], [784, .2], [1046, .6]] };

// ---- kezdőképernyő ----
function nehezSzintek(fo) {
  // Klasszikus arányok; kis fődíjnál az arányok görbéjét addig lapítjuk (k kitevő), amíg a 15 kerekített szint szigorúan nő.
  const kerekit = x => { if (x < 10) return Math.max(1, Math.round(x)); const p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; };
  for (let k = 1; k > 0; k -= .02) {
    const s = ALAP_SZINTEK.map((v, i) => i === 14 ? fo : kerekit(fo * Math.pow(v / 40000000, k)));
    if (s.every((x, i) => i === 0 ? x >= 1 : x > s[i - 1])) return s;
  }
  return ALAP_SZINTEK.map((_, i) => Math.max(1, Math.round(fo * (i + 1) / 15)));
}
const ELOSZTOK = { HUF: [10000000, 40000000, 100000000, 1000000000], EUR: [50000, 100000, 1000000] };
const ALAP_FODIJ = { HUF: 40000000, EUR: 100000 };

function kezdoFrissit() {
  $('#temak').innerHTML = TEMAK.map(t => `<button class="valaszto ${t === be.tema ? 'kivalasztva' : ''}" data-t="${t}">${t}</button>`).join('');
  document.querySelectorAll('#penznemek .valaszto').forEach(b => b.classList.toggle('kivalasztva', b.dataset.p === be.penznem));
  $('#eloszto').innerHTML = ELOSZTOK[be.penznem].map(n => `<button class="valaszto" data-f="${n}">${fmt(be.penznem, n)}</button>`).join('');
  $('#fodij').value = be.fodij;
  const lista = Object.entries(SZOLGALTATOK);
  $('#szolgaltatok').innerHTML = lista.map(([k, s]) => `<button class="valaszto ${k === be.szolg ? 'kivalasztva' : ''}" data-s="${k}">${s.nev}</button>`).join('');
  const s = SZOLGALTATOK[be.szolg];
  $('#kulcs-sor').hidden = !s.kulcs; $('#modell-sor').hidden = !s.modell; $('#url-sor').hidden = !s.url;
  $('#ai-sugo').textContent = s.sugo + (s.kulcs ? ' A kulcs csak ebben a böngészőlapban marad, és közvetlenül a böngészőből megy az AI-szolgáltatóhoz.' : '');
  $('#kulcs').value = be.kulcs; $('#alapurl').value = be.alapUrl;
  $('#modell').value = be.modell; $('#modell').placeholder = be.alapModell[be.szolg] || 'modell neve';
}
function mentBeallitas() {
  try { localStorage.setItem('milliomos-beallitas', JSON.stringify({ tema: be.tema, penznem: be.penznem, fodij: be.fodij, szolg: be.szolg, modell: be.modell, alapUrl: be.alapUrl })); sessionStorage.setItem('milliomos-kulcs', be.kulcs); } catch {}
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.t) { be.tema = b.dataset.t; kezdoFrissit(); }
  if (b.dataset.p && b.closest('#penznemek')) {
    const regiAlap = be.fodij === ALAP_FODIJ[be.penznem] || !be.fodij;
    be.penznem = b.dataset.p; if (regiAlap) be.fodij = ALAP_FODIJ[be.penznem]; kezdoFrissit();
  }
  if (b.dataset.f) { be.fodij = Number(b.dataset.f); kezdoFrissit(); }
  if (b.dataset.s) { be.szolg = b.dataset.s; be.modell = ''; kezdoFrissit(); }
});
$('#fodij').addEventListener('input', e => { be.fodij = Math.max(0, Math.round(Number(e.target.value) || 0)); });
$('#kulcs').addEventListener('input', e => { be.kulcs = e.target.value.trim(); });
$('#modell').addEventListener('input', e => { be.modell = e.target.value.trim(); });
$('#modellek-gomb').addEventListener('click', async () => {
  const gomb = $('#modellek-gomb'); gomb.textContent = 'Lekérés…'; $('#kezdo-hiba').textContent = '';
  try {
    const lista = await aiModellek(aiAdat());
    $('#modell-lista').innerHTML = lista.map(n => `<option value="${n}">`).join('');
    $('#kezdo-hiba').textContent = lista.length + ' modell érhető el – kattints a Modell mezőre, és válassz a listából (a Flash és Lite típusok a gyorsak).';
    $('#kezdo-hiba').style.color = '#9fe3a8';
  } catch (e) { $('#kezdo-hiba').textContent = e.message; $('#kezdo-hiba').style.color = ''; }
  gomb.textContent = 'Modellek lekérése';
});
$('#alapurl').addEventListener('input', e => { be.alapUrl = e.target.value.trim(); });

function aiAdat() {
  return { szolgaltato: be.szolg, kulcs: be.kulcs, modell: be.modell, alapUrl: be.alapUrl };
}
async function api(utvonal, adat) {
  if (utvonal === '/api/kerdesek') return { kerdesek: await aiKerdesek(adat.ai, adat.tema) };
  return aiForras(adat.ai, adat);
}
const kever = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };

$('#inditas').addEventListener('click', async () => {
  $('#kezdo-hiba').textContent = '';
  if (!(be.fodij >= 15)) return $('#kezdo-hiba').textContent = 'A fődíj legyen legalább 15 (a 15 szinthez egy-egy egység kell).';
  const s = SZOLGALTATOK[be.szolg];
  if (s.kulcs && be.szolg !== 'kompatibilis' && !be.kulcs) return $('#kezdo-hiba').textContent = 'Add meg az API-kulcsot, vagy válaszd a Demó módot.';
  mentBeallitas();
  kepernyo('betoltes');
  try {
    let kerdesek;
    if (be.szolg === 'demo') kerdesek = window.DEMO_KERDESEK;
    else kerdesek = (await api('/api/kerdesek', { tema: be.tema, ai: aiAdat() })).kerdesek;
    ujJatek(kerdesek);
  } catch (e) { kepernyo('kezdo'); $('#kezdo-hiba').textContent = e.message; $('#kezdo-hiba').scrollIntoView({ block: 'center' }); }
});

// ---- játék ----
function ujJatek(kerdesek) {
  j = {
    szintek: nehezSzintek(be.fodij), szint: 0, allapot: 'var', kijelolt: null, eltavolitott: [],
    segitseg: { felezo: false, telefon: false, kozonseg: false }, idozito: null,
    kerdesek: kerdesek.map(k => ({ ...k, opciok: kever(k.valaszok.map((sz, i) => ({ sz, helyes: i === 0 }))) })),
  };
  $('#tema-cimke').textContent = be.szolg === 'demo' ? 'DEMÓ' : be.tema.toUpperCase();
  kepernyo('jatek'); letraRajz(); kerdesRajz(); hang(HANG.veg);
}
const biztosNyeremeny = () => { let n = 0; for (const b of BIZTOS) if (j.szint > b) n = j.szintek[b]; return n; };
const jelenlegiNyeremeny = () => (j.szint > 0 ? j.szintek[j.szint - 1] : 0);

function letraRajz() {
  $('#letra').innerHTML = j.szintek.map((v, i) => `<li class="${BIZTOS.includes(i) ? 'biztos' : ''} ${i === j.szint ? 'mostani' : ''} ${i < j.szint ? 'elert' : ''}"><span>${i + 1}</span><span>${fmt(be.penznem, v)}</span></li>`).join('');
}
function kerdesRajz() {
  const k = j.kerdesek[j.szint];
  $('#kerdes').textContent = k.kerdes;
  $('#valaszok').innerHTML = k.opciok.map((o, i) => `<button class="valasz hex ${j.eltavolitott.includes(i) ? 'eltunt' : ''}" data-i="${i}"><b>${BETUK[i]}:</b><span>${o.sz}</span></button>`).join('');
  gombFrissit();
}
function gombFrissit() {
  const var_ = j.allapot === 'var', zarva = j.allapot === 'zarolt', kesz = j.allapot === 'felfedve';
  $('#b-vegleges').hidden = kesz; $('#b-vegleges').disabled = !(var_ && j.kijelolt !== null || zarva);
  $('#b-vegleges').textContent = zarva ? 'Felfedés ▶' : 'Végleges válasz';
  $('#b-vegleges').classList.toggle('kiemelt', zarva || (var_ && j.kijelolt !== null));
  $('#b-forras').hidden = !kesz; $('#b-tovabb').hidden = !kesz;
  $('#b-tovabb').classList.toggle('kiemelt', kesz);
  $('#b-feladom').disabled = !var_;
  for (const [k, id] of [['felezo', '#seg-felezo'], ['telefon', '#seg-telefon'], ['kozonseg', '#seg-kozonseg']]) { $(id).disabled = j.segitseg[k] || !var_; $(id).classList.toggle('hasznalt', j.segitseg[k]); }
  document.querySelectorAll('.valasz').forEach(b => { b.disabled = !var_; });
}
function opcioClass(i, c) { const b = document.querySelector(`.valasz[data-i="${i}"]`); if (b) b.classList.add(c); }

$('#valaszok').addEventListener('click', e => {
  const b = e.target.closest('.valasz'); if (!b || j.allapot !== 'var') return;
  j.kijelolt = Number(b.dataset.i);
  document.querySelectorAll('.valasz').forEach(x => x.classList.toggle('kijelolt', x === b));
  hang(HANG.veg); gombFrissit();
});
$('#b-vegleges').addEventListener('click', () => {
  if (j.allapot === 'var' && j.kijelolt !== null) { j.allapot = 'zarolt'; hang(HANG.veg); gombFrissit(); }
  else if (j.allapot === 'zarolt') felfed();
});
function felfed() {
  const k = j.kerdesek[j.szint];
  j.allapot = 'felfedve';
  const jo = k.opciok.findIndex(o => o.helyes);
  const talalt = k.opciok[j.kijelolt].helyes;
  if (!talalt) opcioClass(j.kijelolt, 'piros');
  opcioClass(jo, 'zold');
  hang(talalt ? HANG.ok : HANG.rossz);
  j.eltalalt = talalt;
  gombFrissit();
  $('#b-tovabb').textContent = !talalt ? 'Vége a játéknak ▶' : j.szint === 14 ? 'Végeredmény ▶' : 'Tovább ▶';
}
$('#b-tovabb').addEventListener('click', () => {
  if (!j.eltalalt) return vege(biztosNyeremeny(), 'Sajnos nem jó a válasz. A garantált nyereménye:');
  if (j.szint === 14) { hang(HANG.nyer); return vege(j.szintek[14], 'GRATULÁLUNK! Ön megnyerte a főnyereményt:'); }
  j.szint++; j.allapot = 'var'; j.kijelolt = null; j.eltavolitott = []; letraRajz(); kerdesRajz();
});
$('#b-feladom').addEventListener('click', () => {
  ablak(`<h2>Feladja a játékot?</h2><p class="nagy">Nyereménye: <b>${fmt(be.penznem, jelenlegiNyeremeny())}</b></p>
    <button class="nagy-gomb kicsi-gomb" id="feladom-igen">Igen, feladom</button>`);
  $('#feladom-igen').onclick = () => { ablakZar(); vege(jelenlegiNyeremeny(), 'Ön feladta a játékot. Nyereménye:'); };
});
function vege(osszeg, cim) {
  $('#vege-cim').textContent = cim; $('#vege-osszeg').textContent = fmt(be.penznem, osszeg); kepernyo('vege');
}
$('#ujra').addEventListener('click', () => { kepernyo('kezdo'); kezdoFrissit(); });

// ---- felugró ablak ----
function ablak(html, zarhato = true) { $('#ablak-tartalom').innerHTML = html; $('#ablak-zar').hidden = !zarhato; $('#takaro').hidden = false; }
function ablakZar() { clearInterval(j && j.idozito); $('#takaro').hidden = true; }
$('#ablak-zar').addEventListener('click', ablakZar);

// ---- segítségek ----
function hasznal(k) { j.segitseg[k] = true; hang(HANG.seg); gombFrissit(); }
function rosszak(k) { return k.opciok.map((o, i) => i).filter(i => !k.opciok[i].helyes && !j.eltavolitott.includes(i)); }
$('#seg-felezo').addEventListener('click', () => {
  const k = j.kerdesek[j.szint];
  kever(rosszak(k)).slice(0, 2).forEach(i => { j.eltavolitott.push(i); document.querySelector(`.valasz[data-i="${i}"]`).classList.add('eltunt'); });
  if (j.kijelolt !== null && j.eltavolitott.includes(j.kijelolt)) { j.kijelolt = null; }
  hasznal('felezo');
});
$('#seg-telefon').addEventListener('click', () => {
  const k = j.kerdesek[j.szint], marad = k.opciok.map((_, i) => i).filter(i => !j.eltavolitott.includes(i));
  const jo = k.opciok.findIndex(o => o.helyes);
  const pontos = Math.max(.35, .92 - j.szint * .04);
  const tipp = Math.random() < pontos ? jo : kever(marad.filter(i => i !== jo))[0];
  const biztos = tipp === jo ? Math.round(60 + Math.random() * 30) : Math.round(40 + Math.random() * 25);
  const szovegek = [`Hmm, ezen el kell gondolkodnom… Szerintem a(z) <b>${BETUK[tipp]}</b>, kb. ${biztos}%-ig biztos vagyok benne.`, `Ezt nem tudom biztosan, de a megérzésem a(z) <b>${BETUK[tipp]}</b>. Kb. ${biztos}%.`, `Na, ezt hallottam valahol! A(z) <b>${BETUK[tipp]}</b> lesz az, ${biztos}%-ra tippelek.`];
  hasznal('telefon');
  let mp = 30;
  ablak(`<h2>☎ Telefonos segítség</h2><div class="ido" id="ido">${mp}</div><p class="nagy" id="bar-szoveg">A barátja a vonalban… (a játékmester olvassa fel a kérdést)</p>`);
  j.idozito = setInterval(() => { mp--; $('#ido').textContent = mp; if (mp === 25) $('#bar-szoveg').innerHTML = szovegek[Math.floor(Math.random() * szovegek.length)]; if (mp <= 0) clearInterval(j.idozito); }, 1000);
});
$('#seg-kozonseg').addEventListener('click', () => {
  const k = j.kerdesek[j.szint], marad = k.opciok.map((_, i) => i).filter(i => !j.eltavolitott.includes(i));
  const jo = k.opciok.findIndex(o => o.helyes);
  const joResz = Math.max(.3, .85 - j.szint * .04) + (Math.random() - .5) * .1;
  const rosszIdx = marad.filter(i => i !== jo), suly = rosszIdx.map(() => Math.random() + .2), ossz = suly.reduce((a, b) => a + b, 0);
  const szaz = {}; szaz[jo] = Math.round(joResz * 100);
  let maradt = 100 - szaz[jo]; rosszIdx.forEach((i, n) => { szaz[i] = n === rosszIdx.length - 1 ? maradt : Math.min(maradt, Math.round(suly[n] / ossz * (100 - szaz[jo]))); maradt -= szaz[i]; });
  hasznal('kozonseg');
  ablak(`<h2>👥 A közönség szavazata</h2><div class="diagram">${k.opciok.map((_, i) => szaz[i] === undefined ? '' : `<div class="oszlop"><em>${szaz[i]}%</em><div style="height:0" data-m="${szaz[i] * 1.6}%"></div><span>${BETUK[i]}</span></div>`).join('')}</div>`);
  setTimeout(() => document.querySelectorAll('.oszlop div').forEach(d => d.style.height = d.dataset.m), 50);
});

// ---- forrás ellenőrzés ----
$('#b-forras').addEventListener('click', async () => {
  const k = j.kerdesek[j.szint], helyes = k.opciok.find(o => o.helyes).sz;
  const kereses = encodeURIComponent(k.kerdes + ' ' + helyes);
  const linkek = `<div class="linkek"><a href="https://hu.wikipedia.org/w/index.php?search=${encodeURIComponent(helyes)}" target="_blank" rel="noopener">Wikipédia: ${helyes}</a><a href="https://www.google.com/search?q=${kereses}" target="_blank" rel="noopener">Keresés a neten</a></div>`;
  if (be.szolg === 'demo') return ablak(`<h2>🔍 Forrás ellenőrzés</h2><p>Demó módban nincs AI-ellenőrzés, de a válasz kereshető:</p>${linkek}`);
  ablak(`<h2>🔍 Forrás ellenőrzés</h2><p class="nagy">Az AI most utánanéz…</p><div class="pontok"><i></i><i></i><i></i></div>`);
  try {
    const v = await api('/api/forras', { kerdes: k.kerdes, lehetosegek: k.opciok.map(o => o.sz), helyes, ai: aiAdat() });
    const cim = { megerositve: '✔ Megerősítve', ketseges: '? Kétséges', hibas: '✘ Hibásnak tűnik' }[v.itelet];
    ablak(`<h2>🔍 Forrás ellenőrzés</h2><div class="itelet ${v.itelet}">${cim}</div><p>Helyes válasz: <b>${helyes}</b></p><p>${esc(v.indoklas)}</p>
      ${v.megjegyzes ? `<p><i>${esc(v.megjegyzes)}</i></p>` : ''}
      ${v.forrasok.length ? `<ul>${v.forrasok.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <p style="font-size:1.2rem;color:#aab3ff">Az AI ítélete is tévedhet – a gombokkal ellenőrizhető élő forrásban is.</p>${linkek}`);
  } catch (e) { ablak(`<h2>🔍 Forrás ellenőrzés</h2><p class="hiba">${esc(e.message)}</p>${linkek}`); }
});
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- egyéb vezérlők ----
$('#b-hang').addEventListener('click', () => { hangOn = !hangOn; $('#b-hang').textContent = hangOn ? '🔊' : '🔇'; });
$('#b-teljes').addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); });

if (!SZOLGALTATOK[be.szolg]) be.szolg = 'anthropic';
kezdoFrissit();

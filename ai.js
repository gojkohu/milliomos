'use strict';
// AI-hívások közvetlenül a böngészőből (nincs szükség szerverre). A kulcs csak a böngészőből megy a szolgáltatóhoz.
const ALAP_MODELL = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o', gemini: 'gemini-3.8-flash', kompatibilis: '' };

const ATMENETI = [429, 500, 502, 503, 529];
const NEM_SZOVEG = /(embed|image|imagen|tts|audio|live|whisper|guard|moderation|dall-e|veo|robotics|transcri)/i;
let aiVezerlo = new AbortController();
const naplo = s => { try { window.aiNaplo && window.aiNaplo(s); } catch {} };
function aiMegszakit() { aiVezerlo.abort(); }

// Egyetlen modell hívása; átmeneti hibánál 'probak' alkalommal újrapróbál (2, 4, 8 mp szünettel).
async function egyHivas(ai, modell, feladat, maxToken, probak) {
  const szolg = ai.szolgaltato;
  let url, fejlec, torzs;
  if (szolg === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    fejlec = { 'x-api-key': ai.kulcs, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    torzs = { model: modell, max_tokens: Math.max(maxToken, 8000), messages: [{ role: 'user', content: feladat }] };
  } else if (szolg === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modell)}:generateContent`;
    fejlec = { 'x-goog-api-key': ai.kulcs };
    torzs = { contents: [{ parts: [{ text: feladat }] }], generationConfig: { maxOutputTokens: maxToken } };
  } else {
    const alap = szolg === 'openai' ? 'https://api.openai.com/v1' : String(ai.alapUrl || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(alap)) throw new Error('Adj meg érvényes alap URL-t (https://...).');
    url = alap + '/chat/completions';
    fejlec = ai.kulcs ? { authorization: 'Bearer ' + ai.kulcs } : {};
    torzs = { model: modell, max_tokens: maxToken, messages: [{ role: 'user', content: feladat }] };
  }
  let v, hibaSzoveg = '';
  for (let proba = 0; proba <= probak; proba++) {
    const t0 = Date.now(); naplo(`Kérés: ${szolg} / ${modell}${proba ? ' (újra ' + proba + ')' : ''}…`);
    try { v = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...fejlec }, body: JSON.stringify(torzs), signal: AbortSignal.any([AbortSignal.timeout(90000), aiVezerlo.signal]) }); }
    catch (e) {
      if (aiVezerlo.signal.aborted) throw new Error('Megszakítva.');
      if (e.name === 'TimeoutError') throw Object.assign(new Error('Az AI 90 másodperc alatt sem válaszolt. Próbáld újra, vagy válassz gyorsabb modellt.'), { atmeneti: true });
      throw new Error('Nem érhető el az AI-szolgáltató (hálózati vagy CORS-hiba). Egyes szolgáltatók nem engedik a böngészős hívást.');
    }
    naplo(`Válasz: HTTP ${v.status}, ${((Date.now() - t0) / 1000).toFixed(1)} mp`);
    if (!v.ok) { hibaSzoveg = await v.text(); const msg = (/"message"\s*:\s*"([^"]{0,230})/.exec(hibaSzoveg) || [])[1]; if (msg) naplo('  ↳ ' + msg.replace(/\\n/g, ' ')); }
    if (ATMENETI.includes(v.status) && proba < probak) {
      let varj = 2 * 2 ** proba;
      if (v.status === 429) {
        // percenkénti keret: a szolgáltató megmondja, mennyit várjunk (retryDelay / Retry-After)
        const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(hibaSzoveg) || /retry in (\d+(?:\.\d+)?)s/i.exec(hibaSzoveg);
        const fej = Number(v.headers.get('retry-after'));
        varj = Math.min(65, Math.ceil(m ? Number(m[1]) : fej || 20)) + 1;
        if (/PerDay|limit: 0/i.test(hibaSzoveg)) throw Object.assign(new Error(`AI hiba (429) [${modell}]: a napi ingyenes keret elfogyott ennél a modellnél.`), { atmeneti: true });
      }
      naplo(`Várakozás ${varj} mp-et${v.status === 429 ? ' (ingyenes kérésszám-korlát)' : ''}, aztán újrapróbálom…`);
      await new Promise((ok, nem) => { const id = setTimeout(ok, varj * 1000); aiVezerlo.signal.addEventListener('abort', () => { clearTimeout(id); nem(new Error('Megszakítva.')); }, { once: true }); });
      continue;
    }
    break;
  }
  if (!v.ok) throw Object.assign(new Error(`AI hiba (${v.status}) [${modell}]: ` + hibaSzoveg.slice(0, 200)), { atmeneti: ATMENETI.includes(v.status) || v.status === 404 });
  const adat = await v.json();
  let szoveg;
  if (szolg === 'anthropic') {
    szoveg = (adat.content || []).map(r => r.text || '').join('');
    naplo(`  ↳ leállás oka: ${adat.stop_reason || '?'}, kimeneti token: ${adat.usage?.output_tokens ?? '?'}, blokkok: ${(adat.content || []).map(r => r.type).join('+') || 'nincs'}`);
  } else if (szolg === 'gemini') szoveg = ((adat.candidates || [])[0]?.content?.parts || []).map(r => r.text || '').join('');
  else szoveg = adat.choices?.[0]?.message?.content || '';
  if (!szoveg.trim()) throw Object.assign(new Error(`Az AI üres választ adott [${modell}]` + (szolg === 'anthropic' && adat.stop_reason === 'max_tokens' ? ' – a modell a tokenkeretet gondolkodásra használta el.' : '.')), { atmeneti: true });
  return szoveg;
}

// A kulcshoz elérhető többi Gemini-modell (szöveggeneráló, "flash" előre), tartalékként.
async function geminiTartalekok(kulcs, kiveve) {
  try {
    const v = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': kulcs } });
    if (!v.ok) return [];
    const nevek = ((await v.json()).models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => /^gemini/.test(n) && !/(embed|image|tts|live|audio|vision|robotics|computer|customtools|exp)/.test(n) && n !== kiveve);
    // stabil (nem preview) és lite modellek előre: azokra kisebb a roham
    const pont = n => (/flash/.test(n) ? 0 : 10) + (/lite/.test(n) ? 0 : 2) + (/preview/.test(n) ? 6 : 0) + (/-latest$/.test(n) ? 1 : 0);
    return nevek.sort((a, b) => pont(a) - pont(b)).slice(0, 6);
  } catch { return []; }
}

async function aiHivas(ai, feladat, maxToken) {
  const szolg = ai.szolgaltato;
  if (!ai.kulcs && szolg !== 'kompatibilis') throw new Error('Nincs API-kulcs megadva.');
  const modell = ai.modell || ALAP_MODELL[szolg];
  if (!modell) throw new Error('Add meg a modell nevét.');
  try { return await egyHivas(ai, modell, feladat, maxToken, szolg === 'gemini' ? 2 : 3); }
  catch (e) {
    if (szolg !== 'gemini' || !e.atmeneti) throw e;
    // Gemini: a választott modell nem elérhető/túlterhelt – próbálunk másikat
    const probalt = [modell];
    for (const m of await geminiTartalekok(ai.kulcs, modell)) {
      try { const sz = await egyHivas(ai, m, feladat, maxToken, 0); window.AI_HASZNALT = m; return sz; }
      catch (e2) { if (!e2.atmeneti) throw e2; probalt.push(m); }
    }
    throw new Error('A Google modelljei most mind túlterheltek (kipróbálva: ' + probalt.join(', ') + '). Próbáld újra 1–2 perc múlva, vagy válassz modellt a „Modellek lekérése” gombbal.');
  }
}

// Az első teljes JSON-tömböt (vagy objektumot) kiveszi a szövegből: a zárójeleket idézőjelek között nem számolja,
// és a JSON utáni vagy előtti magyarázó szöveget (akár zárójelekkel) figyelmen kívül hagyja.
function kinyer(szoveg, nyito, zaro) {
  const kezdetek = [];
  const re = nyito === '[' ? /\[\s*(?:\{|\])/g : /\{/g;
  let m; while ((m = re.exec(szoveg))) kezdetek.push(m.index);
  for (const a of kezdetek) {
    let melyseg = 0, szovegben = false, escape = false;
    for (let i = a; i < szoveg.length; i++) {
      const c = szoveg[i];
      if (szovegben) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') szovegben = false; continue; }
      if (c === '"') szovegben = true;
      else if (c === '[' || c === '{') melyseg++;
      else if (c === ']' || c === '}') { melyseg--; if (melyseg === 0) { try { return JSON.parse(szoveg.slice(a, i + 1)); } catch { break; } } }
    }
  }
  throw new Error('Az AI válasza nem értelmezhető: „' + szoveg.slice(0, 160).replace(/\s+/g, ' ') + '”');
}

const SZINTEK = [
  { nev: 'nagyon könnyű (a játék 1–5. kérdése, bárki tudja)', tol: 1 },
  { nev: 'közepes (a játék 6–10. kérdése, egy művelt ember tudja)', tol: 6 },
  { nev: 'nehéz és nagyon nehéz (a játék 11–15. kérdése, egyre nehezebben, az utolsó nagyon nehéz)', tol: 11 },
];

// Alterületek témánként: minden kéréshez véletlenszerűen választunk néhányat, hogy a kérdések ne ismétlődjenek.
const ALTERULETEK = {
  'Film': ['magyar film és filmesek', 'hollywoodi klasszikusok', 'animációs filmek', 'sci-fi és fantasy', 'horror és thriller', 'Oscar-díj és filmfesztiválok', 'rendezők', 'színészek és színésznők', 'filmzene', 'tévésorozatok', 'vígjátékok', 'történelmi és háborús filmek', 'szinkron és magyar tévé', 'mesefilmek', 'filmes idézetek és szereplők', 'különleges effektek és filmtörténet'],
  'Sport': ['labdarúgás', 'olimpiai játékok', 'Forma-1 és motorsport', 'tenisz', 'kosárlabda', 'kézilabda és vízilabda', 'úszás', 'atlétika', 'téli sportok', 'magyar sportolók', 'kerékpározás és Tour de France', 'ökölvívás és küzdősportok', 'labdarúgó-világbajnokságok és Eb-k', 'sportszabályok és sportszerek', 'sportlétesítmények és csapatok', 'rekordok és érdekességek'],
  'Általános műveltség': ['földrajz', 'világtörténelem', 'magyar történelem', 'természettudomány', 'magyar és világirodalom', 'zene és zeneszerzők', 'képzőművészet és építészet', 'nyelvek és szólások', 'gasztronómia', 'technika és találmányok', 'állatvilág és növények', 'mitológia és vallások', 'csillagászat', 'emberi test és egészség', 'hétköznapi tudás és mértékegységek', 'híres emberek'],
  'Politika': ['magyar állami berendezkedés és intézmények', 'magyar történelem és államfők', 'Európai Unió', 'ENSZ és nemzetközi szervezetek', 'NATO és biztonságpolitika', 'államformák és politikai fogalmak', 'választási rendszerek', 'az Egyesült Államok politikai rendszere', 'történelmi politikai személyiségek', 'alkotmányok és jogi alapfogalmak', 'diplomácia és nemzetközi szerződések', 'világpolitikai fordulópontok'],
};
const KORABBI_KULCS = 'milliomos-korabbi';
const normal = s => String(s).toLowerCase().replace(/[^a-z0-9áéíóöőúüű]+/g, ' ').trim();
function korabbiOlvas(tema) { try { return (JSON.parse(localStorage.getItem(KORABBI_KULCS) || '{}')[tema] || []); } catch { return []; } }
function korabbiMent(tema, lista) {
  try { const mind = JSON.parse(localStorage.getItem(KORABBI_KULCS) || '{}'); mind[tema] = (mind[tema] || []).concat(lista).slice(-400); localStorage.setItem(KORABBI_KULCS, JSON.stringify(mind)); } catch { /* nincs tárhely */ }
}
const VALASZ_KULCS = 'milliomos-korabbi-valasz';
function valaszOlvas(tema) { try { return (JSON.parse(localStorage.getItem(VALASZ_KULCS) || '{}')[tema] || []); } catch { return []; } }
function valaszMent(tema, lista) { try { const mind = JSON.parse(localStorage.getItem(VALASZ_KULCS) || '{}'); mind[tema] = (mind[tema] || []).concat(lista).slice(-200); localStorage.setItem(VALASZ_KULCS, JSON.stringify(mind)); } catch { /* nincs tárhely */ } }
const tokenek = s => normal(s).split(' ').filter(w => w.length > 3);
function hasonlo(x, y) { const A = new Set(tokenek(x)), B = tokenek(y); if (!A.size || !B.length) return false; const kozos = B.filter(w => A.has(w)).length; return kozos / (A.size + B.length - kozos) > 0.5; }
const keverTomb = t => { t = t.slice(); for (let i = t.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [t[i], t[k]] = [t[k], t[i]]; } return t; };

function kerdesUtasitas(tema, szint, mar, korabbi) {
  const politika = tema === 'Politika'
    ? ' Politika témában a kérdések tárgyilagosak és tényalapúak legyenek (intézmények, történelem, nemzetközi szervezetek, ismert események); semmilyen pártos, véleményes vagy vitatott állítás ne szerepeljen.'
    : '';
  const agak = keverTomb(ALTERULETEK[tema] || []).slice(0, 7);
  const tiltott = mar.concat(keverTomb(korabbi).slice(0, 60)).map(k => '"' + k.slice(0, 80) + '"');
  return `Készíts pontosan 7 magyar nyelvű feleletválasztós kvízkérdést a "${tema}" témában a "Legyen Ön is milliomos?" játékhoz.
Nehézség: ${szint.nev}. A sorrendben egyre nehezebbek legyenek.
${agak.length ? 'Ezekből az alterületekből válassz, mind a 7 kérdés más-más alterületről vagy témakörből szóljon: ' + agak.join('; ') + '.\n' : ''}Kerüld a közhelyes, mindenki által ismert "tankönyvi" példákat; a kérdések legyenek váratlanok és változatosak.
Minden kérdésnek pontosan egy, egyértelműen igazolható helyes válasza legyen; kerüld a vitatott, időfüggő vagy bizonytalan tényeket. A rossz válaszok hihetőek legyenek, a válaszok rövidek.${politika}
${tiltott.length ? 'Ezeket a kérdéseket (vagy ezek közeli változatait) NE ismételd: ' + tiltott.join('; ') + '.\n' : ''}Véletlenszám a változatosságért: ${Math.floor(Math.random() * 1e6)}.
Kizárólag JSON tömböt adj vissza, semmi mást (se magyarázatot, se kódblokkot), ebben a formában:
[{"kerdes":"...","valaszok":["HELYES válasz","rossz 1","rossz 2","rossz 3"],"magyarazat":"egy mondat"}]
A "valaszok" tömb ELSŐ eleme mindig a helyes válasz (a program keveri).`;
}

// Elfogadó értelmezés: tömb, vagy objektumba csomagolt tömb, kódblokk-kerítéssel is.
function kerdesLista(szoveg) {
  let s = szoveg.replace(/```(?:json)?/gi, '');
  let lista;
  try { lista = kinyer(s, '[', ']'); }
  catch { const o = kinyer(s, '{', '}'); lista = Object.values(o).find(Array.isArray) || []; }
  return lista.filter(k => k && typeof k.kerdes === 'string' && Array.isArray(k.valaszok) && k.valaszok.length === 4 && k.valaszok.every(v => typeof v === 'string' && v.trim()))
    .map(k => ({ kerdes: k.kerdes, valaszok: k.valaszok, magyarazat: k.magyarazat || '' }));
}

// 3 × 5 kérdés külön, kisebb kérésekben; jelez(n, mind): előrehaladás.
const reszTar = {}; // témánként a már megkapott részek (újraindításnál nem kérjük újra)

async function aiKerdesek(ai, tema, jelez) {
  aiVezerlo = new AbortController();
  const osszes = [], tar = reszTar[tema] = reszTar[tema] || [], korabbi = korabbiOlvas(tema), korabbiValasz = new Set(valaszOlvas(tema));
  for (let r = 0; r < SZINTEK.length; r++) {
    if (tar[r]) { naplo(`${r + 1}. rész már megvan (előző próbálkozásból).`); osszes.push(...tar[r]); continue; }
    let reszek = [], utolso;
    for (let proba = 0; proba < 3 && reszek.length < 5; proba++) {
      jelez && jelez(r, proba);
      try {
        const uj = kerdesLista(await aiHivas(ai, kerdesUtasitas(tema, SZINTEK[r], osszes.map(k => k.kerdes), korabbi), 2500))
          .filter(k => !korabbi.some(q => hasonlo(q, k.kerdes)) && !korabbiValasz.has(normal(k.valaszok[0]))
            && !osszes.concat(reszek).some(m => m.kerdes === k.kerdes || hasonlo(m.kerdes, k.kerdes) || normal(m.valaszok[0]) === normal(k.valaszok[0])));
        reszek = reszek.concat(uj);
      } catch (e) { utolso = e; naplo('Hiba: ' + e.message.slice(0, 220)); if (e.message === 'Megszakítva.' || (e.message.startsWith('AI hiba (4') && !e.atmeneti)) throw e; }
    }
    if (reszek.length < 5) throw new Error('Az AI nem adott elég használható kérdést a ' + (r + 1) + '. részhez (' + reszek.length + '/5).' + (utolso ? ' ' + utolso.message : ' A válasz nem a kért formátumú volt – próbálj nagyobb, okosabb modellt.'));
    tar[r] = reszek.slice(0, 5); osszes.push(...tar[r]);
  }
  delete reszTar[tema];
  korabbiMent(tema, osszes.map(k => k.kerdes)); valaszMent(tema, osszes.map(k => normal(k.valaszok[0])));
  return osszes;
}

async function aiForras(ai, k) {
  const feladat = `Tényellenőrző vagy egy kvízjátékban. A játékos kétli a válasz helyességét. Vizsgáld meg függetlenül, a saját tudásod alapján.
Kérdés: ${k.kerdes}
Válaszlehetőségek: ${(k.lehetosegek || []).join(' | ')}
A játék szerint helyes válasz: ${k.helyes}
Kizárólag JSON-t adj vissza magyarul:
{"itelet":"megerositve"|"ketseges"|"hibas","indoklas":"2-4 mondat, a lényeg tényekkel","forrasok":["megbízható forrás megnevezése (pl. Wikipédia: cikkcím, Britannica, hivatalos oldal) – URL-t csak akkor írj, ha biztosan létezik"],"megjegyzes":"ha van vita vagy több értelmezés, itt írd le, különben üres"}
Légy őszinte: ha nem vagy biztos, az ítélet "ketseges".`;
  const v = kinyer(await aiHivas(ai, feladat, 1200), '{', '}');
  return { itelet: ['megerositve', 'ketseges', 'hibas'].includes(v.itelet) ? v.itelet : 'ketseges', indoklas: v.indoklas || '', forrasok: Array.isArray(v.forrasok) ? v.forrasok.slice(0, 6) : [], megjegyzes: v.megjegyzes || '' };
}

// Elérhető modellek listája a kezdőképernyő választójához.
async function aiModellek(ai) {
  if (ai.szolgaltato === 'gemini') {
    const v = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': ai.kulcs } });
    if (!v.ok) throw new Error('Nem sikerült lekérni a modelleket (' + v.status + '). Ellenőrizd a kulcsot.');
    return ((await v.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, '')).filter(n => /^gemini/.test(n) && !NEM_SZOVEG.test(n));
  }
  const alap = ai.szolgaltato === 'openai' ? 'https://api.openai.com/v1' : String(ai.alapUrl || '').replace(/\/+$/, '');
  if (ai.szolgaltato === 'anthropic') { const v = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': ai.kulcs, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }); if (!v.ok) throw new Error('Nem sikerült lekérni a modelleket (' + v.status + ').'); return ((await v.json()).data || []).map(m => m.id).filter(n => !NEM_SZOVEG.test(n)); }
  if (!/^https?:\/\//.test(alap)) throw new Error('Előbb add meg az alap URL-t.');
  const v = await fetch(alap + '/models', { headers: ai.kulcs ? { authorization: 'Bearer ' + ai.kulcs } : {} });
  if (!v.ok) throw new Error('Nem sikerült lekérni a modelleket (' + v.status + ').');
  const ids = ((await v.json()).data || []).map(m => m.id).filter(n => !NEM_SZOVEG.test(n));
  // ingyenes (OpenRouter: ':free' végű) modellek előre
  return ids.sort((x, y) => (/:free$/.test(y) ? 1 : 0) - (/:free$/.test(x) ? 1 : 0));
}

// Kapcsolat próbája: egészen rövid kérés, hogy kiderüljön, működik-e a szolgáltató/modell/kulcs.
async function aiProba(ai) {
  aiVezerlo = new AbortController();
  const t0 = Date.now();
  const sz = await aiHivas(ai, 'Válaszolj pontosan egy szóval: OK', 300);
  return { szoveg: (sz || '').trim().slice(0, 60) || '(üres válasz)', mp: ((Date.now() - t0) / 1000).toFixed(1) };
}

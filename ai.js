'use strict';
// AI-hívások közvetlenül a böngészőből (nincs szükség szerverre). A kulcs csak a böngészőből megy a szolgáltatóhoz.
const ALAP_MODELL = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o', gemini: 'gemini-3.8-flash', kompatibilis: '' };

async function aiHivas(ai, feladat, maxToken) {
  const szolg = ai.szolgaltato;
  if (!ai.kulcs && szolg !== 'kompatibilis') throw new Error('Nincs API-kulcs megadva.');
  const modell = ai.modell || ALAP_MODELL[szolg];
  if (!modell) throw new Error('Add meg a modell nevét.');
  let url, fejlec, torzs;
  if (szolg === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    fejlec = { 'x-api-key': ai.kulcs, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    torzs = { model: modell, max_tokens: maxToken, messages: [{ role: 'user', content: feladat }] };
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
  let v;
  for (let proba = 0; proba < 4; proba++) {
    try { v = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...fejlec }, body: JSON.stringify(torzs), signal: AbortSignal.timeout(90000) }); }
    catch (e) {
      if (e.name === 'TimeoutError') throw new Error('Az AI 90 másodperc alatt sem válaszolt. Próbáld újra, vagy válassz gyorsabb modellt.');
      throw new Error('Nem érhető el az AI-szolgáltató (hálózati vagy CORS-hiba). Egyes szolgáltatók nem engedik a böngészős hívást.');
    }
    // átmeneti túlterheltség: kis szünetekkel újrapróbáljuk (2, 4, 8 mp)
    if ([429, 500, 502, 503, 529].includes(v.status) && proba < 3) { await new Promise(r => setTimeout(r, 2000 * 2 ** proba)); continue; }
    break;
  }
  if (!v.ok) throw new Error(`AI hiba (${v.status}): ` + (await v.text()).slice(0, 200) + ([429, 503, 529].includes(v.status) ? ' – a szolgáltató most túlterhelt, próbáld újra egy perc múlva, vagy válassz másik modellt.' : ''));
  const adat = await v.json();
  if (szolg === 'anthropic') return (adat.content || []).map(r => r.text || '').join('');
  if (szolg === 'gemini') return ((adat.candidates || [])[0]?.content?.parts || []).map(r => r.text || '').join('');
  return adat.choices?.[0]?.message?.content || '';
}

function kinyer(szoveg, nyito, zaro) {
  const a = szoveg.indexOf(nyito), b = szoveg.lastIndexOf(zaro);
  if (a < 0 || b < a) throw new Error('Az AI válasza nem értelmezhető.');
  return JSON.parse(szoveg.slice(a, b + 1));
}

function kerdesUtasitas(tema) {
  const politika = tema === 'Politika'
    ? ' Politika témában a kérdések tárgyilagosak és tényalapúak legyenek (intézmények, történelem, nemzetközi szervezetek, ismert események); semmilyen pártos, véleményes vagy vitatott állítás ne szerepeljen.'
    : '';
  return `Készíts pontosan 15 magyar nyelvű feleletválasztós kvízkérdést a "${tema}" témában a "Legyen Ön is milliomos?" játékhoz.
A nehézség folyamatosan nőjön: 1–5. kérdés nagyon könnyű, 6–10. közepes, 11–13. nehéz, 14–15. nagyon nehéz.
Minden kérdésnek pontosan egy, egyértelműen igazolható helyes válasza legyen; kerüld a vitatott, időfüggő vagy bizonytalan tényeket. A rossz válaszok hihetőek legyenek, a válaszok rövidek.${politika}
Változatos alkérdéseket adj, ne ismételd magad. Véletlenszám a változatosságért: ${Math.floor(Math.random() * 1e6)}.
Kizárólag JSON tömböt adj vissza, semmi mást, ebben a formában:
[{"kerdes":"...","valaszok":["HELYES válasz","rossz 1","rossz 2","rossz 3"],"magyarazat":"egy mondat"}]
A "valaszok" tömb ELSŐ eleme mindig a helyes válasz (a program keveri).`;
}

async function aiKerdesek(ai, tema) {
  let utolso;
  for (let proba = 0; proba < 2; proba++) {
    try {
      const lista = kinyer(await aiHivas(ai, kerdesUtasitas(tema), 6000), '[', ']');
      const jo = lista.filter(k => k && typeof k.kerdes === 'string' && Array.isArray(k.valaszok) && k.valaszok.length === 4 && k.valaszok.every(v => typeof v === 'string' && v.trim()));
      if (jo.length < 15) throw new Error('Az AI nem adott elég érvényes kérdést.');
      return jo.slice(0, 15).map(k => ({ kerdes: k.kerdes, valaszok: k.valaszok, magyarazat: k.magyarazat || '' }));
    } catch (e) { utolso = e; }
  }
  throw utolso;
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

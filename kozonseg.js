'use strict';
// Közönségszavazás valós időben, saját szerver nélkül: a telefonok és a játék egy nyilvános ntfy.sh "témán" (topic) keresztül beszélnek.
// A téma neve véletlenszerű és kitalálhatatlan; csak betűjelek (A–D) és egy eszközazonosító utaznak rajta.
const NTFY = new URLSearchParams(location.search).get('ntfy') || 'https://ntfy.sh';

class Szavazas {
  static tema() {
    if (!Szavazas._t) { const b = new Uint8Array(10); crypto.getRandomValues(b); Szavazas._t = 'milliomos-' + Array.from(b, x => (x % 36).toString(36)).join(''); }
    return Szavazas._t;
  }
  constructor(opciok, szovegek = {}, kerdes = '') {
    this.q = Math.random().toString(36).slice(2, 10);
    this.opciok = opciok; this.szovegek = szovegek; this.kerdes = kerdes; this.szavatok = new Map(); this.nyitva = true;
    this.onFrissit = null; this.onAllapot = null; this.es = null; this.tema = Szavazas.tema();
  }
  url() {
    const alap = location.href.split('?')[0].split('#')[0].replace(/[^/]*$/, '');
    return alap + 'szavaz.html?t=' + this.tema + (NTFY !== 'https://ntfy.sh' ? '&ntfy=' + encodeURIComponent(NTFY) : '');
  }
  kuld(obj) { return fetch(`${NTFY}/${this.tema}`, { method: 'POST', body: JSON.stringify(obj) }).then(v => v.ok).catch(() => false); }
  indit() {
    this.es = new EventSource(`${NTFY}/${this.tema}/sse`);
    this.es.onopen = () => { this.onAllapot && this.onAllapot('kapcsolt'); this.kuld({ t: 'nyit', q: this.q, o: this.opciok, k: String(this.kerdes).slice(0, 300), s: Object.fromEntries(this.opciok.map(b => [b, String(this.szovegek[b] || '').slice(0, 120)])) }); };
    this.es.onerror = () => { this.onAllapot && this.onAllapot('hiba'); };
    this.es.onmessage = e => {
      try {
        const m = JSON.parse(JSON.parse(e.data).message);
        if (m.t === 'szav' && m.q === this.q && this.nyitva && this.opciok.includes(m.v) && typeof m.id === 'string') {
          this.szavatok.set(m.id.slice(0, 40), m.v); this.onFrissit && this.onFrissit(this.szavatok.size);
        }
      } catch { /* nem szavazat (open / keepalive / idegen üzenet) */ }
    };
  }
  eredmeny() {
    const db = {}; this.opciok.forEach(o => { db[o] = 0; });
    this.szavatok.forEach(v => { db[v]++; });
    const ossz = this.szavatok.size;
    return { ossz, szaz: Object.fromEntries(this.opciok.map(o => [o, ossz ? Math.round(100 * db[o] / ossz) : 0])) };
  }
  async lezar() { this.nyitva = false; this.leallit(false); await this.kuld({ t: 'zar', q: this.q }); return this.eredmeny(); }
  leallit(zarUzenet = true) { this.nyitva = false; if (this.es) { this.es.close(); this.es = null; } if (zarUzenet) this.kuld({ t: 'zar', q: this.q }); }
}

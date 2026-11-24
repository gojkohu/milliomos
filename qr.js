'use strict';
// Minimális QR-kód generátor (bájt mód, M hibajavítás, 1–10. verzió), külső függőség nélkül.
// Használat: qrSvg('https://...') -> SVG szöveg.
const qrSvg = (() => {
  const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // M szint: hibajavító szó / blokk
  const BLK = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];           // M szint: blokkok száma
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  const rawModules = v => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  };
  const dataWords = v => Math.floor(rawModules(v) / 8) - ECC[v] * BLK[v];

  // Reed–Solomon (GF(256), 0x11D)
  const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  const rsDivisor = d => {
    const r = new Array(d).fill(0); r[d - 1] = 1; let root = 1;
    for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) { r[j] = gfMul(r[j], root); if (j + 1 < d) r[j] ^= r[j + 1]; } root = gfMul(root, 0x02); }
    return r;
  };
  const rsRemainder = (data, div) => {
    const r = div.map(() => 0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
    return r;
  };

  function codewords(bytes, v) {
    const cap = dataWords(v) * 8, bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, v <= 9 ? 8 : 16); bytes.forEach(b => push(b, 8));
    push(0, Math.min(4, cap - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // blokkokra bontás + hibajavítás + összefésülés
    const nb = BLK[v], ecl = ECC[v], raw = Math.floor(rawModules(v) / 8);
    const shortLen = Math.floor(raw / nb), nShort = nb - raw % nb, div = rsDivisor(ecl);
    const blocks = []; let k = 0;
    for (let i = 0; i < nb; i++) {
      const len = shortLen - ecl + (i < nShort ? 0 : 1), d = data.slice(k, k + len); k += len;
      const e = rsRemainder(d, div); if (i < nShort) d.push(0); // helyfoglaló a rövid blokkoknál
      blocks.push(d.concat(e));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) out.push(b[i]); });
    return out;
  }

  function build(bytes) {
    let v = 1; while (v <= 10 && 4 + (v <= 9 ? 8 : 16) + bytes.length * 8 > dataWords(v) * 8) v++;
    if (v > 10) throw new Error('A szöveg túl hosszú a QR-kódhoz.');
    const size = v * 4 + 17, mod = [], fn = [];
    for (let i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    // igazító minták
    const na = v === 1 ? 0 : Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
    const pos = v === 1 ? [] : [6]; for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    pos.forEach((x, i) => pos.forEach((y, j) => { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const formatBits = mask => { const data = (0 << 3) | mask; let r = data; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); return ((data << 10) | r) ^ 0x5412; };
    const drawFormat = mask => {
      const b = formatBits(mask);
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i)); set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); } }
    // adatok
    const cw = codewords(bytes, v); let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = bit(cw[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
    const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0;
      for (let t = 0; t < 2; t++) for (let a = 0; a < size; a++) { let run = 1; for (let b = 1; b < size; b++) { const cur = t ? mod[b][a] : mod[a][b], prev = t ? mod[b - 1][a] : mod[a][b - 1]; if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
      const dark = mod.flat().filter(Boolean).length; p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { apply(m); drawFormat(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } apply(m); }
    apply(best); drawFormat(best);
    return mod;
  }

  const fv = formatBitsTeszt => formatBitsTeszt; // (tesztelhetőség)
  const f = text => {
    const m = build(Array.from(new TextEncoder().encode(text))), n = m.length, q = 4;
    let d = ''; m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + q},${y + q}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  };
  f._teszt = { rsDivisor, build, dataWords };
  return f;
})();
if (typeof module !== 'undefined') module.exports = qrSvg;

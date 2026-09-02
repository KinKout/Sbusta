// Sbusta - lettura dei formati del MEF.
//
// Qui dentro ci sono solo funzioni pure: prendono testo o valori gia'
// letti e restituiscono dati.

// Separatore di righe dei .csv del MEF.
// Crea un array di oggetti con le intestazioni come chiavi.
export function spezzaCSV(testo) {
    const righe = testo.replace(/\r\n/g, '\n').split('\n').filter(r => r.trim() !== '');
    if (righe.length === 0) return [];

    const intestazioni = righe[0].split(';').map(h => h.trim());

    return righe.slice(1).map(riga => {
        const campi = riga.split(';').map(c => c.trim());
        return Object.fromEntries(intestazioni.map((h, i) => [h, campi[i] ?? '']));
    });
}

// Il file comunale usa la virgola e omette lo zero iniziale (",8" sta
// per 0,8), quello regionale usa il punto. "0*" non e' un numero:
// indica un comune che non ha ancora deliberato.
export function numero(valore) {
    const v = String(valore ?? '').trim();
    if (v === '' || v === '0*') return null;

    let n = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
    if (n.startsWith('.')) n = '0' + n;

    const risultato = parseFloat(n);
    return Number.isFinite(risultato) ? risultato : null;
}

// Il campo FASCIA e' testo ricorrente, non prosa libera, ma le forme
// sono diverse tra i due file. Quello che non rientra in nessuna forma
// non viene indovinato.
const FORME = [
    { tipo: 'unica',      re: /^aliquota\s+unica$/i },
    { tipo: 'esenzione',  re: /^esenzione per redditi imponibili fino ad? euro\s+([\d.,]+)/i },
    { tipo: 'intervallo', re: /scaglione di reddito da euro\s+([\d.,]+)\s+fino ad? euro\s+([\d.,]+)/i },
    { tipo: 'fino',       re: /scaglione di reddito fino ad? euro\s+([\d.,]+)/i },
    { tipo: 'oltre',      re: /scaglione di reddito oltre euro\s+([\d.,]+)/i },
    { tipo: 'intervallo', re: /^oltre\s+([\d.,]+)\s+e fino a\s+([\d.,]+)\s+euro$/i },
    { tipo: 'fino',       re: /^fino a\s+([\d.,]+)\s+euro$/i },
    { tipo: 'oltre',      re: /^oltre\s+([\d.,]+)\s+euro$/i }
];

export function leggiFascia(testo) {
    const t = (testo ?? '').trim();
    if (t === '') return { tipo: 'vuota' };

    for (const f of FORME) {
        const m = t.match(f.re);
        if (!m) continue;

        if (f.tipo === 'intervallo') return { tipo: 'intervallo', fino: numero(m[2]) };
        if (f.tipo === 'fino')       return { tipo: 'fino',       fino: numero(m[1]) };
        if (f.tipo === 'esenzione')  return { tipo: 'esenzione',  fino: numero(m[1]) };
        return { tipo: f.tipo, fino: null };
    }
    return { tipo: 'sconosciuta', testo: t };
}

// Il file regionale usa il mese abbreviato in italiano e l'anno a due
// cifre: "29-MAG-26". Se un anno il formato cambia, la funzione lo dice
// invece di restituire un numero sbagliato in silenzio.
const MESI = {
    GEN: 1, FEB: 2, MAR: 3, APR: 4, MAG: 5, GIU: 6,
    LUG: 7, AGO: 8, SET: 9, OTT: 10, NOV: 11, DIC: 12
};

export function dataConfrontabile(testo) {
    const t = String(testo ?? '').trim().toUpperCase();

    // 29-MAG-26
    let m = t.match(/^(\d{1,2})-([A-Z]{3})-(\d{2})$/);
    if (m && MESI[m[2]]) {
        return 20000000 + Number(m[3]) * 10000 + MESI[m[2]] * 100 + Number(m[1]);
    }

    // 29/05/2026
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);

    // 2026-05-29
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);

    return null;   // formato sconosciuto: non si indovina
}

// Trasforma le coppie aliquota/fascia gia' lette in scaglioni ordinati
// per il calcolo: prima le fasce con tetto, in ordine crescente, poi
// quella senza tetto ('unica' o 'oltre') con fino a null. E' usata sia
// per l'addizionale comunale sia per quella regionale.
export function scaglioniDa(coppie) {
    const voci = [];

    for (const { aliquota, fascia } of coppie) {
        if (aliquota === null) continue;

        const senzaTetto = fascia.tipo === 'unica' || fascia.tipo === 'oltre';
        voci.push({
            fino: senzaTetto ? null : fascia.fino,
            aliquota: Math.round(aliquota * 100) / 10000,
            ordine: senzaTetto ? Infinity : fascia.fino
        });
    }

    voci.sort((a, b) => a.ordine - b.ordine);
    return voci.map(({ fino, aliquota }) => ({ fino, aliquota }));
}

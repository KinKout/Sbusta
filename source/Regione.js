// Sbusta - l'addizionale regionale a cui il comune appartiene.
//
// Riceve le righe grezze del file regionale e la mappa provincia ->
// regione, gia' lette. Non legge file: il caricamento sta in
// ComuneSelezionato.
//
// Le disposizioni di alcune regioni (es. il Friuli) cambiano il modo
// di leggere la tabella invece di limitarsi alle aliquote per
// scaglioni. Quella traduzione non c'e' ancora: per ora, quando c'e'
// una disposizione, il calcolo usa le sole aliquote e lo dichiara
// negli avvisi.

import { numero, leggiFascia, dataConfrontabile, scaglioniDa } from './Parse.js';

// Il CSV regionale porta il nome per esteso, in maiuscolo e con il
// prefisso. Va ricondotto allo stesso slug usato nelle province.
function slug(nome) {
    return String(nome)
        .replace(/^REGIONE\s+/i, '')
        .replace(/^PROVINCIA AUTONOMA DI\s+/i, '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['\s]+/g, '-')
        .replace(/[^a-z-]/g, '');
}

// Nel file regionale l'intestazione della colonna ha uno spazio in
// coda: "FASCIA ". Si cerca la chiave che la contiene invece di
// scriverla a mano.
function campoFascia(riga) {
    const chiave = Object.keys(riga).find(k => k.trim().toUpperCase() === 'FASCIA');
    return chiave ? riga[chiave] : '';
}

export class Regione {

    // Scorre tutte le righe del file, senza assumere che quelle della
    // regione siano vicine o ordinate. Tiene solo quelle della delibera
    // piu' recente: se ne incontra una successiva, butta quanto
    // raccolto e riparte da li'. Serve perche' due regioni nel 2026
    // hanno due serie di aliquote nello stesso anno (es. la Puglia,
    // passata da 1,33/1,43/1,63/1,85 a 1,33/2,13/3,23/3,33 con la
    // delibera del 29 maggio, come Commissario ad acta per il
    // disavanzo sanitario).
    constructor(righeRegioni, province, sigla) {
        this.nome = null;
        this.numero = null;
        this.pubblicazione = null;
        this.disposizione = null;
        this.norme = null;
        this.note = [];
        this.scaglioni = [];
        this.avvisi = [];

        const slugRegione = province?.[sigla] ?? null;

        if (!slugRegione || !righeRegioni) {
            this.avvisi.push(`Non riesco a risalire alla regione dalla provincia ${sigla}.`);
            return;
        }

        let dataTenuta = null;
        let righe = [];

        for (const r of righeRegioni) {
            if (slug(r.REGIONE) !== slugRegione) continue;

            const data = dataConfrontabile(r['DATA PUBBLICAZIONE']);

            if (data === null) {
                this.avvisi.push(
                    `Data di pubblicazione in un formato non riconosciuto: "${r['DATA PUBBLICAZIONE']}".`
                );
                continue;
            }

            if (dataTenuta === null || data > dataTenuta) {
                dataTenuta = data;
                righe = [];
                this.note = [];
                this.nome = String(r.REGIONE).replace(/^REGIONE\s+/i, '');
                this.numero = r.NUMERO;
                this.pubblicazione = r['DATA PUBBLICAZIONE'];
                this.disposizione = (r.DISPOSIZIONE ?? '').replace(/\s+/g, ' ').trim() || null;
                this.norme = (r.NORME ?? '').replace(/\s+/g, ' ').trim() || null;
            } else if (data < dataTenuta) {
                continue;
            }

            righe.push({ aliquota: r.ALIQUOTA, fascia: campoFascia(r) });

            const nota = (r.NOTE ?? '').trim();
            if (nota !== '' && !this.note.includes(nota)) this.note.push(nota);
        }

        // Traduce le righe grezze in scaglioni utilizzabili dal calcolo.
        const coppie = [];
        for (const r of righe) {
            const aliquota = numero(r.aliquota);
            const fascia = leggiFascia(r.fascia);

            if (fascia.tipo === 'sconosciuta') {
                this.avvisi.push(`Fascia non riconosciuta: "${fascia.testo}".`);
                continue;
            }
            coppie.push({ aliquota, fascia });
        }
        this.scaglioni = scaglioniDa(coppie);

        // Le disposizioni di alcune regioni cambiano il modo di leggere la
        // tabella invece di limitarsi alle aliquote per scaglioni. Quella
        // traduzione non c'e' ancora, quindi per ora il calcolo usa le sole
        // aliquote e lo dichiara negli avvisi. Le regioni in cui questo
        // produce un numero diverso dal dovuto sono Bolzano, Trento, Valle
        // d'Aosta, Lazio, Friuli Venezia Giulia e Umbria.
        if (this.disposizione) {
            this.avvisi.push(
                `${this.nome} applica anche una disposizione che Sbusta non traduce ` +
                `in calcolo, quindi l'addizionale regionale indicata qui sotto puo' ` +
                `essere imprecisa.`
            );
            this.avvisi.push(`Testo della delibera regionale. ${this.disposizione}`);
        }
    }
}

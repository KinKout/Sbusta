// Sbusta - il punto di ingresso ai dati: il comune scelto e la sua regione.
//
// Il giro completo del programma:
//   1. all'avvio, carica() legge i quattro file (due CSV comunali, uno
//      regionale, la mappa province) e tiene le righe grezze;
//   2. mentre l'utente scrive, cerca() riempie il datalist;
//   3. alla scelta, da() costruisce un ComuneSelezionato, che dentro ha
//      un Comune (addizionale comunale) e una Regione (regionale);
//   4. quel risultato, insieme ai campi del form e a parametri.json,
//      andra' a calcola() in Calcolo.js.
//
// Le righe restano grezze finche' qualcuno non chiede un comune: solo
// allora vengono interpretate. I comuni che non hanno ancora deliberato
// per l'anno in corso applicano le aliquote dell'anno precedente.
// Per la regione si legge solo l'anno in corso: il confronto tra delibere doppie sta in Regione.

import { spezzaCSV } from './Parse.js';
import { Comune } from './Comune.js';
import { Regione } from './Regione.js';

const CARTELLA = 'data/source-addizionali/';

async function leggiFile(percorso) {
    const risposta = await fetch(percorso);
    if (!risposta.ok) throw new Error(`Non trovo ${percorso} (${risposta.status})`);
    return risposta.text();
}

export class ComuneSelezionato {

    // Dati grezzi, condivise da tutte le istanze.
    static #righeComuni = null;
    static #righeComuniAnnoPrecedente = null;
    static #righeRegioni = null;
    static #province = null;
    static #anno = null;

    // -------------------------------------------------------------------------------- Carica .csv e .json
    
    static async carica(anno) {
        ComuneSelezionato.#anno = anno;

        // Qui vengono caricati tutti i dati e tenuti grezzi,
        // anche il .csv dell'anno precedente per per i comuni che non hanno deliberato
        // per l'anno in corso.
        const [testoAnno, testoPrec, testoRegioni, province] = await Promise.all([
            leggiFile(`${CARTELLA}Add_comunale_irpef${anno}.csv`),
            leggiFile(`${CARTELLA}Add_comunale_irpef${anno - 1}.csv`),
            leggiFile(`${CARTELLA}addreg${anno}.csv`),
            fetch('data/province.json').then(r => r.json())
        ]);

        ComuneSelezionato.#righeComuni = spezzaCSV(testoAnno);
        ComuneSelezionato.#righeComuniAnnoPrecedente = spezzaCSV(testoPrec);
        ComuneSelezionato.#righeRegioni = spezzaCSV(testoRegioni);
        ComuneSelezionato.#province = province;
    }

    // -------------------------------------------------------------------------------- Ricerca

    // Ricerca dei comuni che cominciano o contengono il testo.
    // Restituisce un array di oggetti { codice, etichetta }
    // All'etichetta viene aggiunta la provincia per evitare comuni omonimi.
    static cerca(testo) {
        const MASSIMO = 10;
        const q = testo.trim().toUpperCase();

        if (q.length < 2) return [];

        const iniziano = [];
        const contengono = [];

        for (const r of ComuneSelezionato.#righeComuni) {
            if (r.COMUNE.startsWith(q)) iniziano.push(r);
            else if (r.COMUNE.includes(q)) contengono.push(r);
            if (iniziano.length >= MASSIMO) break;
        }

        return [...iniziano, ...contengono]
            .slice(0, MASSIMO)
            .map(r => ({
                codice: r.CODICE_CATASTALE,
                etichetta: `${r.COMUNE} (${r.PR})`
            }));
    }

    // Scompone l'etichetta, la controlla e restituisce il codice catastale.
    static codiceDa(etichetta) {
        const m = etichetta.trim().toUpperCase().match(/^(.*?)\s*\(([A-Z]{2})\)$/);
        const nome = m ? m[1].trim() : etichetta.trim().toUpperCase();
        const sigla = m ? m[2] : null;

        const riga = ComuneSelezionato.#righeComuni.find(r =>
            r.COMUNE === nome && (sigla === null || r.PR === sigla)
        );
        return riga ? riga.CODICE_CATASTALE : null;
    }

    static da(codice) {
        const riga = ComuneSelezionato.#righeComuni.find(r => r.CODICE_CATASTALE === codice);
        if (!riga) return null;

        const precedente = ComuneSelezionato.#righeComuniAnnoPrecedente.find(r => r.CODICE_CATASTALE === codice);
        return new ComuneSelezionato(riga, precedente);
    }

    // -------------------------------------------------------------------------------- Costruttore
    constructor(riga, rigaPrecedente) {
        this.comune = new Comune(riga, rigaPrecedente, ComuneSelezionato.#anno);

        // La regione viene calcolata in base al comune.
        this.regione = new Regione(
            ComuneSelezionato.#righeRegioni,
            ComuneSelezionato.#province,
            this.comune.provincia
        );
    }

    get avvisi() {
        return [...this.comune.avvisi, ...this.regione.avvisi];
    }
}

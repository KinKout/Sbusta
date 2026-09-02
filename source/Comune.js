// Sbusta - l'addizionale comunale del comune scelto.
//
// Riceve le righe grezze gia' lette (quella dell'anno richiesto e
// quella dell'anno precedente) e ne ricava scaglioni, esenzione e
// avvisi. Non legge file: il caricamento sta in ComuneSelezionato.

import { numero, leggiFascia, scaglioniDa } from './Parse.js';

export class Comune {

    constructor(riga, rigaPrecedente, anno) {
        this.anno = anno;
        this.codice = riga.CODICE_CATASTALE;
        this.nome = riga.COMUNE;
        this.provincia = riga.PR;

        // Due valori del campo NOTE annullano la delibera: in quel caso
        // il comune va trattato come se non avesse deliberato.
        const valida = !/ALIQUOTE INAPPLICABILI|^NON APPLICA$/i.test(riga.NOTE ?? '');
        const haDeliberato = riga.ALIQUOTA !== '0*' && riga.ALIQUOTA !== '' && valida;

        const sorgente = haDeliberato ? riga : rigaPrecedente;

        this.origine = sorgente ?? riga;
        this.scaglioni = [];
        this.esenzione = null;
        this.annoFonte = null;
        this.daVerificare = sorgente?.FLAG_NUOVA === '0';

        if (sorgente) {
            this.#interpreta(sorgente);
            if (this.scaglioni.length > 0) {
                this.annoFonte = haDeliberato ? anno : anno - 1;
            }
        }
    }

    // Ricostruisce gli scaglioni dalle dodici coppie aliquota/fascia.
    #interpreta(riga) {
        const coppie = [];
        this.esenzione = numero(riga.IMPORTO_ESENTE) || null;

        for (let i = 1; i <= 12; i++) {
            const suffisso = i === 1 ? '' : `_${i}`;
            const aliquota = numero(riga[`ALIQUOTA${suffisso}`]);
            const fascia = leggiFascia(riga[`FASCIA${suffisso}`]);

            if (fascia.tipo === 'vuota' || fascia.tipo === 'sconosciuta') continue;

            // Le righe di esenzione portano solo la soglia, non un'aliquota.
            if (fascia.tipo === 'esenzione') {
                if (!this.esenzione) this.esenzione = fascia.fino;
                continue;
            }

            coppie.push({ aliquota, fascia });
        }

        this.scaglioni = scaglioniDa(coppie);
    }

    // Dichiarano dove il dato poggia su una delibera ereditata o da
    // verificare. Gli avvisi regionali stanno in Regione.
    get avvisi() {
        const elenco = [];

        if (this.scaglioni.length === 0) {
            elenco.push(`${this.nome} non applica l'addizionale comunale.`);
        } else if (this.annoFonte !== this.anno) {
            const delibera = this.origine.NUMERO_DELIBERA
                ? `delibera ${this.origine.NUMERO_DELIBERA} del ${this.origine.DATA_DELIBERA}`
                : `delibera ${this.annoFonte}`;
            elenco.push(
                `Addizionale comunale basata sul ${this.annoFonte}: ` +
                `il comune non ha ancora deliberato per il ${this.anno} (${delibera}).`
            );
        }

        if (this.daVerificare) {
            elenco.push(
                'La delibera comunale e\' classificata dal MEF come caso specifico: ' +
                'le aliquote sono ricostruite dalle colonne del file e vanno verificate.'
            );
        }

        return elenco;
    }
}

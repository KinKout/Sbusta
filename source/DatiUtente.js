// Sbusta - i dati inseriti dall'utente nel form.
//
// Il costruttore fotografa i campi al momento del submit e li converte
// nei tipi che calcola() si aspetta. In JS si valida solo cio' che
// l'HTML non puo' garantire: i limiti numerici e le opzioni chiuse
// stanno gia' nel form, qui si controlla solo che il comune scritto
// esista davvero.

import { ComuneSelezionato } from './ComuneSelezionato.js';

export class DatiUtente {

    constructor() {
        this.ral = Number(document.getElementById('ral').value);
        this.mensilita = Number(document.getElementById('mensilita').value);
        this.figli = Number(document.getElementById('figli').value);

        this.contratto = document.getElementById('contratto').value;

        this.comuneScritto = document.getElementById('comune').value;
        this.codiceComune = ComuneSelezionato.codiceDa(this.comuneScritto);

        this.errori = [];
        if (this.codiceComune === null) {
            this.errori.push('Comune non riconosciuto. Riprova.');
        }
    }
}

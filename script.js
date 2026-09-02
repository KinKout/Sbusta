// Sbusta - punto di ingresso.
//
// Carica i dati all'avvio, riempie il datalist mentre l'utente scrive
// il nome del comune, e al submit esegue il calcolo e riversa il
// risultato nelle tabelle della pagina.

import { ComuneSelezionato } from './source/ComuneSelezionato.js';
import { DatiUtente } from './source/DatiUtente.js';
import { calcola } from './source/Calcolo.js';

const ANNO = 2026;

const campoComune = document.getElementById('comune');
const elenco = document.getElementById('comuni');

let parametri = null;

// -------------------------------------------------------------------------------- Avvio

try {
    // Definizione dai dati nella classe ComuneSelezionato.
    // Caricamento dei parametri per il calcolo.
    [, parametri] = await Promise.all([
        ComuneSelezionato.carica(ANNO),
        fetch('data/parametri.json').then(r => r.json())
    ]);

    // Il select dei contratti si costruisce dai parametri: aggiungere
    // un contratto nel JSON basta a farlo comparire qui.
    const selettore = document.getElementById('contratto');
    selettore.innerHTML = '';
    for (const [chiave, contratto] of Object.entries(parametri.inps.contratti)) {
        const opzione = document.createElement('option');
        opzione.value = chiave;
        opzione.textContent = contratto.nome;
        selettore.appendChild(opzione);
    }

    const button = document.getElementById('calcola');
    button.disabled = false;
    button.textContent = 'Calcola';

    document.getElementById('anno').textContent = ANNO.toString();

} catch (errore) {
    // campoComune.placeholder = 'dati non disponibili';
    document.getElementById('calcola').textContent = 'dati non disponibili';
    console.error('Caricamento dei dati fallito:', errore);
}

// -------------------------------------------------------------------------------- Submit
// <datalist id="comuni"></datalist> si riempie mentre si scrive ed e' stato
// implementato del codice per forzarene la creazione (vedi sotto). 
// L'etichetta porta anche la provincia per evitare comuni omonimi.

let ultimeEtichette = '';

campoComune.addEventListener('input', () => {
    const scritto = campoComune.value;

    if (scritto.trim().length < 2) {
        elenco.innerHTML = '';
        ultimeEtichette = '';
        return;
    }

    const trovati = ComuneSelezionato.cerca(scritto);
    const etichette = trovati.map(t => t.etichetta).join('\n');

    if (etichette === ultimeEtichette) return;
    ultimeEtichette = etichette;

    elenco.innerHTML = '';
    for (const trovato of trovati) {
        const opzione = document.createElement('option');
        opzione.value = trovato.etichetta;
        elenco.appendChild(opzione);
    }

    // Aggiunta questa parte per forzare il <datalist id="comuni"></datalist>
    // perché a volte crea problemi di cache e non aggiorna il contenuto,
    // risultando quasi impossibile da utilizzare.
    const posizioneCursore = campoComune.selectionStart;
    campoComune.value = '';
    requestAnimationFrame(() => {
        campoComune.value = scritto;
        campoComune.setSelectionRange(posizioneCursore, posizioneCursore);
    });
});

// -------------------------------------------------------------------------------- Calcolo

// Formato italiano a due decimali.
// l'intestazione dichiara gia' "in Euro", quindi niente simbolo nelle celle per
// non complicare il codice.
const euro = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function scrivi(selettore, valore) {
    for (const cella of document.querySelectorAll(selettore)) {
        cella.textContent = euro.format(valore);
    }
}

document.getElementById('data-input').addEventListener('submit', (evento) => {
    evento.preventDefault();

    const datiUtente = new DatiUtente();
    if (datiUtente.errori.length > 0) {
        alert(datiUtente.errori.join('\n'));
        return;
    }

    const comuneSelezionato = ComuneSelezionato.da(datiUtente.codiceComune);
    const r = calcola(datiUtente, comuneSelezionato, parametri);

    // Riepilogo.
    scrivi('#netto-annuo', r.nettoAnnuo);
    scrivi('#netto-mensile', r.nettoMensile);

    // Dettagli.
    scrivi('#v-stipendio-ral', r.ral);
    scrivi('#v-inps', r.inps);
    scrivi('.v-imponibile', r.imponibile);
    scrivi('#d-irpef', -r.irpef.netta);
    scrivi('#d-totale-addizionali', -r.addizionali.totale);
    scrivi('#v-integrazioni', r.integrazioni);
    scrivi('#v-totale-trattenute', r.trattenute);
    scrivi('#v-netto-annuo', r.nettoAnnuo);
    scrivi('#v-netto-mensile', r.nettoMensile);

    // Dettagli IRPEF.
    scrivi('#v-irpef', r.irpef.irpefLordo);
    scrivi('#v-dipendente', r.irpef.lavoro);
    scrivi('#v-cuneo', r.irpef.cuneo);
    scrivi('#v-figli', r.irpef.figli);
    scrivi('#v-netto-irpef', r.irpef.netta);

    // Addizionali.
    document.getElementById('titolo-addizionali').innerText =
        `Addizionali locali\n\n- ${comuneSelezionato.comune.nome}, ${comuneSelezionato.regione.nome ?? 'regione sconosciuta'} -`;
    scrivi('#v-regionale', r.addizionali.regionale);
    scrivi('#v-comunale', r.addizionali.comunale);
    scrivi('#v-totale-addizionali', r.addizionali.totale);

    // Integrazioni.
    scrivi('#v-esente', r.dettaglioIntegrazioni.esente);
    scrivi('#v-integrativo', r.dettaglioIntegrazioni.integrativo);
    scrivi('#v-totale-integrazioni', r.integrazioni);

    // Avvisi di comune e regione derivati dalle disposizioni.
    const avvisi = document.getElementById('avvisi');
    avvisi.innerHTML = '';
    for (const testo of comuneSelezionato.avvisi) {
        const paragrafo = document.createElement('p');
        paragrafo.textContent = testo;
        avvisi.appendChild(paragrafo);
    }
});
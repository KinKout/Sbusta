// Sbusta - calcolo dalla RAL al netto.
//
// Nessun valore fiscale e' scritto qui dentro: aliquote, scaglioni e
// formule stanno in data/parametri.json, con la fonte accanto.
//
// Funzione pura: riceve dati, restituisce dati. Non tocca il DOM.



// -------------------------------------------------------------------------------- Trova fascia
// Prima fascia il cui tetto contiene il valore.
function fasciaDi(valore, fasce) {
    return fasce.find(f => f.fino === null || valore <= f.fino);
}

// -------------------------------------------------------------------------------- Trattamento integrativo
// Come la somma esente si aggiunge al netto. Sotto la prima soglia
// spetta intero, ma solo se l'imposta lorda supera la detrazione da
// lavoro: sotto la no tax area la condizione non e' soddisfatta.
function trattamentoIntegrativo(imponibile, lorda, detrLavoro, p) {
    if (imponibile <= p.soglia_piena) {
        return lorda > detrLavoro ? p.importo : 0;
    }
    if (imponibile <= p.soglia_incapienza) {
        return Math.min(p.importo, Math.max(0, detrLavoro - lorda));
    }
    return 0;
}

// -------------------------------------------------------------------------------- Somma Esente 
// Sotto il limite e' una somma che si aggiunge al netto, non una
// detrazione. La percentuale colpisce l'intero reddito, non la sola
// quota dentro la fascia: e' il punto in cui sbagliano diversi
// calcolatori pubblici.
function sommaEsente(imponibile, p) {
    if (imponibile > p.limite) return 0;
    const f = fasciaDi(imponibile, p.fasce);
    return f ? imponibile * f.percentuale : 0;
}

// -------------------------------------------------------------------------------- Addizionale comunale
// La soglia di esenzione comunale e' un interruttore, non una
// franchigia: superata, si paga sull'intero imponibile.
function addizionaleComunale(imponibile, comune) {
    if (!comune || !comune.scaglioni || comune.scaglioni.length === 0) return 0;
    if (comune.esenzione && imponibile <= comune.esenzione) return 0;
    return perScaglioni(imponibile, comune.scaglioni);
}

// -------------------------------------------------------------------------------- Addizionale regionale
// Si applicano le sole aliquote per scaglioni. Dodici regioni hanno in
// piu' una DISPOSIZIONE, cioe' prosa normativa che il file non traduce
// in numeri (esenzioni sotto soglia, aliquote sull'intero imponibile,
// detrazioni fisse). Sei cambiano il risultato anche per il contribuente
// base, e sono Bolzano, Trento, Valle d'Aosta, Lazio, Friuli Venezia
// Giulia e Umbria. Il calcolo non ne tiene ancora conto, quindi quando
// c'e' una disposizione Regione lo dichiara negli avvisi.
function addizionaleRegionale(imponibile, regione) {
    if (!regione || !regione.scaglioni) return 0;
    return perScaglioni(imponibile, regione.scaglioni);
}

// -------------------------------------------------------------------------------- Detrazione di figli
// Art. 12 lettera c). La soglia cresce col numero dei figli e compare
// due volte nella formula, quindi piu' figli si hanno e piu' alta e' la
// detrazione di ciascuno.
function detrazioneFigli(imponibile, figli, p) {
    if (figli <= 0) return 0;

    const soglia = p.soglia + p.incremento_per_figlio * (figli - 1);
    if (imponibile >= soglia) return 0;

    const perFiglio = p.base * (soglia - imponibile) / soglia;
    return perFiglio * figli;
}

// -------------------------------------------------------------------------------- Detrazione di cuneo
// Sopra il limite diventa una detrazione vera, piena e poi decrescente.
function detrazioneCuneo(imponibile, p) {
    const piena = p.piena;
    if (imponibile > piena.oltre && imponibile <= piena.fino) return piena.importo;

    const dec = p.decrescente;
    if (imponibile > dec.oltre && imponibile <= dec.fino) {
        return dec.importo * (dec.riferimento - imponibile) / dec.divisore;
    }
    return 0;
}

// -------------------------------------------------------------------------------- Detrazione di lavoro
// Art. 13 TUIR. Ogni fascia vale base + quota * (riferimento - reddito) / divisore.
// Le fasce senza parte decrescente hanno divisore 0 e valgono la sola base.
function detrazioneLavoro(imponibile, p) {
    const f = fasciaDi(imponibile, p.fasce);

    let d = f.base;
    if (f.divisore > 0) d += f.quota * (f.riferimento - imponibile) / f.divisore;

    const m = p.maggiorazione;
    if (imponibile > m.oltre && imponibile <= m.fino) d += m.importo;

    return Math.max(0, d);
}

// -------------------------------------------------------------------------------- Calcolo per scaglioni
// Calcolo progressivo per scaglioni. La usano IRPEF, addizionale
// regionale e comunale: tabelle diverse, stessa meccanica.
// Un tetto a null significa senza limite superiore.
function perScaglioni(imponibile, scaglioni) {
    if (imponibile <= 0) return 0;

    let imposta = 0;
    let precedente = 0;

    for (const s of scaglioni) {
        const tetto = s.fino === null ? Infinity : s.fino;
        if (imponibile <= precedente) break;
        imposta += (Math.min(imponibile, tetto) - precedente) * s.aliquota;
        precedente = tetto;
    }
    return imposta;
}

// -------------------------------------------------------------------------------- Contributi
// Tutto cio' che descrive un contratto sta in parametri.contratti:
// l'1% aggiuntivo oltre la prima fascia scatta solo se il contratto
// lo prevede. La funzione non sa quanti contratti esistono.
function contributi(ral, chiaveContratto, p) {
    const datiContratto = p.contratti[chiaveContratto];
    const base = Math.min(ral, p.massimale);
    const aggiuntivi = datiContratto.aliquota_aggiuntiva
        ? Math.max(0, base - p.prima_fascia) * p.aliquota_aggiuntiva
        : 0;
    return base * datiContratto.aliquota + aggiuntivi;
}

// ================================================================================
// Calcolo
// ================================================================================
export function calcola(datiUtente, comuneSelezionato, parametri) {
    let comune = comuneSelezionato.comune;
    let regione = comuneSelezionato.regione;

    // 0. Parametri
    const ral = Number(datiUtente.ral) || 0;
    const contratto = String(datiUtente.contratto ?? '1');
    const mensilita = Number(datiUtente.mensilita) || 13;
    const figli = Number(datiUtente.figli) || 0;

    // 1. Contributi, e imponibile che ne consegue.
    //    I contributi obbligatori non fanno reddito (art. 51 TUIR),
    //    quindi l'imponibile e' anche il reddito complessivo.
    const inps = contributi(ral, contratto, parametri.inps);
    const imponibile = ral - inps;

    // 2. IRPEF lorda.
    const irpefLordo = perScaglioni(imponibile, parametri.irpef.scaglioni);

    // 3. Detrazioni. Si sommano tutte e poi si applica la capienza:
    //    non possono superare l'imposta lorda, l'eccedenza si perde.
    const dLavoro  = detrazioneLavoro(imponibile, parametri.detrazione_lavoro);
    const dCuneo   = detrazioneCuneo(imponibile, parametri.cuneo_detrazione);
    const dFigli   = detrazioneFigli(imponibile, figli, parametri.detrazione_figli);

    const detrazioni = Math.min(irpefLordo, dLavoro + dCuneo + dFigli);
    const irpefNetta = irpefLordo - detrazioni;

    // 4. Addizionali: dovute solo se l'IRPEF netta e' dovuta
    //    (art. 50 comma 2 D.Lgs. 446/1997).
    const dovute = irpefNetta > 0;
    const regionale = dovute ? addizionaleRegionale(imponibile, regione) : 0;
    const comunale  = dovute ? addizionaleComunale(imponibile, comune) : 0;

    // 5. Integrazioni: si sommano al netto, non riducono l'imposta.
    const esente = sommaEsente(imponibile, parametri.cuneo_somma_esente);
    const integrativo = trattamentoIntegrativo(
        imponibile, irpefLordo, dLavoro, parametri.trattamento_integrativo
    );

    // 6. Totali.
    const imposte = irpefNetta + regionale + comunale;
    const integrazioni = esente + integrativo;
    const trattenute = inps + imposte;
    const nettoAnnuo = ral - trattenute + integrazioni;

    return {
        ral,
        inps: -inps,
        imponibile,
        integrazioni,
        trattenute: -trattenute,
        nettoAnnuo,
        nettoMensile: nettoAnnuo / mensilita,

        irpef: {
            irpefLordo,
            lavoro: dLavoro,
            cuneo: dCuneo,
            figli: dFigli,
            perse: Math.max(0, dLavoro + dCuneo + dFigli - irpefLordo),
            netta: irpefNetta
        },

        addizionali: {
            regionale,
            comunale,
            totale: regionale + comunale
        },

        dettaglioIntegrazioni: {
            esente,
            integrativo
        },

        luogo: comune ? { comune: comune.nome, provincia: comune.provincia } : null
    };
}
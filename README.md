# Sbusta

Dal RAL al netto, per ogni comune italiano.

link al sito **[https://kinkout.github.io/Sbusta/](https://kinkout.github.io/Sbusta/)**

Calcola lo stipendio netto a partire dalla retribuzione annua lorda, applicando
IRPEF, detrazioni e le addizionali comunali e regionali del comune di residenza.

## Come funziona

Pagina statica, nessuna build e nessuna dipendenza. I dati vengono letti al
volo dai file del Dipartimento delle Finanze in `data/source-addizionali`,
mentre i parametri fiscali stanno in `data/parametri.json`, ognuno con la fonte
normativa accanto.

## Limiti noti

Il risultato è una stima e assume un anno intero di lavoro. Alcune regioni
prevedono disposizioni che il calcolo non traduce ancora, per esempio esenzioni
sotto soglia o detrazioni fisse. Quando succede la pagina lo dichiara in un
avviso.

Non sostituisce il conteggio del datore di lavoro o di un consulente del lavoro.

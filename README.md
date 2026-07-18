# Gym Diary

## Struttura del repository

- `app/`: applicazione funzionante, database IndexedDB, PWA e backup JSON;
- `mockup/`: foglio stilistico base e prototipi visivi riutilizzati dall'app;
- `docs/`: decisioni di prodotto e architettura;
- `.github/workflows/pages.yml`: pubblicazione automatica su GitHub Pages.

La pagina principale del repository reindirizza a `app/`. Il workflow pubblica soltanto `app/`, `mockup/` e la pagina di ingresso, perché il foglio `app/styles.css` riutilizza la base condivisa `mockup/styles.css`.

## Avvio locale

Servire la radice del repository con un server HTTP e aprire `/app/`. Non aprire `app/index.html` direttamente tramite `file://`, perché il catalogo esercizi viene caricato con `fetch()`.

## Pubblicazione

Ogni push sul branch `main` avvia il workflow GitHub Pages. Il sito sarà disponibile all'indirizzo:

```text
https://NOME-UTENTE.github.io/NOME-REPOSITORY/
```

HTML, CSS e JavaScript vivono su GitHub Pages; allenamenti e profilo continuano a vivere nell'IndexedDB del dispositivo dell'utente.

## Cos'è

Un diario allenamenti per utenti finali (non palestre, non coach). Nasce da una richiesta reale: un'amica di Antonello si allena seguendo un programma su un foglio Excel scarno e vuole qualcosa che le permetta di registrare i carichi senza sforzo e vedere le sue progressioni nel tempo senza dimenticarsene. Ha cercato alternative e le trova tutte inadeguate.

## Cosa NON è

**Non è un AI coach.** Non genera programmi, non decide cosa allenare, non sostituisce la programmazione dell'utente o del suo coach. Quello è un prodotto diverso e fuori scope.

## Cos'è davvero

Un diario che **parla**: prende i dati che l'utente registra e li contestualizza in linguaggio semplice — "meglio dell'ultima volta", "stabile da 3 sessioni", "nelle ultime 4 esecuzioni nessun miglioramento evidente". Interpretazione deterministica basata su regole (non ML, non generazione), che sfrutta la competenza reale di Antonello come coach (riconoscere plateau, deload, letture di RPE) senza fingere di essere un algoritmo intelligente.

Posizionamento: **"Porta la tua scheda. Gym Diary ti fa vedere se sta funzionando."**

## Perché non un altro "AI coach"

Ricerca di mercato (luglio 2026) ha mostrato che lo spazio "AI che programma il workout in tempo reale" è già occupato (es. Arvo, adattamento set-by-set a €4/mese). Competere lì significa sfidare player già maturi su terreno costoso (fiducia, personalizzazione, marketing). Il problema reale e validato dell'utente target non è "dimmi cosa fare" — ha già un programma — ma "fammi vedere se sto migliorando senza doverlo tenere a mente".

## Punti di attrito nei prodotti esistenti (da colpire)

Verificati su recensioni reali (Reddit, Trustpilot, store), non impressioni:

1. **Paywall su funzioni core** (storico, grafici, export) — la lamentela #1 in assoluto ovunque.
2. **Dark pattern su abbonamenti/cancellazione** (es. Jefit non permette di cancellare l'account se abbonato).
3. **Zero interpretazione dei dati** — le app loggano bene, non dicono mai cosa significano i numeri.
4. **Principianti abbandonati** — dato misurato: su 50 app analizzate, il 72% non valuta il livello utente, il 74% usa gergo mai spiegato.
5. **Volume per gruppo muscolare/settimana** quasi assente ovunque.
6. **Nessuna app fa rilevamento plateau in linguaggio umano**, con contesto e senza falsi allarmi.

## Rischio principale da tenere sempre presente

L'interpretazione è affidabile solo quanto la continuità/qualità del logging. Un principiante che registra dati incompleti può generare falsi plateau o falsi cali — un solo avviso sbagliato rompe la fiducia in tutto il prodotto. Regola tecnica: **un dato mancante (null) non è mai una prestazione bassa (0)**. Meglio dire "non ho abbastanza dati" che inventare un giudizio.

## Modello economico target

Costi di gestione tendenti a zero per Antonello: preferenza per un'architettura che non dipenda strettamente da un backend cloud a consumo (vedi `docs/ARCHITETTURA.md`), con l'obiettivo di un modello ad acquisto singolo (o comunque a costo marginale nullo per chi lo distribuisce) piuttosto che abbonamento SaaS classico con hosting a carico nostro.

## Idea futura (a pagamento, non nell'MVP): import scheda via screenshot/AI

Caricare una foto o un file della propria scheda e avere un'AI che la traduce in sedute strutturate (esercizio × serie × reps). Non è in conflitto col vincolo "non è un AI coach": qui l'AI **trascrive** quello che l'utente ha già deciso, non decide cosa allenare — più vicino a uno scanner di scontrini che a un consulente.

Fattibile perché si appoggia alla griglia di revisione di "La tua scheda" già presente nel mockup: l'AI non deve essere perfetta, deve fare un tentativo ragionevole che l'utente corregge prima di salvare, negli stessi campi già costruiti. Non serve un parser universale per "qualsiasi formato" — serve un buon primo tentativo + un'interfaccia di correzione, che esiste già.

Vincolo tecnico reale: richiede una chiamata a un modello AI con una chiave che non può stare nel client — serve una singola funzione server-side dedicata a questa chiamata (non un backend completo). È l'unica eccezione sensata all'architettura local-first a costo zero, giustificata dal fatto che è una feature a pagamento: il costo per chiamata lo copre chi si abbona, non ricade sugli utenti gratuiti.

Non va costruita prima di aver validato il diario gratuito con utenti reali (vedi sequenza sotto).

## Sequenza di lavoro (non tutto insieme)

1. Mockup visivo (questa fase) — validare che l'estetica sia premium, non un foglio di calcolo.
2. Diario grezzo funzionante — sostituire Excel per un piccolo gruppo di test (l'amica + 5-10 persone simili).
3. Solo se c'è continuità d'uso: timeline, riepilogo post-allenamento, export.
4. Interpretazione sperimentale (plateau), controllata a mano da Antonello sui primi segnali.
5. Volume muscolare/deload — dopo, non nell'MVP.

## Contesto

Antonello lavora da solo con assistenza AI (Claude Code + Codex), stack storico Firebase/HTML-CSS-JS vanilla/GitHub/Netlify. Ha già 5 app funzionanti in produzione, incluso il motore di metodologie di allenamento della sua app principale (Trainer Tascabile). Sintesi completa della ricerca di mercato e del brainstorming con Codex in memoria di sessione (progetto separato, non duplicare la ricerca).

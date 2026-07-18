# Architettura dati di Gym Diary

## Decisione in breve

Per l'MVP la scelta consigliata è **local-first con IndexedDB come fonte primaria**, export manuale in CSV e backup completo in un file JSON. Non serve un account per iniziare e non esiste un costo backend per utente.

Il file CSV è ottimo per leggere e analizzare i dati in Excel, ma non è adatto come unico database dell'app: relazioni tra allenamenti, esercizi e serie, identificativi e campi mancanti diventano fragili. Un file JSON completo conserva invece lo stato necessario per ripristinare il diario senza perdita di struttura.

Il motore che traduce i dati in frasi come “meglio dell'ultima volta” o “stabile da 3 sessioni” resta in JavaScript nel browser. Non richiede un backend in nessuna delle due architetture.

## Le due strade

| Aspetto | A — Local-first | B — Backend cloud (es. Firestore) |
|---|---|---|
| Fonte primaria | IndexedDB nel browser; opzionalmente file locale | Database remoto gestito dal fornitore |
| Uso iniziale | Immediato, nessun login | Account e autenticazione necessari |
| Costo ricorrente per Antonello | Nessuno per storage e calcolo | Free tier possibile, ma letture, scritture, storage e traffico crescono con uso e utenti |
| Offline | Naturale | Possibile con cache, ma sync e conflitti vanno gestiti |
| Più dispositivi | Nessun sync nativo | Sync reale dopo login |
| Proprietà pratica dei dati | Forte: export completo e file leggibili dall'utente | I dati sono esportabili, ma vivono prima nel servizio scelto |
| Backup | Responsabilità condivisa con l'utente; va reso semplice e visibile | Centralizzato e automatizzabile |
| Manutenzione | Schema e migrazioni locali; nessuna infrastruttura server | Auth, regole di sicurezza, budget, monitoraggio, migrazioni e gestione incidenti |
| Vendita una tantum | Coerente: costo marginale quasi nullo | Meno coerente: il servizio continua ad avere un costo e un obbligo operativo |
| Cambio fornitore | Nessun lock-in sul dato se il formato di export è documentato | Migrazione necessaria; API e struttura legano al fornitore |

## A. Local-first: struttura proposta

### Fonte primaria: IndexedDB

IndexedDB è più adatto di `localStorage`: gestisce molti record, oggetti strutturati, indici e transazioni senza bloccare l'interfaccia. La web app continua a funzionare offline dopo il primo caricamento se in seguito viene resa installabile come PWA.

Store minimi consigliati:

- `workouts`: una sessione, con data, nome della scheda, durata e note;
- `exercises`: catalogo degli esercizi inseriti dall'utente;
- `workoutExercises`: ordine e relazione tra sessione ed esercizio;
- `sets`: peso, ripetizioni, RPE opzionale, stato e riferimento alla sessione;
- `routines`: la scheda portata dall'utente, senza generazione automatica;
- `settings`: preferenze, versione dello schema e data dell'ultimo backup.

Ogni record usa un UUID generato nel client e timestamp ISO. I valori non registrati restano `null`: non vengono trasformati in zero. Questa distinzione è necessaria sia per i confronti sia per evitare letture false.

### Export e ripristino

Servono due export distinti:

1. **Backup completo JSON**: un singolo file versionato, per ripristinare l'app senza perdere relazioni, note o metadati.
2. **Export CSV**: file separati o un file ZIP per `allenamenti`, `esercizi` e `serie`, pensati per Excel e per l'analisi personale.

CSV non conserva bene tipi, relazioni e valori `null`; per questo va presentato come export leggibile, non come backup principale. Un futuro export `.xlsx` può migliorare l'esperienza Excel, ma richiede una libreria client-side e non cambia l'architettura.

### File System Access API

Su browser Chromium desktop l'app può chiedere all'utente di scegliere un file di backup e riscriverlo periodicamente, dopo un consenso esplicito. È utile come protezione aggiuntiva, ma non può essere l'unico meccanismo perché:

- il supporto non è uniforme, soprattutto su Safari/iPhone e Firefox;
- i permessi possono dover essere concessi di nuovo;
- l'accesso richiede un contesto sicuro (`https` o ambiente locale supportato), quindi non va dato per garantito aprendo un HTML con doppio click;
- su mobile la gestione di un file persistente è meno lineare.

La strategia robusta è quindi: IndexedDB sempre disponibile, backup JSON manuale ovunque, salvataggio ricorrente su file dove l'API è supportata.

### Compromessi reali

- Cancellare i dati del sito o usare una pulizia aggressiva del browser può eliminare il diario.
- Un telefono nuovo non riceve automaticamente lo storico: serve esportare e importare il backup.
- Due dispositivi possono produrre copie divergenti; nell'MVP non vanno unite automaticamente.
- Browser e profili diversi sullo stesso dispositivo hanno archivi separati.
- La modalità privata non è un luogo affidabile per conservare dati.
- Antonello non può recuperare un diario perso se l'utente non ha un backup.

Questi limiti vanno dichiarati con linguaggio calmo e concreto. L'app dovrebbe mostrare “Ultimo backup: 8 giorni fa” e offrire un'azione semplice, non notifiche colpevolizzanti.

## B. Firestore: benefici e costo operativo

Firestore risolve bene il caso account + più dispositivi: dopo il login, telefono e computer vedono lo stesso diario. Offre SDK maturi, cache offline e infrastruttura gestita. È una scelta sensata se il sync diventa una funzione per cui gli utenti dimostrano di voler pagare.

Non è però “gratis” come proprietà architetturale. Il free tier è una soglia commerciale, non una garanzia permanente. Il costo dipende da letture, scritture, storage, banda e pattern delle query. Oltre alla fattura esistono costi operativi: autenticazione, regole di sicurezza, cancellazione account, export dei dati, monitoraggio degli abusi e gestione dei cambiamenti del fornitore.

Per una vendita una tantum, un backend obbligatorio crea inoltre una promessa implicita: Antonello deve continuare a mantenerlo anche anni dopo l'acquisto. Questo è il disallineamento principale, più importante del costo iniziale probabilmente basso.

## Raccomandazione per l'MVP

1. Usare IndexedDB come unica fonte primaria.
2. Definire subito un modello dati versionato e indipendente dall'interfaccia.
3. Aggiungere export CSV per trasparenza e uso in Excel.
4. Aggiungere backup/ripristino JSON prima di affidare l'app a utenti reali.
5. Mostrare la data dell'ultimo backup; dopo un intervallo ragionevole proporlo senza bloccare l'uso.
6. Calcolare timeline, record, stabilità e plateau interamente nel client, ignorando confronti con dati insufficienti.
7. Non costruire login, sync o merge multi-dispositivo finché il test non dimostra che la loro assenza limita davvero la continuità d'uso.

Questa scelta valida prima il comportamento essenziale — registrare in palestra con continuità e rileggere i dati — senza introdurre costi o manutenzione che il prodotto non ha ancora giustificato.

## Percorso ibrido senza riscrittura

Il local-first può restare il prodotto base, gratuito o acquistabile una volta. In futuro un tier opzionale può aggiungere sync e backup cloud a pagamento, così il costo ricorrente è sostenuto solo da chi usa il servizio ricorrente.

Per mantenere questa possibilità:

- separare l'interfaccia dal repository dati (`WorkoutRepository` con operazioni chiare);
- usare UUID stabili e timestamp fin dall'MVP;
- versionare schema ed export;
- tenere il motore di interpretazione come funzioni pure che ricevono dati e restituiscono risultati;
- non inserire oggetti o identificativi specifici di Firestore nel dominio;
- progettare un eventuale sync come strato aggiuntivo, con regole esplicite per conflitti e cancellazioni.

Il passaggio futuro non sarebbe “spostare tutto su Firestore”, ma aggiungere un servizio di replica opzionale. IndexedDB continuerebbe a servire l'esperienza offline; il cloud sincronizzerebbe record e backup per gli utenti del tier dedicato.

## Criterio per riaprire la decisione

La scelta cloud va rivalutata quando dai test emerge almeno uno di questi segnali:

- più utenti abbandonano perché cambiano spesso dispositivo;
- import/export manuale è una causa misurabile di perdita o mancato utilizzo;
- esiste disponibilità concreta a pagare per sync e backup gestito;
- serve condivisione deliberata dello storico con coach o altri ruoli.

Finché questi segnali non esistono, il backend aggiunge complessità prima di risolvere un problema validato.

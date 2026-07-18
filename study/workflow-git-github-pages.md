# Workflow Git + GitHub Pages per una app HTML statica

Questa nota serve per capire cosa abbiamo fatto con Gym Diary: come una cartella sul computer diventa una repo GitHub e poi una app pubblicata online con GitHub Pages.

## 1. La cartella del progetto

Sul computer hai una cartella:

```text
Gym Diary/
```

Dentro ci sono i file della app:

```text
app/
mockup/
index.html
README.md
.github/
```

La cartella `app/` contiene l'app vera.

La cartella `mockup/` contiene alcuni file di stile usati dall'app.

Il file `index.html` iniziale serve per mandare l'utente verso l'app.

## 2. Git controlla la cartella locale

Git serve per creare versioni del progetto.

Quando fai un commit, stai dicendo:

```text
Salva una fotografia dello stato attuale di questi file.
```

I comandi base sono:

```bash
git add .
git commit -m "Descrivo la modifica"
```

`git add .` prepara i file da salvare.

`git commit -m "..."` crea una versione salvata del progetto.

Questa versione nasce prima sul tuo computer.

## 3. GitHub conserva una copia online

GitHub e' il posto online dove carichi la repo.

Per collegare la cartella locale alla repo GitHub, usi:

```bash
git remote add origin https://github.com/digiuseppea-design/gym-diary.git
```

Questo significa:

```text
La repo online collegata a questa cartella e' questa.
```

Poi, per mandare i file su GitHub, usi:

```bash
git push -u origin main
```

Dopo la prima volta, normalmente basta:

```bash
git push
```

Questo significa:

```text
Manda su GitHub i commit che ho fatto sul computer.
```

## 4. GitHub Pages pubblica la app come sito

GitHub Pages e' il servizio di GitHub che trasforma una repo in un sito visitabile online.

Nel nostro caso il sito e':

```text
https://digiuseppea-design.github.io/gym-diary/
```

Pero' GitHub deve sapere quali file pubblicare e come prepararli.

Qui entra in gioco il workflow.

## 5. Il workflow e' un file di istruzioni

Dentro il progetto c'e' questa cartella speciale:

```text
.github/workflows/
```

GitHub controlla automaticamente quella cartella.

Dentro abbiamo creato il file:

```text
pages.yml
```

Questo file dice a GitHub cosa fare quando arriva un nuovo push.

In parole semplici, il file dice:

```text
Quando qualcuno fa push sul branch main:
1. scarica i file della repo
2. configura GitHub Pages
3. crea una cartella temporanea chiamata _site
4. copia dentro _site i file necessari
5. pubblica _site come sito web
```

## 6. Perche' creiamo una cartella _site

La cartella `_site` e' una cartella temporanea usata solo durante il deploy.

Non e' la tua app originale.

E' la versione impacchettata che GitHub deve pubblicare.

Nel nostro caso dentro `_site` vengono copiati:

```text
index.html
.nojekyll
app/
mockup/
```

Questo e' importante perche' l'app usa sia i file dentro `app/`, sia alcuni file dentro `mockup/`.

Su Netlify il CSS sembrava mancare proprio perche' non veniva pubblicata tutta la struttura giusta.

## 7. Cosa succede quando fai una modifica

Il flusso completo e' questo:

```text
Modifichi i file sul computer
↓
git add .
↓
git commit -m "Descrivo la modifica"
↓
git push
↓
GitHub riceve i file aggiornati
↓
GitHub Actions legge .github/workflows/pages.yml
↓
GitHub prepara _site
↓
GitHub Pages pubblica la nuova versione online
```

Quindi tu non devi caricare manualmente i file sul sito.

Ti basta fare commit e push.

## 8. Differenza tra Git, GitHub, GitHub Actions e GitHub Pages

Git:

```text
Tiene traccia delle versioni sul tuo computer.
```

GitHub:

```text
Tiene una copia online della repo.
```

GitHub Actions:

```text
Esegue istruzioni automatiche quando succede qualcosa, per esempio un push.
```

GitHub Pages:

```text
Pubblica i file come sito web.
```

Il file `pages.yml` collega GitHub Actions e GitHub Pages.

## 9. La logica del nostro progetto

La tua app non ha bisogno di un server backend per funzionare.

E' una app statica:

```text
HTML + CSS + JavaScript
```

Quindi puo' essere pubblicata su GitHub Pages.

I dati dell'utente non vengono salvati su GitHub.

Restano nel browser o nel telefono dell'utente tramite memoria locale/IndexedDB, piu' il sistema di backup JSON.

GitHub Pages serve solo a distribuire l'app, cioe' a renderla accessibile da un link.

## 10. Cosa devi ricordare

La cosa importante e' questa:

```text
GitHub non capisce sempre da solo come pubblicare una app.
```

Per questo gli abbiamo dato una ricetta:

```text
.github/workflows/pages.yml
```

Quella ricetta viaggia insieme al progetto.

Se domani cloni la repo o la sposti, il progetto si porta dietro anche il modo in cui va pubblicato.

Questa e' una struttura sana, perche' codice e deploy stanno nello stesso posto.


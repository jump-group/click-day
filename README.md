# Tampermonkey Script per Automazione FESR Emilia - Romagna

## Descrizione

Questo script Tampermonkey è progettato per automatizzare alcune operazioni sul portale dei Servizi Federati della Regione Emilia - Romagna, specificamente per le richieste relative al FESR 2020. L'obiettivo principale è quello di navigare rapidamente verso la pagina di dettaglio di una specifica richiesta e, se presente, avviare il processo di invio della domanda.

## Funzionalità

    * ** Reindirizzamento automatico:** Se si accede al dominio principale del FESR 2020 e non si è già sulla pagina di dettaglio della richiesta configurata, lo script reindirizza automaticamente l'utente.
        * ** Rilevamento redirect inaspettato:** Se si viene reindirizzati inaspettatamente alla homepage del FESR 2020 durante il tentativo di accesso alla pagina di dettaglio, lo script si ferma.
* ** Ricerca del bottone "Invia domanda":** Lo script cerca un bottone nella pagina che contenga il testo "Invia domanda" o che inizi con "Invia".
* ** Navigazione veloce:** Se il bottone "Invia domanda" viene trovato, lo script naviga immediatamente all'URL specificato nell'attributo `href` del bottone.
* ** Ricaricamento in caso di assenza del bottone:** Se il bottone "Invia domanda" non viene trovato, la pagina viene ricaricata automaticamente per riprovare.
* ** Interfaccia utente flottante:** Un pannello UI in basso a sinistra della pagina permette di:
    * ** Ferma / Avvia Script:** Controlla l'attivazione o la disattivazione dello script. Lo stato viene memorizzato tra le sessioni.
    * ** Notifiche:** Visualizza brevi messaggi di stato o informazioni.
    * ** Log:** Mostra un registro delle attività dello script, persistente tra i caricamenti di pagina e azzerabile all'avvio.
    * ** Persistenza dei log:** I log dell'attività dello script vengono memorizzati e visualizzati nell'UI anche dopo aver navigato tra le pagine o ricaricato.Vengono azzerati solo quando si preme il pulsante "Avvia Script".

## Installazione

1.  Assicurati di avere installato l'estensione Tampermonkey nel tuo browser (Chrome, Firefox, Safari, Edge, ecc.).
2.  Copia il codice dello script(il contenuto completo del file`.user.js`).
3.  Clicca sull'icona di Tampermonkey nel tuo browser e seleziona "Crea un nuovo script...".
4.  Incolla il codice copiato nell'editor di Tampermonkey.
5.  Salva lo script(File -> Salva o Ctrl + S / Cmd + S).

## Utilizzo

Una volta installato, lo script si attiverà automaticamente quando navighi sul dominio`https://servizifederati.regione.emilia-romagna.it/fesr2020/*`.

** Flusso di funzionamento iniziale:**

    1. ** Navigazione iniziale:** Se ti trovi su una pagina qualsiasi del dominio `https://servizifederati.regione.emilia-romagna.it/fesr2020/` e lo script è attivo, verrai automaticamente reindirizzato alla pagina di dettaglio della richiesta configurata(impostata tramite la variabile`requestId`).
2. ** Controllo redirect:** Se durante il tentativo di accesso alla pagina di dettaglio vieni reindirizzato alla homepage(`https://servizifederati.regione.emilia-romagna.it/fesr2020/`), lo script si fermerà.
3. ** Ricerca bottone:** Se la pagina di dettaglio viene caricata correttamente, lo script cercherà il bottone "Invia domanda".
4. ** Invio domanda(navigazione):** Se il bottone viene trovato, lo script navigherà direttamente all'URL specificato nel bottone, simulando l'azione di clic.Dopo aver navigato, lo script si fermerà automaticamente.
5. ** Riprova(ricarico):** Se il bottone non viene trovato, la pagina verrà ricaricata automaticamente e il processo di ricerca del bottone verrà ripetuto.
6. ** Controllo manuale:** Puoi controllare lo stato dello script e fermarlo o riavviarlo utilizzando l'interfaccia utente flottante in basso a sinistra.

## Configurazione

Puoi modificare alcune impostazioni dello script direttamente all'interno del codice:

    * ** `requestId = '46317';` **: Questa variabile definisce l'ID della richiesta per la quale lo script deve cercare il bottone "Invia domanda". Modifica `'46317'` con l'ID della richiesta desiderata.
* ** `searchText = 'Invia domanda';` **: Questa variabile contiene il testo esatto(o l'inizio del testo) del bottone che lo script deve cercare. Puoi modificarla se il testo del bottone dovesse cambiare (ad esempio, per test iniziali potrebbe essere impostata a `'Invalida'`).

## Controlli UI

L'interfaccia utente flottante in basso a sinistra offre i seguenti controlli:

    * ** Bottone "Ferma Script" / "Avvia Script" **: Cliccando su questo bottone, puoi disattivare o riattivare l'automazione dello script. Lo stato viene memorizzato anche tra le sessioni del browser.
    * ** Area Notifiche **: Un piccolo spazio dove lo script può mostrare brevi messaggi informativi.
* ** Area Log **: Una finestra scrollabile che mostra i log dell'attività dello script, inclusi i tentativi di reindirizzamento, la ricerca del bottone, le navigazioni e gli stati dello script. I log persistono tra i caricamenti di pagina e vengono azzerati quando si preme "Avvia Script".

## Troubleshooting

    * ** Lo script non si attiva:** Assicurati di essere sul dominio corretto(`https://servizifederati.regione.emilia-romagna.it/fesr2020/*`) e che lo script sia abilitato in Tampermonkey.Controlla anche che non ci siano errori nella console del browser(solitamente accessibile premendo F12).
* ** Il bottone non viene trovato:** Verifica che il testo del bottone sulla pagina corrisponda esattamente(o inizi con) il valore della variabile`searchText` nello script.
* ** Il reindirizzamento non funziona:** Controlla che la variabile`requestId` sia impostata correttamente con l'ID della richiesta desiderata.
    * ** Loop di reindirizzamento:** Se lo script sembra reindirizzarsi continuamente, prova a disabilitarlo e riabilitarlo, oppure verifica che non ci siano conflitti con altri script Tampermonkey attivi sullo stesso sito.
    * 
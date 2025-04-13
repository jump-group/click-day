// ==UserScript==
// @name         Automazione FESR Emilia-Romagna
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Automatizza alcune operazioni sul portale FESR, inclusa la selezione soggetto e attivazione programmata
// @author       Tu
// @match        https://servizifederati.regione.emilia-Romagna.it/fesr2020/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const fiscalCode = '04026360364'; // Codice Fiscale da cercare nella selezione soggetto
    const requestId = '46317'; // ID della richiesta (costante modificabile)

    // --- CONFIGURAZIONE INIZIALE ---
    let searchText = 'Invia domanda'; // Testo del bottone da cercare (modificabile)
    const targetDetailPageUrl = `https://servizifederati.regione.emilia-Romagna.it/fesr2020/richieste/common/${requestId}/dettaglio`;
    const baseUrl = 'https://servizifederati.regione.emilia-Romagna.it/fesr2020/';
    const storageKeyScriptActive = 'fesrAutomationActive'; // Rinominata
    const storageKeyScriptLogs = 'fesrAutomationLogs';     // Rinominata
    const storageKeyScriptReloadCount = 'fesrAutomationReloadCount'; // Rinominata
    const storageKeyScriptCfUrlMap = 'fesrAutomationCfUrlMap';   // Rinominata
    const storageKeyScriptSubmitSuccess = 'fesrSubmitSuccess'; // Chiave per stato invio successo
    const maxReloads = 5; // Numero massimo di ricaricamenti consentiti (Rinominata)
    const subjectSelectionUrl = 'https://servizifederati.regione.emilia-romagna.it/fesr2020/selezione_soggetto/richieste_elenco';
    const activationDateTimeString = "2025-04-15T09:59:59.900"; // Formato ISO 8601

    let scriptAttivo = true;
    let reloadCount = 0;
    let activationTimeoutId = null; // ID per il setTimeout di attivazione
    let countdownIntervalId = null; // ID per l'interval del countdown
    let activationTime = new Date(activationDateTimeString).getTime(); // Timestamp di attivazione
    let uiContainer;
    let notificationDiv;
    let logDiv;
    let logs = [];
    let reloadCounterSpan; // Aggiunta per riferimento allo span del contatore
    let submitStatusDiv; // Aggiunta per riferimento div stato invio
    let countdownSpan; // Aggiunto per riferimento span countdown

    // --- GESTIONE DELLO STORAGE PER LO STATO ATTIVO ---
    function loadScriptState() {
        customLog("loadScriptState: Controllo stato attivazione...");
        const now = Date.now();
        const msUntilActivation = activationTime - now;
        const storedState = localStorage.getItem(storageKeyScriptActive);

        if (msUntilActivation > 0) {
            // Siamo prima dell'ora di attivazione
            if (storedState === 'true') {
                // L'utente ha attivato manualmente prima dell'ora programmata
                scriptAttivo = true;
                customLog("Stato attivato manualmente (prima dell'ora programmata) caricato da localStorage.");
                // Non impostare timer, l'attivazione manuale ha la precedenza
                if (activationTimeoutId) clearTimeout(activationTimeoutId); // Sicurezza
                if (countdownIntervalId) clearInterval(countdownIntervalId); // Sicurezza
                activationTimeoutId = null;
                countdownIntervalId = null;
            } else {
                // Nessuna attivazione manuale precedente, attendi l'ora programmata
                customLog(`Script in attesa. Attivazione programmata tra ${formatMilliseconds(msUntilActivation)}.`);
                scriptAttivo = false;
                saveScriptState(); // Forza lo stato inattivo
                displayNotification(`Script in attesa. Attivazione tra ${formatMilliseconds(msUntilActivation)}`);

                // Cancella eventuali timer precedenti (sicurezza)
                if (activationTimeoutId) clearTimeout(activationTimeoutId);
                if (countdownIntervalId) clearInterval(countdownIntervalId);

                // Imposta il timer per l'attivazione
                activationTimeoutId = setTimeout(activateScriptNow, msUntilActivation);

                // Avvia l'aggiornamento del countdown nella UI
                countdownIntervalId = setInterval(updateCountdownUI, 1000);
            }
        } else {
            // Siamo dopo l'ora di attivazione o l'ora non è valida
            if (activationTime && !isNaN(activationTime)) {
                customLog("Ora di attivazione raggiunta o superata.");
                // displayNotification("Ora di attivazione raggiunta."); // Meno notifiche
            } else {
                customLog("Data/ora di attivazione non valida, lo script usa lo stato salvato.");
            }

            // Carica lo stato: attivo se era attivo, o di default se non c'è stato salvato
            scriptAttivo = (storedState === 'true') || (storedState === null);
            if (storedState === null && scriptAttivo) {
                saveScriptState(); // Salva lo stato attivo di default
            }
        }
        customLog('Stato script finale caricato:', scriptAttivo);
        updateStopButtonText();
        updateCountdownUI(); // Aggiorna UI countdown in base allo stato finale
    }

    function saveScriptState() {
        localStorage.setItem(storageKeyScriptActive, scriptAttivo);
        // Non loggare qui per evitare messaggi ripetuti dal countdown
        // customLog('Stato script salvato:', scriptAttivo);
    }

    // --- GESTIONE DELLO STORAGE PER IL CONTATORE RICARICAMENTI ---
    function loadReloadCount() {
        const storedCount = localStorage.getItem(storageKeyScriptReloadCount);
        if (storedCount !== null) {
            reloadCount = parseInt(storedCount, 10) || 0;
        }
        customLog(`Contatore ricaricamenti caricato: ${reloadCount}/${maxReloads}`);
        updateReloadCounterUI(); // Aggiorna UI
    }

    function saveReloadCount() {
        localStorage.setItem(storageKeyScriptReloadCount, reloadCount.toString());
        customLog(`Contatore ricaricamenti salvato: ${reloadCount}`);
        updateReloadCounterUI(); // Aggiorna UI
    }

    function resetReloadCount() {
        reloadCount = 0;
        saveReloadCount(); // Salva il valore 0 in localStorage
        customLog('Contatore ricaricamenti azzerato.');
        updateReloadCounterUI(); // Aggiorna UI
    }

    // --- GESTIONE DELLO STORAGE PER I LOG ---
    function loadLogs() {
        const storedLogs = localStorage.getItem(storageKeyScriptLogs);
        if (storedLogs) {
            try {
                logs = JSON.parse(storedLogs);
            } catch (e) {
                customLog("Errore parsing logs:", e);
                logs = [];
                localStorage.removeItem(storageKeyScriptLogs);
            }
        }
    }

    function saveLogs() {
        try {
            localStorage.setItem(storageKeyScriptLogs, JSON.stringify(logs));
        } catch (e) {
            customLog("Errore salvataggio logs:", e);
        }
    }

    function clearLogs() {
        logs = [];
        localStorage.removeItem(storageKeyScriptLogs);
        displayLogsInUI(); // Aggiorna UI dopo la pulizia
    }

    function displayLogsInUI() {
        if (logDiv) {
            logDiv.innerHTML = ''; // Pulisci il contenuto precedente
            for (let i = logs.length - 1; i >= 0; i--) {
                const logEntry = document.createElement('div');
                logEntry.textContent = logs[i];
                logDiv.appendChild(logEntry);
            }
        }
    }

    // --- GESTIONE MAPPA CF -> URL ---
    function getCfUrlMap() {
        const storedMap = localStorage.getItem(storageKeyScriptCfUrlMap);
        try {
            return storedMap ? JSON.parse(storedMap) : {};
        } catch (e) {
            customLog("Errore parsing mappa CF->URL:", e);
            localStorage.removeItem(storageKeyScriptCfUrlMap); // Rimuovi se corrotto
            return {};
        }
    }

    function saveCfUrlMap(map) {
        try {
            localStorage.setItem(storageKeyScriptCfUrlMap, JSON.stringify(map));
            customLog("Mappa CF->URL salvata.");
        } catch (e) {
            customLog("Errore salvataggio mappa CF->URL:", e);
        }
    }

    // --- FUNZIONI UTILI ---

    function stopScript() {
        scriptAttivo = false;
        customLog('Script fermato.');
        displayNotification('Script fermato.');

        if (activationTimeoutId) {
            clearTimeout(activationTimeoutId);
            activationTimeoutId = null;
            customLog("Timer di attivazione cancellato.");
        }
        if (countdownIntervalId) {
            clearInterval(countdownIntervalId);
            countdownIntervalId = null;
            customLog("Timer countdown cancellato.");
        }

        updateStopButtonText();
        saveScriptState(); // Salva lo stato inattivo
        resetReloadCount();
        updateCountdownUI(); // Aggiorna UI countdown (mostrerà "Attesa annullata")
    }

    function startScript() {
        // const msUntilActivation = activationTime - Date.now(); // Non serve più bloccare qui
        // if (!isNaN(activationTime) && msUntilActivation > 0) { // Rimosso blocco
        //      customLog("Tentativo di avvio manuale prima dell'ora di attivazione. Attendere.");
        //      displayNotification(`Attendere attivazione automatica tra ${formatMilliseconds(msUntilActivation)}`);
        //      return; // Non avviare manualmente
        // }

        scriptAttivo = true;
        customLog('Script (ri)avviato dall\'utente.');

        // Se i timer erano attivi, cancellali (attivazione manuale anticipata)
        if (activationTimeoutId) {
            clearTimeout(activationTimeoutId);
            activationTimeoutId = null;
            customLog("Attivazione manuale: Timer di attivazione programmata cancellato.");
        }
        if (countdownIntervalId) {
            clearInterval(countdownIntervalId);
            countdownIntervalId = null;
            customLog("Attivazione manuale: Timer countdown cancellato.");
        }

        displayNotification('Script avviato.');
        updateStopButtonText();
        saveScriptState(); // Salva lo stato attivo
        clearLogs();
        resetReloadCount();
        localStorage.removeItem(storageKeyScriptSubmitSuccess);
        updateSubmitStatusUI();
        updateCountdownUI(); // Aggiorna UI countdown (mostrerà "Attivato manualmente" se prima dell'ora)
        handleInitialLoad();
    }

    function updateStopButtonText() {
        const stopButton = document.getElementById('stop-script-btn');
        if (stopButton) {
            stopButton.textContent = scriptAttivo ? 'Ferma Script' : 'Avvia Script';
        }
    }

    function displayNotification(message) {
        if (notificationDiv) {
            notificationDiv.textContent = message;
        }
    }

    function navigateTo(url) {
        customLog('Navigo a:', url);
        const urlLower = url.toLowerCase();
        // Imposta flag appropriati in sessionStorage prima della navigazione
        if (urlLower === targetDetailPageUrl.toLowerCase()) {
            sessionStorage.setItem('fesrNavAttempt', 'true');
        } else if (urlLower === subjectSelectionUrl.toLowerCase()) {
            sessionStorage.setItem('fesrSelezioneAttempt', 'true');
        }
        window.location.href = url;
    }

    function reloadPage() {
        customLog('Ricarico la pagina.');
        window.location.reload();
    }

    // --- LOGICA PRINCIPALE DI NAVIGAZIONE E AZIONI ---

    function checkAndNavigateButton() {
        if (!scriptAttivo) {
            customLog("checkAndNavigateButton: Script non attivo, esco.");
            return;
        }
        customLog("checkAndNavigateButton: Cerco bottone con testo:", searchText);

        const buttons = document.querySelectorAll('a.btn');
        let foundButton = null;

        for (const button of buttons) {
            const buttonText = button.textContent.trim();
            if (buttonText === searchText || buttonText.startsWith(searchText.substring(0, searchText.indexOf(' ') > 0 ? searchText.indexOf(' ') : searchText.length))) {
                foundButton = button;
                break;
            }
        }

        if (foundButton) {
            const targetUrl = foundButton.getAttribute('href');
            customLog('Bottone trovato. Navigo a:', targetUrl);
            // resetReloadCount(); // NON resettare qui, altrimenti il loop incerto non incrementa
            // Imposta il flag di tentativo invio prima di navigare
            sessionStorage.setItem('fesrSubmitAttempt', 'true');
            customLog('Flag fesrSubmitAttempt impostato.');
            navigateTo(targetUrl);
        } else {
            // Questo blocco viene eseguito solo se il BOTTONE non viene trovato
            customLog(`Bottone ${searchText} NON trovato sulla pagina dettaglio.`);
            reloadCount++;
            saveReloadCount(); // Salva subito dopo l'incremento
            updateReloadCounterUI();
            if (reloadCount > maxReloads) {
                customLog(`Numero massimo di ricaricamenti (${maxReloads}) raggiunto senza trovare il bottone. Script fermato.`);
                displayNotification(`Max ricaricamenti (${maxReloads}) raggiunto. Script fermato.`);
                stopScript(); // Ferma lo script
            } else {
                customLog(`Ricarico per cercare ancora il bottone (Tentativo ${reloadCount}/${maxReloads}).`);
                reloadPage();
            }
        }
    }

    function startSelezioneSoggettoFlow() {
        customLog("Redirect inaspettato rilevato. Avvio flusso alternativo: Selezione Soggetto.");
        const cfUrlMap = getCfUrlMap();
        const savedUrl = cfUrlMap[fiscalCode];

        if (savedUrl) {
            customLog(`URL per CF ${fiscalCode} trovato in memoria: ${savedUrl}. Navigo direttamente.`);
            // Assumiamo che l'URL salvato sia già completo
            navigateTo(savedUrl);
        } else {
            customLog(`Nessun URL salvato per CF ${fiscalCode}. Navigo alla pagina di selezione soggetto: ${subjectSelectionUrl}`);
            navigateTo(subjectSelectionUrl);
        }
    }

    function processSelezioneSoggettoPage() {
        customLog(`Sono sulla pagina Selezione Soggetto (${subjectSelectionUrl}). Cerco CF: ${fiscalCode}`);
        const tableRows = document.querySelectorAll('#notizie-elenco tbody tr');
        let foundRow = false;

        if (!tableRows || tableRows.length === 0) {
            customLog("Tabella #notizie-elenco non trovata o vuota. Impossibile procedere. Script fermato.");
            stopScript();
            return;
        }

        for (const row of tableRows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
                const cfCell = cells[2];
                const actionCell = cells[3];
                const linkElement = actionCell.querySelector('a.btn');

                if (cfCell && cfCell.textContent.trim() === fiscalCode && linkElement) {
                    customLog(`CF ${fiscalCode} trovato nella riga.`);
                    foundRow = true;
                    const relativeUrl = linkElement.getAttribute('href');
                    if (relativeUrl) {
                        const fullUrl = new URL(relativeUrl, baseUrl).href;
                        customLog(`URL estratto: ${relativeUrl}, URL completo calcolato: ${fullUrl}`);

                        const cfUrlMap = getCfUrlMap();
                        cfUrlMap[fiscalCode] = fullUrl;
                        saveCfUrlMap(cfUrlMap);

                        customLog(`URL salvato per CF ${fiscalCode}. Navigo a ${fullUrl}`);
                        resetReloadCount(); // Azzera contatore dopo successo selezione
                        navigateTo(fullUrl);
                    } else {
                        customLog("Errore: Link trovato ma senza attributo href.");
                        stopScript();
                    }
                    break;
                }
            }
        }

        if (!foundRow) {
            customLog(`CF ${fiscalCode} non trovato nella tabella di selezione soggetto. Script fermato.`);
            stopScript();
        }
    }

    function handleInitialLoad() {
        customLog('--- Inizio handleInitialLoad ---');
        customLog('URL corrente:', window.location.href);

        if (!scriptAttivo) {
            customLog('Script non attivo. Esco.');
            return;
        }

        const currentUrlLower = window.location.href.toLowerCase();
        const baseUrlLower = baseUrl.toLowerCase();
        const targetDetailPageUrlLower = targetDetailPageUrl.toLowerCase();
        const selezioneSoggettoUrlLower = subjectSelectionUrl.toLowerCase();

        // 1. Controlla tentativi di navigazione falliti (redirect immediati)
        const navAttempt = sessionStorage.getItem('fesrNavAttempt');
        if (navAttempt === 'true') {
            sessionStorage.removeItem('fesrNavAttempt');
            if (currentUrlLower === baseUrlLower) {
                customLog('Redirect inaspettato alla base URL rilevato dopo tentativo di navigazione alla pagina dettaglio.');
                startSelezioneSoggettoFlow();
                return;
            }
            customLog('Tentativo navigazione pagina dettaglio registrato, ma non sono sulla base URL.');
        }

        const selezioneAttempt = sessionStorage.getItem('fesrSelezioneAttempt');
        if (selezioneAttempt === 'true') {
            sessionStorage.removeItem('fesrSelezioneAttempt');
            if (currentUrlLower === baseUrlLower) {
                customLog('Redirect inaspettato alla base URL rilevato dopo tentativo di navigazione alla pagina Selezione Soggetto. Script fermato.');
                stopScript();
                return;
            }
            customLog('Tentativo navigazione pagina selezione registrato, ma non sono sulla base URL.');
        }

        // 2. Logica principale basata sull'URL corrente
        if (currentUrlLower.startsWith(baseUrlLower)) {
            if (currentUrlLower === targetDetailPageUrlLower) {
                customLog('Nella pagina di dettaglio corretta. Cerco il bottone...');
                checkAndNavigateButton();
            } else if (currentUrlLower === selezioneSoggettoUrlLower) {
                customLog('Nella pagina di Selezione Soggetto. Processo la tabella...');
                processSelezioneSoggettoPage();
            } else {
                customLog(`Non sulla pagina dettaglio (${targetDetailPageUrlLower}) né sulla selezione soggetto (${selezioneSoggettoUrlLower}). Reindirizzo alla pagina dettaglio: ${targetDetailPageUrl}`);
                navigateTo(targetDetailPageUrl);
            }
        } else {
            customLog('Dominio non corretto. Script non attivo su questa pagina.');
        }
        customLog('--- Fine handleInitialLoad ---');
    }

    // --- GESTIONE STATO INVIO SUCCESSO ---
    function checkSubmitSuccess() {
        const submitAttempt = sessionStorage.getItem('fesrSubmitAttempt');
        const currentUrlLower = window.location.href.toLowerCase();
        const targetDetailPageUrlLower = targetDetailPageUrl.toLowerCase();

        if (submitAttempt === 'true') {
            sessionStorage.removeItem('fesrSubmitAttempt');
            customLog('Flag fesrSubmitAttempt rilevato e rimosso. Controllo presenza div.alert.alert-success...');

            const successAlert = document.querySelector('div.alert.alert-success');

            if (successAlert) {
                customLog('INVIO CON SUCCESSO CONFERMATO: Trovato div.alert.alert-success.');
                localStorage.setItem(storageKeyScriptSubmitSuccess, 'true');
                resetReloadCount(); // Azzera contatore al successo
                updateSubmitStatusUI();
                stopScript();
                return true;
            } else {
                customLog('Alert di successo (div.alert.alert-success) non trovato.');
                if (currentUrlLower === targetDetailPageUrlLower) {
                    customLog('Invio INCERTO: Reindirizzato a pagina dettaglio ma senza alert di successo.');
                    displaySubmitWarningUI();
                    // Incrementa e controlla il contatore nel caso incerto (trattato come un fallimento di ricerca bottone)
                    reloadCount++;
                    saveReloadCount(); // Salva subito
                    updateReloadCounterUI(); // Aggiorna UI
                    if (reloadCount > maxReloads) {
                        customLog(`Numero massimo di tentativi (${maxReloads}) raggiunto dopo invio incerto. Script fermato.`);
                        displayNotification(`Max tentativi (${maxReloads}) raggiunto. Script fermato.`);
                        stopScript(); // Ferma lo script
                        return true; // Indica di fermare l'avvio dello script
                    } else {
                        customLog(`Invio incerto. Procedo con tentativo ${reloadCount}/${maxReloads}.`);
                        return false; // Lascia continuare lo script per il retry
                    }
                } else {
                    customLog('Invio probabilmente fallito o navigato a pagina inaspettata. URL:', currentUrlLower);
                    updateSubmitStatusUI();
                    return false;
                }
            }
        }
        return false;
    }

    // Funzione specifica per mostrare l'avviso di invio incerto
    function displaySubmitWarningUI() {
        if (submitStatusDiv) {
            submitStatusDiv.textContent = 'Invio incerto ⚠️';
            submitStatusDiv.style.color = 'orange';
            submitStatusDiv.style.fontWeight = 'bold';
        }
    }

    function updateSubmitStatusUI() {
        if (submitStatusDiv) {
            const success = localStorage.getItem(storageKeyScriptSubmitSuccess) === 'true';
            if (success) {
                submitStatusDiv.textContent = 'Invio effettuato ✅';
                submitStatusDiv.style.color = 'green';
                submitStatusDiv.style.fontWeight = 'bold';
            } else {
                // Mostra stato default se non c'è successo confermato
                // L'avviso viene gestito da displaySubmitWarningUI
                submitStatusDiv.textContent = 'Stato invio: -';
                submitStatusDiv.style.color = 'black';
                submitStatusDiv.style.fontWeight = 'normal';
            }
        }
    }

    // --- FUNZIONE AGGIORNAMENTO CONTATORE UI ---
    function updateReloadCounterUI() {
        if (reloadCounterSpan) {
            reloadCounterSpan.textContent = `Tentativi: ${reloadCount}/${maxReloads}`;
        }
    }

    // --- FUNZIONI ATTIVAZIONE PROGRAMMATA ---
    function activateScriptNow() {
        customLog("+++ ATTIVAZIONE AUTOMATICA +++");
        scriptAttivo = true;
        saveScriptState();
        activationTimeoutId = null; // Resetta ID timeout
        if (countdownIntervalId) {
            clearInterval(countdownIntervalId);
            countdownIntervalId = null;
            if (countdownSpan) countdownSpan.textContent = "Attivo!"; // Aggiorna UI countdown
        }
        displayNotification("Script attivato automaticamente!");
        updateStopButtonText();
        handleInitialLoad(); // Avvia la logica principale
    }

    function formatMilliseconds(ms) {
        if (ms <= 0) return "0s";
        let seconds = Math.floor(ms / 1000);
        let minutes = Math.floor(seconds / 60);
        let hours = Math.floor(minutes / 60);

        seconds = seconds % 60;
        minutes = minutes % 60;

        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    function updateCountdownUI() {
        if (countdownSpan) {
            const msRemaining = activationTime - Date.now();

            if (scriptAttivo && msRemaining > 0) {
                // Attivato manualmente prima dell'ora
                countdownSpan.textContent = "Attivato manualmente";
                if (countdownIntervalId) {
                    clearInterval(countdownIntervalId);
                    countdownIntervalId = null;
                }
            } else if (msRemaining <= 0 && activationTime && !isNaN(activationTime)) {
                // Ora di attivazione passata (o non valida ma abbiamo provato a leggerla)
                countdownSpan.textContent = "Ora attivazione passata";
                if (countdownIntervalId) {
                    clearInterval(countdownIntervalId);
                    countdownIntervalId = null;
                }
            } else if (msRemaining > 0 && countdownIntervalId) {
                // Countdown attivo
                countdownSpan.textContent = `Attiva tra: ${formatMilliseconds(msRemaining)}`;
            } else if (msRemaining > 0 && !countdownIntervalId && !scriptAttivo) {
                // Timer cancellato ma non ancora attivato (es. dopo stopScript)
                countdownSpan.textContent = "Attesa annullata.";
            } else {
                // Caso di default o data non valida
                countdownSpan.textContent = "";
            }
        }
    }

    // --- CREAZIONE INTERFACCIA UTENTE ---
    function createUI() {
        if (document.getElementById('fesr-automation-ui')) {
            return;
        }
        if (document.body) {
            uiContainer = document.createElement('div');
            uiContainer.id = 'fesr-automation-ui'; // Aggiunto ID per controllo esistenza
            uiContainer.style.position = 'fixed';
            uiContainer.style.bottom = '10px';
            uiContainer.style.left = '10px';
            uiContainer.style.backgroundColor = 'rgba(240, 240, 240, 0.9)'; // Leggermente trasparente
            uiContainer.style.padding = '10px';
            uiContainer.style.border = '1px solid #ccc';
            uiContainer.style.borderRadius = '5px'; // Bordi arrotondati
            uiContainer.style.zIndex = '10000'; // Sopra la maggior parte degli elementi
            uiContainer.style.fontSize = '12px'; // Dimensione font base per UI
            uiContainer.style.maxWidth = '300px'; // Larghezza massima

            // 1. Area Notifiche (in alto)
            notificationDiv = document.createElement('div');
            notificationDiv.id = 'tm-notification';
            notificationDiv.style.marginBottom = '5px';
            notificationDiv.style.fontWeight = 'bold';
            uiContainer.appendChild(notificationDiv);

            // 2. Accordion per Log
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Log Script';
            summary.style.cursor = 'pointer';
            summary.style.marginBottom = '5px';
            details.appendChild(summary);

            logDiv = document.createElement('div');
            logDiv.id = 'tm-logs';
            logDiv.style.fontSize = '0.9em';
            logDiv.style.maxHeight = '150px'; // Altezza massima log ridotta
            logDiv.style.overflowY = 'auto';
            logDiv.style.backgroundColor = '#fff'; // Sfondo bianco per leggibilità
            logDiv.style.border = '1px solid #eee';
            logDiv.style.padding = '5px';
            logDiv.style.marginBottom = '10px'; // Spazio prima dei controlli
            details.appendChild(logDiv);
            uiContainer.appendChild(details);

            // 3. Controlli in basso (Bottone e Contatore Tentativi)
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.justifyContent = 'space-between';
            controlsDiv.style.alignItems = 'center';
            controlsDiv.style.marginBottom = '5px'; // Spazio prima stato invio

            const stopButton = document.createElement('button');
            stopButton.id = 'stop-script-btn';
            // Testo impostato da updateStopButtonText
            stopButton.style.padding = '3px 8px';
            stopButton.style.fontSize = '11px';
            stopButton.addEventListener('click', () => {
                if (scriptAttivo) {
                    stopScript();
                } else {
                    startScript();
                }
            });
            controlsDiv.appendChild(stopButton);

            reloadCounterSpan = document.createElement('span');
            reloadCounterSpan.id = 'reload-counter-span';
            reloadCounterSpan.style.marginLeft = '10px'; // Spazio dal bottone
            // Testo impostato da updateReloadCounterUI
            controlsDiv.appendChild(reloadCounterSpan);
            uiContainer.appendChild(controlsDiv);

            // 4. Area Stato Invio
            submitStatusDiv = document.createElement('div');
            submitStatusDiv.id = 'submit-status-div';
            submitStatusDiv.style.paddingTop = '5px';
            submitStatusDiv.style.borderTop = '1px solid #ccc';
            submitStatusDiv.style.marginBottom = '5px'; // Spazio prima del countdown
            // Testo impostato da updateSubmitStatusUI
            uiContainer.appendChild(submitStatusDiv);

            // 5. Area Countdown (sotto stato invio)
            countdownSpan = document.createElement('span');
            countdownSpan.id = 'countdown-span';
            countdownSpan.style.fontSize = '0.9em';
            countdownSpan.style.color = '#666'; // Grigio, poco invasivo
            // Testo impostato da updateCountdownUI (se necessario)
            uiContainer.appendChild(countdownSpan);

            document.body.appendChild(uiContainer);

            // Aggiorna UI iniziale
            displayLogsInUI();
            updateStopButtonText();
            updateReloadCounterUI();
            updateSubmitStatusUI();
            updateCountdownUI(); // Aggiorna countdown all'inizio

        } else {
            document.addEventListener('DOMContentLoaded', createUI);
        }
    }

    // --- FUNZIONE DI LOGGING CUSTOM ---
    const originalConsoleLog = console.log;
    function customLog() {
        const timestamp = new Date().toLocaleTimeString();
        const message = Array.from(arguments).join(' ');
        const logMessage = `[${timestamp}] ${message}`;
        originalConsoleLog(logMessage);
        logs.push(logMessage);
        if (logs.length > 100) {
            logs.shift();
        }
        saveLogs();
        displayLogsInUI();
    }

    // --- AVVIO SCRIPT ---
    /* Vecchia logica rimossa:
    // Controllo successo invio PRIMA di tutto
    if (checkSubmitSuccess()) {
        customLog("Rilevato successo invio all'avvio, script fermato.");
        if (!document.getElementById('fesr-automation-ui')) {
            createUI(); // Crea UI per mostrare lo stato
        }
        loadScriptState(); // Carica stato per UI
        loadReloadCount(); // Carica conteggio per UI
        loadLogs(); // Carica log per UI
        displayLogsInUI();
        updateStopButtonText();
        updateReloadCounterUI();
        updateSubmitStatusUI();
        updateCountdownUI(); // Aggiorna anche countdown se necessario
        return;
    }
    */

    // 1. Carica tutti gli stati necessari
    loadScriptState(); // Determina lo stato attivo iniziale (considerando ora/manuale)
    loadReloadCount();
    loadLogs();

    // 2. Crea l'interfaccia utente
    createUI(); // Assicura che gli elementi UI esistano

    // 3. Aggiorna la UI con gli stati caricati
    // Eseguiti qui per assicurare che createUI sia stata completata
    displayLogsInUI();
    updateStopButtonText();
    updateReloadCounterUI();
    updateSubmitStatusUI();
    updateCountdownUI();

    // 4. Controlla se l'ultima azione è stata un invio (con successo o incerto)
    if (checkSubmitSuccess()) {
        // Successo confermato: checkSubmitSuccess ha già fermato lo script e aggiornato la UI.
        customLog("Rilevato successo invio confermato all'avvio. Script terminato.");
        return; // Interrompi l'esecuzione qui.
    } else {
        // Nessun successo confermato. Se c'era incertezza, la UI è stata aggiornata da checkSubmitSuccess.
        customLog("Controllo successo invio completato, nessun successo confermato rilevato.");
    }

    // 5. Esegui la logica principale solo se lo script è attualmente attivo
    if (scriptAttivo) {
        customLog("Script attivo, avvio handleInitialLoad...");
        setTimeout(handleInitialLoad, 500);
    } else {
        customLog("Script non attivo (in attesa di attivazione o fermato manualmente).");
    }

})();
// ==UserScript==
// @name         Automazione FESR Emilia-Romagna
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Automatizza alcune operazioni sul portale FESR, inclusa selezione soggetto e attivazione programmata
// @author       Tu
// @match        https://servizifederati.regione.emilia-Romagna.it/fesr2020/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- CONFIGURAZIONE INIZIALE ---
    // Valori iniziali nulli, verranno caricati o richiesti all'utente
    let fiscalCode = ''; // Default a vuoto
    let requestId = ''; // Default a vuoto, obbligatorio per partire
    let targetDetailPageUrl = null;

    let searchText = 'Invia domanda';
    const baseUrl = 'https://servizifederati.regione.emilia-Romagna.it/fesr2020/';
    // Chiavi localStorage
    const storageKeyScriptActive = 'fesrAutomationActive';
    const storageKeyScriptLogs = 'fesrAutomationLogs';
    const storageKeyScriptReloadCount = 'fesrAutomationReloadCount';
    const storageKeyScriptCfUrlMap = 'fesrAutomationCfUrlMap';
    const storageKeyScriptSubmitSuccess = 'fesrSubmitSuccess';
    const storageKeyFiscalCode = 'fesrFiscalCode'; // Nuova chiave
    const storageKeyRequestId = 'fesrRequestId';   // Nuova chiave
    // Altre costanti
    const maxReloads = 500;
    const SELEZIONE_SOGGETTO_URL = 'https://servizifederati.regione.emilia-romagna.it/fesr2020/selezione_soggetto/richieste_elenco';
    const activationDateTimeString = "2025-04-15T09:59:59.900";

    let scriptAttivo = true;
    let reloadCount = 0;
    let activationTimeoutId = null;
    let countdownIntervalId = null;
    let activationTime = new Date(activationDateTimeString).getTime();

    // Elementi UI
    let uiContainer;
    let notificationDiv;
    let logDiv;
    let logs = [];
    let reloadCounterSpan;
    let submitStatusDiv;
    let countdownSpan;
    let configInfoDiv = null; // Riferimento al div info config
    let editModal = null; // Riferimento alla modale
    let modalBackdrop = null; // Riferimento allo sfondo modale
    let fiscalCodeInput = null; // Riferimento input CF
    let requestIdInput = null; // Riferimento input Request ID

    // --- GESTIONE STORAGE CONFIGURAZIONE (CF / RequestID) ---
    function loadConfigValues() {
        const savedFiscalCode = localStorage.getItem(storageKeyFiscalCode);
        const savedRequestId = localStorage.getItem(storageKeyRequestId);

        // Carica CF (può essere vuoto)
        fiscalCode = savedFiscalCode !== null ? savedFiscalCode : '';
        // Carica Request ID (obbligatorio per l'avvio)
        requestId = savedRequestId !== null ? savedRequestId : '';

        customLog(`Valori caricati: CF=${fiscalCode || 'Nessuno'}, Richiesta=${requestId || 'Nessuna'}`);

        if (requestId) {
            updateTargetUrl();
        } else {
            targetDetailPageUrl = null; // Nessun URL target senza ID
        }
        // updateConfigInfoUI(); // Aggiornamento UI spostato dopo createUI
    }

    function saveConfigValues(newFiscalCode, newRequestId) {
        fiscalCode = newFiscalCode;
        requestId = newRequestId;
        localStorage.setItem(storageKeyFiscalCode, fiscalCode);
        localStorage.setItem(storageKeyRequestId, requestId);
        customLog(`Configurazione salvata: CF=${fiscalCode || 'Nessuno'}, Richiesta=${requestId}`);

        // Aggiorna l'URL target e l'info visualizzata subito
        if (requestId) {
            updateTargetUrl();
        } else {
            targetDetailPageUrl = null; // Rimuovi URL se ID non c'è
        }
        updateConfigInfoUI(); // Aggiorna CF | Richiesta nella UI

        // Verifica se la configurazione è ora valida
        const nowConfigReady = !!requestId;

        // Aggiorna la visibilità dell'intera UI
        updateUIVisibility(nowConfigReady);

        // Se la configurazione è diventata valida, resetta stati e avvia logica se script attivo
        if (nowConfigReady) {
            customLog("Configurazione valida salvata. Resetto stati e controllo se avviare.");
            resetReloadCount(); // Azzera tentativi
            localStorage.removeItem(storageKeyScriptSubmitSuccess); // Pulisci stato successo
            updateSubmitStatusUI(); // Aggiorna UI stato invio

            // Se lo script è attivo, avvia (o riavvia) la logica principale
            if (scriptAttivo) {
                customLog("Script attivo, avvio handleInitialLoad con nuova configurazione...");
                // Usa un piccolo timeout per dare tempo al DOM di aggiornarsi se necessario
                setTimeout(handleInitialLoad, 100);
            } else {
                customLog("Script non attivo, nessuna azione automatica avviata dopo salvataggio config.");
            }
        } else {
            // Se la configurazione NON è valida (ID Richiesta rimosso)
            customLog("Configurazione non valida salvata (manca ID Richiesta). Script in attesa.");
            // Assicurati che eventuali timer attivi vengano fermati se lo script non può procedere
            // (updateUIVisibility già nasconde i controlli, ma per sicurezza potremmo voler fermare processi)
            // stopScript(); // Potrebbe essere troppo aggressivo, l'utente potrebbe voler solo correggere
        }

        // RIMOSSO: window.location.reload(); // Non ricaricare la pagina
    }

    function updateTargetUrl() {
        targetDetailPageUrl = `${baseUrl}richieste/common/${requestId}/dettaglio`;
        customLog(`URL Pagina Dettaglio aggiornato: ${targetDetailPageUrl}`);
    }

    // --- GESTIONE DELLO STORAGE PER LO STATO ATTIVO ---
    function loadScriptState() {
        customLog("loadScriptState: Controllo stato attivazione...");
        const now = Date.now();
        const msUntilActivation = activationTime - now;
        const storedState = localStorage.getItem(storageKeyScriptActive);

        if (msUntilActivation > 0) {
            // Siamo prima dell'ora di attivazione
            if (storedState === 'true') {
                // Attivazione manuale anticipata rilevata da sessione precedente
                scriptAttivo = true;
                customLog("Stato attivato manualmente (prima dell'ora programmata) caricato da localStorage.");
                if (activationTimeoutId) clearTimeout(activationTimeoutId);
                if (countdownIntervalId) clearInterval(countdownIntervalId);
                activationTimeoutId = null;
                countdownIntervalId = null;
            } else {
                // Attesa attivazione programmata
                customLog(`Script in attesa. Attivazione programmata tra ${formatMilliseconds(msUntilActivation)}.`);
                scriptAttivo = false;
                saveScriptState();
                displayNotification(`Script in attesa. Attivazione tra ${formatMilliseconds(msUntilActivation)}`);

                if (activationTimeoutId) clearTimeout(activationTimeoutId);
                if (countdownIntervalId) clearInterval(countdownIntervalId);

                activationTimeoutId = setTimeout(activateScriptNow, msUntilActivation);
                countdownIntervalId = setInterval(updateCountdownUI, 1000);
            }
        } else {
            // Siamo dopo l'ora di attivazione o l'ora non è valida
            if (activationTime && !isNaN(activationTime)) {
                customLog("Ora di attivazione raggiunta o superata.");
            } else {
                customLog("Data/ora di attivazione non valida, lo script usa lo stato salvato.");
            }

            // Carica lo stato: attivo se salvato come tale, o di default se non salvato
            scriptAttivo = (storedState === 'true') || (storedState === null);
            if (storedState === null && scriptAttivo) {
                saveScriptState();
            }
        }
        customLog('Stato script finale caricato:', scriptAttivo);
        updateStopButtonText();
        updateCountdownUI();
    }

    function saveScriptState() {
        localStorage.setItem(storageKeyScriptActive, scriptAttivo);
    }

    // --- FUNZIONI ATTIVAZIONE PROGRAMMATA ---
    function activateScriptNow() {
        customLog("+++ ATTIVAZIONE AUTOMATICA +++");
        scriptAttivo = true;
        saveScriptState();
        activationTimeoutId = null;
        if (countdownIntervalId) {
            clearInterval(countdownIntervalId);
            countdownIntervalId = null;
            if (countdownSpan) countdownSpan.textContent = "Attivo!";
        }
        displayNotification("Script attivato automaticamente!");
        updateStopButtonText();
        handleInitialLoad();
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
                countdownSpan.textContent = "Attivato manualmente";
                if (countdownIntervalId) {
                    clearInterval(countdownIntervalId);
                    countdownIntervalId = null;
                }
            } else if (msRemaining <= 0 && activationTime && !isNaN(activationTime)) {
                countdownSpan.textContent = "Ora attivazione passata";
                if (countdownIntervalId) {
                    clearInterval(countdownIntervalId);
                    countdownIntervalId = null;
                }
            } else if (msRemaining > 0 && countdownIntervalId) {
                countdownSpan.textContent = `Attiva automaticamente tra: ${formatMilliseconds(msRemaining)}`;
            } else if (msRemaining > 0 && !countdownIntervalId && !scriptAttivo) {
                countdownSpan.textContent = "Attesa annullata.";
            } else {
                countdownSpan.textContent = "";
            }
        }
    }


    // --- GESTIONE DELLO STORAGE PER IL CONTATORE RICARICAMENTI ---
    function loadReloadCount() {
        const storedCount = localStorage.getItem(storageKeyScriptReloadCount);
        if (storedCount !== null) {
            reloadCount = parseInt(storedCount, 10) || 0;
        }
        customLog(`Contatore ricaricamenti caricato: ${reloadCount}/${maxReloads}`);
        updateReloadCounterUI();
    }

    function saveReloadCount() {
        localStorage.setItem(storageKeyScriptReloadCount, reloadCount.toString());
        customLog(`Contatore ricaricamenti salvato: ${reloadCount}`);
        updateReloadCounterUI();
    }

    function resetReloadCount() {
        reloadCount = 0;
        saveReloadCount(); // Salva 0 per persistenza
        customLog('Contatore ricaricamenti azzerato.');
        updateReloadCounterUI();
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
        displayLogsInUI();
    }

    function displayLogsInUI() {
        if (logDiv) {
            logDiv.innerHTML = '';
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
            localStorage.removeItem(storageKeyScriptCfUrlMap);
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

    function toggleScript() {
        if (scriptAttivo) {
            stopScript();
        } else {
            startScript();
        }
    }

    function toggleLogsVisibility() {
        if (!logDiv) return;
        const logVisible = logDiv.style.display !== 'none';
        logDiv.style.display = logVisible ? 'none' : 'block';
        const toggleLink = document.getElementById('fesr-toggle-log-link');
        if (toggleLink) {
            toggleLink.textContent = logVisible ? 'Mostra Log' : 'Nascondi Log';
        }
        if (!logVisible) {
            logDiv.scrollTop = logDiv.scrollHeight; // Scroll to bottom when showing
        }
    }

    function stopScript() {
        scriptAttivo = false;
        customLog('Script fermato.');
        displayNotification('Script fermato.');

        // Cancella timer se attivi
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
        saveScriptState();
        resetReloadCount();
        updateCountdownUI();
    }

    function startScript() {
        scriptAttivo = true;
        customLog('Script (ri)avviato dall\'utente.');

        // Cancella timer se attivi (attivazione manuale anticipata)
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
        saveScriptState();
        clearLogs();
        resetReloadCount();
        localStorage.removeItem(storageKeyScriptSubmitSuccess);
        updateSubmitStatusUI();
        updateCountdownUI();
        handleInitialLoad();
    }

    function updateStopButtonText() {
        const startButton = document.getElementById('fesr-start-button'); // Usa ID corretto
        if (startButton) {
            startButton.textContent = scriptAttivo ? 'Disattiva Script' : 'Attiva Script'; // Testo corretto
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
        // Imposta flag in sessionStorage per rilevare redirect o tentativi
        if (urlLower === targetDetailPageUrl.toLowerCase()) {
            sessionStorage.setItem('fesrNavAttempt', 'true');
        } else if (urlLower === SELEZIONE_SOGGETTO_URL.toLowerCase()) {
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
            // Non resettare contatore qui, permette al loop incerto di contare
            sessionStorage.setItem('fesrSubmitAttempt', 'true');
            customLog('Flag fesrSubmitAttempt impostato.');
            navigateTo(targetUrl);
        } else {
            // Eseguito solo se il BOTTONE non viene trovato
            customLog(`Bottone ${searchText} NON trovato sulla pagina dettaglio.`);
            reloadCount++;
            saveReloadCount();
            updateReloadCounterUI();
            if (reloadCount > maxReloads) {
                customLog(`Numero massimo di ricaricamenti (${maxReloads}) raggiunto senza trovare il bottone. Script fermato.`);
                displayNotification(`Max ricaricamenti (${maxReloads}) raggiunto. Script fermato.`);
                stopScript();
            } else {
                customLog(`Ricarico per cercare ancora il bottone (Tentativo ${reloadCount}/${maxReloads}).`);
                reloadPage();
            }
        }
    }

    function startSelezioneSoggettoFlow() {
        // Verifica se il fiscalCode è impostato prima di procedere con questo flusso
        if (!fiscalCode) {
            customLog("Codice Fiscale non impostato. Impossibile avviare flusso selezione soggetto. Tento accesso diretto a pagina dettaglio.");
            navigateTo(targetDetailPageUrl);
            return;
        }

        customLog("Redirect inaspettato rilevato. Avvio flusso alternativo: Selezione Soggetto.");
        const cfUrlMap = getCfUrlMap();
        const savedUrl = cfUrlMap[fiscalCode];

        if (savedUrl) {
            customLog(`URL per CF ${fiscalCode} trovato in memoria: ${savedUrl}. Navigo direttamente.`);
            navigateTo(savedUrl);
        } else {
            customLog(`Nessun URL salvato per CF ${fiscalCode}. Navigo alla pagina di selezione soggetto: ${SELEZIONE_SOGGETTO_URL}`);
            navigateTo(SELEZIONE_SOGGETTO_URL);
        }
    }

    function processSelezioneSoggettoPage() {
        // Verifica se il fiscalCode è impostato
        if (!fiscalCode) {
            customLog("Codice Fiscale non impostato. Impossibile processare pagina selezione soggetto. Fermo script.");
            stopScript();
            return;
        }

        customLog(`Sono sulla pagina Selezione Soggetto (${SELEZIONE_SOGGETTO_URL}). Cerco CF: ${fiscalCode}`);
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
        const selezioneSoggettoUrlLower = SELEZIONE_SOGGETTO_URL.toLowerCase();

        // Controlla redirect inaspettati post-navigazione
        const navAttempt = sessionStorage.getItem('fesrNavAttempt');
        if (navAttempt === 'true') {
            sessionStorage.removeItem('fesrNavAttempt');
            if (currentUrlLower === baseUrlLower) {
                // Siamo stati reindirizzati alla baseUrl dopo aver tentato di andare alla pagina dettaglio
                customLog('Redirect inaspettato alla base URL rilevato.');
                // Controlla SE è presente l'alert specifico "Soggetto non valido"
                const dangerAlert = document.querySelector('div.alert.alert-danger');
                if (dangerAlert && dangerAlert.textContent.trim().includes('Soggetto non valido')) {
                    // Alert specifico trovato -> Avvia flusso selezione soggetto
                    if (fiscalCode) {
                        customLog("Trovato alert 'Soggetto non valido'. Avvio flusso alternativo: Selezione Soggetto.");
                        startSelezioneSoggettoFlow();
                    } else {
                        customLog("Trovato alert 'Soggetto non valido' ma CF non impostato. Script fermato.");
                        stopScript();
                    }
                } else {
                    // Redirect alla base URL, MA senza l'alert specifico
                    // Consideralo un fallimento nel raggiungere la pagina dettaglio e ritenta.
                    customLog("Redirect alla base URL senza alert 'Soggetto non valido'. Ritento navigazione a pagina dettaglio.");
                    reloadCount++;
                    saveReloadCount();
                    updateReloadCounterUI();
                    if (reloadCount > maxReloads) {
                        customLog(`Numero massimo di tentativi (${maxReloads}) raggiunto per accedere alla pagina dettaglio. Script fermato.`);
                        displayNotification(`Max tentativi (${maxReloads}) accesso dettaglio raggiunto. Script fermato.`);
                        stopScript();
                    } else {
                        customLog(`Ritento accesso pagina dettaglio (Tentativo ${reloadCount}/${maxReloads}).`);
                        navigateTo(targetDetailPageUrl);
                    }
                }
                return; // Esce da handleInitialLoad dopo aver gestito il redirect
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

        // Logica principale basata sull'URL
        if (currentUrlLower.startsWith(baseUrlLower)) {
            if (currentUrlLower === targetDetailPageUrlLower) {
                customLog('Nella pagina di dettaglio corretta. Cerco il bottone...');
                checkAndNavigateButton();
            } else if (currentUrlLower === selezioneSoggettoUrlLower) {
                customLog('Nella pagina di Selezione Soggetto. Processo la tabella...');
                processSelezioneSoggettoPage();
            } else {
                // Pagina sconosciuta nel dominio corretto, tenta di andare alla pagina dettaglio
                customLog(`Pagina sconosciuta (${currentUrlLower}). Reindirizzo alla pagina dettaglio: ${targetDetailPageUrl}`);
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
            customLog('Flag fesrSubmitAttempt rilevato. Controllo risultato invio...');

            const wizardNav = document.querySelector('ul.nav.nav-pills.nav-wizard');

            let successAlert = false;

            if (wizardNav) {
                const wizardSteps = wizardNav.querySelectorAll('li');
                for (const step of wizardSteps) {
                    if (step.textContent.includes('Inviata') && step.classList.contains('active')) {
                        successAlert = true;
                        break;
                    }
                }
            }

            if (successAlert) {
                // Successo confermato  
                customLog('INVIO CON SUCCESSO CONFERMATO: Trovato div.alert.alert-success.');
                localStorage.setItem(storageKeyScriptSubmitSuccess, 'true');
                resetReloadCount();
                updateSubmitStatusUI();
                stopScript();
                return true;
            } else {
                customLog('Alert di successo (div.alert.alert-success) non trovato.');
                if (currentUrlLower === targetDetailPageUrlLower) {
                    // Caso incerto: tornato su pagina dettaglio senza alert
                    customLog('Invio INCERTO: Reindirizzato a pagina dettaglio ma senza alert di successo.');
                    displaySubmitWarningUI();
                    reloadCount++;
                    saveReloadCount();
                    updateReloadCounterUI();
                    if (reloadCount > maxReloads) {
                        customLog(`Numero massimo di tentativi (${maxReloads}) raggiunto dopo invio incerto. Script fermato.`);
                        displayNotification(`Max tentativi (${maxReloads}) raggiunto. Script fermato.`);
                        stopScript();
                        return true; // Indica di fermare l'avvio
                    } else {
                        customLog(`Invio incerto. Procedo con tentativo ${reloadCount}/${maxReloads}.`);
                        return false; // Lascia continuare lo script per retry
                    }
                } else {
                    // Probabilmente fallito o navigato altrove
                    customLog('Invio probabilmente fallito o navigato a pagina inaspettata. URL:', currentUrlLower);
                    updateSubmitStatusUI();
                    return false;
                }
            }
        }
        return false;
    }

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
                submitStatusDiv.textContent = 'Stato invio: non inviato';
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

    // --- CREAZIONE INTERFACCIA UTENTE ---
    function createUI() {
        if (document.getElementById('fesr-automation-ui')) {
            return;
        }
        if (document.body) {
            uiContainer = document.createElement('div');
            uiContainer.id = 'fesr-automation-ui';
            uiContainer.style.position = 'fixed';
            uiContainer.style.bottom = '10px';
            uiContainer.style.left = '10px';
            uiContainer.style.backgroundColor = 'rgba(240, 240, 240, 0.9)';
            uiContainer.style.padding = '10px';
            uiContainer.style.border = '1px solid #ccc';
            uiContainer.style.borderRadius = '5px';
            uiContainer.style.zIndex = '10000';
            uiContainer.style.fontSize = '12px';
            uiContainer.style.maxWidth = '300px';

            // Area Notifiche
            notificationDiv = document.createElement('div');
            notificationDiv.id = 'tm-notification';
            notificationDiv.style.marginBottom = '5px';
            notificationDiv.style.fontWeight = 'bold';
            notificationDiv.style.color = 'red';
            uiContainer.appendChild(notificationDiv);

            // Info Configurazione + Link Modifica
            const configContainer = document.createElement('div');
            configContainer.id = 'fesr-config-container';
            configContainer.style.marginBottom = '8px';
            configContainer.style.paddingTop = '5px';
            configContainer.style.borderTop = '1px solid #eee';

            configInfoDiv = document.createElement('div');
            configInfoDiv.style.fontSize = '0.9em';
            configInfoDiv.style.color = '#333';
            configInfoDiv.style.marginBottom = '3px';
            configContainer.appendChild(configInfoDiv);

            const editLink = document.createElement('a');
            editLink.textContent = 'Modifica';
            editLink.href = '#';
            editLink.style.fontSize = '10px';
            editLink.style.marginLeft = '5px';
            editLink.style.color = 'blue';
            editLink.style.textDecoration = 'underline';
            editLink.style.cursor = 'pointer';
            editLink.addEventListener('click', (e) => {
                e.preventDefault();
                showEditModal();
            });
            configContainer.appendChild(editLink);
            uiContainer.appendChild(configContainer);

            // Creazione Div Controlli Principali (pulsante Avvia/Ferma, tentativi)
            const controlsDiv = document.createElement('div');
            controlsDiv.id = 'fesr-controls-div';
            controlsDiv.style.marginBottom = '10px';

            // Pulsante Avvia/Ferma
            const startButton = document.createElement('button');
            startButton.id = 'fesr-start-button';
            startButton.textContent = scriptAttivo ? 'Disattiva Script' : 'Attiva Script';
            startButton.onclick = toggleScript;
            controlsDiv.appendChild(startButton);

            // Contatore Tentativi Reload
            reloadCounterSpan = document.createElement('span');
            reloadCounterSpan.id = 'fesr-reload-counter';
            reloadCounterSpan.style.marginLeft = '15px';
            updateReloadCounterUI(); // Imposta testo iniziale
            controlsDiv.appendChild(reloadCounterSpan);

            uiContainer.appendChild(controlsDiv); // Aggiungi div controlli

            // Creazione Countdown Timer (spostato qui, sotto i controlli)
            countdownSpan = document.createElement('div'); // Usiamo div per metterlo su nuova riga
            countdownSpan.id = 'fesr-countdown';
            countdownSpan.style.marginTop = '10px'; // Margine sopra
            updateCountdownUI(); // Imposta testo iniziale
            uiContainer.appendChild(countdownSpan); // Aggiungi timer sotto i controlli

            // Creazione Div Stato Invio
            submitStatusDiv = document.createElement('div');
            submitStatusDiv.id = 'fesr-submit-status-div';
            submitStatusDiv.style.marginTop = '10px';
            updateSubmitStatusUI();
            uiContainer.appendChild(submitStatusDiv);

            // Link Mostra/Nascondi Log
            const toggleLogLink = document.createElement('a');
            toggleLogLink.id = 'fesr-toggle-log-link';
            toggleLogLink.href = '#';
            toggleLogLink.textContent = 'Mostra Log';
            toggleLogLink.style.display = 'block'; // Inizia visibile (ma il log è nascosto)
            toggleLogLink.style.marginTop = '10px';
            toggleLogLink.onclick = (e) => {
                e.preventDefault();
                toggleLogsVisibility();
            };
            uiContainer.appendChild(toggleLogLink);

            // Area Log (inizia nascosta)
            logDiv = document.createElement('div');
            logDiv.id = 'tm-logs'; // Usa ID specifico per stile/selezione
            logDiv.style.maxHeight = '200px';
            logDiv.style.overflowY = 'auto';
            logDiv.style.border = '1px solid #ccc';
            logDiv.style.padding = '5px';
            logDiv.style.marginTop = '5px';
            logDiv.style.display = 'none'; // *** LOG CHIUSO DI DEFAULT ***
            uiContainer.appendChild(logDiv);

            document.body.appendChild(uiContainer);
            createEditModal();
        } else {
            document.addEventListener('DOMContentLoaded', createUI);
        }
    }

    // Aggiorna la visualizzazione CF | Richiesta nella UI
    function updateConfigInfoUI() {
        if (configInfoDiv) {
            configInfoDiv.textContent = `Richiesta: ${requestId || 'N/D'} | CF: ${fiscalCode || 'N/D'}`;
        }
    }

    // --- GESTIONE VISIBILITÀ UI --- 
    function updateUIVisibility(isConfigReady) {
        const fullUIElements = [
            document.getElementById('fesr-controls-div'),
            document.getElementById('fesr-submit-status-div'),
            document.getElementById('fesr-toggle-log-link'),
            // *** RIMOSSO logDiv da qui ***
        ];
        const configContainer = document.getElementById('fesr-config-container');

        if (isConfigReady) {
            customLog("Configurazione valida, mostro UI completa.");
            if (notificationDiv) {
                notificationDiv.innerHTML = ''; // Pulisci completamente
                notificationDiv.style.color = 'black'; // Ripristina colore default
                notificationDiv.style.fontWeight = 'normal';
                notificationDiv.style.cursor = 'default';
                notificationDiv.onclick = null; // Rimuovi eventuale listener precedente
            }
            fullUIElements.forEach(el => { if (el) el.style.display = ''; });
            if (configContainer) configContainer.style.display = '';
            // La visibilità del logDiv NON viene toccata qui, dipende solo dal toggle
            if (document.getElementById('fesr-toggle-log-link')) {
                document.getElementById('fesr-toggle-log-link').style.display = 'block'; // Mostra il link per aprirlo
            }
        } else {
            customLog("Configurazione non valida (manca ID Richiesta), mostro UI minimale.");
            if (notificationDiv) {
                notificationDiv.innerHTML = 'Inserisci Id richiesta per continuare. '; // Usa innerHTML per aggiungere link
                const clickHereLink = document.createElement('a');
                clickHereLink.textContent = 'Clicca qui.';
                clickHereLink.href = '#';
                clickHereLink.style.color = 'blue';
                clickHereLink.style.textDecoration = 'underline';
                clickHereLink.style.cursor = 'pointer';
                clickHereLink.onclick = (e) => {
                    e.preventDefault();
                    showEditModal();
                };
                notificationDiv.appendChild(clickHereLink);
                notificationDiv.style.color = 'black'; // Colore meno allarmante
                notificationDiv.style.fontWeight = 'normal';
                notificationDiv.style.cursor = 'default'; // Non rendere tutto il div cliccabile
            }
            // Nascondi elementi UI completa
            fullUIElements.forEach(el => { if (el) el.style.display = 'none'; });
            // Nascondi anche il link del log quando la config non è pronta
            const toggleLogLink = document.getElementById('fesr-toggle-log-link');
            if (toggleLogLink) toggleLogLink.style.display = 'none';
            // Nascondi container info config
            if (configContainer) configContainer.style.display = 'none';
            // Il countdownSpan rimane visibile
        }
    }

    // --- GESTIONE MODALE EDIT --- 
    function createEditModal() {
        // Stili (iniettati per semplicità)
        const styles = `
            #fesr-modal-backdrop {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background-color: rgba(0,0,0,0.5); z-index: 10001;
                display: none; /* Nascosto di default */
                justify-content: center; align-items: center;
            }
            #fesr-edit-modal {
                background-color: #fefefe; padding: 20px; border: 1px solid #888;
                border-radius: 5px; width: 80%; max-width: 400px;
            }
            #fesr-edit-modal label {
                display: block; margin-bottom: 5px; font-weight: bold;
            }
            #fesr-edit-modal input[type=text] {
                width: calc(100% - 12px); padding: 5px; margin-bottom: 10px;
                border: 1px solid #ccc; border-radius: 3px;
            }
            #fesr-edit-modal button {
                padding: 6px 12px; margin-top: 10px; border-radius: 3px;
                cursor: pointer; border: 1px solid #ccc;
            }
            #fesr-edit-modal button.save {
                background-color: #4CAF50; color: white; border-color: #4CAF50;
                margin-right: 5px;
            }
            #fesr-edit-modal button.cancel {
                background-color: #f44336; color: white; border-color: #f44336;
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);

        // Struttura HTML
        modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'fesr-modal-backdrop';
        modalBackdrop.style.position = 'fixed';
        modalBackdrop.style.top = '0'; modalBackdrop.style.left = '0'; modalBackdrop.style.width = '100%'; modalBackdrop.style.height = '100%';
        modalBackdrop.style.backgroundColor = 'rgba(0,0,0,0.5)'; modalBackdrop.style.zIndex = '10001';
        modalBackdrop.style.display = 'none';
        modalBackdrop.style.justifyContent = 'center'; modalBackdrop.style.alignItems = 'center';

        editModal = document.createElement('div');
        editModal.id = 'fesr-edit-modal';
        editModal.style.backgroundColor = '#fefefe'; editModal.style.padding = '20px'; editModal.style.border = '1px solid #888';
        editModal.style.borderRadius = '5px'; editModal.style.width = '80%'; editModal.style.maxWidth = '400px';

        const title = document.createElement('h3');
        title.textContent = 'Modifica Configurazione';
        editModal.appendChild(title);

        // *** SPOSTATO QUI: Campo ID Richiesta (prima del CF) ***
        const labelReqId = document.createElement('label');
        labelReqId.htmlFor = 'fesr-modal-reqid';
        labelReqId.textContent = 'ID Richiesta: '; // Rimosso "(Obbligatorio)"
        labelReqId.style.display = 'block';
        editModal.appendChild(labelReqId);

        requestIdInput = document.createElement('input');
        requestIdInput.type = 'text';
        requestIdInput.id = 'fesr-modal-reqid';
        requestIdInput.value = requestId || '';
        requestIdInput.style.display = 'block';
        requestIdInput.style.width = '90%';
        editModal.appendChild(requestIdInput);

        const reqHelpText = document.createElement('p');
        reqHelpText.textContent = "ID numerico della richiesta specifica (visibile in 'Presentazioni' > 'Elenco richieste' > tabella 'Elenco richieste'. Certe volte è necessario selezionare prima il soggetto).";
        reqHelpText.style.fontSize = '0.85em';
        reqHelpText.style.color = '#666';
        reqHelpText.style.marginTop = '-5px';
        reqHelpText.style.marginBottom = '10px';
        editModal.appendChild(reqHelpText);

        // *** Campo Codice Fiscale (ora dopo ID Richiesta) ***
        const cfLabel = document.createElement('label');
        cfLabel.textContent = 'Codice Fiscale (Opzionale):';
        cfLabel.htmlFor = 'fesr-cf-input';
        cfLabel.style.marginTop = '15px'; // Aggiunto spazio sopra
        fiscalCodeInput = document.createElement('input');
        fiscalCodeInput.type = 'text';
        fiscalCodeInput.id = 'fesr-cf-input';
        fiscalCodeInput.value = fiscalCode;
        editModal.appendChild(cfLabel);
        editModal.appendChild(fiscalCodeInput);

        const cfHelpText = document.createElement('p');
        cfHelpText.textContent = "Codice Fiscale del soggetto desiderato (visibile in 'Presentazioni' > 'Elenco richieste' > tabella 'Soggetti'). Lascia vuoto se non vedi la tabella soggetti.";
        cfHelpText.style.fontSize = '0.85em';
        cfHelpText.style.color = '#666';
        cfHelpText.style.marginTop = '-5px';
        cfHelpText.style.marginBottom = '10px';
        editModal.appendChild(cfHelpText);

        // Pulsante Salva
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Salva';
        saveButton.style.marginTop = '15px';
        saveButton.onclick = () => {
            const newCf = fiscalCodeInput.value.trim();
            const newReqId = requestIdInput.value.trim();

            // *** RIMOSSO CONTROLLO if (newReqId) ***
            // Ora salva sempre, anche se l'ID Richiesta è vuoto
            saveConfigValues(newCf, newReqId);
            hideEditModal();
            // Non serve più l'alert
            // else {
            //    alert('L\'ID Richiesta è obbligatorio.');
            // }
        };
        editModal.appendChild(saveButton);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Annulla';
        cancelButton.className = 'cancel';
        cancelButton.style.padding = '6px 12px'; cancelButton.style.marginTop = '10px'; cancelButton.style.borderRadius = '3px';
        cancelButton.style.cursor = 'pointer'; cancelButton.style.border = '1px solid #ccc';
        cancelButton.style.backgroundColor = '#f44336'; cancelButton.style.color = 'white'; cancelButton.style.borderColor = '#f44336';

        cancelButton.addEventListener('click', hideEditModal);
        editModal.appendChild(cancelButton);

        modalBackdrop.appendChild(editModal);
        document.body.appendChild(modalBackdrop);
    }

    function showEditModal() {
        if (modalBackdrop && fiscalCodeInput && requestIdInput) {
            fiscalCodeInput.value = fiscalCode;
            requestIdInput.value = requestId;
            modalBackdrop.style.display = 'flex';
        }
    }

    function hideEditModal() {
        if (modalBackdrop) {
            modalBackdrop.style.display = 'none';
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
        if (logs.length > 100) { // Limita dimensione log
            logs.shift();
        }
        saveLogs();
        displayLogsInUI();
    }

    // --- AVVIO SCRIPT ---
    // 1. Carica Config
    loadConfigValues();

    // 2. Crea UI (elementi nascosti/visibili in base alla config)
    createUI();

    // 3. Carica lo stato dello script (attivo/in attesa, imposta timer countdown se necessario)
    loadScriptState();

    // 4. Determina validità config
    const isConfigReady = !!requestId;

    // 5. Imposta visibilità UI in base alla config
    updateUIVisibility(isConfigReady);

    // 6. Aggiorna testo info config e testo countdown (ora viene fatto anche se config non pronta)
    updateConfigInfoUI();
    updateCountdownUI();

    // 7. Se la config non è pronta, ferma qui (ma timer e config sono visibili)
    if (!isConfigReady) {
        customLog("Script in attesa di configurazione (ID Richiesta).");
        return;
    }

    // --- Procedi solo se la configurazione è pronta ---
    customLog("Configurazione pronta, avvio caricamento stati...");

    // 8. Carica altri stati
    loadReloadCount();
    loadLogs();

    // 9. Aggiorna resto della UI
    displayLogsInUI();
    updateStopButtonText();
    updateReloadCounterUI();
    updateSubmitStatusUI();

    // 10. Controlla risultato invio precedente
    if (checkSubmitSuccess()) {
        customLog("Rilevato successo invio confermato all'avvio. Script terminato.");
        return;
    } else {
        customLog("Controllo successo invio completato, nessun successo confermato rilevato.");
    }

    // 11. Esegui logica principale se attivo
    if (scriptAttivo) {
        customLog("Script attivo, avvio handleInitialLoad...");
        setTimeout(handleInitialLoad, 500);
    } else {
        customLog("Script non attivo (in attesa di attivazione o fermato manualmente).");
    }

})();
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
    // const fiscalCode = '02700011204';
    // const requestId = '46530';
    const fiscalCode = '04026360364'; // Codice Fiscale da cercare nella selezione soggetto
    const requestId = '46317'; // ID della richiesta (costante modificabile)
    let searchText = 'Invia domanda'; // Testo del bottone da cercare (modificabile)
    const targetDetailPageUrl = `https://servizifederati.regione.emilia-Romagna.it/fesr2020/richieste/common/${requestId}/dettaglio`;
    const baseUrl = 'https://servizifederati.regione.emilia-Romagna.it/fesr2020/';
    const storageKeyScriptActive = 'fesrAutomationActive';
    const storageKeyScriptLogs = 'fesrAutomationLogs';
    const storageKeyScriptReloadCount = 'fesrAutomationReloadCount';
    const storageKeyScriptCfUrlMap = 'fesrAutomationCfUrlMap';
    const storageKeyScriptSubmitSuccess = 'fesrSubmitSuccess';
    const maxReloads = 5; // Numero massimo di ricaricamenti consentiti
    const SELEZIONE_SOGGETTO_URL = 'https://servizifederati.regione.emilia-romagna.it/fesr2020/selezione_soggetto/richieste_elenco';
    const activationDateTimeString = "2025-04-15T09:59:59.900"; // Data/ora attivazione (Formato ISO 8601)

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
                countdownSpan.textContent = `Attiva tra: ${formatMilliseconds(msRemaining)}`;
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
                    customLog("Trovato alert 'Soggetto non valido'. Avvio flusso alternativo: Selezione Soggetto.");
                    startSelezioneSoggettoFlow();
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

            const successAlert = document.querySelector('div.alert.alert-success');

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
            uiContainer.appendChild(notificationDiv);

            // Accordion Log
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Log Script';
            summary.style.cursor = 'pointer';
            summary.style.marginBottom = '5px';
            details.appendChild(summary);

            logDiv = document.createElement('div');
            logDiv.id = 'tm-logs';
            logDiv.style.fontSize = '0.9em';
            logDiv.style.maxHeight = '150px';
            logDiv.style.overflowY = 'auto';
            logDiv.style.backgroundColor = '#fff';
            logDiv.style.border = '1px solid #eee';
            logDiv.style.padding = '5px';
            logDiv.style.marginBottom = '10px';
            details.appendChild(logDiv);
            uiContainer.appendChild(details);

            // Controlli in basso
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.justifyContent = 'space-between';
            controlsDiv.style.alignItems = 'center';
            controlsDiv.style.marginBottom = '5px';

            const stopButton = document.createElement('button');
            stopButton.id = 'stop-script-btn';
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
            reloadCounterSpan.style.marginLeft = '10px';
            controlsDiv.appendChild(reloadCounterSpan);
            uiContainer.appendChild(controlsDiv);

            // Area Stato Invio
            submitStatusDiv = document.createElement('div');
            submitStatusDiv.id = 'submit-status-div';
            submitStatusDiv.style.paddingTop = '5px';
            submitStatusDiv.style.borderTop = '1px solid #ccc';
            submitStatusDiv.style.marginBottom = '5px';
            uiContainer.appendChild(submitStatusDiv);

            // Area Countdown
            countdownSpan = document.createElement('span');
            countdownSpan.id = 'countdown-span';
            countdownSpan.style.fontSize = '0.9em';
            countdownSpan.style.color = '#666';
            uiContainer.appendChild(countdownSpan);

            document.body.appendChild(uiContainer);
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
        if (logs.length > 100) { // Limita dimensione log
            logs.shift();
        }
        saveLogs();
        displayLogsInUI();
    }

    // --- AVVIO SCRIPT ---

    // 1. Carica stati
    loadScriptState();
    loadReloadCount();
    loadLogs();

    // 2. Crea UI
    createUI();

    // 3. Aggiorna UI
    displayLogsInUI();
    updateStopButtonText();
    updateReloadCounterUI();
    updateSubmitStatusUI();
    updateCountdownUI();

    // 4. Controlla risultato invio precedente (se c'è stato)
    if (checkSubmitSuccess()) {
        // Successo confermato: script fermato, esci
        customLog("Rilevato successo invio confermato all'avvio. Script terminato.");
        return;
    } else {
        // Nessun successo confermato (o invio incerto)
        customLog("Controllo successo invio completato, nessun successo confermato rilevato.");
    }

    // 5. Esegui logica principale se attivo
    if (scriptAttivo) {
        customLog("Script attivo, avvio handleInitialLoad...");
        setTimeout(handleInitialLoad, 500);
    } else {
        customLog("Script non attivo (in attesa di attivazione o fermato manualmente).");
    }

})();
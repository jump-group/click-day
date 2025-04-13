// ==UserScript==
// @name         Automazione FESR Emilia-Romagna
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Automatizza alcune operazioni sul portale FESR, inclusa la selezione soggetto
// @author       Tu
// @match        https://servizifederati.regione.emilia-Romagna.it/fesr2020/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const fiscalCode = '04026360364'; // Codice Fiscale da cercare nella selezione soggetto

    // --- CONFIGURAZIONE INIZIALE ---
    const requestId = '46317'; // ID della richiesta (costante modificabile)
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

    let scriptAttivo = true;
    let reloadCount = 0;
    let uiContainer;
    let notificationDiv;
    let logDiv;
    let logs = [];
    let reloadCounterSpan; // Aggiunta per riferimento allo span del contatore
    let submitStatusDiv; // Aggiunta per riferimento div stato invio

    // --- GESTIONE DELLO STORAGE PER LO STATO ATTIVO ---
    function loadScriptState() {
        const storedState = localStorage.getItem(storageKeyScriptActive);
        if (storedState !== null) {
            scriptAttivo = storedState === 'true';
        } else {
            scriptAttivo = true;
            saveScriptState();
        }
        customLog('Stato script caricato:', scriptAttivo);
        updateStopButtonText();
    }

    function saveScriptState() {
        localStorage.setItem(storageKeyScriptActive, scriptAttivo);
        customLog('Stato script salvato:', scriptAttivo);
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
        updateStopButtonText();
        saveScriptState();
        resetReloadCount(); // Azzera il contatore ricaricamenti
    }

    function startScript() {
        scriptAttivo = true;
        customLog('Script riavviato dall\'utente.');
        displayNotification('Script riavviato.');
        updateStopButtonText();
        saveScriptState();
        clearLogs();
        resetReloadCount();
        // Resetta anche lo stato di successo invio
        localStorage.removeItem(storageKeyScriptSubmitSuccess);
        updateSubmitStatusUI(); // Aggiorna UI dello stato invio
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
            resetReloadCount();
            // Imposta il flag di tentativo invio prima di navigare
            sessionStorage.setItem('fesrSubmitAttempt', 'true');
            customLog('Flag fesrSubmitAttempt impostato.');
            navigateTo(targetUrl);
            // Ferma lo script dopo aver iniziato la navigazione finale
            stopScript();
        } else {
            reloadCount++;
            // saveReloadCount(); // saveReloadCount viene già chiamato da reset/load/incremento
            updateReloadCounterUI(); // Aggiorna subito UI dopo incremento
            if (reloadCount > maxReloads) {
                customLog(`Numero massimo di ricaricamenti (${maxReloads}) raggiunto sulla pagina dettaglio. Flusso alternativo fallito o bottone non trovato. Script fermato.`);
                displayNotification(`Max ricaricamenti (${maxReloads}) raggiunto. Script fermato.`);
                stopScript(); // Ferma lo script
            } else {
                customLog(`Bottone non trovato sulla pagina dettaglio. Ricarico (Tentativo ${reloadCount}/${maxReloads}).`);
                // Salva il contatore prima di ricaricare
                saveReloadCount();
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
            if (cells.length >= 4) { // Assicurati che ci siano abbastanza celle
                const cfCell = cells[2]; // Terza cella per Codice Fiscale
                const actionCell = cells[3]; // Quarta cella per Azioni
                const linkElement = actionCell.querySelector('a.btn');

                if (cfCell && cfCell.textContent.trim() === fiscalCode && linkElement) {
                    customLog(`CF ${fiscalCode} trovato nella riga.`);
                    foundRow = true;
                    const relativeUrl = linkElement.getAttribute('href');
                    if (relativeUrl) {
                        // Costruisci l'URL completo usando il costruttore URL per la corretta risoluzione
                        // const fullUrl = (baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl) + relativeUrl;
                        const fullUrl = new URL(relativeUrl, baseUrl).href;
                        customLog(`URL estratto: ${relativeUrl}, URL completo calcolato: ${fullUrl}`);

                        // Salva nella mappa e naviga
                        const cfUrlMap = getCfUrlMap();
                        cfUrlMap[fiscalCode] = fullUrl;
                        saveCfUrlMap(cfUrlMap);

                        customLog(`URL salvato per CF ${fiscalCode}. Navigo a ${fullUrl}`);
                        navigateTo(fullUrl);
                    } else {
                        customLog("Errore: Link trovato ma senza attributo href.");
                        stopScript();
                    }
                    break; // Esci dal ciclo una volta trovata la riga
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
                // Invece di fermare, avvia il flusso alternativo
                startSelezioneSoggettoFlow();
                return; // Interrompi l'esecuzione di handleInitialLoad per questo ciclo
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
            // Siamo sul dominio corretto
            if (currentUrlLower === targetDetailPageUrlLower) {
                // Siamo sulla pagina di dettaglio corretta, cerca il bottone "Invia Domanda"
                customLog('Nella pagina di dettaglio corretta. Cerco il bottone...');
                checkAndNavigateButton();
            } else if (currentUrlLower === selezioneSoggettoUrlLower) {
                // Siamo sulla pagina di selezione soggetto, processala
                customLog('Nella pagina di Selezione Soggetto. Processo la tabella...');
                processSelezioneSoggettoPage();
            } else {
                // Siamo su un'altra pagina del dominio FESR (es. dopo selezione soggetto, o all'inizio)
                // Tentiamo di andare alla pagina di dettaglio desiderata.
                customLog(`Non sulla pagina dettaglio (${targetDetailPageUrlLower}) né sulla selezione soggetto (${selezioneSoggettoUrlLower}). Reindirizzo alla pagina dettaglio: ${targetDetailPageUrl}`);
                navigateTo(targetDetailPageUrl);
            }
        } else {
            // Dominio non corretto
            customLog('Dominio non corretto. Script non attivo su questa pagina.');
            // Non fare nulla, lo script non deve operare qui
        }
        customLog('--- Fine handleInitialLoad ---');
    }

    // --- GESTIONE STATO INVIO SUCCESSO ---
    function checkSubmitSuccess() {
        const submitAttempt = sessionStorage.getItem('fesrSubmitAttempt');
        const currentUrlLower = window.location.href.toLowerCase();
        const targetDetailPageUrlLower = targetDetailPageUrl.toLowerCase();

        if (submitAttempt === 'true') {
            sessionStorage.removeItem('fesrSubmitAttempt'); // Rimuovi sempre il flag di tentativo
            customLog('Flag fesrSubmitAttempt rilevato e rimosso.');
            if (currentUrlLower === targetDetailPageUrlLower) {
                customLog('INVIO CON SUCCESSO RILEVATO: Reindirizzamento alla pagina dettaglio dopo tentativo invio.');
                localStorage.setItem(storageKeyScriptSubmitSuccess, 'true');
                updateSubmitStatusUI(); // Aggiorna subito la UI
                stopScript(); // Ferma definitivamente lo script
                return true; // Indica che lo script deve fermarsi
            } else {
                customLog('Tentativo invio rilevato, ma non reindirizzato alla pagina dettaglio. URL:', currentUrlLower);
            }
        }
        return false; // Indica che lo script può continuare (se attivo)
    }

    function updateSubmitStatusUI() {
        if (submitStatusDiv) {
            const success = localStorage.getItem(storageKeyScriptSubmitSuccess) === 'true';
            submitStatusDiv.textContent = success ? 'Invio effettuato ✅' : 'Stato invio: -';
            submitStatusDiv.style.color = success ? 'green' : 'black';
            submitStatusDiv.style.fontWeight = success ? 'bold' : 'normal';
        }
    }

    // --- CREAZIONE INTERFACCIA UTENTE ---
    function createUI() {
        if (document.getElementById('fesr-automation-ui')) {
            // Evita di ricreare la UI se esiste già
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

            // 3. Controlli in basso (Bottone e Contatore)
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.justifyContent = 'space-between';
            controlsDiv.style.alignItems = 'center';

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

            // 4. Area Stato Invio (sotto i controlli)
            submitStatusDiv = document.createElement('div');
            submitStatusDiv.id = 'submit-status-div';
            submitStatusDiv.style.marginTop = '8px';
            submitStatusDiv.style.paddingTop = '5px';
            submitStatusDiv.style.borderTop = '1px solid #ccc';
            // Testo impostato da updateSubmitStatusUI
            uiContainer.appendChild(submitStatusDiv);

            document.body.appendChild(uiContainer);

            // Aggiorna UI iniziale
            displayLogsInUI();
            updateStopButtonText();
            updateReloadCounterUI();
            updateSubmitStatusUI(); // Chiamata iniziale per lo stato invio

        } else {
            document.addEventListener('DOMContentLoaded', createUI);
        }
    }

    // --- FUNZIONE AGGIORNAMENTO CONTATORE UI ---
    function updateReloadCounterUI() {
        if (reloadCounterSpan) {
            reloadCounterSpan.textContent = `Tentativi: ${reloadCount}/${maxReloads}`;
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
    // Controlla subito lo stato di successo PRIMA di caricare altro,
    // perché se l'invio è riuscito, lo script deve fermarsi.
    if (checkSubmitSuccess()) {
        // Se checkSubmitSuccess ritorna true, significa che ha rilevato il successo
        // e ha già chiamato stopScript(). Possiamo fermare l'esecuzione qui.
        customLog("Rilevato successo invio all'avvio, script fermato.");
        // Aggiorna comunque la UI creandola se necessario
        if (!document.getElementById('fesr-automation-ui')) {
            createUI();
        }
        // Assicurati che lo stato UI sia aggiornato
        loadScriptState();
        loadReloadCount();
        loadLogs();
        displayLogsInUI();
        updateStopButtonText();
        updateReloadCounterUI();
        updateSubmitStatusUI();
        return; // Interrompe l'esecuzione dello script
    }

    // Se non è stato rilevato successo, procedi con il caricamento normale
    loadScriptState();
    loadReloadCount();
    loadLogs();
    createUI();
    setTimeout(handleInitialLoad, 500);

})();
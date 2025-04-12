// ==UserScript==
// @name         Automazione FESR Emilia-Romagna
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatizza alcune operazioni sul portale FESR
// @author       Tu
// @match        https://servizifederati.regione.emilia-Romagna.it/fesr2020/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- CONFIGURAZIONE INIZIALE ---
    const requestId = '46317'; // ID della richiesta (costante modificabile)
    let searchText = 'Invia domanda'; // Testo del bottone da cercare (modificabile)
    const targetDetailPageUrl = `https://servizifederati.regione.emilia-Romagna.it/fesr2020/richieste/common/${requestId}/dettaglio`;
    const baseUrl = 'https://servizifederati.regione.emilia-Romagna.it/fesr2020/';
    const storageKeyActive = 'fesrAutomationActive';
    const storageKeyLogs = 'fesrAutomationLogs';

    let scriptAttivo = true; // Variabile per controllare se lo script è attivo (inizialmente attivo)
    let uiContainer;
    let notificationDiv;
    let logDiv;
    let logs = [];

    // --- GESTIONE DELLO STORAGE PER LO STATO ATTIVO ---
    function loadScriptState() {
        const storedState = localStorage.getItem(storageKeyActive);
        if (storedState !== null) {
            scriptAttivo = storedState === 'true';
        } else {
            scriptAttivo = true; // Imposta come attivo se non trovato nello storage
            saveScriptState(); // Salva lo stato iniziale
        }
        customLog('Stato script caricato:', scriptAttivo);
        updateStopButtonText();
    }

    function saveScriptState() {
        localStorage.setItem(storageKeyActive, scriptAttivo);
        customLog('Stato script salvato:', scriptAttivo);
    }

    // --- GESTIONE DELLO STORAGE PER I LOG ---
    function loadLogs() {
        const storedLogs = localStorage.getItem(storageKeyLogs);
        if (storedLogs) {
            logs = JSON.parse(storedLogs);
            // Non chiamiamo displayLogsInUI() qui, lo faremo dopo la creazione della UI
            // displayLogsInUI();
        }
    }

    function saveLogs() {
        localStorage.setItem(storageKeyLogs, JSON.stringify(logs));
    }

    function clearLogs() {
        logs = [];
        localStorage.removeItem(storageKeyLogs);
        displayLogsInUI();
    }

    function displayLogsInUI() {
        if (logDiv) {
            logDiv.innerHTML = ''; // Pulisci il contenuto precedente
            // Itera sull'array dei log in ordine inverso
            for (let i = logs.length - 1; i >= 0; i--) {
                const logEntry = document.createElement('div');
                logEntry.textContent = logs[i];
                logDiv.appendChild(logEntry);
            }
            // Non serve più scrollare in basso, i nuovi log sono in alto
            // logDiv.scrollTop = logDiv.scrollHeight;
        }
    }

    // --- FUNZIONI UTILI ---

    function stopScript() {
        scriptAttivo = false;
        customLog('Script fermato.');
        displayNotification('Script fermato.');
        updateStopButtonText();
        saveScriptState();
    }

    function startScript() {
        scriptAttivo = true;
        customLog('Script riavviato dall\'utente.');
        displayNotification('Script riavviato.');
        updateStopButtonText();
        saveScriptState();
        clearLogs(); // Azzera i log quando si riavvia lo script
        handleInitialLoad(); // Riavvia la logica principale dello script
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
        // Imposta un flag in sessionStorage se stiamo navigando alla pagina di dettaglio
        if (url.toLowerCase() === targetDetailPageUrl.toLowerCase()) {
            sessionStorage.setItem('fesrNavAttempt', 'true');
        }
        window.location.href = url;
    }

    function reloadPage() {
        customLog('Ricarico la pagina.');
        window.location.reload();
    }

    function checkAndNavigateButton() {
        if (!scriptAttivo) {
            return;
        }

        const buttons = document.querySelectorAll('a.btn');
        let foundButton = null;

        for (const button of buttons) {
            if (button.textContent.trim() === searchText || button.textContent.trim().startsWith(searchText.substring(0, searchText.indexOf(' ') > 0 ? searchText.indexOf(' ') : searchText.length))) {
                foundButton = button;
                break;
            }
        }

        if (foundButton) {
            const targetUrl = foundButton.getAttribute('href');
            customLog('Bottone trovato. Navigo a:', targetUrl);
            navigateTo(targetUrl);
            stopScript(); // Ferma lo script dopo aver raggiunto lo scopo
        } else {
            customLog('Bottone non trovato. Ricarico la pagina.');
            reloadPage();
        }
    }

    function handleInitialLoad() {
        customLog('URL corrente:', window.location.href); // Manteniamo questo log per debug
        if (!scriptAttivo) {
            customLog('Script non attivo.');
            return;
        }

        const currentUrlLower = window.location.href.toLowerCase();
        const baseUrlLower = baseUrl.toLowerCase();
        const targetDetailPageUrlLower = targetDetailPageUrl.toLowerCase();

        // Controlla se è stato appena tentato un reindirizzamento alla pagina dettaglio
        const navigationAttempt = sessionStorage.getItem('fesrNavAttempt');
        if (navigationAttempt === 'true') {
            sessionStorage.removeItem('fesrNavAttempt'); // Rimuovi il flag dopo averlo letto
            // Se il tentativo è stato fatto ma siamo sulla baseUrl, c'è stato un redirect inaspettato
            if (currentUrlLower === baseUrlLower) {
                customLog('Redirezione inaspettata alla base URL rilevata dopo tentativo di navigazione alla pagina dettaglio. Script fermato.');
                stopScript();
                return; // Interrompi l'esecuzione per questo caricamento
            }
            // Altrimenti, la navigazione potrebbe essere andata a buon fine o essere finita altrove,
            // lascia che la logica sottostante gestisca la situazione corrente.
        }

        // Logica principale di gestione URL
        if (currentUrlLower.startsWith(baseUrlLower)) {
            // Siamo sul dominio corretto
            if (currentUrlLower === targetDetailPageUrlLower) {
                // Siamo sulla pagina di dettaglio corretta, cerca il bottone
                customLog('Nella pagina di dettaglio corretta. Cerco il bottone...');
                checkAndNavigateButton();
            } else {
                // Siamo sul dominio corretto ma non sulla pagina di dettaglio, reindirizza
                customLog('Non nella pagina di dettaglio. Reindirizzo a:', targetDetailPageUrl);
                navigateTo(targetDetailPageUrl); // La funzione navigateTo imposterà il flag
            }
        } else {
            // Dominio non corretto
            customLog('Dominio non corretto. Script non attivo su questa pagina.');
        }
    }

    // --- CREAZIONE INTERFACCIA UTENTE ---
    function createUI() {
        if (document.body) {
            uiContainer = document.createElement('div');
            uiContainer.style.position = 'fixed';
            uiContainer.style.bottom = '10px';
            uiContainer.style.left = '10px';
            uiContainer.style.top = 'auto';
            uiContainer.style.backgroundColor = '#f0f0f0';
            uiContainer.style.padding = '10px';
            uiContainer.style.border = '1px solid #ccc';
            uiContainer.style.zIndex = '9999';

            const stopButton = document.createElement('button');
            stopButton.id = 'stop-script-btn';
            stopButton.textContent = scriptAttivo ? 'Ferma Script' : 'Avvia Script';
            stopButton.addEventListener('click', () => {
                if (scriptAttivo) {
                    stopScript();
                } else {
                    startScript();
                }
            });
            uiContainer.appendChild(stopButton);

            notificationDiv = document.createElement('div');
            notificationDiv.id = 'tm-notification';
            notificationDiv.style.marginTop = '5px';
            uiContainer.appendChild(notificationDiv);

            logDiv = document.createElement('div');
            logDiv.id = 'tm-logs';
            logDiv.style.marginTop = '10px';
            logDiv.style.fontSize = '0.8em';
            logDiv.style.maxHeight = '200px';
            logDiv.style.overflowY = 'auto';
            uiContainer.appendChild(logDiv);

            document.body.appendChild(uiContainer);

            // Mostra i log caricati ora che la UI è pronta
            displayLogsInUI();
        } else {
            // Se il body non è pronto, assicurati che i log vengano mostrati quando lo sarà
            document.addEventListener('DOMContentLoaded', () => {
                createUI(); // Riprova a creare la UI
                displayLogsInUI(); // Mostra i log dopo la creazione
            });
        }
    }

    // --- FUNZIONE DI LOGGING CUSTOM ---
    const originalConsoleLog = console.log;
    function customLog() {
        const message = Array.from(arguments).join(' ');
        originalConsoleLog(message);
        logs.push(message);
        saveLogs();
        displayLogsInUI();
    }

    // --- AVVIO SCRIPT ---
    customLog('Script Tampermonkey avviato.');
    loadScriptState(); // Carica lo stato dello script dallo storage
    loadLogs();      // Carica i log dallo storage
    createUI();      // Crea l'interfaccia utente
    handleInitialLoad(); // Avvia la logica principale all'avvio

})();
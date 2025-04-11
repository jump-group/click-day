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
            displayLogsInUI();
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
            logs.forEach(log => {
                const logEntry = document.createElement('div');
                logEntry.textContent = log;
                logDiv.appendChild(logEntry);
            });
            logDiv.scrollTop = logDiv.scrollHeight;
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

        if (currentUrlLower.startsWith(baseUrlLower) && currentUrlLower !== targetDetailPageUrlLower) {
            customLog('Reindirizzo alla pagina di dettaglio:', targetDetailPageUrl);
            navigateTo(targetDetailPageUrl);
            return; // Impedisce ulteriori esecuzioni di handleInitialLoad in questo ciclo
        } else if (currentUrlLower === targetDetailPageUrlLower) {
            if (currentUrlLower === baseUrlLower) {
                customLog('Redirezione inaspettata verso la base URL. Script fermato.');
                stopScript();
            } else {
                customLog('Nessuna redirezione inaspettata. Procedo con la ricerca del bottone.');
                checkAndNavigateButton();
            }
        } else if (!currentUrlLower.startsWith(baseUrlLower)) {
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
        } else {
            document.addEventListener('DOMContentLoaded', createUI);
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
document.addEventListener('DOMContentLoaded', () => {
    const btnAddRow = document.getElementById('btn-add-row');
    const container = document.getElementById('disciplines-container');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const consoleLog = document.getElementById('console-log');
    const statusDot = document.getElementById('global-status-dot');
    const statusText = document.getElementById('global-status-text');
    
    let eventSource = null;

    // Adiciona nova linha de disciplina
    btnAddRow.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'discipline-row';
        row.innerHTML = `
            <input type="text" class="input-code" placeholder="Código (Ex: CIC0004)" required autocomplete="off">
            <input type="text" class="input-turma" placeholder="Turma (Ex: A)" required autocomplete="off">
            <button type="button" class="btn-icon" onclick="removeRow(this)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        container.appendChild(row);
    });

    // Remove linha (definido globalmente para funcionar com onclick inline)
    window.removeRow = function(btn) {
        const rows = container.getElementsByClassName('discipline-row');
        if (rows.length > 1) {
            btn.closest('.discipline-row').remove();
        } else {
            appendLog('error', 'Você deve manter pelo menos uma disciplina.');
        }
    };

    // Adiciona log no console
    function appendLog(type, message) {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        const time = new Date().toLocaleTimeString();
        line.innerText = `[${time}] ${message}`;
        consoleLog.appendChild(line);
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    // Limpa console
    function clearLog() {
        consoleLog.innerHTML = '';
    }

    // Define status visual
    function setStatus(state) {
        statusDot.className = 'status-dot';
        if (state === 'idle') {
            statusDot.classList.add('active');
            statusText.innerText = 'Pronto';
        } else if (state === 'running') {
            statusDot.classList.add('running');
            statusText.innerText = 'Executando';
        } else {
            statusText.innerText = 'Desconectado';
        }
    }

    // Conecta à stream de logs do servidor
    function connectLogs() {
        if (eventSource) {
            eventSource.close();
        }
        
        eventSource = new EventSource('/api/logs');
        
        eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.message) {
                    appendLog(data.type, data.message);
                }
                
                if (data.status === 'finished' || data.status === 'stopped' || data.status === 'error') {
                    disconnectLogs();
                    btnStart.disabled = false;
                    btnStop.disabled = true;
                    setStatus('idle');
                }
            } catch(e) {
                appendLog('error', 'Falha ao processar mensagem do servidor: ' + event.data);
            }
        };

        eventSource.onerror = function() {
            appendLog('error', 'Conexão com a stream de logs perdida.');
            disconnectLogs();
            btnStart.disabled = false;
            btnStop.disabled = true;
            setStatus('idle');
        };
    }

    function disconnectLogs() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    }

    // Inicia o processo
    btnStart.addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const delay = parseInt(document.getElementById('step-delay').value) || 2000;
        
        if (!username || !password) {
            appendLog('error', 'Por favor, insira o usuário e a senha.');
            return;
        }

        // Coleta disciplinas
        const disciplines = [];
        const rows = container.getElementsByClassName('discipline-row');
        for (let row of rows) {
            const code = row.querySelector('.input-code').value.trim().toUpperCase();
            const turma = row.querySelector('.input-turma').value.trim().toUpperCase();
            if (code && turma) {
                disciplines.push({ code, turma });
            }
        }

        if (disciplines.length === 0) {
            appendLog('error', 'Por favor, insira pelo menos uma disciplina válida.');
            return;
        }

        btnStart.disabled = true;
        btnStop.disabled = false;
        setStatus('running');
        clearLog();
        appendLog('info', 'Iniciando conexão com o assistente...');

        // Conecta primeiro à stream de logs
        connectLogs();

        // Envia requisição de início
        try {
            const response = await fetch('/api/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, delay, disciplines })
            });
            const data = await response.json();
            if (response.status !== 200) {
                appendLog('error', 'Erro ao iniciar robô: ' + data.error);
                disconnectLogs();
                btnStart.disabled = false;
                btnStop.disabled = true;
                setStatus('idle');
            }
        } catch(err) {
            appendLog('error', 'Erro de rede: ' + err.message);
            disconnectLogs();
            btnStart.disabled = false;
            btnStop.disabled = true;
            setStatus('idle');
        }
    });

    // Para o processo
    btnStop.addEventListener('click', async () => {
        appendLog('info', 'Solicitando parada do processo...');
        try {
            const response = await fetch('/api/stop', { method: 'POST' });
            const data = await response.json();
            if (response.status === 200) {
                appendLog('warning', 'Processo de parada solicitado com sucesso.');
            } else {
                appendLog('error', 'Erro ao parar: ' + data.error);
            }
        } catch(err) {
            appendLog('error', 'Erro de rede ao parar: ' + err.message);
        }
    });

    // Set status inicial
    setStatus('idle');
});

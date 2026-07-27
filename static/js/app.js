document.addEventListener('DOMContentLoaded', () => {
    // Original elements
    const btnAddRow = document.getElementById('btn-add-row');
    const container = document.getElementById('disciplines-container');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const consoleLog = document.getElementById('console-log');
    const statusDot = document.getElementById('global-status-dot');
    const statusText = document.getElementById('global-status-text');
    const enrollmentStatus = document.getElementById('enrollment-status');
    
    // Tab and Recommender elements
    const tabDirect = document.getElementById('tab-direct');
    const tabRecommender = document.getElementById('tab-recommender');
    const contentDirect = document.getElementById('content-direct');
    const contentRecommender = document.getElementById('content-recommender');
    const btnImportHistory = document.getElementById('btn-import-history');
    const checklistGrid = document.getElementById('checklist-subjects-grid');
    const recommendedGrid = document.getElementById('recommended-subjects-grid');
    const btnAddRecommended = document.getElementById('btn-add-recommended');
    
    let eventSource = null;

    // --- CONFIGURAÇÃO DE ABAS ---
    tabDirect.addEventListener('click', () => {
        tabDirect.classList.add('active');
        tabRecommender.classList.remove('active');
        contentDirect.classList.add('active');
        contentRecommender.classList.remove('active');
    });

    tabRecommender.addEventListener('click', () => {
        tabRecommender.classList.add('active');
        tabDirect.classList.remove('active');
        contentRecommender.classList.add('active');
        contentDirect.classList.remove('active');
    });

    // --- CARREGAR GRADE CURRICULAR NO CHECKLIST ---
    const curriculumSubjects = [
        { code: 'CIC0004', name: 'Algoritmos e Prog. de Computadores (APC)' },
        { code: 'MAT0025', name: 'Cálculo 1' },
        { code: 'CIC0003', name: 'Intro. aos Sistemas Computacionais (ISC)' },
        { code: 'MAT0031', name: 'Intro. à Álgebra Linear (IAL)' },
        { code: 'CIC0090', name: 'Estruturas de Dados (ED)' },
        { code: 'MAT0026', name: 'Cálculo 2' },
        { code: 'CIC0099', name: 'Org. e Arq. de Computadores (OAC)' },
        { code: 'EST0023', name: 'Probabilidade e Estatística (PE)' },
        { code: 'CIC0097', name: 'Bancos de Dados (BD)' },
        { code: 'CIC0104', name: 'Software Básico (SB)' },
        { code: 'CIC0189', name: 'Proj. e Análise de Algoritmos (PAA)' },
        { code: 'MAT0034', name: 'Análise Numérica (AN)' },
        { code: 'CIC0093', name: 'Linguagens de Programação (LP)' },
        { code: 'CIC0124', name: 'Redes de Computadores (Redes)' },
        { code: 'CIC0182', name: 'Lógica Computacional 1 (LC1)' },
        { code: 'CIC0186', name: 'Teoria da Computação (TC)' },
        { code: 'CIC0101', name: 'Engenharia de Software (ES)' },
        { code: 'CIC0135', name: 'Intro. à Inteligência Artificial (IIA)' },
        { code: 'CIC0188', name: 'Sistemas Operacionais (SO)' },
        { code: 'CIC0169', name: 'Engenharia de Requisitos (ER)' },
        { code: 'CIC0202', name: 'Programação Concorrente (PC)' },
        { code: 'CIC0204', name: 'Computação Gráfica (CG)' },
        { code: 'CIC0203', name: 'Compiladores' },
        { code: 'CIC0205', name: 'Metodologia Científica (MC)' },
        { code: 'CIC0206', name: 'Trabalho de Graduação 1 (TG1)' },
        { code: 'CIC0207', name: 'Trabalho de Graduação 2 (TG2)' }
    ];

    function renderChecklist() {
        checklistGrid.innerHTML = '';
        curriculumSubjects.forEach(sub => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = `
                <input type="checkbox" value="${sub.code}" class="checklist-item-check">
                <span>${sub.code} - ${sub.name}</span>
            `;
            // Listener para recalcular recomendações ao alterar
            label.querySelector('input').addEventListener('change', updateRecommendations);
            checklistGrid.appendChild(label);
        });
    }

    // --- CHAMADA À API DE RECOMENDAÇÃO ---
    async function updateRecommendations() {
        const completed = [];
        document.querySelectorAll('.checklist-item-check:checked').forEach(cb => {
            completed.push(cb.value);
        });

        try {
            const response = await fetch('/api/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed })
            });
            const data = await response.json();
            renderRecommendations(data.recommended || []);
        } catch (err) {
            console.error('Erro ao buscar recomendações:', err);
        }
    }

    function renderRecommendations(recommended) {
        recommendedGrid.innerHTML = '';
        if (recommended.length === 0) {
            recommendedGrid.innerHTML = `
                <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1.5rem 0;">
                    Nenhuma matéria recomendada encontrada. Verifique o histórico acima.
                </div>
            `;
            btnAddRecommended.disabled = true;
            return;
        }

        recommended.forEach(course => {
            const prereqsText = course.prereqs.length > 0 
                ? `Requisito ${course.prereqs.join(', ')} concluído` 
                : 'Sem pré-requisitos';
                
            const div = document.createElement('div');
            div.className = 'recommend-item';
            div.innerHTML = `
                <div class="recommend-info">
                    <span class="recommend-code-name">${course.code} - ${course.name}</span>
                    <span class="recommend-reason">${prereqsText}</span>
                </div>
                <div class="recommend-select-area">
                    <input type="checkbox" value="${course.code}" class="recommended-item-check" checked>
                </div>
            `;
            recommendedGrid.appendChild(div);
        });
        btnAddRecommended.disabled = false;
    }

    // --- ADICIONAR RECOMENDADAS À MATRÍCULA ---
    btnAddRecommended.addEventListener('click', () => {
        const selectedRecommended = [];
        document.querySelectorAll('.recommended-item-check:checked').forEach(cb => {
            selectedRecommended.push(cb.value);
        });

        if (selectedRecommended.length === 0) return;

        // Limpa linhas em branco da matrícula direta
        const rows = container.getElementsByClassName('discipline-row');
        // Se a primeira linha estiver vazia, removemos para adicionar as novas
        if (rows.length === 1) {
            const codeInput = rows[0].querySelector('.input-code').value.trim();
            if (!codeInput) {
                rows[0].remove();
            }
        }

        // Adiciona as recomendadas com turma padrão 'A'
        selectedRecommended.forEach(code => {
            const row = document.createElement('div');
            row.className = 'discipline-row';
            row.innerHTML = `
                <input type="text" class="input-code" value="${code}" placeholder="Código (Ex: CIC0004)" required autocomplete="off">
                <input type="text" class="input-turma" value="A" placeholder="Turma (Ex: A)" required autocomplete="off">
                <button type="button" class="btn-icon" onclick="removeRow(this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            container.appendChild(row);
        });

        // Alterna para a aba de matrícula direta
        tabDirect.click();
        appendLog('success', `Adicionada(s) ${selectedRecommended.length} matéria(s) sugerida(s) à lista.`);
    });

    // --- IMPORTAR HISTÓRICO AUTOMATICAMENTE ---
    btnImportHistory.addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const mode = document.getElementById('mode').value;
        
        if (!username || !password) {
            appendLog('error', 'Por favor, insira o usuário e a senha do SIGAA para que o robô possa logar e ler seu histórico.');
            return;
        }

        btnImportHistory.disabled = true;
        btnStart.disabled = true;
        btnStop.disabled = false;
        setStatus('running');
        clearLog();
        appendLog('info', 'Iniciando robô para leitura automática de histórico escolar...');

        // Abre escuta de logs
        connectLogsForHistory();

        try {
            const response = await fetch('/api/import-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, mode })
            });
            const data = await response.json();
            if (response.status !== 200) {
                appendLog('error', 'Erro ao iniciar robô de importação: ' + data.error);
                disconnectLogs();
                btnImportHistory.disabled = false;
                btnStart.disabled = false;
                btnStop.disabled = true;
                setStatus('idle');
            }
        } catch (err) {
            appendLog('error', 'Erro de rede ao iniciar importação: ' + err.message);
            disconnectLogs();
            btnImportHistory.disabled = false;
            btnStart.disabled = false;
            btnStop.disabled = true;
            setStatus('idle');
        }
    });

    function connectLogsForHistory() {
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

                // Quando o histórico é importado com sucesso
                if (data.status === 'history_imported' && data.completed_codes) {
                    applyHistoryCodes(data.completed_codes);
                }
                
                if (data.status === 'finished' || data.status === 'stopped' || data.status === 'error' || data.status === 'history_imported') {
                    disconnectLogs();
                    btnImportHistory.disabled = false;
                    btnStart.disabled = false;
                    btnStop.disabled = true;
                    setStatus('idle');
                }
            } catch (e) {
                appendLog('error', 'Falha ao processar logs: ' + event.data);
            }
        };

        eventSource.onerror = function() {
            appendLog('error', 'Conexão de logs finalizada.');
            disconnectLogs();
            btnImportHistory.disabled = false;
            btnStart.disabled = false;
            btnStop.disabled = true;
            setStatus('idle');
        };
    }

    function applyHistoryCodes(codes) {
        // Desmarca tudo primeiro
        document.querySelectorAll('.checklist-item-check').forEach(cb => {
            cb.checked = false;
        });

        // Normaliza os códigos importados
        const normalizedCodes = codes.map(c => c.trim().toUpperCase().replace(/\s+/g, ''));

        // Marca as importadas com verificação robusta
        document.querySelectorAll('.checklist-item-check').forEach(cb => {
            const val = cb.value.trim().toUpperCase().replace(/\s+/g, '');
            if (normalizedCodes.includes(val)) {
                cb.checked = true;
            }
        });

        // Atualiza recomendações na tela
        updateRecommendations();
    }

    // --- ORIGINAL FUNCTIONALITIES ---

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

    // Remove linha
    window.removeRow = function(btn) {
        const rows = container.getElementsByClassName('discipline-row');
        if (rows.length > 1) {
            btn.closest('.discipline-row').remove();
        } else {
            appendLog('error', 'Você deve manter pelo menos uma disciplina.');
        }
    };

    function appendLog(type, message) {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        const time = new Date().toLocaleTimeString();
        line.innerText = `[${time}] ${message}`;
        consoleLog.appendChild(line);
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    function clearLog() {
        consoleLog.innerHTML = '';
    }

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
                
                if (data.enrollment_status) {
                    if (data.enrollment_status === 'open') {
                        enrollmentStatus.innerText = 'Aberto';
                        enrollmentStatus.style.color = '#10b981';
                    } else if (data.enrollment_status === 'closed') {
                        enrollmentStatus.innerText = 'Fechado';
                        enrollmentStatus.style.color = '#f43f5e';
                    }
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

    // Inicia o processo de matrícula
    btnStart.addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const delay = parseInt(document.getElementById('step-delay').value) || 2000;
        const mode = document.getElementById('mode').value;
        
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
        enrollmentStatus.innerText = 'Verificando...';
        enrollmentStatus.style.color = '#f59e0b';
        clearLog();
        appendLog('info', 'Iniciando conexão com o assistente...');

        // Conecta primeiro à stream de logs
        connectLogs();

        // Envia requisição de início
        try {
            const response = await fetch('/api/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, delay, disciplines, mode })
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

    // Inicialização da interface
    renderChecklist();
    updateRecommendations();
    setStatus('idle');
});

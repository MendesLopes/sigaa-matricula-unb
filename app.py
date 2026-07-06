import os
import threading
import time
import json
import queue
from flask import Flask, render_template, request, jsonify, Response, session, redirect, url_for
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'default-safe-secret-key-unb')

# Fila para transmitir logs em tempo real para o frontend
log_queue = queue.Queue()

class AutomationState:
    def __init__(self):
        self.is_running = False
        self.thread = None
        self.playwright_instance = None
        self.browser = None
        self.context = None
        self.page = None

state = AutomationState()

def log_msg(msg_type, message, status='running', enrollment_status=None):
    """Envia uma mensagem de log para a fila SSE."""
    data = {
        'type': msg_type,
        'message': message,
        'status': status
    }
    if enrollment_status:
        data['enrollment_status'] = enrollment_status
    log_queue.put(data)

def cleanup():
    """Fecha o navegador e limpa os estados da automação."""
    global state
    state.is_running = False
    try:
        if state.browser:
            state.browser.close()
    except Exception:
        pass
    state.browser = None
    state.context = None
    state.page = None
    state.playwright_instance = None

def run_automation(username, password, delay, disciplines, mode='real'):
    """Executa a automação de matrícula via Playwright."""
    global state
    state.is_running = True
    
    log_msg('info', 'Iniciando navegador automatizado (Chromium)...')
    
    try:
        with sync_playwright() as p:
            state.playwright_instance = p
            # Inicia o navegador em modo visível (headed=True) para permitir resolução do captcha e visualização
            state.browser = p.chromium.launch(headless=False, args=["--start-maximized"])
            state.context = state.browser.new_context(no_viewport=True)
            state.page = state.context.new_page()
            
            # 1. Navega para a página de login (Real ou Mock)
            if mode == 'didatico':
                log_msg('info', 'Acessando portal de login SIMULADO (Modo Didático)...')
                state.page.goto("http://127.0.0.1:5000/mock/login")
            else:
                log_msg('info', 'Acessando portal de autenticação unificada da UnB (Real)...')
                state.page.goto("https://autenticacao.unb.br/sso-server/login?service=https%3A%2F%2Fsig.unb.br%2Fsigaa%2Flogin%2Fcas")
            
            # Aguarda carregar o campo de login
            state.page.wait_for_selector("#username", timeout=30000)
            
            # Preenche os campos de credenciais
            log_msg('info', 'Preenchendo matrícula/usuário e senha...')
            state.page.fill("#username", username)
            state.page.fill("#password", password)
            
            # Foca no campo de captcha se houver, ou apenas aguarda o login do usuário
            log_msg('action', 'AÇÃO REQUERIDA: Preencha o CAPTCHA no navegador aberto e clique em "ENTRAR".')
            
            # Loop de espera pelo login (monitora se a URL mudou para o portal do discente ou se o botão sumiu)
            logged_in = False
            for _ in range(120):  # Espera por até 2 minutos (120 segundos)
                if not state.is_running:
                    break
                
                current_url = state.page.url
                # Verifica se entrou no SIGAA após login bem-sucedido
                if "/sigaa/portais/discente/discente.jsf" in current_url or "/sigaa/portais/discente/index.jsf" in current_url or state.page.locator("text=/Portal do Discente/i").count() > 0:
                    logged_in = True
                    break
                time.sleep(1)
                
            if not state.is_running:
                log_msg('warning', 'Processo interrompido pelo usuário.', 'stopped')
                cleanup()
                return
                
            if not logged_in:
                log_msg('error', 'Tempo limite excedido aguardando o login. Processo cancelado.', 'error')
                cleanup()
                return
                
            log_msg('success', 'Login detectado com sucesso! Acessando menu de matrícula...')
            time.sleep(delay / 1000.0)
            
            # 2. Navega até o menu de Matrícula
            # SIGAA tem menus flutuantes. Vamos simular hover no menu "Ensino" -> "Matrícula On-Line" -> "Realizar Matrícula"
            menu_expanded = False
            try:
                # Localiza a aba "Ensino"
                ensino_menu = state.page.locator("text=/Ensino/i").first
                ensino_menu.hover()
                log_msg('info', 'Menu "Ensino" selecionado.')
                time.sleep(1.0)
                
                # Localiza a opção "Matrícula On-Line"
                matricula_menu = state.page.locator("text=/Matrícula On-Line/i").first
                matricula_menu.hover()
                log_msg('info', 'Menu "Matrícula On-Line" selecionado.')
                time.sleep(1.0)
                
                # Clica em "Realizar Matrícula"
                realizar_btn = state.page.locator("text=/Realizar Matrícula/i").first
                realizar_btn.click()
                log_msg('info', 'Acessando tela de instruções de matrícula...')
                menu_expanded = True
            except Exception as e:
                log_msg('warning', f'Não foi possível navegar automaticamente pelo menu: {str(e)}')
                log_msg('action', 'Por favor, clique em Ensino > Matrícula On-Line > Realizar Matrícula manualmente no navegador.')
            
            # Aguarda a página de matrícula/instruções carregar e verifica se o período está aberto
            try:
                state.page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass

            time.sleep(2.0)
            page_text = state.page.content().lower()
            
            # Palavras-chave comuns do SIGAA quando a matrícula está fechada
            closed_keywords = [
                "fora do período", "não está ativo", "fora do prazo", "não iniciado", 
                "suspenso", "não permitido", "período de matrícula encerrado", 
                "não existe período", "nenhum período de matrícula"
            ]
            
            is_closed = any(kw in page_text for kw in closed_keywords)
            
            if is_closed:
                log_msg('error', 'O período de matrícula está FECHADO/INATIVO no SIGAA!', enrollment_status='closed')
            else:
                log_msg('success', 'O período de matrícula está ABERTO!', enrollment_status='open')

            try:
                state.page.wait_for_selector("text=/Iniciar seleção/i", timeout=15000)
                log_msg('success', 'Período de matrícula confirmado como ABERTO!', enrollment_status='open')
                state.page.locator("text=/Iniciar seleção/i").first.click()
                log_msg('success', 'Seleção de turmas iniciada!')
                time.sleep(delay / 1000.0)
            except Exception as e:
                log_msg('warning', 'Não localizei o botão "Iniciar seleção de turmas" automaticamente.')
                log_msg('action', 'Por favor, verifique o status da matrícula no navegador e clique em "Iniciar seleção" se disponível.')
                
            # 3. Processa cada disciplina da lista
            for disc in disciplines:
                if not state.is_running:
                    break
                
                code = disc['code']
                turma = disc['turma']
                log_msg('info', f'Buscando disciplina: {code} (Turma {turma})...')
                
                try:
                    # Encontra o campo de busca de código da disciplina
                    input_field = None
                    selectors = [
                        "input[name*='codigo']", 
                        "input[id*='codigo']", 
                        "input[name*='Codigo']", 
                        "input[id*='Codigo']",
                        "//label[contains(text(), 'Código')]/following::input[1]",
                        "//td[contains(text(), 'Código')]/following::input[1]"
                    ]
                    
                    for sel in selectors:
                        if state.page.locator(sel).count() > 0:
                            input_field = state.page.locator(sel).first
                            break
                    
                    if input_field:
                        input_field.fill(code)
                        time.sleep(0.5)
                    else:
                        log_msg('warning', f'Campo de inserção de código não encontrado para {code}. Digite manualmente no navegador.')
                        time.sleep(4)
                    
                    # Clica em "Buscar"
                    buscar_btn = None
                    buscar_selectors = [
                        "input[type='submit'][value*='Buscar']",
                        "input[type='submit'][value*='Pesquisar']",
                        "button[type='submit']:has-text('Buscar')",
                        "button:has-text('Buscar')",
                        "text=/Buscar/i",
                        "text=/Pesquisar/i"
                    ]
                    
                    for sel in buscar_selectors:
                        if state.page.locator(sel).count() > 0:
                            buscar_btn = state.page.locator(sel).first
                            break
                            
                    if buscar_btn:
                        buscar_btn.click()
                        time.sleep(delay / 1000.0)
                    else:
                        log_msg('warning', 'Botão "Buscar" não encontrado. Clique nele no navegador.')
                        time.sleep(4)
                    
                    # Localiza e adiciona a turma correspondente
                    # O script procura pela linha da tabela que contém o identificador da turma e clica no botão de adicionar
                    added = False
                    turma_selectors = [
                        f"//tr[contains(., '{turma}')]//a[contains(@title, 'Selecionar') or contains(@title, 'Adicionar') or contains(@alt, 'Adicionar')]",
                        f"//tr[contains(., 'Turma {turma}')]//a[contains(@title, 'Selecionar') or contains(@title, 'Adicionar') or contains(@alt, 'Adicionar')]",
                        f"//tr[contains(., '{turma}')]//input[@type='submit' or @type='image']",
                        f"//tr[contains(., '{turma}')]//a"
                    ]
                    
                    for sel in turma_selectors:
                        loc = state.page.locator(sel)
                        if loc.count() > 0:
                            loc.first.click()
                            added = True
                            log_msg('success', f'Disciplina {code} (Turma {turma}) adicionada com sucesso!')
                            break
                    
                    if not added:
                        log_msg('warning', f'Não consegui adicionar a Turma {turma} do código {code} de forma automática.')
                        log_msg('action', f'Adicione a Turma {turma} manualmente no navegador antes que o robô prossiga.')
                        time.sleep(8) # Aguarda o usuário interagir
                    else:
                        time.sleep(delay / 1000.0)
                        
                except Exception as ex:
                    log_msg('error', f'Erro ao processar disciplina {code}: {str(ex)}')
                    time.sleep(4)
            
            if not state.is_running:
                log_msg('warning', 'Processo interrompido.', 'stopped')
                cleanup()
                return
                
            log_msg('success', 'PROCESSO CONCLUÍDO: Todas as turmas da lista foram processadas!', 'finished')
            log_msg('action', 'Por favor, revise as turmas no carrinho e confirme sua matrícula manualmente para finalizar.')
            
    except Exception as e:
        log_msg('error', f'Erro crítico na automação: {str(e)}', 'error')
    finally:
        cleanup()

@app.before_request
def require_login():
    # Permite acesso ao login, arquivos estáticos e simulador sem autenticação do painel principal
    if request.endpoint in ['login_gate', 'static', 'mock_login', 'mock_portal', 'mock_matricula', 'mock_selecao']:
        return
        
    if not session.get('authenticated'):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Acesso não autorizado. Autentique-se primeiro.'}), 401
        return redirect(url_for('login_gate'))

@app.route('/login', methods=['GET', 'POST'])
def login_gate():
    if session.get('authenticated'):
        return redirect(url_for('index'))
        
    error = None
    if request.method == 'POST':
        password = request.form.get('password')
        if password == os.environ.get('GATE_PASSWORD', 'default-gate-pass'):
            session['authenticated'] = True
            return redirect(url_for('index'))
        else:
            error = 'Senha incorreta. Tente novamente.'
            
    return render_template('login.html', error=error)

@app.route('/')
def index():
    return render_template('index.html')

# --- ROTAS DE SIMULAÇÃO (MOCK / VERSÃO DIDÁTICA) ---

@app.route('/mock/login', methods=['GET', 'POST'])
def mock_login():
    if request.method == 'POST':
        # Qualquer login e captcha funcionam no mock para facilitar testes
        return redirect(url_for('mock_portal'))
    return render_template('mock_login.html')

@app.route('/mock/portal')
def mock_portal():
    return render_template('mock_portal.html')

@app.route('/mock/matricula')
def mock_matricula():
    return render_template('mock_matricula.html')

@app.route('/mock/selecao')
def mock_selecao():
    return render_template('mock_selecao.html')

@app.route('/api/start', methods=['POST'])
def start_bot():
    global state
    if state.is_running:
        return jsonify({'error': 'O robô já está em execução.'}), 400
        
    data = request.json
    username = data.get('username')
    password = data.get('password')
    delay = data.get('delay', 2000)
    disciplines = data.get('disciplines', [])
    mode = data.get('mode', 'real')
    
    if not username or not password:
        return jsonify({'error': 'Credenciais inválidas.'}), 400
        
    if not disciplines:
        return jsonify({'error': 'Nenhuma disciplina informada.'}), 400
        
    # Limpa logs antigos na fila
    while not log_queue.empty():
        try:
            log_queue.get_nowait()
        except queue.Empty:
            break
            
    # Inicia a automação em uma thread secundária
    state.thread = threading.Thread(
        target=run_automation, 
        args=(username, password, delay, disciplines, mode),
        daemon=True
    )
    state.thread.start()
    
    return jsonify({'status': 'started'})

@app.route('/api/stop', methods=['POST'])
def stop_bot():
    global state
    if not state.is_running:
        return jsonify({'error': 'O robô não está em execução.'}), 400
        
    log_msg('warning', 'Solicitação de parada recebida. Fechando navegador...', 'stopped')
    cleanup()
    return jsonify({'status': 'stopped'})

@app.route('/api/logs')
def stream_logs():
    def event_stream():
        while True:
            try:
                # Aguarda log com timeout para enviar heartbeat (keep-alive)
                data = log_queue.get(timeout=10)
                yield f"data: {json.dumps(data)}\n\n"
            except queue.Empty:
                # Envia um ping vazio para manter a conexão aberta
                yield f"data: {json.dumps({'type': 'info', 'message': '', 'status': 'running'})}\n\n"
    return Response(event_stream(), mimetype="text/event-stream")

if __name__ == '__main__':
    # Roda em localhost na porta 5000
    app.run(host='127.0.0.1', port=5000, debug=False)

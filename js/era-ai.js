// ============================================================
// ERA AI — Executive Resource & Analytics AI Assistant
// Enterprise Autonomous App Controller & Full-Screen Cockpit
// ============================================================

window.EraAI = {
    isOpen: false,
    isListening: false,
    recognition: null,
    apiKey: localStorage.getItem('era_gemini_api_key') || '',
    history: [],

    init() {
        if (document.getElementById('era-ai-overlay')) return;

        this._injectUI();
        this._initSpeech();
        this._bindEvents();
        this.updateTelemetry();

        // Subscribe to DB updates
        if (window.DB && typeof window.DB.subscribe === 'function') {
            window.DB.subscribe((event) => {
                if (['sync_success', 'card_added', 'card_updated', 'card_deleted', 'statement_added', 'payment_added'].includes(event)) {
                    this.updateTelemetry();
                }
            });
        }

        console.log('[EraAI] Full-Screen Executive Co-Pilot initialized.');
    },

    _injectUI() {
        // 1. Floating Action Launcher (Bottom Right)
        if (!document.getElementById('era-ai-fab')) {
            const fab = document.createElement('button');
            fab.id = 'era-ai-fab';
            fab.title = 'Open ERA AI Co-Pilot [Alt + A]';
            fab.setAttribute('onclick', 'EraAI.toggle()');
            fab.innerHTML = `
                <div class="era-fab-icon-wrap">
                    <div class="era-fab-pulse"></div>
                    <i class="fas fa-brain"></i>
                </div>
                <span>ERA AI</span>
                <span class="era-badge-pill">Cockpit</span>
            `;
            document.body.appendChild(fab);
        }

        // 2. Full-Screen Modal Overlay & Cockpit Window
        const overlay = document.createElement('div');
        overlay.id = 'era-ai-overlay';
        overlay.className = 'era-hidden';
        overlay.innerHTML = `
            <div id="era-ai-window">
                <!-- Top Header -->
                <div class="era-header">
                    <div class="era-header-left">
                        <div class="era-avatar">
                            <i class="fas fa-brain"></i>
                        </div>
                        <div class="era-title-box">
                            <h3>ERA AI Enterprise Co-Pilot <span class="era-badge-pill" style="font-size:0.65rem;">Active</span></h3>
                            <div class="era-subtitle">
                                <span class="era-status-dot"></span>
                                <span>Autonomous App Controller & Real-Time Portfolio Intelligence</span>
                            </div>
                        </div>
                    </div>
                    <div class="era-header-actions">
                        <button class="era-btn-icon" id="era-settings-btn" title="Gemini API Key Settings">
                            <i class="fas fa-cog"></i> <span>Settings</span>
                        </button>
                        <button class="era-btn-icon" id="era-clear-btn" title="Clear Chat History">
                            <i class="fas fa-trash-alt"></i> <span>Clear</span>
                        </button>
                        <button class="era-btn-icon era-close-btn" id="era-close-btn" title="Close [Esc]">
                            <i class="fas fa-times"></i> <span>Close [Esc]</span>
                        </button>
                    </div>
                </div>

                <!-- Main Cockpit Workspace -->
                <div class="era-workspace">
                    <!-- Left Sidebar Panel: Live Telemetry & Quick Commands -->
                    <div class="era-side-panel">
                        <!-- Live Telemetry Card -->
                        <div class="era-telemetry-card">
                            <div class="era-telemetry-title">
                                <i class="fas fa-shield-alt" style="color:#06d6a0;"></i>
                                <span>Live Portfolio Telemetry</span>
                            </div>
                            <div class="era-telemetry-grid">
                                <div class="era-telemetry-stat">
                                    <div class="era-stat-label">Active Cards</div>
                                    <div class="era-stat-val" id="era-stat-cards">0</div>
                                </div>
                                <div class="era-telemetry-stat">
                                    <div class="era-stat-label">Statements Due</div>
                                    <div class="era-stat-val" id="era-stat-dues" style="color:#f9c74f;">₹0</div>
                                </div>
                            </div>
                            <div class="era-telemetry-stat">
                                <div class="era-stat-label">Total Outstanding</div>
                                <div class="era-stat-val" id="era-stat-outstanding" style="color:#f87171;">₹0</div>
                            </div>
                            <div class="era-telemetry-stat">
                                <div class="era-stat-label">Total Credit Limit</div>
                                <div class="era-stat-val" id="era-stat-limit">₹0</div>
                                <div class="era-progress-wrap">
                                    <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#94a3b8;margin-top:6px;">
                                        <span>Utilization</span>
                                        <span id="era-stat-util-text" style="font-weight:700;color:#38bdf8;">0%</span>
                                    </div>
                                    <div class="era-progress-bar-bg">
                                        <div class="era-progress-bar-fill" id="era-stat-util-fill" style="width:0%;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Categorized Quick Commands -->
                        <div>
                            <div class="era-panel-section-title"><i class="fas fa-chart-line"></i> Financial Intelligence</div>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Give me an executive financial summary')">
                                <i class="fas fa-chart-pie" style="color:#4cc9f0;"></i> <span>Executive Summary</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Which cards have upcoming payment due dates?')">
                                <i class="fas fa-clock" style="color:#f9c74f;"></i> <span>Due Date Alerts</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Which cards have highest credit utilization?')">
                                <i class="fas fa-percentage" style="color:#ef476f;"></i> <span>Highest Utilization</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Check unbilled transactions')">
                                <i class="fas fa-receipt" style="color:#b5179e;"></i> <span>Unbilled Spends</span>
                            </button>
                        </div>

                        <div>
                            <div class="era-panel-section-title"><i class="fas fa-compass"></i> App Navigation</div>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Open Dashboard')">
                                <i class="fas fa-th-large" style="color:#38bdf8;"></i> <span>Go to Dashboard</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Open Card Master')">
                                <i class="fas fa-credit-card" style="color:#818cf8;"></i> <span>Go to Card Master</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Open Transactions')">
                                <i class="fas fa-exchange-alt" style="color:#a78bfa;"></i> <span>Go to Transactions</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Open Payments & Statements')">
                                <i class="fas fa-money-bill-wave" style="color:#34d399;"></i> <span>Go to Payments</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Open Download Dashboard')">
                                <i class="fas fa-file-pdf" style="color:#f87171;"></i> <span>Download Dashboard</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Open Data Hygiene')">
                                <i class="fas fa-broom" style="color:#fbbf24;"></i> <span>Data Hygiene</span>
                            </button>
                        </div>

                        <div>
                            <div class="era-panel-section-title"><i class="fas fa-bolt"></i> Autonomous Operations</div>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Sync data with Google Sheets')">
                                <i class="fas fa-sync-alt" style="color:#06d6a0;"></i> <span>Cloud Sync Now</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Export database to Excel')">
                                <i class="fas fa-file-excel" style="color:#10b981;"></i> <span>Export Database Excel</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Add new card')">
                                <i class="fas fa-plus-circle" style="color:#60a5fa;"></i> <span>Add New Card</span>
                            </button>
                            <button class="era-side-action-btn" onclick="EraAI.sendQuickPrompt('Change password')">
                                <i class="fas fa-key" style="color:#fbbf24;"></i> <span>Change Password</span>
                            </button>
                        </div>
                    </div>

                    <!-- Right Main Panel: Conversational Stream & Input -->
                    <div class="era-main-panel">
                        <div class="era-messages" id="era-messages">
                            <div class="era-msg era-msg-ai">
                                <div class="era-msg-avatar"><i class="fas fa-brain"></i></div>
                                <div class="era-msg-bubble">
                                    <p>👋 <strong>Namaste! Main hoon ERA AI</strong> — aapka Full-Screen Executive Co-Pilot & Autonomous App Controller.</p>
                                    <p>Main pure system ka live data access kar sakta hoon aur direct operations perform kar sakta hoon:</p>
                                    <ul>
                                        <li>🚀 <strong>App Navigation</strong>: <em>"Open Card Master"</em>, <em>"Go to Reports"</em>, <em>"Open Payments"</em>, <em>"Open Download Dashboard"</em></li>
                                        <li>⚡ <strong>Actions Execution</strong>: <em>"Sync with cloud"</em>, <em>"Export Excel"</em>, <em>"Add new card"</em>, <em>"Change password"</em></li>
                                        <li>📊 <strong>Portfolio Analytics</strong>: <em>"Total outstanding kitna hai?"</em>, <em>"Highest utilization cards kaunse hain?"</em>, <em>"Upcoming bill dates alert"</em></li>
                                    </ul>
                                    <p style="margin-top:8px;font-size:0.85rem;color:#94a3b8;">Left panel me diye gaye quick actions use karein ya niche box me command type karein / voice me bole!</p>
                                </div>
                            </div>
                        </div>

                        <!-- Big Input Bar -->
                        <div class="era-input-container">
                            <div class="era-input-wrap">
                                <button class="era-input-btn" id="era-mic-btn" title="Voice Input (Speech-to-Text)">
                                    <i class="fas fa-microphone"></i>
                                </button>
                                <textarea id="era-input" rows="1" placeholder="Ask ERA AI or command the app (e.g. 'Open Reports', 'Total balance kitna hai?', 'Sync cloud')..."></textarea>
                                <button class="era-input-btn" id="era-send-btn" title="Send message">
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    _bindEvents() {
        const overlay = document.getElementById('era-ai-overlay');
        const win = document.getElementById('era-ai-window');
        const closeBtn = document.getElementById('era-close-btn');
        const clearBtn = document.getElementById('era-clear-btn');
        const settingsBtn = document.getElementById('era-settings-btn');
        const sendBtn = document.getElementById('era-send-btn');
        const input = document.getElementById('era-input');
        const micBtn = document.getElementById('era-mic-btn');

        // Close on clicking close button or clicking overlay backdrop
        closeBtn.addEventListener('click', () => this.toggle(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.toggle(false);
        });

        // Clear Chat
        clearBtn.addEventListener('click', () => {
            const container = document.getElementById('era-messages');
            if (container) {
                container.innerHTML = `
                    <div class="era-msg era-msg-ai">
                        <div class="era-msg-avatar"><i class="fas fa-brain"></i></div>
                        <div class="era-msg-bubble">
                            <p>Chat history cleared. How can I assist you with your cards, analytics, or app controls right now?</p>
                        </div>
                    </div>`;
            }
            this.history = [];
        });

        // Settings (Gemini API Key)
        settingsBtn.addEventListener('click', () => this.showSettingsModal());

        // Send Message
        sendBtn.addEventListener('click', () => this.handleSend());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        // Voice Input
        if (micBtn) {
            micBtn.addEventListener('click', () => this.toggleVoice());
        }

        // Global Shortcuts: Alt + A or Ctrl + Space to toggle, Escape to close
        document.addEventListener('keydown', (e) => {
            if ((e.altKey && (e.key === 'a' || e.key === 'A')) || (e.ctrlKey && e.code === 'Space')) {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.toggle(false);
            }
        });
    },

    toggle(forceState) {
        const overlay = document.getElementById('era-ai-overlay');
        if (!overlay) return;
        this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
        overlay.classList.toggle('era-hidden', !this.isOpen);

        if (this.isOpen) {
            this.updateTelemetry();
            setTimeout(() => {
                const input = document.getElementById('era-input');
                if (input) input.focus();
            }, 100);
        }
    },

    updateTelemetry() {
        const cards = (window.DB && window.DB.data && window.DB.data.credit_cards) || [];
        const stmts = (window.DB && window.DB.data && window.DB.data.statements) || [];

        let totalLimit = 0, totalBal = 0;
        cards.forEach(c => {
            totalLimit += Utils.parseNum(c.credit_limit || 0);
            totalBal += Utils.parseNum(c.current_balance || c.balance || 0);
        });

        let pendingDues = 0;
        stmts.filter(s => (s.payment_status || 'Pending').toLowerCase() !== 'paid').forEach(s => {
            pendingDues += Utils.parseNum(s.closing_outstanding || s.billed_amount || 0);
        });

        const activeCount = cards.filter(c => (c.status || 'Active').toLowerCase() === 'active').length;
        const utilPercent = totalLimit > 0 ? ((totalBal / totalLimit) * 100).toFixed(1) : '0';

        const elCards = document.getElementById('era-stat-cards');
        const elLimit = document.getElementById('era-stat-limit');
        const elOut = document.getElementById('era-stat-outstanding');
        const elDues = document.getElementById('era-stat-dues');
        const elUtilText = document.getElementById('era-stat-util-text');
        const elUtilFill = document.getElementById('era-stat-util-fill');

        if (elCards) elCards.textContent = activeCount;
        if (elLimit) elLimit.textContent = `₹${Math.round(totalLimit).toLocaleString('en-IN')}`;
        if (elOut) elOut.textContent = `₹${Math.round(totalBal).toLocaleString('en-IN')}`;
        if (elDues) elDues.textContent = `₹${Math.round(pendingDues).toLocaleString('en-IN')}`;
        if (elUtilText) elUtilText.textContent = `${utilPercent}%`;
        if (elUtilFill) elUtilFill.style.width = `${Math.min(100, Math.max(0, parseFloat(utilPercent)))}%`;
    },

    _initSpeech() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-IN';

        this.recognition.onstart = () => {
            this.isListening = true;
            const mic = document.getElementById('era-mic-btn');
            if (mic) mic.classList.add('listening');
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const input = document.getElementById('era-input');
            if (input) {
                input.value = transcript;
                this.handleSend();
            }
        };

        this.recognition.onerror = () => {
            this.isListening = false;
            const mic = document.getElementById('era-mic-btn');
            if (mic) mic.classList.remove('listening');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            const mic = document.getElementById('era-mic-btn');
            if (mic) mic.classList.remove('listening');
        };
    },

    toggleVoice() {
        if (!this.recognition) {
            if (window.App) window.App.showToast('Speech Recognition not supported in this browser.', 'warning');
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
        } else {
            try {
                this.recognition.start();
            } catch(e) {
                console.warn('Speech start error:', e);
            }
        }
    },

    sendQuickPrompt(promptText) {
        const input = document.getElementById('era-input');
        if (input) {
            input.value = promptText;
            this.handleSend();
        }
    },

    async handleSend() {
        const input = document.getElementById('era-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        input.value = '';

        // Add user message to UI
        this._appendMessage('user', text);

        // Show typing indicator
        const typingId = this._appendTyping();

        // Process message through autonomous controller & financial AI
        try {
            const response = await this.processCommand(text);
            this._removeTyping(typingId);
            this._appendMessage('ai', response.text, response.actionCard);
        } catch(err) {
            this._removeTyping(typingId);
            this._appendMessage('ai', `⚠️ An error occurred while processing: ${err.message}`);
        }
    },

    // ── CORE AUTONOMOUS APP CONTROLLER & FINANCIAL INTELLIGENCE ───
    async processCommand(query) {
        const q = query.toLowerCase().trim();
        const cards = (window.DB && window.DB.data && window.DB.data.credit_cards) || [];
        const txns = (window.DB && window.DB.data && window.DB.data.transactions) || [];
        const stmts = (window.DB && window.DB.data && window.DB.data.statements) || [];
        const payments = (window.DB && window.DB.data && window.DB.data.payments) || [];
        const unbilled = (window.DB && window.DB.data && window.DB.data.unbilled) || [];

        // 1. NAVIGATION COMMANDS
        if (q.includes('dashboard') && (q.includes('open') || q.includes('go') || q.includes('show') || q === 'dashboard')) {
            if (q.includes('download')) {
                if (window.App) window.App.navigate('downlodedash');
                return {
                    text: `🚀 Navigated to **Download Dashboard**! You can customize and generate your high-resolution Executive PDF report here.`,
                    actionCard: { title: 'PDF Generator', label: 'Generate PDF Report', onClick: 'DownloadDash.exportToPdf()' }
                };
            }
            if (window.App) window.App.navigate('dashboard');
            return { text: `🚀 Navigated to **Main Dashboard** for you!` };
        }

        if ((q.includes('card master') || q.includes('cards') || q.includes('credit cards')) && (q.includes('open') || q.includes('go') || q.includes('show') || q.includes('list'))) {
            if (window.App) window.App.navigate('master');
            return {
                text: `💳 Navigated to **Card Master**. You are currently managing **${cards.length} cards** across all corporate entities.`,
                actionCard: { title: 'Card Action', label: 'Add New Card', onClick: 'Master.showAddModal()' }
            };
        }

        if (q.includes('zoho') || (q.includes('import') && !q.includes('db'))) {
            if (window.App) window.App.navigate('import');
            return { text: `📥 Navigated to **Zoho Import**. You can upload your credit card excel sheets or CSV ledgers here.` };
        }

        if (q.includes('transaction') && (q.includes('open') || q.includes('go') || q.includes('show') || q.includes('list'))) {
            if (window.App) window.App.navigate('transactions');
            return {
                text: `📊 Navigated to **Transactions** (${txns.length} records in database).`,
                actionCard: { title: 'New Entry', label: 'Add Transaction', onClick: 'Transactions.showAddModal()' }
            };
        }

        if ((q.includes('payment') || q.includes('statement')) && (q.includes('open') || q.includes('go') || q.includes('show'))) {
            if (window.App) window.App.navigate('payments');
            return {
                text: `💰 Navigated to **Payments & Statements**. Statements tracked: **${stmts.length}**, Total Payments: **${payments.length}**.`,
                actionCard: { title: 'Payment Action', label: 'Record New Payment', onClick: 'Payments.showAddModal()' }
            };
        }

        if (q.includes('report') && (q.includes('open') || q.includes('go') || q.includes('show'))) {
            if (window.App) window.App.navigate('reports');
            return { text: `📈 Navigated to **Financial Reports & Analytics**.` };
        }

        if (q.includes('hygiene') || q.includes('data hygiene') || q.includes('clean')) {
            if (window.App) window.App.navigate('hygiene');
            return { text: `🧹 Navigated to **Data Hygiene Engine**. Scans for missing statement months, unmapped cards, and negative balances.` };
        }

        if (q.includes('user') && (q.includes('open') || q.includes('go') || q.includes('show') || q.includes('manage'))) {
            if (window.App) window.App.navigate('users');
            return { text: `👥 Navigated to **User Management**.` };
        }

        if (q.includes('log') || q.includes('audit')) {
            if (window.App) window.App.navigate('logs');
            return { text: `📜 Navigated to **Activity & Security Audit Logs**.` };
        }

        // 2. ACTION EXECUTION COMMANDS
        if (q.includes('sync') || q.includes('cloud sync') || q.includes('refresh data')) {
            if (window.DB && typeof window.DB.syncFromCloud === 'function') {
                if (window.App) window.App.showToast('ERA AI triggering Cloud Sync...', 'info');
                await window.DB.syncFromCloud(true);
                this.updateTelemetry();
                return { text: `✅ **Cloud Sync Successful!** All tables (Cards, Txns, Statements, Payments, Unbilled) are synced and encrypted in local AES-256 store.` };
            }
        }

        if (q.includes('export') && (q.includes('db') || q.includes('database') || q.includes('excel'))) {
            if (window.DB && typeof window.DB.exportToExcel === 'function') {
                window.DB.exportToExcel();
                return { text: `📥 **Database Excel Export Initiated!** Complete multi-sheet backup has been downloaded to your system.` };
            }
        }

        if (q.includes('add card') || q.includes('new card')) {
            this.toggle(false);
            if (window.Master && typeof window.Master.showAddModal === 'function') {
                window.Master.showAddModal();
                return { text: `➕ Opened **Add New Card** modal dialog for you.` };
            }
        }

        if (q.includes('add transaction') || q.includes('new transaction') || q.includes('record spend')) {
            this.toggle(false);
            if (window.Transactions && typeof window.Transactions.showAddModal === 'function') {
                window.Transactions.showAddModal();
                return { text: `➕ Opened **Add Transaction** form modal.` };
            }
        }

        if (q.includes('record payment') || q.includes('add payment') || q.includes('pay bill')) {
            this.toggle(false);
            if (window.Payments && typeof window.Payments.showAddModal === 'function') {
                window.Payments.showAddModal();
                return { text: `💳 Opened **Record Payment** modal dialog.` };
            }
        }

        if (q.includes('change password') || q.includes('update password')) {
            this.toggle(false);
            if (window.Auth && typeof window.Auth.showChangePasswordModal === 'function') {
                window.Auth.showChangePasswordModal();
                return { text: `🔑 Opened **Change Password** security modal.` };
            }
        }

        if (q.includes('download pdf') || q.includes('export pdf') || q.includes('download dashboard')) {
            if (window.App) window.App.navigate('downlodedash');
            setTimeout(() => {
                if (window.DownloadDash && typeof window.DownloadDash.exportToPdf === 'function') {
                    window.DownloadDash.exportToPdf();
                }
            }, 600);
            return { text: `📄 Navigating to **Download Dashboard** and auto-generating the Executive PDF Report...` };
        }

        if (q.includes('toggle sidebar') || q.includes('hide sidebar') || q.includes('show sidebar')) {
            document.body.classList.toggle('sidebar-collapsed');
            return { text: `↔️ Sidebar toggled.` };
        }

        if (q.includes('updates') || q.includes('what is new') || q.includes("what's new") || q.includes('release log')) {
            if (window.App && typeof window.App.showUpdateModal === 'function') {
                window.App.showUpdateModal();
                return { text: `⚡ Opened **CCMS System Update Log & Client Queries** modal.` };
            }
        }

        // 3. ANALYTICAL & FINANCIAL INTELLIGENCE QUERIES

        // Financial Summary / Overview
        if (q.includes('summary') || q.includes('overview') || q.includes('financial status') || q.includes('total balance') || q.includes('outstanding')) {
            let totalLimit = 0, totalBal = 0;
            cards.forEach(c => {
                totalLimit += Utils.parseNum(c.credit_limit || 0);
                totalBal += Utils.parseNum(c.current_balance || c.balance || 0);
            });
            const avail = Math.max(0, totalLimit - totalBal);
            const util = totalLimit > 0 ? ((totalBal / totalLimit) * 100).toFixed(1) : '0';

            let pendingDues = 0;
            stmts.filter(s => (s.payment_status || 'Pending').toLowerCase() !== 'paid').forEach(s => {
                pendingDues += Utils.parseNum(s.closing_outstanding || s.billed_amount || 0);
            });

            return {
                text: `📊 **Executive Financial Health Summary:**
- **Total Cards Active**: \`${cards.length}\`
- **Total Portfolio Limit**: \`₹${Math.round(totalLimit).toLocaleString('en-IN')}\`
- **Total Outstanding Balance**: \`₹${Math.round(totalBal).toLocaleString('en-IN')}\`
- **Available Credit Line**: \`₹${Math.round(avail).toLocaleString('en-IN')}\`
- **Overall Portfolio Utilization**: \`${util}%\`
- **Pending Statement Dues**: \`₹${Math.round(pendingDues).toLocaleString('en-IN')}\`
- **Unbilled Spends In Pipeline**: \`${unbilled.length} txns\``,
                actionCard: { title: 'Executive Report', label: 'View Download Dashboard', onClick: 'EraAI.toggle(false); App.navigate("downlodedash");' }
            };
        }

        // Due dates query
        if (q.includes('due') || q.includes('upcoming') || q.includes('bill date')) {
            const pendingStmts = stmts.filter(s => (s.payment_status || 'Pending').toLowerCase() !== 'paid');
            if (pendingStmts.length === 0) {
                return { text: `🎉 **Good news!** Koi pending statement dues nahi hain. Sabhi statements marked as **Paid** hain.` };
            }

            let listStr = pendingStmts.slice(0, 5).map(s => {
                const card = cards.find(c => String(c.card_id) === String(s.card_id));
                const bank = card ? `${card.bank_name} (*${card.last_4_digits})` : `Card #${s.card_id}`;
                return `• **${bank}**: ₹${Math.round(Utils.parseNum(s.closing_outstanding || s.billed_amount)).toLocaleString('en-IN')} (Month: \`${s.statement_month}\`, Status: \`${s.payment_status || 'Pending'}\`)`;
            }).join('\n');

            return {
                text: `⚠️ **Upcoming / Pending Statement Dues:**\n${listStr}\n\nTotal Pending Statements: **${pendingStmts.length}**`,
                actionCard: { title: 'Pay Dues', label: 'Open Payments & Statements', onClick: 'EraAI.toggle(false); App.navigate("payments");' }
            };
        }

        // Highest utilization / risk cards
        if (q.includes('highest') || q.includes('utilization') || q.includes('max spend') || q.includes('limit exceed') || q.includes('risk')) {
            const sortedCards = [...cards].map(c => {
                const lim = Utils.parseNum(c.credit_limit || 0);
                const bal = Utils.parseNum(c.current_balance || c.balance || 0);
                const ratio = lim > 0 ? (bal / lim) * 100 : 0;
                return { ...c, lim, bal, ratio };
            }).sort((a, b) => b.ratio - a.ratio);

            const top3 = sortedCards.slice(0, 3).map(c => {
                const flag = c.ratio >= 80 ? '🔴 High Risk' : (c.ratio >= 50 ? '🟡 Moderate' : '🟢 Safe');
                return `• **${c.bank_name} (*${c.last_4_digits})**: Utilization: **${c.ratio.toFixed(1)}%** | Bal: ₹${Math.round(c.bal).toLocaleString('en-IN')} / Lim: ₹${Math.round(c.lim).toLocaleString('en-IN')} (${flag})`;
            }).join('\n');

            return {
                text: `💳 **Highest Credit Utilization Cards:**\n${top3}\n\n*Recommendation: Keep credit utilization below 30% per card for optimal corporate credit health.*`,
                actionCard: { title: 'Card Master', label: 'View All Cards', onClick: 'EraAI.toggle(false); App.navigate("master");' }
            };
        }

        // Unbilled query
        if (q.includes('unbilled')) {
            let totalUnbilled = 0;
            unbilled.forEach(u => totalUnbilled += Utils.parseNum(u.amount || 0));
            return {
                text: `🧾 **Unbilled Transactions Breakdown:**
- Total Pending Unbilled Records: **${unbilled.length}**
- Total Unbilled Spends: **₹${Math.round(totalUnbilled).toLocaleString('en-IN')}**
- These transactions will be applied to the upcoming statement billing cycles.`,
                actionCard: { title: 'Unbilled Spends', label: 'View Transactions', onClick: 'EraAI.toggle(false); App.navigate("transactions");' }
            };
        }

        // Bank-specific lookup (HDFC, ICICI, SBI, Axis, etc.)
        const matchedBank = ['hdfc', 'icici', 'sbi', 'axis', 'amex', 'american express', 'kotak', 'idfc', 'hsbc', 'rbl'].find(b => q.includes(b));
        if (matchedBank) {
            const bankCards = cards.filter(c => (c.bank_name || '').toLowerCase().includes(matchedBank));
            if (bankCards.length > 0) {
                let cardDetails = bankCards.map(c => {
                    return `• **${c.bank_name}** (*${c.last_4_digits}) — Holder: **${c.card_holder}**\n  - Credit Limit: \`₹${Math.round(Utils.parseNum(c.credit_limit)).toLocaleString('en-IN')}\`\n  - Current Balance: \`₹${Math.round(Utils.parseNum(c.current_balance)).toLocaleString('en-IN')}\`\n  - Status: \`${c.status || 'Active'}\``;
                }).join('\n\n');
                return { text: `🏦 **${matchedBank.toUpperCase()} Cards in Portfolio:**\n\n${cardDetails}` };
            }
        }

        // 4. GENERATIVE LLM QUERY (Prioritizes Vercel Serverless /api/gemini with Full Database Context)
        const fullContext = this.getFullDbContext();
        const geminiRes = await this._callGemini(query, fullContext);
        if (geminiRes && geminiRes.success) {
            return { text: geminiRes.text };
        }

        // 5. Intelligent Fallback / Guide
        return {
            text: `🤖 Main aapke query ko process kar raha hoon. 
Aap direct voice ya text se ye commands de sakte hain:
- *"Open Cards / Transactions / Reports / Hygiene / Download Dashboard"*
- *"Sync data with cloud"*
- *"Export database to Excel"*
- *"Total outstanding kitna hai?"*
- *"Upcoming due dates check karo"*

*(💡 Tip: Vercel Project Settings > Environment Variables me **GEMINI_API_KEY** add karein to cloud-level advanced reasoning automatically connect ho jayegi!)*`
        };
    },

    getFullDbContext() {
        const raw = (window.DB && window.DB.data) || {};
        const cards = raw.credit_cards || [];
        const txns = raw.transactions || [];
        const stmts = raw.statements || [];
        const payments = raw.payments || [];
        const unbilled = raw.unbilled || [];

        let totalLimit = 0, totalBal = 0;
        const cleanCards = cards.map(c => {
            const lim = Utils.parseNum(c.credit_limit || 0);
            const bal = Utils.parseNum(c.current_balance || c.balance || 0);
            totalLimit += lim;
            totalBal += bal;
            return {
                card_id: c.card_id,
                bank: c.bank_name,
                last_4: c.last_4_digits,
                holder: c.card_holder,
                limit: lim,
                balance: bal,
                available: Math.max(0, lim - bal),
                utilization_pct: lim > 0 ? ((bal / lim) * 100).toFixed(1) : 0,
                billing_cycle: c.billing_cycle_date || c.billing_cycle,
                due_date: c.payment_due_date || c.due_date,
                status: c.status || 'Active'
            };
        });

        let totalPendingDues = 0;
        const cleanStmts = stmts.map(s => {
            const due = Utils.parseNum(s.closing_outstanding || s.billed_amount || 0);
            if ((s.payment_status || 'Pending').toLowerCase() !== 'paid') {
                totalPendingDues += due;
            }
            return {
                id: s.statement_id,
                card_id: s.card_id,
                month: s.statement_month,
                billed: Utils.parseNum(s.billed_amount || 0),
                outstanding: due,
                status: s.payment_status || 'Pending',
                due_date: s.due_date
            };
        });

        let totalPaid = 0;
        const cleanPayments = payments.map(p => {
            const amt = Utils.parseNum(p.amount || 0);
            totalPaid += amt;
            return {
                id: p.payment_id,
                card_id: p.card_id,
                amount: amt,
                date: p.payment_date,
                mode: p.payment_mode
            };
        });

        let totalUnbilledAmt = 0;
        const cleanUnbilled = unbilled.map(u => {
            const amt = Utils.parseNum(u.amount || 0);
            totalUnbilledAmt += amt;
            return {
                id: u.unbilled_id,
                card_id: u.card_id,
                amount: amt,
                date: u.txn_date,
                desc: u.description || u.narration,
                status: u.status || 'Unbilled'
            };
        });

        const categorySpends = {};
        txns.forEach(t => {
            const cat = t.category || 'General';
            const amt = Utils.parseNum(t.amount || 0);
            categorySpends[cat] = (categorySpends[cat] || 0) + amt;
        });

        return {
            database_summary: {
                total_cards: cards.length,
                active_cards: cards.filter(c => (c.status || 'Active').toLowerCase() === 'active').length,
                total_sanctioned_limit: Math.round(totalLimit),
                total_current_balance: Math.round(totalBal),
                total_available_credit: Math.round(Math.max(0, totalLimit - totalBal)),
                portfolio_utilization_percent: totalLimit > 0 ? ((totalBal / totalLimit) * 100).toFixed(1) : 0,
                total_pending_statement_dues: Math.round(totalPendingDues),
                total_payments_count: payments.length,
                total_payments_amount: Math.round(totalPaid),
                total_unbilled_transactions: unbilled.length,
                total_unbilled_amount: Math.round(totalUnbilledAmt),
                total_transactions_in_db: txns.length
            },
            all_cards: cleanCards,
            statements_summary: cleanStmts.slice(0, 35),
            recent_payments: cleanPayments.slice(0, 20),
            unbilled_records: cleanUnbilled.slice(0, 30),
            category_wise_spending: categorySpends,
            recent_transactions_sample: txns.slice(0, 25).map(t => ({
                id: t.txn_id,
                date: t.txn_date,
                amount: Utils.parseNum(t.amount || 0),
                desc: t.description || t.merchant,
                category: t.category
            })),
            active_user: JSON.parse(sessionStorage.getItem('ccms_user') || '{}')
        };
    },

    async _callGemini(userPrompt, contextData) {
        // 1. Try Vercel Serverless Function (/api/gemini) powered by process.env.GEMINI_API_KEY
        try {
            const vRes = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userPrompt, context: contextData })
            });

            if (vRes.ok) {
                const data = await vRes.json();
                if (data.text) {
                    return { success: true, text: data.text };
                }
            } else {
                const errData = await vRes.json().catch(() => ({}));
                console.warn('[EraAI] Vercel serverless /api/gemini returned:', vRes.status, errData);
            }
        } catch(e) {
            // Local dev without Vercel serverless host
            console.info('[EraAI] Local server /api/gemini bypassed:', e.message);
        }

        // 2. Fallback: Direct client call if user entered a local key in settings
        if (this.apiKey) {
            try {
                const systemPrompt = `You are ERA AI, the executive financial co-pilot of Credit Card Management System (CCMS) for Gretex Group.
You have complete access to the user's financial credit card portfolio.
Current Live Snapshot:
- Cards Count: ${contextData.cards.length}
- Statements Count: ${contextData.stmts.length}
- Transactions Count: ${contextData.txns.length}
- Unbilled Transactions: ${contextData.unbilled.length}

Answer questions accurately, professionally, concisely with bullet points and bold financial numbers in Indian Rupees (₹).
Do not make up fake data. Use the context provided. Respond in clear English/Hinglish as requested.`;

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [
                            { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${userPrompt}` }] }
                        ]
                    })
                });

                const data = await res.json();
                if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                    return { success: true, text: data.candidates[0].content.parts[0].text };
                }
            } catch(e) {
                console.warn('[EraAI] Local Gemini API call error:', e);
            }
        }

        return { success: false };
    },

    _appendMessage(sender, text, actionCard) {
        const container = document.getElementById('era-messages');
        if (!container) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `era-msg era-msg-${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'era-msg-avatar';
        avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-brain"></i>';

        const bubble = document.createElement('div');
        bubble.className = 'era-msg-bubble';

        // Parse markdown formatting into HTML
        bubble.innerHTML = this._parseMarkdown(text);

        if (actionCard) {
            const cardEl = document.createElement('div');
            cardEl.className = 'era-action-card';
            cardEl.innerHTML = `
                <div class="era-action-header"><i class="fas fa-bolt" style="color:#ffd166;"></i> ${actionCard.title || 'Quick Action'}</div>
                <button class="era-action-btn" onclick="${actionCard.onClick}">
                    <i class="fas fa-arrow-right"></i> ${actionCard.label}
                </button>
            `;
            bubble.appendChild(cardEl);
        }

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubble);
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    },

    _appendTyping() {
        const container = document.getElementById('era-messages');
        if (!container) return null;

        const id = 'typing-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.id = id;
        msgDiv.className = 'era-msg era-msg-ai';
        msgDiv.innerHTML = `
            <div class="era-msg-avatar"><i class="fas fa-brain"></i></div>
            <div class="era-msg-bubble" style="display:flex;align-items:center;gap:6px;padding:12px 18px;">
                <span style="font-size:0.88rem;color:#94a3b8;"><i class="fas fa-circle-notch fa-spin"></i> Processing command...</span>
            </div>
        `;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
        return id;
    },

    _removeTyping(id) {
        if (!id) return;
        const el = document.getElementById(id);
        if (el) el.remove();
    },

    _parseMarkdown(text) {
        if (!text) return '';
        let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Bold: **text**
        escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic: *text*
        escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Inline code: `text`
        escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Lists: • or - 
        escaped = escaped.replace(/^\s*[•\-]\s*(.*)$/gm, '<li>$1</li>');
        escaped = escaped.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        // Linebreaks
        escaped = escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

        return `<p>${escaped}</p>`;
    },

    showSettingsModal() {
        const currentKey = this.apiKey ? `${this.apiKey.substring(0, 6)}...${this.apiKey.substring(this.apiKey.length - 4)}` : 'Auto (Vercel GEMINI_API_KEY)';
        const html = `
            <div style="font-family: inherit;">
                <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:12px 14px;margin-bottom:16px;">
                    <div style="font-weight:700;color:#3730a3;font-size:0.88rem;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-cloud"></i> <span>Vercel Environment Variable (Active)</span>
                    </div>
                    <p style="font-size:0.82rem;color:#4338ca;margin-top:5px;margin-bottom:0;line-height:1.4;">
                        Production me Vercel Project Settings &gt; <strong>Environment Variables</strong> me <code>GEMINI_API_KEY</code> add karein. Isse API key secure serverless backend (<code>/api/gemini</code>) se access hogi aur client-side par expose nahi hogi.
                    </p>
                </div>

                <div class="form-group mb-3">
                    <label class="form-label" style="font-weight:600;">Client Override / Local Key (Optional)</label>
                    <input type="password" id="era-api-key-input" class="form-control" placeholder="Enter AIzaSy..." value="${this.apiKey || ''}">
                    <small class="form-text">Status: <strong>${currentKey}</strong>. Local testing ya direct client override ke liye.</small>
                </div>
                <div class="modal-actions" style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Close</button>
                    <button type="button" class="btn btn-primary" onclick="EraAI.saveApiKey()">Save Override</button>
                </div>
            </div>
        `;
        if (window.App && typeof window.App.showModal === 'function') {
            window.App.showModal('ERA AI — Intelligence & API Settings', html);
        }
    },

    saveApiKey() {
        const input = document.getElementById('era-api-key-input');
        if (!input) return;
        this.apiKey = input.value.trim();
        if (this.apiKey) {
            localStorage.setItem('era_gemini_api_key', this.apiKey);
            if (window.App) window.App.showToast('Gemini API Key saved!', 'success');
        } else {
            localStorage.removeItem('era_gemini_api_key');
            if (window.App) window.App.showToast('Using Built-in Local Engine', 'info');
        }
        if (window.App) window.App.closeModal();
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in before rendering ERA AI
    if (sessionStorage.getItem('ccms_user') || document.getElementById('app')) {
        EraAI.init();
    }
});

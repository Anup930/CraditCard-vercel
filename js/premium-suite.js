// ============================================================
// PremiumSuite — Next-Level Executive Productivity & Intelligence
// 1. Command Palette (Cmd+K / Ctrl+K)
// 2. Meeting Privacy Blur Mode (Alt+P)
// 3. Topbar Live Notification Bell
// 4. Smart Suite Page:
//    - Best Card to Swipe Optimizer
//    - Interactive Monthly Billing & Due Calendar
//    - Smart Payment Allocator (What-If Simulator)
// ============================================================

window.PremiumSuite = {
    activeTab: 'optimizer',
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    selectedCalDay: new Date().getDate(),
    cmdSelectedIdx: 0,
    _initialized: false,

    init() {
        if (this._initialized) return;
        this._initialized = true;

        this._injectCommandPalette();
        this._bindGlobalShortcuts();
        this.refreshNotifications();

        // Restore privacy blur if active in this session
        try {
            if (sessionStorage.getItem('ccms_privacy_blur') === '1') {
                this.setPrivacyBlur(true);
            }
        } catch (e) {}

        // Refresh notifications whenever DB updates
        if (window.DB && typeof window.DB.subscribe === 'function') {
            window.DB.subscribe((ev) => {
                if (['loaded', 'sync_success', 'card_added', 'card_updated', 'card_deleted', 'statement_added', 'payment_added'].includes(ev)) {
                    this.refreshNotifications();
                }
            });
        }

        // Close notification popover on outside click
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('ps-notif-wrap');
            const pop = document.getElementById('ps-notif-popover');
            if (pop && !pop.classList.contains('hidden') && wrap && !wrap.contains(e.target)) {
                pop.classList.add('hidden');
            }
        });
    },

    // ── 1. MEETING PRIVACY BLUR MODE (Alt + P) ───────────────────
    setPrivacyBlur(enabled) {
        document.body.classList.toggle('privacy-blur-active', !!enabled);
        try { sessionStorage.setItem('ccms_privacy_blur', enabled ? '1' : '0'); } catch (e) {}
        const btn = document.getElementById('btn-privacy-toggle');
        const icon = document.getElementById('privacy-toggle-icon');
        if (icon) icon.className = enabled ? 'fas fa-eye-slash' : 'fas fa-shield-halved fas fa-user-secret';
        if (icon && enabled) icon.className = 'fas fa-eye-slash';
        else if (icon) icon.className = 'fas fa-eye';
        if (btn) {
            btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            btn.classList.toggle('active', !!enabled);
            btn.title = enabled ? 'Privacy Blur ON (Hover numbers to peek) [Alt+P]' : 'Meeting Privacy Blur [Alt+P]';
        }
    },

    togglePrivacyBlur() {
        const next = !document.body.classList.contains('privacy-blur-active');
        this.setPrivacyBlur(next);
        if (window.App) {
            window.App.showToast(next ? 'Privacy Blur ON — hover any amount to peek' : 'Privacy Blur OFF', 'info');
        }
    },

    // ── 2. TOPBAR LIVE NOTIFICATION BELL ─────────────────────────
    _collectAlerts() {
        const cards = (window.DB && window.DB.cards && window.DB.cards.getAll()) || [];
        const stmts = (window.DB && window.DB.statements && window.DB.statements.getAll()) || [];
        const alerts = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Unpaid due within 5 days or overdue
        stmts.filter(s => s.payment_status !== 'Paid' && (window.Utils.parseNum(s.closing_outstanding) || 0) > 0).forEach(s => {
            if (!s.due_date) return;
            const d = new Date(s.due_date);
            d.setHours(0, 0, 0, 0);
            const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
            const card = cards.find(c => String(c.card_id) === String(s.card_id)) || {};
            if (diff <= 5) {
                alerts.push({
                    type: diff < 0 ? 'danger' : 'warning',
                    icon: diff < 0 ? 'fa-fire' : 'fa-clock',
                    title: diff < 0 ? `Overdue by ${Math.abs(diff)}d` : (diff === 0 ? 'Due Today!' : `Due in ${diff}d`),
                    desc: `${card.cardholder_name || 'Card'} (*${card.card_last4 || ''}) — ${window.Utils.formatCurrency(s.closing_outstanding)}`,
                    action: `window.Payments?.switchTab('outstanding'); window.App?.navigate('payments');`
                });
            }
        });

        // High utilization (>65%)
        cards.forEach(c => {
            const m = window.DB.cards.getCardLimitMetrics ? window.DB.cards.getCardLimitMetrics(c.card_id) : { limit: 0, util: 0 };
            if (m.limit > 0 && m.util >= 65) {
                alerts.push({
                    type: 'danger',
                    icon: 'fa-tachometer-alt',
                    title: `High Utilization (${Math.round(m.util)}%)`,
                    desc: `${c.cardholder_name || ''} (${c.bank_name || ''} *${c.card_last4 || ''})`,
                    action: `window.Master?.viewCard('${c.card_id}')`
                });
            }
        });

        // Renewals within 30 days
        cards.forEach(c => {
            if (!c.renewal_date) return;
            const rd = new Date(c.renewal_date);
            const diff = Math.ceil((rd - today) / (1000 * 60 * 60 * 24));
            if (diff >= 0 && diff <= 30) {
                alerts.push({
                    type: 'info',
                    icon: 'fa-sync-alt',
                    title: `Renewal in ${diff}d`,
                    desc: `${c.bank_name || ''} — ${c.cardholder_name || ''} (*${c.card_last4 || ''})`,
                    action: `window.Master?.viewCard('${c.card_id}')`
                });
            }
        });

        return alerts.slice(0, 12);
    },

    refreshNotifications() {
        const badge = document.getElementById('ps-notif-count');
        const list = document.getElementById('ps-notif-list');
        const alerts = this._collectAlerts();

        if (badge) {
            badge.textContent = String(alerts.length);
            badge.style.display = alerts.length > 0 ? 'inline-flex' : 'none';
        }
        if (!list) return;

        if (alerts.length === 0) {
            list.innerHTML = `<div class="ps-notif-empty"><i class="fas fa-check-circle"></i> All clear! No urgent alerts right now.</div>`;
            return;
        }

        const esc = window.Utils.escapeHtml;
        list.innerHTML = alerts.map(a => `
            <button type="button" class="ps-notif-item ps-notif-${a.type}" onclick="document.getElementById('ps-notif-popover').classList.add('hidden'); ${a.action}">
                <span class="ps-notif-ico"><i class="fas ${a.icon}"></i></span>
                <span class="ps-notif-body">
                    <strong>${esc(a.title)}</strong>
                    <small>${esc(a.desc)}</small>
                </span>
            </button>
        `).join('');
    },

    toggleNotifications(e) {
        if (e) e.stopPropagation();
        this.refreshNotifications();
        const pop = document.getElementById('ps-notif-popover');
        if (pop) pop.classList.toggle('hidden');
    },

    // ── 3. COMMAND PALETTE (Cmd+K / Ctrl+K) ──────────────────────
    _injectCommandPalette() {
        if (document.getElementById('ps-cmd-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'ps-cmd-overlay';
        overlay.className = 'ps-cmd-overlay hidden';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Command Palette');
        overlay.innerHTML = `
            <div class="ps-cmd-box">
                <div class="ps-cmd-input-wrap">
                    <i class="fas fa-search"></i>
                    <input type="text" id="ps-cmd-input" placeholder="Type a command, page, cardholder, bank, or last 4 digits..." autocomplete="off" spellcheck="false">
                    <kbd>ESC</kbd>
                </div>
                <div id="ps-cmd-results" class="ps-cmd-results"></div>
                <div class="ps-cmd-footer">
                    <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
                    <span><kbd>Enter</kbd> Execute</span>
                    <span><kbd>Cmd+K</kbd> Toggle</span>
                </div>
            </div>
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeCommandPalette();
        });
        document.body.appendChild(overlay);

        const input = document.getElementById('ps-cmd-input');
        input.addEventListener('input', () => {
            this.cmdSelectedIdx = 0;
            this._renderCommandResults(input.value);
        });
        input.addEventListener('keydown', (e) => {
            const items = document.querySelectorAll('#ps-cmd-results .ps-cmd-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length) {
                    this.cmdSelectedIdx = (this.cmdSelectedIdx + 1) % items.length;
                    this._highlightCmdItem(items);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length) {
                    this.cmdSelectedIdx = (this.cmdSelectedIdx - 1 + items.length) % items.length;
                    this._highlightCmdItem(items);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (items[this.cmdSelectedIdx]) items[this.cmdSelectedIdx].click();
            }
        });
    },

    _bindGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const ov = document.getElementById('ps-cmd-overlay');
                if (ov && !ov.classList.contains('hidden')) this.closeCommandPalette();
                else this.openCommandPalette();
            } else if (e.altKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                this.togglePrivacyBlur();
            } else if (e.key === 'Escape') {
                this.closeCommandPalette();
                const pop = document.getElementById('ps-notif-popover');
                if (pop) pop.classList.add('hidden');
            }
        });
    },

    openCommandPalette() {
        const app = document.getElementById('app');
        if (app && app.classList.contains('hidden')) return;
        const ov = document.getElementById('ps-cmd-overlay');
        const input = document.getElementById('ps-cmd-input');
        if (!ov || !input) return;
        ov.classList.remove('hidden');
        input.value = '';
        this.cmdSelectedIdx = 0;
        this._renderCommandResults('');
        setTimeout(() => input.focus(), 20);
    },

    closeCommandPalette() {
        const ov = document.getElementById('ps-cmd-overlay');
        if (ov) ov.classList.add('hidden');
    },

    _highlightCmdItem(items) {
        items.forEach((el, idx) => {
            el.classList.toggle('selected', idx === this.cmdSelectedIdx);
            if (idx === this.cmdSelectedIdx) el.scrollIntoView({ block: 'nearest' });
        });
    },

    _renderCommandResults(query) {
        const container = document.getElementById('ps-cmd-results');
        if (!container) return;
        const q = (query || '').toLowerCase().trim();
        const esc = window.Utils.escapeHtml;

        const commands = [
            { group: 'Navigation', label: 'Go to Dashboard', icon: 'fa-tachometer-alt', run: () => window.App?.navigate('dashboard') },
            { group: 'Navigation', label: 'Go to Card Master', icon: 'fa-id-card', run: () => window.App?.navigate('master') },
            { group: 'Navigation', label: 'Go to Zoho Import', icon: 'fa-file-import', run: () => window.App?.navigate('import') },
            { group: 'Navigation', label: 'Go to Transactions', icon: 'fa-exchange-alt', run: () => window.App?.navigate('transactions') },
            { group: 'Navigation', label: 'Go to Payments & Statements', icon: 'fa-money-bill-wave', run: () => window.App?.navigate('payments') },
            { group: 'Navigation', label: 'Go to Reports Hub', icon: 'fa-chart-bar', run: () => window.App?.navigate('reports') },
            { group: 'Navigation', label: 'Go to Group Report (JPG)', icon: 'fa-paper-plane', run: () => window.App?.navigate('groupreport') },
            { group: 'Navigation', label: 'Go to Smart Suite (Optimizer & Calendar)', icon: 'fa-wand-magic-sparkles', run: () => window.App?.navigate('smartsuite') },
            { group: 'Navigation', label: 'Go to Data Hygiene', icon: 'fa-broom', run: () => window.App?.navigate('hygiene') },
            { group: 'Quick Actions', label: 'Open Best Card to Swipe Optimizer', icon: 'fa-bolt', run: () => { this.activeTab = 'optimizer'; window.App?.navigate('smartsuite'); } },
            { group: 'Quick Actions', label: 'Open Monthly Due & Billing Calendar', icon: 'fa-calendar-alt', run: () => { this.activeTab = 'calendar'; window.App?.navigate('smartsuite'); } },
            { group: 'Quick Actions', label: 'Open Smart Payment Allocator', icon: 'fa-sliders-h', run: () => { this.activeTab = 'allocator'; window.App?.navigate('smartsuite'); } },
            { group: 'Quick Actions', label: 'Toggle Dark / Light Theme', icon: 'fa-moon', run: () => window.App?.toggleTheme() },
            { group: 'Quick Actions', label: 'Toggle Meeting Privacy Blur (Alt+P)', icon: 'fa-eye-slash', run: () => this.togglePrivacyBlur() },
            { group: 'Quick Actions', label: 'Download Daily Group Report JPG', icon: 'fa-file-image', run: () => { window.App?.navigate('groupreport'); setTimeout(() => window.GroupReport?.downloadJpg(), 250); } },
            { group: 'Quick Actions', label: 'Add New Credit Card', icon: 'fa-plus-circle', run: () => window.Master?.showAddModal() },
            { group: 'Quick Actions', label: 'Record New Payment', icon: 'fa-money-check-alt', run: () => window.Payments?.showPaymentModal() },
            { group: 'Quick Actions', label: 'Open ERA AI Co-Pilot', icon: 'fa-brain', run: () => window.EraAI?.toggle(true) },
            { group: 'Quick Actions', label: 'Sync Data with Google Sheets', icon: 'fa-sync-alt', run: () => document.getElementById('btn-cloud-sync')?.click() }
        ];

        const cards = (window.DB && window.DB.cards && window.DB.cards.getAll()) || [];
        const matchedCards = q.length >= 2 ? cards.filter(c =>
            `${c.cardholder_name || ''} ${c.primary_cardholder || ''} ${c.bank_name || ''} ${c.card_last4 || ''} ${c.zoho_ledger_name || ''}`.toLowerCase().includes(q)
        ).slice(0, 6).map(c => ({
            group: 'Cards',
            label: `${c.cardholder_name || 'Card'} — ${c.bank_name || ''} (*${c.card_last4 || ''})`,
            sub: c.zoho_ledger_name || '',
            icon: 'fa-credit-card',
            run: () => window.Master?.viewCard(c.card_id)
        })) : [];

        const matchedCmds = q ? commands.filter(c => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : commands.slice(0, 10);
        const allItems = [...matchedCards, ...matchedCmds];

        if (allItems.length === 0) {
            container.innerHTML = `<div class="ps-cmd-empty">No matching commands or cards for "${esc(query)}"</div>`;
            return;
        }

        this._cmdHandlers = allItems.map(i => i.run);
        container.innerHTML = allItems.map((item, idx) => `
            <button type="button" class="ps-cmd-item ${idx === this.cmdSelectedIdx ? 'selected' : ''}" onclick="window.PremiumSuite._execCmd(${idx})">
                <span class="ps-cmd-ico"><i class="fas ${item.icon}"></i></span>
                <span class="ps-cmd-txt">
                    <strong>${esc(item.label)}</strong>
                    ${item.sub ? `<small>${esc(item.sub)}</small>` : ''}
                </span>
                <span class="ps-cmd-grp">${esc(item.group)}</span>
            </button>
        `).join('');
    },

    _execCmd(idx) {
        this.closeCommandPalette();
        const fn = this._cmdHandlers && this._cmdHandlers[idx];
        if (typeof fn === 'function') fn();
    },

    // ── 4. SMART SUITE PAGE (OPTIMIZER + CALENDAR + ALLOCATOR) ───
    render(container) {
        this.container = container;
        container.innerHTML = `
            <div class="page-header d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                <div>
                    <h2 class="page-title"><i class="fas fa-wand-magic-sparkles text-primary"></i> Treasury Smart Suite</h2>
                    <div class="page-subtitle text-muted">AI-inspired card optimizer, interactive billing calendar &amp; payment budget simulator</div>
                </div>
            </div>

            <div class="pay-tabs-bar mb-4" role="tablist">
                <button type="button" class="pay-tab-btn ${this.activeTab === 'optimizer' ? 'active' : ''}" onclick="window.PremiumSuite.switchTab('optimizer')">
                    <i class="fas fa-bolt"></i> <span>Best Card to Swipe</span>
                </button>
                <button type="button" class="pay-tab-btn ${this.activeTab === 'calendar' ? 'active' : ''}" onclick="window.PremiumSuite.switchTab('calendar')">
                    <i class="fas fa-calendar-alt"></i> <span>Billing &amp; Due Calendar</span>
                </button>
                <button type="button" class="pay-tab-btn ${this.activeTab === 'allocator' ? 'active' : ''}" onclick="window.PremiumSuite.switchTab('allocator')">
                    <i class="fas fa-sliders-h"></i> <span>Smart Payment Allocator</span>
                </button>
            </div>

            <div id="ps-suite-body"></div>
        `;
        this._renderTab();
    },

    switchTab(tab) {
        this.activeTab = tab;
        this.render(this.container);
    },

    _renderTab() {
        const body = document.getElementById('ps-suite-body');
        if (!body) return;
        if (this.activeTab === 'optimizer') this._renderOptimizer(body);
        else if (this.activeTab === 'calendar') this._renderCalendar(body);
        else if (this.activeTab === 'allocator') this._renderAllocator(body);
    },

    // ── TAB 1: BEST CARD TO SWIPE OPTIMIZER ──────────────────────
    _renderOptimizer(body) {
        this._optAmount = this._optAmount || 50000;
        this._optOwner = this._optOwner || 'all';
        const owners = (window.DB.cards.getOwners && window.DB.cards.getOwners()) || [];
        const esc = window.Utils.escapeHtml;

        body.innerHTML = `
            <div class="card p-4 mb-4" style="border-radius:16px;">
                <div class="cf-grid-3" style="align-items:end;">
                    <div class="cf-field">
                        <label for="ps-opt-amt">Planned Swipe Amount (₹)</label>
                        <input type="number" id="ps-opt-amt" class="form-control" min="1" step="500" value="${this._optAmount}" oninput="window.PremiumSuite._optAmount=parseFloat(this.value)||0; window.PremiumSuite._updateOptimizerList();">
                    </div>
                    <div class="cf-field">
                        <label for="ps-opt-owner">Filter by Primary Owner</label>
                        <select id="ps-opt-owner" class="form-select" onchange="window.PremiumSuite._optOwner=this.value; window.PremiumSuite._updateOptimizerList();">
                            <option value="all">All Cardholders</option>
                            ${owners.map(o => `<option value="${esc(o)}" ${this._optOwner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        ${[25000, 50000, 100000, 250000].map(v => `
                            <button type="button" class="btn btn-sm btn-outline" onclick="document.getElementById('ps-opt-amt').value=${v}; window.PremiumSuite._optAmount=${v}; window.PremiumSuite._updateOptimizerList();" style="border-radius:8px;font-weight:700;">₹${(v/1000)}k</button>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div id="ps-opt-results"></div>
        `;
        this._updateOptimizerList();
    },

    _updateOptimizerList() {
        const resEl = document.getElementById('ps-opt-results');
        if (!resEl) return;
        const amt = this._optAmount || 0;
        const cards = (window.DB.cards.getAll() || []).filter(c => c.status === 'Active' && (this._optOwner === 'all' || c.primary_cardholder === this._optOwner));
        const today = new Date();
        const todayDay = today.getDate();
        const esc = window.Utils.escapeHtml;

        const scored = cards.map(c => {
            const m = window.DB.cards.getCardLimitMetrics ? window.DB.cards.getCardLimitMetrics(c.card_id) : { limit: 0, used: 0, available: 0 };
            const limit = window.Utils.parseNum(c.credit_limit) || 0;
            const avail = Math.max(0, limit - (m.used || 0));
            if (limit <= 0 || avail < amt) return null;

            const postUtil = ((m.used + amt) / limit) * 100;
            // Days until next statement date (longer = more interest-free days)
            const stmtDay = parseInt(c.statement_date) || 15;
            const daysToStmt = stmtDay >= todayDay ? (stmtDay - todayDay) : (30 - todayDay + stmtDay);
            const waiverTarget = window.Utils.parseNum(c.fee_waiver_target) || 0;

            let score = 50;
            if (postUtil < 30) score += 28;
            else if (postUtil < 50) score += 14;
            else score -= 10;

            score += Math.min(20, Math.round(daysToStmt * 0.65));
            if (waiverTarget > 0) score += 8;

            const reasons = [];
            if (postUtil < 30) reasons.push('Optimal <30% Util');
            if (daysToStmt >= 15) reasons.push(`${daysToStmt}d to Stmt Cycle`);
            if (waiverTarget > 0) reasons.push('Fee Waiver Eligible');

            return { card: c, limit, avail, postUtil: postUtil.toFixed(1), daysToStmt, score: Math.min(99, Math.max(10, score)), reasons };
        }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 6);

        if (scored.length === 0) {
            resEl.innerHTML = `<div class="card p-4 text-center text-muted">No active cards found with at least ${window.Utils.formatCurrency(amt)} available limit.</div>`;
            return;
        }

        resEl.innerHTML = `<div class="ps-opt-grid">${scored.map((s, idx) => `
            <article class="ps-opt-card ${idx === 0 ? 'is-best' : ''}">
                <div class="ps-opt-top">
                    <span class="vivid-pill ${idx === 0 ? 'pill-status-active' : 'pill-cat-primary'}">${idx === 0 ? '★ BEST CHOICE' : `#${idx + 1} RANK`}</span>
                    <span class="ps-opt-score">${s.score}% Match</span>
                </div>
                <h4 class="ps-opt-name">${esc(s.card.cardholder_name || '')} <small>(*${esc(s.card.card_last4 || '')})</small></h4>
                <div class="ps-opt-bank">${esc(s.card.bank_name || '')} &bull; ${esc(s.card.card_type || '')}</div>
                <div class="pay-mini-metrics">
                    <div><span>Available</span><strong style="color:#10b981;">${window.Utils.formatCurrency(s.avail)}</strong></div>
                    <div><span>Post-Swipe Util</span><strong>${s.postUtil}%</strong></div>
                    <div><span>Cycle Days</span><strong>${s.daysToStmt} days</strong></div>
                </div>
                <div class="ps-opt-reasons">
                    ${s.reasons.map(r => `<span class="vivid-pill pill-cat-addon">${esc(r)}</span>`).join('')}
                </div>
            </article>
        `).join('')}</div>`;
    },

    // ── TAB 2: INTERACTIVE BILLING & DUE CALENDAR ────────────────
    _renderCalendar(body) {
        const y = this.calYear;
        const m = this.calMonth;
        const monthName = new Date(y, m, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();

        const cards = window.DB.cards.getAll() || [];
        const stmts = window.DB.statements.getAll() || [];
        const esc = window.Utils.escapeHtml;

        // Map events per day of month
        const dayEvents = {};
        for (let d = 1; d <= daysInMonth; d++) dayEvents[d] = { stmts: [], dues: [], renewals: [] };

        cards.forEach(c => {
            const sd = parseInt(c.statement_date);
            if (sd >= 1 && sd <= daysInMonth) dayEvents[sd].stmts.push(c);

            if (c.renewal_date) {
                const rd = new Date(c.renewal_date);
                if (rd.getFullYear() === y && rd.getMonth() === m) {
                    dayEvents[rd.getDate()]?.renewals.push(c);
                }
            }
        });

        stmts.filter(s => s.payment_status !== 'Paid' && (window.Utils.parseNum(s.closing_outstanding) || 0) > 0).forEach(s => {
            if (!s.due_date) return;
            const dd = new Date(s.due_date);
            if (dd.getFullYear() === y && dd.getMonth() === m) {
                const card = cards.find(c => String(c.card_id) === String(s.card_id)) || {};
                dayEvents[dd.getDate()]?.dues.push({ stmt: s, card });
            }
        });

        let cellsHtml = '';
        for (let blank = 0; blank < firstDay; blank++) {
            cellsHtml += `<div class="ps-cal-cell is-empty"></div>`;
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const ev = dayEvents[d];
            const isSel = d === this.selectedCalDay;
            const dueTotal = ev.dues.reduce((sum, x) => sum + (window.Utils.parseNum(x.stmt.closing_outstanding) || 0), 0);
            cellsHtml += `
                <button type="button" class="ps-cal-cell ${isSel ? 'is-selected' : ''}" onclick="window.PremiumSuite.selectCalDay(${d})">
                    <span class="ps-cal-day">${d}</span>
                    <div class="ps-cal-dots">
                        ${ev.dues.length ? `<span class="ps-cal-pill pill-due">${ev.dues.length} Due</span>` : ''}
                        ${ev.stmts.length ? `<span class="ps-cal-pill pill-stmt">${ev.stmts.length} Stmt</span>` : ''}
                        ${ev.renewals.length ? `<span class="ps-cal-pill pill-ren">${ev.renewals.length} Ren</span>` : ''}
                    </div>
                    ${dueTotal > 0 ? `<div class="ps-cal-amt">${window.Utils.formatCurrency(dueTotal).replace('.00', '')}</div>` : ''}
                </button>
            `;
        }

        const selEv = dayEvents[this.selectedCalDay] || { stmts: [], dues: [], renewals: [] };

        body.innerHTML = `
            <div class="ps-cal-layout">
                <div class="card p-3" style="border-radius:16px;">
                    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                        <h4 class="mb-0" style="font-weight:800;">${esc(monthName)}</h4>
                        <div class="d-flex gap-2 align-items-center">
                            <span class="ps-cal-pill pill-due">Due</span>
                            <span class="ps-cal-pill pill-stmt">Stmt Gen</span>
                            <span class="ps-cal-pill pill-ren">Renewal</span>
                            <button type="button" class="btn btn-sm btn-outline" onclick="window.PremiumSuite.shiftCalMonth(-1)">&laquo;</button>
                            <button type="button" class="btn btn-sm btn-outline" onclick="window.PremiumSuite.resetCalToday()">Today</button>
                            <button type="button" class="btn btn-sm btn-outline" onclick="window.PremiumSuite.shiftCalMonth(1)">&raquo;</button>
                        </div>
                    </div>
                    <div class="ps-cal-weekdays">
                        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                    </div>
                    <div class="ps-cal-grid">${cellsHtml}</div>
                </div>

                <div class="card p-3" style="border-radius:16px;">
                    <h5 class="mb-3" style="font-weight:800;"><i class="fas fa-calendar-day text-primary"></i> ${this.selectedCalDay} ${esc(monthName)}</h5>
                    <div class="ps-cal-inspector">
                        ${selEv.dues.length ? `
                            <div class="ps-ins-sec">
                                <div class="ps-ins-lbl text-danger">Payment Dues (${selEv.dues.length})</div>
                                ${selEv.dues.map(x => `
                                    <div class="ps-ins-row">
                                        <div><strong>${esc(x.card.cardholder_name || 'Card')} (*${esc(x.card.card_last4 || '')})</strong><br><small>${esc(x.card.bank_name || '')}</small></div>
                                        <div class="d-flex align-items-center gap-2">
                                            <strong style="color:#e11d48;">${window.Utils.formatCurrency(x.stmt.closing_outstanding)}</strong>
                                            <button type="button" class="btn btn-sm pay-btn-go" onclick="window.Payments?.showPaymentModal('${x.stmt.card_id}', '${x.stmt.statement_id}')">Pay</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>` : ''}
                        ${selEv.stmts.length ? `
                            <div class="ps-ins-sec">
                                <div class="ps-ins-lbl text-primary">Statement Generation (${selEv.stmts.length})</div>
                                ${selEv.stmts.map(c => `
                                    <div class="ps-ins-row">
                                        <span><strong>${esc(c.cardholder_name || '')}</strong> (*${esc(c.card_last4 || '')})</span>
                                        <small>${esc(c.bank_name || '')}</small>
                                    </div>
                                `).join('')}
                            </div>` : ''}
                        ${selEv.renewals.length ? `
                            <div class="ps-ins-sec">
                                <div class="ps-ins-lbl" style="color:#9333ea;">Card Renewals (${selEv.renewals.length})</div>
                                ${selEv.renewals.map(c => `
                                    <div class="ps-ins-row">
                                        <span><strong>${esc(c.cardholder_name || '')}</strong> (*${esc(c.card_last4 || '')})</span>
                                        <small>${esc(c.bank_name || '')}</small>
                                    </div>
                                `).join('')}
                            </div>` : ''}
                        ${(!selEv.dues.length && !selEv.stmts.length && !selEv.renewals.length) ? `<div class="text-muted small py-4 text-center">No billing, due, or renewal events on this date.</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    selectCalDay(d) {
        this.selectedCalDay = d;
        this._renderCalendar(document.getElementById('ps-suite-body'));
    },

    shiftCalMonth(delta) {
        const dt = new Date(this.calYear, this.calMonth + delta, 1);
        this.calYear = dt.getFullYear();
        this.calMonth = dt.getMonth();
        this.selectedCalDay = 1;
        this._renderCalendar(document.getElementById('ps-suite-body'));
    },

    resetCalToday() {
        const now = new Date();
        this.calYear = now.getFullYear();
        this.calMonth = now.getMonth();
        this.selectedCalDay = now.getDate();
        this._renderCalendar(document.getElementById('ps-suite-body'));
    },

    // ── TAB 3: SMART PAYMENT ALLOCATOR ───────────────────────────
    _renderAllocator(body) {
        this._allocBudget = this._allocBudget || 500000;
        body.innerHTML = `
            <div class="card p-4 mb-4" style="border-radius:16px;">
                <div class="cf-grid-2" style="align-items:end;">
                    <div class="cf-field">
                        <label for="ps-alloc-budget">Available Cash Budget to Pay Today (₹)</label>
                        <input type="number" id="ps-alloc-budget" class="form-control" min="0" step="10000" value="${this._allocBudget}" oninput="window.PremiumSuite._allocBudget=parseFloat(this.value)||0; window.PremiumSuite._updateAllocatorTable();">
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        ${[200000, 500000, 1000000, 2500000].map(v => `
                            <button type="button" class="btn btn-sm btn-outline" onclick="document.getElementById('ps-alloc-budget').value=${v}; window.PremiumSuite._allocBudget=${v}; window.PremiumSuite._updateAllocatorTable();" style="border-radius:8px;font-weight:700;">₹${(v/100000)}L</button>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div id="ps-alloc-results"></div>
        `;
        this._updateAllocatorTable();
    },

    _updateAllocatorTable() {
        const resEl = document.getElementById('ps-alloc-results');
        if (!resEl) return;
        let remaining = this._allocBudget || 0;
        const cards = window.DB.cards.getAll() || [];
        const stmts = (window.DB.statements.getAll() || [])
            .filter(s => s.payment_status !== 'Paid' && (window.Utils.parseNum(s.closing_outstanding) || 0) > 0)
            .sort((a, b) => new Date(a.due_date || '2099-12-31') - new Date(b.due_date || '2099-12-31'));

        const esc = window.Utils.escapeHtml;
        let allocatedTotal = 0;
        const plan = stmts.map(s => {
            const due = window.Utils.parseNum(s.closing_outstanding) || 0;
            const pay = Math.min(due, remaining);
            remaining = Math.max(0, remaining - pay);
            allocatedTotal += pay;
            const card = cards.find(c => String(c.card_id) === String(s.card_id)) || {};
            return { stmt: s, card, due, pay, left: Math.max(0, due - pay) };
        });

        resEl.innerHTML = `
            <div class="txn-kpi-grid mb-4">
                <div class="txn-kpi-card kpi-credit">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Allocated Today</span><span class="txn-kpi-icon"><i class="fas fa-check-double"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(allocatedTotal)}</div>
                    <div class="txn-kpi-sub">Prioritized by earliest due date</div>
                </div>
                <div class="txn-kpi-card kpi-net-cr">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Unspent Budget</span><span class="txn-kpi-icon"><i class="fas fa-wallet"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(remaining)}</div>
                    <div class="txn-kpi-sub">Surplus cash remaining</div>
                </div>
                <div class="txn-kpi-card kpi-debit">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Statements Cleared</span><span class="txn-kpi-icon"><i class="fas fa-file-invoice"></i></span></div>
                    <div class="txn-kpi-val">${plan.filter(p => p.left === 0 && p.pay > 0).length} / ${plan.length}</div>
                    <div class="txn-kpi-sub">Fully settled with this budget</div>
                </div>
            </div>

            <div class="card data-table-wrapper">
                <div class="master-table-scroll">
                    <table class="data-table master-colorful-table w-100 mb-0">
                        <thead>
                            <tr>
                                <th>Due Date</th>
                                <th>Cardholder &amp; Bank</th>
                                <th class="text-right">Total Due</th>
                                <th class="text-right">Suggested Pay</th>
                                <th class="text-right">Remaining</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${plan.length ? plan.map(p => `
                                <tr class="row-primary" style="--row-accent:${p.left === 0 && p.pay > 0 ? '#10b981' : '#f59e0b'};">
                                    <td><span class="sr-pill">${window.Utils.formatDate(p.stmt.due_date)}</span></td>
                                    <td><strong>${esc(p.card.cardholder_name || 'Unknown')}</strong> <small class="text-muted">(${esc(p.card.bank_name || '')} *${esc(p.card.card_last4 || '')})</small></td>
                                    <td class="text-right">${window.Utils.formatCurrency(p.due)}</td>
                                    <td class="text-right"><span class="txn-amt-pill amt-cr">${window.Utils.formatCurrency(p.pay)}</span></td>
                                    <td class="text-right"><span class="txn-amt-pill ${p.left > 0 ? 'amt-dr' : 'amt-cr'}">${window.Utils.formatCurrency(p.left)}</span></td>
                                    <td><button type="button" class="btn btn-sm pay-btn-go" onclick="window.Payments?.showPaymentModal('${p.stmt.card_id}', '${p.stmt.statement_id}')">Pay</button></td>
                                </tr>
                            `).join('') : `<tr><td colspan="6" class="text-center py-4 text-success">All statements are already paid!</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
};

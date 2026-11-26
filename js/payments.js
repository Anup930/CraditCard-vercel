window.Payments = {
    currentTab: 'statements',
    viewMode: localStorage.getItem('ccms_pay_view') || 'table',

    setViewMode: function(mode) {
        this.viewMode = mode === 'cards' ? 'cards' : 'table';
        localStorage.setItem('ccms_pay_view', this.viewMode);
        document.querySelectorAll('.pay-view-btn').forEach(btn => {
            const active = btn.dataset.view === this.viewMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        this.renderTabContent();
    },

    render: function(container) {
        this.container = container;
        const stmts = window.DB.statements.getAll() || [];
        const unbilled = window.DB.unbilled.getAll() || [];
        const pmts = window.DB.payments.getAll() || [];
        const outCount = stmts.filter(s => s.payment_status !== 'Paid' && s.closing_outstanding > 0).length;

        const html = `
            <div class="page-header d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                <div>
                    <h2 class="page-title">Statements &amp; Payments</h2>
                    <div class="page-subtitle text-muted">Track billing cycles, unbilled swipes, settlements &amp; overdue alerts</div>
                </div>
                <div class="view-switcher" role="group" aria-label="Payments view mode">
                    <button type="button" class="view-switch-btn pay-view-btn ${this.viewMode === 'table' ? 'active' : ''}" data-view="table" aria-pressed="${this.viewMode === 'table'}" onclick="window.Payments.setViewMode('table')">
                        <i class="fas fa-table"></i> <span>Table View</span>
                    </button>
                    <button type="button" class="view-switch-btn pay-view-btn ${this.viewMode === 'cards' ? 'active' : ''}" data-view="cards" aria-pressed="${this.viewMode === 'cards'}" onclick="window.Payments.setViewMode('cards')">
                        <i class="fas fa-th-large"></i> <span>Card View</span>
                    </button>
                </div>
            </div>

            <div class="pay-tabs-bar mb-4" role="tablist">
                <button type="button" role="tab" aria-selected="${this.currentTab === 'statements'}" class="pay-tab-btn ${this.currentTab === 'statements' ? 'active' : ''}" onclick="window.Payments.switchTab('statements')">
                    <i class="fas fa-file-invoice-dollar"></i>
                    <span>Statements</span>
                    <span class="pay-tab-count">${stmts.length}</span>
                </button>
                <button type="button" role="tab" aria-selected="${this.currentTab === 'unbilled'}" class="pay-tab-btn ${this.currentTab === 'unbilled' ? 'active' : ''}" onclick="window.Payments.switchTab('unbilled')">
                    <i class="fas fa-receipt"></i>
                    <span>Unbilled Spends</span>
                    <span class="pay-tab-count">${unbilled.length}</span>
                </button>
                <button type="button" role="tab" aria-selected="${this.currentTab === 'payments'}" class="pay-tab-btn ${this.currentTab === 'payments' ? 'active' : ''}" onclick="window.Payments.switchTab('payments')">
                    <i class="fas fa-check-double"></i>
                    <span>Payments History</span>
                    <span class="pay-tab-count">${pmts.length}</span>
                </button>
                <button type="button" role="tab" aria-selected="${this.currentTab === 'outstanding'}" class="pay-tab-btn pay-tab-danger ${this.currentTab === 'outstanding' ? 'active' : ''}" onclick="window.Payments.switchTab('outstanding')">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Outstanding Dues</span>
                    <span class="pay-tab-count">${outCount}</span>
                </button>
            </div>

            <div id="payments-content"></div>
        `;

        this.container.innerHTML = html;
        this.renderTabContent();
    },

    switchTab: function(tab) {
        this.currentTab = tab;
        this.render(this.container);
    },

    renderTabContent: function() {
        const content = document.getElementById('payments-content');
        if(this.currentTab === 'statements') this.renderStatements(content);
        else if(this.currentTab === 'unbilled') this.renderUnbilled(content);
        else if(this.currentTab === 'payments') this.renderPayments(content);
        else if(this.currentTab === 'outstanding') this.renderOutstanding(content);
    },

    renderStatements: function(content) {
        const statements = window.DB.statements.getAll() || [];
        statements.sort((a,b) => new Date(b.due_date || 0) - new Date(a.due_date || 0));

        const totalBilled = statements.reduce((sum, s) => sum + (window.Utils.parseNum(s.billed_amount) || 0), 0);
        const totalPaid = statements.reduce((sum, s) => sum + (window.Utils.parseNum(s.credits_payments) || 0), 0);
        const totalOut = statements.reduce((sum, s) => sum + (window.Utils.parseNum(s.closing_outstanding) || 0), 0);

        const allCards = window.DB.cards.getAll() || [];
        const allPmts = window.DB.payments.getAll() || [];
        const esc = window.Utils.escapeHtml;
        const getCardStr = (id) => { const c = allCards.find(x => String(x.card_id) === String(id)); return c ? `${c.cardholder_name} (*${c.card_last4})` : 'Unknown'; };

        let html = `
            <div class="txn-kpi-grid mb-4">
                <div class="txn-kpi-card kpi-net-cr">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Total Billed</span><span class="txn-kpi-icon"><i class="fas fa-file-invoice"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalBilled)}</div>
                    <div class="txn-kpi-sub">${statements.length} statements tracked</div>
                </div>
                <div class="txn-kpi-card kpi-credit">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Credits &amp; Payments</span><span class="txn-kpi-icon"><i class="fas fa-check-circle"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalPaid)}</div>
                    <div class="txn-kpi-sub">Total settled against bills</div>
                </div>
                <div class="txn-kpi-card kpi-debit">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Closing Outstanding</span><span class="txn-kpi-icon"><i class="fas fa-hourglass-half"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalOut)}</div>
                    <div class="txn-kpi-sub">Remaining payable balance</div>
                </div>
            </div>

            <div class="card data-table-wrapper mb-4">
                <div class="table-toolbar">
                    <h4 class="card-title mb-0" style="font-weight:800;">All Statements</h4>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline" onclick="window.DataImport.openModal('statements')" style="background:#eef2ff;color:#4361ee;border-color:#c7d2fe;border-radius:8px;font-weight:600;"><i class="fas fa-file-import"></i> Import</button>
                        <button class="btn btn-primary" onclick="window.Payments.showStatementModal()" style="border-radius:8px;font-weight:600;"><i class="fas fa-plus"></i> Add Statement</button>
                    </div>
                </div>
        `;

        if (this.viewMode === 'cards') {
            if (statements.length === 0) {
                html += `<div class="empty-state py-5">No statements recorded.</div>`;
            } else {
                html += `<div class="pay-cards-grid">`;
                statements.forEach((s, i) => {
                    const hasPayment = allPmts.some(p => String(p.statement_id) === String(s.statement_id));
                    const st = s.payment_status || 'Pending';
                    const isPaid = st === 'Paid';
                    const isOver = st === 'Overdue';
                    const cardTheme = isPaid ? 'pay-card-emerald' : (isOver ? 'pay-card-rose' : 'pay-card-indigo');
                    const pillCls = isPaid ? 'pill-status-active' : (isOver ? 'pill-status-blocked' : 'pill-cat-addon');

                    html += `
                        <article class="pay-card ${cardTheme}" style="animation-delay:${Math.min(i * 25, 240)}ms;">
                            <div class="pay-card-top">
                                <span class="vivid-pill pill-cat-primary">${esc(window.Utils.formatMonthYear(s.statement_month))}</span>
                                <span class="vivid-pill ${pillCls}"><span class="pill-dot"></span>${esc(st)}</span>
                            </div>
                            <div class="pay-card-title">${esc(getCardStr(s.card_id))}</div>
                            <div class="pay-card-due"><i class="far fa-calendar-alt"></i> Due: <strong>${window.Utils.formatDate(s.due_date)}</strong></div>

                            <div class="pay-mini-metrics">
                                <div><span>Billed</span><strong>${window.Utils.formatCurrency(s.billed_amount)}</strong></div>
                                <div><span>Paid</span><strong style="color:#059669;">${window.Utils.formatCurrency(s.credits_payments)}</strong></div>
                                <div><span>Due</span><strong style="color:#e11d48;">${window.Utils.formatCurrency(s.closing_outstanding)}</strong></div>
                            </div>

                            <div class="pay-card-footer">
                                <span class="pay-min-due">Min Due: ${window.Utils.formatCurrency(s.minimum_due)}</span>
                                <div class="master-row-actions">
                                    <button class="act-btn act-view" title="View Details" onclick="window.Payments.viewStatement('${s.statement_id}')"><i class="fas fa-eye"></i></button>
                                    <button class="act-btn act-edit" title="Edit Statement" onclick="window.Payments.showStatementModal('${s.statement_id}')"><i class="fas fa-edit"></i></button>
                                    ${hasPayment
                                        ? `<button class="btn btn-sm pay-btn-info" onclick="window.Payments.viewStatement('${s.statement_id}')">Details</button>`
                                        : `<button class="btn btn-sm pay-btn-go" onclick="window.Payments.showPaymentModal('${s.card_id}', '${s.statement_id}')">Pay</button>`
                                    }
                                </div>
                            </div>
                        </article>
                    `;
                });
                html += `</div>`;
            }
        } else {
            html += `
                <div class="master-table-scroll" tabindex="0" role="region" aria-label="All Statements Table">
                <table class="data-table master-colorful-table table w-100 mb-0">
                    <thead>
                        <tr>
                            <th>Card</th>
                            <th>Month</th>
                            <th class="text-right">Opening</th>
                            <th class="text-right">Billed</th>
                            <th class="text-right">Credits/Pmts</th>
                            <th class="text-right">Outstanding</th>
                            <th class="text-right">Min Due</th>
                            <th>Due Date</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if(statements.length === 0) {
                html += `<tr><td colspan="10" class="text-center py-4">No statements recorded.</td></tr>`;
            } else {
                statements.forEach(s => {
                    const st = s.payment_status || 'Pending';
                    let pillCls = 'pill-status-inactive';
                    let accent = '#6366f1';
                    if(st === 'Paid') { pillCls = 'pill-status-active'; accent = '#10b981'; }
                    else if(st === 'Overdue') { pillCls = 'pill-status-blocked'; accent = '#f43f5e'; }
                    else if(st === 'Partial') { pillCls = 'pill-cat-addon'; accent = '#f59e0b'; }
                    else if(st === 'Pending') { pillCls = 'pill-cat-addon'; accent = '#3b82f6'; }

                    const hasPayment = allPmts.some(p => String(p.statement_id) === String(s.statement_id));

                    html += `
                        <tr class="row-primary" style="--row-accent: ${accent};">
                            <td><span class="owner-text">${esc(getCardStr(s.card_id))}</span></td>
                            <td><span class="vivid-pill pill-cat-primary">${esc(window.Utils.formatMonthYear(s.statement_month))}</span></td>
                            <td class="text-right">${window.Utils.formatCurrency(s.opening_balance)}</td>
                            <td class="text-right"><strong>${window.Utils.formatCurrency(s.billed_amount)}</strong></td>
                            <td class="text-right"><span class="txn-amt-pill amt-cr">${window.Utils.formatCurrency(s.credits_payments)}</span></td>
                            <td class="text-right"><span class="txn-amt-pill amt-dr">${window.Utils.formatCurrency(s.closing_outstanding)}</span></td>
                            <td class="text-right text-muted">${window.Utils.formatCurrency(s.minimum_due)}</td>
                            <td>${window.Utils.formatDate(s.due_date)}</td>
                            <td><span class="vivid-pill ${pillCls}"><span class="pill-dot"></span>${esc(st)}</span></td>
                            <td>
                                <div class="master-row-actions">
                                    <button class="act-btn act-view" title="View Details" onclick="window.Payments.viewStatement('${s.statement_id}')"><i class="fas fa-eye"></i></button>
                                    <button class="act-btn act-edit" title="Edit Statement" onclick="window.Payments.showStatementModal('${s.statement_id}')"><i class="fas fa-edit"></i></button>
                                    ${hasPayment
                                        ? `<button class="btn btn-sm pay-btn-info" onclick="window.Payments.viewStatement('${s.statement_id}')">Payment Details</button>`
                                        : `<button class="btn btn-sm pay-btn-go" onclick="window.Payments.showPaymentModal('${s.card_id}', '${s.statement_id}')">Pay</button>`
                                    }
                                </div>
                            </td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div>`;
        }

        html += `</div>`;
        content.innerHTML = html;
    },

    renderPayments: function(content) {
        const payments = window.DB.payments.getAll() || [];
        payments.sort((a,b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));

        const totalPaid = payments.reduce((sum, p) => sum + (window.Utils.parseNum(p.amount) || 0), 0);
        const allCards = window.DB.cards.getAll() || [];
        const allStmts = window.DB.statements.getAll() || [];
        const esc = window.Utils.escapeHtml;

        let html = `
            <div class="txn-kpi-grid mb-4" style="grid-template-columns: repeat(2, 1fr);">
                <div class="txn-kpi-card kpi-credit">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Total Payments Recorded</span><span class="txn-kpi-icon"><i class="fas fa-check-double"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalPaid)}</div>
                    <div class="txn-kpi-sub">${payments.length} completed settlements</div>
                </div>
                <div class="txn-kpi-card kpi-net-cr">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Latest Payment Date</span><span class="txn-kpi-icon"><i class="fas fa-calendar-check"></i></span></div>
                    <div class="txn-kpi-val">${payments[0] ? window.Utils.formatDate(payments[0].payment_date) : '—'}</div>
                    <div class="txn-kpi-sub">${payments[0] ? window.Utils.formatCurrency(payments[0].amount) : 'No payments yet'}</div>
                </div>
            </div>

            <div class="card data-table-wrapper mb-4">
                <div class="table-toolbar">
                    <h4 class="card-title mb-0" style="font-weight:800;">Payment History</h4>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline" onclick="window.DataImport.openModal('payments')" style="background:#eef2ff;color:#4361ee;border-color:#c7d2fe;border-radius:8px;font-weight:600;"><i class="fas fa-file-import"></i> Import</button>
                        <button class="btn btn-success" onclick="window.Payments.showPaymentModal()" style="border-radius:8px;font-weight:600;"><i class="fas fa-plus"></i> Record Payment</button>
                    </div>
                </div>
        `;

        if (this.viewMode === 'cards') {
            if (payments.length === 0) {
                html += `<div class="empty-state py-5">No payments recorded.</div>`;
            } else {
                html += `<div class="pay-cards-grid">`;
                payments.forEach((p, i) => {
                    const c = allCards.find(x => String(x.card_id) === String(p.card_id));
                    const s = allStmts.find(x => String(x.statement_id) === String(p.statement_id));
                    const cardStr = c ? `${c.cardholder_name} (*${c.card_last4})` : 'Unknown';
                    const stmtStr = s ? window.Utils.formatMonthYear(s.statement_month) : 'N/A';

                    html += `
                        <article class="pay-card pay-card-emerald" style="animation-delay:${Math.min(i * 25, 240)}ms;">
                            <div class="pay-card-top">
                                <span class="vivid-pill pill-status-active"><span class="pill-dot"></span>${esc(p.status || 'Paid')}</span>
                                <span class="txn-rc-date"><i class="far fa-calendar-alt"></i> ${window.Utils.formatDate(p.payment_date)}</span>
                            </div>
                            <div class="txn-rc-amount amt-cr">${window.Utils.formatCurrency(p.amount)}</div>
                            <div class="pay-card-title">${esc(cardStr)}</div>
                            <div class="txn-rc-tags">
                                <span class="ledger-pill">${esc(p.payment_mode || 'Bank')}</span>
                                <span class="vivid-pill pill-cat-primary">${esc(stmtStr)}</span>
                                ${p.reference_no ? `<span class="card-num-pill">Ref: ${esc(p.reference_no)}</span>` : ''}
                            </div>
                        </article>
                    `;
                });
                html += `</div>`;
            }
        } else {
            html += `
                <div class="master-table-scroll" tabindex="0" role="region" aria-label="Payment History Table">
                <table class="data-table master-colorful-table table w-100 mb-0">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Card</th>
                            <th class="text-right">Amount</th>
                            <th>Mode</th>
                            <th>Reference No</th>
                            <th>Statement</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if(payments.length === 0) {
                html += `<tr><td colspan="7" class="text-center py-4">No payments recorded.</td></tr>`;
            } else {
                payments.forEach(p => {
                    const c = allCards.find(x => String(x.card_id) === String(p.card_id));
                    const s = allStmts.find(x => String(x.statement_id) === String(p.statement_id));
                    const cardStr = c ? `${c.cardholder_name} (*${c.card_last4})` : 'Unknown';
                    const stmtStr = s ? window.Utils.formatMonthYear(s.statement_month) : 'N/A';

                    html += `
                        <tr class="row-primary" style="--row-accent: #10b981;">
                            <td><span class="sr-pill">${window.Utils.formatDate(p.payment_date)}</span></td>
                            <td><span class="owner-text">${esc(cardStr)}</span></td>
                            <td class="text-right"><span class="txn-amt-pill amt-cr">${window.Utils.formatCurrency(p.amount)}</span></td>
                            <td><span class="ledger-pill">${esc(p.payment_mode || '')}</span></td>
                            <td><span class="card-num-pill">${esc(p.reference_no || '-')}</span></td>
                            <td><span class="vivid-pill pill-cat-primary">${esc(stmtStr)}</span></td>
                            <td><span class="vivid-pill pill-status-active"><span class="pill-dot"></span>${esc(p.status || 'Paid')}</span></td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div>`;
        }

        html += `</div>`;
        content.innerHTML = html;
    },

    renderOutstanding: function(content) {
        const statements = window.DB.statements.getAll() || [];
        const allCards = window.DB.cards.getAll() || [];
        const esc = window.Utils.escapeHtml;

        const outstanding = statements.filter(s => s.payment_status !== 'Paid' && s.closing_outstanding > 0);
        outstanding.sort((a,b) => new Date(a.due_date) - new Date(b.due_date));

        let totalOut = 0;
        let totalOver = 0;
        const today = new Date();

        outstanding.forEach(s => {
            totalOut += s.closing_outstanding;
            if(new Date(s.due_date) < today) totalOver += s.closing_outstanding;
        });

        let html = `
            <div class="txn-kpi-grid mb-4">
                <div class="txn-kpi-card kpi-debit">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Total Outstanding</span><span class="txn-kpi-icon"><i class="fas fa-exclamation-triangle"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalOut)}</div>
                    <div class="txn-kpi-sub">Immediate liquidity required</div>
                </div>
                <div class="txn-kpi-card kpi-net-cr" style="background: linear-gradient(135deg, #0f172a 0%, #991b1b 100%);">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Total Overdue</span><span class="txn-kpi-icon"><i class="fas fa-fire"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalOver)}</div>
                    <div class="txn-kpi-sub">Past due date</div>
                </div>
                <div class="txn-kpi-card kpi-net-dr">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Pending Statements</span><span class="txn-kpi-icon"><i class="fas fa-clock"></i></span></div>
                    <div class="txn-kpi-val">${outstanding.length}</div>
                    <div class="txn-kpi-sub">Awaiting settlement</div>
                </div>
            </div>

            <div class="card data-table-wrapper mb-4">
                <div class="table-toolbar">
                    <h4 class="card-title mb-0" style="font-weight:800;">Outstanding Statements</h4>
                </div>
        `;

        if (this.viewMode === 'cards') {
            if (outstanding.length === 0) {
                html += `<div class="empty-state py-5 text-success"><i class="fas fa-check-circle me-2"></i>All dues are cleared!</div>`;
            } else {
                html += `<div class="pay-cards-grid">`;
                outstanding.forEach((s, i) => {
                    const c = allCards.find(x => String(x.card_id) === String(s.card_id));
                    const isOverdue = new Date(s.due_date) < today;
                    const diffDays = isOverdue ? Math.ceil(Math.abs(today - new Date(s.due_date)) / (1000 * 60 * 60 * 24)) : 0;

                    html += `
                        <article class="pay-card ${isOverdue ? 'pay-card-rose' : 'pay-card-amber'}" style="animation-delay:${Math.min(i * 25, 240)}ms;">
                            <div class="pay-card-top">
                                <span class="vivid-pill ${isOverdue ? 'pill-status-blocked' : 'pill-cat-addon'}">
                                    <span class="pill-dot"></span>${isOverdue ? `Overdue (${diffDays}d)` : 'Pending'}
                                </span>
                                <span class="vivid-pill pill-cat-primary">${esc(window.Utils.formatMonthYear(s.statement_month))}</span>
                            </div>
                            <div class="txn-rc-amount amt-dr">${window.Utils.formatCurrency(s.closing_outstanding)}</div>
                            <div class="pay-card-title">${esc(c ? c.cardholder_name : 'Unknown')} (*${esc(c ? c.card_last4 : '')})</div>
                            <div class="pay-card-due"><i class="fas fa-university"></i> ${esc(c ? c.bank_name : '')} &bull; Due: <strong>${window.Utils.formatDate(s.due_date)}</strong></div>
                            <div class="pay-card-footer">
                                <button class="act-btn act-view" title="View Details" onclick="window.Payments.viewStatement('${s.statement_id}')"><i class="fas fa-eye"></i></button>
                                <button class="btn btn-sm pay-btn-go" onclick="window.Payments.showPaymentModal('${s.card_id}', '${s.statement_id}')"><i class="fas fa-bolt"></i> Pay Now</button>
                            </div>
                        </article>
                    `;
                });
                html += `</div>`;
            }
        } else {
            html += `
                <div class="master-table-scroll" tabindex="0" role="region" aria-label="Outstanding Statements Table">
                <table class="data-table master-colorful-table table w-100 mb-0">
                    <thead>
                        <tr>
                            <th>Due Date</th>
                            <th>Card</th>
                            <th>Bank</th>
                            <th>Month</th>
                            <th class="text-right">Amount Due</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if(outstanding.length === 0) {
                html += `<tr><td colspan="7" class="text-center py-4 text-success"><i class="fas fa-check-circle me-2"></i>All dues are cleared!</td></tr>`;
            } else {
                outstanding.forEach(s => {
                    const c = allCards.find(x => String(x.card_id) === String(s.card_id));
                    const isOverdue = new Date(s.due_date) < today;
                    const diffDays = isOverdue ? Math.ceil(Math.abs(today - new Date(s.due_date)) / (1000 * 60 * 60 * 24)) : 0;

                    html += `
                        <tr class="${isOverdue ? 'row-addon' : 'row-primary'}" style="--row-accent: ${isOverdue ? '#f43f5e' : '#f59e0b'};">
                            <td>
                                <strong style="color:${isOverdue ? '#e11d48' : '#0f172a'};">${window.Utils.formatDate(s.due_date)}</strong>
                                ${isOverdue ? `<small style="display:block;color:#e11d48;font-weight:700;">${diffDays} days overdue</small>` : ''}
                            </td>
                            <td><span class="owner-text">${esc(c ? c.cardholder_name : 'Unknown')} (*${esc(c ? c.card_last4 : '')})</span></td>
                            <td><span class="ledger-pill">${esc(c ? c.bank_name : '')}</span></td>
                            <td><span class="vivid-pill pill-cat-primary">${esc(window.Utils.formatMonthYear(s.statement_month))}</span></td>
                            <td class="text-right"><span class="txn-amt-pill amt-dr">${window.Utils.formatCurrency(s.closing_outstanding)}</span></td>
                            <td><span class="vivid-pill ${isOverdue ? 'pill-status-blocked' : 'pill-cat-addon'}"><span class="pill-dot"></span>${isOverdue ? 'Overdue' : 'Pending'}</span></td>
                            <td>
                                <div class="master-row-actions">
                                    <button class="act-btn act-view" title="View Details" onclick="window.Payments.viewStatement('${s.statement_id}')"><i class="fas fa-eye"></i></button>
                                    ${s.payment_status === 'Paid' || parseFloat(s.closing_outstanding) <= 0
                                        ? `<button class="btn btn-sm pay-btn-info" onclick="window.Payments.viewStatement('${s.statement_id}')">Payment Details</button>`
                                        : `<button class="btn btn-sm pay-btn-go" onclick="window.Payments.showPaymentModal('${s.card_id}', '${s.statement_id}')">Pay Now</button>`
                                    }
                                </div>
                            </td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div>`;
        }

        html += `</div>`;
        content.innerHTML = html;
    },

    viewStatement: function(stmtId) {
        const stmts = window.DB.statements.getAll() || [];
        const s = stmts.find(x => String(x.statement_id) === String(stmtId));
        if(!s) return;

        const allCards = window.DB.cards.getAll() || [];
        const c = allCards.find(x => String(x.card_id) === String(s.card_id)) || {};

        const stmtPayments = (window.DB.payments.getAll() || []).filter(p => String(p.statement_id) === String(s.statement_id));
        
        let paymentsRows = '';
        if (stmtPayments.length === 0) {
            paymentsRows = `<tr><td colspan="4" class="text-center py-3 text-muted">No payments recorded for this statement.</td></tr>`;
        } else {
            stmtPayments.forEach(p => {
                paymentsRows += `
                    <tr>
                        <td>${window.Utils.formatDate(p.payment_date)}</td>
                        <td class="text-right">${window.Utils.formatCurrency(p.amount)}</td>
                        <td>${p.payment_mode}</td>
                        <td>${p.reference_no || '-'}</td>
                    </tr>
                `;
            });
        }

        const html = `
            <style>
                #modal { max-width: 650px !important; }
                .stmt-section { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
                .stmt-section-title { background: #f8fafc; padding: 12px 16px; font-weight: 600; font-size: 0.95rem; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
                .stmt-row { display: flex; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
                .stmt-row:last-child { border-bottom: none; }
                .stmt-row .label { color: #64748b; }
                .stmt-row .value { font-weight: 500; color: #1e293b; text-align: right; }
                .stmt-row.highlight { background: #e0f2fe; font-weight: 600; }
                .stmt-row.highlight .label { color: #0369a1; }
                .stmt-row.highlight .value { color: #0369a1; background: #bae6fd; padding: 2px 6px; border-radius: 4px; }
                .pmt-table { width: 100%; font-size: 0.85rem; }
                .pmt-table th { color: #64748b; font-weight: 600; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; font-size: 0.7rem; }
                .pmt-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #334155; }
                .pmt-table tr:last-child td { border-bottom: none; }
            </style>

            <div class="stmt-section mt-2">
                <div class="stmt-row">
                    <span class="label">Statement Month</span>
                    <span class="value">${window.Utils.formatMonthYear(s.statement_month)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Payment due date</span>
                    <span class="value">${window.Utils.formatDate(s.due_date)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Opening balance</span>
                    <span class="value">${window.Utils.formatCurrency(s.opening_balance)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Billed this cycle</span>
                    <span class="value">${window.Utils.formatCurrency(s.billed_amount)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Credits / payments</span>
                    <span class="value">${window.Utils.formatCurrency(s.credits_payments)}</span>
                </div>
                <div class="stmt-row highlight">
                    <span class="label">Total amount due</span>
                    <span class="value">${window.Utils.formatCurrency(s.closing_outstanding)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Minimum due</span>
                    <span class="value">${window.Utils.formatCurrency(s.minimum_due)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Unbilled amount</span>
                    <span class="value">${window.Utils.formatCurrency(s.unbilled_amount)}</span>
                </div>
            </div>

            <div class="stmt-section">
                <div class="stmt-section-title">
                    <span>Card & limits</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Cardholder</span>
                    <span class="value">${c.cardholder_name || '-'}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Primary owner</span>
                    <span class="value">${c.primary_cardholder || '-'}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Zoho ledger</span>
                    <span class="value">${c.zoho_ledger_name || '-'}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Credit limit</span>
                    <span class="value">${window.Utils.formatCurrency(c.credit_limit)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Available limit</span>
                    <span class="value">${window.Utils.formatCurrency(Math.max(0, (c.credit_limit || 0) - (s.closing_outstanding || 0) - (s.unbilled_amount || 0)))}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Reward points</span>
                    <span class="value">${c.reward_points || 0}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Paid to date</span>
                    <span class="value">${window.Utils.formatCurrency(s.credits_payments)}</span>
                </div>
                <div class="stmt-row">
                    <span class="label">Still due</span>
                    <span class="value fw-bold">${window.Utils.formatCurrency(s.closing_outstanding)}</span>
                </div>
            </div>

            <div class="stmt-section">
                <div class="stmt-section-title">
                    <span>Payments against this statement</span>
                    <span class="text-muted fw-normal" style="font-size: 0.8rem;">${stmtPayments.length} recorded</span>
                </div>
                <table class="pmt-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th class="text-right">Amount</th>
                            <th>Mode</th>
                            <th>Reference</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paymentsRows}
                    </tbody>
                </table>
            </div>

            <div class="text-end pt-2 d-flex justify-content-center gap-2">
                <button class="btn btn-outline-secondary px-4 bg-white" onclick="window.App.closeModal()">Close</button>
                <button class="btn btn-outline-primary px-4 bg-white border-dark text-dark" onclick="window.App.closeModal(); setTimeout(() => window.Payments.showStatementModal('${s.statement_id}'), 300)">Edit statement</button>
                <button class="btn btn-primary px-4" style="background:#205e7e;border-color:#205e7e;" onclick="window.App.closeModal(); setTimeout(() => window.Payments.showPaymentModal('${s.card_id}', '${s.statement_id}'), 300)">Add another payment</button>
            </div>
        `;
        if(window.App && window.App.showModal) window.App.showModal("Statement Details", html);
    },

    renderUnbilled: function(content) {
        const allCards = window.DB.cards.getAll() || [];
        const unbilledRecords = window.DB.unbilled.getAll() || [];
        
        this.unbilledCardFilter = this.unbilledCardFilter || 'all';
        this.unbilledStatusFilter = this.unbilledStatusFilter || 'Unbilled';
        this.unbilledMonthFilter = this.unbilledMonthFilter || 'all';

        let filtered = unbilledRecords;
        if (this.unbilledCardFilter !== 'all') {
            filtered = filtered.filter(u => String(u.card_id) === String(this.unbilledCardFilter));
        }
        if (this.unbilledStatusFilter !== 'all') {
            filtered = filtered.filter(u => (u.status || 'Unbilled') === this.unbilledStatusFilter);
        }
        if (this.unbilledMonthFilter !== 'all') {
            filtered = filtered.filter(u => u.expected_statement_month === this.unbilledMonthFilter);
        }

        const totalPending = unbilledRecords.filter(u => (u.status || 'Unbilled') === 'Unbilled')
            .reduce((s, u) => s + (window.Utils.parseNum(u.amount) || 0), 0);
        const totalBilled = unbilledRecords.filter(u => u.status === 'Billed')
            .reduce((s, u) => s + (window.Utils.parseNum(u.amount) || 0), 0);

        const months = [...new Set(unbilledRecords.map(u => u.expected_statement_month).filter(Boolean))].sort();
        const esc = window.Utils.escapeHtml;

        let html = `
            <div class="txn-kpi-grid mb-4" style="grid-template-columns: repeat(2, 1fr);">
                <div class="txn-kpi-card kpi-net-dr">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Total Pending Unbilled</span><span class="txn-kpi-icon"><i class="fas fa-clock"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalPending)}</div>
                    <div class="txn-kpi-sub">Awaiting statement billing</div>
                </div>
                <div class="txn-kpi-card kpi-credit">
                    <div class="txn-kpi-top"><span class="txn-kpi-lbl">Total Closed / Billed</span><span class="txn-kpi-icon"><i class="fas fa-check-circle"></i></span></div>
                    <div class="txn-kpi-val">${window.Utils.formatCurrency(totalBilled)}</div>
                    <div class="txn-kpi-sub">Reconciled into statements</div>
                </div>
            </div>

            <div class="card data-table-wrapper mb-4">
                <div class="table-toolbar flex-wrap gap-2">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <h4 class="card-title mb-0 me-2" style="font-weight:800;">Unbilled Spends</h4>
                        <select class="form-select form-select-sm" style="width:auto;" onchange="window.Payments.unbilledCardFilter=this.value; window.Payments.renderTabContent();">
                            <option value="all">All Cards</option>
                            ${allCards.map(c => `<option value="${c.card_id}" ${String(this.unbilledCardFilter) === String(c.card_id) ? 'selected' : ''}>${esc(c.cardholder_name)} (*${esc(c.card_last4)})</option>`).join('')}
                        </select>
                        <select class="form-select form-select-sm" style="width:auto;" onchange="window.Payments.unbilledStatusFilter=this.value; window.Payments.renderTabContent();">
                            <option value="all" ${this.unbilledStatusFilter === 'all' ? 'selected' : ''}>All Status</option>
                            <option value="Unbilled" ${this.unbilledStatusFilter === 'Unbilled' ? 'selected' : ''}>Pending (Unbilled)</option>
                            <option value="Billed" ${this.unbilledStatusFilter === 'Billed' ? 'selected' : ''}>Closed (Billed)</option>
                        </select>
                        <select class="form-select form-select-sm" style="width:auto;" onchange="window.Payments.unbilledMonthFilter=this.value; window.Payments.renderTabContent();">
                            <option value="all">All Expected Months</option>
                            ${months.map(m => `<option value="${m}" ${this.unbilledMonthFilter === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline" onclick="window.DataImport.openModal('unbilled')" style="background:#eef2ff;color:#4361ee;border-color:#c7d2fe;border-radius:8px;font-weight:600;"><i class="fas fa-file-import"></i> Import</button>
                        <button class="btn btn-primary" onclick="window.Payments.showUnbilledModal()" style="border-radius:8px;font-weight:600;"><i class="fas fa-plus"></i> Add Unbilled Txn</button>
                    </div>
                </div>
        `;

        if (this.viewMode === 'cards') {
            if (filtered.length === 0) {
                html += `<div class="empty-state py-5 text-muted">No unbilled records found matching filter.</div>`;
            } else {
                html += `<div class="pay-cards-grid">`;
                filtered.forEach((u, i) => {
                    const c = allCards.find(x => String(x.card_id) === String(u.card_id));
                    const cardStr = c ? `${c.cardholder_name} (*${c.card_last4})` : 'Unknown';
                    const isBilled = u.status === 'Billed';

                    html += `
                        <article class="pay-card ${isBilled ? 'pay-card-emerald' : 'pay-card-amber'}" style="animation-delay:${Math.min(i * 25, 240)}ms;">
                            <div class="pay-card-top">
                                <span class="vivid-pill ${isBilled ? 'pill-status-active' : 'pill-cat-addon'}"><span class="pill-dot"></span>${isBilled ? 'Billed' : 'Unbilled'}</span>
                                <span class="txn-rc-date"><i class="far fa-calendar-alt"></i> ${window.Utils.formatDate(u.txn_date)}</span>
                            </div>
                            <div class="txn-rc-amount ${isBilled ? 'amt-cr' : 'amt-dr'}">${window.Utils.formatCurrency(u.amount)}</div>
                            <div class="pay-card-title">${esc(cardStr)}</div>
                            <div class="txn-rc-desc">${esc(u.description || 'No description')}</div>
                            <div class="pay-card-footer">
                                <span class="vivid-pill pill-cat-primary">${esc(u.expected_statement_month || 'Unset')}</span>
                                <div class="master-row-actions">
                                    <button class="act-btn act-edit" title="Edit" onclick="window.Payments.showUnbilledModal('${u.unbilled_id}')"><i class="fas fa-edit"></i></button>
                                    <button class="act-btn act-del" title="Delete" onclick="window.Payments.deleteUnbilled('${u.unbilled_id}')"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </article>
                    `;
                });
                html += `</div>`;
            }
        } else {
            html += `
                <div class="master-table-scroll" tabindex="0" role="region" aria-label="Unbilled Spends Table">
                <table class="data-table master-colorful-table table w-100 mb-0">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Card</th>
                            <th>Description</th>
                            <th>Expected Month</th>
                            <th class="text-right">Amount</th>
                            <th>Status</th>
                            <th>Linked Statement</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (filtered.length === 0) {
                html += `<tr><td colspan="8" class="text-center py-4 text-muted">No unbilled records found matching filter.</td></tr>`;
            } else {
                filtered.forEach(u => {
                    const c = allCards.find(x => String(x.card_id) === String(u.card_id));
                    const cardStr = c ? `${c.cardholder_name} (*${c.card_last4})` : 'Unknown';
                    const isBilled = u.status === 'Billed';
                    const statusBadge = isBilled ? '<span class="vivid-pill pill-status-active"><span class="pill-dot"></span>Billed</span>' : '<span class="vivid-pill pill-cat-addon"><span class="pill-dot"></span>Unbilled</span>';
                    const stmtLink = u.statement_id ? `<a href="javascript:void(0)" onclick="window.Payments.viewStatement('${u.statement_id}')" class="ledger-pill">Stmt #${u.statement_id}</a>` : '<span class="text-muted">-</span>';

                    html += `
                        <tr class="row-primary" style="--row-accent: ${isBilled ? '#10b981' : '#f59e0b'};">
                            <td><span class="sr-pill">${window.Utils.formatDate(u.txn_date)}</span></td>
                            <td><span class="owner-text">${esc(cardStr)}</span></td>
                            <td>${esc(u.description || '-')}</td>
                            <td><span class="vivid-pill pill-cat-primary">${esc(u.expected_statement_month || '-')}</span></td>
                            <td class="text-right"><span class="txn-amt-pill ${isBilled ? 'amt-cr' : 'amt-dr'}">${window.Utils.formatCurrency(u.amount)}</span></td>
                            <td>${statusBadge}</td>
                            <td>${stmtLink}</td>
                            <td>
                                <div class="master-row-actions">
                                    <button class="act-btn act-edit" title="Edit" onclick="window.Payments.showUnbilledModal('${u.unbilled_id}')"><i class="fas fa-edit"></i></button>
                                    <button class="act-btn act-del" title="Delete" onclick="window.Payments.deleteUnbilled('${u.unbilled_id}')"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div>`;
        }

        html += `</div>`;
        content.innerHTML = html;
    },

    showUnbilledModal: function(id = null, preCardId = null) {
        const allCards = window.DB.cards.getAll() || [];
        const unbilledRecords = window.DB.unbilled.getAll() || [];
        const item = unbilledRecords.find(x => String(x.unbilled_id) === String(id)) || {};
        const isEdit = !!id;
        const selCardId = item.card_id || preCardId || '';

        const html = `
            <form onsubmit="event.preventDefault(); window.Payments.saveUnbilled('${id || ''}')">
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Select Card</label>
                        <select class="form-select" id="fu_card" required>
                            <option value="">-- Select --</option>
                            ${allCards.map(c => `<option value="${c.card_id}" ${String(selCardId) === String(c.card_id) ? 'selected' : ''}>${c.cardholder_name} (*${c.card_last4})</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Transaction Date</label>
                        <input type="date" class="form-control" id="fu_date" value="${item.txn_date ? window.Utils.formatDateInput(new Date(item.txn_date)) : window.Utils.formatDateInput(new Date())}" required>
                    </div>
                </div>
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Description / Merchant</label>
                        <input type="text" class="form-control" id="fu_desc" value="${item.description || ''}" placeholder="e.g. Amazon, Fuel, Cloud Server" required>
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Amount (₹)</label>
                        <input type="number" step="0.01" class="form-control" id="fu_amount" value="${item.amount || ''}" placeholder="0.00" required>
                    </div>
                </div>
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Expected Statement Month (YYYY-MM)</label>
                        <input type="month" class="form-control" id="fu_month" value="${item.expected_statement_month || ''}">
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select" id="fu_status" required>
                            <option value="Unbilled" ${item.status !== 'Billed' ? 'selected' : ''}>Unbilled (Pending)</option>
                            <option value="Billed" ${item.status === 'Billed' ? 'selected' : ''}>Billed (Closed)</option>
                        </select>
                    </div>
                </div>
                <div class="text-end mt-4">
                    <button type="button" class="btn btn-secondary" onclick="window.App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Update Unbilled' : 'Save Unbilled'}</button>
                </div>
            </form>
        `;

        if (window.App && window.App.showModal) {
            window.App.showModal(isEdit ? "Edit Unbilled Transaction" : "Add Unbilled Transaction", html);
        }
    },

    saveUnbilled: async function(id) {
        const data = {
            card_id:                  parseInt(document.getElementById('fu_card').value) || 0,
            txn_date:                 document.getElementById('fu_date').value,
            description:              document.getElementById('fu_desc').value,
            amount:                   parseFloat(document.getElementById('fu_amount').value) || 0,
            expected_statement_month: document.getElementById('fu_month').value || null,
            status:                   document.getElementById('fu_status').value
        };

        if (window.App) window.App.closeModal();
        if (window.App) window.App.showToast('Saving unbilled transaction...', 'info');

        if (id) {
            await window.DB.unbilled.update(id, data);
        } else {
            await window.DB.unbilled.add(data);
        }

        if (window.App) window.App.showToast('Unbilled transaction saved', 'success');
        this.renderTabContent();
    },

    deleteUnbilled: async function(id) {
        if (!confirm('Are you sure you want to delete this unbilled record?')) return;
        if (window.App) window.App.showToast('Deleting...', 'info');
        await window.DB.unbilled.delete(id);
        if (window.App) window.App.showToast('Unbilled transaction deleted', 'success');
        this.renderTabContent();
    },

    showStatementModal: function(stmtId = null) {
        const stmts = window.DB.statements.getAll() || [];
        const s = stmts.find(x => String(x.statement_id) === String(stmtId)) || {};
        const isEdit = !!stmtId;
        const allCards = window.DB.cards.getAll() || [];

        // Compute initial closing outstanding for display
        const initClose = ((s.opening_balance||0) + (s.billed_amount||0) - (s.credits_payments||0)).toFixed(2);

        const html = `
            <form onsubmit="event.preventDefault(); window.Payments.saveStatement('${stmtId || ''}')">
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Select Card</label>
                        <select class="form-select" id="fs_card" required ${isEdit ? 'disabled' : ''} onchange="window.Payments.loadUnbilledForStatement(this.value)">
                            <option value="">-- Select --</option>
                            ${allCards.map(c => `<option value="${c.card_id}" ${String(s.card_id) === String(c.card_id) ? 'selected' : ''}>${c.cardholder_name} (*${c.card_last4})</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Statement Month (YYYY-MM)</label>
                        <input type="month" class="form-control" id="fs_month" value="${window.Utils.formatMonthInput(s.statement_month)}" required>
                    </div>
                </div>

                <div id="stmt_unbilled_container" class="mb-3"></div>

                <div class="row form-row mb-3">
                    <div class="col-md-4 form-group">
                        <label class="form-label">Opening Balance</label>
                        <input type="number" step="0.01" class="form-control" id="fs_open"
                               value="${s.opening_balance || 0}"
                               oninput="window.Payments.calcOutstanding()" required>
                    </div>
                    <div class="col-md-4 form-group">
                        <label class="form-label">Billed Amount</label>
                        <input type="number" step="0.01" class="form-control" id="fs_billed"
                               value="${s.billed_amount || 0}"
                               oninput="window.Payments.calcOutstanding()" required>
                    </div>
                    <div class="col-md-4 form-group">
                        <label class="form-label">Credits / Payments</label>
                        <input type="number" step="0.01" class="form-control" id="fs_credits"
                               value="${s.credits_payments || 0}"
                               oninput="window.Payments.calcOutstanding()" required>
                    </div>
                </div>
                <div class="row form-row mb-3">
                    <div class="col-md-4 form-group">
                        <label class="form-label">Unbilled Amount</label>
                        <input type="number" step="0.01" class="form-control" id="fs_unbilled" value="${s.unbilled_amount || 0}">
                    </div>
                    <div class="col-md-4 form-group">
                        <label class="form-label">Minimum Due</label>
                        <input type="number" step="0.01" class="form-control" id="fs_min" value="${s.minimum_due || 0}">
                    </div>
                    <div class="col-md-4 form-group">
                        <label class="form-label" style="color:#ef476f;font-weight:700;">
                            <i class="fas fa-exclamation-circle"></i> Closing Outstanding
                        </label>
                        <input type="number" step="0.01" class="form-control" id="fs_close"
                               value="${initClose}"
                               style="border-color:#ef476f;color:#ef476f;font-weight:700;background:#fff5f5;" readonly>
                    </div>
                </div>
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Due Date</label>
                        <input type="date" class="form-control" id="fs_due"
                               value="${s.due_date ? window.Utils.formatDateInput(new Date(s.due_date)) : ''}" required>
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Payment Status</label>
                        <select class="form-select" id="fs_status" required>
                            <option value="Pending"  ${s.payment_status === 'Pending'  ? 'selected' : ''}>Pending</option>
                            <option value="Paid"     ${s.payment_status === 'Paid'     ? 'selected' : ''}>Paid</option>
                            <option value="Partial"  ${s.payment_status === 'Partial'  ? 'selected' : ''}>Partial</option>
                            <option value="Overdue"  ${s.payment_status === 'Overdue'  ? 'selected' : ''}>Overdue</option>
                        </select>
                    </div>
                </div>
                <div class="text-end mt-4">
                    <button type="button" class="btn btn-secondary" onclick="window.App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Update Statement' : 'Save Statement'}</button>
                </div>
            </form>
        `;
        if(window.App && window.App.showModal) window.App.showModal(isEdit ? "Edit Statement" : "Add Statement", html);
        setTimeout(() => { 
            window.Utils.makeSearchable('fs_card');
            if (s.card_id) window.Payments.loadUnbilledForStatement(s.card_id);
        }, 50);
    },

    loadUnbilledForStatement: function(cardId) {
        const container = document.getElementById('stmt_unbilled_container');
        if(!container) return;
        if(!cardId) {
            container.innerHTML = '';
            return;
        }

        const pending = window.DB.unbilled.getPendingByCard(cardId);
        if(pending.length === 0) {
            container.innerHTML = `
                <div class="alert alert-light border py-2 px-3 small text-muted d-flex justify-content-between align-items-center" style="background:#f8fafc;border-radius:8px;">
                    <span><i class="fas fa-info-circle text-info me-1"></i> No unbilled transactions found for this card.</span>
                    <button type="button" class="btn btn-sm btn-link text-decoration-none py-0" onclick="window.Payments.showUnbilledModal(null, '${cardId}')">+ Record Unbilled</button>
                </div>
            `;
            return;
        }

        const totalUnbilledAmt = pending.reduce((sum, u) => sum + (window.Utils.parseNum(u.amount) || 0), 0);

        let tableRows = '';
        pending.forEach(u => {
            tableRows += `
                <tr>
                    <td class="text-center" style="width: 36px;">
                        <input type="checkbox" class="cb-unbilled-item form-check-input" data-id="${u.unbilled_id}" data-amount="${u.amount}" onchange="window.Payments.onUnbilledCheckboxChange()">
                    </td>
                    <td>${window.Utils.formatDate(u.txn_date)}</td>
                    <td>${u.description || '-'}</td>
                    <td><span class="badge bg-light text-dark">${u.expected_statement_month || '-'}</span></td>
                    <td class="text-right fw-bold">${window.Utils.formatCurrency(u.amount)}</td>
                </tr>
            `;
        });

        container.innerHTML = `
            <div class="card p-3 border mb-2" style="background:#f8fafc; border-radius:8px; border-color:#e2e8f0;">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="small text-dark"><i class="fas fa-receipt text-primary me-1"></i> Unbilled Transactions (${pending.length} available &bull; Total: ${window.Utils.formatCurrency(totalUnbilledAmt)})</strong>
                    <span class="badge bg-info text-dark" id="unbilled_calc_badge">Selected: ₹ 0.00 (0 items)</span>
                </div>
                <div class="table-responsive" style="max-height: 160px; overflow-y: auto; background:#fff; border:1px solid #e2e8f0; border-radius:6px;">
                    <table class="table table-sm table-hover mb-0" style="font-size: 0.82rem;">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th class="text-center" style="width: 36px;">
                                    <input type="checkbox" id="cb_unbilled_all" class="form-check-input" onchange="window.Payments.toggleAllUnbilledCheckboxes(this)">
                                </th>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Expected Month</th>
                                <th class="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2 small text-muted">
                    <span><i class="fas fa-check-double text-success me-1"></i> Check items included in this statement to auto-fill Billed Amount.</span>
                    <button type="button" class="btn btn-sm btn-outline-primary py-0" onclick="window.Payments.selectAllUnbilled(true)">Select All</button>
                </div>
            </div>
        `;
    },

    toggleAllUnbilledCheckboxes: function(masterCb) {
        const cbs = document.querySelectorAll('.cb-unbilled-item');
        cbs.forEach(cb => { cb.checked = masterCb.checked; });
        this.onUnbilledCheckboxChange();
    },

    selectAllUnbilled: function(checkAll = true) {
        const master = document.getElementById('cb_unbilled_all');
        if(master) master.checked = checkAll;
        const cbs = document.querySelectorAll('.cb-unbilled-item');
        cbs.forEach(cb => { cb.checked = checkAll; });
        this.onUnbilledCheckboxChange();
    },

    onUnbilledCheckboxChange: function() {
        const cbs = Array.from(document.querySelectorAll('.cb-unbilled-item'));
        let checkedSum = 0;
        let checkedCount = 0;
        let totalSum = 0;

        cbs.forEach(cb => {
            const amt = parseFloat(cb.getAttribute('data-amount')) || 0;
            totalSum += amt;
            if(cb.checked) {
                checkedSum += amt;
                checkedCount++;
            }
        });

        const remSum = Math.max(0, totalSum - checkedSum);

        const badge = document.getElementById('unbilled_calc_badge');
        if(badge) badge.innerText = `Selected: ${window.Utils.formatCurrency(checkedSum)} (${checkedCount} items)`;

        const billedInput = document.getElementById('fs_billed');
        if(billedInput && checkedCount > 0) {
            billedInput.value = checkedSum.toFixed(2);
        }

        const unbilledInput = document.getElementById('fs_unbilled');
        if(unbilledInput) {
            unbilledInput.value = remSum.toFixed(2);
        }

        this.calcOutstanding();
    },

    // Called by oninput on the 3 calc fields — live recalculates Closing Outstanding
    calcOutstanding: function() {
        const open   = parseFloat(document.getElementById('fs_open')?.value)    || 0;
        const billed = parseFloat(document.getElementById('fs_billed')?.value)  || 0;
        const creds  = parseFloat(document.getElementById('fs_credits')?.value) || 0;
        const result = open + billed - creds;
        const el = document.getElementById('fs_close');
        if(el) el.value = result.toFixed(2);
    },

    saveStatement: async function(id) {
        const cardId = document.getElementById('fs_card').value;
        const data = {
            card_id:              cardId,
            statement_month:      document.getElementById('fs_month').value,
            opening_balance:      parseFloat(document.getElementById('fs_open').value) || 0,
            billed_amount:        parseFloat(document.getElementById('fs_billed').value) || 0,
            unbilled_amount:      parseFloat(document.getElementById('fs_unbilled').value) || 0,
            credits_payments:     parseFloat(document.getElementById('fs_credits').value) || 0,
            closing_outstanding:  parseFloat(document.getElementById('fs_close').value) || 0,
            minimum_due:          parseFloat(document.getElementById('fs_min').value) || 0,
            due_date:             new Date(document.getElementById('fs_due').value).toISOString(),
            payment_status:       document.getElementById('fs_status').value
        };

        // Capture checked unbilled IDs before closing modal
        const checkedCbs = Array.from(document.querySelectorAll('.cb-unbilled-item:checked'));
        const checkedIds = checkedCbs.map(cb => cb.getAttribute('data-id'));

        if(window.App) window.App.closeModal();
        if(window.App) window.App.showToast('Saving to Google Sheets...', 'info');

        let stmtId = id;
        if(id) {
            await window.DB.statements.update(id, data);
        } else {
            stmtId = await window.DB.statements.add(data);
        }

        // Close/bill checked unbilled transactions
        if(checkedIds.length > 0 && stmtId) {
            const updates = checkedIds.map(uid => ({
                unbilled_id: parseInt(uid),
                status: 'Billed',
                statement_id: parseInt(stmtId)
            }));
            await window.DB.unbilled.updateBatch(updates);
            if(window.App) window.App.showToast(`Statement saved & ${checkedIds.length} unbilled transactions marked as Billed!`, 'success');
        } else {
            if(window.App) window.App.showToast('Statement saved', 'success');
        }

        this.renderTabContent();
    },

    showPaymentModal: function(preCardId = null, preStmtId = null) {
        const allCards = window.DB.cards.getAll() || [];
        const allStmts = window.DB.statements.getAll() || [];
        
        let stmtOptions = '<option value="">-- Independent Payment --</option>';
        let defaultDue = '';
        if(preCardId) {
            const cardStmts = allStmts.filter(s => String(s.card_id) === String(preCardId) && s.payment_status !== 'Paid');
            cardStmts.forEach(s => {
                const isSelected = String(s.statement_id) === String(preStmtId);
                if (isSelected) defaultDue = s.closing_outstanding;
                stmtOptions += `<option value="${s.statement_id}" data-due="${s.closing_outstanding}" ${isSelected ? 'selected' : ''}>${window.Utils.formatMonthYear(s.statement_month)} (Due: ${window.Utils.formatCurrency(s.closing_outstanding)})</option>`;
            });
        }

        const html = `
            <form onsubmit="event.preventDefault(); window.Payments.savePayment()">
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Select Card</label>
                        <select class="form-select" id="fp_card" required onchange="window.Payments.updateStmtDropdown(this.value)">
                            <option value="">-- Select --</option>
                            ${allCards.map(c => `<option value="${c.card_id}" ${String(c.card_id) === String(preCardId) ? 'selected' : ''}>${c.cardholder_name} (*${c.card_last4})</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Select Statement (Optional)</label>
                        <select class="form-select" id="fp_stmt" onchange="window.Payments.onStmtSelect(this)">
                            ${stmtOptions}
                        </select>
                    </div>
                </div>
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Payment Date</label>
                        <input type="date" class="form-control" id="fp_date" value="${window.Utils.formatDateInput(new Date())}" required>
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Amount Paid</label>
                        <input type="number" step="0.01" class="form-control" id="fp_amount" value="${defaultDue !== '' ? defaultDue : ''}" required>
                    </div>
                </div>
                <div class="row form-row mb-3">
                    <div class="col-md-6 form-group">
                        <label class="form-label">Payment Mode</label>
                        <select class="form-select" id="fp_mode" required>
                            <option value="NEFT">NEFT</option>
                            <option value="RTGS">RTGS</option>
                            <option value="UPI">UPI</option>
                            <option value="Cheque">Cheque</option>
                            <option value="Auto-Debit">Auto-Debit</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="col-md-6 form-group">
                        <label class="form-label">Reference No. (UTR/Chq)</label>
                        <input type="text" class="form-control" id="fp_ref">
                    </div>
                </div>
                <div class="text-end mt-4">
                    <button type="button" class="btn btn-secondary" onclick="window.App.closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-success">Record Payment</button>
                </div>
            </form>
        `;
        if(window.App && window.App.showModal) window.App.showModal("Record Payment", html);
        setTimeout(() => { window.Utils.makeSearchable('fp_card'); }, 50);
    },

    onStmtSelect: function(selectEl) {
        const selected = selectEl.options[selectEl.selectedIndex];
        const due = selected ? selected.getAttribute('data-due') : null;
        const amtInput = document.getElementById('fp_amount');
        if (due && amtInput) {
            amtInput.value = parseFloat(due) || '';
        }
    },

    updateStmtDropdown: function(cardId) {
        const stmtSelect = document.getElementById('fp_stmt');
        if(!stmtSelect) return;
        const allStmts = window.DB.statements.getAll() || [];
        const cardStmts = allStmts.filter(s => String(s.card_id) === String(cardId) && s.payment_status !== 'Paid');
        
        let html = '<option value="">-- Independent Payment --</option>';
        cardStmts.forEach(s => {
            html += `<option value="${s.statement_id}" data-due="${s.closing_outstanding}">${window.Utils.formatMonthYear(s.statement_month)} (Due: ${window.Utils.formatCurrency(s.closing_outstanding)})</option>`;
        });
        stmtSelect.innerHTML = html;
    },

    savePayment: async function() {
        const data = {
            card_id:       document.getElementById('fp_card').value,
            statement_id:  document.getElementById('fp_stmt').value || null,
            payment_date:  new Date(document.getElementById('fp_date').value).toISOString(),
            amount:        parseFloat(document.getElementById('fp_amount').value),
            payment_mode:  document.getElementById('fp_mode').value,
            reference_no:  document.getElementById('fp_ref').value,
            status:        'Completed'
        };

        if(window.App) window.App.closeModal();
        if(window.App) window.App.showToast('Recording payment...', 'info');

        await window.DB.payments.add(data);

        if(window.App) window.App.showToast('Payment recorded successfully', 'success');
        this.renderTabContent();
    }
};

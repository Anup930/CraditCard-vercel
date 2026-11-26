window.Transactions = {
    currentPage: 1,
    pageSize: 15,
    viewMode: localStorage.getItem('ccms_txn_view') || 'table',
    filters: {
        dateFrom: '',
        dateTo: '',
        cardId: '',
        type: '',
        search: ''
    },

    setViewMode: function(mode) {
        this.viewMode = mode === 'cards' ? 'cards' : 'table';
        localStorage.setItem('ccms_txn_view', this.viewMode);
        document.querySelectorAll('.txn-view-btn').forEach(btn => {
            const active = btn.dataset.view === this.viewMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        this.renderData();
    },

    clearFilters: function() {
        this.filters = { dateFrom: '', dateTo: '', cardId: '', type: '', search: '' };
        this.currentPage = 1;
        this.render(this.container);
    },

    render: function(container) {
        this.container = container;
        this.container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'page-header d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4';
        header.innerHTML = `
            <div>
                <h2 class="page-title">Transactions Ledger</h2>
                <div class="page-subtitle text-muted" id="txn-count">Loading transactions...</div>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <div class="view-switcher" role="group" aria-label="Transactions view mode">
                    <button type="button" class="view-switch-btn txn-view-btn ${this.viewMode === 'table' ? 'active' : ''}" data-view="table" aria-pressed="${this.viewMode === 'table'}" onclick="window.Transactions.setViewMode('table')">
                        <i class="fas fa-table"></i> <span>Table View</span>
                    </button>
                    <button type="button" class="view-switch-btn txn-view-btn ${this.viewMode === 'cards' ? 'active' : ''}" data-view="cards" aria-pressed="${this.viewMode === 'cards'}" onclick="window.Transactions.setViewMode('cards')">
                        <i class="fas fa-th-large"></i> <span>Card View</span>
                    </button>
                </div>
                <button class="btn btn-outline" onclick="window.DataImport.openModal('transactions')" style="background:#eef2ff;color:#4361ee;border-color:#c7d2fe;border-radius:8px;font-weight:600;">
                    <i class="fas fa-file-import"></i> Import
                </button>
                <button class="btn btn-primary" onclick="window.Transactions.exportExcel()" style="border-radius:8px;font-weight:600;">
                    <i class="fas fa-file-excel"></i> Export to Excel
                </button>
            </div>
        `;

        const filterBar = document.createElement('div');
        filterBar.className = 'filter-bar card mb-4 p-3';
        
        const allCards = window.DB.cards.getAll() || [];
        
        filterBar.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">From Date</label>
                <input type="date" class="form-control" id="txnDateFrom" value="${this.filters.dateFrom}" onchange="window.Transactions.applyFilters()">
            </div>
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">To Date</label>
                <input type="date" class="form-control" id="txnDateTo" value="${this.filters.dateTo}" onchange="window.Transactions.applyFilters()">
            </div>
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">Card</label>
                <select class="form-select" id="txnCard" onchange="window.Transactions.applyFilters()" style="min-width: 200px;">
                    <option value="">All Cards</option>
                    ${allCards.map(c => `<option value="${c.card_id}" ${this.filters.cardId === c.card_id ? 'selected' : ''}>${c.cardholder_name} (*${c.card_last4})</option>`).join('')}
                </select>
            </div>
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">Type</label>
                <select class="form-select" id="txnType" onchange="window.Transactions.applyFilters()">
                    <option value="">All Types</option>
                    <option value="Debit" ${this.filters.type === 'Debit' ? 'selected' : ''}>Debit</option>
                    <option value="Credit" ${this.filters.type === 'Credit' ? 'selected' : ''}>Credit</option>
                </select>
            </div>
            <div style="display: flex; flex-direction: column; flex: 1.5; min-width: 250px;">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <label class="form-label small text-muted mb-0">Search / Amount Filter</label>
                    <span class="text-muted" style="font-size: 0.72rem;">Supports: &gt;10000, &lt;5000, 5000-20000, &lt;&gt;10000</span>
                </div>
                <input type="text" class="form-control" id="txnSearch" placeholder="Search description, or &gt;10000, &lt;5000, &lt;&gt;10000..." value="${this.filters.search}" oninput="window.Transactions.applyFilters()" style="width: 100%;">
            </div>
        `;

        this.summaryWrapper = document.createElement('div');
        this.summaryWrapper.className = 'stats-row mb-4';

        this.tableWrapper = document.createElement('div');
        this.tableWrapper.className = 'data-table-wrapper card';

        this.container.appendChild(header);
        this.container.appendChild(filterBar);
        this.container.appendChild(this.summaryWrapper);
        this.container.appendChild(this.tableWrapper);

        this.renderData();
        // Make the Card filter searchable
        setTimeout(() => { window.Utils.makeSearchable('txnCard'); }, 50);
    },

    applyFilters: function() {
        this.filters.dateFrom = document.getElementById('txnDateFrom').value;
        this.filters.dateTo = document.getElementById('txnDateTo').value;
        this.filters.cardId = document.getElementById('txnCard').value;
        this.filters.type = document.getElementById('txnType').value;
        this.filters.search = document.getElementById('txnSearch').value.trim();
        this.currentPage = 1;
        this.renderData();
    },

    getFilteredData: function() {
        let txns = window.DB.transactions.getAll() || [];
        
        if (this.filters.dateFrom) {
            const fDate = new Date(this.filters.dateFrom);
            txns = txns.filter(t => new Date(t.txn_date) >= fDate);
        }
        if (this.filters.dateTo) {
            const tDate = new Date(this.filters.dateTo);
            tDate.setHours(23,59,59);
            txns = txns.filter(t => new Date(t.txn_date) <= tDate);
        }
        if (this.filters.cardId) txns = txns.filter(t => String(t.card_id) === String(this.filters.cardId));
        if (this.filters.type) txns = txns.filter(t => t.txn_type === this.filters.type);
        if (this.filters.search) txns = txns.filter(t => 
            window.Utils.matchSearchOrAmount(t, this.filters.search)
        );

        // Sort descending by date
        txns.sort((a,b) => new Date(b.txn_date) - new Date(a.txn_date));
        return txns;
    },

    renderData: function() {
        const txns = this.getFilteredData();
        const countEl = document.getElementById('txn-count');
        if(countEl) countEl.innerText = `${txns.length} transactions found`;

        // Calculate Summary
        let totalDebits = 0;
        let totalCredits = 0;
        let debitCount = 0;
        let creditCount = 0;
        txns.forEach(t => {
            if(t.txn_type === 'Debit') { totalDebits += t.amount; debitCount++; }
            else if(t.txn_type === 'Credit') { totalCredits += t.amount; creditCount++; }
        });
        const net = totalCredits - totalDebits;

        this.summaryWrapper.className = 'txn-kpi-grid mb-4';
        this.summaryWrapper.innerHTML = `
            <div class="txn-kpi-card kpi-debit">
                <div class="txn-kpi-top">
                    <span class="txn-kpi-lbl">Total Debits</span>
                    <span class="txn-kpi-icon"><i class="fas fa-arrow-up"></i></span>
                </div>
                <div class="txn-kpi-val">${window.Utils.formatCurrency(totalDebits)}</div>
                <div class="txn-kpi-sub">${debitCount.toLocaleString('en-IN')} debit entries</div>
            </div>
            <div class="txn-kpi-card kpi-credit">
                <div class="txn-kpi-top">
                    <span class="txn-kpi-lbl">Total Credits</span>
                    <span class="txn-kpi-icon"><i class="fas fa-arrow-down"></i></span>
                </div>
                <div class="txn-kpi-val">${window.Utils.formatCurrency(totalCredits)}</div>
                <div class="txn-kpi-sub">${creditCount.toLocaleString('en-IN')} credit entries</div>
            </div>
            <div class="txn-kpi-card ${net >= 0 ? 'kpi-net-cr' : 'kpi-net-dr'}">
                <div class="txn-kpi-top">
                    <span class="txn-kpi-lbl">Net Position</span>
                    <span class="txn-kpi-icon"><i class="fas fa-balance-scale"></i></span>
                </div>
                <div class="txn-kpi-val">${window.Utils.formatCurrency(Math.abs(net))} <span class="txn-net-tag">${net < 0 ? 'Dr' : 'Cr'}</span></div>
                <div class="txn-kpi-sub">${txns.length.toLocaleString('en-IN')} filtered transactions</div>
            </div>
        `;

        const pageSize = this.pageSize || 15;
        const pageData = window.Utils.paginate(txns.length, this.currentPage, pageSize);
        const currentData = txns.slice(pageData.start, pageData.end);

        const allCards = window.DB.cards.getAll() || [];
        const getCardInfo = (id) => {
            const c = allCards.find(card => card.card_id === id);
            return c ? `${c.cardholder_name} (*${c.card_last4})` : 'Unmapped';
        };
        const esc = window.Utils.escapeHtml;

        let html = '';

        if (this.viewMode === 'cards') {
            if (currentData.length === 0) {
                html = `<div class="empty-state py-5"><i class="fas fa-exchange-alt mb-2" style="font-size:2.5rem;opacity:0.35;"></i><h4>No transactions match filters</h4></div>`;
            } else {
                html = `<div class="txn-cards-grid">`;
                currentData.forEach((t, i) => {
                    const isCredit = t.txn_type === 'Credit';
                    const stmtLabel = t.statement_month ? window.Utils.formatMonthYear(t.statement_month) : window.Utils.formatMonthYear(t.txn_date);
                    html += `
                        <article class="txn-receipt-card ${isCredit ? 'is-credit' : 'is-debit'}" style="animation-delay:${Math.min(i * 25, 240)}ms;">
                            <div class="txn-rc-top">
                                <span class="vivid-pill ${isCredit ? 'pill-status-active' : 'pill-status-blocked'}">
                                    <span class="pill-dot"></span>${esc(t.txn_type || 'Debit')}
                                </span>
                                <span class="txn-rc-date"><i class="far fa-calendar-alt"></i> ${window.Utils.formatDate(t.txn_date)}</span>
                            </div>

                            <div class="txn-rc-amount ${isCredit ? 'amt-cr' : 'amt-dr'}">
                                ${isCredit ? '+' : '−'}${window.Utils.formatCurrency(t.amount)}
                            </div>

                            <div class="txn-rc-desc" title="${esc(t.description || '')}">
                                ${esc(t.description || 'No description')}
                            </div>

                            <div class="txn-rc-tags">
                                <span class="ledger-pill"><i class="fas fa-book" style="margin-right:4px;"></i>${esc(t.zoho_ledger || 'Unmapped')}</span>
                                <span class="vivid-pill pill-cat-addon"><i class="fas fa-calendar-check"></i> ${esc(stmtLabel)}</span>
                            </div>

                            <div class="txn-rc-footer">
                                <div class="txn-rc-card">
                                    <i class="fas fa-credit-card"></i>
                                    <span>${esc(getCardInfo(t.card_id))}</span>
                                </div>
                                <button type="button" class="act-btn act-view" title="View Receipt" onclick="window.Transactions.viewTxn('${esc(t.txn_id)}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </article>
                    `;
                });
                html += `</div>`;
            }
        } else {
            html = `
                <div class="master-table-scroll" tabindex="0" role="region" aria-label="Transactions Table">
                <table class="data-table master-colorful-table table w-100 mb-0">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Stmt Month</th>
                            <th>Ledger</th>
                            <th>Description</th>
                            <th>Type</th>
                            <th class="text-end">Amount</th>
                            <th>Category</th>
                            <th>Card</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if(currentData.length === 0) {
                html += `<tr><td colspan="10" class="text-center py-4 empty-state">No transactions match filters.</td></tr>`;
            } else {
                currentData.forEach(t => {
                    const isCredit = t.txn_type === 'Credit';
                    const accent = isCredit ? '#10b981' : '#f43f5e';
                    let stmtMonthBadge = '';
                    if (t.statement_month) {
                        const icon = t._statement_month_auto ? 'fa-calculator' : 'fa-calendar-check';
                        const title = t._statement_month_auto ? 'Auto-calculated from card statement cycle' : 'Explicit from Statement Month column';
                        stmtMonthBadge = `<span class="vivid-pill pill-cat-addon" title="${title}"><i class="fas ${icon}"></i>${window.Utils.formatMonthYear(t.statement_month)}</span>`;
                    } else {
                        stmtMonthBadge = `<span class="vivid-pill pill-status-inactive" title="Derived from Txn Date">${window.Utils.formatMonthYear(t.txn_date)}</span>`;
                    }

                    html += `
                        <tr class="${isCredit ? 'row-primary' : 'row-addon'}" style="--row-accent: ${accent};">
                            <td data-label="Date"><span class="sr-pill" style="white-space:nowrap;">${window.Utils.formatDate(t.txn_date)}</span></td>
                            <td data-label="Stmt Month">${stmtMonthBadge}</td>
                            <td data-label="Ledger"><span class="ledger-pill">${esc(t.zoho_ledger || '')}</span></td>
                            <td data-label="Description" title="${esc(t.description || '')}">${esc(window.Utils.truncate(t.description || '', 40))}</td>
                            <td data-label="Type"><span class="vivid-pill ${isCredit ? 'pill-status-active' : 'pill-status-blocked'}"><span class="pill-dot"></span>${esc(t.txn_type || 'Debit')}</span></td>
                            <td data-label="Amount" class="text-end"><span class="txn-amt-pill ${isCredit ? 'amt-cr' : 'amt-dr'}">${window.Utils.formatCurrency(t.amount)}</span></td>
                            <td data-label="Category"><span class="vivid-pill pill-status-inactive">${esc(t.category || 'Uncategorized')}</span></td>
                            <td data-label="Card"><span class="owner-text">${esc(getCardInfo(t.card_id))}</span></td>
                            <td data-label="Status"><span class="vivid-pill pill-status-active"><span class="pill-dot"></span>${esc(t.status || 'Imported')}</span></td>
                            <td data-label="Action">
                                <button class="act-btn act-view" title="View Receipt" onclick="window.Transactions.viewTxn('${esc(t.txn_id)}')"><i class="fas fa-eye"></i></button>
                            </td>
                        </tr>
                    `;
                });
            }

            html += `</tbody></table></div>`;
        }

        html += `
        <div class="card-footer d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div class="pagination-info d-flex align-items-center gap-3">
                <span class="text-muted" style="font-size: 0.9rem;">Showing ${txns.length === 0 ? 0 : pageData.start + 1} to ${pageData.end} of ${txns.length} entries</span>
                <div class="d-flex align-items-center gap-2">
                    <span class="text-muted small" style="font-size: 0.85rem;">Rows:</span>
                    <select class="form-select form-select-sm" style="width: auto; cursor: pointer;" onchange="window.Transactions.changePageSize(this.value)">
                        <option value="15" ${pageSize == 15 ? 'selected' : ''}>15</option>
                        <option value="30" ${pageSize == 30 ? 'selected' : ''}>30</option>
                        <option value="50" ${pageSize == 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${pageSize == 100 ? 'selected' : ''}>100</option>
                        <option value="200" ${pageSize == 200 ? 'selected' : ''}>200</option>
                    </select>
                </div>
            </div>`;

        if (pageData.totalPages > 1) {
            html += `
            <ul class="pagination mb-0">
                <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.Transactions.goToPage(${this.currentPage - 1})">Prev</a>
                </li>
                <li class="page-item disabled"><a class="page-link" href="#">Page ${this.currentPage} of ${pageData.totalPages}</a></li>
                <li class="page-item ${this.currentPage === pageData.totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.Transactions.goToPage(${this.currentPage + 1})">Next</a>
                </li>
            </ul>`;
        }

        html += `</div>`;

        this.tableWrapper.innerHTML = html;
    },

    goToPage: function(page) {
        this.currentPage = page;
        this.renderData();
    },

    changePageSize: function(size) {
        this.pageSize = parseInt(size) || 15;
        this.currentPage = 1;
        this.renderData();
    },

    viewTxn: function(id) {
        const txns = window.DB.transactions.getAll() || [];
        const txn = txns.find(t => String(t.txn_id) === String(id));
        if(!txn) return;

        const esc = window.Utils.escapeHtml;
        const allCards = window.DB.cards.getAll() || [];
        const card = allCards.find(c => c.card_id === txn.card_id);
        const cardStr = card ? `${card.cardholder_name} — ${card.bank_name} (*${card.card_last4})` : 'Unmapped';
        const isCredit = txn.txn_type === 'Credit';
        const stmtLabel = txn.statement_month ? window.Utils.formatMonthYear(txn.statement_month) : `Auto (${window.Utils.formatMonthYear(txn.txn_date)})`;

        const html = `
            <div class="vc-modal-wrap">
                <div class="txn-modal-hero ${isCredit ? 'is-credit' : 'is-debit'}">
                    <div class="cc-card-top">
                        <span class="vivid-pill ${isCredit ? 'pill-status-active' : 'pill-status-blocked'}">
                            <span class="pill-dot"></span>${esc(txn.txn_type || 'Debit')}
                        </span>
                        <span class="cc-cat-tag">TXN #${esc(String(txn.txn_id || ''))}</span>
                    </div>
                    <div class="txn-hero-amt">${isCredit ? '+' : '−'}${window.Utils.formatCurrency(txn.amount)}</div>
                    <div class="txn-hero-meta">
                        <span><i class="far fa-calendar-alt"></i> ${window.Utils.formatDate(txn.txn_date)}</span>
                        <span>&bull;</span>
                        <span><i class="fas fa-calendar-check"></i> ${esc(stmtLabel)}</span>
                    </div>
                </div>

                <div class="vc-bento-grid">
                    <div class="vc-bento-box">
                        <div class="vc-bento-title"><i class="fas fa-credit-card"></i> Card &amp; Ledger</div>
                        <div class="vc-detail-list">
                            <div class="vc-detail-row">
                                <span>Zoho Ledger</span>
                                <strong class="vc-ledger-chip">${esc(txn.zoho_ledger || 'Unmapped')}</strong>
                            </div>
                            <div class="vc-detail-row">
                                <span>Mapped Card</span>
                                <strong>${esc(cardStr)}</strong>
                            </div>
                            <div class="vc-detail-row">
                                <span>Category</span>
                                <strong>${esc(txn.category || 'Uncategorized')}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="vc-bento-box">
                        <div class="vc-bento-title"><i class="fas fa-info-circle"></i> Audit &amp; Batch</div>
                        <div class="vc-detail-list">
                            <div class="vc-detail-row">
                                <span>Import Batch</span>
                                <strong>${esc(txn.import_batch_id || 'Manual / Direct')}</strong>
                            </div>
                            <div class="vc-detail-row">
                                <span>Status</span>
                                <strong>${esc(txn.status || 'Imported')}</strong>
                            </div>
                            <div class="vc-detail-row vc-detail-col">
                                <span>Description / Narration</span>
                                <div class="vc-addr-box">${esc(txn.description || 'No description recorded')}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="vc-modal-footer" style="justify-content: flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="window.App?.closeModal();" style="border-radius: 10px;">
                        Close
                    </button>
                </div>
            </div>
        `;
        if(window.App && window.App.showModal) window.App.showModal("Transaction Receipt", html);
    },

    exportExcel: function() {
        if(!window.XLSX) return alert("XLSX library not loaded");
        
        const txns = this.getFilteredData();
        const allCards = window.DB.cards.getAll() || [];
        const exportData = txns.map(t => {
            const card = allCards.find(c => c.card_id === t.card_id);
            return {
                Date: window.Utils.formatDate(t.txn_date),
                'Statement Month': t.statement_month ? window.Utils.formatMonthYear(t.statement_month) : window.Utils.formatMonthYear(t.txn_date),
                Cardholder: card ? card.cardholder_name : 'Unmapped',
                Bank: card ? card.bank_name : '',
                'Card Last4': card ? card.card_last4 : '',
                Ledger: t.zoho_ledger,
                Description: t.description,
                Type: t.txn_type,
                Amount: t.amount,
                Category: t.category,
                Status: t.status
            };
        });

        const ws = window.XLSX.utils.json_to_sheet(exportData);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        window.XLSX.writeFile(wb, "Transactions_Export.xlsx");
    }
};

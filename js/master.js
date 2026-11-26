window.Master = {
    currentPage: 1,
    pageSize: 10,
    viewMode: localStorage.getItem('ccms_master_view') || 'table',
    currentFilter: '',
    currentBankFilter: '',
    currentCategoryFilter: '',
    currentOwnerFilter: '',
    currentStatusFilter: '',

    _getBankTheme: function(bankName, cardType) {
        const b = `${bankName || ''} ${cardType || ''}`.toUpperCase();
        if (b.includes('HDFC'))   return { key: 'hdfc',  grad: 'linear-gradient(135deg, #1d4ed8 0%, #4338ca 52%, #7c3aed 100%)', glow: 'rgba(67, 56, 202, 0.52)', pillBg: '#dbeafe', pillText: '#1e40af', accent: '#3b82f6' };
        if (b.includes('ICICI'))  return { key: 'icici', grad: 'linear-gradient(135deg, #059669 0%, #0d9488 52%, #06b6d4 100%)', glow: 'rgba(13, 148, 136, 0.5)', pillBg: '#ffedd5', pillText: '#c2410c', accent: '#f97316' };
        if (b.includes('AMEX'))   return { key: 'amex',  grad: 'linear-gradient(135deg, #0284c7 0%, #2563eb 52%, #6366f1 100%)', glow: 'rgba(37, 99, 235, 0.5)', pillBg: '#e0f2fe', pillText: '#0369a1', accent: '#0ea5e9' };
        if (b.includes('AXIS'))   return { key: 'axis',  grad: 'linear-gradient(135deg, #be185d 0%, #9d174d 50%, #7e22ce 100%)', glow: 'rgba(190, 24, 93, 0.5)', pillBg: '#fce7f3', pillText: '#9d174d', accent: '#db2777' };
        if (b.includes('SBI'))    return { key: 'sbi',   grad: 'linear-gradient(135deg, #0369a1 0%, #1d4ed8 52%, #0891b2 100%)', glow: 'rgba(29, 78, 216, 0.5)', pillBg: '#e0f2fe', pillText: '#075985', accent: '#0284c7' };
        if (b.includes('HSBC'))   return { key: 'hsbc',  grad: 'linear-gradient(135deg, #b91c1c 0%, #e11d48 52%, #be185d 100%)', glow: 'rgba(225, 29, 72, 0.5)', pillBg: '#fee2e2', pillText: '#b91c1c', accent: '#ef4444' };
        if (b.includes('IDFC'))   return { key: 'idfc',  grad: 'linear-gradient(135deg, #6d28d9 0%, #a21caf 52%, #e11d48 100%)', glow: 'rgba(162, 28, 175, 0.5)', pillBg: '#f3e8ff', pillText: '#7e22ce', accent: '#a855f7' };
        if (b.includes('KOTAK'))  return { key: 'kotak', grad: 'linear-gradient(135deg, #dc2626 0%, #ea580c 52%, #b91c1c 100%)', glow: 'rgba(234, 88, 12, 0.5)', pillBg: '#fee2e2', pillText: '#991b1b', accent: '#dc2626' };
        return { key: 'default', grad: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 52%, #ec4899 100%)', glow: 'rgba(124, 58, 237, 0.5)', pillBg: '#eef2ff', pillText: '#4338ca', accent: '#6366f1' };
    },

    _getInitials: function(name) {
        const parts = String(name || 'CC').trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return String(name || 'CC').substring(0, 2).toUpperCase();
    },

    setViewMode: function(mode) {
        this.viewMode = mode === 'cards' ? 'cards' : 'table';
        localStorage.setItem('ccms_master_view', this.viewMode);
        document.querySelectorAll('.view-switch-btn').forEach(btn => {
            const active = btn.dataset.view === this.viewMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        this.renderTable();
    },

    render: function(container) {
        this.container = container;
        this.container.innerHTML = '';
        
        // Page Header
        const header = document.createElement('div');
        header.className = 'page-header d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4';
        header.innerHTML = `
            <div>
                <h2 class="page-title">Master Card List</h2>
                <div class="page-subtitle text-muted">Manage all credit cards in the system</div>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <div class="view-switcher" role="group" aria-label="View mode">
                    <button type="button" class="view-switch-btn ${this.viewMode === 'table' ? 'active' : ''}" data-view="table" aria-pressed="${this.viewMode === 'table'}" onclick="window.Master.setViewMode('table')">
                        <i class="fas fa-table"></i> <span>Table View</span>
                    </button>
                    <button type="button" class="view-switch-btn ${this.viewMode === 'cards' ? 'active' : ''}" data-view="cards" aria-pressed="${this.viewMode === 'cards'}" onclick="window.Master.setViewMode('cards')">
                        <i class="fas fa-th-large"></i> <span>Card View</span>
                    </button>
                </div>
                <input type="file" id="card-master-file-input" accept=".xlsx,.xls,.csv" style="display:none;" onchange="window.Master.handleImportFile(event)">
                <button class="btn btn-outline" onclick="window.Master.downloadSampleTemplate()" title="Download sample Excel template for importing cards" style="background:#ffffff;border-radius:8px;font-weight:600;">
                    <i class="fas fa-file-download text-success"></i> Template
                </button>
                <button class="btn btn-outline" onclick="window.Master.triggerImportCards()" title="Import cards from Excel or CSV" style="background:#eef2ff;color:#4361ee;border-color:#c7d2fe;border-radius:8px;font-weight:600;">
                    <i class="fas fa-file-import"></i> Import Cards
                </button>
                <button class="btn btn-primary" onclick="window.Master.showAddModal()" style="border-radius:8px;font-weight:600;">
                    <i class="fas fa-plus"></i> Add New Card
                </button>
            </div>
        `;

        // Filter Bar
        const filterBar = document.createElement('div');
        filterBar.className = 'filter-bar card mb-4 p-3';
        
        const banks = window.DB.cards.getBanks();
        const owners = window.DB.cards.getOwners();
        
        filterBar.innerHTML = `
            <div style="display: flex; flex-direction: column; flex: 1; min-width: 200px;">
                <label class="form-label small text-muted mb-1">Search Cards</label>
                <input type="text" class="form-control" id="masterSearch" placeholder="Search by name, number, ledger..." value="${this.currentFilter}" oninput="window.Master.search(this.value)" style="width: 100%;">
            </div>
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">Bank</label>
                <select class="form-select" id="masterBankFilter" onchange="window.Master.filterTable()">
                    <option value="">All Banks</option>
                    ${banks.map(b => `<option value="${b}" ${this.currentBankFilter === b ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
            </div>
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">Category</label>
                <select class="form-select" id="masterCatFilter" onchange="window.Master.filterTable()">
                    <option value="">All Categories</option>
                    <option value="Primary" ${this.currentCategoryFilter === 'Primary' ? 'selected' : ''}>Primary</option>
                    <option value="Add-on" ${this.currentCategoryFilter === 'Add-on' ? 'selected' : ''}>Add-on</option>
                </select>
            </div>
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">Primary Owner</label>
                <select class="form-select" id="masterOwnerFilter" onchange="window.Master.filterTable()" style="min-width: 180px;">
                    <option value="">All Owners</option>
                    ${owners.map(o => `<option value="${o}" ${this.currentOwnerFilter === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
            </div>
            <div style="display: flex; flex-direction: column;">
                <label class="form-label small text-muted mb-1">Status</label>
                <select class="form-select" id="masterStatusFilter" onchange="window.Master.filterTable()">
                    <option value="">All Statuses</option>
                    <option value="Active" ${this.currentStatusFilter === 'Active' ? 'selected' : ''}>Active</option>
                    <option value="Inactive" ${this.currentStatusFilter === 'Inactive' ? 'selected' : ''}>Inactive</option>
                    <option value="Blocked" ${this.currentStatusFilter === 'Blocked' ? 'selected' : ''}>Blocked</option>
                </select>
            </div>
        `;

        // Table Wrapper
        this.tableWrapper = document.createElement('div');
        this.tableWrapper.className = 'data-table-wrapper card';
        
        this.container.appendChild(header);
        this.container.appendChild(filterBar);
        this.container.appendChild(this.tableWrapper);

        this.renderTable();
        // Make owner filter searchable
        setTimeout(() => { window.Utils.makeSearchable('masterOwnerFilter'); }, 50);
    },

    search: function(query) {
        this.currentFilter = query.toLowerCase();
        this.currentPage = 1;
        this.renderTable();
    },

    filterTable: function() {
        this.currentBankFilter = document.getElementById('masterBankFilter').value;
        this.currentCategoryFilter = document.getElementById('masterCatFilter').value;
        this.currentOwnerFilter = document.getElementById('masterOwnerFilter').value;
        this.currentStatusFilter = document.getElementById('masterStatusFilter').value;
        this.currentPage = 1;
        this.renderTable();
    },

    renderTable: function() {
        let cards = window.DB.cards.getAll() || [];
        
        // Apply Filters
        if(this.currentFilter) {
            cards = cards.filter(c => 
                String(c.cardholder_name || '').toLowerCase().includes(this.currentFilter) ||
                String(c.card_number || '').toLowerCase().includes(this.currentFilter) ||
                String(c.zoho_ledger_name || '').toLowerCase().includes(this.currentFilter)
            );
        }
        if(this.currentBankFilter) cards = cards.filter(c => c.bank_name === this.currentBankFilter);
        if(this.currentCategoryFilter) cards = cards.filter(c => c.card_category === this.currentCategoryFilter);
        if(this.currentOwnerFilter) cards = cards.filter(c => c.primary_cardholder === this.currentOwnerFilter);
        if(this.currentStatusFilter) cards = cards.filter(c => c.status === this.currentStatusFilter);

        const pageSize = this.pageSize;
        const pageData = window.Utils.paginate(cards.length, this.currentPage, pageSize);
        const currentCards = cards.slice(pageData.start, pageData.end);

        let html = '';

        if (this.viewMode === 'cards') {
            if (currentCards.length === 0) {
                html = `<div class="empty-state py-5"><i class="fas fa-credit-card mb-2" style="font-size:2.5rem;opacity:0.35;"></i><h4>No cards found</h4><p class="text-muted">Try adjusting your search or filter criteria.</p></div>`;
            } else {
                html = `<div class="master-cards-grid">`;
                currentCards.forEach((c, i) => {
                    const theme = this._getBankTheme(c.bank_name, c.card_type);
                    const isPrimary = c.card_category === 'Primary';
                    const statusCls = c.status === 'Active' ? 'status-active' : (c.status === 'Blocked' ? 'status-blocked' : 'status-inactive');
                    const limitVal = window.Utils.parseNum(c.credit_limit || 0);
                    const limitText = limitVal > 0 ? window.Utils.formatCurrency(limitVal) : 'Shared / Unset';

                    html += `
                        <article class="cc-visual-card ${isPrimary ? 'is-primary-card' : 'is-addon-card'}" style="background: ${theme.grad}; --card-glow: ${theme.glow}; animation-delay: ${Math.min(i * 35, 280)}ms;">
                            <div class="cc-card-sheen" aria-hidden="true"></div>
                            <div class="cc-card-top">
                                <div class="cc-chip-wrap">
                                    <div class="cc-emv-chip"></div>
                                    <span class="cc-cat-tag ${isPrimary ? 'is-primary' : 'is-addon'}">
                                        <i class="fas ${isPrimary ? 'fa-crown' : 'fa-code-branch'}"></i>
                                        ${window.Utils.escapeHtml(c.card_category || 'Card')}
                                    </span>
                                </div>
                                <span class="cc-status-pill ${statusCls}">
                                    <span class="cc-status-dot"></span>${window.Utils.escapeHtml(c.status || 'Active')}
                                </span>
                            </div>

                            <div class="cc-bank-row">
                                <span class="cc-bank-name">${window.Utils.escapeHtml(c.bank_name || 'Bank')}</span>
                                <span class="cc-card-type">${window.Utils.escapeHtml(c.card_type || '')}</span>
                            </div>

                            <div class="cc-card-num">${window.Utils.maskCardNumber(c.card_number || '')}</div>

                            <div class="cc-holder-row">
                                <div>
                                    <div class="cc-meta-label">CARDHOLDER</div>
                                    <a href="#" class="cc-holder-link" onclick="window.Master.viewCardLedger('${c.card_id}'); return false;">
                                        ${window.Utils.escapeHtml(c.cardholder_name || '')}
                                    </a>
                                </div>
                                <div style="text-align:right;">
                                    <div class="cc-meta-label">PRIMARY OWNER</div>
                                    <div class="cc-owner-name">${window.Utils.escapeHtml(c.primary_cardholder || '')}</div>
                                </div>
                            </div>

                            <div class="cc-card-footer">
                                <div class="cc-ledger-meta">
                                    <span class="cc-ledger-tag" title="Zoho Ledger"><i class="fas fa-book"></i> ${window.Utils.escapeHtml(c.zoho_ledger_name || 'Unmapped')}</span>
                                    <span class="cc-limit-tag">Limit: ${limitText}</span>
                                </div>
                                <div class="cc-card-actions">
                                    <button type="button" class="cc-act-btn" title="View Details" onclick="window.Master.viewCard('${c.card_id}')"><i class="fas fa-eye"></i></button>
                                    <button type="button" class="cc-act-btn" title="Edit Card" onclick="window.Master.editCard('${c.card_id}')"><i class="fas fa-edit"></i></button>
                                    <button type="button" class="cc-act-btn cc-act-del" title="Delete Card" onclick="window.Master.deleteCard('${c.card_id}')"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </article>
                    `;
                });
                html += `</div>`;
            }
        } else {
            html = `
                <div class="master-table-scroll" tabindex="0" role="region" aria-label="Master Card List Table">
                <table class="data-table master-colorful-table table w-100 mb-0">
                    <thead>
                        <tr>
                            <th>Sr.No</th>
                            <th>Cardholder Name</th>
                            <th>Category</th>
                            <th>Primary Owner</th>
                            <th>Bank</th>
                            <th>Card Type</th>
                            <th>Card Number</th>
                            <th>Zoho Ledger</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if(currentCards.length === 0) {
                html += `<tr><td colspan="10" class="text-center py-4 empty-state">No cards found.</td></tr>`;
            } else {
                currentCards.forEach((c, i) => {
                    const srNo = pageData.start + i + 1;
                    const theme = this._getBankTheme(c.bank_name, c.card_type);
                    const initials = this._getInitials(c.cardholder_name);
                    const isPrimary = c.card_category === 'Primary';
                    const rowClass = isPrimary ? 'row-primary' : 'row-addon';
                    const catPillClass = isPrimary ? 'pill-cat-primary' : 'pill-cat-addon';
                    
                    let statusPillClass = 'pill-status-inactive';
                    if(c.status === 'Active') statusPillClass = 'pill-status-active';
                    else if(c.status === 'Blocked') statusPillClass = 'pill-status-blocked';

                    html += `
                        <tr class="${rowClass}" style="--row-accent: ${theme.accent};">
                            <td data-label="Sr.No"><span class="sr-pill">${srNo}</span></td>
                            <td data-label="Cardholder">
                                <a href="#" class="holder-cell-link" onclick="window.Master.viewCardLedger('${c.card_id}'); return false;">
                                    <span class="holder-avatar" style="background: ${theme.grad};">${initials}</span>
                                    <span class="holder-name-text">${window.Utils.escapeHtml(c.cardholder_name || '')}</span>
                                </a>
                            </td>
                            <td data-label="Category"><span class="vivid-pill ${catPillClass}">${window.Utils.escapeHtml(c.card_category || 'N/A')}</span></td>
                            <td data-label="Primary Owner"><span class="owner-text">${window.Utils.escapeHtml(c.primary_cardholder || '')}</span></td>
                            <td data-label="Bank"><span class="vivid-pill bank-pill" style="background: ${theme.pillBg}; color: ${theme.pillText}; border-color: ${theme.accent}33;">${window.Utils.escapeHtml(c.bank_name || '')}</span></td>
                            <td data-label="Card Type"><span class="card-type-text">${window.Utils.escapeHtml(c.card_type || '')}</span></td>
                            <td data-label="Card Number"><span class="card-num-pill">${window.Utils.maskCardNumber(c.card_number || '')}</span></td>
                            <td data-label="Zoho Ledger"><span class="ledger-pill">${window.Utils.escapeHtml(c.zoho_ledger_name || '')}</span></td>
                            <td data-label="Status"><span class="vivid-pill ${statusPillClass}"><span class="pill-dot"></span>${window.Utils.escapeHtml(c.status || 'N/A')}</span></td>
                            <td data-label="Actions">
                                <div class="master-row-actions">
                                    <button class="act-btn act-view" title="View" onclick="window.Master.viewCard('${c.card_id}')"><i class="fas fa-eye"></i></button>
                                    <button class="act-btn act-edit" title="Edit" onclick="window.Master.editCard('${c.card_id}')"><i class="fas fa-edit"></i></button>
                                    <button class="act-btn act-del" title="Delete" onclick="window.Master.deleteCard('${c.card_id}')"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
            }
            
            html += `</tbody></table></div>`;
        }
        
        // Pagination & Rows Per Page Footer
        html += `
        <div class="card-footer d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2">
                <select class="form-select form-select-sm" style="width:auto;" onchange="window.Master.changePageSize(this.value)">
                    <option value="10" ${this.pageSize === 10 ? 'selected' : ''}>10 rows</option>
                    <option value="20" ${this.pageSize === 20 ? 'selected' : ''}>20 rows</option>
                    <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50 rows</option>
                    <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100 rows</option>
                    <option value="200" ${this.pageSize === 200 ? 'selected' : ''}>200 rows</option>
                </select>
                <span class="pagination-info">Showing ${cards.length ? pageData.start + 1 : 0} to ${pageData.end} of ${cards.length} entries</span>
            </div>
            <ul class="pagination mb-0">
                <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.Master.goToPage(${this.currentPage - 1})">Previous</a>
                </li>
                <li class="page-item disabled"><a class="page-link" href="#">Page ${this.currentPage} of ${pageData.totalPages || 1}</a></li>
                <li class="page-item ${this.currentPage === (pageData.totalPages || 1) ? 'disabled' : ''}">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.Master.goToPage(${this.currentPage + 1})">Next</a>
                </li>
            </ul>
        </div>`;

        this.tableWrapper.innerHTML = html;
    },

    goToPage: function(page) {
        this.currentPage = page;
        this.renderTable();
    },

    changePageSize: function(size) {
        this.pageSize = parseInt(size);
        this.currentPage = 1;
        this.renderTable();
    },

    showAddModal: function() {
        this.renderFormModal(null);
    },

    editCard: function(id) {
        const card = window.DB.cards.getById(id);
        if(card) this.renderFormModal(card);
    },

    deleteCard: function(id) {
        if(window.App && window.App.showConfirm) {
            window.App.showConfirm('Delete Card', 'Are you sure you want to delete this card? This cannot be undone.', async () => {
                await window.DB.cards.delete(id);
                this.renderTable();
                if(window.App.showToast) window.App.showToast('Card deleted successfully', 'success');
            });
        } else {
            if(confirm('Are you sure you want to delete this card?')) {
                window.DB.cards.delete(id).then(() => this.renderTable());
            }
        }
    },

    viewCardLedger: function(id) {
        const card = window.DB.cards.getById(id);
        if(!card) return;

        const stmts = [...(window.DB.statements.getByCard(id) || [])].reverse();
        const allPmts = window.DB.payments.getAll() || [];

        let tbody = '';
        stmts.forEach(s => {
            const spmts = allPmts.filter(p => String(p.statement_id) === String(s.statement_id));
            const payDates = spmts.map(p => window.Utils.formatDate(p.payment_date)).join(', ') || '-';
            
            const prePaymentClosing = (s.opening_balance || 0) + (s.billed_amount || 0) + (s.unbilled_amount || 0);
            const totalPay = s.credits_payments || 0;
            const finalOut = s.closing_outstanding || 0;

            tbody += `
                <tr>
                    <td class="text-nowrap">${window.Utils.formatMonthYear(s.statement_month)}</td>
                    <td class="text-right">${window.Utils.formatCurrency(s.opening_balance)}</td>
                    <td class="text-right">${window.Utils.formatCurrency(s.billed_amount)}</td>
                    <td class="text-right">${window.Utils.formatCurrency(s.unbilled_amount)}</td>
                    <td class="text-right fw-bold">${window.Utils.formatCurrency(prePaymentClosing)}</td>
                    <td class="text-right text-success fw-bold">${window.Utils.formatCurrency(totalPay)}</td>
                    <td class="text-nowrap">${window.Utils.formatDate(s.due_date)}</td>
                    <td class="text-nowrap">${payDates}</td>
                    <td class="text-right fw-bold text-danger">${window.Utils.formatCurrency(finalOut)}</td>
                </tr>
            `;
        });

        if (stmts.length === 0) {
            tbody = `<tr><td colspan="9" class="text-center py-4 text-muted">No statements found for this card.</td></tr>`;
        }

        const html = `
            <style>
                #modal { max-width: 96vw !important; width: 96vw !important; margin-top: 2vh; }
                #modal-overlay { backdrop-filter: blur(3px); background-color: rgba(0,0,0,0.4); }
                .ledger-table th { font-weight: 600; background: #f8f9fa; font-size: 0.85rem; padding: 12px 8px; border-bottom: 2px solid #dee2e6; }
                .ledger-table td { font-size: 0.9rem; padding: 10px 8px; vertical-align: middle; border-bottom: 1px solid #e9ecef; }
                .ledger-table { border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden; }
                .ledger-info-item { font-size: 0.95rem; display: inline-block; }
            </style>
            
            <div class="card-ledger-header mb-4 p-3 bg-light rounded border d-flex flex-wrap align-items-center justify-content-center gap-4">
                <span class="ledger-info-item"><span class="text-muted text-uppercase" style="font-size: 0.75rem;">Card:</span> <strong class="text-primary">${card.zoho_ledger_name || card.cardholder_name}</strong></span>
                <span class="ledger-info-item border-start ps-4"><span class="text-muted text-uppercase" style="font-size: 0.75rem;">Card Holder Name:</span> <strong>${card.cardholder_name}</strong></span>
                <span class="ledger-info-item border-start ps-4"><span class="text-muted text-uppercase" style="font-size: 0.75rem;">Total Limit:</span> <strong class="fs-6">${window.Utils.formatCurrency(card.credit_limit)}</strong></span>
                <span class="ledger-info-item border-start ps-4"><span class="text-muted text-uppercase" style="font-size: 0.75rem;">Renewal Date:</span> <strong>${card.renewal_date ? window.Utils.formatDate(card.renewal_date) : '-'}</strong></span>
            </div>
            
            <div class="table-responsive">
                <table class="w-100 ledger-table">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th class="text-right">Opening Balance</th>
                            <th class="text-right">Billed Amount</th>
                            <th class="text-right">Unbilled Amount</th>
                            <th class="text-right">Closing Outstanding</th>
                            <th class="text-right">Total Pay</th>
                            <th>Due Date</th>
                            <th>Pay at</th>
                            <th class="text-right">Final outstanding</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tbody}
                    </tbody>
                </table>
            </div>
            <div class="text-end mt-4 pt-3 border-top">
                <button class="btn btn-secondary" onclick="window.App.closeModal()">Close</button>
            </div>
        `;

        if(window.App && window.App.showModal) window.App.showModal("Card Statement Ledger", html);
    },

    viewCard: function(id) {
        const card = window.DB.cards.getById(id);
        if(!card) return;

        const esc = window.Utils.escapeHtml;
        const theme = this._getBankTheme(card.bank_name, card.card_type);
        const isPrimary = card.card_category === 'Primary';
        const statusCls = card.status === 'Active' ? 'status-active' : (card.status === 'Blocked' ? 'status-blocked' : 'status-inactive');

        const rawNum = String(card.card_number || '').replace(/\s+/g, '');
        const formattedNum = rawNum ? rawNum.replace(/(.{4})/g, '$1 ').trim() : '•••• •••• •••• ••••';
        const maskedNum = window.Utils.maskCardNumber(card.card_number || '');

        const metrics = (window.DB.cards.getCardLimitMetrics && window.DB.cards.getCardLimitMetrics(card.card_id)) || { used: 0, available: 0 };
        const limitVal = window.Utils.parseNum(card.credit_limit || 0);
        const rewardVal = window.Utils.parseNum(card.reward_points || 0);
        const waiverVal = window.Utils.parseNum(card.fee_waiver_target || 0);

        const formatDay = (d) => (d !== null && d !== undefined && String(d).trim() !== '' && !isNaN(d)) ? `Day ${d} of month` : 'Not Set';

        const html = `
            <div class="vc-modal-wrap">
                <!-- Hero 3D Card Showcase -->
                <div class="vc-modal-hero ${isPrimary ? 'is-primary-card' : 'is-addon-card'}" style="background: ${theme.grad};">
                    <div class="cc-card-sheen" aria-hidden="true"></div>
                    <div class="cc-card-top">
                        <div class="cc-chip-wrap">
                            <div class="cc-emv-chip"></div>
                            <span class="cc-cat-tag ${isPrimary ? 'is-primary' : 'is-addon'}">
                                <i class="fas ${isPrimary ? 'fa-crown' : 'fa-code-branch'}"></i>
                                ${esc(card.card_category || 'Card')}
                            </span>
                        </div>
                        <span class="cc-status-pill ${statusCls}">
                            <span class="cc-status-dot"></span>${esc(card.status || 'Active')}
                        </span>
                    </div>

                    <div class="cc-bank-row" style="margin-top: 6px;">
                        <span class="cc-bank-name" style="font-size: 1.15rem;">${esc(card.bank_name || 'Bank')}</span>
                        <span class="cc-card-type">${esc(card.card_type || '')}</span>
                    </div>

                    <div class="vc-modal-num-row">
                        <span id="vc-modal-card-num" class="vc-modal-num" data-masked="${esc(maskedNum)}" data-full="${esc(formattedNum)}" data-revealed="false">${esc(maskedNum)}</span>
                        <div class="vc-num-tools">
                            <button type="button" class="vc-tool-btn" id="vc-reveal-btn" title="Reveal / Mask Card Number" onclick="(function(b){var el=document.getElementById('vc-modal-card-num');if(!el)return;var rev=el.dataset.revealed==='true';el.textContent=rev?el.dataset.masked:el.dataset.full;el.dataset.revealed=rev?'false':'true';b.innerHTML=rev?'<i class=\\'fas fa-eye\\'></i>':'<i class=\\'fas fa-eye-slash\\'></i>';})(this)">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button type="button" class="vc-tool-btn" title="Copy Card Number" onclick="navigator.clipboard?.writeText('${esc(rawNum)}').then(()=>window.App?.showToast('Card number copied!','success'))">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>

                    <div class="cc-holder-row">
                        <div>
                            <div class="cc-meta-label">CARDHOLDER</div>
                            <div class="cc-holder-link" style="font-size: 1rem;">${esc(card.cardholder_name || '—')}</div>
                        </div>
                        <div style="text-align:right;">
                            <div class="cc-meta-label">PRIMARY OWNER</div>
                            <div class="cc-owner-name">${esc(card.primary_cardholder || '—')}</div>
                        </div>
                    </div>
                </div>

                <!-- 4-Tile KPI Strip -->
                <div class="vc-kpi-strip">
                    <div class="vc-kpi-tile kpi-indigo">
                        <div class="vc-kpi-label"><i class="fas fa-tachometer-alt"></i> Credit Limit</div>
                        <div class="vc-kpi-val">${limitVal > 0 ? window.Utils.formatCurrency(limitVal) : 'Unset'}</div>
                    </div>
                    <div class="vc-kpi-tile kpi-emerald">
                        <div class="vc-kpi-label"><i class="fas fa-wallet"></i> Used Exposure</div>
                        <div class="vc-kpi-val">${window.Utils.formatCurrency(metrics.used || 0)}</div>
                    </div>
                    <div class="vc-kpi-tile kpi-amber">
                        <div class="vc-kpi-label"><i class="fas fa-star"></i> Reward Points</div>
                        <div class="vc-kpi-val">${rewardVal.toLocaleString('en-IN')}</div>
                    </div>
                    <div class="vc-kpi-tile kpi-purple">
                        <div class="vc-kpi-label"><i class="fas fa-gift"></i> Fee Waiver</div>
                        <div class="vc-kpi-val">${waiverVal > 0 ? window.Utils.formatCurrency(waiverVal) : 'None'}</div>
                    </div>
                </div>

                <!-- Bento Detail Grid -->
                <div class="vc-bento-grid">
                    <div class="vc-bento-box">
                        <div class="vc-bento-title"><i class="fas fa-calendar-check"></i> Billing &amp; Ledger</div>
                        <div class="vc-detail-list">
                            <div class="vc-detail-row">
                                <span>Zoho Ledger</span>
                                <strong class="vc-ledger-chip">${esc(card.zoho_ledger_name || 'Unmapped')}</strong>
                            </div>
                            <div class="vc-detail-row">
                                <span>Statement Date</span>
                                <strong>${esc(formatDay(card.statement_date))}</strong>
                            </div>
                            <div class="vc-detail-row">
                                <span>Due Date</span>
                                <strong>${esc(formatDay(card.due_date))}</strong>
                            </div>
                            <div class="vc-detail-row">
                                <span>Renewal Date</span>
                                <strong>${card.renewal_date ? esc(window.Utils.formatDate(card.renewal_date)) : 'Not Set'}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="vc-bento-box">
                        <div class="vc-bento-title"><i class="fas fa-address-card"></i> Contact &amp; Notes</div>
                        <div class="vc-detail-list">
                            <div class="vc-detail-row">
                                <span>Email</span>
                                <strong>${esc(card.email || '—')}</strong>
                            </div>
                            <div class="vc-detail-row">
                                <span>Phone</span>
                                <strong>${esc(card.phone || '—')}</strong>
                            </div>
                            <div class="vc-detail-row vc-detail-col">
                                <span>Billing Address</span>
                                <div class="vc-addr-box">${esc(card.address || 'No address recorded')}</div>
                            </div>
                            ${card.remarks ? `
                            <div class="vc-detail-row vc-detail-col">
                                <span>Remarks</span>
                                <div class="vc-addr-box">${esc(card.remarks)}</div>
                            </div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Footer Quick Actions -->
                <div class="vc-modal-footer">
                    <button type="button" class="btn btn-outline" onclick="window.App?.closeModal(); window.Master.viewCardLedger('${card.card_id}');" style="border-radius: 10px;">
                        <i class="fas fa-file-invoice-dollar"></i> Statement Ledger
                    </button>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-primary" onclick="window.App?.closeModal(); window.Master.editCard('${card.card_id}');" style="border-radius: 10px;">
                            <i class="fas fa-edit"></i> Edit Card
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="window.App?.closeModal();" style="border-radius: 10px;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        if(window.App && window.App.showModal) {
            window.App.showModal("Card Intelligence & Details", html);
        } else {
            alert(JSON.stringify(card, null, 2));
        }
    },

    _syncFormPreview: function() {
        const bank = document.getElementById('f_bank')?.value || '';
        const type = document.getElementById('f_type')?.value || '';
        const num = document.getElementById('f_number')?.value || '';
        const name = document.getElementById('f_name')?.value || 'CARDHOLDER NAME';
        const owner = document.getElementById('f_owner')?.value || 'Primary Owner';
        const cat = document.getElementById('f_cat')?.value || 'Primary';
        const status = document.getElementById('f_status')?.value || 'Active';

        const theme = this._getBankTheme(bank, type);
        const hero = document.getElementById('cf-live-preview');
        if (hero) hero.style.background = theme.grad;

        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt('cf-prev-bank', bank || 'BANK NAME');
        setTxt('cf-prev-type', type || 'Card Variant');
        setTxt('cf-prev-num', num ? window.Utils.maskCardNumber(num) : '•••• •••• •••• ••••');
        setTxt('cf-prev-holder', name || 'CARDHOLDER NAME');
        setTxt('cf-prev-owner', owner || 'Primary Owner');
        setTxt('cf-prev-cat', cat);
        setTxt('cf-prev-status-txt', status);

        const catEl = document.getElementById('cf-prev-cat');
        if (catEl) catEl.className = `cc-cat-tag ${cat === 'Primary' ? 'is-primary' : 'is-addon'}`;

        const stEl = document.getElementById('cf-prev-status');
        if (stEl) stEl.className = `cc-status-pill ${status === 'Active' ? 'status-active' : (status === 'Blocked' ? 'status-blocked' : 'status-inactive')}`;
    },

    renderFormModal: function(card) {
        const isEdit = !!card;
        const c = card || {};
        const esc = window.Utils.escapeHtml;
        const theme = this._getBankTheme(c.bank_name, c.card_type);
        const isPrimary = (c.card_category || 'Primary') === 'Primary';
        const statusCls = (c.status || 'Active') === 'Active' ? 'status-active' : (c.status === 'Blocked' ? 'status-blocked' : 'status-inactive');
        
        const html = `
            <form id="cardForm" class="cf-nextgen-form" onsubmit="event.preventDefault(); window.Master.saveCard('${esc(c.card_id || '')}')">
                <!-- Live Interactive Card Preview -->
                <div id="cf-live-preview" class="cf-live-card" style="background: ${theme.grad};">
                    <div class="cc-card-sheen" aria-hidden="true"></div>
                    <div class="cc-card-top">
                        <div class="cc-chip-wrap">
                            <div class="cc-emv-chip"></div>
                            <span id="cf-prev-cat" class="cc-cat-tag ${isPrimary ? 'is-primary' : 'is-addon'}">${esc(c.card_category || 'Primary')}</span>
                        </div>
                        <span id="cf-prev-status" class="cc-status-pill ${statusCls}">
                            <span class="cc-status-dot"></span><span id="cf-prev-status-txt">${esc(c.status || 'Active')}</span>
                        </span>
                    </div>
                    <div class="cc-bank-row">
                        <span id="cf-prev-bank" class="cc-bank-name">${esc(c.bank_name || 'BANK NAME')}</span>
                        <span id="cf-prev-type" class="cc-card-type">${esc(c.card_type || 'Card Variant')}</span>
                    </div>
                    <div id="cf-prev-num" class="cc-card-num" style="font-size: 1rem;">${c.card_number ? esc(window.Utils.maskCardNumber(c.card_number)) : '•••• •••• •••• ••••'}</div>
                    <div class="cc-holder-row">
                        <div>
                            <div class="cc-meta-label">CARDHOLDER</div>
                            <div id="cf-prev-holder" class="cc-holder-link">${esc(c.cardholder_name || 'CARDHOLDER NAME')}</div>
                        </div>
                        <div style="text-align:right;">
                            <div class="cc-meta-label">PRIMARY OWNER</div>
                            <div id="cf-prev-owner" class="cc-owner-name">${esc(c.primary_cardholder || 'Primary Owner')}</div>
                        </div>
                    </div>
                </div>

                <!-- Section 1: Card Identity -->
                <div class="cf-section cf-sec-indigo">
                    <div class="cf-sec-title"><i class="fas fa-id-card"></i> Card Identity &amp; Ownership</div>
                    <div class="cf-grid-3">
                        <div class="cf-field">
                            <label for="f_owner">Primary Owner <span class="cf-req">*</span></label>
                            <input type="text" class="form-control" id="f_owner" value="${esc(c.primary_cardholder || '')}" oninput="window.Master._syncFormPreview()" required>
                        </div>
                        <div class="cf-field">
                            <label for="f_cat">Category <span class="cf-req">*</span></label>
                            <select class="form-select" id="f_cat" onchange="window.Master._syncFormPreview()" required>
                                <option value="Primary" ${c.card_category === 'Primary' ? 'selected' : ''}>Primary</option>
                                <option value="Add-on" ${c.card_category === 'Add-on' ? 'selected' : ''}>Add-on</option>
                            </select>
                        </div>
                        <div class="cf-field">
                            <label for="f_name">Cardholder Name <span class="cf-req">*</span></label>
                            <input type="text" class="form-control" id="f_name" value="${esc(c.cardholder_name || '')}" oninput="window.Master._syncFormPreview()" required>
                        </div>
                        <div class="cf-field">
                            <label for="f_bank">Bank Name <span class="cf-req">*</span></label>
                            <input type="text" class="form-control" id="f_bank" value="${esc(c.bank_name || '')}" oninput="window.Master._syncFormPreview()" required>
                        </div>
                        <div class="cf-field">
                            <label for="f_type">Card Type <span class="cf-req">*</span></label>
                            <input type="text" class="form-control" id="f_type" value="${esc(c.card_type || '')}" oninput="window.Master._syncFormPreview()" required>
                        </div>
                        <div class="cf-field">
                            <label for="f_number">Card Number <span class="cf-req">*</span></label>
                            <input type="text" class="form-control" id="f_number" value="${esc(c.card_number || '')}" oninput="window.Master._syncFormPreview()" required>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Limits, Billing & Ledger -->
                <div class="cf-section cf-sec-emerald">
                    <div class="cf-sec-title"><i class="fas fa-sliders-h"></i> Limits, Billing Cycle &amp; Ledger</div>
                    <div class="cf-grid-2">
                        <div class="cf-field">
                            <label for="f_ledger">Zoho Ledger Name</label>
                            <input type="text" class="form-control" id="f_ledger" value="${esc(c.zoho_ledger_name || '')}">
                        </div>
                        <div class="cf-field">
                            <label for="f_limit">Credit Limit (₹) <span class="cf-req">*</span></label>
                            <input type="number" step="0.01" class="form-control" id="f_limit" value="${c.credit_limit || ''}" required>
                        </div>
                    </div>
                    <div class="cf-grid-4" style="margin-top: 12px;">
                        <div class="cf-field">
                            <label for="f_stmt_date">Statement Day</label>
                            <input type="number" min="1" max="31" inputmode="numeric" class="form-control" id="f_stmt_date" placeholder="1-31" value="${c.statement_date || ''}">
                        </div>
                        <div class="cf-field">
                            <label for="f_due_date">Due Day</label>
                            <input type="number" min="1" max="31" inputmode="numeric" class="form-control" id="f_due_date" placeholder="1-31" value="${c.due_date || ''}">
                        </div>
                        <div class="cf-field">
                            <label for="f_renewal">Renewal Date</label>
                            <input type="date" class="form-control" id="f_renewal" value="${c.renewal_date ? window.Utils.formatDateInput(new Date(c.renewal_date)) : ''}">
                        </div>
                        <div class="cf-field">
                            <label for="f_status">Status <span class="cf-req">*</span></label>
                            <select class="form-select" id="f_status" onchange="window.Master._syncFormPreview()" required>
                                <option value="Active" ${c.status === 'Active' ? 'selected' : ''}>Active</option>
                                <option value="Inactive" ${c.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                                <option value="Blocked" ${c.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
                            </select>
                        </div>
                    </div>
                    <div class="cf-grid-2" style="margin-top: 12px;">
                        <div class="cf-field">
                            <label for="f_waiver">Fee Waiver Target (₹)</label>
                            <input type="number" step="0.01" class="form-control" id="f_waiver" value="${c.fee_waiver_target || ''}">
                        </div>
                        <div class="cf-field">
                            <label for="f_rewards">Reward Points</label>
                            <input type="number" inputmode="numeric" class="form-control" id="f_rewards" value="${c.reward_points || ''}">
                        </div>
                    </div>
                </div>

                <!-- Section 3: Contact & Notes -->
                <div class="cf-section cf-sec-purple">
                    <div class="cf-sec-title"><i class="fas fa-address-book"></i> Contact &amp; Notes</div>
                    <div class="cf-grid-2">
                        <div class="cf-field">
                            <label for="f_email">Email</label>
                            <input type="email" class="form-control" id="f_email" value="${esc(c.email || '')}">
                        </div>
                        <div class="cf-field">
                            <label for="f_phone">Phone</label>
                            <input type="tel" inputmode="tel" class="form-control" id="f_phone" value="${esc(c.phone || '')}">
                        </div>
                    </div>
                    <div class="cf-field" style="margin-top: 12px;">
                        <label for="f_address">Billing Address</label>
                        <textarea class="form-control" id="f_address" rows="2">${esc(c.address || '')}</textarea>
                    </div>
                    <div class="cf-field" style="margin-top: 12px;">
                        <label for="f_remarks">Remarks</label>
                        <textarea class="form-control" id="f_remarks" rows="2">${esc(c.remarks || '')}</textarea>
                    </div>
                </div>

                <div class="cf-form-footer">
                    <button type="button" class="btn btn-secondary" onclick="window.App.closeModal()" style="border-radius: 10px;">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button type="submit" class="btn btn-primary cf-submit-btn">
                        <i class="fas fa-${isEdit ? 'save' : 'plus-circle'}"></i> ${isEdit ? 'Update Card' : 'Save Card'}
                    </button>
                </div>
            </form>
        `;

        if(window.App && window.App.showModal) {
            window.App.showModal(isEdit ? "Edit Card Profile" : "Add New Card", html);
        }
    },

    saveCard: async function(cardId) {
        const data = {
            primary_cardholder: document.getElementById('f_owner').value,
            card_category:      document.getElementById('f_cat').value,
            cardholder_name:    document.getElementById('f_name').value,
            zoho_ledger_name:   document.getElementById('f_ledger').value,
            bank_name:          document.getElementById('f_bank').value,
            card_type:          document.getElementById('f_type').value,
            card_number:        document.getElementById('f_number').value,
            card_last4:         window.Utils.getLast4(document.getElementById('f_number').value),
            credit_limit:       parseFloat(document.getElementById('f_limit').value) || 0,
            address:            document.getElementById('f_address').value,
            email:              document.getElementById('f_email').value,
            phone:              document.getElementById('f_phone').value,
            statement_date:     parseInt(document.getElementById('f_stmt_date').value) || null,
            due_date:           parseInt(document.getElementById('f_due_date').value) || null,
            renewal_date:       document.getElementById('f_renewal').value ? new Date(document.getElementById('f_renewal').value).toISOString() : null,
            fee_waiver_target:  parseFloat(document.getElementById('f_waiver').value) || 0,
            reward_points:      parseInt(document.getElementById('f_rewards').value) || 0,
            status:             document.getElementById('f_status').value,
            remarks:            document.getElementById('f_remarks').value
        };

        if(window.App && window.App.closeModal) window.App.closeModal();

        if(cardId) {
            if(window.App) window.App.showToast('Saving to Google Sheets...', 'info');
            await window.DB.cards.update(cardId, data);
            if(window.App) window.App.showToast('Card updated successfully', 'success');
        } else {
            if(window.App) window.App.showToast('Adding to Google Sheets...', 'info');
            await window.DB.cards.add(data);
            if(window.App) window.App.showToast('Card added successfully', 'success');
        }

        this.renderTable();
    },

    // ── IMPORT CARDS FROM EXCEL / CSV ─────────────────────────
    triggerImportCards: function() {
        const fileInput = document.getElementById('card-master-file-input');
        if (fileInput) {
            fileInput.value = '';
            fileInput.click();
        }
    },

    downloadSampleTemplate: function() {
        if (!window.XLSX) {
            alert('Excel library not loaded yet. Please wait or refresh.');
            return;
        }

        const sampleRows = [
            {
                'Primary Owner': 'Alok Harlalka',
                'Category': 'Primary',
                'Cardholder Name': 'Alok Harlalka',
                'Bank Name': 'ICICI',
                'Card Type': 'ICICI Emerald Visa',
                'Card Number': '4315XXXXXXXX0004',
                'Zoho Ledger Name': 'Alok ICICI Credit Card',
                'Credit Limit': 1000000,
                'Address': 'Kolkata, WB',
                'Email': 'alok@gretexgroup.com',
                'Phone': '9830000000',
                'Statement Date': 15,
                'Due Date': 5,
                'Renewal Date': '2027-03-31',
                'Fee Waiver Target': 500000,
                'Reward Points': 15000,
                'Status': 'Active',
                'Remarks': 'Corporate primary card'
            },
            {
                'Primary Owner': 'Alok Harlalka',
                'Category': 'Add-on',
                'Cardholder Name': 'YASH HARLALKA',
                'Bank Name': 'ICICI',
                'Card Type': 'ICICI Emerald Visa',
                'Card Number': '4315XXXXXXXX0111',
                'Zoho Ledger Name': 'Alok ICICI Credit Card',
                'Credit Limit': 1000000,
                'Address': 'Kolkata, WB',
                'Email': 'yash@gretexgroup.com',
                'Phone': '9830000001',
                'Statement Date': 15,
                'Due Date': 5,
                'Renewal Date': '2027-03-31',
                'Fee Waiver Target': 0,
                'Reward Points': 0,
                'Status': 'Active',
                'Remarks': 'Add-on card attached to Alok ICICI'
            },
            {
                'Primary Owner': 'Gourav Harlalka',
                'Category': 'Primary',
                'Cardholder Name': 'Gourav Harlalka',
                'Bank Name': 'HDFC',
                'Card Type': 'HDFC Regalia Gold',
                'Card Number': '5421XXXXXXXX8821',
                'Zoho Ledger Name': 'Gourav HDFC Card',
                'Credit Limit': 500000,
                'Address': 'Mumbai, MH',
                'Email': 'gourav@gretexgroup.com',
                'Phone': '9820000000',
                'Statement Date': 20,
                'Due Date': 10,
                'Renewal Date': '2027-06-30',
                'Fee Waiver Target': 400000,
                'Reward Points': 25000,
                'Status': 'Active',
                'Remarks': 'Primary executive card'
            }
        ];

        const ws = window.XLSX.utils.json_to_sheet(sampleRows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "credit_cards");
        window.XLSX.writeFile(wb, "Credit_Card_Master_Template.xlsx");
        if (window.App && window.App.showToast) {
            window.App.showToast('Sample template downloaded: Credit_Card_Master_Template.xlsx', 'success');
        }
    },

    handleImportFile: function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!window.XLSX) {
            alert('Excel library not loaded yet. Please wait or refresh.');
            return;
        }

        if (window.App && window.App.showToast) {
            window.App.showToast(`Reading ${file.name}...`, 'info');
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
                
                let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('credit') || n.toLowerCase().includes('card')) || workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rawRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (!rawRows || rawRows.length === 0) {
                    alert('No rows found in the selected Excel file.');
                    return;
                }

                const parsedCards = [];
                rawRows.forEach((r) => {
                    const getVal = (...keys) => {
                        for (let k of keys) {
                            for (let rk of Object.keys(r)) {
                                if (rk.trim().toLowerCase().replace(/[\s_\-]+/g, '') === k.toLowerCase().replace(/[\s_\-]+/g, '')) {
                                    return r[rk];
                                }
                            }
                        }
                        return '';
                    };

                    const name = String(getVal('cardholder_name', 'cardholder', 'name', 'card_holder_name') || '').trim();
                    const owner = String(getVal('primary_cardholder', 'primary_owner', 'owner') || name).trim();
                    const cardNum = String(getVal('card_number', 'card_no', 'cardnumber', 'number') || '').trim();
                    const bank = String(getVal('bank_name', 'bank') || '').trim();
                    const cardType = String(getVal('card_type', 'type') || '').trim();
                    const ledger = String(getVal('zoho_ledger_name', 'zoho_ledger', 'ledger_name', 'ledger') || '').trim();
                    
                    let cat = String(getVal('card_category', 'category') || '').trim();
                    if (!cat) {
                        cat = (name && owner && name.toLowerCase() !== owner.toLowerCase()) ? 'Add-on' : 'Primary';
                    } else if (cat.toLowerCase().includes('add')) {
                        cat = 'Add-on';
                    } else {
                        cat = 'Primary';
                    }

                    const limit = window.Utils.parseNum(getVal('credit_limit', 'limit'));
                    const last4 = cardNum ? window.Utils.getLast4(cardNum) : String(getVal('card_last4', 'last4') || '').padStart(4, '0').slice(-4);

                    if (name || cardNum || ledger) {
                        parsedCards.push({
                            cardholder_name: name || owner || 'Cardholder',
                            primary_cardholder: owner || name || 'Primary Owner',
                            card_category: cat,
                            bank_name: bank || (window.Utils.extractBankName(cardType) || 'Bank'),
                            card_type: cardType || (bank ? `${bank} Card` : 'Credit Card'),
                            card_number: cardNum || `XXXX-XXXX-XXXX-${last4}`,
                            card_last4: last4,
                            credit_limit: limit,
                            zoho_ledger_name: ledger || `${name} ${bank} Card`,
                            address: String(getVal('address') || '').trim(),
                            email: String(getVal('email') || '').trim(),
                            phone: String(getVal('phone', 'mobile') || '').trim(),
                            statement_date: parseInt(getVal('statement_date', 'bill_date')) || null,
                            due_date: parseInt(getVal('due_date')) || null,
                            renewal_date: getVal('renewal_date') ? new Date(getVal('renewal_date')).toISOString() : null,
                            fee_waiver_target: window.Utils.parseNum(getVal('fee_waiver_target', 'waiver_target')),
                            reward_points: parseInt(getVal('reward_points', 'rewards')) || 0,
                            status: String(getVal('status') || 'Active').trim(),
                            remarks: String(getVal('remarks') || '').trim()
                        });
                    }
                });

                if (parsedCards.length === 0) {
                    alert('Could not find valid card records in this file. Please verify column headers or use the sample template.');
                    return;
                }

                window.Master.showImportPreviewModal(parsedCards, file.name);

            } catch (err) {
                console.error('Import parse error:', err);
                alert('Error parsing Excel file: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    showImportPreviewModal: function(cards, fileName) {
        window.Master._pendingImportCards = cards;

        const primaryCount = cards.filter(c => c.card_category === 'Primary').length;
        const addonCount = cards.filter(c => c.card_category === 'Add-on').length;

        let previewRows = cards.slice(0, 8).map((c, i) => `
            <tr>
                <td><strong>${i + 1}</strong></td>
                <td>
                    <strong>${c.cardholder_name}</strong>
                    <div class="small text-muted">${c.primary_cardholder !== c.cardholder_name ? `Owner: ${c.primary_cardholder}` : ''}</div>
                </td>
                <td>
                    <span class="badge" style="${c.card_category === 'Primary' ? 'background:#eef0ff;color:#4361ee;border:1px solid #4361ee;' : 'background:#f3e8ff;color:#7209b7;border:1px solid #7209b7;'}font-weight:700;">
                        ${c.card_category}
                    </span>
                </td>
                <td><strong>${c.bank_name}</strong> <small class="text-muted">(${c.card_type})</small></td>
                <td><code style="font-family:'JetBrains Mono',monospace;">${c.card_last4 ? `**** ${c.card_last4}` : c.card_number}</code></td>
                <td class="text-right fw-bold text-success">${window.Utils.formatCurrency(c.credit_limit)}</td>
                <td><small class="text-muted">${c.zoho_ledger_name}</small></td>
            </tr>
        `).join('');

        const modalHtml = `
            <div style="margin-bottom: 20px;">
                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 p-3 bg-light rounded border mb-3">
                    <div>
                        <div class="small text-muted text-uppercase fw-bold"><i class="fas fa-file-excel text-success me-1"></i> File Loaded</div>
                        <div class="fw-bold fs-6" style="color:#1e293b;">${fileName}</div>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <span class="badge" style="background:#e8f0fe;color:#1a73e8;border:1px solid #c2e7ff;padding:6px 12px;font-size:0.8rem;border-radius:100px;">
                            <i class="fas fa-credit-card me-1"></i> ${cards.length} Cards Total
                        </span>
                        <span class="badge" style="background:#e6faf4;color:#06d6a0;border:1px solid #06d6a0;padding:6px 12px;font-size:0.8rem;border-radius:100px;">
                            ${primaryCount} Primary
                        </span>
                        <span class="badge" style="background:#f3e8ff;color:#7209b7;border:1px solid #7209b7;padding:6px 12px;font-size:0.8rem;border-radius:100px;">
                            ${addonCount} Add-on
                        </span>
                    </div>
                </div>

                <div class="small text-muted mb-2">
                    <i class="fas fa-eye me-1"></i> Showing first ${Math.min(cards.length, 8)} of ${cards.length} cards detected:
                </div>

                <div class="table-responsive border rounded" style="max-height: 340px; overflow-y: auto;">
                    <table class="table data-table table-hover mb-0">
                        <thead class="table-light" style="position: sticky; top: 0; z-index: 2;">
                            <tr>
                                <th>#</th>
                                <th>Cardholder</th>
                                <th>Category</th>
                                <th>Bank &amp; Type</th>
                                <th>Card Last 4</th>
                                <th class="text-right">Credit Limit</th>
                                <th>Zoho Ledger</th>
                            </tr>
                        </thead>
                        <tbody>${previewRows}</tbody>
                    </table>
                </div>

                <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                    <button class="btn btn-secondary" onclick="window.App.closeModal()">
                        <i class="fas fa-times me-1"></i> Cancel
                    </button>
                    <button class="btn btn-primary" onclick="window.Master.executeImport()" style="background:#4361ee;font-weight:700;padding:8px 22px;border-radius:8px;">
                        <i class="fas fa-check-circle me-1"></i> Confirm &amp; Import ${cards.length} Cards
                    </button>
                </div>
            </div>
        `;

        if (window.App && window.App.showModal) {
            window.App.showModal("Import Credit Cards Preview", modalHtml);
        }
    },

    executeImport: async function() {
        const cards = window.Master._pendingImportCards;
        if (!cards || cards.length === 0) return;

        if (window.App) {
            window.App.showToast(`Importing ${cards.length} cards into system...`, 'info');
            window.App.closeModal();
        }

        try {
            await window.DB.cards.addBatch(cards);
            if (window.App) {
                window.App.showToast(`🎉 Successfully imported ${cards.length} cards!`, 'success');
                window.App.updateCardCount();
            }
            window.Master._pendingImportCards = null;
            window.Master.render(window.Master.container);
        } catch (err) {
            console.error('Import failed:', err);
            if (window.App) {
                window.App.showToast('Import failed: ' + err.message, 'error');
            } else {
                alert('Import failed: ' + err.message);
            }
        }
    }
};

// ============================================================
// GroupReport — Executive Daily Group Report & JPG Exporter
// Built for Management Circulation (WhatsApp / Email / Teams)
// ============================================================

window.GroupReport = {
    expenseFromDate: '2024-04-01',
    viewMode: localStorage.getItem('ccms_gr_view') || 'charts',
    singleWindow: false,
    _charts: [],

    setViewMode: function(mode) {
        this.viewMode = mode === 'table' ? 'table' : 'charts';
        localStorage.setItem('ccms_gr_view', this.viewMode);
        this.render(this.container);
    },

    toggleSingleWindow: function(force) {
        this.singleWindow = typeof force === 'boolean' ? force : !this.singleWindow;
        if (this.singleWindow) {
            this.viewMode = 'charts';
        }
        this.render(this.container);
    },

    render: function(container) {
        this.container = container;
        const cards = window.DB.cards.getAll() || [];
        const txns = window.DB.transactions.getAll() || [];
        const stmts = window.DB.statements.getAll() || [];
        const esc = window.Utils.escapeHtml;

        const fromDateObj = new Date(this.expenseFromDate || '2024-04-01');
        fromDateObj.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in3Months = new Date(today);
        in3Months.setMonth(in3Months.getMonth() + 3);

        // Precompute per-card metrics & expenses since fromDate
        const cardStats = new Map();
        cards.forEach(c => {
            const m = window.DB.cards.getCardLimitMetrics ? window.DB.cards.getCardLimitMetrics(c.card_id) : { limit: 0, used: 0, available: 0 };
            const limit = window.Utils.parseNum(c.credit_limit) || 0;
            const used = window.Utils.parseNum(m.used) || 0;
            const avail = Math.max(0, limit - used);
            const rewards = window.Utils.parseNum(c.reward_points) || 0;

            const expTillDate = txns
                .filter(t => String(t.card_id) === String(c.card_id) && t.txn_type === 'Debit' && t.txn_date && new Date(t.txn_date) >= fromDateObj)
                .reduce((sum, t) => sum + (window.Utils.parseNum(t.amount) || 0), 0);

            cardStats.set(String(c.card_id), { limit, used, avail, rewards, expTillDate });
        });

        // 1. LIMIT SUMMARY
        let totalLimit = 0;
        let totalUsed = 0;
        let totalExpTillDate = 0;
        let totalRewardsAll = 0;
        cards.forEach(c => {
            const st = cardStats.get(String(c.card_id));
            totalLimit += st.limit;
            totalUsed += st.used;
            totalExpTillDate += st.expTillDate;
            totalRewardsAll += st.rewards;
        });
        const totalAvail = Math.max(0, totalLimit - totalUsed);
        const usedPct = totalLimit > 0 ? ((totalUsed / totalLimit) * 100).toFixed(1) : '0.0';
        const availPct = totalLimit > 0 ? ((totalAvail / totalLimit) * 100).toFixed(1) : '0.0';

        // 2. NAMEWISE C/C SUMMARY (Grouped by Primary Cardholder)
        const nameMap = {};
        cards.forEach(c => {
            const holder = (c.primary_cardholder || c.cardholder_name || 'Unassigned').trim();
            if (!nameMap[holder]) {
                nameMap[holder] = { name: holder, count: 0, limit: 0, used: 0, avail: 0, exp: 0, rewards: 0 };
            }
            const st = cardStats.get(String(c.card_id));
            nameMap[holder].count += 1;
            nameMap[holder].limit += st.limit;
            nameMap[holder].used += st.used;
            nameMap[holder].avail = Math.max(0, nameMap[holder].limit - nameMap[holder].used);
            nameMap[holder].exp += st.expTillDate;
            nameMap[holder].rewards += st.rewards;
        });
        const nameRows = Object.values(nameMap).sort((a, b) => b.limit - a.limit);

        // 3. BANKWISE C/C SUMMARY
        const bankMap = {};
        cards.forEach(c => {
            const bank = (c.bank_name || 'Other').trim();
            if (!bankMap[bank]) {
                bankMap[bank] = { bank, count: 0, limit: 0, used: 0, avail: 0, exp: 0, rewards: 0 };
            }
            const st = cardStats.get(String(c.card_id));
            bankMap[bank].count += 1;
            bankMap[bank].limit += st.limit;
            bankMap[bank].used += st.used;
            bankMap[bank].avail = Math.max(0, bankMap[bank].limit - bankMap[bank].used);
            bankMap[bank].exp += st.expTillDate;
            bankMap[bank].rewards += st.rewards;
        });
        const bankRows = Object.values(bankMap).sort((a, b) => b.limit - a.limit);

        // 4. CREDIT CARD PAYABLE SUMMARY
        const getUrgencyBucket = (diffDays) => {
            if (diffDays === null) return { key: 'scheduled', label: 'Scheduled', cls: 'urg-ok' };
            if (diffDays < 0)      return { key: 'overdue',   label: `Overdue (${Math.abs(diffDays)}d)`, cls: 'urg-over' };
            if (diffDays === 0)    return { key: 'today',     label: 'Today', cls: 'urg-over' };
            if (diffDays <= 3)     return { key: 'in3',       label: 'In 3 Days', cls: 'urg-soon' };
            if (diffDays <= 7)     return { key: 'd4to7',     label: '4 to 7 Days', cls: 'urg-4to7' };
            if (diffDays <= 15)    return { key: 'd8to15',    label: '8 to 15 Days', cls: 'urg-8to15' };
            return { key: 'gt15', label: 'More than 15 Days', cls: 'urg-ok' };
        };

        const urgSummary = {
            today:  { label: 'Today', count: 0, amount: 0, cls: 'urg-over' },
            in3:    { label: 'In 3 Days', count: 0, amount: 0, cls: 'urg-soon' },
            d4to7:  { label: '4 to 7 Days', count: 0, amount: 0, cls: 'urg-4to7' },
            d8to15: { label: '8 to 15 Days', count: 0, amount: 0, cls: 'urg-8to15' },
            gt15:   { label: 'More than 15 Days', count: 0, amount: 0, cls: 'urg-ok' }
        };

        const payableRows = stmts
            .filter(s => s.payment_status !== 'Paid' && (window.Utils.parseNum(s.closing_outstanding) || 0) > 0)
            .map(s => {
                const card = cards.find(c => String(c.card_id) === String(s.card_id)) || {};
                const due = s.due_date ? new Date(s.due_date) : null;
                if (due && !isNaN(due.getTime())) due.setHours(0, 0, 0, 0);
                const diffDays = (due && !isNaN(due.getTime())) ? Math.round((due - today) / (1000 * 60 * 60 * 24)) : null;
                const isOverdue = diffDays !== null && diffDays < 0;
                const amt = window.Utils.parseNum(s.closing_outstanding) || 0;
                const urg = getUrgencyBucket(diffDays);
                if (urgSummary[urg.key]) {
                    urgSummary[urg.key].count += 1;
                    urgSummary[urg.key].amount += amt;
                }
                return {
                    holder: card.cardholder_name || card.primary_cardholder || 'Unknown',
                    last4: card.card_last4 || '',
                    bank: card.bank_name || 'Unknown',
                    amountDue: amt,
                    dueDate: s.due_date,
                    isOverdue,
                    diffDays,
                    urg
                };
            })
            .sort((a, b) => new Date(a.dueDate || '2099-12-31') - new Date(b.dueDate || '2099-12-31'));
        const totalPayableSum = payableRows.reduce((s, r) => s + r.amountDue, 0);

        // 5. LIST OF C/C RENEWAL FOR NEXT 3 MONTHS
        const renewalRows = cards
            .filter(c => {
                if (!c.renewal_date) return false;
                const rd = new Date(c.renewal_date);
                return !isNaN(rd.getTime()) && rd >= today && rd <= in3Months;
            })
            .map(c => ({
                bank: c.bank_name || 'Unknown',
                holder: c.cardholder_name || c.primary_cardholder || 'Unknown',
                last4: c.card_last4 || '',
                renewalDate: c.renewal_date
            }))
            .sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate));

        // 6. LIST OF C/C PENDING FOR UPDATION OF MOBILE NO. / CO. ADDRESS
        const isMissing = (val) => {
            const s = String(val || '').trim().toLowerCase();
            return !s || s === '-' || s === 'null' || s === 'undefined' || s === '(empty)' || s === 'n/a';
        };
        const pendingUpdateRows = cards
            .filter(c => isMissing(c.phone || c.mobile || c.mobile_no) || isMissing(c.address || c.billing_address))
            .map(c => ({
                holder: c.cardholder_name || c.primary_cardholder || 'Unknown',
                bank: c.bank_name || 'Unknown',
                last4: c.card_last4 || '',
                missingPhone: isMissing(c.phone || c.mobile || c.mobile_no),
                missingAddress: isMissing(c.address || c.billing_address)
            }));

        const fmt = (n) => window.Utils.formatCurrency(n || 0);
        const fromLabel = window.Utils.formatDate(this.expenseFromDate);
        const generatedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        container.innerHTML = `
            <!-- Action Toolbar (Excluded from JPG capture) -->
            <div class="gr-toolbar card mb-4">
                <div class="gr-toolbar-left">
                    <div>
                        <h2 class="page-title mb-0"><i class="fas fa-paper-plane text-primary"></i> Executive Group Report</h2>
                        <div class="page-subtitle text-muted">Daily management summary formatted for instant JPG download &amp; group sharing</div>
                    </div>
                </div>
                <div class="gr-toolbar-actions">
                    <div class="view-switcher" role="group" aria-label="Group Report view mode">
                        <button type="button" class="view-switch-btn ${this.viewMode === 'charts' ? 'active' : ''}" onclick="window.GroupReport.setViewMode('charts')">
                            <i class="fas fa-chart-bar"></i> <span>Chart View</span>
                        </button>
                        <button type="button" class="view-switch-btn ${this.viewMode === 'table' ? 'active' : ''}" onclick="window.GroupReport.setViewMode('table')">
                            <i class="fas fa-table"></i> <span>Table View</span>
                        </button>
                    </div>
                    <div class="gr-date-wrap">
                        <label for="gr-from-date">Expenses From:</label>
                        <input type="date" id="gr-from-date" class="form-control form-control-sm" value="${esc(this.expenseFromDate)}" onchange="window.GroupReport.updateFromDate(this.value)">
                    </div>
                    <button type="button" class="btn btn-primary" id="gr-btn-single" onclick="window.GroupReport.toggleSingleWindow(true)" style="background:linear-gradient(135deg,#4361ee,#7209b7);border:none;border-radius:10px;font-weight:700;padding:8px 14px;">
                        <i class="fas fa-expand"></i> Show in Single Window
                    </button>
                    <button type="button" class="btn btn-outline" id="gr-btn-wa" onclick="window.GroupReport.copyWhatsAppBrief()" style="border-radius:10px;font-weight:700;">
                        <i class="fab fa-whatsapp text-success"></i> Copy WhatsApp Text
                    </button>
                    <button type="button" class="btn btn-outline" id="gr-btn-copy" onclick="window.GroupReport.copyJpgToClipboard()" style="border-radius:10px;font-weight:700;">
                        <i class="fas fa-copy"></i> Copy Image
                    </button>
                    <button type="button" class="btn btn-primary gr-btn-jpg" id="gr-btn-download" onclick="window.GroupReport.downloadJpg()">
                        <i class="fas fa-file-image"></i> Download JPG Report
                    </button>
                </div>
            </div>

            <!-- CAPTURABLE MANAGEMENT POSTER CANVAS -->
            <div id="gr-capture-sheet" class="gr-poster ${this.singleWindow ? 'gr-single-window' : ''}">
                ${this.singleWindow ? `
                <div class="gr-sw-topbar" data-html2canvas-ignore="true">
                    <div class="gr-sw-brand"><i class="fas fa-tv"></i> SINGLE-WINDOW EXECUTIVE WALLBOARD</div>
                    <div class="d-flex gap-2 align-items-center flex-wrap">
                        <button type="button" class="btn btn-sm btn-outline" onclick="window.App?.toggleTheme()" style="border-radius:8px;font-weight:700;">
                            <i class="fas fa-adjust"></i> Theme
                        </button>
                        <button type="button" class="btn btn-sm btn-outline" onclick="window.GroupReport.copyJpgToClipboard()" style="border-radius:8px;font-weight:700;">
                            <i class="fas fa-copy"></i> Copy Image
                        </button>
                        <button type="button" class="btn btn-sm gr-btn-jpg" onclick="window.GroupReport.downloadJpg()" style="padding:6px 14px !important;">
                            <i class="fas fa-file-image"></i> Download JPG
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="window.GroupReport.toggleSingleWindow(false)" style="border-radius:8px;font-weight:700;">
                            <i class="fas fa-compress"></i> Exit [Esc]
                        </button>
                    </div>
                </div>` : ''}
                <!-- Masthead -->
                <header class="gr-masthead">
                    <div class="gr-mh-left">
                        <div class="gr-mh-badge"><i class="fas fa-shield-alt"></i> GRETEX GROUP &bull; DAILY TREASURY BRIEF</div>
                        <h1 class="gr-mh-title">Credit Card Portfolio &amp; Management Report</h1>
                        <p class="gr-mh-sub">Consolidated Limit Utilization, Holder/Bank Matrix, Payables, Renewals &amp; KYC Pending Status</p>
                    </div>
                    <div class="gr-mh-right">
                        <div class="gr-mh-meta-box">
                            <span>REPORT DATE</span>
                            <strong>${esc(generatedAt)}</strong>
                        </div>
                        <div class="gr-mh-meta-box">
                            <span>EXPENSE WINDOW</span>
                            <strong>From ${esc(fromLabel)}</strong>
                        </div>
                        <div class="gr-mh-meta-box">
                            <span>TOTAL CARDS</span>
                            <strong>${cards.length} Cards (${cards.filter(c => c.card_category === 'Primary').length} Primary)</strong>
                        </div>
                    </div>
                </header>

                <!-- SECTION 1: LIMIT SUMMARY -->
                <section class="gr-section">
                    <div class="gr-sec-head">
                        <span class="gr-sec-num">01</span>
                        <div>
                            <h3>Limit Summary</h3>
                            <p>Sanctioned Credit Limit, Active Exposure, Available Headroom &amp; Cumulative Expenses (from ${esc(fromLabel)})</p>
                        </div>
                    </div>
                    <div class="gr-kpi-grid">
                        <div class="gr-kpi-card gr-kpi-blue">
                            <div class="gr-kpi-top"><span>Total Limit of C/C</span><i class="fas fa-credit-card"></i></div>
                            <div class="gr-kpi-val">${fmt(totalLimit)}</div>
                            <div class="gr-kpi-foot">${cards.length} Total Cards Covered</div>
                        </div>
                        <div class="gr-kpi-card gr-kpi-rose">
                            <div class="gr-kpi-top"><span>Limit Used of C/C</span><i class="fas fa-chart-pie"></i></div>
                            <div class="gr-kpi-val">${fmt(totalUsed)}</div>
                            <div class="gr-kpi-foot">${usedPct}% Utilization</div>
                        </div>
                        <div class="gr-kpi-card gr-kpi-emerald">
                            <div class="gr-kpi-top"><span>Balance Available</span><i class="fas fa-wallet"></i></div>
                            <div class="gr-kpi-val">${fmt(totalAvail)}</div>
                            <div class="gr-kpi-foot">${availPct}% Headroom Ready</div>
                        </div>
                        <div class="gr-kpi-card gr-kpi-purple">
                            <div class="gr-kpi-top"><span>Expenses Till Date</span><i class="fas fa-receipt"></i></div>
                            <div class="gr-kpi-val">${fmt(totalExpTillDate)}</div>
                            <div class="gr-kpi-foot">Since ${esc(fromLabel)} &bull; ${totalRewardsAll.toLocaleString('en-IN')} Pts</div>
                        </div>
                    </div>
                </section>

                <!-- SECTION 2, 3 & 4 (wrapped in 3-col row when Single Window is active) -->
                <div class="${this.singleWindow ? 'gr-sw-charts-row' : 'gr-normal-flow'}">
                <!-- SECTION 2: NAMEWISE C/C SUMMARY -->
                <section class="gr-section">
                    <div class="gr-sec-head">
                        <span class="gr-sec-num">02</span>
                        <div>
                            <h3>Namewise C/C Summary</h3>
                            <p>Cardholder-wise card count, credit limit, utilization, expenses (from ${esc(fromLabel)}) &amp; reward points</p>
                        </div>
                        <span class="gr-sec-pill">${nameRows.length} Holders</span>
                    </div>
                    <div class="${this.viewMode === 'charts' ? 'gr-chart-box' : 'gr-table-wrap'}">
                        ${this.viewMode === 'charts' ? `<div style="height:310px;position:relative;"><canvas id="gr-chart-namewise"></canvas></div>` : `
                        <table class="gr-table">
                            <thead>
                                <tr>
                                    <th>Name of C/C Holder</th>
                                    <th class="text-center">No. of C/C</th>
                                    <th class="text-right">Total Limit</th>
                                    <th class="text-right">Used Limit</th>
                                    <th class="text-right">Balance Available</th>
                                    <th class="text-right">Expenses Till Date</th>
                                    <th class="text-right">Reward Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${nameRows.map(r => `
                                    <tr>
                                        <td><strong>${esc(r.name)}</strong></td>
                                        <td class="text-center"><span class="gr-count-pill">${r.count}</span></td>
                                        <td class="text-right">${fmt(r.limit)}</td>
                                        <td class="text-right gr-txt-rose">${fmt(r.used)}</td>
                                        <td class="text-right gr-txt-emerald">${fmt(r.avail)}</td>
                                        <td class="text-right gr-txt-indigo">${fmt(r.exp)}</td>
                                        <td class="text-right"><strong>${r.rewards.toLocaleString('en-IN')}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td>TOTAL</td>
                                    <td class="text-center">${cards.length}</td>
                                    <td class="text-right">${fmt(totalLimit)}</td>
                                    <td class="text-right">${fmt(totalUsed)}</td>
                                    <td class="text-right">${fmt(totalAvail)}</td>
                                    <td class="text-right">${fmt(totalExpTillDate)}</td>
                                    <td class="text-right">${totalRewardsAll.toLocaleString('en-IN')}</td>
                                </tr>
                            </tfoot>
                        </table>`}
                    </div>
                </section>

                <!-- SECTION 3: BANKWISE C/C SUMMARY -->
                <section class="gr-section">
                    <div class="gr-sec-head">
                        <span class="gr-sec-num">03</span>
                        <div>
                            <h3>Bankwise C/C Summary</h3>
                            <p>Institution-wise card allocation, limit exposure, available balance, expenses &amp; reward pool</p>
                        </div>
                        <span class="gr-sec-pill">${bankRows.length} Banks</span>
                    </div>
                    <div class="${this.viewMode === 'charts' ? 'gr-chart-box' : 'gr-table-wrap'}">
                        ${this.viewMode === 'charts' ? `<div style="height:310px;position:relative;"><canvas id="gr-chart-bankwise"></canvas></div>` : `
                        <table class="gr-table">
                            <thead>
                                <tr>
                                    <th>Bank Name</th>
                                    <th class="text-center">No. of C/C</th>
                                    <th class="text-right">Total Limit</th>
                                    <th class="text-right">Used Limit</th>
                                    <th class="text-right">Balance Available</th>
                                    <th class="text-right">Expenses Till Date</th>
                                    <th class="text-right">Reward Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bankRows.map(r => `
                                    <tr>
                                        <td><strong><i class="fas fa-university gr-bank-ico"></i> ${esc(r.bank)}</strong></td>
                                        <td class="text-center"><span class="gr-count-pill">${r.count}</span></td>
                                        <td class="text-right">${fmt(r.limit)}</td>
                                        <td class="text-right gr-txt-rose">${fmt(r.used)}</td>
                                        <td class="text-right gr-txt-emerald">${fmt(r.avail)}</td>
                                        <td class="text-right gr-txt-indigo">${fmt(r.exp)}</td>
                                        <td class="text-right"><strong>${r.rewards.toLocaleString('en-IN')}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td>TOTAL</td>
                                    <td class="text-center">${cards.length}</td>
                                    <td class="text-right">${fmt(totalLimit)}</td>
                                    <td class="text-right">${fmt(totalUsed)}</td>
                                    <td class="text-right">${fmt(totalAvail)}</td>
                                    <td class="text-right">${fmt(totalExpTillDate)}</td>
                                    <td class="text-right">${totalRewardsAll.toLocaleString('en-IN')}</td>
                                </tr>
                            </tfoot>
                        </table>`}
                    </div>
                </section>

                <!-- SECTION 4: CREDIT CARD PAYABLE SUMMARY -->
                <section class="gr-section">
                    <div class="gr-sec-head">
                        <span class="gr-sec-num gr-num-rose">04</span>
                        <div>
                            <h3>Credit Card Payable Summary</h3>
                            <p>Upcoming &amp; overdue statement payment obligations ordered by due date</p>
                        </div>
                        <span class="gr-sec-pill gr-pill-rose">${payableRows.length} Due &bull; ${fmt(totalPayableSum)}</span>
                    </div>
                    <div class="gr-urg-strip">
                        ${Object.values(urgSummary).map(b => `
                            <div class="gr-urg-box ${b.cls}">
                                <span class="gr-urg-box-lbl">${b.label}</span>
                                <strong class="gr-urg-box-amt">${fmt(b.amount)}</strong>
                                <small>${b.count} Card${b.count === 1 ? '' : 's'}</small>
                            </div>
                        `).join('')}
                    </div>
                    <div class="${this.viewMode === 'charts' ? 'gr-chart-box' : 'gr-table-wrap'}">
                        ${this.viewMode === 'charts' ? (payableRows.length ? `<div style="height:310px;position:relative;"><canvas id="gr-chart-payable"></canvas></div>` : `<div class="text-center gr-empty-ok py-4"><i class="fas fa-check-circle"></i> All credit card dues are settled!</div>`) : `
                        <table class="gr-table">
                            <thead>
                                <tr>
                                    <th>Name of the C/C Holder</th>
                                    <th>Name of Bank</th>
                                    <th class="text-right">Amount Due</th>
                                    <th>Due Date</th>
                                    <th class="text-center">Urgency</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${payableRows.length ? payableRows.map(r => {
                                    const badge = `<span class="gr-urg-pill ${r.urg.cls}">${esc(r.urg.label)}</span>`;
                                    return `
                                    <tr>
                                        <td><strong>${esc(r.holder)}</strong> ${r.last4 ? `<small class="gr-last4">(*${esc(r.last4)})</small>` : ''}</td>
                                        <td>${esc(r.bank)}</td>
                                        <td class="text-right gr-txt-rose"><strong>${fmt(r.amountDue)}</strong></td>
                                        <td>${r.dueDate ? window.Utils.formatDate(r.dueDate) : '—'}</td>
                                        <td class="text-center">${badge}</td>
                                    </tr>`;
                                }).join('') : `<tr><td colspan="5" class="text-center gr-empty-ok"><i class="fas fa-check-circle"></i> All credit card dues are settled!</td></tr>`}
                            </tbody>
                            ${payableRows.length ? `
                            <tfoot>
                                <tr>
                                    <td colspan="2">TOTAL PAYABLE</td>
                                    <td class="text-right">${fmt(totalPayableSum)}</td>
                                    <td colspan="2">${payableRows.length} Pending Statements</td>
                                </tr>
                            </tfoot>` : ''}
                        </table>`}
                    </div>
                </section>
                </div>

                <!-- SECTION 5 & 6: RENEWALS (NEXT 3 MONTHS) & PENDING UPDATION -->
                <div class="gr-bottom-split">
                    <section class="gr-section">
                        <div class="gr-sec-head">
                            <span class="gr-sec-num gr-num-amber">05</span>
                            <div>
                                <h3>C/C Renewal (Next 3 Months)</h3>
                                <p>Cards expiring or due for renewal within 90 days</p>
                            </div>
                            <span class="gr-sec-pill gr-pill-amber">${renewalRows.length} Cards</span>
                        </div>
                        <div class="gr-table-wrap">
                            <table class="gr-table">
                                <thead>
                                    <tr>
                                        <th>Name of Bank</th>
                                        <th>Name of C/C Holder</th>
                                        <th>Date of Renewal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${renewalRows.length ? renewalRows.map(r => `
                                        <tr>
                                            <td><strong>${esc(r.bank)}</strong></td>
                                            <td>${esc(r.holder)} ${r.last4 ? `<small class="gr-last4">(*${esc(r.last4)})</small>` : ''}</td>
                                            <td><span class="gr-urg-pill urg-soon">${window.Utils.formatDate(r.renewalDate)}</span></td>
                                        </tr>
                                    `).join('') : `<tr><td colspan="3" class="text-center gr-empty-ok"><i class="fas fa-check-circle"></i> No renewals due in the next 3 months.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section class="gr-section">
                        <div class="gr-sec-head">
                            <span class="gr-sec-num gr-num-purple">06</span>
                            <div>
                                <h3>Pending Updation (Mobile / Co. Address)</h3>
                                <p>Cards requiring KYC / contact update</p>
                            </div>
                            <span class="gr-sec-pill gr-pill-rose">${pendingUpdateRows.length} Pending</span>
                        </div>
                        <div class="gr-table-wrap" style="max-height: 360px; overflow-y: auto;">
                            <table class="gr-table">
                                <thead>
                                    <tr>
                                        <th>C/C Holder &amp; Bank</th>
                                        <th class="text-center">Mobile No.</th>
                                        <th class="text-center">Co. Address</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${pendingUpdateRows.length ? pendingUpdateRows.map(r => `
                                        <tr>
                                            <td><strong>${esc(r.holder)}</strong> <small class="gr-last4">(${esc(r.bank)} *${esc(r.last4)})</small></td>
                                            <td class="text-center">${r.missingPhone ? '<span class="gr-urg-pill urg-over">Pending</span>' : '<span class="gr-urg-pill urg-ok">OK</span>'}</td>
                                            <td class="text-center">${r.missingAddress ? '<span class="gr-urg-pill urg-over">Pending</span>' : '<span class="gr-urg-pill urg-ok">OK</span>'}</td>
                                        </tr>
                                    `).join('') : `<tr><td colspan="3" class="text-center gr-empty-ok"><i class="fas fa-check-circle"></i> All cards have updated Mobile No. &amp; Address!</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                <!-- Poster Footer -->
                <footer class="gr-poster-footer">
                    <span><i class="fas fa-lock"></i> Gretex Group CCMS Enterprise &bull; Confidential Management Brief</span>
                    <span>Snapshot: ${esc(generatedAt)}</span>
                </footer>
            </div>
        `;

        if (this.viewMode === 'charts') {
            this._renderComboCharts({ nameRows, bankRows, payableRows, totalLimit, totalUsed, totalAvail });
        }

        if (this.singleWindow && !this._escBound) {
            this._escBound = true;
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.singleWindow) {
                    this.toggleSingleWindow(false);
                }
            });
        }
    },

    _renderComboCharts: function({ nameRows, bankRows, payableRows }) {
        if (!window.Chart) return;
        this._charts.forEach(c => { try { c.destroy(); } catch (e) {} });
        this._charts = [];

        const isDark = document.documentElement.dataset.theme === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#1e293b';
        const mutedColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.06)';
        const sliceBorder = isDark ? '#0f172a' : '#ffffff';
        const fmtShort = (v) => window.Utils.formatCurrency(v).replace('.00', '');
        const fmtFull = (v) => window.Utils.formatCurrency(v);
        const fmtCompact = (v) => {
            const n = Number(v || 0);
            if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
            if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
            if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
            return `₹${Math.round(n)}`;
        };

        // 1. Namewise: Next-Gen Gradient Horizontal Capsule Bars + Direct Inline Value/Util% Labels
        const nameCanvas = document.getElementById('gr-chart-namewise');
        if (nameCanvas && nameRows.length) {
            const nCtx = nameCanvas.getContext('2d');
            const w = nameCanvas.parentElement?.clientWidth || 420;
            const mkGrad = (c1, c2) => {
                const g = nCtx.createLinearGradient(0, 0, w, 0);
                g.addColorStop(0, c1);
                g.addColorStop(1, c2);
                return g;
            };

            const nameBarLabelsPlugin = {
                id: 'grNameBarLabels',
                afterDatasetsDraw(chart) {
                    const { ctx } = chart;
                    const limitMeta = chart.getDatasetMeta(1); // end of stacked limit (Used + Avail)
                    const expMeta = chart.getDatasetMeta(2);   // Expenses bar
                    ctx.save();
                    ctx.font = '700 10px Inter, system-ui, sans-serif';
                    ctx.textBaseline = 'middle';
                    nameRows.forEach((row, i) => {
                        const limEl = limitMeta?.data?.[i];
                        if (limEl) {
                            const utilPct = row.limit > 0 ? Math.round((row.used / row.limit) * 100) : 0;
                            ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
                            ctx.fillText(`${fmtCompact(row.limit)} (${utilPct}% used)`, limEl.x + 6, limEl.y);
                        }
                        const expEl = expMeta?.data?.[i];
                        if (expEl && row.exp > 0) {
                            ctx.fillStyle = isDark ? '#a5b4fc' : '#4f46e5';
                            ctx.fillText(fmtCompact(row.exp), expEl.x + 6, expEl.y);
                        }
                    });
                    ctx.restore();
                }
            };

            this._charts.push(new window.Chart(nameCanvas, {
                type: 'bar',
                plugins: [nameBarLabelsPlugin],
                data: {
                    labels: nameRows.map(r => r.name.split(' ')[0]),
                    datasets: [
                        {
                            label: 'Used Limit',
                            data: nameRows.map(r => r.used),
                            backgroundColor: mkGrad('#e11d48', '#fb7185'),
                            borderRadius: 6,
                            borderSkipped: false,
                            barPercentage: 0.72,
                            categoryPercentage: 0.78,
                            stack: 'limit'
                        },
                        {
                            label: 'Available',
                            data: nameRows.map(r => r.avail),
                            backgroundColor: mkGrad('#059669', '#34d399'),
                            borderRadius: 6,
                            borderSkipped: false,
                            barPercentage: 0.72,
                            categoryPercentage: 0.78,
                            stack: 'limit'
                        },
                        {
                            label: 'Expenses',
                            data: nameRows.map(r => r.exp),
                            backgroundColor: mkGrad('#4f46e5', '#a855f7'),
                            borderRadius: 6,
                            borderSkipped: false,
                            barPercentage: 0.72,
                            categoryPercentage: 0.78,
                            stack: 'expense'
                        }
                    ]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { right: 86 } },
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'top', labels: { color: textColor, boxWidth: 10, padding: 10, font: { weight: '600', size: 10.5 } } },
                        tooltip: {
                            callbacks: {
                                title: (items) => nameRows[items[0]?.dataIndex]?.name || '',
                                afterBody: (items) => {
                                    const row = nameRows[items[0]?.dataIndex];
                                    if (!row) return '';
                                    return [
                                        `Cards: ${row.count}`,
                                        `Total Limit: ${fmtFull(row.limit)}`,
                                        `Reward Points: ${row.rewards.toLocaleString('en-IN')}`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: { stacked: true, beginAtZero: true, grid: { color: gridColor }, ticks: { color: mutedColor, callback: fmtCompact, font: { size: 10 } } },
                        y: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { weight: '700', size: 11 } } }
                    }
                }
            }));
        }

        // 2. Bankwise: Next-Gen 3-Layer Concentric Doughnut with Direct Ring Callout Pointers & Slice Labels
        const bankCanvas = document.getElementById('gr-chart-bankwise');
        if (bankCanvas && bankRows.length) {
            const palette = [
                [99, 102, 241],  // Indigo
                [6, 182, 212],   // Cyan
                [16, 185, 129],  // Emerald
                [245, 158, 11],  // Amber
                [244, 63, 94],   // Rose
                [139, 92, 246],  // Violet
                [59, 130, 246],  // Blue
                [236, 72, 153],  // Pink
                [20, 184, 166]   // Teal
            ];
            const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
            const totalBankLimit = bankRows.reduce((s, r) => s + r.limit, 0) || 1;
            const totalBankUsed = bankRows.reduce((s, r) => s + r.used, 0) || 1;
            const totalBankExp = bankRows.reduce((s, r) => s + r.exp, 0) || 1;

            const bankCalloutPlugin = {
                id: 'grBankCallouts',
                afterDraw(chart) {
                    const outerMeta = chart.getDatasetMeta(0);
                    const midMeta = chart.getDatasetMeta(1);
                    const innerMeta = chart.getDatasetMeta(2);
                    if (!outerMeta?.data?.[0] || !midMeta?.data?.[0] || !innerMeta?.data?.[0]) return;

                    const { ctx } = chart;
                    const cx = outerMeta.data[0].x;
                    const cy = outerMeta.data[0].y;
                    ctx.save();

                    // 1) Center KPI inside inner cutout
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = mutedColor;
                    ctx.font = '700 9.5px Inter, system-ui, sans-serif';
                    ctx.fillText(`${bankRows.length} BANKS`, cx, cy - 8);
                    ctx.fillStyle = textColor;
                    ctx.font = '800 11.5px Inter, system-ui, sans-serif';
                    ctx.fillText(fmtCompact(totalBankLimit), cx, cy + 7);

                    // 2) Direct % labels on major outer slices (no hover needed)
                    outerMeta.data.forEach((arc, i) => {
                        const angle = arc.endAngle - arc.startAngle;
                        if (angle < 0.34) return;
                        const midAngle = (arc.startAngle + arc.endAngle) / 2;
                        const r = (arc.innerRadius + arc.outerRadius) / 2;
                        const lx = cx + Math.cos(midAngle) * r;
                        const ly = cy + Math.sin(midAngle) * r;
                        const pct = Math.round((bankRows[i].limit / totalBankLimit) * 100);
                        ctx.fillStyle = '#ffffff';
                        ctx.font = '700 9.5px Inter, system-ui, sans-serif';
                        ctx.fillText(`${pct}%`, lx, ly);
                    });

                    // 3) Crystal-clear Ring Callout Pointers on top-left so each layer is unmistakable
                    const rings = [
                        { arc: outerMeta.data[0], label: '1. LIMIT', angle: -Math.PI * 0.78, lx: cx - outerMeta.data[0].outerRadius - 12, ly: cy - outerMeta.data[0].outerRadius + 6, color: '#6366f1' },
                        { arc: midMeta.data[0], label: '2. USED', angle: -Math.PI * 0.62, lx: cx - outerMeta.data[0].outerRadius - 12, ly: cy - outerMeta.data[0].outerRadius + 24, color: '#f43f5e' },
                        { arc: innerMeta.data[0], label: '3. EXP', angle: -Math.PI * 0.48, lx: cx - outerMeta.data[0].outerRadius - 12, ly: cy - outerMeta.data[0].outerRadius + 42, color: '#10b981' }
                    ];

                    rings.forEach((rg) => {
                        const midR = (rg.arc.innerRadius + rg.arc.outerRadius) / 2;
                        const px = cx + Math.cos(rg.angle) * midR;
                        const py = cy + Math.sin(rg.angle) * midR;
                        const labelX = Math.max(8, rg.lx);
                        const labelY = Math.max(14, rg.ly);

                        // Pointer line + dot on exact ring
                        ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.55)' : 'rgba(30, 41, 59, 0.45)';
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        ctx.moveTo(labelX + 46, labelY);
                        ctx.lineTo(px, py);
                        ctx.stroke();

                        ctx.fillStyle = rg.color;
                        ctx.beginPath();
                        ctx.arc(px, py, 3, 0, Math.PI * 2);
                        ctx.fill();

                        // Pill badge for ring name
                        ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)';
                        ctx.strokeStyle = rg.color;
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        if (ctx.roundRect) {
                            ctx.roundRect(labelX, labelY - 8, 48, 16, 4);
                        } else {
                            ctx.rect(labelX, labelY - 8, 48, 16);
                        }
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = textColor;
                        ctx.font = '700 8.5px Inter, system-ui, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(rg.label, labelX + 24, labelY + 0.5);
                    });

                    ctx.restore();
                }
            };

            this._charts.push(new window.Chart(bankCanvas, {
                type: 'doughnut',
                plugins: [bankCalloutPlugin],
                data: {
                    labels: bankRows.map(r => `${r.bank} (${r.count})`),
                    datasets: [
                        {
                            label: '1. Total Limit',
                            data: bankRows.map(r => r.limit),
                            backgroundColor: bankRows.map((_, i) => rgba(palette[i % palette.length], 0.96)),
                            borderColor: sliceBorder,
                            borderWidth: 2,
                            hoverOffset: 6
                        },
                        {
                            label: '2. Used Limit',
                            data: bankRows.map(r => r.used),
                            backgroundColor: bankRows.map((_, i) => rgba(palette[i % palette.length], 0.68)),
                            borderColor: sliceBorder,
                            borderWidth: 2,
                            hoverOffset: 4
                        },
                        {
                            label: '3. Expenses',
                            data: bankRows.map(r => r.exp),
                            backgroundColor: bankRows.map((_, i) => rgba(palette[i % palette.length], 0.40)),
                            borderColor: sliceBorder,
                            borderWidth: 2,
                            hoverOffset: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '34%',
                    layout: { padding: { left: 46, top: 6, bottom: 4, right: 4 } },
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color: textColor, boxWidth: 10, padding: 7, font: { weight: '600', size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                title: (items) => {
                                    const row = bankRows[items[0]?.dataIndex];
                                    return row ? `${row.bank} (${row.count} Cards)` : '';
                                },
                                label: (ctx) => {
                                    const totals = [totalBankLimit, totalBankUsed, totalBankExp];
                                    const val = Number(ctx.raw || 0);
                                    const pct = ((val / (totals[ctx.datasetIndex] || 1)) * 100).toFixed(1);
                                    return ` ${ctx.dataset.label}: ${fmtFull(val)} (${pct}%)`;
                                },
                                afterLabel: (ctx) => {
                                    const row = bankRows[ctx.dataIndex];
                                    return [
                                        ` ── Bank Summary ──`,
                                        ` Total Limit: ${fmtFull(row.limit)}`,
                                        ` Used Limit: ${fmtFull(row.used)}`,
                                        ` Available: ${fmtFull(row.avail)}`,
                                        ` Expenses: ${fmtFull(row.exp)}`
                                    ];
                                }
                            }
                        }
                    }
                }
            }));
        }

        // 3. Payable Summary: Next-Gen Glowing Neon Area + Gradient Urgency Bars + Direct Amount Labels
        const payCanvas = document.getElementById('gr-chart-payable');
        if (payCanvas && payableRows.length) {
            const pCtx = payCanvas.getContext('2d');
            const h = payCanvas.parentElement?.clientHeight || 240;
            const areaGrad = pCtx.createLinearGradient(0, 0, 0, h);
            areaGrad.addColorStop(0, isDark ? 'rgba(56, 189, 248, 0.36)' : 'rgba(14, 165, 233, 0.28)');
            areaGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

            const mkBarGrad = (topColor, botColor) => {
                const g = pCtx.createLinearGradient(0, 0, 0, h);
                g.addColorStop(0, topColor);
                g.addColorStop(1, botColor);
                return g;
            };

            const barColors = payableRows.map(r => {
                if (r.urg.cls === 'urg-over') return mkBarGrad('rgba(244, 63, 94, 0.95)', 'rgba(225, 29, 72, 0.35)');
                if (r.urg.cls === 'urg-soon') return mkBarGrad('rgba(249, 115, 22, 0.95)', 'rgba(234, 88, 12, 0.35)');
                if (r.urg.cls === 'urg-4to7') return mkBarGrad('rgba(245, 158, 11, 0.95)', 'rgba(217, 119, 6, 0.35)');
                if (r.urg.cls === 'urg-8to15') return mkBarGrad('rgba(59, 130, 246, 0.95)', 'rgba(37, 99, 235, 0.35)');
                return mkBarGrad('rgba(16, 185, 129, 0.95)', 'rgba(5, 150, 105, 0.35)');
            });

            const payLabelPlugin = {
                id: 'grPayBarLabels',
                afterDatasetsDraw(chart) {
                    const meta = chart.getDatasetMeta(0);
                    if (!meta?.data) return;
                    const { ctx } = chart;
                    ctx.save();
                    ctx.font = '700 8.5px Inter, system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    meta.data.forEach((bar, i) => {
                        const val = payableRows[i]?.amountDue || 0;
                        if (val >= 75000) {
                            ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
                            ctx.fillText(fmtCompact(val), bar.x, bar.y - 3);
                        }
                    });
                    ctx.restore();
                }
            };

            this._charts.push(new window.Chart(payCanvas, {
                type: 'bar',
                plugins: [payLabelPlugin],
                data: {
                    labels: payableRows.map(r => `${r.holder.split(' ')[0]} (${r.bank})`),
                    datasets: [
                        {
                            label: 'Amount Due (₹)',
                            data: payableRows.map(r => r.amountDue),
                            backgroundColor: barColors,
                            borderRadius: { topLeft: 6, topRight: 6 },
                            yAxisID: 'y',
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Days Until Due',
                            data: payableRows.map(r => r.diffDays ?? 0),
                            borderColor: isDark ? '#38bdf8' : '#0284c7',
                            backgroundColor: areaGrad,
                            fill: true,
                            borderWidth: 2.5,
                            pointRadius: 3.5,
                            pointHoverRadius: 6,
                            pointBackgroundColor: isDark ? '#0f172a' : '#ffffff',
                            pointBorderColor: isDark ? '#38bdf8' : '#0284c7',
                            pointBorderWidth: 2,
                            tension: 0.38,
                            yAxisID: 'y1',
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { position: 'top', labels: { color: textColor, boxWidth: 10, font: { weight: '600', size: 10.5 } } } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: mutedColor, callback: fmtCompact, font: { size: 10 } } },
                        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: isDark ? '#38bdf8' : '#0284c7', callback: (v) => `${v}d`, font: { size: 10 } } },
                        x: { grid: { display: false }, ticks: { color: mutedColor, maxRotation: 35, font: { size: 9.5, weight: '600' } } }
                    }
                }
            }));
        }
    },

    updateFromDate: function(val) {
        this.expenseFromDate = val || '2024-04-01';
        this.render(this.container);
    },

    _captureCanvas: async function() {
        const el = document.getElementById('gr-capture-sheet');
        if (!el || !window.html2canvas) {
            throw new Error('html2canvas library or report container not available');
        }
        const isDark = document.documentElement.dataset.theme === 'dark';
        // Temporarily expand scrollable inner tables so the JPG captures every row cleanly
        const scrollBoxes = el.querySelectorAll('.gr-table-wrap');
        const prevStyles = [];
        scrollBoxes.forEach(box => {
            prevStyles.push({ maxHeight: box.style.maxHeight, overflowY: box.style.overflowY });
            box.style.maxHeight = 'none';
            box.style.overflowY = 'visible';
        });

        try {
            return await window.html2canvas(el, {
                scale: 2,
                useCORS: true,
                backgroundColor: isDark ? '#070b14' : '#f1f5f9',
                logging: false,
                windowWidth: Math.max(el.scrollWidth, 1200)
            });
        } finally {
            scrollBoxes.forEach((box, idx) => {
                box.style.maxHeight = prevStyles[idx].maxHeight;
                box.style.overflowY = prevStyles[idx].overflowY;
            });
        }
    },

    downloadJpg: async function() {
        const btn = document.getElementById('gr-btn-download');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating JPG...';
        }
        try {
            const canvas = await this._captureCanvas();
            const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = dataUrl;
            a.download = `Gretex_Group_CC_Report_${dateStr}.jpg`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            if (window.App) window.App.showToast('Group Report JPG downloaded! Ready to share.', 'success');
        } catch (err) {
            console.error('JPG export failed:', err);
            if (window.App) window.App.showToast('JPG Export failed: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    },

    copyJpgToClipboard: async function() {
        const btn = document.getElementById('gr-btn-copy');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copying...';
        }
        try {
            const canvas = await this._captureCanvas();
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (navigator.clipboard && window.ClipboardItem && blob) {
                await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
                if (window.App) window.App.showToast('Report image copied! Paste directly into WhatsApp/Group.', 'success');
            } else {
                if (window.App) window.App.showToast('Clipboard image not supported in this browser; use Download JPG.', 'warning');
            }
        } catch (err) {
            if (window.App) window.App.showToast('Copy failed: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    },

    copyWhatsAppBrief: async function() {
        const cards = window.DB.cards.getAll() || [];
        const txns = window.DB.transactions.getAll() || [];
        const stmts = window.DB.statements.getAll() || [];
        const fromDateObj = new Date(this.expenseFromDate || '2024-04-01');
        fromDateObj.setHours(0, 0, 0, 0);

        let totalLimit = 0, totalUsed = 0, totalExp = 0;
        cards.forEach(c => {
            const m = window.DB.cards.getCardLimitMetrics ? window.DB.cards.getCardLimitMetrics(c.card_id) : { used: 0 };
            totalLimit += window.Utils.parseNum(c.credit_limit) || 0;
            totalUsed += window.Utils.parseNum(m.used) || 0;
            totalExp += txns.filter(t => String(t.card_id) === String(c.card_id) && t.txn_type === 'Debit' && t.txn_date && new Date(t.txn_date) >= fromDateObj)
                .reduce((s, t) => s + (window.Utils.parseNum(t.amount) || 0), 0);
        });
        const totalAvail = Math.max(0, totalLimit - totalUsed);
        const unpaid = stmts.filter(s => s.payment_status !== 'Paid' && (window.Utils.parseNum(s.closing_outstanding) || 0) > 0);
        const totalPayable = unpaid.reduce((s, x) => s + (window.Utils.parseNum(x.closing_outstanding) || 0), 0);

        const fmt = (n) => window.Utils.formatCurrency(n);
        const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const text = [
            `*GRETEX GROUP — DAILY C/C TREASURY BRIEF (${todayStr})*`,
            `• *Total Limit:* ${fmt(totalLimit)} (${cards.length} Cards)`,
            `• *Limit Used:* ${fmt(totalUsed)} (${totalLimit > 0 ? ((totalUsed / totalLimit) * 100).toFixed(1) : '0.0'}%)`,
            `• *Balance Available:* ${fmt(totalAvail)}`,
            `• *Expenses (from ${window.Utils.formatDate(this.expenseFromDate)}):* ${fmt(totalExp)}`,
            `• *Pending Payables:* ${fmt(totalPayable)} (${unpaid.length} Statements)`,
            `_Detailed visual report attached as JPG._`
        ].join('\n');

        try {
            await navigator.clipboard.writeText(text);
            if (window.App) window.App.showToast('WhatsApp summary copied to clipboard!', 'success');
        } catch (err) {
            if (window.App) window.App.showToast('Could not copy text: ' + err.message, 'error');
        }
    }
};

// ============================================================
// GroupReport — Executive Daily Group Report & JPG Exporter
// Built for Management Circulation (WhatsApp / Email / Teams)
// ============================================================

window.GroupReport = {
    expenseFromDate: '2024-04-01',

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
                    <div class="gr-date-wrap">
                        <label for="gr-from-date">Expenses From:</label>
                        <input type="date" id="gr-from-date" class="form-control form-control-sm" value="${esc(this.expenseFromDate)}" onchange="window.GroupReport.updateFromDate(this.value)">
                    </div>
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
            <div id="gr-capture-sheet" class="gr-poster">
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
                    <div class="gr-table-wrap">
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
                        </table>
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
                    <div class="gr-table-wrap">
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
                        </table>
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
                    <div class="gr-table-wrap">
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
                        </table>
                    </div>
                </section>

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

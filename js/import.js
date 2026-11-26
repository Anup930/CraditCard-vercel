window.Import = {
    currentStep: 1,
    fileData: null,
    fileHeaders: [],
    uploadedFile: null,
    mappedData: null,
    validRecords: [],
    errorRecords: [],

    render: function(container) {
        this.container = container;
        this.currentStep = 1;
        this.fileData = null;
        this.fileHeaders = [];
        this.uploadedFile = null;
        this.mappedData = null;

        const batches = window.DB.importBatches.getAll() || [];
        const totalImported = batches.reduce((s, b) => s + (parseInt(b.valid_records ?? b.total_records ?? b.record_count ?? 0) || 0), 0);
        const mappedCardsCount = (window.DB.cards.getAll() || []).filter(c => c.zoho_ledger_name).length;

        this.container.innerHTML = `
            <div class="zi-header-banner mb-4">
                <div>
                    <div class="zi-eyebrow"><i class="fas fa-bolt"></i> AUTOMATED LEDGER PIPELINE</div>
                    <h2 class="zi-title">Zoho Import Studio</h2>
                    <p class="zi-subtitle">Upload, auto-map, validate &amp; reconcile Excel/CSV statements in seconds</p>
                </div>
                <div class="zi-stat-pills">
                    <div class="zi-stat-pill">
                        <span class="zi-stat-num">${batches.length}</span>
                        <span class="zi-stat-lbl">Batches</span>
                    </div>
                    <div class="zi-stat-pill">
                        <span class="zi-stat-num">${totalImported.toLocaleString('en-IN')}</span>
                        <span class="zi-stat-lbl">Txns Imported</span>
                    </div>
                    <div class="zi-stat-pill">
                        <span class="zi-stat-num">${mappedCardsCount}</span>
                        <span class="zi-stat-lbl">Mapped Cards</span>
                    </div>
                </div>
            </div>

            <div class="zi-stepper card mb-4">
                <div class="zi-step active" id="step1-tab">
                    <span class="zi-step-num">1</span>
                    <div class="zi-step-meta">
                        <span class="zi-step-title">Upload File</span>
                        <span class="zi-step-sub">XLSX, XLS, CSV</span>
                    </div>
                </div>
                <div class="zi-step-line"></div>
                <div class="zi-step" id="step2-tab">
                    <span class="zi-step-num">2</span>
                    <div class="zi-step-meta">
                        <span class="zi-step-title">Map &amp; Preview</span>
                        <span class="zi-step-sub">Auto-detect columns</span>
                    </div>
                </div>
                <div class="zi-step-line"></div>
                <div class="zi-step" id="step3-tab">
                    <span class="zi-step-num">3</span>
                    <div class="zi-step-meta">
                        <span class="zi-step-title">Validate</span>
                        <span class="zi-step-sub">Ledger &amp; date check</span>
                    </div>
                </div>
                <div class="zi-step-line"></div>
                <div class="zi-step" id="step4-tab">
                    <span class="zi-step-num">4</span>
                    <div class="zi-step-meta">
                        <span class="zi-step-title">Import</span>
                        <span class="zi-step-sub">Commit to DB</span>
                    </div>
                </div>
            </div>

            <div class="card zi-wizard-card mb-4" id="wizard-content"></div>

            <div class="data-table-wrapper card mt-4">
                <div class="zi-history-header">
                    <div>
                        <h3 class="zi-history-title"><i class="fas fa-history"></i> Import History</h3>
                        <span class="zi-history-sub">Audit trail of all Zoho ledger batches</span>
                    </div>
                    <span class="vivid-pill pill-cat-primary">${batches.length} Batches</span>
                </div>
                <div id="import-history"></div>
            </div>
        `;

        this.renderStep();
        this.renderHistory();
    },

    renderStep: function() {
        const content = document.getElementById('wizard-content');

        // Update Stepper Tabs
        [1, 2, 3, 4].forEach(i => {
            const tab = document.getElementById(`step${i}-tab`);
            if (!tab) return;
            tab.classList.remove('active', 'completed');
            const numEl = tab.querySelector('.zi-step-num');
            if (i < this.currentStep) {
                tab.classList.add('completed');
                if (numEl) numEl.innerHTML = '<i class="fas fa-check"></i>';
            } else if (i === this.currentStep) {
                tab.classList.add('active');
                if (numEl) numEl.textContent = String(i);
            } else {
                if (numEl) numEl.textContent = String(i);
            }
        });

        if (this.currentStep === 1) {
            content.innerHTML = `
                <div class="zi-dropzone" id="drop-zone">
                    <div class="zi-upload-orb">
                        <i class="fas fa-cloud-upload-alt"></i>
                    </div>
                    <h3 class="zi-drop-title">Drag &amp; drop your Zoho ledger file here</h3>
                    <p class="zi-drop-sub">Supports <strong>.xlsx</strong>, <strong>.xls</strong>, and <strong>.csv</strong> spreadsheets</p>

                    <div class="zi-req-box">
                        <span class="zi-req-label"><i class="fas fa-check-double"></i> Required Columns:</span>
                        <div class="zi-req-chips">
                            <span class="zi-chip">Date</span>
                            <span class="zi-chip">Statement Month (YYYY-MM)</span>
                            <span class="zi-chip">Ledger Name</span>
                            <span class="zi-chip">Amount</span>
                        </div>
                    </div>

                    <div class="zi-drop-actions">
                        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none;">
                        <button type="button" class="btn btn-primary zi-btn-browse" onclick="document.getElementById('file-input').click()">
                            <i class="fas fa-folder-open"></i> Browse Files
                        </button>
                        <button type="button" class="btn btn-outline zi-btn-template" onclick="window.Import.downloadTemplate()">
                            <i class="fas fa-file-excel text-success"></i> Download Template (.xlsx)
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('file-input').addEventListener('change', (e) => this.handleFileUpload(e.target.files[0]));
            const dropZone = document.getElementById('drop-zone');
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('is-dragover'); });
            dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('is-dragover'); });
            dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('is-dragover'); this.handleFileUpload(e.dataTransfer.files[0]); });
        }
        else if (this.currentStep === 2) {
            if(!this.fileData || this.fileData.length === 0) return this.prevStep();

            const headers = (this.fileHeaders && this.fileHeaders.length > 0) ? this.fileHeaders : Object.keys(this.fileData[0]);
            const fileName = this.uploadedFile ? window.Utils.escapeHtml(this.uploadedFile.name) : 'Uploaded Sheet';

            content.innerHTML = `
                <div class="zi-step2-head">
                    <div>
                        <h4 class="mb-1" style="font-weight:800;color:#0f172a;">Map Spreadsheet Columns</h4>
                        <p class="text-muted mb-0" style="font-size:0.85rem;">File: <strong>${fileName}</strong> &bull; ${this.fileData.length} rows detected</p>
                    </div>
                    <span class="vivid-pill pill-status-active"><span class="pill-dot"></span>Auto-Mapper Active</span>
                </div>

                <div class="zi-map-grid">
                    <div class="cf-section cf-sec-indigo">
                        <div class="cf-sec-title"><i class="fas fa-asterisk"></i> Required Core Fields</div>
                        <div class="cf-field mb-3">
                            <label for="map_date">Date Column <span class="cf-req">*</span></label>
                            <select class="form-select" id="map_date">${this.getOptions(headers, 'date')}</select>
                        </div>

                        <div class="zi-stmt-highlight mb-3">
                            <label for="map_stmt_month"><i class="fas fa-calendar-alt"></i> Statement Month Column <span class="cf-req">*</span></label>
                            <select class="form-select" id="map_stmt_month">
                                <option value="">-- Select Statement Month Column --</option>
                                ${this.getOptions(headers, 'statement.*month|stmt.*month|billing.*month|statement_month|statemen|statement|month')}
                            </select>
                            <div class="zi-stmt-or">
                                <span>Or set Fixed Month for entire batch:</span>
                                <input type="month" class="form-control" id="fixed_stmt_month">
                            </div>
                        </div>

                        <div class="cf-field mb-3">
                            <label for="map_ledger">Ledger / Account Column <span class="cf-req">*</span></label>
                            <select class="form-select" id="map_ledger">${this.getOptions(headers, 'ledger|account|name')}</select>
                        </div>

                        <div class="cf-field">
                            <label for="map_amount">Amount Column <span class="cf-req">*</span></label>
                            <select class="form-select" id="map_amount">${this.getOptions(headers, 'amount')}</select>
                        </div>
                    </div>

                    <div class="cf-section cf-sec-purple">
                        <div class="cf-sec-title"><i class="fas fa-sliders-h"></i> Optional &amp; Split Columns</div>
                        <div class="cf-field mb-3">
                            <label for="map_desc">Description / Narration</label>
                            <select class="form-select" id="map_desc">${this.getOptions(headers, 'desc|detail|narration')}</select>
                        </div>
                        <div class="cf-field mb-3">
                            <label for="map_type">Transaction Type (Debit/Credit)</label>
                            <select class="form-select" id="map_type"><option value="">-- Auto Detect from Amount --</option>${this.getOptions(headers, 'type|cr/dr')}</select>
                        </div>
                        <div class="cf-field mb-3">
                            <label for="map_debit">Debit Column (Alternative)</label>
                            <select class="form-select" id="map_debit"><option value="">-- None --</option>${this.getOptions(headers, 'debit|dr')}</select>
                        </div>
                        <div class="cf-field">
                            <label for="map_credit">Credit Column (Alternative)</label>
                            <select class="form-select" id="map_credit"><option value="">-- None --</option>${this.getOptions(headers, 'credit|cr')}</select>
                        </div>
                    </div>
                </div>

                <div class="zi-preview-wrap">
                    <div class="zi-preview-label"><i class="fas fa-table"></i> Raw Data Preview (First 5 rows)</div>
                    <div class="master-table-scroll" style="max-height: 240px;">
                        <table class="data-table master-colorful-table table w-100 mb-0">
                            <thead><tr>${headers.map(h => `<th>${window.Utils.escapeHtml(h)}</th>`).join('')}</tr></thead>
                            <tbody>
                                ${this.fileData.slice(0, 5).map(row => `<tr>${headers.map(h => `<td>${window.Utils.escapeHtml(String(row[h] || ''))}</td>`).join('')}</tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="cf-form-footer" style="margin-top: 18px;">
                    <button type="button" class="btn btn-secondary" onclick="window.Import.prevStep()" style="border-radius:10px;">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <button type="button" class="btn btn-primary cf-submit-btn" onclick="window.Import.processMapping()">
                        Next: Validate Records <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            `;
        }
        else if (this.currentStep === 3) {
            content.innerHTML = `
                <h4 class="mb-3" style="font-weight:800;color:#0f172a;">Validation Results</h4>
                <div class="zi-val-kpis mb-4">
                    <div class="zi-val-card val-total">
                        <div class="zi-val-num">${this.mappedData.length}</div>
                        <div class="zi-val-lbl">Total Records</div>
                    </div>
                    <div class="zi-val-card val-ok">
                        <div class="zi-val-num">${this.validRecords.length}</div>
                        <div class="zi-val-lbl">Valid &amp; Ready</div>
                    </div>
                    <div class="zi-val-card val-err">
                        <div class="zi-val-num">${this.errorRecords.length}</div>
                        <div class="zi-val-lbl">Errors / Unmapped</div>
                    </div>
                </div>

                ${this.errorRecords.length > 0 ? `
                <div class="zi-alert zi-alert-warn mb-3">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span><strong>${this.errorRecords.length} records</strong> have missing fields or unmapped ledgers and will be skipped.</span>
                </div>
                ` : `
                <div class="zi-alert zi-alert-ok mb-3">
                    <i class="fas fa-check-circle"></i>
                    <span>All <strong>${this.validRecords.length} records</strong> passed validation and are ready to import!</span>
                </div>`}

                <div class="master-table-scroll" style="max-height: 400px;">
                    <table class="data-table master-colorful-table table w-100 mb-0">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Stmt Month</th>
                                <th>Ledger</th>
                                <th>Mapped Card</th>
                                <th>Description</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.mappedData.map(row => {
                                const isValid = row._isValid;
                                return `
                                <tr class="${isValid ? 'row-primary' : 'row-addon'}" style="--row-accent: ${isValid ? '#10b981' : '#ef4444'};">
                                    <td>${window.Utils.formatDate(row.txn_date)}</td>
                                    <td><span class="vivid-pill ${row.statement_month ? 'pill-cat-primary' : 'pill-cat-addon'}">${row.statement_month ? window.Utils.formatMonthYear(row.statement_month) : 'Auto (Date)'}</span></td>
                                    <td><span class="ledger-pill">${window.Utils.escapeHtml(row.zoho_ledger || '')}</span></td>
                                    <td>${row.card_id ? '<span class="vivid-pill pill-status-active"><span class="pill-dot"></span>Matched</span>' : '<span class="vivid-pill pill-status-blocked"><span class="pill-dot"></span>No Match</span>'}</td>
                                    <td>${window.Utils.escapeHtml(row.description || '')}</td>
                                    <td><span class="vivid-pill ${row.txn_type === 'Credit' ? 'pill-status-active' : 'pill-cat-addon'}">${row.txn_type}</span></td>
                                    <td><strong>${window.Utils.formatCurrency(row.amount)}</strong></td>
                                    <td>${isValid ? '<span class="vivid-pill pill-status-active">Valid</span>' : `<span class="vivid-pill pill-status-blocked">${window.Utils.escapeHtml(row._errorMsg)}</span>`}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="cf-form-footer" style="margin-top: 18px;">
                    <button type="button" class="btn btn-secondary" onclick="window.Import.prevStep()" style="border-radius:10px;">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <button type="button" class="btn btn-success zi-commit-btn" onclick="window.Import.commitImport()" ${this.validRecords.length === 0 ? 'disabled' : ''}>
                        <i class="fas fa-cloud-upload-alt"></i> Import ${this.validRecords.length} Valid Records
                    </button>
                </div>
            `;
        }
        else if (this.currentStep === 4) {
            content.innerHTML = `
                <div class="zi-success-screen">
                    <div class="zi-success-icon"><i class="fas fa-check"></i></div>
                    <h2>Import Successful!</h2>
                    <p>Successfully imported <strong>${this.validRecords.length} transactions</strong> into CCMS &amp; synced to cloud.</p>
                    <div class="zi-drop-actions">
                        <button type="button" class="btn btn-primary cf-submit-btn" onclick="window.Import.render(window.Import.container)">
                            <i class="fas fa-plus"></i> Start New Import
                        </button>
                        <button type="button" class="btn btn-outline zi-btn-template" onclick="window.App?.navigate('transactions')">
                            <i class="fas fa-exchange-alt"></i> View Transactions
                        </button>
                    </div>
                </div>
            `;
            this.renderHistory();
        }
    },

    getOptions: function(headers, matchStr) {
        let options = '';
        const regex = new RegExp(matchStr, 'i');
        let matched = false;
        headers.forEach(h => {
            const isMatch = !matched && regex.test(h);
            if(isMatch) matched = true;
            options += `<option value="${h}" ${isMatch ? 'selected' : ''}>${h}</option>`;
        });
        return options;
    },

    handleFileUpload: function(file) {
        if(!file) return;
        this.uploadedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            if (window.XLSX) {
                const workbook = window.XLSX.read(data, {type: 'array'});
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                
                // 1. Extract Row 1 Column Headers directly from sheet AOA
                const aoa = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
                let headerRow = [];
                if (aoa && aoa.length > 0) {
                    headerRow = aoa[0].map(h => String(h || '').trim()).filter(Boolean);
                }

                // 2. Parse data with defval: '' so empty cells in row 2 (like Opening Balance row) are NOT dropped
                this.fileData = window.XLSX.utils.sheet_to_json(firstSheet, { raw: false, defval: '' });
                
                // 3. Collect all unique headers across header row and data rows
                const allKeys = new Set(headerRow);
                if (this.fileData && this.fileData.length > 0) {
                    this.fileData.forEach(row => {
                        Object.keys(row).forEach(k => {
                            const trimmed = String(k || '').trim();
                            if (trimmed && !trimmed.startsWith('__EMPTY')) {
                                allKeys.add(trimmed);
                            }
                        });
                    });
                }
                this.fileHeaders = Array.from(allKeys);
                
                if(this.fileData && this.fileData.length > 0) {
                    this.currentStep = 2;
                    this.renderStep();
                } else {
                    if(window.App && window.App.showToast) window.App.showToast("File is empty or invalid format", "error");
                }
            } else {
                alert("XLSX library not loaded");
            }
        };
        reader.readAsArrayBuffer(file);
    },

    processMapping: function() {
        const mDate = document.getElementById('map_date').value;
        const mStmtMonthEl = document.getElementById('map_stmt_month');
        const mStmtMonth = mStmtMonthEl ? mStmtMonthEl.value : '';
        const fixedStmtMonthEl = document.getElementById('fixed_stmt_month');
        const fixedStmtMonth = fixedStmtMonthEl ? fixedStmtMonthEl.value : '';
        const mLedger = document.getElementById('map_ledger').value;
        const mDesc = document.getElementById('map_desc').value;
        const mAmount = document.getElementById('map_amount').value;
        const mType = document.getElementById('map_type').value;
        const mDebit = document.getElementById('map_debit').value;
        const mCredit = document.getElementById('map_credit').value;

        if (!mStmtMonth && !fixedStmtMonth) {
            alert("⚠️ Statement Month is Required!\nPlease select the 'Statement Month Column' from your file, or specify a Fixed Statement Month for this import.");
            if (mStmtMonthEl) mStmtMonthEl.focus();
            return;
        }

        const allCards = window.DB.cards.getAll();
        const ledgerMap = {};
        allCards.forEach(c => {
            if(c.zoho_ledger_name) ledgerMap[c.zoho_ledger_name.trim().toLowerCase()] = c.card_id;
        });

        this.validRecords = [];
        this.errorRecords = [];
        this.mappedData = [];

        this.fileData.forEach((row, i) => {
            const ledgerName = (row[mLedger] || '').trim();
            const dateVal = row[mDate];
            let amount = 0;
            let type = '';

            if (mDebit && row[mDebit]) {
                amount = window.Utils.parseNum(row[mDebit]);
                type = 'Debit';
            } else if (mCredit && row[mCredit]) {
                amount = window.Utils.parseNum(row[mCredit]);
                type = 'Credit';
            } else {
                let rawAmt = window.Utils.parseNum(row[mAmount]);
                if (mType && row[mType]) {
                    type = String(row[mType]).toLowerCase().includes('cr') ? 'Credit' : 'Debit';
                    amount = Math.abs(rawAmt);
                } else {
                    // Auto detect from sign
                    amount = Math.abs(rawAmt);
                    type = rawAmt < 0 ? 'Credit' : 'Debit'; // Assuming negative is credit, change logic if needed
                }
            }

            const cardId = ledgerMap[ledgerName.toLowerCase()] || null;

            let parsedDate = null;
            if(dateVal) {
                let strVal = String(dateVal).trim();
                let m = strVal.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                let d = null;
                if (m) {
                    let p1 = parseInt(m[1], 10);
                    let p2 = parseInt(m[2], 10);
                    let yr = parseInt(m[3], 10);
                    if (p1 > 12) d = new Date(yr, p2 - 1, p1);
                    else if (p2 > 12) d = new Date(yr, p1 - 1, p2);
                    else d = new Date(yr, p2 - 1, p1); // Default to DD/MM/YYYY
                } else {
                    d = new Date(strVal);
                }
                if (d && !isNaN(d.getTime())) {
                    parsedDate = d.toISOString();
                }
            }

            let stmtMonth = null;
            if (mStmtMonth && row[mStmtMonth] && String(row[mStmtMonth]).trim() !== '') {
                stmtMonth = window.Utils.normalizeStatementMonth(row[mStmtMonth]);
            } else if (fixedStmtMonth) {
                stmtMonth = window.Utils.normalizeStatementMonth(fixedStmtMonth);
            }

            const record = {
                txn_date: parsedDate,
                statement_month: stmtMonth,
                zoho_ledger: ledgerName,
                description: row[mDesc] || '',
                amount: amount,
                txn_type: type,
                card_id: cardId,
                status: 'Imported'
            };

            // Validation
            let isValid = true;
            let errorMsg = [];
            if(!parsedDate) { isValid = false; errorMsg.push("Invalid Date"); }
            if(!stmtMonth) { isValid = false; errorMsg.push("Missing Statement Month"); }
            if(!ledgerName) { isValid = false; errorMsg.push("Missing Ledger"); }
            if(!cardId) { isValid = false; errorMsg.push("Unmapped Ledger"); }
            if(amount === 0 || isNaN(amount)) { isValid = false; errorMsg.push("Invalid Amount"); }

            record._isValid = isValid;
            record._errorMsg = errorMsg.join(', ');

            if(isValid) this.validRecords.push(record);
            else this.errorRecords.push(record);

            this.mappedData.push(record);
        });

        this.currentStep = 3;
        this.renderStep();
    },

    commitImport: async function() {
        if(this.validRecords.length === 0) return;

        const batchId = 'IMP-' + Date.now();
        
        // Clean temporary fields
        const cleanRecords = this.validRecords.map(r => {
            const copy = {...r};
            delete copy._isValid;
            delete copy._errorMsg;
            copy.category = 'Categorized'; // simple default
            return copy;
        });

        const importBtn = document.querySelector('button[onclick*="commitImport"]');
        if (importBtn) {
            importBtn.disabled = true;
            importBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Importing...';
        }

        try {
            await window.DB.transactions.addBatch(cleanRecords, batchId);
            
            await window.DB.importBatches.add({
                batch_id: batchId,
                file_name: this.uploadedFile ? this.uploadedFile.name : 'Zoho_Import.xlsx',
                import_date: new Date().toISOString(),
                record_count: cleanRecords.length,
                valid_records: cleanRecords.length,
                total_records: cleanRecords.length,
                status: 'Success'
            });

            this.currentStep = 4;
            this.renderStep();
            if (window.App && window.App.showToast) {
                window.App.showToast(`Successfully imported ${cleanRecords.length} transactions!`, 'success');
            }
        } catch (err) {
            console.error('Import commit error:', err);
            alert('Import encountered an error: ' + err.message);
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.innerText = `Import ${cleanRecords.length} Valid Records`;
            }
        }
    },

    renderHistory: function() {
        const historyContainer = document.getElementById('import-history');
        if(!historyContainer) return;

        const batches = window.DB.importBatches.getAll() || [];
        batches.sort((a,b) => new Date(b.import_date) - new Date(a.import_date));

        if(batches.length === 0) {
            historyContainer.innerHTML = '<div class="empty-state">No imports yet.</div>';
            return;
        }

        let html = `
            <div class="master-table-scroll" style="max-height: 440px;">
            <table class="table data-table master-colorful-table w-100 mb-0">
                <thead>
                    <tr>
                        <th>Batch ID</th>
                        <th>File Name</th>
                        <th>Import Date</th>
                        <th>Records Added</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        batches.forEach(b => {
            const count = b.valid_records !== undefined ? b.valid_records : (b.total_records !== undefined ? b.total_records : (b.record_count !== undefined ? b.record_count : 0));
            const st = b.status || 'Success';
            const ok = st.toLowerCase() === 'success';
            html += `
                <tr class="row-primary" style="--row-accent: ${ok ? '#10b981' : '#f59e0b'};">
                    <td><span class="card-num-pill">${window.Utils.escapeHtml(String(b.batch_id || ''))}</span></td>
                    <td><span class="ledger-pill"><i class="fas fa-file-excel" style="margin-right:5px;"></i>${window.Utils.escapeHtml(b.file_name || 'Zoho_Import.xlsx')}</span></td>
                    <td>${window.Utils.formatDate(b.import_date)}</td>
                    <td><span class="sr-pill">${count}</span></td>
                    <td><span class="vivid-pill ${ok ? 'pill-status-active' : 'pill-status-blocked'}"><span class="pill-dot"></span>${window.Utils.escapeHtml(st)}</span></td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        historyContainer.innerHTML = html;
    },

    prevStep: function() {
        if(this.currentStep > 1) {
            this.currentStep--;
            this.renderStep();
        }
    },

    downloadTemplate: function() {
        if (!window.XLSX) return alert("XLSX library not loaded");
        const headers = ["Date (YYYY-MM-DD)", "Statement Month (YYYY-MM)", "Ledger Name", "Description", "Type (Debit/Credit)", "Amount"];
        const sampleRows = [
            ["2026-08-16", "2026-09", "Alok ICICI Credit Card", "Food Expense", "Credit", 966.00],
            ["2026-08-16", "2026-09", "Alok ICICI Credit Card", "Partner's Current A/c- Alok Harlalka", "Credit", 6598.00],
            ["2026-08-14", "2026-08", "Alok ICICI Credit Card", "Yash Harlalka", "Credit", 414.35]
        ];
        const ws = window.XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Zoho_Template");
        window.XLSX.writeFile(wb, "Zoho_Import_Template.xlsx");
    }
};

// ============================================================
//  BANK BALANCE INTELLIGENCE APP (Completely Isolated from CC Views)
//  Reads DB/Bank Data/Book3.xlsx + Optional Google Sheet / Excel Upload
//  Views: Single Snap, Charts, Pivot Matrix, Full Table Register
// ============================================================

window.BankBalance = {
    _records: [],
    _meta: { importAt: '', updatedTill: '', source: 'DB/Bank Data/Book3.xlsx' },
    _view: 'snap', // 'snap' | 'charts' | 'pivot' | 'table'
    _pivotBy: 'gretex_report', // 'gretex_report' | 'entity' | 'bank' | 'software' | 'entity_bank'
    _filters: { search: '', entity: 'ALL', bank: 'ALL', software: 'ALL', status: 'ALL' },
    _sort: { key: 'bankBal', dir: 'desc' },
    _showFullAcc: false,
    _charts: [],
    _loaded: false,

    _num: function(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        const cleaned = String(v).replace(/[₹,\s]/g, '');
        const n = parseFloat(cleaned);
        return Number.isFinite(n) ? n : 0;
    },

    _formatExcelTimestamp: function(val) {
        if (!val && val !== 0) return '—';
        if (typeof val === 'number' && val > 20000) {
            const ms = Math.round((val - 25569) * 86400 * 1000);
            const d = new Date(ms);
            return d.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC'
            });
        }
        return String(val);
    },

    _fmtCompact: function(v) {
        const n = Number(v || 0);
        const abs = Math.abs(n);
        const sign = n < 0 ? '-' : '';
        if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
        if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
        if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
        return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
    },

    _fmtINR: function(v) {
        const n = Number(v || 0);
        const sign = n < 0 ? '-' : '';
        return sign + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    _esc: function(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _parseWorkbookBuffer: function(buf, sourceName) {
        if (!window.XLSX) throw new Error('SheetJS (XLSX) library not loaded');
        const wb = window.XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        this._parseRawMatrix(rows, sourceName);
    },

    _parseRawMatrix: function(rows, sourceName) {
        let importAt = '';
        let updatedTill = '';
        let headerIdx = -1;

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const r = rows[i] || [];
            const joined = r.map(c => String(c || '').trim().toLowerCase()).join('|');
            if (joined.includes('data import at') && rows[i + 1]) {
                importAt = this._formatExcelTimestamp(rows[i + 1][0]);
                updatedTill = this._formatExcelTimestamp(rows[i + 1][2] || rows[i + 1][1]);
            }
            if (joined.includes('short code') && joined.includes('bank name')) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) headerIdx = 0;
        const headers = (rows[headerIdx] || []).map(h => String(h || '').trim().toLowerCase());
        const findCol = (needle) => headers.findIndex(h => h.includes(needle));

        const idx = {
            shortCode: findCol('short code'),
            rank:      findCol('rank'),
            holder:    findCol('name of account holder'),
            bank:      findCol('bank name'),
            accNo:     findCol('bank account number'),
            software:  findCol('software used'),
            minBal:    findCol('minimum balance'),
            comfort:   findCol('comfort level'),
            booksBal:  findCol('as per books'),
            bankBal:   findCol('as per bank'),
            excess:    findCol('excess balance'),
            low:       findCol('low balance'),
            recon:     findCol('reconciliation'),
            remarks:   findCol('remarks'),
            kyc:       findCol('kyc')
        };

        const out = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
            const r = rows[i] || [];
            const holder = String(r[idx.holder] ?? '').trim();
            const bank = String(r[idx.bank] ?? '').trim();
            if (!holder && !bank) continue;

            const booksBal = this._num(r[idx.booksBal]);
            const bankBal = this._num(r[idx.bankBal]);
            const comfortLevel = this._num(r[idx.comfort]);
            const minBal = this._num(r[idx.minBal]);
            const excessBal = this._num(r[idx.excess]);
            const lowBal = this._num(r[idx.low]);
            const reconDiff = idx.recon >= 0 ? this._num(r[idx.recon]) : (booksBal - bankBal);

            out.push({
                shortCode: String(r[idx.shortCode] ?? '').trim() || 'OTHER',
                rank: String(r[idx.rank] ?? '').trim(),
                holder: holder || 'Unknown',
                bank: (bank || 'Unknown').toUpperCase(),
                accountNo: String(r[idx.accNo] ?? '').trim(),
                software: String(r[idx.software] ?? '').trim() || 'Unassigned',
                minBal,
                comfortLevel,
                booksBal,
                bankBal,
                excessBal,
                lowBal,
                reconDiff,
                remarks: String(r[idx.remarks] ?? '').trim(),
                kycDate: String(r[idx.kyc] ?? '').trim()
            });
        }

        this._records = out;
        this._meta = {
            importAt: importAt || 'Live Snapshot',
            updatedTill: updatedTill || new Date().toLocaleString('en-IN'),
            source: sourceName || 'DB/Bank Data/Book3.xlsx'
        };
        this._loaded = true;
    },

    _idbOp(mode, fn) {
        return new Promise((resolve) => {
            try {
                if (!window.indexedDB) return resolve(null);
                const req = window.indexedDB.open('ccms_bank_balance_idb', 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('store')) db.createObjectStore('store');
                };
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        const tx = db.transaction('store', mode);
                        const store = tx.objectStore('store');
                        fn(store, resolve);
                    } catch (e) { resolve(null); }
                };
                req.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    },

    _saveCache(payload) {
        try { localStorage.removeItem('ccms_bank_balance_cache'); } catch (e) {}
        return this._idbOp('readwrite', (store, resolve) => {
            const req = store.put(payload, 'latest');
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    },

    _loadCache() {
        try { localStorage.removeItem('ccms_bank_balance_cache'); } catch (e) {}
        return this._idbOp('readonly', (store, resolve) => {
            const req = store.get('latest');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    },

    async ensureLoaded(forceReload = false) {
        if (this._loaded && !forceReload && this._records.length) return;

        // Check if user uploaded a custom file cached in IndexedDB (avoids 5MB localStorage quota)
        if (!forceReload) {
            try {
                const parsed = await this._loadCache();
                if (parsed && Array.isArray(parsed.records) && parsed.records.length) {
                    this._records = parsed.records;
                    this._meta = parsed.meta || this._meta;
                    this._loaded = true;
                    return;
                }
            } catch (e) {}
        }

        // Primary: fetch DB/Bank Data/Book3.xlsx directly from project DB folder
        const paths = ['DB/Bank Data/Book3.xlsx', './DB/Bank%20Data/Book3.xlsx'];
        for (const p of paths) {
            try {
                const res = await fetch(encodeURI(p).replace(/%2520/g, '%20'));
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    this._parseWorkbookBuffer(buf, 'DB/Bank Data/Book3.xlsx');
                    return;
                }
            } catch (e) {}
        }
    },

    async syncFromGoogleSheet() {
        const savedTab = localStorage.getItem('ccms_bank_sheet_tab') || 'Bank Data';
        const tab = prompt('Enter the exact Google Sheet tab name containing Bank Data:', savedTab);
        if (!tab || !tab.trim()) return;
        const cleanTab = tab.trim();
        localStorage.setItem('ccms_bank_sheet_tab', cleanTab);

        try {
            if (window.App) App.showToast(`Syncing "${cleanTab}" from Google Sheets...`, 'info');
            const res = await window.DB.apiGet({ action: 'getAll', sheet: cleanTab });
            if (res && res.error) throw new Error(res.error);
            const rows = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
            if (!rows.length) throw new Error('No rows returned from sheet');

            // Handle both normalized object rows or raw rows
            const mapped = rows.map(obj => {
                const get = (keys) => {
                    for (const k of keys) {
                        if (obj[k] !== undefined && obj[k] !== '') return obj[k];
                    }
                    return '';
                };
                const booksBal = this._num(get(['bank_balance_as_per_books', 'Bank Balance as per Books']));
                const bankBal = this._num(get(['bank_balance_as_per_bank', 'Bank Balance as per Bank']));
                return {
                    shortCode: String(get(['short_code', 'Short Code']) || 'OTHER').trim(),
                    rank: String(get(['rank', 'Rank']) || '').trim(),
                    holder: String(get(['name_of_account_holder', 'Name of Account Holder']) || '').trim(),
                    bank: String(get(['bank_name', 'Bank Name']) || 'Unknown').trim().toUpperCase(),
                    accountNo: String(get(['bank_account_number', 'Bank Account Number']) || '').trim(),
                    software: String(get(['software_used', 'Software Used']) || 'Unassigned').trim(),
                    minBal: this._num(get(['minimum_balance_required', 'Minimum Balance Required'])),
                    comfortLevel: this._num(get(['comfort_level', 'Comfort Level'])),
                    booksBal,
                    bankBal,
                    excessBal: this._num(get(['excess_balance', 'Excess Balance'])),
                    lowBal: this._num(get(['low_balance', 'Low Balance'])),
                    reconDiff: this._num(get(['reconciliation_difference', 'Reconciliation Difference'])) || (booksBal - bankBal),
                    remarks: String(get(['remarks', 'Remarks']) || '').trim(),
                    kycDate: String(get(['next_kyc_date', 'Next KYC Date']) || '').trim()
                };
            }).filter(r => r.holder || r.bank !== 'UNKNOWN');

            if (!mapped.length) throw new Error('Could not match Bank Data columns in that tab');
            this._records = mapped;
            this._meta = {
                importAt: (res && res.importAt) ? String(res.importAt) : new Date().toLocaleString('en-IN'),
                updatedTill: (res && res.updatedTill) ? String(res.updatedTill) : new Date().toLocaleString('en-IN'),
                source: `Google Sheet (${cleanTab})`
            };
            await this._saveCache({ records: this._records, meta: this._meta });
            if (window.App) App.showToast(`Synced ${mapped.length} bank accounts from "${cleanTab}"!`, 'success');
            this._renderCurrent();
        } catch (err) {
            if (window.App) App.showToast('Sheet Sync: ' + err.message, 'error');
        }
    },

    _uploadState: null,

    _fieldDefs: [
        { key: 'shortCode',    label: 'Short Code',                  keywords: ['short code', 'shortcode', 'code', 'entity'] },
        { key: 'rank',         label: 'Rank',                        keywords: ['rank', 'sr', 's.no'] },
        { key: 'holder',       label: 'Name of Account Holder *',    keywords: ['name of account holder', 'account holder', 'holder', 'company', 'entity name'], required: true },
        { key: 'bank',         label: 'Bank Name *',                 keywords: ['bank name', 'bank'], required: true },
        { key: 'accountNo',    label: 'Bank Account Number',         keywords: ['bank account number', 'account number', 'account no', 'a/c', 'acc no'] },
        { key: 'software',     label: 'Software Used',               keywords: ['software used', 'software', 'erp'] },
        { key: 'minBal',       label: 'Minimum Balance Required',    keywords: ['minimum balance', 'min bal', 'min balance'] },
        { key: 'comfortLevel', label: 'Comfort Level',               keywords: ['comfort level', 'comfort'] },
        { key: 'booksBal',     label: 'Bank Balance as per Books',   keywords: ['as per books', 'books balance', 'book bal', 'books'] },
        { key: 'bankBal',      label: 'Bank Balance as per Bank *',  keywords: ['as per bank', 'bank balance', 'bank bal', 'closing balance'], required: true },
        { key: 'excessBal',    label: 'Excess Balance',              keywords: ['excess balance', 'excess'] },
        { key: 'lowBal',       label: 'Low Balance',                 keywords: ['low balance', 'shortfall', 'low'] },
        { key: 'reconDiff',    label: 'Reconciliation Difference',   keywords: ['reconciliation', 'recon diff', 'difference', 'diff'] },
        { key: 'remarks',      label: 'Remarks',                     keywords: ['remarks', 'remark', 'notes', 'description'] },
        { key: 'kycDate',      label: 'Next KYC Date',               keywords: ['kyc', 'next kyc'] }
    ],

    _toDatetimeLocalValue: function(val) {
        let d = new Date();
        if (typeof val === 'number' && val > 20000) {
            d = new Date(Math.round((val - 25569) * 86400 * 1000));
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        }
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    _detectHeaderAndMeta: function(rows) {
        let bestIdx = 0;
        let bestScore = -1;
        let detectedUpdatedTill = null;

        for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const r = rows[i] || [];
            const cells = r.map(c => String(c || '').trim().toLowerCase());
            const joined = cells.join('|');
            if (joined.includes('data import at') && rows[i + 1]) {
                detectedUpdatedTill = rows[i + 1][2] || rows[i + 1][1] || rows[i + 1][0];
            }
            let score = 0;
            this._fieldDefs.forEach(fd => {
                if (cells.some(c => c && fd.keywords.some(kw => c.includes(kw)))) score += 1;
            });
            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }
        return { headerIdx: bestIdx, detectedUpdatedTill };
    },

    _autoMapColumns: function(headers) {
        const lower = headers.map(h => String(h || '').trim().toLowerCase());
        const mapping = {};
        const used = new Set();
        this._fieldDefs.forEach(fd => {
            let matched = -1;
            for (const kw of fd.keywords) {
                const idx = lower.findIndex((h, i) => !used.has(i) && h && h.includes(kw));
                if (idx !== -1) { matched = idx; break; }
            }
            mapping[fd.key] = matched;
            if (matched !== -1) used.add(matched);
        });
        return mapping;
    },

    triggerExcelUpload() {
        let inp = document.getElementById('bb-excel-input');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file';
            inp.id = 'bb-excel-input';
            inp.accept = '.xlsx,.xls,.csv';
            inp.style.display = 'none';
            inp.addEventListener('change', async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                    const buf = await f.arrayBuffer();
                    if (!window.XLSX) throw new Error('SheetJS (XLSX) not loaded');
                    const wb = window.XLSX.read(buf, { type: 'array' });
                    this._openSmartUploadModal(wb, f.name);
                } catch (err) {
                    if (window.App) App.showToast('Excel parse error: ' + err.message, 'error');
                }
                inp.value = '';
            });
            document.body.appendChild(inp);
        }
        inp.click();
    },

    _openSmartUploadModal(wb, fileName) {
        const sheetName = wb.SheetNames[0];
        const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        const { headerIdx, detectedUpdatedTill } = this._detectHeaderAndMeta(rows);
        const headers = rows[headerIdx] || [];

        this._uploadState = {
            wb,
            fileName,
            sheetName,
            rows,
            headerIdx,
            updatedTillVal: this._toDatetimeLocalValue(detectedUpdatedTill),
            targetSheetTab: localStorage.getItem('ccms_bank_sheet_tab') || 'Bank Data',
            pushToSheet: true,
            mapping: this._autoMapColumns(headers)
        };
        this._renderSmartUploadModal();
    },

    _onUploadSheetOrHeaderChange(newSheet, newHeaderIdx) {
        const st = this._uploadState;
        if (!st) return;
        if (newSheet && newSheet !== st.sheetName) {
            st.sheetName = newSheet;
            st.rows = window.XLSX.utils.sheet_to_json(st.wb.Sheets[newSheet], { header: 1, defval: '' });
            const det = this._detectHeaderAndMeta(st.rows);
            st.headerIdx = det.headerIdx;
            if (det.detectedUpdatedTill) st.updatedTillVal = this._toDatetimeLocalValue(det.detectedUpdatedTill);
        } else if (typeof newHeaderIdx === 'number' && newHeaderIdx >= 0) {
            st.headerIdx = newHeaderIdx;
        }
        const headers = st.rows[st.headerIdx] || [];
        st.mapping = this._autoMapColumns(headers);
        this._renderSmartUploadModal();
    },

    _renderSmartUploadModal() {
        const st = this._uploadState;
        if (!st || !window.App) return;
        const headers = st.rows[st.headerIdx] || [];
        const colOptions = (selectedIdx) => {
            let html = `<option value="-1">-- Not Mapped --</option>`;
            headers.forEach((h, i) => {
                const label = String(h || `Column ${i + 1}`).trim();
                html += `<option value="${i}" ${selectedIdx === i ? 'selected' : ''}>Col ${i + 1}: ${this._esc(label)}</option>`;
            });
            return html;
        };

        const mappedCount = Object.values(st.mapping).filter(v => v >= 0).length;
        const previewRows = st.rows.slice(st.headerIdx + 1, st.headerIdx + 4);

        const bodyHtml = `
            <div style="display:flex;flex-direction:column;gap:14px;max-height:74vh;overflow-y:auto;padding-right:4px;">
                <div style="background:linear-gradient(135deg,rgba(79,70,229,0.12),rgba(14,165,233,0.1));border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:12px 14px;">
                    <div style="font-size:0.82rem;font-weight:800;margin-bottom:8px;color:#4f46e5;">
                        <i class="fas fa-clock"></i> File Kab Tak Ke Liye Updated Hai? (Bank Data Updated Till) *
                    </div>
                    <div style="display:grid;grid-template-columns:1.2fr 0.9fr 0.55fr 1fr;gap:10px;align-items:end;">
                        <div>
                            <label style="font-size:0.72rem;font-weight:700;display:block;margin-bottom:4px;">Updated Till Date &amp; Time *</label>
                            <input type="datetime-local" id="bb-upload-updated-till" class="bb-input" style="width:100%;min-width:0;" value="${this._esc(st.updatedTillVal)}" oninput="BankBalance._uploadState.updatedTillVal=this.value;">
                        </div>
                        <div>
                            <label style="font-size:0.72rem;font-weight:700;display:block;margin-bottom:4px;">Worksheet Tab</label>
                            <select class="bb-select" style="width:100%;" onchange="BankBalance._onUploadSheetOrHeaderChange(this.value, null)">
                                ${st.wb.SheetNames.map(n => `<option value="${this._esc(n)}" ${n === st.sheetName ? 'selected' : ''}>${this._esc(n)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.72rem;font-weight:700;display:block;margin-bottom:4px;">Header Row</label>
                            <input type="number" min="1" max="20" class="bb-input" style="width:100%;min-width:0;" value="${st.headerIdx + 1}" onchange="BankBalance._onUploadSheetOrHeaderChange(null, Math.max(0, (parseInt(this.value)||1)-1))">
                        </div>
                        <div>
                            <label style="font-size:0.72rem;font-weight:700;display:block;margin-bottom:4px;">Google Sheet Tab</label>
                            <input type="text" id="bb-upload-gs-tab" class="bb-input" style="width:100%;min-width:0;" value="${this._esc(st.targetSheetTab)}" oninput="BankBalance._uploadState.targetSheetTab=this.value;" placeholder="Bank Data">
                        </div>
                    </div>
                    <label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:0.76rem;font-weight:700;cursor:pointer;">
                        <input type="checkbox" ${st.pushToSheet ? 'checked' : ''} onchange="BankBalance._uploadState.pushToSheet=this.checked;">
                        Save &amp; Sync directly to Google Sheet tab
                    </label>
                </div>

                <div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <strong style="font-size:0.84rem;"><i class="fas fa-wand-magic-sparkles text-primary"></i> Smart Column Mapping (${mappedCount}/${this._fieldDefs.length} Matched)</strong>
                        <span style="font-size:0.72rem;opacity:0.75;">File: ${this._esc(st.fileName)} &bull; ${Math.max(0, st.rows.length - st.headerIdx - 1)} rows</span>
                    </div>
                    <div class="bb-table-wrap" style="max-height:240px;">
                        <table class="bb-table">
                            <thead>
                                <tr>
                                    <th>App Target Field</th>
                                    <th>Excel / CSV Column</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this._fieldDefs.map(fd => {
                                    const sel = st.mapping[fd.key] ?? -1;
                                    return `
                                        <tr>
                                            <td><strong>${this._esc(fd.label)}</strong></td>
                                            <td>
                                                <select class="bb-select" style="width:100%;padding:5px 8px;" onchange="BankBalance._uploadState.mapping['${fd.key}']=parseInt(this.value);BankBalance._renderSmartUploadModal();">
                                                    ${colOptions(sel)}
                                                </select>
                                            </td>
                                            <td>${sel >= 0 ? '<span class="bb-pill ok">Auto-Mapped</span>' : (fd.required ? '<span class="bb-pill bad">Required</span>' : '<span class="bb-pill warn">Skipped</span>')}</td>
                                        </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <div style="font-size:0.78rem;font-weight:700;margin-bottom:6px;"><i class="fas fa-eye"></i> Live Mapped Preview (First 3 Rows)</div>
                    <div class="bb-table-wrap">
                        <table class="bb-table">
                            <thead><tr><th>Code</th><th>Holder</th><th>Bank</th><th>Software</th><th class="num">Books Bal</th><th class="num">Bank Bal</th></tr></thead>
                            <tbody>
                                ${previewRows.map(r => `
                                    <tr>
                                        <td>${this._esc(st.mapping.shortCode >= 0 ? r[st.mapping.shortCode] : '—')}</td>
                                        <td>${this._esc(st.mapping.holder >= 0 ? r[st.mapping.holder] : '—')}</td>
                                        <td>${this._esc(st.mapping.bank >= 0 ? r[st.mapping.bank] : '—')}</td>
                                        <td>${this._esc(st.mapping.software >= 0 ? r[st.mapping.software] : '—')}</td>
                                        <td class="num">${this._fmtINR(st.mapping.booksBal >= 0 ? this._num(r[st.mapping.booksBal]) : 0)}</td>
                                        <td class="num"><strong>${this._fmtINR(st.mapping.bankBal >= 0 ? this._num(r[st.mapping.bankBal]) : 0)}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style="display:flex;justify-content:flex-end;gap:10px;padding-top:6px;">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="BankBalance._confirmSmartUpload()">
                        <i class="fas fa-check-circle"></i> Import &amp; Apply Bank Data
                    </button>
                </div>
            </div>
        `;
        App.showModal('Smart Bank Data Upload & Mapping', bodyHtml);
    },

    async _confirmSmartUpload() {
        const st = this._uploadState;
        if (!st) return;
        const inpVal = document.getElementById('bb-upload-updated-till')?.value || st.updatedTillVal;
        if (!inpVal) {
            if (window.App) App.showToast('Please select "Updated Till Date & Time" first!', 'warning');
            return;
        }
        const m = st.mapping;
        if (m.holder < 0 && m.bank < 0) {
            if (window.App) App.showToast('Please map at least Account Holder or Bank Name!', 'warning');
            return;
        }

        const out = [];
        for (let i = st.headerIdx + 1; i < st.rows.length; i++) {
            const r = st.rows[i] || [];
            const holder = m.holder >= 0 ? String(r[m.holder] ?? '').trim() : '';
            const bank = m.bank >= 0 ? String(r[m.bank] ?? '').trim() : '';
            if (!holder && !bank) continue;

            const booksBal = m.booksBal >= 0 ? this._num(r[m.booksBal]) : 0;
            const bankBal = m.bankBal >= 0 ? this._num(r[m.bankBal]) : 0;
            out.push({
                shortCode: (m.shortCode >= 0 ? String(r[m.shortCode] ?? '').trim() : '') || 'OTHER',
                rank: m.rank >= 0 ? String(r[m.rank] ?? '').trim() : '',
                holder: holder || 'Unknown',
                bank: (bank || 'Unknown').toUpperCase(),
                accountNo: m.accountNo >= 0 ? String(r[m.accountNo] ?? '').trim() : '',
                software: (m.software >= 0 ? String(r[m.software] ?? '').trim() : '') || 'Unassigned',
                minBal: m.minBal >= 0 ? this._num(r[m.minBal]) : 0,
                comfortLevel: m.comfortLevel >= 0 ? this._num(r[m.comfortLevel]) : 0,
                booksBal,
                bankBal,
                excessBal: m.excessBal >= 0 ? this._num(r[m.excessBal]) : 0,
                lowBal: m.lowBal >= 0 ? this._num(r[m.lowBal]) : 0,
                reconDiff: m.reconDiff >= 0 ? this._num(r[m.reconDiff]) : (booksBal - bankBal),
                remarks: m.remarks >= 0 ? String(r[m.remarks] ?? '').trim() : '',
                kycDate: m.kycDate >= 0 ? String(r[m.kycDate] ?? '').trim() : ''
            });
        }

        if (!out.length) {
            if (window.App) App.showToast('No valid bank rows found with current mapping!', 'error');
            return;
        }

        const formattedTill = new Date(inpVal).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        const importAtStr = new Date().toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        const targetTab = (document.getElementById('bb-upload-gs-tab')?.value || st.targetSheetTab || 'Bank Data').trim();
        try { localStorage.setItem('ccms_bank_sheet_tab', targetTab); } catch (e) {}

        this._records = out;
        this._meta = {
            importAt: importAtStr,
            updatedTill: formattedTill,
            source: st.fileName
        };
        this._loaded = true;
        await this._saveCache({ records: this._records, meta: this._meta });

        if (window.App) App.closeModal();
        this._renderCurrent();

        if (st.pushToSheet && window.DB && typeof window.DB.apiPost === 'function') {
            try {
                if (window.App) App.showToast(`Uploading ${out.length} rows to Google Sheet "${targetTab}"...`, 'info');
                const res = await window.DB.apiPost({
                    action: 'saveBankData',
                    sheet: targetTab,
                    importAt: importAtStr,
                    updatedTill: formattedTill,
                    records: out
                });
                if (res && res.success) {
                    this._meta.source = `${st.fileName} → Google Sheet (${res.sheet})`;
                    await this._saveCache({ records: this._records, meta: this._meta });
                    this._renderCurrent();
                    if (window.App) App.showToast(`Saved ${res.saved} rows to Google Sheet "${res.sheet}"!`, 'success');
                } else {
                    if (window.App) App.showToast(`Google Sheet sync error: ${res?.error || 'Deploy updated App Script/code.gs'}`, 'warning');
                }
            } catch (err) {
                if (window.App) App.showToast(`Google Sheet sync failed: ${err.message}`, 'warning');
            }
        } else if (window.App) {
            App.showToast(`Loaded ${out.length} bank accounts locally (Updated till ${formattedTill})!`, 'success');
        }
        this._uploadState = null;
    },

    async resetToLocalDB() {
        try { localStorage.removeItem('ccms_bank_balance_cache'); } catch (e) {}
        await this._idbOp('readwrite', (store, resolve) => {
            const req = store.delete('latest');
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
        await this.ensureLoaded(true);
        if (window.App) App.showToast(`Reloaded ${this._records.length} accounts from DB/Bank Data/Book3.xlsx`, 'success');
        this._renderCurrent();
    },

    setView(v) {
        this._view = v;
        this._renderCurrent();
    },

    setPivotBy(p) {
        this._pivotBy = p;
        this._renderCurrent();
    },

    _renderCurrent() {
        const content = document.getElementById('content');
        if (content) this.render(content);
    },

    _computeSummary(rows) {
        return rows.reduce((acc, r) => {
            acc.count += 1;
            acc.minBal += r.minBal;
            acc.comfort += r.comfortLevel;
            acc.booksBal += r.booksBal;
            acc.bankBal += r.bankBal;
            acc.excess += r.excessBal;
            acc.low += r.lowBal;
            acc.recon += r.reconDiff;
            if (Math.abs(r.reconDiff) > 0.01) acc.unreconciledCount += 1;
            if (Math.abs(r.lowBal) > 0.01) acc.lowCount += 1;
            if (r.excessBal > 0) acc.excessCount += 1;
            return acc;
        }, {
            count: 0, minBal: 0, comfort: 0, booksBal: 0, bankBal: 0,
            excess: 0, low: 0, recon: 0, unreconciledCount: 0, lowCount: 0, excessCount: 0
        });
    },

    _buildPivot(rows, mode) {
        const map = new Map();
        rows.forEach(r => {
            let key = r.shortCode;
            let label = `${r.shortCode} — ${r.holder}`;
            if (mode === 'bank') { key = r.bank; label = r.bank; }
            else if (mode === 'software') { key = r.software; label = r.software; }
            else if (mode === 'entity_bank') { key = `${r.shortCode}__${r.bank}`; label = `${r.shortCode} • ${r.bank}`; }

            if (!map.has(key)) {
                map.set(key, {
                    key, label, count: 0, minBal: 0, comfort: 0,
                    booksBal: 0, bankBal: 0, excess: 0, low: 0, recon: 0
                });
            }
            const g = map.get(key);
            g.count += 1;
            g.minBal += r.minBal;
            g.comfort += r.comfortLevel;
            g.booksBal += r.booksBal;
            g.bankBal += r.bankBal;
            g.excess += r.excessBal;
            g.low += r.lowBal;
            g.recon += r.reconDiff;
        });
        return Array.from(map.values()).sort((a, b) => b.bankBal - a.bankBal);
    },

    _getFilteredRecords() {
        const f = this._filters;
        const q = (f.search || '').trim().toLowerCase();
        const list = this._records.filter(r => {
            if (f.entity !== 'ALL' && r.shortCode !== f.entity) return false;
            if (f.bank !== 'ALL' && r.bank !== f.bank) return false;
            if (f.software !== 'ALL' && r.software !== f.software) return false;
            if (f.status === 'EXCESS' && r.excessBal <= 0) return false;
            if (f.status === 'LOW' && Math.abs(r.lowBal) <= 0.01) return false;
            if (f.status === 'RECON' && Math.abs(r.reconDiff) < 0.01) return false;
            if (f.status === 'ZERO' && (r.bankBal !== 0 || r.booksBal !== 0)) return false;
            if (q) {
                const hay = `${r.shortCode} ${r.holder} ${r.bank} ${r.accountNo} ${r.software} ${r.remarks}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        const { key, dir } = this._sort;
        const mul = dir === 'asc' ? 1 : -1;
        return list.sort((a, b) => {
            const va = a[key], vb = b[key];
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
            return String(va || '').localeCompare(String(vb || '')) * mul;
        });
    },

    _destroyCharts() {
        this._charts.forEach(c => { try { c.destroy(); } catch (e) {} });
        this._charts = [];
    },

    async downloadSnapJPG() {
        const el = document.getElementById('bb-snap-capture');
        if (!el || !window.html2canvas) {
            if (window.App) App.showToast('Capture engine not ready', 'warning');
            return;
        }
        try {
            const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: document.documentElement.dataset.theme === 'dark' ? '#070b14' : '#f1f5f9' });
            const a = document.createElement('a');
            a.download = `Bank_Balance_Snap_${new Date().toISOString().slice(0, 10)}.jpg`;
            a.href = canvas.toDataURL('image/jpeg', 0.95);
            a.click();
            if (window.App) App.showToast('Bank Balance Snap downloaded!', 'success');
        } catch (e) {
            if (window.App) App.showToast('Snapshot failed: ' + e.message, 'error');
        }
    },

    exportExcel(rows, filename) {
        if (!window.XLSX) return;
        const ws = window.XLSX.utils.json_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Bank Balance');
        window.XLSX.writeFile(wb, filename);
        if (window.App) App.showToast(`Exported ${filename}`, 'success');
    },

    async render(container) {
        container.innerHTML = `<div class="bb-card" style="text-align:center;padding:48px;"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i><div style="margin-top:12px;font-weight:700;">Loading Bank Balance Intelligence...</div></div>`;
        await this.ensureLoaded();
        this._destroyCharts();

        if (!this._records.length) {
            container.innerHTML = `
                <div class="bb-card" style="text-align:center;padding:48px;">
                    <i class="fas fa-landmark fa-3x text-primary" style="opacity:0.6;"></i>
                    <h3 style="margin-top:14px;">No Bank Balance Data Found</h3>
                    <p class="text-muted">Could not load <code>DB/Bank Data/Book3.xlsx</code>. Upload an Excel file or sync from Google Sheets.</p>
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
                        <button class="btn btn-primary" onclick="BankBalance.triggerExcelUpload()"><i class="fas fa-upload"></i> Upload Bank Excel</button>
                        <button class="btn btn-secondary" onclick="BankBalance.syncFromGoogleSheet()"><i class="fas fa-sync"></i> Sync Google Sheet</button>
                    </div>
                </div>`;
            return;
        }

        const sum = this._computeSummary(this._records);
        const view = this._view;

        const html = `
            <div class="bb-wrap" id="bb-snap-capture">
                <div class="bb-hero">
                    <div class="bb-hero-left">
                        <span class="bb-hero-pill"><i class="fas fa-landmark"></i> TREASURY &amp; BANK LIQUIDITY SUITE</span>
                        <h2 class="bb-hero-title">Bank Balance Intelligence &amp; Reconciliation Cockpit</h2>
                        <div class="bb-hero-sub">
                            Source: <strong>${this._esc(this._meta.source)}</strong> &bull;
                            Updated Till: <strong>${this._esc(this._meta.updatedTill)}</strong> &bull;
                            <strong>${sum.count}</strong> Bank Accounts
                        </div>
                    </div>
                    <div class="bb-hero-actions">
                        <div class="bb-tabs">
                            <button class="bb-tab-btn ${view === 'snap' ? 'active' : ''}" onclick="BankBalance.setView('snap')"><i class="fas fa-bolt"></i> Single Snap</button>
                            <button class="bb-tab-btn ${view === 'charts' ? 'active' : ''}" onclick="BankBalance.setView('charts')"><i class="fas fa-chart-pie"></i> Charts</button>
                            <button class="bb-tab-btn ${view === 'pivot' ? 'active' : ''}" onclick="BankBalance.setView('pivot')"><i class="fas fa-table-cells"></i> Pivot</button>
                            <button class="bb-tab-btn ${view === 'table' ? 'active' : ''}" onclick="BankBalance.setView('table')"><i class="fas fa-list"></i> Table</button>
                        </div>
                        <button class="bb-action-btn" onclick="BankBalance.downloadSnapJPG()" title="Download Single Snap JPG"><i class="fas fa-camera"></i> Snap JPG</button>
                        <button class="bb-action-btn" onclick="BankBalance.triggerExcelUpload()" title="Load updated Excel file"><i class="fas fa-file-excel"></i> Upload</button>
                        <button class="bb-action-btn primary" onclick="BankBalance.syncFromGoogleSheet()" title="Sync from Google Sheet tab"><i class="fas fa-cloud-download-alt"></i> Sync Sheet</button>
                    </div>
                </div>

                <div class="bb-kpi-grid">
                    <div class="bb-kpi-card" style="background:linear-gradient(135deg,#059669,#10b981);">
                        <div class="bb-kpi-label">Balance as per Bank</div>
                        <div class="bb-kpi-val">${this._fmtCompact(sum.bankBal)}</div>
                        <div class="bb-kpi-sub">${this._fmtINR(sum.bankBal)}</div>
                    </div>
                    <div class="bb-kpi-card" style="background:linear-gradient(135deg,#4f46e5,#6366f1);">
                        <div class="bb-kpi-label">Balance as per Books</div>
                        <div class="bb-kpi-val">${this._fmtCompact(sum.booksBal)}</div>
                        <div class="bb-kpi-sub">${this._fmtINR(sum.booksBal)}</div>
                    </div>
                    <div class="bb-kpi-card" style="background:linear-gradient(135deg,#d97706,#f59e0b);">
                        <div class="bb-kpi-label">Reconciliation Diff</div>
                        <div class="bb-kpi-val">${this._fmtCompact(sum.recon)}</div>
                        <div class="bb-kpi-sub">${sum.unreconciledCount} Accounts Mismatched</div>
                    </div>
                    <div class="bb-kpi-card" style="background:linear-gradient(135deg,#0284c7,#0ea5e9);">
                        <div class="bb-kpi-label">Comfort Level Target</div>
                        <div class="bb-kpi-val">${this._fmtCompact(sum.comfort)}</div>
                        <div class="bb-kpi-sub">Min Req: ${this._fmtCompact(sum.minBal)}</div>
                    </div>
                    <div class="bb-kpi-card" style="background:linear-gradient(135deg,#7c3aed,#a855f7);">
                        <div class="bb-kpi-label">Total Excess Balance</div>
                        <div class="bb-kpi-val">${this._fmtCompact(sum.excess)}</div>
                        <div class="bb-kpi-sub">${sum.excessCount} Surplus Accounts</div>
                    </div>
                    <div class="bb-kpi-card" style="background:linear-gradient(135deg,#e11d48,#f43f5e);">
                        <div class="bb-kpi-label">Total Low Balance</div>
                        <div class="bb-kpi-val">${this._fmtCompact(sum.low)}</div>
                        <div class="bb-kpi-sub">${sum.lowCount} Shortfall Accounts</div>
                    </div>
                </div>

                <div id="bb-view-body"></div>
            </div>
        `;

        container.innerHTML = html;
        const body = document.getElementById('bb-view-body');
        if (view === 'snap') this._renderSnapView(body);
        else if (view === 'charts') this._renderChartsView(body);
        else if (view === 'pivot') this._renderPivotView(body);
        else this._renderTableView(body);
    },

    _renderSnapView(body) {
        const entityPivot = this._buildPivot(this._records, 'entity');
        const bankPivot = this._buildPivot(this._records, 'bank');
        const alerts = [...this._records]
            .filter(r => Math.abs(r.reconDiff) > 0.01 || Math.abs(r.lowBal) > 0.01)
            .sort((a, b) => (Math.abs(b.reconDiff) + Math.abs(b.lowBal)) - (Math.abs(a.reconDiff) + Math.abs(a.lowBal)))
            .slice(0, 7);

        body.innerHTML = `
            <div class="bb-snap-grid">
                <div class="bb-card">
                    <div class="bb-card-head">
                        <h4 class="bb-card-title"><i class="fas fa-building text-primary"></i> Entity Bank Balance vs Comfort</h4>
                        <span class="bb-pill info">${entityPivot.length} Entities</span>
                    </div>
                    <div class="bb-chart-box"><canvas id="bb-snap-entity-chart"></canvas></div>
                </div>

                <div class="bb-card">
                    <div class="bb-card-head">
                        <h4 class="bb-card-title"><i class="fas fa-chart-pie text-success"></i> Bank-wise Treasury Share</h4>
                        <span class="bb-pill ok">${bankPivot.length} Banks</span>
                    </div>
                    <div class="bb-chart-box"><canvas id="bb-snap-bank-chart"></canvas></div>
                </div>

                <div class="bb-card">
                    <div class="bb-card-head">
                        <h4 class="bb-card-title"><i class="fas fa-triangle-exclamation text-warning"></i> Top Recon &amp; Low Alerts</h4>
                        <span class="bb-pill warn">${alerts.length} Priority</span>
                    </div>
                    <div class="bb-table-wrap">
                        <table class="bb-table">
                            <thead>
                                <tr>
                                    <th>Entity / Bank</th>
                                    <th class="num">Bank Bal</th>
                                    <th class="num">Recon Diff</th>
                                    <th class="num">Low Bal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${alerts.length ? alerts.map(r => `
                                    <tr>
                                        <td><strong>${this._esc(r.shortCode)}</strong> &bull; ${this._esc(r.bank)}<div style="font-size:0.68rem;opacity:0.7;">${this._esc(r.remarks || r.software)}</div></td>
                                        <td class="num">${this._fmtCompact(r.bankBal)}</td>
                                        <td class="num">${Math.abs(r.reconDiff) > 0.01 ? `<span class="bb-pill warn">${this._fmtCompact(r.reconDiff)}</span>` : '—'}</td>
                                        <td class="num">${Math.abs(r.lowBal) > 0.01 ? `<span class="bb-pill bad">${this._fmtCompact(r.lowBal)}</span>` : '—'}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" style="text-align:center;padding:20px;">All accounts reconciled &amp; above comfort level!</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        this._renderEntityBarChart('bb-snap-entity-chart', entityPivot);
        this._renderBankDoughnutChart('bb-snap-bank-chart', bankPivot);
    },

    _renderChartsView(body) {
        const entityPivot = this._buildPivot(this._records, 'entity');
        const bankPivot = this._buildPivot(this._records, 'bank');
        const swPivot = this._buildPivot(this._records, 'software');
        const topAccs = [...this._records].sort((a, b) => b.bankBal - a.bankBal).slice(0, 10);

        body.innerHTML = `
            <div class="bb-charts-grid">
                <div class="bb-card">
                    <div class="bb-card-head">
                        <h4 class="bb-card-title"><i class="fas fa-building text-primary"></i> Entity Liquidity: Bank vs Books vs Comfort</h4>
                    </div>
                    <div class="bb-chart-box"><canvas id="bb-ch-entity"></canvas></div>
                </div>

                <div class="bb-card">
                    <div class="bb-card-head">
                        <h4 class="bb-card-title"><i class="fas fa-landmark text-success"></i> Multi-Layer Bank Distribution (Bank vs Books)</h4>
                    </div>
                    <div class="bb-chart-box"><canvas id="bb-ch-bank"></canvas></div>
                </div>

                <div class="bb-card">
                    <div class="bb-card-head">
                        <h4 class="bb-card-title"><i class="fas fa-laptop-code text-info"></i> Software-wise Treasury (Korpsoft vs Zoho)</h4>
                    </div>
                    <div class="bb-chart-box"><canvas id="bb-ch-sw"></canvas></div>
                </div>

                <div class="bb-card">
                    <div class="bb-card-head">
                        <h4 class="bb-card-title"><i class="fas fa-trophy text-warning"></i> Top 10 Accounts by Bank Balance</h4>
                    </div>
                    <div class="bb-chart-box"><canvas id="bb-ch-top"></canvas></div>
                </div>
            </div>
        `;

        this._renderEntityBarChart('bb-ch-entity', entityPivot);
        this._renderBankDoughnutChart('bb-ch-bank', bankPivot, true);
        this._renderSoftwareChart('bb-ch-sw', swPivot);
        this._renderTopAccountsChart('bb-ch-top', topAccs);
    },

    _parseKycDate(val) {
        if (!val) return null;
        if (typeof val === 'number' && val > 20000) {
            return new Date(Math.round((val - 25569) * 86400 * 1000));
        }
        const s = String(val).trim();
        const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
        if (m) {
            const yr = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
            return new Date(yr, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    },

    _buildGretexReportData() {
        const now = new Date();
        const byHolder = (filterFn) => {
            const map = new Map();
            this._records.filter(filterFn).forEach(r => {
                if (!map.has(r.holder)) {
                    map.set(r.holder, { holder: r.holder, shortCode: r.shortCode, count: 0, bankBal: 0, booksBal: 0, excess: 0, low: 0, recon: 0 });
                }
                const g = map.get(r.holder);
                g.count += 1;
                g.bankBal += r.bankBal;
                g.booksBal += r.booksBal;
                g.excess += r.excessBal;
                g.low += r.lowBal;
                g.recon += r.reconDiff;
            });
            return Array.from(map.values());
        };

        const excessRows = byHolder(r => r.excessBal > 0).sort((a, b) => b.excess - a.excess);
        const lowRows = byHolder(r => Math.abs(r.lowBal) > 0.01).sort((a, b) => Math.abs(b.low) - Math.abs(a.low));
        const reconRows = byHolder(r => Math.abs(r.reconDiff) > 0.01).sort((a, b) => Math.abs(b.recon) - Math.abs(a.recon));

        const kycMap = new Map();
        this._records.forEach(r => {
            const d = this._parseKycDate(r.kycDate);
            if (!d) return;
            const diffDays = Math.ceil((d - now) / 86400000);
            if (diffDays <= 60) {
                if (!kycMap.has(r.holder)) kycMap.set(r.holder, { holder: r.holder, count: 0, m2: 0, m1: 0 });
                const k = kycMap.get(r.holder);
                k.count += 1;
                if (diffDays <= 30) k.m1 += 1;
                else k.m2 += 1;
            }
        });
        const kycRows = Array.from(kycMap.values()).sort((a, b) => b.m1 - a.m1 || b.count - a.count);

        return { excessRows, lowRows, reconRows, kycRows };
    },

    copyGretexWhatsApp() {
        const { excessRows, lowRows, reconRows, kycRows } = this._buildGretexReportData();
        const totExcess = excessRows.reduce((s, r) => s + r.excess, 0);
        const totLow = lowRows.reduce((s, r) => s + r.low, 0);
        const totRecon = reconRows.reduce((s, r) => s + r.recon, 0);
        const lines = [
            `*GRETEX GROUP BANK REPORT*`,
            `Updated Till: ${this._meta.updatedTill}`,
            ``,
            `*1. Excess Balance (${excessRows.length} Entities):* ${this._fmtINR(totExcess)}`,
            ...excessRows.slice(0, 5).map(r => `• ${r.holder} (${r.count}): ${this._fmtINR(r.excess)}`),
            ``,
            `*2. Low Balance (${lowRows.length} Entities):* ${this._fmtINR(totLow)}`,
            ...lowRows.slice(0, 5).map(r => `• ${r.holder} (${r.count}): ${this._fmtINR(r.low)}`),
            ``,
            `*3. Reconciliation Diff (${reconRows.length} Entities):* ${this._fmtINR(totRecon)}`,
            ...reconRows.slice(0, 5).map(r => `• ${r.holder} (${r.count}): ${this._fmtINR(r.recon)}`),
            ``,
            `*4. KYC Pending (<=60d):* ${kycRows.length ? kycRows.map(k => `${k.holder} (${k.count})`).join(', ') : 'All Compliant'}`
        ];
        navigator.clipboard?.writeText(lines.join('\n')).then(() => {
            if (window.App) App.showToast('Gretex Group Bank Report copied for WhatsApp!', 'success');
        }).catch(() => {});
    },

    _renderPivotView(body) {
        const mode = this._pivotBy;
        const navBar = `
            <div class="bb-card" style="padding:12px 16px;margin-bottom:14px;">
                <div class="bb-card-head" style="margin-bottom:0;flex-wrap:wrap;">
                    <div class="bb-pivot-pills">
                        <button class="bb-pivot-pill ${mode === 'gretex_report' ? 'active' : ''}" onclick="BankBalance.setPivotBy('gretex_report')"><i class="fas fa-crown"></i> Gretex Group Bank Report</button>
                        <button class="bb-pivot-pill ${mode === 'entity' ? 'active' : ''}" onclick="BankBalance.setPivotBy('entity')">By Entity</button>
                        <button class="bb-pivot-pill ${mode === 'bank' ? 'active' : ''}" onclick="BankBalance.setPivotBy('bank')">By Bank</button>
                        <button class="bb-pivot-pill ${mode === 'software' ? 'active' : ''}" onclick="BankBalance.setPivotBy('software')">By Software</button>
                        <button class="bb-pivot-pill ${mode === 'entity_bank' ? 'active' : ''}" onclick="BankBalance.setPivotBy('entity_bank')">Entity &times; Bank</button>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        ${mode === 'gretex_report' ? `<button class="btn btn-sm btn-primary" onclick="BankBalance.copyGretexWhatsApp()"><i class="fab fa-whatsapp"></i> Copy Summary</button>` : ''}
                        <button class="btn btn-sm btn-success" onclick="BankBalance.exportPivot()"><i class="fas fa-file-excel"></i> Export Pivot</button>
                    </div>
                </div>
            </div>
        `;

        if (mode === 'gretex_report') {
            const { excessRows, lowRows, reconRows, kycRows } = this._buildGretexReportData();
            const maxExcess = Math.max(1, ...excessRows.map(r => r.excess));
            const maxLow = Math.max(1, ...lowRows.map(r => Math.abs(r.low)));
            const maxRecon = Math.max(1, ...reconRows.map(r => Math.abs(r.recon)));

            const totExcessBank = excessRows.reduce((s, r) => s + r.bankBal, 0);
            const totExcessVal = excessRows.reduce((s, r) => s + r.excess, 0);
            const totExcessCnt = excessRows.reduce((s, r) => s + r.count, 0);

            const totLowBank = lowRows.reduce((s, r) => s + r.bankBal, 0);
            const totLowVal = lowRows.reduce((s, r) => s + r.low, 0);
            const totLowCnt = lowRows.reduce((s, r) => s + r.count, 0);

            const totReconBank = reconRows.reduce((s, r) => s + r.bankBal, 0);
            const totReconBooks = reconRows.reduce((s, r) => s + r.booksBal, 0);
            const totReconDiff = reconRows.reduce((s, r) => s + r.recon, 0);
            const totReconCnt = reconRows.reduce((s, r) => s + r.count, 0);

            body.innerHTML = navBar + `
                <div class="bb-gretex-banner">
                    <div>
                        <div class="bb-gretex-title"><i class="fas fa-landmark"></i> GRETEX GROUP BANK REPORT</div>
                        <div class="bb-gretex-sub">Executive 4-Quadrant Pivot &bull; Updated Till: ${this._esc(this._meta.updatedTill)}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <span class="bb-pill ok">Excess: ${this._fmtCompact(totExcessVal)}</span>
                        <span class="bb-pill bad">Low: ${this._fmtCompact(totLowVal)}</span>
                        <span class="bb-pill warn">Recon: ${this._fmtCompact(totReconDiff)}</span>
                    </div>
                </div>

                <div class="bb-gretex-grid">
                    <!-- 1. EXCESS BALANCE -->
                    <div class="bb-card">
                        <div class="bb-card-head">
                            <h4 class="bb-card-title"><i class="fas fa-arrow-trend-up text-success"></i> Excess Balance</h4>
                            <span class="bb-pill ok">${excessRows.length} Entities &bull; ${totExcessCnt} A/C</span>
                        </div>
                        <div class="bb-table-wrap" style="max-height:280px;">
                            <table class="bb-table">
                                <thead>
                                    <tr>
                                        <th>Name of Account Holder</th>
                                        <th class="num">A/C</th>
                                        <th class="num">Bank Balance</th>
                                        <th class="num">Excess Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${excessRows.length ? excessRows.map(r => {
                                        const pct = Math.min(100, Math.round((r.excess / maxExcess) * 100));
                                        return `
                                            <tr>
                                                <td><strong>${this._esc(r.holder)}</strong></td>
                                                <td class="num"><span class="bb-pill info">${r.count}</span></td>
                                                <td class="num">${this._fmtINR(r.bankBal)}</td>
                                                <td class="num bb-heat-cell">
                                                    <span class="bb-heat-bar ok" style="width:${pct}%;"></span>
                                                    <span class="bb-heat-val">${this._fmtINR(r.excess)}</span>
                                                </td>
                                            </tr>`;
                                    }).join('') : '<tr><td colspan="4" style="text-align:center;padding:18px;">No excess balance accounts</td></tr>'}
                                </tbody>
                                ${excessRows.length ? `<tfoot><tr><td>TOTAL</td><td class="num">${totExcessCnt}</td><td class="num">${this._fmtINR(totExcessBank)}</td><td class="num">${this._fmtINR(totExcessVal)}</td></tr></tfoot>` : ''}
                            </table>
                        </div>
                    </div>

                    <!-- 2. LOW BALANCE -->
                    <div class="bb-card">
                        <div class="bb-card-head">
                            <h4 class="bb-card-title"><i class="fas fa-arrow-trend-down text-danger"></i> Low Balance</h4>
                            <span class="bb-pill bad">${lowRows.length} Entities &bull; ${totLowCnt} A/C</span>
                        </div>
                        <div class="bb-table-wrap" style="max-height:280px;">
                            <table class="bb-table">
                                <thead>
                                    <tr>
                                        <th>Name of Account Holder</th>
                                        <th class="num">A/C</th>
                                        <th class="num">Bank Balance</th>
                                        <th class="num">Low Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${lowRows.length ? lowRows.map(r => {
                                        const pct = Math.min(100, Math.round((Math.abs(r.low) / maxLow) * 100));
                                        return `
                                            <tr>
                                                <td><strong>${this._esc(r.holder)}</strong></td>
                                                <td class="num"><span class="bb-pill info">${r.count}</span></td>
                                                <td class="num">${this._fmtINR(r.bankBal)}</td>
                                                <td class="num bb-heat-cell">
                                                    <span class="bb-heat-bar bad" style="width:${pct}%;"></span>
                                                    <span class="bb-heat-val">${this._fmtINR(r.low)}</span>
                                                </td>
                                            </tr>`;
                                    }).join('') : '<tr><td colspan="4" style="text-align:center;padding:18px;">No low balance shortfall!</td></tr>'}
                                </tbody>
                                ${lowRows.length ? `<tfoot><tr><td>TOTAL</td><td class="num">${totLowCnt}</td><td class="num">${this._fmtINR(totLowBank)}</td><td class="num">${this._fmtINR(totLowVal)}</td></tr></tfoot>` : ''}
                            </table>
                        </div>
                    </div>

                    <!-- 3. KYC PENDING -->
                    <div class="bb-card">
                        <div class="bb-card-head">
                            <h4 class="bb-card-title"><i class="fas fa-id-card-clip text-info"></i> KYC Pending (Next 60 Days)</h4>
                            <span class="bb-pill ${kycRows.length ? 'warn' : 'ok'}">${kycRows.length ? `${kycRows.length} Entities Due` : 'All Compliant'}</span>
                        </div>
                        <div class="bb-table-wrap" style="max-height:300px;">
                            <table class="bb-table">
                                <thead>
                                    <tr>
                                        <th>Name of Account Holder</th>
                                        <th class="num">Count</th>
                                        <th class="num">2 Months Pending</th>
                                        <th class="num">1 Month Pending</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${kycRows.length ? kycRows.map(r => `
                                        <tr>
                                            <td><strong>${this._esc(r.holder)}</strong></td>
                                            <td class="num"><span class="bb-pill info">${r.count}</span></td>
                                            <td class="num">${r.m2 > 0 ? `<span class="bb-pill warn">${r.m2}</span>` : '0'}</td>
                                            <td class="num">${r.m1 > 0 ? `<span class="bb-pill bad">${r.m1}</span>` : '0'}</td>
                                        </tr>
                                    `).join('') : '<tr><td colspan="4" style="text-align:center;padding:24px;color:#10b981;font-weight:700;"><i class="fas fa-check-circle"></i> Zero KYC Pending in the next 2 months!</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 4. RECONCILIATION DIFFERENCE -->
                    <div class="bb-card">
                        <div class="bb-card-head">
                            <h4 class="bb-card-title"><i class="fas fa-scale-unbalanced text-warning"></i> Reconciliation Difference</h4>
                            <span class="bb-pill warn">${reconRows.length} Entities &bull; ${totReconCnt} A/C</span>
                        </div>
                        <div class="bb-table-wrap" style="max-height:300px;">
                            <table class="bb-table">
                                <thead>
                                    <tr>
                                        <th>Name of Account Holder</th>
                                        <th class="num">A/C</th>
                                        <th class="num">Balance as Banks</th>
                                        <th class="num">Balance as Books</th>
                                        <th class="num">Difference</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${reconRows.length ? reconRows.map(r => {
                                        const pct = Math.min(100, Math.round((Math.abs(r.recon) / maxRecon) * 100));
                                        return `
                                            <tr>
                                                <td><strong>${this._esc(r.holder)}</strong></td>
                                                <td class="num"><span class="bb-pill info">${r.count}</span></td>
                                                <td class="num">${this._fmtINR(r.bankBal)}</td>
                                                <td class="num">${this._fmtINR(r.booksBal)}</td>
                                                <td class="num bb-heat-cell">
                                                    <span class="bb-heat-bar ${Math.abs(r.recon) > 500000 ? 'bad' : 'warn'}" style="width:${pct}%;"></span>
                                                    <span class="bb-heat-val">${this._fmtINR(r.recon)}</span>
                                                </td>
                                            </tr>`;
                                    }).join('') : '<tr><td colspan="5" style="text-align:center;padding:24px;color:#10b981;font-weight:700;"><i class="fas fa-check-circle"></i> All Books &amp; Bank Balances Reconciled!</td></tr>'}
                                </tbody>
                                ${reconRows.length ? `<tfoot><tr><td>TOTAL</td><td class="num">${totReconCnt}</td><td class="num">${this._fmtINR(totReconBank)}</td><td class="num">${this._fmtINR(totReconBooks)}</td><td class="num">${this._fmtINR(totReconDiff)}</td></tr></tfoot>` : ''}
                            </table>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const rows = this._buildPivot(this._records, mode);
        const tot = rows.reduce((a, r) => {
            a.count += r.count; a.minBal += r.minBal; a.comfort += r.comfort;
            a.booksBal += r.booksBal; a.bankBal += r.bankBal;
            a.excess += r.excess; a.low += r.low; a.recon += r.recon;
            return a;
        }, { count: 0, minBal: 0, comfort: 0, booksBal: 0, bankBal: 0, excess: 0, low: 0, recon: 0 });

        body.innerHTML = navBar + `
            <div class="bb-card">
                <div class="bb-table-wrap">
                    <table class="bb-table">
                        <thead>
                            <tr>
                                <th>Pivot Group</th>
                                <th class="num">Accounts</th>
                                <th class="num">Min Bal Req</th>
                                <th class="num">Comfort Level</th>
                                <th class="num">Books Balance</th>
                                <th class="num">Bank Balance</th>
                                <th class="num">Excess Bal</th>
                                <th class="num">Low Bal</th>
                                <th class="num">Recon Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                                <tr>
                                    <td><strong>${this._esc(r.label)}</strong></td>
                                    <td class="num"><span class="bb-pill info">${r.count}</span></td>
                                    <td class="num">${this._fmtINR(r.minBal)}</td>
                                    <td class="num">${this._fmtINR(r.comfort)}</td>
                                    <td class="num">${this._fmtINR(r.booksBal)}</td>
                                    <td class="num"><strong>${this._fmtINR(r.bankBal)}</strong></td>
                                    <td class="num">${r.excess > 0 ? `<span class="bb-pill ok">${this._fmtINR(r.excess)}</span>` : '₹0.00'}</td>
                                    <td class="num">${Math.abs(r.low) > 0.01 ? `<span class="bb-pill bad">${this._fmtINR(r.low)}</span>` : '₹0.00'}</td>
                                    <td class="num">${Math.abs(r.recon) > 0.01 ? `<span class="bb-pill warn">${this._fmtINR(r.recon)}</span>` : '<span class="bb-pill ok">Matched</span>'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>TOTAL (${rows.length} Groups)</td>
                                <td class="num">${tot.count}</td>
                                <td class="num">${this._fmtINR(tot.minBal)}</td>
                                <td class="num">${this._fmtINR(tot.comfort)}</td>
                                <td class="num">${this._fmtINR(tot.booksBal)}</td>
                                <td class="num">${this._fmtINR(tot.bankBal)}</td>
                                <td class="num">${this._fmtINR(tot.excess)}</td>
                                <td class="num">${this._fmtINR(tot.low)}</td>
                                <td class="num">${this._fmtINR(tot.recon)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    },

    exportPivot() {
        if (this._pivotBy === 'gretex_report' && window.XLSX) {
            const { excessRows, lowRows, reconRows, kycRows } = this._buildGretexReportData();
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(excessRows.map(r => ({
                'Name of Account Holder': r.holder, 'Account Count': r.count, 'Bank Balance': r.bankBal, 'Excess Balance': r.excess
            }))), 'Excess Balance');
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(lowRows.map(r => ({
                'Name of Account Holder': r.holder, 'Account Count': r.count, 'Bank Balance': r.bankBal, 'Low Balance': r.low
            }))), 'Low Balance');
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(kycRows.map(r => ({
                'Name of Account Holder': r.holder, 'Count': r.count, '2 Months Pending': r.m2, '1 Month Pending': r.m1
            }))), 'KYC Pending');
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(reconRows.map(r => ({
                'Name of Account Holder': r.holder, 'No. Of Accounts': r.count, 'Balance as Banks': r.bankBal, 'Balance as Books': r.booksBal, 'Difference': r.recon
            }))), 'Reconciliation Diff');
            const fname = `Gretex_Group_Bank_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
            window.XLSX.writeFile(wb, fname);
            if (window.App) App.showToast(`Exported ${fname}`, 'success');
            return;
        }
        const rows = this._buildPivot(this._records, this._pivotBy).map(r => ({
            Group: r.label,
            Accounts: r.count,
            Min_Balance_Req: r.minBal,
            Comfort_Level: r.comfort,
            Books_Balance: r.booksBal,
            Bank_Balance: r.bankBal,
            Excess_Balance: r.excess,
            Low_Balance: r.low,
            Reconciliation_Diff: r.recon
        }));
        this.exportExcel(rows, `Bank_Balance_Pivot_${this._pivotBy}.xlsx`);
    },

    _renderTableView(body) {
        const entities = [...new Set(this._records.map(r => r.shortCode))].sort();
        const banks = [...new Set(this._records.map(r => r.bank))].sort();
        const softwares = [...new Set(this._records.map(r => r.software))].sort();
        const filtered = this._getFilteredRecords();
        const sum = this._computeSummary(filtered);
        const maskAcc = (a) => this._showFullAcc ? a : (a.length > 4 ? `••••${a.slice(-4)}` : a);

        body.innerHTML = `
            <div class="bb-card">
                <div class="bb-filter-bar">
                    <input type="text" class="bb-input" placeholder="Search holder, bank, account no, remarks..." value="${this._esc(this._filters.search)}" oninput="BankBalance._filters.search=this.value;BankBalance._renderTableRowsOnly();">
                    <select class="bb-select" onchange="BankBalance._filters.entity=this.value;BankBalance._renderCurrent();">
                        <option value="ALL">All Entities (${entities.length})</option>
                        ${entities.map(e => `<option value="${this._esc(e)}" ${this._filters.entity === e ? 'selected' : ''}>${this._esc(e)}</option>`).join('')}
                    </select>
                    <select class="bb-select" onchange="BankBalance._filters.bank=this.value;BankBalance._renderCurrent();">
                        <option value="ALL">All Banks (${banks.length})</option>
                        ${banks.map(b => `<option value="${this._esc(b)}" ${this._filters.bank === b ? 'selected' : ''}>${this._esc(b)}</option>`).join('')}
                    </select>
                    <select class="bb-select" onchange="BankBalance._filters.software=this.value;BankBalance._renderCurrent();">
                        <option value="ALL">All Software (${softwares.length})</option>
                        ${softwares.map(s => `<option value="${this._esc(s)}" ${this._filters.software === s ? 'selected' : ''}>${this._esc(s)}</option>`).join('')}
                    </select>
                    <select class="bb-select" onchange="BankBalance._filters.status=this.value;BankBalance._renderCurrent();">
                        <option value="ALL" ${this._filters.status === 'ALL' ? 'selected' : ''}>All Status</option>
                        <option value="EXCESS" ${this._filters.status === 'EXCESS' ? 'selected' : ''}>Excess Balance</option>
                        <option value="LOW" ${this._filters.status === 'LOW' ? 'selected' : ''}>Low Balance</option>
                        <option value="RECON" ${this._filters.status === 'RECON' ? 'selected' : ''}>Recon Mismatch</option>
                        <option value="ZERO" ${this._filters.status === 'ZERO' ? 'selected' : ''}>Zero Balance</option>
                    </select>
                    <button class="btn btn-sm btn-secondary" onclick="BankBalance._showFullAcc=!BankBalance._showFullAcc;BankBalance._renderCurrent();">
                        <i class="fas fa-${this._showFullAcc ? 'eye-slash' : 'eye'}"></i> ${this._showFullAcc ? 'Mask A/C' : 'Show A/C'}
                    </button>
                    <button class="btn btn-sm btn-success" onclick="BankBalance.exportFilteredTable()">
                        <i class="fas fa-file-excel"></i> Export (${filtered.length})
                    </button>
                </div>

                <div class="bb-table-wrap" style="max-height:540px;">
                    <table class="bb-table">
                        <thead>
                            <tr>
                                <th onclick="BankBalance._toggleSort('shortCode')">Code</th>
                                <th onclick="BankBalance._toggleSort('holder')">Account Holder</th>
                                <th onclick="BankBalance._toggleSort('bank')">Bank</th>
                                <th>Account No.</th>
                                <th onclick="BankBalance._toggleSort('software')">Software</th>
                                <th class="num" onclick="BankBalance._toggleSort('comfortLevel')">Comfort</th>
                                <th class="num" onclick="BankBalance._toggleSort('booksBal')">Books Bal</th>
                                <th class="num" onclick="BankBalance._toggleSort('bankBal')">Bank Bal</th>
                                <th class="num" onclick="BankBalance._toggleSort('excessBal')">Excess</th>
                                <th class="num" onclick="BankBalance._toggleSort('lowBal')">Low</th>
                                <th class="num" onclick="BankBalance._toggleSort('reconDiff')">Recon Diff</th>
                                <th>Remarks</th>
                            </tr>
                        </thead>
                        <tbody id="bb-table-tbody">
                            ${this._buildTableRowsHtml(filtered, maskAcc)}
                        </tbody>
                        <tfoot id="bb-table-tfoot">
                            <tr>
                                <td colspan="5">FILTERED TOTAL (${sum.count} Accounts)</td>
                                <td class="num">${this._fmtINR(sum.comfort)}</td>
                                <td class="num">${this._fmtINR(sum.booksBal)}</td>
                                <td class="num">${this._fmtINR(sum.bankBal)}</td>
                                <td class="num">${this._fmtINR(sum.excess)}</td>
                                <td class="num">${this._fmtINR(sum.low)}</td>
                                <td class="num">${this._fmtINR(sum.recon)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    },

    _buildTableRowsHtml(filtered, maskAcc) {
        if (!filtered.length) return '<tr><td colspan="12" style="text-align:center;padding:24px;">No matching bank accounts found.</td></tr>';
        return filtered.map(r => `
            <tr>
                <td><span class="bb-pill info">${this._esc(r.shortCode)}</span></td>
                <td><strong>${this._esc(r.holder)}</strong></td>
                <td>${this._esc(r.bank)}</td>
                <td style="font-family:monospace;">${this._esc(maskAcc(r.accountNo))}</td>
                <td>${this._esc(r.software)}</td>
                <td class="num">${this._fmtINR(r.comfortLevel)}</td>
                <td class="num">${this._fmtINR(r.booksBal)}</td>
                <td class="num"><strong>${this._fmtINR(r.bankBal)}</strong></td>
                <td class="num">${r.excessBal > 0 ? `<span class="bb-pill ok">${this._fmtINR(r.excessBal)}</span>` : '—'}</td>
                <td class="num">${Math.abs(r.lowBal) > 0.01 ? `<span class="bb-pill bad">${this._fmtINR(r.lowBal)}</span>` : '—'}</td>
                <td class="num">${Math.abs(r.reconDiff) > 0.01 ? `<span class="bb-pill warn">${this._fmtINR(r.reconDiff)}</span>` : '<span class="bb-pill ok">0</span>'}</td>
                <td>${this._esc(r.remarks || '—')}</td>
            </tr>
        `).join('');
    },

    _renderTableRowsOnly() {
        const filtered = this._getFilteredRecords();
        const sum = this._computeSummary(filtered);
        const maskAcc = (a) => this._showFullAcc ? a : (a.length > 4 ? `••••${a.slice(-4)}` : a);
        const tbody = document.getElementById('bb-table-tbody');
        const tfoot = document.getElementById('bb-table-tfoot');
        if (tbody) tbody.innerHTML = this._buildTableRowsHtml(filtered, maskAcc);
        if (tfoot) {
            tfoot.innerHTML = `
                <tr>
                    <td colspan="5">FILTERED TOTAL (${sum.count} Accounts)</td>
                    <td class="num">${this._fmtINR(sum.comfort)}</td>
                    <td class="num">${this._fmtINR(sum.booksBal)}</td>
                    <td class="num">${this._fmtINR(sum.bankBal)}</td>
                    <td class="num">${this._fmtINR(sum.excess)}</td>
                    <td class="num">${this._fmtINR(sum.low)}</td>
                    <td class="num">${this._fmtINR(sum.recon)}</td>
                    <td></td>
                </tr>`;
        }
    },

    _toggleSort(key) {
        if (this._sort.key === key) this._sort.dir = this._sort.dir === 'asc' ? 'desc' : 'asc';
        else { this._sort.key = key; this._sort.dir = 'desc'; }
        this._renderCurrent();
    },

    exportFilteredTable() {
        const rows = this._getFilteredRecords().map(r => ({
            Short_Code: r.shortCode,
            Rank: r.rank,
            Account_Holder: r.holder,
            Bank: r.bank,
            Account_Number: r.accountNo,
            Software: r.software,
            Min_Balance_Req: r.minBal,
            Comfort_Level: r.comfortLevel,
            Books_Balance: r.booksBal,
            Bank_Balance: r.bankBal,
            Excess_Balance: r.excessBal,
            Low_Balance: r.lowBal,
            Recon_Diff: r.reconDiff,
            Remarks: r.remarks,
            Next_KYC_Date: r.kycDate
        }));
        this.exportExcel(rows, `Bank_Balance_Register_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    // ── CHART.JS RENDERERS ───────────────────────────────────
    _chartTheme() {
        const isDark = document.documentElement.dataset.theme === 'dark';
        return {
            isDark,
            text: isDark ? '#e2e8f0' : '#1e293b',
            muted: isDark ? '#94a3b8' : '#64748b',
            grid: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
            border: isDark ? '#0f172a' : '#ffffff'
        };
    },

    _renderEntityBarChart(canvasId, entityPivot) {
        const el = document.getElementById(canvasId);
        if (!el || !window.Chart) return;
        const th = this._chartTheme();
        this._charts.push(new window.Chart(el, {
            type: 'bar',
            data: {
                labels: entityPivot.map(r => r.key),
                datasets: [
                    { label: 'Bank Balance', data: entityPivot.map(r => r.bankBal), backgroundColor: 'rgba(16, 185, 129, 0.88)', borderRadius: 6, order: 2 },
                    { label: 'Books Balance', data: entityPivot.map(r => r.booksBal), backgroundColor: 'rgba(99, 102, 241, 0.85)', borderRadius: 6, order: 2 },
                    { type: 'line', label: 'Comfort Level', data: entityPivot.map(r => r.comfort), borderColor: '#f59e0b', backgroundColor: '#f59e0b', borderWidth: 2.5, pointRadius: 4, tension: 0.3, order: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { color: th.text, boxWidth: 10, font: { weight: '600', size: 10.5 } } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: th.grid }, ticks: { color: th.muted, callback: (v) => this._fmtCompact(v), font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: th.text, font: { weight: '700', size: 10.5 } } }
                }
            }
        }));
    },

    _renderBankDoughnutChart(canvasId, bankPivot, multiLayer = false) {
        const el = document.getElementById(canvasId);
        if (!el || !window.Chart) return;
        const th = this._chartTheme();
        const palette = ['#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6'];
        const datasets = [{
            label: 'Bank Balance',
            data: bankPivot.map(r => r.bankBal),
            backgroundColor: bankPivot.map((_, i) => palette[i % palette.length]),
            borderColor: th.border,
            borderWidth: 2
        }];
        if (multiLayer) {
            datasets.push({
                label: 'Books Balance',
                data: bankPivot.map(r => r.booksBal),
                backgroundColor: bankPivot.map((_, i) => palette[i % palette.length] + '99'),
                borderColor: th.border,
                borderWidth: 2
            });
        }
        this._charts.push(new window.Chart(el, {
            type: 'doughnut',
            data: { labels: bankPivot.map(r => `${r.label} (${r.count})`), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: multiLayer ? '45%' : '58%',
                plugins: {
                    legend: { position: 'right', labels: { color: th.text, boxWidth: 10, font: { weight: '600', size: 10.5 } } }
                }
            }
        }));
    },

    _renderSoftwareChart(canvasId, swPivot) {
        const el = document.getElementById(canvasId);
        if (!el || !window.Chart) return;
        const th = this._chartTheme();
        this._charts.push(new window.Chart(el, {
            type: 'bar',
            data: {
                labels: swPivot.map(r => `${r.label} (${r.count})`),
                datasets: [
                    { label: 'Bank Balance', data: swPivot.map(r => r.bankBal), backgroundColor: 'rgba(14, 165, 233, 0.88)', borderRadius: 6 },
                    { label: 'Books Balance', data: swPivot.map(r => r.booksBal), backgroundColor: 'rgba(139, 92, 246, 0.85)', borderRadius: 6 },
                    { label: 'Recon Diff', data: swPivot.map(r => Math.abs(r.recon)), backgroundColor: 'rgba(245, 158, 11, 0.9)', borderRadius: 6 }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { color: th.text, boxWidth: 10, font: { weight: '600', size: 10.5 } } } },
                scales: {
                    x: { beginAtZero: true, grid: { color: th.grid }, ticks: { color: th.muted, callback: (v) => this._fmtCompact(v), font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { color: th.text, font: { weight: '700', size: 11 } } }
                }
            }
        }));
    },

    _renderTopAccountsChart(canvasId, topAccs) {
        const el = document.getElementById(canvasId);
        if (!el || !window.Chart) return;
        const th = this._chartTheme();
        this._charts.push(new window.Chart(el, {
            type: 'bar',
            data: {
                labels: topAccs.map(r => `${r.shortCode} • ${r.bank} (${r.accountNo.slice(-4)})`),
                datasets: [
                    { label: 'Bank Balance', data: topAccs.map(r => r.bankBal), backgroundColor: 'rgba(16, 185, 129, 0.88)', borderRadius: 5 },
                    { label: 'Comfort Level', data: topAccs.map(r => r.comfortLevel), backgroundColor: 'rgba(245, 158, 11, 0.78)', borderRadius: 5 }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { color: th.text, boxWidth: 10, font: { weight: '600', size: 10.5 } } } },
                scales: {
                    x: { beginAtZero: true, grid: { color: th.grid }, ticks: { color: th.muted, callback: (v) => this._fmtCompact(v), font: { size: 10 } } },
                    y: { grid: { display: false }, ticks: { color: th.text, font: { weight: '600', size: 10 } } }
                }
            }
        }));
    }
};

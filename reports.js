import { db } from './firebase-init.js';
import { collectionGroup, getDocs, query, orderBy, where, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { AppState } from './state.js';
import * as UI from './ui.js';

// ═══════════════════════════════════════════════
//  REPORTS VIEW ENTRY POINT
// ═══════════════════════════════════════════════

window.showReportsView = async () => {
    // UI Update - Hide other views
    document.getElementById('warehouses-view').classList.add('hidden');
    document.getElementById('sections-view').classList.add('hidden');
    document.getElementById('items-view').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    
    const reportsView = document.getElementById('reports-view');
    reportsView.classList.remove('hidden');
    
    document.getElementById('content-title').textContent = 'التقارير والإحصائيات';
    document.getElementById('content-count').textContent = '';
    
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = `<button class="crumb" onclick="window.navigateHome()">الرئيسية</button> <span class="crumb-separator">‹</span> <button class="crumb crumb-active">التقارير</button>`;

    // Set Loading State for summary cards
    document.getElementById('report-total-in').textContent = '...';
    document.getElementById('report-total-out').textContent = '...';
    document.getElementById('report-total-items').textContent = '...';
    
    const tbody = document.getElementById('reports-table-body');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">جاري تجميع البيانات...</td></tr>';

    // Populate cascading filters for Global History
    _populateGlobalFilters();

    // Default dates to today
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('gl-filter-from').value = todayStr;
    document.getElementById('gl-filter-to').value = todayStr;

    try {
        // Calculate Totals per Warehouse (from local AppState - zero reads)
        const whStats = AppState.warehouses.map(wh => {
            const secs = AppState.sections.filter(s => s.whId === wh.id);
            const items = AppState.items.filter(i => i.whId === wh.id);
            const totalQty = items.reduce((sum, item) => sum + item.currentStock, 0);
            return {
                name: wh.name,
                sectionCount: secs.length,
                itemCount: items.length,
                totalQty: totalQty
            };
        });

        // Render Warehouse Summary Table
        if (whStats.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد مستودعات</td></tr>';
        } else {
            tbody.innerHTML = whStats.map(stat => `
                <tr>
                    <td style="font-weight: bold;">${UI.escapeHtml(stat.name)}</td>
                    <td>${stat.sectionCount}</td>
                    <td>${stat.itemCount}</td>
                    <td><span class="badge" style="background: var(--bg-elevated); padding: 4px 8px;">${stat.totalQty.toLocaleString()}</span></td>
                </tr>
            `).join('');
        }

        // Automatically fetch history for today
        await _fetchGlobalHistory();

    } catch (error) {
        console.error("Reports Error: ", error);
        UI.showToast("حدث خطأ أثناء تجميع التقارير", "error");
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">خطأ في جلب البيانات</td></tr>';
    }
};


// ═══════════════════════════════════════════════
//  GLOBAL HISTORY LOG - CASCADING FILTERS
// ═══════════════════════════════════════════════

/**
 * Populates the filter dropdowns and attaches cascading event listeners.
 * Called once when the reports view is opened.
 */
function _populateGlobalFilters() {
    const whSelect = document.getElementById('gl-filter-wh');
    const secSelect = document.getElementById('gl-filter-sec');
    const itemSelect = document.getElementById('gl-filter-item');

    // Populate Warehouse dropdown
    whSelect.innerHTML = '<option value="">الكل</option>';
    AppState.warehouses.forEach(wh => {
        whSelect.innerHTML += `<option value="${wh.id}">${UI.escapeHtml(wh.name)}</option>`;
    });

    // Reset dependent dropdowns
    secSelect.innerHTML = '<option value="">الكل</option>';
    secSelect.disabled = true;
    itemSelect.innerHTML = '<option value="">الكل</option>';
    itemSelect.disabled = true;
}

/**
 * Cascading: When warehouse changes, populate sections for that warehouse.
 */
function _onWarehouseFilterChange() {
    const whId = document.getElementById('gl-filter-wh').value;
    const secSelect = document.getElementById('gl-filter-sec');
    const itemSelect = document.getElementById('gl-filter-item');

    secSelect.innerHTML = '<option value="">الكل</option>';
    itemSelect.innerHTML = '<option value="">الكل</option>';
    itemSelect.disabled = true;

    if (!whId) {
        secSelect.disabled = true;
        return;
    }

    const sections = AppState.sections.filter(s => s.whId === whId);
    sections.forEach(sec => {
        secSelect.innerHTML += `<option value="${sec.id}">${UI.escapeHtml(sec.name)}</option>`;
    });
    secSelect.disabled = false;
}

/**
 * Cascading: When section changes, populate items for that section.
 */
function _onSectionFilterChange() {
    const secId = document.getElementById('gl-filter-sec').value;
    const itemSelect = document.getElementById('gl-filter-item');

    itemSelect.innerHTML = '<option value="">الكل</option>';

    if (!secId) {
        itemSelect.disabled = true;
        return;
    }

    const items = AppState.items.filter(i => i.secId === secId);
    items.forEach(item => {
        itemSelect.innerHTML += `<option value="${item.id}">${UI.escapeHtml(item.name)}</option>`;
    });
    itemSelect.disabled = false;
}


// ═══════════════════════════════════════════════
//  GLOBAL HISTORY LOG - SEARCH & RENDER
// ═══════════════════════════════════════════════

const MAX_RESULTS = 1000; // Hard limit to protect the browser

/**
 * Fetches history logs from Firestore using collectionGroup('historyLog'),
 * applies server-side date filtering + client-side warehouse/section/item filtering,
 * and renders results into the global history table.
 */
async function _fetchGlobalHistory() {
    const tbody = document.getElementById('gl-history-body');
    const emptyState = document.getElementById('gl-history-empty');
    const resultsInfo = document.getElementById('gl-results-info');

    const fromVal = document.getElementById('gl-filter-from').value;
    const toVal = document.getElementById('gl-filter-to').value;
    const whId = document.getElementById('gl-filter-wh').value;
    const secId = document.getElementById('gl-filter-sec').value;
    const itemId = document.getElementById('gl-filter-item').value;

    // Show loading state
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">جاري جلب الحركات...</td></tr>';
    emptyState.classList.add('hidden');
    resultsInfo.classList.add('hidden');
    UI.setButtonLoading('btn-gl-search', true);

    try {
        // Build Firestore query with server-side constraints
        let constraints = [orderBy('date', 'desc'), limit(MAX_RESULTS)];

        if (fromVal) {
            constraints.push(where('date', '>=', new Date(fromVal)));
        }
        if (toVal) {
            const endOfDay = new Date(toVal);
            endOfDay.setHours(23, 59, 59, 999);
            constraints.push(where('date', '<=', endOfDay));
        }

        const q = query(collectionGroup(db, 'historyLog'), ...constraints);
        const snap = await getDocs(q);

        if (snap.empty) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
            resultsInfo.classList.add('hidden');
            return;
        }

        // Build an item lookup map from AppState for O(1) matching
        const itemMap = {};
        AppState.items.forEach(i => {
            itemMap[i.id] = i;
        });

        // Process results: extract itemId from doc path, enrich with AppState data
        let results = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            // Extract itemId from the document path: items/{itemId}/historyLog/{logId}
            const parentItemId = docSnap.ref.parent.parent?.id || null;
            const item = parentItemId ? itemMap[parentItemId] : null;

            results.push({
                date: data.date,
                type: data.type || '',
                quantity: data.quantity || 0,
                balanceAfter: data.balanceAfter || 0,
                note: data.note || '',
                itemId: parentItemId,
                whId: item?.whId || '',
                secId: item?.secId || '',
                whName: item?.whName || 'غير معروف',
                secName: item?.secName || 'غير معروف',
                itemName: item?.name || 'محذوف',
                unitType: item?.unitType || 'قطعة',
                cartonCapacity: item?.cartonCapacity || 1
            });
        });

        // Client-side filtering by warehouse, section, item
        if (whId) {
            results = results.filter(r => r.whId === whId);
        }
        if (secId) {
            results = results.filter(r => r.secId === secId);
        }
        if (itemId) {
            results = results.filter(r => r.itemId === itemId);
        }

        // Render results and calculate totals
        let filteredIn = 0;
        let filteredOut = 0;

        if (results.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
            resultsInfo.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');

            // Show results count info
            const limitNote = snap.size >= MAX_RESULTS ? ` (الحد الأقصى: ${MAX_RESULTS})` : '';
            resultsInfo.textContent = `عدد النتائج: ${results.length}${limitNote}`;
            resultsInfo.classList.remove('hidden');

            tbody.innerHTML = results.map(r => {
                const dObj = r.date?.toDate ? r.date.toDate() : new Date();
                const dateStr = dObj.toLocaleDateString('en-GB');
                const timeStr = dObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                const badge = r.type === 'وارد'
                    ? `<span class="badge badge-in">وارد</span>`
                    : r.type === 'صادر'
                        ? `<span class="badge badge-out">صادر</span>`
                        : `<span class="badge">${UI.escapeHtml(r.type)}</span>`;

                const qDisplay = UI.toDisplayValue(r.quantity, r.unitType, r.cartonCapacity);
                const bDisplay = UI.formatStock(r.balanceAfter, r.unitType, r.cartonCapacity);

                // Accumulate totals for summary cards
                if (r.type === 'وارد') filteredIn += r.quantity;
                else if (r.type === 'صادر') filteredOut += r.quantity;

                return `<tr>
                    <td>${dateStr}</td>
                    <td>${timeStr}</td>
                    <td>${UI.escapeHtml(r.whName)}</td>
                    <td>${UI.escapeHtml(r.secName)}</td>
                    <td style="font-weight: 500;">${UI.escapeHtml(r.itemName)}</td>
                    <td>${badge}</td>
                    <td style="font-weight: bold;">${qDisplay}</td>
                    <td>${bDisplay}</td>
                    <td>${UI.escapeHtml(r.note || '-')}</td>
                </tr>`;
            }).join('');
        }

        // Update Summary Cards dynamically based on filtered results
        document.getElementById('report-total-in').textContent = filteredIn.toLocaleString();
        document.getElementById('report-total-out').textContent = filteredOut.toLocaleString();
        document.getElementById('report-total-items').textContent = results.length;

    } catch (error) {
        console.error("Global History Error:", error);

        // Print Firebase Index link explicitly if required
        if (error.message && (error.message.includes('index') || error.message.includes('requires an index'))) {
            console.error("═══════════════════════════════════════════════");
            console.error("🔗 Firebase Index مطلوب! اضغط على الرابط التالي لإنشائه:");
            console.error(error.message);
            console.error("═══════════════════════════════════════════════");
            UI.showToast("يتطلب إنشاء فهرس في Firebase. افتح الكونسول (F12) واضغط على الرابط.", "warning");
        } else {
            UI.showToast("حدث خطأ أثناء جلب سجل الحركات", "error");
        }

        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--danger);">خطأ في جلب البيانات - تحقق من الكونسول</td></tr>';
        document.getElementById('report-total-in').textContent = 'خطأ';
        document.getElementById('report-total-out').textContent = 'خطأ';
        document.getElementById('report-total-items').textContent = 'خطأ';
    } finally {
        UI.setButtonLoading('btn-gl-search', false);
    }
}

/**
 * Resets all global history filters to their default state.
 */
function _resetGlobalFilters() {
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('gl-filter-from').value = todayStr;
    document.getElementById('gl-filter-to').value = todayStr;
    document.getElementById('gl-filter-wh').value = '';
    
    const secSelect = document.getElementById('gl-filter-sec');
    secSelect.innerHTML = '<option value="">الكل</option>';
    secSelect.disabled = true;
    
    const itemSelect = document.getElementById('gl-filter-item');
    itemSelect.innerHTML = '<option value="">الكل</option>';
    itemSelect.disabled = true;

    // Trigger search to refresh table and totals with today's date
    _fetchGlobalHistory();
}


// ═══════════════════════════════════════════════
//  EVENT LISTENERS (Isolated - DOMContentLoaded)
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Cascading filter listeners
    const whFilter = document.getElementById('gl-filter-wh');
    const secFilter = document.getElementById('gl-filter-sec');
    
    if (whFilter) whFilter.addEventListener('change', _onWarehouseFilterChange);
    if (secFilter) secFilter.addEventListener('change', _onSectionFilterChange);

    // Search button
    const searchBtn = document.getElementById('btn-gl-search');
    if (searchBtn) searchBtn.addEventListener('click', _fetchGlobalHistory);

    // Reset button
    const resetBtn = document.getElementById('btn-gl-reset');
    if (resetBtn) resetBtn.addEventListener('click', _resetGlobalFilters);
});

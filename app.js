import { db, auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { AppState } from './state.js';
import * as UI from './ui.js';
import { 
    startInventoryListeners, 
    addWarehouse, editWarehouse, deleteWarehouse, 
    addSection, editSection, deleteSection,
    addItem, editItem, deleteItem,
    processStockTransaction, processTransferTransaction
} from './inventory.js';
import { initPinFeature, sortSectionsWithPinned } from './pin-sections.js';

// ═══════════════════════════════════════════════
//  APP INITIALIZATION & AUTH STATE
// ═══════════════════════════════════════════════

initPinFeature();
UI.initUIEventListeners();

onAuthStateChanged(auth, async (user) => {
    const loginOverlay = document.getElementById('login-overlay');
    if (user) {
        AppState.currentUser = user;
        
        if (!AppState.userRole) {
            try {
                const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
                const userDoc = await getDoc(doc(db, 'users', user.uid));

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    AppState.userRole = data.role;
                    AppState.userLoginId = data.loginId;
                    document.getElementById('btn-user-management').classList.toggle('hidden', AppState.userRole === 'worker' || AppState.userRole === 'viewer');
                } else {
                    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
                    await signOut(auth);
                    alert('خطأ: حسابك غير مسجل في قاعدة بيانات الصلاحيات. راجع الإدارة.');
                    return;
                }
            } catch (err) {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
                await signOut(auth);
                return;
            }
        }
        
        loginOverlay.classList.add('hidden');
        await window.initApp();
    } else {
        AppState.currentUser = null;
        AppState.userRole = null;
        loginOverlay.classList.remove('hidden');
        
        // إعادة تفعيل زر الدخول بعد انتهاء تحقق فاير بيز
        const btnLogin = document.getElementById('btn-login');
        if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.textContent = 'دخول';
        }
    }
});

window.initApp = async () => {
    const spinner = document.getElementById('loading-spinner');
    spinner.classList.remove('hidden');
    
    // Start real-time listeners (replaces old loadAllData one-time fetch)
    startInventoryListeners();
    UI.applyRBAC();
    
    // The listeners will populate AppState and trigger renders automatically.
    // We just set initial view.
    window.navigateHome();
    spinner.classList.add('hidden');
};

// ═══════════════════════════════════════════════
//  NAVIGATION & DASHBOARD CONTROLLER
// ═══════════════════════════════════════════════

window.rerenderCurrentView = () => {
    if (AppState.currentView === 'warehouses') {
        UI.renderWarehouses();
    } else if (AppState.currentView === 'sections' && AppState.selectedWarehouseId) {
        UI.renderSections(AppState.selectedWarehouseId);
    } else if (AppState.currentView === 'items' && AppState.selectedWarehouseId && AppState.selectedSectionId) {
        UI.renderItems(AppState.selectedWarehouseId, AppState.selectedSectionId);
    }
    window.updateDashboard();
};

window.navigateHome = () => {
    AppState.currentView = 'warehouses';
    AppState.selectedWarehouseId = null;
    AppState.selectedSectionId = null;
    
    document.getElementById('sections-view').classList.add('hidden');
    document.getElementById('items-view').classList.add('hidden');
    document.getElementById('reports-view').classList.add('hidden');
    
    UI.updateBreadcrumb();
    UI.populateWarehouseFilterOptions();
    document.getElementById('warehouse-filter').value = '';
    
    const secFilter = document.getElementById('section-filter');
    secFilter.innerHTML = '<option value="">كل الأقسام</option>';
    secFilter.disabled = true;
    
    document.getElementById('content-title').textContent = 'المستودعات';
    document.getElementById('content-count').textContent = `(${AppState.warehouses.length})`;
    
    UI.renderWarehouses();
};

window.navigateToWarehouse = (whId) => {
    AppState.currentView = 'sections';
    AppState.selectedWarehouseId = whId;
    AppState.selectedSectionId = null;
    
    document.getElementById('warehouses-view').classList.add('hidden');
    document.getElementById('items-view').classList.add('hidden');
    document.getElementById('reports-view').classList.add('hidden');
    
    UI.updateBreadcrumb();
    UI.populateWarehouseFilterOptions();
    document.getElementById('warehouse-filter').value = whId;
    
    UI.populateSectionFilterOptions(whId);
    document.getElementById('section-filter').value = '';
    
    const wh = AppState.warehouses.find(w => w.id === whId);
    document.getElementById('content-title').textContent = wh ? wh.name : 'الأقسام';
    
    const secCount = AppState.sections.filter(s => s.whId === whId).length;
    document.getElementById('content-count').textContent = `(${secCount})`;
    
    UI.renderSections(whId);
};

window.navigateToSection = (whId, secId) => {
    AppState.currentView = 'items';
    AppState.selectedWarehouseId = whId;
    AppState.selectedSectionId = secId;
    
    document.getElementById('warehouses-view').classList.add('hidden');
    document.getElementById('sections-view').classList.add('hidden');
    document.getElementById('reports-view').classList.add('hidden');
    
    UI.updateBreadcrumb();
    UI.populateWarehouseFilterOptions();
    document.getElementById('warehouse-filter').value = whId;
    
    UI.populateSectionFilterOptions(whId);
    document.getElementById('section-filter').value = secId;
    
    const sec = AppState.sections.find(s => s.id === secId);
    document.getElementById('content-title').textContent = sec ? sec.name : 'الأصناف';
    
    const itemCount = AppState.items.filter(i => i.whId === whId && i.secId === secId).length;
    document.getElementById('content-count').textContent = `(${itemCount})`;
    
    UI.renderItems(whId, secId);
};

window.goToItem = (whId, secId, itemId) => {
    window.navigateToSection(whId, secId);
    window.closeSearch();
    setTimeout(() => {
        const itemCard = document.querySelector(`.item-card[data-item-id="${itemId}"]`);
        if (itemCard) {
            itemCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            itemCard.classList.remove('search-highlight-target');
            // Trigger reflow to restart animation if clicked multiple times
            void itemCard.offsetWidth; 
            itemCard.classList.add('search-highlight-target');
        }
    }, 100);
};
window.updateDashboard = () => {
    document.getElementById('stat-warehouses').textContent = AppState.warehouses.length;
    document.getElementById('stat-sections').textContent = AppState.sections.length;
    document.getElementById('stat-items').textContent = AppState.items.length;
    
    const lowStockItems = AppState.items.filter(i => i.minStockLevel > 0 && i.currentStock <= i.minStockLevel);
    document.getElementById('stat-low-stock').textContent = lowStockItems.length;
    UI.renderLowStockAlerts(lowStockItems);
};

// ═══════════════════════════════════════════════
//  MODAL OPENERS & EVENT BINDINGS
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // ADD BUTTONS
    document.getElementById('btn-add-warehouse').addEventListener('click', () => {
        if (AppState.userRole === 'worker' || AppState.userRole === 'viewer') { UI.showToast('غير مصرح لك بإضافة مستودع', 'error'); return; }
        document.getElementById('wh-modal-title').textContent = 'إضافة مستودع جديد';
        document.getElementById('wh-edit-id').value = '';
        UI.openModal('warehouse-modal');
    });

    document.getElementById('btn-add-section').addEventListener('click', () => {
        if (AppState.userRole === 'worker' || AppState.userRole === 'viewer') { UI.showToast('غير مصرح لك بإضافة قسم', 'error'); return; }
        document.getElementById('sec-modal-title').textContent = 'إضافة قسم جديد';
        document.getElementById('sec-edit-id').value = '';
        UI.populateWarehouseSelect('sec-warehouse-select', AppState.selectedWarehouseId);
        UI.openModal('section-modal');
    });

    document.getElementById('btn-add-item').addEventListener('click', () => {
        if (AppState.userRole === 'viewer') { UI.showToast('غير مصرح لك بإضافة صنف', 'error'); return; }
        document.getElementById('item-modal-title').textContent = 'إضافة صنف جديد';
        document.getElementById('item-edit-id').value = '';
        document.getElementById('item-initial-stock').disabled = false;
        
        UI.populateWarehouseSelect('item-warehouse-select', AppState.selectedWarehouseId);
        UI.populateSectionSelect('item-section-select', AppState.selectedWarehouseId, AppState.selectedSectionId);
        UI.openModal('item-modal');
    });

    // WAREHOUSE FORM
    document.getElementById('warehouse-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('wh-edit-id').value;
        const name = document.getElementById('wh-name').value.trim();
        UI.setButtonLoading('wh-submit-btn', true);
        if (id) await editWarehouse(id, name);
        else await addWarehouse(name);
        UI.setButtonLoading('wh-submit-btn', false);
    });

    // SECTION FORM
    document.getElementById('section-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('sec-edit-id').value;
        const whId = document.getElementById('sec-warehouse-select').value;
        const name = document.getElementById('sec-name').value.trim();
        UI.setButtonLoading('sec-submit-btn', true);
        if (id) await editSection(whId, id, name);
        else await addSection(whId, name);
        UI.setButtonLoading('sec-submit-btn', false);
    });

    // ITEM FORM
    document.getElementById('item-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('item-edit-id').value;
        const whId = document.getElementById('item-warehouse-select').value;
        const secId = document.getElementById('item-section-select').value;
        const name = document.getElementById('item-name').value.trim();
        const unitType = document.getElementById('item-unit').value;
        const cartonCap = parseInt(document.getElementById('item-carton-cap').value) || 1;
        const initialStock = parseFloat(document.getElementById('item-initial-stock').value) || 0;
        const minStockLevel = parseFloat(document.getElementById('item-min-stock').value) || 0;

        const data = { name, unitType, cartonCapacity: cartonCap, initialStock: UI.toBaseUnit(initialStock, unitType, cartonCap), minStockLevel: UI.toBaseUnit(minStockLevel, unitType, cartonCap) };
        
        UI.setButtonLoading('item-submit-btn', true);
        if (id) {
            data.currentStock = UI.toBaseUnit(initialStock, unitType, cartonCap); // Used if manual edit occurred
            await editItem(whId, secId, id, data);
        } else {
            await addItem(whId, secId, data);
        }
        UI.setButtonLoading('item-submit-btn', false);
    });

    // STOCK FORM (IN/OUT)
    document.getElementById('stock-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const whId = document.getElementById('stock-wh-id').value;
        const secId = document.getElementById('stock-sec-id').value;
        const itemId = document.getElementById('stock-item-id').value;
        const type = document.getElementById('stock-type').value;
        const qty = document.getElementById('stock-qty').value;
        const note = document.getElementById('stock-note').value.trim();

        UI.setButtonLoading('stock-submit-btn', true);
        await processStockTransaction(whId, secId, itemId, type, qty, note);
        UI.setButtonLoading('stock-submit-btn', false);
    });

    // TRANSFER FORM
    document.getElementById('transfer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const sourceItemId = document.getElementById('transfer-source-item-id').value;
        const sourceWhId = document.getElementById('transfer-source-wh-id').value;
        const sourceSecId = document.getElementById('transfer-source-sec-id').value;
        
        const destWhId = document.getElementById('transfer-dest-wh').value;
        const destSecId = document.getElementById('transfer-dest-sec').value;
        const qty = document.getElementById('transfer-qty').value;

        if (sourceWhId === destWhId && sourceSecId === destSecId) {
            UI.showToast('لا يمكن نقل المخزون إلى نفس القسم', 'error');
            return;
        }

        UI.setButtonLoading('transfer-submit-btn', true);
        await processTransferTransaction(sourceItemId, sourceWhId, sourceSecId, destWhId, destSecId, qty);
        UI.setButtonLoading('transfer-submit-btn', false);
    });

    // CONFIRM DELETE MODAL
    document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
        if (AppState.pendingDeleteCallback) {
            UI.setButtonLoading('btn-confirm-delete', true);
            await AppState.pendingDeleteCallback();
            UI.setButtonLoading('btn-confirm-delete', false);
            UI.closeModal('confirm-modal');
        }
    });

    // FILTERS & SELECT DYNAMICS
    document.getElementById('warehouse-filter').addEventListener('change', (e) => {
        const val = e.target.value;
        setTimeout(() => {
            if (val) window.navigateToWarehouse(val);
            else window.navigateHome();
        }, 0);
    });

    document.getElementById('section-filter').addEventListener('change', (e) => {
        const whId = document.getElementById('warehouse-filter').value;
        const val = e.target.value;
        setTimeout(() => {
            if (val) window.navigateToSection(whId, val);
            else if (whId) window.navigateToWarehouse(whId);
        }, 0);
    });

    document.getElementById('item-warehouse-select').addEventListener('change', (e) => {
        UI.populateSectionSelect('item-section-select', e.target.value);
    });

    document.getElementById('transfer-dest-wh').addEventListener('change', (e) => {
        UI.populateSectionSelect('transfer-dest-sec', e.target.value);
    });

    // UNIT SELECT TOGGLE
    document.getElementById('item-unit').addEventListener('change', (e) => {
        UI.toggleCartonCapField(e.target.value);
    });

    // LOW STOCK PANEL TOGGLE
    document.getElementById('stat-card-low-stock').addEventListener('click', () => {
        const lsPanel = document.getElementById('low-stock-panel');
        lsPanel.classList.toggle('hidden');
        const qvPanel = document.getElementById('quick-view-panel');
        if(qvPanel) qvPanel.classList.add('hidden');
    });
    document.getElementById('btn-close-low-stock').addEventListener('click', () => {
        document.getElementById('low-stock-panel').classList.add('hidden');
    });

    // QUICK VIEW PANELS
    document.getElementById('stat-card-warehouses').addEventListener('click', () => {
        UI.renderQuickViewPanel('warehouses', AppState.warehouses);
    });
    document.getElementById('stat-card-sections').addEventListener('click', () => {
        // Apply the same FIFO pin-sort used in renderSections for full consistency
        UI.renderQuickViewPanel('sections', sortSectionsWithPinned(AppState.sections));
    });
    document.getElementById('stat-card-items').addEventListener('click', () => {
        const sortedItems = [...AppState.items].sort((a, b) => b.createdAt - a.createdAt);
        UI.renderQuickViewPanel('items', sortedItems.slice(0, 10));
    });

    // GLOBAL SEARCH
    const searchInput = document.getElementById('global-search');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => globalSearch(e.target.value), 250);
    });
    
    // HISTORY FILTER BUTTON
    document.getElementById('btn-filter-history').addEventListener('click', () => {
        const itemId = document.getElementById('btn-filter-history').dataset.itemId;
        if (itemId) fetchAndRenderHistory(itemId);
    });
});

// ═══════════════════════════════════════════════
//  EXPORTED GLOBAL ACTIONS
// ═══════════════════════════════════════════════

window.openEditWarehouse = (whId) => {
    if (AppState.userRole === 'worker' || AppState.userRole === 'viewer') { UI.showToast('غير مصرح', 'error'); return; }
    const wh = AppState.warehouses.find(w => w.id === whId);
    if (!wh) return;
    document.getElementById('wh-modal-title').textContent = 'تعديل مستودع';
    document.getElementById('wh-edit-id').value = wh.id;
    document.getElementById('wh-name').value = wh.name;
    UI.openModal('warehouse-modal');
};

window.confirmDeleteWarehouse = (whId, name) => {
    if (AppState.userRole !== 'superadmin' && AppState.userRole !== 'owner') { UI.showToast('غير مصرح لك بالحذف', 'error'); return; }
    document.getElementById('confirm-message').textContent = `هل أنت متأكد من حذف المستودع "${name}"؟ سيتم حذف جميع الأقسام والأصناف بداخله.`;
    AppState.pendingDeleteCallback = async () => await deleteWarehouse(whId);
    UI.openModal('confirm-modal');
};

window.openEditSection = (whId, secId) => {
    if (AppState.userRole === 'worker' || AppState.userRole === 'viewer') { UI.showToast('غير مصرح', 'error'); return; }
    const sec = AppState.sections.find(s => s.id === secId);
    if (!sec) return;
    document.getElementById('sec-modal-title').textContent = 'تعديل قسم';
    document.getElementById('sec-edit-id').value = sec.id;
    UI.populateWarehouseSelect('sec-warehouse-select', whId);
    document.getElementById('sec-name').value = sec.name;
    UI.openModal('section-modal');
};

window.confirmDeleteSection = (whId, secId, name) => {
    if (AppState.userRole !== 'superadmin' && AppState.userRole !== 'owner') { UI.showToast('غير مصرح', 'error'); return; }
    document.getElementById('confirm-message').textContent = `هل أنت متأكد من حذف القسم "${name}"؟ سيتم حذف جميع الأصناف بداخله.`;
    AppState.pendingDeleteCallback = async () => await deleteSection(whId, secId);
    UI.openModal('confirm-modal');
};

window.openEditItem = (whId, secId, itemId) => {
    if (AppState.userRole === 'worker' || AppState.userRole === 'viewer') { UI.showToast('غير مصرح', 'error'); return; }
    const item = AppState.items.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('item-modal-title').textContent = 'تعديل صنف';
    document.getElementById('item-edit-id').value = item.id;
    
    UI.populateWarehouseSelect('item-warehouse-select', whId);
    UI.populateSectionSelect('item-section-select', whId, secId);
    
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-unit').value = item.unitType;
    
    UI.toggleCartonCapField(item.unitType);
    if (item.unitType === 'كرتونة') {
        document.getElementById('item-carton-cap').value = item.cartonCapacity;
    }
    
    document.getElementById('item-initial-stock').value = UI.toDisplayValue(item.currentStock, item.unitType, item.cartonCapacity);
    document.getElementById('item-min-stock').value = UI.toDisplayValue(item.minStockLevel, item.unitType, item.cartonCapacity);
    
    UI.openModal('item-modal');
};

window.confirmDeleteItem = (whId, secId, itemId, name) => {
    if (AppState.userRole !== 'superadmin' && AppState.userRole !== 'owner') { UI.showToast('غير مصرح', 'error'); return; }
    document.getElementById('confirm-message').textContent = `هل أنت متأكد من حذف الصنف "${name}"؟`;
    AppState.pendingDeleteCallback = async () => await deleteItem(whId, secId, itemId);
    UI.openModal('confirm-modal');
};

window.openStockModal = (whId, secId, itemId, type) => {
    if (AppState.userRole === 'viewer') { UI.showToast('غير مصرح لك بإجراء عمليات المخزون', 'error'); return; }
    const item = AppState.items.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('stock-wh-id').value = whId;
    document.getElementById('stock-sec-id').value = secId;
    document.getElementById('stock-item-id').value = itemId;
    document.getElementById('stock-unit-type').value = item.unitType;
    document.getElementById('stock-carton-cap').value = item.cartonCapacity || 1;
    
    document.getElementById('stock-item-name').textContent = item.name;
    document.getElementById('stock-item-current').textContent = UI.formatStock(item.currentStock, item.unitType, item.cartonCapacity);
    
    document.getElementById('stock-type').value = type;
    document.getElementById('stock-qty-hint').textContent = UI.getUnitHint(item.unitType);
    
    UI.openModal('stock-modal');
};

window.openTransferModal = (itemId) => {
    if (AppState.userRole === 'viewer') { UI.showToast('غير مصرح لك بعمليات النقل', 'error'); return; }
    const item = AppState.items.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('transfer-source-item-id').value = item.id;
    document.getElementById('transfer-source-wh-id').value = item.whId;
    document.getElementById('transfer-source-sec-id').value = item.secId;
    document.getElementById('transfer-unit-type').value = item.unitType;
    document.getElementById('transfer-carton-cap').value = item.cartonCapacity || 1;
    
    document.getElementById('transfer-item-name').textContent = item.name;
    document.getElementById('transfer-item-current').textContent = UI.formatStock(item.currentStock, item.unitType, item.cartonCapacity);
    
    UI.populateWarehouseSelect('transfer-dest-wh');
    document.getElementById('transfer-dest-sec').innerHTML = '<option value="">اختر القسم...</option>';
    document.getElementById('transfer-dest-sec').disabled = true;
    
    document.getElementById('transfer-qty-hint').textContent = UI.getUnitHint(item.unitType);
    
    UI.openModal('transfer-modal');
};

window.openHistoryModal = (whId, secId, itemId) => {
    const item = AppState.items.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('history-item-name').textContent = item.name;
    
    // Set default dates (From: 30 days ago, To: Today)
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    
    document.getElementById('history-filter-from').value = fromDate.toISOString().split('T')[0];
    document.getElementById('history-filter-to').value = toDate.toISOString().split('T')[0];
    
    // Store itemId on the filter button for later use
    document.getElementById('btn-filter-history').dataset.itemId = itemId;

    UI.openModal('history-modal');
    fetchAndRenderHistory(itemId);
};

async function fetchAndRenderHistory(itemId) {
    const item = AppState.items.find(i => i.id === itemId);
    if (!item) return;

    const tbody = document.getElementById('history-table-body');
    const emptyState = document.getElementById('history-empty');
    const btn = document.getElementById('btn-filter-history');
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">جاري التحميل...</td></tr>';
    emptyState.classList.add('hidden');
    UI.setButtonLoading('btn-filter-history', true);

    try {
        let q = collection(db, `items/${itemId}/historyLog`);
        
        const fromVal = document.getElementById('history-filter-from').value;
        const toVal = document.getElementById('history-filter-to').value;
        
        // Build query constraints
        const constraints = [orderBy('date', 'desc')];
        
        if (fromVal) {
            constraints.push(where('date', '>=', new Date(fromVal)));
        }
        if (toVal) {
            const endOfDay = new Date(toVal);
            endOfDay.setHours(23, 59, 59, 999);
            constraints.push(where('date', '<=', endOfDay));
        }

        q = query(q, ...constraints);
        const snap = await getDocs(q);
        
        if (snap.empty) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            tbody.innerHTML = snap.docs.map(d => {
                const data = d.data();
                const dObj = data.date?.toDate() || new Date();
                const dateStr = dObj.toLocaleDateString('en-GB');
                const timeStr = dObj.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
                const badge = data.type === 'وارد' ? `<span class="badge badge-in">وارد</span>` : `<span class="badge badge-out">صادر</span>`;
                const qDisplay = UI.toDisplayValue(data.quantity, item.unitType, item.cartonCapacity);
                const bDisplay = UI.formatStock(data.balanceAfter, item.unitType, item.cartonCapacity);
                
                return `<tr>
                    <td>${dateStr}</td>
                    <td>${timeStr}</td>
                    <td>${badge}</td>
                    <td style="font-weight:bold;">${qDisplay}</td>
                    <td>${bDisplay}</td>
                    <td>${UI.escapeHtml(data.note || '-')}</td>
                </tr>`;
            }).join('');
        }
    } catch (error) {
        console.error("Error fetching history:", error);
        UI.showToast("حدث خطأ أثناء جلب السجل", "error");
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">خطأ في جلب السجل</td></tr>';
    } finally {
        UI.setButtonLoading('btn-filter-history', false);
    }
}

function globalSearch(queryStr) {
    const resultsDiv = document.getElementById('search-results');
    if (!queryStr || queryStr.length < 2) {
        resultsDiv.classList.add('hidden');
        return;
    }

    const qLower = queryStr.toLowerCase();
    const results = AppState.items.filter(i => 
        (i.name && i.name.toLowerCase().includes(qLower)) || 
        (i.whName && i.whName.toLowerCase().includes(qLower)) || 
        (i.secName && i.secName.toLowerCase().includes(qLower))
    ).slice(0, 10); // Limit to 10

    if (results.length === 0) {
        resultsDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted);">لا توجد نتائج</div>';
    } else {
        resultsDiv.innerHTML = results.map(i => {
            const isLow = i.minStockLevel > 0 && i.currentStock <= i.minStockLevel;
            const stockColor = isLow ? 'var(--danger-light)' : 'var(--success-light)';
            return `
                <div class="search-result-item" onclick="window.goToItem('${i.whId}', '${i.secId}', '${i.id}')">
                    <div style="font-weight: 500;">${UI.escapeHtml(i.name)}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${i.whName} ← ${i.secName}</div>
                    <div style="font-size: 0.85rem; color: ${stockColor}; margin-top: 4px;">
                        الرصيد: ${UI.formatStock(i.currentStock, i.unitType, i.cartonCapacity)}
                    </div>
                </div>
            `;
        }).join('');
    }
    resultsDiv.classList.remove('hidden');
}

window.closeSearch = () => {
    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('global-search').value = '';
};
document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-search')) window.closeSearch();
});
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search').focus();
    }
});

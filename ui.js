import { AppState } from './state.js';

// ═══════════════════════════════════════════════
//  UNIT CONVERSION MATH
// ═══════════════════════════════════════════════

export function toBaseUnit(displayValue, unitType, cartonCapacity) {
    const value = parseFloat(displayValue) || 0;
    switch (unitType) {
        case 'كيلو جرام': return Math.round(value * 1000);
        case 'كرتونة':    return Math.round(value) * (cartonCapacity || 1);
        case 'قطعة':
        default:           return Math.round(value);
    }
}

export function formatStock(baseStock, unitType, cartonCapacity) {
    const stock = Math.max(0, baseStock || 0);
    switch (unitType) {
        case 'كيلو جرام': {
            const kg = stock / 1000;
            return kg.toFixed(3).replace(/\.?0+$/, '') + ' كجم';
        }
        case 'كرتونة': {
            const cap = cartonCapacity || 1;
            const cartons = Math.floor(stock / cap);
            const remainder = stock % cap;
            if (cartons === 0 && remainder === 0) return '0';
            if (remainder === 0) return cartons + ' كراتين';
            if (cartons === 0) return remainder + ' قطع';
            return cartons + ' كراتين و ' + remainder + ' قطع';
        }
        case 'قطعة':
        default:
            return stock + ' قطعة';
    }
}

export function getUnitHint(unitType) {
    switch (unitType) {
        case 'كيلو جرام': return '(بالكيلوجرام)';
        case 'كرتونة':    return '(بعدد الكراتين)';
        default:           return '(بالقطعة)';
    }
}

export function toDisplayValue(baseStock, unitType, cartonCapacity) {
    switch (unitType) {
        case 'كيلو جرام': return parseFloat((baseStock / 1000).toFixed(3));
        case 'كرتونة':    return Math.floor(baseStock / (cartonCapacity || 1));
        default:           return baseStock;
    }
}

export function toggleCartonCapField(unitType) {
    const group = document.getElementById('carton-cap-group');
    if (group) {
        if (unitType === 'كرتونة') {
            group.style.display = 'block';
            document.getElementById('item-carton-cap').required = true;
        } else {
            group.style.display = 'none';
            document.getElementById('item-carton-cap').required = false;
        }
    }
    
    const hintStr = getUnitHint(unitType);
    const h1 = document.getElementById('stock-unit-hint');
    const h2 = document.getElementById('min-stock-unit-hint');
    if (h1) h1.textContent = hintStr;
    if (h2) h2.textContent = hintStr;
}


// ═══════════════════════════════════════════════
//  MODAL & TOAST MANAGEMENT
// ═══════════════════════════════════════════════

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        const firstInput = modal.querySelector('input:not([type="hidden"]), select');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        const form = modal.querySelector('form');
        if (form) form.reset();
        modal.querySelectorAll('input[type="hidden"]').forEach(h => h.value = '');
    }
}

export function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const textEl = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');
    if (loading) {
        btn.disabled = true;
        if (textEl) textEl.style.display = 'none';
        if (loaderEl) loaderEl.classList.remove('hidden');
    } else {
        btn.disabled = false;
        if (textEl) textEl.style.display = '';
        if (loaderEl) loaderEl.classList.add('hidden');
    }
}


// ═══════════════════════════════════════════════
//  DOM RENDERING & POPULATION
// ═══════════════════════════════════════════════

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
}

export function escapeJsString(text) {
    if (!text) return '';
    return text.toString().replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export function populateWarehouseSelect(selectId, selectedValue) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">اختر المستودع...</option>';
    AppState.warehouses.forEach(wh => {
        const opt = document.createElement('option');
        opt.value = wh.id;
        opt.textContent = wh.name;
        if (selectedValue === wh.id) opt.selected = true;
        select.appendChild(opt);
    });
}

export function populateSectionSelect(selectId, whId, selectedValue) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">اختر القسم...</option>';
    if (!whId) {
        select.disabled = true;
        return;
    }
    select.disabled = false;
    AppState.sections.filter(s => s.whId === whId).forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = sec.name;
        if (selectedValue === sec.id) opt.selected = true;
        select.appendChild(opt);
    });
}

export function populateWarehouseFilterOptions() {
    const select = document.getElementById('warehouse-filter');
    const currentValue = select.value;
    select.innerHTML = '<option value="">كل المستودعات</option>';
    AppState.warehouses.forEach(wh => {
        const opt = document.createElement('option');
        opt.value = wh.id;
        opt.textContent = wh.name;
        select.appendChild(opt);
    });
    select.value = currentValue;
}

export function populateSectionFilterOptions(whId) {
    const select = document.getElementById('section-filter');
    select.innerHTML = '<option value="">كل الأقسام</option>';
    if (!whId) {
        select.disabled = true;
        return;
    }
    select.disabled = false;
    AppState.sections.filter(s => s.whId === whId).forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = sec.name;
        select.appendChild(opt);
    });
}

export function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = `<button class="crumb ${AppState.currentView === 'warehouses' ? 'crumb-active' : ''}" onclick="window.navigateHome()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg> الرئيسية
    </button>`;

    if (AppState.selectedWarehouseId) {
        const wh = AppState.warehouses.find(w => w.id === AppState.selectedWarehouseId);
        if (wh) {
            html += `<span class="crumb-separator">‹</span>`;
            html += `<button class="crumb ${AppState.currentView === 'sections' ? 'crumb-active' : ''}" onclick="window.navigateToWarehouse('${wh.id}')">${escapeHtml(wh.name)}</button>`;
        }
    }

    if (AppState.selectedSectionId) {
        const sec = AppState.sections.find(s => s.id === AppState.selectedSectionId);
        if (sec) {
            html += `<span class="crumb-separator">‹</span>`;
            html += `<button class="crumb crumb-active">${escapeHtml(sec.name)}</button>`;
        }
    }
    breadcrumb.innerHTML = html;
}

export function renderWarehouses() {
    const container = document.getElementById('warehouses-view');
    const emptyState = document.getElementById('empty-state');
    if (AppState.warehouses.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        document.getElementById('empty-text').textContent = 'لا توجد مستودعات';
        document.getElementById('empty-sub').textContent = 'ابدأ بإضافة مستودع جديد';
        return;
    }
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    container.innerHTML = AppState.warehouses.map(wh => {
        const sectionCount = AppState.sections.filter(s => s.whId === wh.id).length;
        const itemCount = AppState.items.filter(i => i.whId === wh.id).length;
        return `
            <div class="nav-card fade-in" data-wh-id="${wh.id}" onclick="window.navigateToWarehouse('${wh.id}')">
                <div class="nav-card-header">
                    <span class="nav-card-name">${escapeHtml(wh.name)}</span>
                    <div class="nav-card-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); window.openEditWarehouse('${wh.id}')" title="تعديل">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon" onclick="event.stopPropagation(); window.confirmDeleteWarehouse('${wh.id}', '${escapeJsString(wh.name)}')" title="حذف">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="nav-card-meta">
                    <span class="nav-card-badge">${sectionCount} قسم</span>
                    <span class="nav-card-badge">${itemCount} صنف</span>
                </div>
            </div>`;
    }).join('');
}

export function renderSections(whId) {
    const container = document.getElementById('sections-view');
    const emptyState = document.getElementById('empty-state');
    const filtered = AppState.sections.filter(s => s.whId === whId);
    if (filtered.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        document.getElementById('empty-text').textContent = 'لا توجد أقسام في هذا المستودع';
        document.getElementById('empty-sub').textContent = 'أضف قسم جديد للبدء';
        return;
    }
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    container.innerHTML = filtered.map(sec => {
        const itemCount = AppState.items.filter(i => i.whId === whId && i.secId === sec.id).length;
        return `
            <div class="nav-card fade-in" data-sec-id="${sec.id}" onclick="window.navigateToSection('${whId}', '${sec.id}')">
                <div class="nav-card-header">
                    <span class="nav-card-name">${escapeHtml(sec.name)}</span>
                    <div class="nav-card-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); window.openEditSection('${whId}', '${sec.id}')" title="تعديل">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon" onclick="event.stopPropagation(); window.confirmDeleteSection('${whId}', '${sec.id}', '${escapeJsString(sec.name)}')" title="حذف">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="nav-card-meta">
                    <span class="nav-card-badge">${itemCount} صنف</span>
                </div>
            </div>`;
    }).join('');
}

export function renderItems(whId, secId) {
    const container = document.getElementById('items-view');
    const emptyState = document.getElementById('empty-state');
    const filtered = AppState.items.filter(i => i.whId === whId && i.secId === secId);
    if (filtered.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        document.getElementById('empty-text').textContent = 'لا توجد أصناف في هذا القسم';
        document.getElementById('empty-sub').textContent = 'أضف صنف جديد للبدء';
        return;
    }
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    container.innerHTML = filtered.map(item => buildItemCard(item)).join('');
}

function buildItemCard(item) {
    const stockDisplay = formatStock(item.currentStock, item.unitType, item.cartonCapacity);
    const minDisplay = formatStock(item.minStockLevel, item.unitType, item.cartonCapacity);
    let statusClass = 'stock-healthy', barClass = 'bar-healthy', barWidth = 100;
    
    if (item.minStockLevel > 0) {
        const ratio = item.currentStock / item.minStockLevel;
        if (ratio <= 0.5) { statusClass = 'stock-critical'; barClass = 'bar-critical'; }
        else if (ratio <= 1) { statusClass = 'stock-warning'; barClass = 'bar-warning'; }
        barWidth = Math.min(100, Math.round((item.currentStock / (item.minStockLevel * 2)) * 100));
    }
    return `
        <div class="item-card ${statusClass} fade-in" data-item-id="${item.id}">
            <div class="item-card-header">
                <span class="item-name">${escapeHtml(item.name)}</span>
                <span class="item-unit-badge">${item.unitType}</span>
            </div>
            <div class="item-stock-section">
                <div class="item-stock-row"><span class="item-stock-label">المخزون الحالي</span><span class="item-stock-value">${stockDisplay}</span></div>
                <div class="stock-bar-wrapper"><div class="stock-bar ${barClass}" style="width: ${barWidth}%"></div></div>
                <div class="item-min-stock">حد الطلب: ${minDisplay}</div>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm btn-outline btn-stock-in" onclick="window.openStockModal('${item.whId}','${item.secId}','${item.id}','وارد')">+ وارد</button>
                <button class="btn btn-sm btn-outline btn-stock-out" onclick="window.openStockModal('${item.whId}','${item.secId}','${item.id}','صادر')">- صادر</button>
                <button class="btn btn-sm btn-outline btn-transfer" onclick="window.openTransferModal('${item.id}')" style="color: var(--accent); border-color: var(--border-light);">نقل</button>
                <button class="btn btn-sm btn-outline btn-history" onclick="window.openHistoryModal('${item.whId}','${item.secId}','${item.id}')">سجل</button>
                <button class="btn btn-sm btn-outline btn-edit" onclick="window.openEditItem('${item.whId}','${item.secId}','${item.id}')">تعديل</button>
                <button class="btn btn-sm btn-outline btn-delete" onclick="window.confirmDeleteItem('${item.whId}','${item.secId}','${item.id}','${escapeJsString(item.name)}')">حذف</button>
            </div>
        </div>`;
}

export function renderLowStockAlerts(lowStockItems) {
    const panel = document.getElementById('low-stock-panel');
    const list = document.getElementById('low-stock-list');
    if (lowStockItems.length === 0) {
        panel.classList.add('hidden');
        return;
    }
    list.innerHTML = lowStockItems.map(item => {
        const currentDisplay = formatStock(item.currentStock, item.unitType, item.cartonCapacity);
        const minDisplay = formatStock(item.minStockLevel, item.unitType, item.cartonCapacity);
        return `
            <div class="low-stock-item" onclick="window.navigateToSection('${item.whId}', '${item.secId}')">
                <div class="low-stock-item-info">
                    <span class="low-stock-item-name">${escapeHtml(item.name)}</span>
                    <span class="low-stock-item-path">${item.whName || ''} ← ${item.secName || ''}</span>
                </div>
                <div class="low-stock-item-stock">
                    <span class="low-stock-current">${currentDisplay}</span>
                    <span class="low-stock-min">الحد الأدنى: ${minDisplay}</span>
                </div>
            </div>`;
    }).join('');
}

// Global Event Listeners for UI Modals
export function initUIEventListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) closeModal(closeBtn.dataset.close);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    });
}

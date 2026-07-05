import { AppState } from './state.js';
import { sortSectionsWithPinned, buildPinButtonHTML, sortItemsWithPinned, buildItemPinButtonHTML } from './pin-sections.js';

// ============================================================================
//  UNIT CONVERSION MATH
// ============================================================================

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
    if (unitType === 'كيلو جرام') return 'أدخل القيمة بالكيلوجرام (مثال: 1.5)';
    if (unitType === 'كرتونة') return 'أدخل عدد الكراتين (سيتم حفظها كقطع)';
    return 'أدخل العدد';
}

export function toDisplayValue(baseValue, unitType, cartonCapacity) {
    const val = Math.max(0, baseValue || 0);
    switch (unitType) {
        case 'كيلو جرام':
            return (val / 1000).toFixed(3).replace(/\.?0+$/, '');
        case 'كرتونة': {
            const cap = cartonCapacity || 1;
            return Math.floor(val / cap);
        }
        case 'قطعة':
        default:
            return val;
    }
}

export function toggleCartonCapField(unitType) {
    const capGroup = document.getElementById('carton-cap-group');
    if (capGroup) {
        capGroup.classList.toggle('hidden', unitType !== 'كرتونة');
    }
}

// ============================================================================
//  UI UTILS
// ============================================================================

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export function escapeJsString(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/'/g, "\'").replace(/"/g, '&quot;');
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => {
            if(toast.parentElement) toast.remove();
        }, 300);
    }, 3000);
}

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
            const hiddenInputs = form.querySelectorAll('input[type="hidden"]');
            hiddenInputs.forEach(input => input.value = '');
        }
    }
}

export function setButtonLoading(buttonId, isLoading) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    
    if (isLoading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> جاري...';
        btn.disabled = true;
    } else {
        if (btn.dataset.originalText) {
            btn.innerHTML = btn.dataset.originalText;
        }
        btn.disabled = false;
    }
}

export function populateWarehouseSelect(selectId, selectedId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '';
    AppState.warehouses.forEach(wh => {
        const opt = document.createElement('option');
        opt.value = wh.id;
        opt.textContent = wh.name;
        if (selectedId && wh.id === selectedId) opt.selected = true;
        select.appendChild(opt);
    });
}

export function populateSectionSelect(selectId, whId, selectedId = null) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '';
    const sections = AppState.sections.filter(s => s.whId === whId);
    
    if (sections.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'لا يوجد أقسام في هذا المستودع';
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        select.disabled = true;
        return;
    }
    
    select.disabled = false;
    sections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = sec.name;
        if (selectedId && sec.id === selectedId) opt.selected = true;
        select.appendChild(opt);
    });
}

export function populateWarehouseFilterOptions() {
    const filter = document.getElementById('warehouse-filter');
    if (!filter) return;
    
    filter.innerHTML = '<option value="">كل المستودعات</option>';
    AppState.warehouses.forEach(wh => {
        const opt = document.createElement('option');
        opt.value = wh.id;
        opt.textContent = wh.name;
        filter.appendChild(opt);
    });
}

export function populateSectionFilterOptions(whId) {
    const filter = document.getElementById('section-filter');
    if (!filter) return;
    
    filter.innerHTML = '<option value="">كل الأقسام</option>';
    if (!whId) {
        filter.disabled = true;
        return;
    }
    
    const sections = AppState.sections.filter(s => s.whId === whId);
    sections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec.id;
        opt.textContent = sec.name;
        filter.appendChild(opt);
    });
    filter.disabled = false;
}

// ============================================================================
//  MAIN RENDERING LOGIC (WITH RBAC)
// ============================================================================

export function updateBreadcrumb() {
    const container = document.getElementById('breadcrumb');
    let html = `<button class="crumb ${AppState.currentView === 'warehouses' ? 'crumb-active' : ''}" onclick="window.navigateHome()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        الرئيسية
    </button>`;
    
    if (AppState.selectedWarehouseId) {
        const wh = AppState.warehouses.find(w => w.id === AppState.selectedWarehouseId);
        if (wh) {
            html += `<span class="crumb-separator">/</span>`;
            html += `<button class="crumb ${AppState.currentView === 'sections' ? 'crumb-active' : ''}" onclick="window.navigateToWarehouse('${wh.id}')">${escapeHtml(wh.name)}</button>`;
        }
    }
    
    if (AppState.selectedSectionId) {
        const sec = AppState.sections.find(s => s.id === AppState.selectedSectionId);
        if (sec) {
            html += `<span class="crumb-separator">/</span>`;
            html += `<span class="crumb crumb-active">${escapeHtml(sec.name)}</span>`;
        }
    }
    
    container.innerHTML = html;
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
        
        let actionsHtml = '';
        if (AppState.userRole !== 'viewer') {
            actionsHtml = `
                <div class="nav-card-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); window.openEditWarehouse('${wh.id}')" title="تعديل">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon" onclick="event.stopPropagation(); window.confirmDeleteWarehouse('${wh.id}', '${escapeJsString(wh.name)}')" title="حذف">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg>
                    </button>
                </div>`;
        }

        return `
            <div class="nav-card fade-in" data-wh-id="${wh.id}" onclick="window.navigateToWarehouse('${wh.id}')">
                <div class="nav-card-header">
                    <span class="nav-card-name">${escapeHtml(wh.name)}</span>
                    ${actionsHtml}
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
    
    // PIN FEATURE: Sort sections with pinned first
    const sorted = sortSectionsWithPinned(filtered);

    if (sorted.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        document.getElementById('empty-text').textContent = 'لا توجد أقسام';
        document.getElementById('empty-sub').textContent = 'ابدأ بإضافة قسم جديد';
        return;
    }
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    container.innerHTML = sorted.map(sec => {
        const isPinned = sec.isPinned;
        const itemCount = AppState.items.filter(i => i.secId === sec.id).length;
        const pinBtnHTML = buildPinButtonHTML(sec.id, isPinned);
        
        let actionsHtml = '';
        if (AppState.userRole !== 'viewer') {
            actionsHtml = `
                <div class="nav-card-actions">
                    <button class="btn-icon" onclick="event.stopPropagation(); window.openEditSection('${whId}', '${sec.id}')" title="تعديل">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon" onclick="event.stopPropagation(); window.confirmDeleteSection('${whId}', '${sec.id}', '${escapeJsString(sec.name)}')" title="حذف">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg>
                    </button>
                </div>`;
        }

        return `
            <div class="nav-card fade-in ${isPinned ? 'nav-card-pinned' : ''}" data-sec-id="${sec.id}" onclick="window.navigateToSection('${whId}', '${sec.id}')">
                <div class="nav-card-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${pinBtnHTML}
                        <span class="nav-card-name">${escapeHtml(sec.name)}</span>
                    </div>
                    ${actionsHtml}
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

    // PIN FEATURE: Sort items with pinned first (FIFO), same logic as sections
    const sorted = sortItemsWithPinned(filtered);

    if (sorted.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        document.getElementById('empty-text').textContent = 'لا توجد أصناف';
        document.getElementById('empty-sub').textContent = 'ابدأ بإضافة صنف جديد';
        return;
    }
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');

    // RBAC: Pin button is visible only to non-viewers
    const canPin = AppState.userRole !== 'viewer';

    container.innerHTML = sorted.map(item => {
        const isPinned = item.isPinned ?? false;
        const stockDisplay = formatStock(item.currentStock, item.unitType, item.cartonCapacity);
        const minDisplay = formatStock(item.minStockLevel, item.unitType, item.cartonCapacity);
        let statusClass = 'stock-healthy';
        let barClass = 'bar-healthy';
        let barWidth = 100;

        if (item.minStockLevel > 0) {
            const ratio = item.currentStock / item.minStockLevel;
            if (ratio <= 0.5) { statusClass = 'stock-critical'; barClass = 'bar-critical'; }
            else if (ratio <= 1) { statusClass = 'stock-warning'; barClass = 'bar-warning'; }
            barWidth = Math.min(100, Math.round((item.currentStock / (item.minStockLevel * 2)) * 100));
        }

        // PIN BUTTON: only rendered for superadmin, owner, worker — hidden from viewer
        const pinBtnHTML = canPin ? buildItemPinButtonHTML(item.id, isPinned) : '';

        let actionsHtml = `<div class="item-actions">`;
        if (AppState.userRole !== 'viewer') {
            actionsHtml += `
                <button class="btn btn-sm btn-outline btn-stock-in" onclick="window.openStockModal('${item.whId}','${item.secId}','${item.id}','وارد')">+ وارد</button>
                <button class="btn btn-sm btn-outline btn-stock-out" onclick="window.openStockModal('${item.whId}','${item.secId}','${item.id}','صادر')">- صادر</button>
                <button class="btn btn-sm btn-outline btn-transfer" onclick="window.openTransferModal('${item.id}')" style="color: var(--accent); border-color: var(--border-light);">نقل</button>`;
        }

        // History button visible to all
        actionsHtml += `<button class="btn btn-sm btn-outline btn-history" onclick="window.openHistoryModal('${item.whId}','${item.secId}','${item.id}')">\u0633\u062c\u0644</button>`;

        if (AppState.userRole !== 'viewer') {
            actionsHtml += `
                <button class="btn btn-sm btn-outline btn-edit" onclick="window.openEditItem('${item.whId}','${item.secId}','${item.id}')">تعديل</button>
                <button class="btn btn-sm btn-outline btn-delete" onclick="window.confirmDeleteItem('${item.whId}','${item.secId}','${item.id}','${escapeJsString(item.name)}')">\u062d\u0630\u0641</button>`;
        }
        actionsHtml += `</div>`;

        return `
        <div class="item-card ${statusClass} ${isPinned ? 'item-card-pinned' : ''} fade-in" id="item-card-${item.id}" data-item-id="${item.id}">
            <div class="item-card-header">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    ${pinBtnHTML}
                    <span class="item-name">${escapeHtml(item.name)}</span>
                </div>
                <span class="item-unit-badge">${escapeHtml(item.unitType)}</span>
            </div>
            <div class="item-stock-section">
                <div class="item-stock-row">
                    <span class="item-stock-label">المخزون الحالي</span>
                    <span class="item-stock-value">${stockDisplay}</span>
                </div>
                <div class="stock-bar-wrapper">
                    <div class="stock-bar ${barClass}" style="width: ${barWidth}%"></div>
                </div>
                <div class="item-min-stock">
                    ${item.currentStock <= item.minStockLevel ? '✓' : '✓'} حد النواقص: ${minDisplay}
                </div>
            </div>
            ${item.description ? `<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">📄 ${escapeHtml(item.description)}</div>` : ''}
            ${actionsHtml}
        </div>`;
    }).join('');
}

export function renderLowStockAlerts(items) {
    const container = document.getElementById('low-stock-list');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">لا توجد نواقص</div>';
        return;
    }
    container.innerHTML = items.map(item => {
        const currentDisplay = formatStock(item.currentStock, item.unitType, item.cartonCapacity);
        const minDisplay = formatStock(item.minStockLevel, item.unitType, item.cartonCapacity);
        return `
            <div class="low-stock-item" onclick="window.navigateToSection('${item.whId}', '${item.secId}')">
                <div class="low-stock-item-info">
                    <span class="low-stock-item-name">${escapeHtml(item.name)}</span>
                    <span class="low-stock-item-path">${escapeHtml(item.whName || '')} - ${escapeHtml(item.secName || '')}</span>
                </div>
                <div class="low-stock-item-stock">
                    <span class="badge badge-danger">${currentDisplay}</span>
                    <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 2px;">الحد: ${minDisplay}</span>
                </div>
            </div>
        `;
    }).join('');
}

export function initUIEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            
            // UI Update
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            // Specific logic for reports tab
            if (targetId === 'tab-reports') {
                if (window.loadReports) window.loadReports();
            }
        });
    });

    // Modals generic close
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('[data-close]');
            if (closeBtn) closeModal(closeBtn.dataset.close);
        });
    });
}

export function renderQuickViewPanel(type, dataList) {
    const qvPanel = document.getElementById('quick-view-panel');
    const lsPanel = document.getElementById('low-stock-panel');
    const qvList = document.getElementById('quick-view-list');
    const titleEl = document.getElementById('quick-view-title');
    const goBtn = document.getElementById('btn-quick-view-go');
    const iconEl = document.getElementById('quick-view-icon');
    const headerEl = qvPanel.querySelector('.panel-header');
    const footerEl = document.getElementById('quick-view-footer');

    // Hide low stock panel if open
    if(lsPanel) lsPanel.classList.add('hidden');

    // Setup UI based on type
    let titleText = '';
    let iconSvg = '';
    
    // Reset theme
    headerEl.className = 'panel-header';
    qvPanel.classList.remove('no-footer');
    if(footerEl) footerEl.classList.remove('hidden');

    if (type === 'warehouses') {
        titleText = 'جميع المستودعات';
        headerEl.classList.add('theme-blue');
        iconSvg = '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />';
        qvPanel.classList.add('no-footer');
        if(footerEl) footerEl.classList.add('hidden');
    } else if (type === 'sections') {
        titleText = 'جميع الأقسام';
        headerEl.classList.add('theme-purple');
        iconSvg = '<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />';
        qvPanel.classList.add('no-footer');
        if(footerEl) footerEl.classList.add('hidden');
    } else if (type === 'items') {
        titleText = 'أحدث الأصناف';
        headerEl.classList.add('theme-green');
        iconSvg = '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />';
    }

    titleEl.textContent = titleText;
    iconEl.innerHTML = iconSvg;

    if (!dataList || dataList.length === 0) {
        qvList.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">لا توجد بيانات لعرضها.</div>';
    } else {
        qvList.innerHTML = dataList.map(item => {
            if (type === 'warehouses') {
                return '<div class="low-stock-item" style="cursor:pointer;" onclick="document.getElementById(\'quick-view-panel\').classList.add(\'hidden\'); window.navigateToWarehouse(\'' + item.id + '\')"><div class="low-stock-item-info"><span class="low-stock-item-name">' + escapeHtml(item.name) + '</span></div></div>';
            } else if (type === 'sections') {
                const pinIndicator = item.isPinned
                    ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style="color:var(--warning,#f59e0b);flex-shrink:0;margin-left:4px;" title="مثبت"><path d="M12 2l2.09 6.26L20 9.27l-5 3.87L16.18 20 12 16.77 7.82 20 9 13.14l-5-3.87 5.91-1.01z"/></svg>'
                    : '';
                return '<div class="low-stock-item" style="cursor:pointer;" onclick="document.getElementById(\'quick-view-panel\').classList.add(\'hidden\'); window.navigateToSection(\'' + item.whId + '\', \'' + item.id + '\')">'
                    + '<div class="low-stock-item-info">'
                    + '<span class="low-stock-item-name" style="display:flex;align-items:center;gap:4px;">' + pinIndicator + escapeHtml(item.name) + '</span>'
                    + '<span class="low-stock-item-path">' + escapeHtml(item.whName || '') + '</span>'
                    + '</div></div>';
            } else if (type === 'items') {
                return '<div class="low-stock-item" style="cursor:pointer;" onclick="document.getElementById(\'quick-view-panel\').classList.add(\'hidden\'); window.goToItem(\'' + item.whId + '\', \'' + item.secId + '\', \'' + item.id + '\')"><div class="low-stock-item-info"><span class="low-stock-item-name">' + escapeHtml(item.name) + '</span><span class="low-stock-item-path">' + escapeHtml(item.whName || '') + ' - ' + escapeHtml(item.secName || '') + '</span></div><div class="low-stock-item-stock"><span class="badge ' + (item.currentStock <= item.minStockLevel ? 'badge-danger' : 'badge-success') + '">' + formatStock(item.currentStock, item.unitType, item.cartonCapacity) + '</span></div></div>';
            }
        }).join('');
    }

    // Go btn handler
    if(goBtn) {
        goBtn.onclick = () => {
            qvPanel.classList.add('hidden');
            if (type === 'items') {
                document.querySelector('.crumb[data-level="home"]')?.click();
                document.getElementById('warehouse-filter').value = '';
                document.getElementById('warehouse-filter').dispatchEvent(new Event('change'));
            }
        };
    }

    // Make sure panel close works
    const closeBtn = document.getElementById('btn-close-quick-view');
    if(closeBtn) {
        closeBtn.onclick = () => { qvPanel.classList.add('hidden'); };
    }

    qvPanel.classList.remove('hidden');
}

export function applyRBAC() {
    const role = AppState.userRole;
    if (role === 'viewer') {
        document.getElementById('btn-add-warehouse')?.classList.add('hidden');
        document.getElementById('btn-add-section')?.classList.add('hidden');
        document.getElementById('btn-add-item')?.classList.add('hidden');
    } else {
        document.getElementById('btn-add-warehouse')?.classList.remove('hidden');
        document.getElementById('btn-add-section')?.classList.remove('hidden');
        document.getElementById('btn-add-item')?.classList.remove('hidden');
    }
}

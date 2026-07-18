import { db } from './firebase-init.js';
import { collection, doc, setDoc, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { AppState } from './state.js';
import * as UI from './ui.js';

// Global variables to hold unsubscribe functions for listeners
let unsubs = [];

export function startInventoryListeners() {
    stopInventoryListeners(); // Ensure we don't duplicate listeners

    // Listen to Warehouses
    const whUnsub = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
        AppState.warehouses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const currentWhVal = document.getElementById('warehouse-filter').value;
        UI.populateWarehouseFilterOptions();
        document.getElementById('warehouse-filter').value = currentWhVal;
        if (window.rerenderCurrentView) window.rerenderCurrentView();
    }, (error) => handleListenerError(error, 'المستودعات'));
    unsubs.push(whUnsub);

    // Listen to Sections
    const secUnsub = onSnapshot(collection(db, 'sections'), (snapshot) => {
        AppState.sections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (AppState.selectedWarehouseId) {
            const currentSecVal = document.getElementById('section-filter').value;
            UI.populateSectionFilterOptions(AppState.selectedWarehouseId);
            document.getElementById('section-filter').value = currentSecVal;
        }
        if (window.rerenderCurrentView) window.rerenderCurrentView();
    }, (error) => handleListenerError(error, 'الأقسام'));
    unsubs.push(secUnsub);

    // Listen to Items
    const itemsUnsub = onSnapshot(collection(db, 'items'), (snapshot) => {
        AppState.items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (window.rerenderCurrentView) window.rerenderCurrentView();
        if (window.updateDashboard) window.updateDashboard(); // To update low stock alerts
    }, (error) => handleListenerError(error, 'الأصناف'));
    unsubs.push(itemsUnsub);
}

export function stopInventoryListeners() {
    unsubs.forEach(unsub => unsub());
    unsubs = [];
}

function handleListenerError(error, context) {
    console.error(`Listener error for ${context}:`, error);
    if (error.code === 'permission-denied') {
        UI.showToast(`لا تملك صلاحية الوصول إلى ${context}`, 'error');
    } else if (error.code === 'unavailable') {
        UI.showToast(`مشكلة في الاتصال بالشبكة (يتم العمل أوفلاين)`, 'warning');
    }
}

// ═══════════════════════════════════════════════
//  WAREHOUSE CRUD
// ═══════════════════════════════════════════════

export async function addWarehouse(name) {
    const nameTrimmed = name.trim();
    if (AppState.warehouses.some(w => w.name.toLowerCase() === nameTrimmed.toLowerCase())) {
        UI.showToast('هذا المستودع موجود بالفعل', 'error');
        return;
    }
    try {
        const docRef = doc(collection(db, 'warehouses'));
        await setDoc(docRef, { name: nameTrimmed, createdAt: serverTimestamp() });
        UI.showToast('تم إضافة المستودع بنجاح', 'success');
        UI.closeModal('warehouse-modal');
    } catch (error) {
        console.error("Error adding warehouse: ", error);
        if (error.code === 'permission-denied') {
            UI.showToast('مرفوض: ليس لديك صلاحية أو لم تقم بتحديث قواعد البيانات', 'error');
        } else {
            UI.showToast('خطأ: ' + error.message, 'error');
        }
    }
}

export async function editWarehouse(whId, newName) {
    const nameTrimmed = newName.trim();
    if (AppState.warehouses.some(w => w.id !== whId && w.name.toLowerCase() === nameTrimmed.toLowerCase())) {
        UI.showToast('يوجد مستودع آخر بنفس الاسم', 'error');
        return;
    }
    try {
        // Update Warehouse
        await updateDoc(doc(db, 'warehouses', whId), { name: nameTrimmed });
        
        // Cascade name update to sections and items using batch
        const batch = writeBatch(db);
        AppState.sections.filter(s => s.whId === whId).forEach(sec => {
            batch.update(doc(db, 'sections', sec.id), { whName: newName });
        });
        AppState.items.filter(i => i.whId === whId).forEach(item => {
            batch.update(doc(db, 'items', item.id), { whName: newName });
        });
        await batch.commit();

        UI.showToast('تم تحديث المستودع بنجاح', 'success');
        UI.closeModal('warehouse-modal');
    } catch (error) {
        console.error("Error editing warehouse: ", error);
        if (error.code === 'permission-denied') {
            UI.showToast('مرفوض: ليس لديك صلاحية أو لم تقم بتحديث قواعد البيانات', 'error');
        } else {
            UI.showToast('خطأ: ' + error.message, 'error');
        }
    }
}

export async function deleteWarehouse(whId) {
    try {
        // Cascade delete using batch (up to 500 ops)
        const batch = writeBatch(db);
        
        // Note: For a very large database, you would need a cloud function to reliably delete all subcollections.
        // Doing it client-side is limited by the 500 batch limit and offline availability.
        // But we will delete the items, sections, and the warehouse document.
        
        AppState.items.filter(i => i.whId === whId).forEach(item => {
            batch.delete(doc(db, 'items', item.id));
        });
        AppState.sections.filter(s => s.whId === whId).forEach(sec => {
            batch.delete(doc(db, 'sections', sec.id));
        });
        batch.delete(doc(db, 'warehouses', whId));
        
        await batch.commit();
        UI.showToast('تم حذف المستودع', 'success');
        window.navigateHome();
    } catch (error) {
        console.error("Error deleting warehouse: ", error);
        UI.showToast('خطأ في حذف المستودع', 'error');
    }
}

// ═══════════════════════════════════════════════
//  SECTION CRUD
// ═══════════════════════════════════════════════

export async function addSection(whId, name) {
    const wh = AppState.warehouses.find(w => w.id === whId);
    if (!wh) return;
    
    const nameTrimmed = name.trim();
    if (AppState.sections.some(s => s.whId === whId && s.name.toLowerCase() === nameTrimmed.toLowerCase())) {
        UI.showToast('هذا القسم موجود بالفعل في نفس المستودع', 'error');
        return;
    }
    
    try {
        const docRef = doc(collection(db, 'sections'));
        await setDoc(docRef, {
            whId: wh.id,
            whName: wh.name,
            name: name,
            createdAt: serverTimestamp()
        });
        UI.showToast('تم إضافة القسم بنجاح', 'success');
        UI.closeModal('section-modal');
    } catch (error) {
        console.error("Error adding section: ", error);
        if (error.code === 'permission-denied') {
            UI.showToast('مرفوض: ليس لديك صلاحية أو لم تقم بتحديث قواعد البيانات', 'error');
        } else {
            UI.showToast('خطأ: ' + error.message, 'error');
        }
    }
}

export async function editSection(whId, secId, newName) {
    try {
        await updateDoc(doc(db, 'sections', secId), { name: newName });
        
        // Cascade to items
        const batch = writeBatch(db);
        AppState.items.filter(i => i.whId === whId && i.secId === secId).forEach(item => {
            batch.update(doc(db, 'items', item.id), { secName: newName });
        });
        await batch.commit();

        UI.showToast('تم تحديث القسم بنجاح', 'success');
        UI.closeModal('section-modal');
    } catch (error) {
        console.error("Error editing section: ", error);
        if (error.code === 'permission-denied') {
            UI.showToast('مرفوض: ليس لديك صلاحية أو لم تقم بتحديث قواعد البيانات', 'error');
        } else {
            UI.showToast('خطأ: ' + error.message, 'error');
        }
    }
}

export async function deleteSection(whId, secId) {
    try {
        const batch = writeBatch(db);
        AppState.items.filter(i => i.secId === secId).forEach(item => {
            batch.delete(doc(db, 'items', item.id));
        });
        batch.delete(doc(db, 'sections', secId));
        await batch.commit();
        UI.showToast('تم حذف القسم', 'success');
    } catch (error) {
        console.error("Error deleting section: ", error);
        UI.showToast('خطأ في الحذف', 'error');
    }
}

// ═══════════════════════════════════════════════
//  ITEM CRUD
// ═══════════════════════════════════════════════

export async function addItem(whId, secId, data) {
    const wh = AppState.warehouses.find(w => w.id === whId);
    const sec = AppState.sections.find(s => s.id === secId);
    if (!wh || !sec) return;

    const nameTrimmed = data.name.trim();
    if (AppState.items.some(i => i.whId === whId && i.secId === secId && i.name.toLowerCase() === nameTrimmed.toLowerCase())) {
        UI.showToast('هذا الصنف موجود بالفعل في هذا القسم', 'error');
        return;
    }

    try {
        const docRef = doc(collection(db, 'items'));
        const itemData = {
            whId: wh.id,
            whName: wh.name,
            secId: sec.id,
            secName: sec.name,
            name: nameTrimmed,
            unitType: data.unitType,
            cartonCapacity: data.cartonCapacity || 1,
            minStockLevel: data.minStockLevel,
            currentStock: data.initialStock,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const batch = writeBatch(db);
        batch.set(docRef, itemData);

        if (data.initialStock > 0) {
            const logRef = doc(collection(db, `items/${docRef.id}/historyLog`));
            batch.set(logRef, {
                type: 'وارد',
                quantity: data.initialStock,
                balanceAfter: data.initialStock,
                date: serverTimestamp(),
                note: 'رصيد افتتاحي',
                empCode: AppState.userLoginId || ''
            });
        }
        await batch.commit();
        
        UI.showToast('تم إضافة الصنف بنجاح', 'success');
        UI.closeModal('item-modal');
    } catch (error) {
        console.error("Error adding item: ", error);
        if (error.code === 'permission-denied') {
            UI.showToast('مرفوض: ليس لديك صلاحية أو لم تقم بتحديث قواعد البيانات', 'error');
        } else {
            UI.showToast('خطأ: ' + error.message, 'error');
        }
    }
}

export async function editItem(whId, secId, itemId, data) {
    try {
        const item = AppState.items.find(i => i.id === itemId);
        if (!item) return;

        const updateData = {
            name: data.name,
            unitType: data.unitType,
            cartonCapacity: data.cartonCapacity || 1,
            minStockLevel: data.minStockLevel,
            updatedAt: serverTimestamp()
        };

        const batch = writeBatch(db);
        const itemRef = doc(db, 'items', itemId);
        
        // Stock changed manually during edit
        if (data.currentStock !== item.currentStock) {
            updateData.currentStock = data.currentStock;
            const diff = data.currentStock - item.currentStock;
            const type = diff > 0 ? 'وارد' : 'صادر';
            const logRef = doc(collection(db, `items/${itemId}/historyLog`));
            batch.set(logRef, {
                type: type,
                quantity: Math.abs(diff),
                balanceAfter: data.currentStock,
                date: serverTimestamp(),
                note: 'تعديل خطأ',
                empCode: AppState.userLoginId || ''
            });
        }

        batch.update(itemRef, updateData);
        await batch.commit();

        UI.showToast('تم تحديث الصنف بنجاح', 'success');
        UI.closeModal('item-modal');
    } catch (error) {
        console.error("Error editing item: ", error);
        if (error.code === 'permission-denied') {
            UI.showToast('مرفوض: ليس لديك صلاحية أو لم تقم بتحديث قواعد البيانات', 'error');
        } else {
            UI.showToast('خطأ: ' + error.message, 'error');
        }
    }
}

export async function deleteItem(whId, secId, itemId) {
    try {
        // Technically we should delete the historyLog subcollection too, 
        // but client-side batching is limited. For now, we delete the item doc.
        await deleteDoc(doc(db, 'items', itemId));
        UI.showToast('تم حذف الصنف', 'success');
    } catch (error) {
        console.error("Error deleting item: ", error);
        UI.showToast('خطأ في الحذف', 'error');
    }
}

// ═══════════════════════════════════════════════
//  STOCK TRANSACTIONS (runTransaction — Race-Condition Safe)
// ═══════════════════════════════════════════════

export async function processStockTransaction(whId, secId, itemId, type, displayQty, note) {
    const item = AppState.items.find(i => i.id === itemId);
    if (!item) return;

    // ── DATA SANITIZATION: trim whitespace to prevent hidden-char logic errors ──
    const sanitizedType = type.trim();

    const baseQty = UI.toBaseUnit(displayQty, item.unitType, item.cartonCapacity);
    if (baseQty <= 0) {
        UI.showToast('الكمية غير صالحة', 'error');
        return;
    }

    // Optimistic pre-check for instant UI feedback (will be RE-validated inside transaction)
    if (sanitizedType === 'صادر' && baseQty > item.currentStock) {
        UI.showToast('الكمية المطلوبة أكبر من الرصيد المتاح', 'error');
        return;
    }

    try {
        const itemRef = doc(db, 'items', itemId);

        // ══ FIRESTORE TRANSACTION: Atomic read → validate → write ══
        // WriteBatch was blind: it used increment() without reading the live stock,
        // so two concurrent operations could both pass local validation on stale data.
        // runTransaction reads the LIVE document under a lock. If the document changes
        // mid-transaction, Firestore automatically retries (up to 5 times).
        await runTransaction(db, async (transaction) => {
            // Step 1: Read the LIVE document inside the transaction lock
            const itemSnap = await transaction.get(itemRef);
            if (!itemSnap.exists()) {
                throw new Error('ITEM_NOT_FOUND');
            }

            const liveData = itemSnap.data();
            const liveStock = liveData.currentStock || 0;

            // Step 2: Re-validate with LIVE stock (race-condition proof)
            if (sanitizedType === 'صادر' && baseQty > liveStock) {
                throw new Error('INSUFFICIENT_STOCK');
            }

            // Step 3: Compute exact new balance from live data
            const delta = sanitizedType === 'وارد' ? baseQty : -baseQty;
            const newBalance = liveStock + delta;

            // Step 4: Atomic writes — stock update + history log
            transaction.update(itemRef, {
                currentStock: newBalance,  // Exact value, not increment — we know the live stock
                updatedAt: serverTimestamp()
            });

            const logRef = doc(collection(db, `items/${itemId}/historyLog`));
            transaction.set(logRef, {
                type: sanitizedType,
                quantity: baseQty,
                balanceAfter: newBalance,  // Accurate (from live read), not optimistic
                date: serverTimestamp(),
                note: note || '',
                empCode: AppState.userLoginId || ''
            });
        });

        UI.showToast(`تم تسجيل حركة ${sanitizedType} بنجاح`, 'success');
        UI.closeModal('stock-modal');
    } catch (error) {
        if (error.message === 'INSUFFICIENT_STOCK') {
            UI.showToast('الكمية المطلوبة أكبر من الرصيد الفعلي المتاح (تم التحقق لحظياً)', 'error');
        } else if (error.message === 'ITEM_NOT_FOUND') {
            UI.showToast('الصنف غير موجود أو تم حذفه', 'error');
        } else {
            console.error("Transaction Error: ", error);
            UI.showToast('حدث خطأ أثناء تسجيل الحركة', 'error');
        }
    }
}

export async function processTransferTransaction(sourceItemId, sourceWhId, sourceSecId, destWhId, destSecId, qtyDisplay) {
    const sourceItem = AppState.items.find(i => i.id === sourceItemId);
    if (!sourceItem) {
        UI.showToast('الصنف المصدر غير موجود', 'error');
        return;
    }

    const baseQty = UI.toBaseUnit(qtyDisplay, sourceItem.unitType, sourceItem.cartonCapacity);
    if (baseQty <= 0) {
        UI.showToast('الكمية يجب أن تكون أكبر من الصفر', 'error');
        return;
    }

    // Optimistic pre-check (will be RE-validated inside transaction)
    if (baseQty > sourceItem.currentStock) {
        UI.showToast('الكمية المطلوبة للنقل أكبر من الرصيد المتاح', 'error');
        return;
    }

    // Find equivalent item in destination (from live AppState, kept current by onSnapshot)
    const destItem = AppState.items.find(i => i.whId === destWhId && i.secId === destSecId && i.name === sourceItem.name);

    try {
        const sourceRef = doc(db, 'items', sourceItemId);

        // ══ FIRESTORE TRANSACTION: Protects source stock from Race Conditions ══
        await runTransaction(db, async (transaction) => {
            // Step 1: Read source item with LIVE data inside transaction lock
            const sourceSnap = await transaction.get(sourceRef);
            if (!sourceSnap.exists()) {
                throw new Error('SOURCE_NOT_FOUND');
            }

            const liveSourceData = sourceSnap.data();
            const liveSourceStock = liveSourceData.currentStock || 0;

            // Step 2: Re-validate source stock with LIVE data (race-condition proof)
            if (baseQty > liveSourceStock) {
                throw new Error('INSUFFICIENT_STOCK');
            }

            const newSourceBalance = liveSourceStock - baseQty;

            // Step 3: Deduct from source (exact value from live read)
            transaction.update(sourceRef, {
                currentStock: newSourceBalance,
                updatedAt: serverTimestamp()
            });

            // Step 4: Log source history (accurate balanceAfter)
            const sourceLogRef = doc(collection(db, `items/${sourceItemId}/historyLog`));
            transaction.set(sourceLogRef, {
                type: 'صادر',
                quantity: baseQty,
                balanceAfter: newSourceBalance,
                date: serverTimestamp(),
                note: 'نقل إلى مستودع/قسم آخر',
                empCode: AppState.userLoginId || ''
            });

            // Step 5: Handle destination
            if (destItem) {
                const destRef = doc(db, 'items', destItem.id);
                const destSnap = await transaction.get(destRef);

                let newDestBalance = baseQty;
                if (destSnap.exists()) {
                    const liveDestData = destSnap.data();
                    newDestBalance = (liveDestData.currentStock || 0) + baseQty;
                    transaction.update(destRef, {
                        currentStock: newDestBalance,
                        updatedAt: serverTimestamp()
                    });
                } else {
                    // Dest was deleted between pre-check and transaction — recreate
                    const destWh = AppState.warehouses.find(w => w.id === destWhId);
                    const destSec = AppState.sections.find(s => s.id === destSecId);
                    transaction.set(destRef, {
                        whId: destWh.id, whName: destWh.name,
                        secId: destSec.id, secName: destSec.name,
                        name: sourceItem.name, unitType: sourceItem.unitType,
                        cartonCapacity: sourceItem.cartonCapacity,
                        minStockLevel: sourceItem.minStockLevel,
                        currentStock: baseQty,
                        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                    });
                }

                const destLogRef = doc(collection(db, `items/${destItem.id}/historyLog`));
                transaction.set(destLogRef, {
                    type: 'وارد',
                    quantity: baseQty,
                    balanceAfter: newDestBalance,
                    date: serverTimestamp(),
                    note: `نقل من ${liveSourceData.whName || sourceItem.whName} / ${liveSourceData.secName || sourceItem.secName}`,
                    empCode: AppState.userLoginId || ''
                });
            } else {
                // No existing destination item — create new one
                const newDestRef = doc(collection(db, 'items'));
                const destWh = AppState.warehouses.find(w => w.id === destWhId);
                const destSec = AppState.sections.find(s => s.id === destSecId);

                transaction.set(newDestRef, {
                    whId: destWh.id, whName: destWh.name,
                    secId: destSec.id, secName: destSec.name,
                    name: sourceItem.name, unitType: sourceItem.unitType,
                    cartonCapacity: sourceItem.cartonCapacity,
                    minStockLevel: sourceItem.minStockLevel,
                    currentStock: baseQty,
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
                });

                const destLogRef = doc(collection(db, `items/${newDestRef.id}/historyLog`));
                transaction.set(destLogRef, {
                    type: 'وارد',
                    quantity: baseQty,
                    balanceAfter: baseQty,
                    date: serverTimestamp(),
                    note: `نقل من ${liveSourceData.whName || sourceItem.whName} / ${liveSourceData.secName || sourceItem.secName}`,
                    empCode: AppState.userLoginId || ''
                });
            }
        });

        UI.showToast('تم النقل بنجاح', 'success');
        UI.closeModal('transfer-modal');
    } catch (error) {
        if (error.message === 'INSUFFICIENT_STOCK') {
            UI.showToast('الكمية المطلوبة للنقل أكبر من الرصيد الفعلي المتاح (تم التحقق لحظياً)', 'error');
        } else if (error.message === 'SOURCE_NOT_FOUND') {
            UI.showToast('الصنف المصدر غير موجود أو تم حذفه', 'error');
        } else {
            console.error("Transfer Error: ", error);
            UI.showToast('حدث خطأ أثناء نقل المخزون', 'error');
        }
    }
}

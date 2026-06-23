export const AppState = {
    /** @type {Array<{id: string, name: string, createdAt: any}>} */
    warehouses: [],

    /** @type {Array<{id: string, whId: string, whName: string, name: string, createdAt: any}>} */
    sections: [],

    /** @type {Array<{id: string, whId: string, whName: string, secId: string, secName: string, name: string, unitType: string, cartonCapacity: number, currentStock: number, minStockLevel: number, createdAt: any, updatedAt: any}>} */
    items: [],

    // AUTH UPDATE: Add auth state
    currentUser: null,
    userRole: null, // 'superadmin', 'owner', 'worker'
    userLoginId: null,

    /** Currently selected warehouse filter (null = all) */
    selectedWarehouseId: null,

    /** Currently selected section filter (null = all) */
    selectedSectionId: null,

    /** Current navigation view: 'warehouses' | 'sections' | 'items' */
    currentView: 'warehouses',

    /** Pending delete callback for confirm modal */
    pendingDeleteCallback: null
};

// ═══════════════════════════════════════════════
//  SNAPSHOT & ROLLBACK UTILITIES
// ═══════════════════════════════════════════════

/**
 * Takes a shallow snapshot of the three data arrays for rollback.
 * Each element is a shallow copy so we can restore the array references
 * without losing object identity on unchanged items.
 */
export function takeSnapshot() {
    return {
        warehouses: AppState.warehouses.map(w => ({ ...w })),
        sections: AppState.sections.map(s => ({ ...s })),
        items: AppState.items.map(i => ({ ...i }))
    };
}

/**
 * Restores AppState arrays from a previously taken snapshot.
 */
export function restoreSnapshot(snapshot) {
    AppState.warehouses = snapshot.warehouses;
    AppState.sections = snapshot.sections;
    AppState.items = snapshot.items;
}

// ═══════════════════════════════════════════════
//  PIN SECTIONS FEATURE — Isolated Helper Module
//  يجب عدم تعديل هذا الملف من قبل ملفات أخرى
//  هذا الملف معزول تماماً عن الأكواد الأساسية
// ═══════════════════════════════════════════════

import { db } from './firebase-init.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { AppState, takeSnapshot, restoreSnapshot } from './state.js';
import * as UI from './ui.js';

// ─────────────────────────────────────────────
//  SORTING HELPER
// ─────────────────────────────────────────────

/**
 * Sorts sections array so pinned sections appear first.
 * Among pinned sections, sorts by `pinnedAt` descending (most recently pinned = top).
 * Old documents without `isPinned` field are treated as `false`.
 * Unpinned sections preserve their original relative order.
 *
 * @param {Array} sections - Array of section objects
 * @returns {Array} New sorted array (does NOT mutate original)
 */
export function sortSectionsWithPinned(sections) {
    const pinned = [];
    const unpinned = [];

    for (const sec of sections) {
        if (sec.isPinned) {
            pinned.push(sec);
        } else {
            unpinned.push(sec);
        }
    }

    // Sort pinned sections: earliest pinned appears first (FIFO order).
    // The section pinned first stays at the top; newer pins stack below it.
    // Falls back to section name if pinnedAt is missing (legacy documents).
    pinned.sort((a, b) => {
        const aTime = a.pinnedAt?.toMillis?.() ?? a.pinnedAt ?? 0;
        const bTime = b.pinnedAt?.toMillis?.() ?? b.pinnedAt ?? 0;
        if (aTime !== bTime) return aTime - bTime; // oldest pin on top (FIFO)
        return (a.name ?? '').localeCompare(b.name ?? '', 'ar'); // stable fallback
    });

    return [...pinned, ...unpinned];
}

/**
 * Checks if there are any pinned sections in the given list.
 * Used to decide whether to render a separator.
 * 
 * @param {Array} sections 
 * @returns {boolean}
 */
export function hasPinnedSections(sections) {
    return sections.some(s => s.isPinned);
}

// ─────────────────────────────────────────────
//  TOGGLE PIN (Optimistic UI + Firestore)
// ─────────────────────────────────────────────

/**
 * Toggles the pin state of a section.
 * Implements Optimistic UI:
 *   1. Immediately updates AppState & re-renders
 *   2. Sends updateDoc to Firestore in background
 *   3. On failure → rollback + error toast
 *
 * When pinning   → writes isPinned:true  + pinnedAt:serverTimestamp()
 * When unpinning → writes isPinned:false + pinnedAt:null (cleanup)
 *
 * Only updates the SINGLE document the user clicked (no batch).
 *
 * @param {string} secId - Section document ID
 * @param {boolean} currentPinState - Current pin state
 */
export async function toggleSectionPin(secId, currentPinState) {
    const newPinState = !currentPinState;

    // ① Take snapshot for rollback
    const snapshot = takeSnapshot();

    // ② Optimistic UI: Update AppState immediately.
    //    Use Date.now() as a local timestamp so the sort is correct
    //    before the Firestore serverTimestamp() resolves.
    const sectionIndex = AppState.sections.findIndex(s => s.id === secId);
    if (sectionIndex === -1) return;

    AppState.sections[sectionIndex] = {
        ...AppState.sections[sectionIndex],
        isPinned: newPinState,
        pinnedAt: newPinState ? Date.now() : null   // local optimistic value
    };

    // ③ Re-render immediately for instant feedback
    if (window.rerenderCurrentView) {
        window.rerenderCurrentView();
    }

    // ④ Build the Firestore payload
    const firestorePayload = newPinState
        ? { isPinned: true,  pinnedAt: serverTimestamp() }
        : { isPinned: false, pinnedAt: null };

    // ⑤ Send to Firestore in background
    try {
        await updateDoc(doc(db, 'sections', secId), firestorePayload);
        // Success — onSnapshot will reconcile pinnedAt with the real server value
    } catch (error) {
        console.error('Error toggling pin for section:', secId, error);

        // ⑥ Rollback on failure
        restoreSnapshot(snapshot);
        if (window.rerenderCurrentView) {
            window.rerenderCurrentView();
        }

        // ⑦ Handle specific error types
        if (error.code === 'failed-precondition') {
            console.error(
                '⚠️ Firebase Index Required. Create the index using the link below:\n',
                error.message
            );
            UI.showToast('يتم الآن تهيئة النظام، يرجى المحاولة بعد قليل', 'warning', 5000);
        } else if (error.code === 'permission-denied') {
            UI.showToast('غير مصرح لك بتعديل الأقسام', 'error');
        } else {
            UI.showToast('حدث خطأ أثناء تحديث التثبيت، يرجى المحاولة مرة أخرى', 'error');
        }
    }
}

// ─────────────────────────────────────────────
//  PIN BUTTON SVG BUILDER
// ─────────────────────────────────────────────

/**
 * Returns the HTML string for the pin toggle button.
 * 
 * @param {string} whId - Warehouse ID (for event context)
 * @param {string} secId - Section ID
 * @param {boolean} isPinned - Current pin state
 * @returns {string} HTML string
 */
export function buildPinButtonHTML(secId, isPinned) {
    const title = isPinned ? 'إلغاء التثبيت' : 'تثبيت القسم';
    const activeClass = isPinned ? 'btn-pin-active' : '';

    return `
        <button class="btn-icon btn-pin ${activeClass}"
                onclick="event.stopPropagation(); window.__togglePinSection('${secId}', ${isPinned})"
                title="${title}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M12 2l2.09 6.26L20 9.27l-5 3.87L16.18 20 12 16.77 7.82 20 9 13.14l-5-3.87 5.91-1.01z"/>
            </svg>
        </button>`;
}

// ─────────────────────────────────────────────
//  INITIALIZATION — Register global handler
// ─────────────────────────────────────────────

/**
 * Registers the global toggle function on `window`.
 * Called once from app.js during initialization.
 */
export function initPinFeature() {
    window.__togglePinSection = (secId, currentPinState) => {
        toggleSectionPin(secId, currentPinState);
    };
}

import { db, auth, secondaryAuth } from './firebase-init.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, setDoc, getDocs, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { AppState } from './state.js';
import * as UI from './ui.js';

// Wait for DOM to load before attaching event listeners to auth forms
document.addEventListener('DOMContentLoaded', () => {
    
    // ═══════════════════════════════════════════════
    //  PASSWORD TOGGLE
    // ═══════════════════════════════════════════════
    const togglePasswordBtn = document.getElementById('toggle-password');
    const loginPasswordInput = document.getElementById('login-password');
    const eyeIcon = document.getElementById('eye-icon');

    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            loginPasswordInput.setAttribute('type', type);
            if (type === 'text') {
                eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
            } else {
                eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
            }
        });
    }

    // ═══════════════════════════════════════════════
    //  LOGIN GATE (STRICT)
    // ═══════════════════════════════════════════════
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('login-id').value.trim();
        const password = document.getElementById('login-password').value;

        if (!id || !password) {
            alert("خطأ في اسم المستخدم أو كلمة المرور");
            return;
        }

        const email = id + "@jostock.com";
        UI.setButtonLoading('btn-login', true);

        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            AppState.currentUser = cred.user;
            
            try {
                const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
                
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    AppState.userRole = data.role;
                    AppState.userLoginId = data.loginId;
                    
                    document.getElementById('btn-user-management').classList.toggle('hidden', AppState.userRole === 'worker');
                    document.getElementById('login-overlay').classList.add('hidden');
                    
                    if (window.initApp) {
                        await window.initApp();
                    }
                } else {
                    await signOut(auth);
                    alert('خطأ: حسابك غير مسجل في قاعدة بيانات الصلاحيات. راجع الإدارة.');
                    return;
                }
            } catch (roleError) {
                await signOut(auth);
                UI.showToast("خطأ في التحقق من الصلاحيات أو الاتصال بالشبكة", "error");
                return;
            }

        } catch (error) {
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                alert("خطأ في اسم المستخدم أو كلمة المرور");
            } else {
                alert("حدث خطأ أثناء تسجيل الدخول");
            }
        } finally {
            UI.setButtonLoading('btn-login', false);
        }
    });

    // ═══════════════════════════════════════════════
    //  LOGOUT
    // ═══════════════════════════════════════════════
    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.reload();
        });
    });

    // ═══════════════════════════════════════════════
    //  PASSWORD CHANGE
    // ═══════════════════════════════════════════════
    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPass = document.getElementById('current-password').value;
        const newPass = document.getElementById('new-password').value;
        const email = AppState.currentUser.email;

        UI.setButtonLoading('btn-save-password', true);
        try {
            // Re-authenticate to ensure recent login before changing password
            await signInWithEmailAndPassword(auth, email, currentPass);
            await updatePassword(AppState.currentUser, newPass);
            UI.showToast('تم تغيير كلمة المرور بنجاح', 'success');
            UI.closeModal('password-modal');
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                UI.showToast('كلمة المرور الحالية غير صحيحة', 'error');
            } else {
                UI.showToast('حدث خطأ أثناء تغيير كلمة المرور', 'error');
            }
        } finally {
            UI.setButtonLoading('btn-save-password', false);
        }
    });

    // ═══════════════════════════════════════════════
    //  CREATE USER (Secondary Auth)
    // ═══════════════════════════════════════════════
    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Strict Authorization Check
        if (AppState.userRole !== 'superadmin' && AppState.userRole !== 'owner') {
            UI.showToast('غير مصرح لك بإنشاء مستخدمين', 'error');
            return;
        }

        const loginId = document.getElementById('new-user-id').value.trim();
        const role = document.getElementById('new-user-role').value;
        const email = `${loginId}@jostock.com`.toLowerCase();
        
        UI.setButtonLoading('btn-create-user', true);
        try {
            const cred = await createUserWithEmailAndPassword(secondaryAuth, email, '123456');
            
            await setDoc(doc(db, 'users', cred.user.uid), {
                loginId: loginId,
                role: role,
                createdAt: serverTimestamp(),
                createdBy: AppState.currentUser.uid
            });
            
            await signOut(secondaryAuth);
            
            UI.showToast(`تم إنشاء المستخدم ${loginId} بنجاح`, 'success');
            document.getElementById('user-form').reset();
            loadUsersTable();
        } catch (error) {
            console.error(error);
            UI.showToast('خطأ في إنشاء المستخدم (قد يكون الرقم مستخدماً)', 'error');
        } finally {
            UI.setButtonLoading('btn-create-user', false);
        }
    });
});

// ═══════════════════════════════════════════════
//  USER MANAGEMENT UI HELPERS
// ═══════════════════════════════════════════════

window.openChangePasswordModal = () => UI.openModal('password-modal');

window.openUserManagementModal = () => {
    // RBAC: strict check
    if (AppState.userRole === 'worker' || !AppState.userRole) return;
    
    UI.openModal('user-modal');
    
    const roleSelect = document.getElementById('new-user-role');
    roleSelect.innerHTML = '';
    if (AppState.userRole === 'superadmin') {
        roleSelect.innerHTML += `<option value="owner">مدير (Owner)</option>`;
    }
    roleSelect.innerHTML += `<option value="worker">موظف (Worker)</option>`;
    
    loadUsersTable();
};

async function loadUsersTable() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="3">جاري التحميل...</td></tr>';
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let users = usersSnap.docs.map(d => ({uid: d.id, ...d.data()}));
        
        // Owner cannot see Superadmin
        if (AppState.userRole === 'owner') {
            users = users.filter(u => u.role !== 'superadmin');
        }
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">لا يوجد مستخدمين</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(u => {
            const roleName = u.role === 'superadmin' ? 'مدير نظام' : u.role === 'owner' ? 'مدير' : 'موظف';
            const canDelete = AppState.userRole === 'superadmin' && u.uid !== AppState.currentUser.uid;
            
            const deleteBtn = canDelete ? `<button class="btn btn-sm btn-outline" style="color: var(--danger); border-color: var(--danger-light); margin-right: 5px;" onclick="window.deleteUser('${u.uid}', '${u.loginId}')">حذف</button>` : '';
            
            return `<tr><td>${UI.escapeHtml(u.loginId)}</td><td>${roleName}</td><td>${deleteBtn}</td></tr>`;
        }).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="3">خطأ في جلب المستخدمين</td></tr>';
    }
}

// Password reset is handled manually via Firebase Console since there is no backend.

window.deleteUser = async (uid, loginId) => {
    if (!confirm(`هل أنت متأكد من حذف حساب الموظف "${loginId}" نهائياً من قاعدة الصلاحيات؟`)) return;
    try {
        await deleteDoc(doc(db, 'users', uid));
        UI.showToast('تم حذف المستخدم بنجاح', 'success');
        loadUsersTable();
    } catch (err) {
        console.error(err);
        UI.showToast('حدث خطأ أثناء حذف المستخدم', 'error');
    }
};

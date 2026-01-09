// ========================================
// ELECTRON SYNC - Bridge between Electron and Dashboard
// ========================================

import { uploadFromElectron } from './upload-sessions.js';
import { auth } from './firebase-init.js';

let isElectronApp = false;
let pendingFiles = [];
let registry = {};

let autoSyncTimer = null;
const AUTO_SYNC_DELAY = 3000; // 3 secondi di delay per debounce

export function initElectronSync() {
    if (typeof window.electronAPI !== 'undefined') {
        isElectronApp = true;
        console.log('[ELECTRON-SYNC] Running in Electron mode');

        window.electronAPI.onInitialFiles((data) => {
            console.log('[ELECTRON-SYNC] Received files:', data.files.length);
            pendingFiles = data.files;
            registry = data.registry || {};

            // AUTO-SYNC all'apertura: se l'utente è già loggato, sincronizza i file pendenti
            if (auth.currentUser && pendingFiles.length > 0) {
                console.log('[ELECTRON-SYNC] User already logged in, auto-syncing on open...');
                // Delay breve per permettere alla dashboard di caricarsi
                setTimeout(async () => {
                    await syncAllFiles();
                }, 2000);
            }
        });

        window.electronAPI.onFilesChanged((data) => {
            console.log('[ELECTRON-SYNC] Files changed:', data.new.length, 'new,', data.modified.length, 'modified');

            for (const file of [...data.new, ...data.modified]) {
                const idx = pendingFiles.findIndex(f => f.name === file.name);
                if (idx >= 0) pendingFiles[idx] = file;
                else pendingFiles.push(file);
            }

            // AUTO-SYNC: se l'utente è loggato, sincronizza automaticamente dopo un delay
            if (auth.currentUser && (data.new.length > 0 || data.modified.length > 0)) {
                // Debounce: resetta il timer se arrivano altri cambiamenti
                if (autoSyncTimer) clearTimeout(autoSyncTimer);
                autoSyncTimer = setTimeout(async () => {
                    console.log('[ELECTRON-SYNC] Auto-syncing...');
                    await syncAllFiles();
                    autoSyncTimer = null;
                }, AUTO_SYNC_DELAY);
            }
        });
        return true;
    }
    console.log('[ELECTRON-SYNC] Browser mode');
    return false;
}

export function isElectron() { return isElectronApp; }

function showSyncNotification() {
    // Disabled - using titlebar button instead of popup
    // Notification only appears after manual sync to show results
    return;
}

export async function syncAllFiles() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
        showToast('Non loggato', 'error');
        return { status: 'error' };
    }

    showToast('Sincronizzazione...', 'info');

    let created = 0, updated = 0, unchanged = 0;
    for (const file of pendingFiles) {
        const reg = registry[file.name];
        if (reg && reg.uploadedBy && reg.uploadedBy !== uid) continue;

        const rawObj = await window.electronAPI.readFile(file.path);
        if (!rawObj) continue;

        const result = await uploadFromElectron(rawObj, file.name, uid);
        if (result.status === 'created') created++;
        else if (result.status === 'updated') updated++;
        else if (result.status === 'unchanged') unchanged++;

        if (result.status === 'created' || result.status === 'updated') {
            await window.electronAPI.updateRegistry(file.name, { uploadedBy: uid, hash: result.fileHash, sessionId: result.sessionId });
            registry[file.name] = { uploadedBy: uid };
        }
    }

    // Show result toast
    if (created > 0 || updated > 0) {
        showToast(`✅ ${created} nuove, ${updated} aggiornate`, 'success');
    } else if (unchanged > 0) {
        showToast('✓ Tutto sincronizzato', 'success');
    } else {
        showToast('Nessun file da sincronizzare', 'info');
    }

    return { created, updated, unchanged };
}

// Simple toast notification
function showToast(message, type = 'info') {
    let toast = document.getElementById('syncToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'syncToast';
        toast.style.cssText = `
            position: fixed;
            top: 48px;
            right: 16px;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            z-index: 100000;
            opacity: 0;
            transform: translateX(20px);
            transition: all 0.3s ease;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }

    // Set color based on type
    const colors = {
        success: 'rgba(34, 197, 94, 0.95)',
        error: 'rgba(239, 68, 68, 0.95)',
        info: 'rgba(99, 102, 241, 0.95)'
    };
    toast.style.background = colors[type] || colors.info;
    toast.style.color = '#fff';
    toast.textContent = message;

    // Show
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);

    // Hide after 2.5s
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
    }, 2500);
}

window.electronSync = {
    init: initElectronSync,
    isElectron,
    sync: syncAllFiles,
    getPending: () => pendingFiles,
    showNotification: showSyncNotification
};

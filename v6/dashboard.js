// ===== ACC Telemetry Dashboard =====
// Main JavaScript Application

// Import from SINGLE firebase init point
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from './firebase-init.js';
// Import Firestore modules (they also use firebase-init.js internally)
import { handleFileUpload as firestoreUpload } from './upload-sessions.js';
import { fetchAllSessionsRaw } from './sessions-query.js';
// Import modular components
import { themeManager } from './modules/theme-manager.js';
class SplashScreen {
    constructor() {
        this.overlay = document.getElementById('splashOverlay');
        this.particles = document.getElementById('splashParticles');
        this.isActive = true;

        if (this.overlay) {
            this.init();
        }
    }

    init() {
        // Add splash-active class to app container
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.add('splash-active');
        }

        // Bind splash buttons to actual file inputs
        const splashFileBtn = document.getElementById('splashFileBtn');
        const splashFolderBtn = document.getElementById('splashFolderBtn');

        if (splashFileBtn) {
            splashFileBtn.addEventListener('click', () => {
                document.getElementById('fileInput').click();
            });
        }

        if (splashFolderBtn) {
            splashFolderBtn.addEventListener('click', () => {
                document.getElementById('folderInput').click();
            });
        }
    }

    // Create explosion particles
    createParticles() {
        const particleCount = 40;
        const box = this.overlay.querySelector('.splash-box');
        const boxRect = box.getBoundingClientRect();
        const centerX = boxRect.left + boxRect.width / 2;
        const centerY = boxRect.top + boxRect.height / 2;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'splash-particle';

            // Random position around the box border
            const angle = (i / particleCount) * Math.PI * 2;
            const radius = Math.max(boxRect.width, boxRect.height) / 2 + 10;
            const startX = centerX + Math.cos(angle) * radius;
            const startY = centerY + Math.sin(angle) * radius;

            // Random explosion direction
            const explosionDistance = 150 + Math.random() * 200;
            const tx = Math.cos(angle) * explosionDistance;
            const ty = Math.sin(angle) * explosionDistance;

            particle.style.left = startX + 'px';
            particle.style.top = startY + 'px';
            particle.style.setProperty('--tx', tx + 'px');
            particle.style.setProperty('--ty', ty + 'px');
            particle.style.opacity = '1';
            particle.style.animation = `particleExplode 0.8s ease-out forwards`;
            particle.style.animationDelay = Math.random() * 0.1 + 's';

            // Random colors
            const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#ffffff'];
            particle.style.background = colors[Math.floor(Math.random() * colors.length)];
            particle.style.width = (2 + Math.random() * 4) + 'px';
            particle.style.height = particle.style.width;

            this.particles.appendChild(particle);
        }
    }

    // Trigger the morph animation
    dismiss() {
        if (!this.isActive) return;
        this.isActive = false;

        // Create particle explosion
        this.createParticles();

        // Start morph animation
        this.overlay.classList.add('morphing');

        // Reveal app container
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            setTimeout(() => {
                appContainer.classList.add('revealing');
            }, 300);
        }

        // Fade out overlay
        setTimeout(() => {
            this.overlay.classList.add('exiting');
        }, 400);

        // Remove from DOM
        setTimeout(() => {
            this.overlay.classList.add('hidden');
            if (appContainer) {
                appContainer.classList.remove('splash-active', 'revealing');
            }
        }, 1200);
    }
}

// Global splash instance
let splashScreen = null;
document.addEventListener('DOMContentLoaded', () => {
    splashScreen = new SplashScreen();
});

class ACCDashboard {
    constructor() {
        // ===== USER STATE =====
        this.currentUser = null;
        this.registrationJustCompleted = false;

        // ===== SESSION DATA =====
        this.sessions = [];
        this.filteredSessions = [];
        this.currentSession = null;

        // ===== FILTERS =====
        this.filters = {
            track: '',
            car: '',
            type: '',
            period: '',
            search: ''
        };
        this.stintFilter = 'all';  // Lap analysis filter
        this.sectorFilter = 'all'; // Sector filter

        // ===== PAGINATION =====
        this.currentPage = 1;

        // ===== UI STATE =====
        this.layoutMode = localStorage.getItem('acc_layout_mode') || 'balanced';
        this.sessionsVariant = 'giornate'; // 'giornate', 'timeline', 'cards'
        this.sessionsPeriod = 'all'; // 'today', 'week', 'all'
        this.charts = {}; // Store chart instances map
        this.weekActivityChartInstance = null; // Separate chart instance

        // ===== DRIVER HISTORY =====
        this.historyStyle = localStorage.getItem('acc_history_style') || 'A';
        this.historyFocus = localStorage.getItem('acc_history_focus') || '1';
        this.historySelectedTrack = null;
        this.historyShowDataPoints = false;

        this.init();
    }

    init() {
        this.initTheme(); // Initialize color theme from localStorage
        this.initAuthForms(); // Initialize auth form handlers
        this.bindEvents();
        // Note: Sessions are loaded from Firestore per-user in bootstrapApp(), not from local demo files
    }

    // ===== AUTH GATE & UI STATE =====
    setUIState(state) {
        console.log('🎨 setUIState called with:', state);

        const overlay = document.getElementById('splashOverlay');
        const authPanel = document.getElementById('authPanel');
        const loadingPanel = document.getElementById('loadingPanel');
        const appView = document.getElementById('appView');
        const appContainer = document.querySelector('.app-container');

        // Debug: log current overlay classes before changes
        console.log('🔍 Overlay classes BEFORE:', overlay?.className);

        switch (state) {
            case 'auth':
                // ===== LOGOUT / SHOW LOGIN =====
                console.log('🔐 Showing auth overlay...');

                // 1. HIDE the app view completely
                if (appView) {
                    appView.classList.add('hidden');
                    appView.style.display = 'none';
                }

                // 2. FORCE reset overlay - use className to REPLACE all classes
                if (overlay) {
                    // Remove ALL classes and set only the base class
                    overlay.className = 'splash-overlay';

                    // Force inline styles
                    overlay.style.display = 'flex';
                    overlay.style.opacity = '1';
                    overlay.style.visibility = 'visible';
                    overlay.style.clipPath = 'none';
                    overlay.style.animation = 'none';
                    overlay.style.pointerEvents = 'auto';
                }

                // 3. Reset splashScreen state
                if (typeof splashScreen !== 'undefined' && splashScreen) {
                    splashScreen.isActive = true;
                }

                // 4. Reset app container
                if (appContainer) {
                    appContainer.classList.remove('revealing');
                    appContainer.classList.add('splash-active');
                    appContainer.style.opacity = '0';
                    appContainer.style.visibility = 'hidden';
                }

                // 5. Hide loading, show auth panel
                if (loadingPanel) loadingPanel.classList.add('hidden');
                if (authPanel) authPanel.classList.remove('hidden');

                // 6. RESET auth form buttons (remove loading state)
                ['authLoginBtn', 'authRegisterBtn', 'authResetBtn'].forEach(id => {
                    const btn = document.getElementById(id);
                    if (btn) {
                        btn.classList.remove('is-loading');
                        // Restore original text
                        if (id === 'authLoginBtn') btn.textContent = 'ACCEDI';
                        if (id === 'authRegisterBtn') btn.textContent = 'REGISTRATI';
                        if (id === 'authResetBtn') btn.textContent = 'Password dimenticata?';
                    }
                });

                // 7. Clear form inputs
                ['authLoginEmail', 'authLoginPassword', 'authRegisterEmail',
                    'authRegisterPassword', 'authRegisterConfirm'].forEach(id => {
                        const input = document.getElementById(id);
                        if (input) {
                            input.value = '';
                            input.classList.remove('has-error');
                        }
                    });

                // 8. Clear error messages
                ['loginError', 'registerError'].forEach(id => {
                    const errorEl = document.getElementById(id);
                    if (errorEl) {
                        errorEl.classList.remove('is-visible');
                        errorEl.textContent = '';
                        errorEl.style.background = '';
                        errorEl.style.borderColor = '';
                        errorEl.style.color = '';
                    }
                });

                // Debug: log overlay classes after changes
                console.log('🔍 Overlay classes AFTER:', overlay?.className);
                console.log('🔐 UI State: AUTH (login/register visible)');
                break;

            case 'loading':
                // HIDE app
                if (appView) {
                    appView.classList.add('hidden');
                    appView.style.display = 'none';
                }

                // SHOW overlay with loading
                if (overlay) {
                    overlay.className = 'splash-overlay';
                    overlay.style.display = 'flex';
                    overlay.style.opacity = '1';
                    overlay.style.visibility = 'visible';
                    overlay.style.clipPath = 'none';
                }

                if (authPanel) authPanel.classList.add('hidden');
                if (loadingPanel) loadingPanel.classList.remove('hidden');

                console.log('⏳ UI State: LOADING (bootstrap in progress)');
                break;

            case 'app':
                // Animate overlay out, show dashboard
                if (typeof splashScreen !== 'undefined' && splashScreen && splashScreen.isActive) {
                    splashScreen.dismiss();
                } else if (overlay) {
                    overlay.classList.add('hidden');
                    overlay.style.display = 'none';
                }

                // Show app
                if (appView) {
                    appView.classList.remove('hidden');
                    appView.style.display = '';
                }
                if (appContainer) {
                    appContainer.classList.remove('splash-active');
                    appContainer.style.opacity = '';
                    appContainer.style.visibility = '';
                }

                console.log('✅ UI State: APP (dashboard visible)');
                break;
        }
    }

    // ===== CLEAR ALL DASHBOARD UI (for logout) =====
    clearDashboardUI() {
        console.log('🧹 Clearing ALL dashboard UI...');

        // ===== 1. PANORAMICA =====

        // 1a. Clear sessions list (giornate)
        const giornateList = document.getElementById('giornateList');
        if (giornateList) {
            giornateList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📅</span>
                    <p>Nessuna sessione caricata</p>
                </div>
            `;
        }

        // 1b. Clear ALL overview stats
        const statElements = [
            'weekDriveTime', 'weekSessions', 'weekDays', 'weekAvgPerDay',
            'focusValidPercent', 'focusValidStats',
            'focusCarsTotal', 'focusStorageTotal'
        ];
        statElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = id.includes('Percent') ? '--%' : '0';
        });

        // 1c. Clear focus bars
        const focusValidBar = document.getElementById('focusValidBar');
        if (focusValidBar) {
            focusValidBar.style.width = '0%';
            focusValidBar.style.background = '';
            focusValidBar.style.boxShadow = '';
        }

        // 1d. Clear storage bars and legends
        ['focusCarsStorage', 'focusTracksStorage', 'focusCarsLegend', 'focusStorageLegend',
            'focusCarsList', 'focusTracksList'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });

        // 1e. Clear stacked bar and chips
        const stackedBar = document.getElementById('weekSessionStackedBar');
        if (stackedBar) stackedBar.innerHTML = '';
        const chipsContainer = document.getElementById('weekSessionChips');
        if (chipsContainer) chipsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">Nessuna sessione</div>';

        // 1f. Reset CTA button
        const ctaBtn = document.querySelector('.cta-last-session');
        if (ctaBtn) {
            ctaBtn.setAttribute('disabled', 'true');
            ctaBtn.style.opacity = '0.5';
            ctaBtn.style.cursor = 'not-allowed';
        }

        // ===== 2. STINT VIEW =====

        // 2a. Clear stint header info
        const stintTextElements = [
            'stintTrackName', 'stintCarName', 'stintDate', 'stintTime',
            'stintWeatherIcon', 'stintWeather', 'stintAirTemp', 'stintRoadTemp',
            'stintTotalLaps', 'stintDuration', 'stintValidLaps', 'stintInvalidLaps', 'stintBestLap'
        ];
        stintTextElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '--';
        });

        // 2b. Clear stint type badge
        const stintBadge = document.getElementById('stintTypeBadge');
        if (stintBadge) {
            stintBadge.textContent = '--';
            stintBadge.classList.remove('race', 'qualifying', 'practice');
        }

        // 2c. Clear lap table
        const lapTableBody = document.getElementById('lapTableBody');
        if (lapTableBody) lapTableBody.innerHTML = '';
        const stintLapTable = document.getElementById('stintLapTable');
        if (stintLapTable) stintLapTable.innerHTML = '';

        // 2d. Clear analysis state
        this.analysisState = null;

        // 2e. Clear analysis containers
        ['analysisControls', 'lapManager', 'ecgChartContainer', 'analysisKpis',
            'stintTimeline', 'stintTabs', 'sectorCharts'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });

        // 2f. Disable stint tab
        const stintTab = document.getElementById('stintTab');
        if (stintTab) {
            stintTab.classList.add('disabled');
            stintTab.setAttribute('title', 'Seleziona una sessione');
        }

        // ===== 3. DRIVER HISTORY VIEW =====

        // 3a. Clear header stats
        ['dhPilotPeriod', 'dhTotalSessions', 'dhTotalTracks', 'dhTotalTime', 'dhLastTrack'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '--';
        });

        // 3b. Clear chart title
        const dhChartTitle = document.getElementById('dhChartTitle');
        if (dhChartTitle) dhChartTitle.textContent = 'STORICO PISTA';

        // 3c. Clear track bests box
        const dhBestsTrackName = document.getElementById('dhBestsTrackName');
        if (dhBestsTrackName) dhBestsTrackName.textContent = '--';

        ['dhBestQualiTime', 'dhBestRaceTime'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '--:--.---';
        });

        ['dhBestQualiMeta', 'dhBestRaceMeta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });

        // 3d. Hide CTA buttons
        ['dhBestQualiCta', 'dhBestRaceCta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // 3e. Clear track list sidebar
        const dhTrackList = document.getElementById('dhTrackList');
        if (dhTrackList) dhTrackList.innerHTML = '';

        // 3f. Clear track grid
        const dhGrid = document.getElementById('dhGrid');
        if (dhGrid) dhGrid.innerHTML = '';

        // 3g. Clear history chart canvas
        const historyChartContainer = document.getElementById('trackHistoryChart');
        if (historyChartContainer) {
            const ctx = historyChartContainer.getContext?.('2d');
            if (ctx) ctx.clearRect(0, 0, historyChartContainer.width, historyChartContainer.height);
        }

        // 3h. Reset driver history internal state
        this.historySelectedTrack = null;
        this.currentHistoryTrack = null;
        this.lastSessionTrack = null;
        this.lastSessionIndex = null;
        this.bestQualiSessionIndex = null;
        this.bestRaceSessionIndex = null;

        // ===== 4. CHARTS =====

        // 4a. Destroy weekActivityChartInstance
        if (this.weekActivityChartInstance) {
            try { this.weekActivityChartInstance.destroy(); } catch (e) { }
            this.weekActivityChartInstance = null;
        }

        // 4b. Destroy all charts in this.charts
        if (this.charts) {
            Object.keys(this.charts).forEach(key => {
                if (this.charts[key]) {
                    try { this.charts[key].destroy(); } catch (e) { }
                    this.charts[key] = null;
                }
            });
            this.charts = {};
        }

        // ===== 5. VIEW STATE =====

        // 5a. Switch to overview tab (reset active view)
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const overviewView = document.getElementById('overview-view');
        if (overviewView) overviewView.classList.add('active');

        // 5b. Reset nav tabs
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        const overviewTab = document.querySelector('.nav-tab[data-view="overview"]');
        if (overviewTab) overviewTab.classList.add('active');

        // 5c. Exit driver history mode if active
        const navbar = document.querySelector('.nav-tabs');
        if (navbar) {
            navbar.classList.remove('nav-back-mode', 'nav-morphing');
        }

        console.log('🧹 Dashboard UI fully cleared (panoramica, stint, storico)');
    }

    // ===== CLEAR SESSIONS LIST (for logout) =====
    clearSessionsList() {
        // Clear internal state
        this.sessions = [];
        this.currentUser = null;

        // Clear sessions list in UI
        const sessionsList = document.getElementById('sessionsList');
        if (sessionsList) {
            sessionsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>Nessuna sessione caricata</h3>
                    <p>Carica un file JSON per visualizzare i dati della sessione</p>
                </div>
            `;
        }

        console.log('🧹 Sessions list cleared');
    }

    // ===== DEBUG DUMP (for troubleshooting) =====
    debugDump() {
        console.log('========== DEBUG DUMP ==========');
        console.log('auth.currentUser?.uid:', auth?.currentUser?.uid || 'null');
        console.log('this.currentUser?.uid:', this.currentUser?.uid || 'null');
        console.log('this.sessions.length:', this.sessions?.length || 0);
        if (this.sessions?.length > 0) {
            console.log('First session track:', this.sessions[0]?.session_info?.track || 'N/A');
        }
        console.log('================================');
        return {
            authUid: auth?.currentUser?.uid || null,
            dashboardUid: this.currentUser?.uid || null,
            sessionsCount: this.sessions?.length || 0
        };
    }

    // ===== Theme Management (delegated to themeManager module) =====
    initTheme() {
        themeManager.init();
    }

    changeTheme(themeName) {
        themeManager.change(themeName);
        // Re-render charts with new theme colors
        this.refreshChartsForTheme();
    }

    applyTheme(themeName) {
        themeManager.apply(themeName);
        this.refreshChartsForTheme();
    }

    // Delegate to themeManager
    getCssVar(varName, fallback = '') {
        return themeManager.getCssVar(varName, fallback);
    }

    getChartColors() {
        return themeManager.getChartColors();
    }

    getChartPalette() {
        return themeManager.getChartPalette();
    }

    // Refresh all charts when theme changes (kept here because it needs this.charts)
    refreshChartsForTheme() {
        // Destroy existing charts
        Object.keys(this.charts).forEach(key => {
            if (this.charts[key]) {
                this.charts[key].destroy();
                this.charts[key] = null;
            }
        });

        // Re-render if we have data
        if (this.sessions.length > 0) {
            const mode = this.viewMode || 'week';
            const sessions = mode === 'week' ? this.getWeekSessions() : this.sessions;

            // Re-render week activity chart
            this.renderWeekActivityChart(sessions);

            // Re-render session detail charts if in stints view
            if (this.currentSession) {
                this.renderStintEcgChart();
            }
        }
    }

    bindEvents() {
        // File input (singoli file) - connected to Firestore upload
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleJSONFirestoreUpload(e);
        });

        // Folder input (cartella intera) - connected to Firestore upload
        const folderInput = document.getElementById('folderInput');
        if (folderInput) {
            folderInput.addEventListener('change', (e) => {
                this.handleJSONFirestoreUpload(e);
            });
        }

        // Navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchView(e.target.closest('.nav-tab').dataset.view);
            });
        });

        // Back button in stints view
        document.getElementById('backToSessions').addEventListener('click', () => {
            this.switchView('sessions');
        });

        // Session Filters (only if elements exist)
        const trackFilter = document.getElementById('trackFilter');
        if (trackFilter) {
            trackFilter.addEventListener('change', (e) => {
                this.filters.track = e.target.value;
                this.renderSessionsList();
            });
        }

        const carFilter = document.getElementById('carFilter');
        if (carFilter) {
            carFilter.addEventListener('change', (e) => {
                this.filters.car = e.target.value;
                this.currentPage = 1;
                this.renderSessionsList();
            });
        }

        const typeFilter = document.getElementById('typeFilter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.filters.type = e.target.value;
                this.currentPage = 1;
                this.renderSessionsList();
            });
        }

        const periodFilter = document.getElementById('periodFilter');
        if (periodFilter) {
            periodFilter.addEventListener('change', (e) => {
                this.filters.period = e.target.value;
                this.currentPage = 1;
                this.renderSessionsList();
            });
        }

        const searchFilter = document.getElementById('searchFilter');
        if (searchFilter) {
            searchFilter.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.currentPage = 1;
                this.renderSessionsList();
            });
        }

        // Year selector for rhythm chart
        const yearSelector = document.getElementById('rhythmYearSelector');
        if (yearSelector) {
            yearSelector.addEventListener('change', (e) => {
                this.rhythmYearFilter = e.target.value;
                this.updateRhythmChart(this.sessions);
            });
        }
    }

    async loadDemoData() {
        // Try to load JSON files from acc-data folder
        const demoFiles = [
            'acc-data/session_20251223_210424_Zolder_Practice_amr_v8_vantage_gt3.json',
            'acc-data/session_20251223_212836_Zolder_Practice_amr_v8_vantage_gt3.json',
            'acc-data/session_20251224_133000_donington_Practice_ford_mustang_gt3.json',
            'acc-data/session_20251225_021008_Spa_Qualify_amr_v8_vantage_gt3.json',
            'acc-data/session_20251225_022204_Spa_Race_amr_v8_vantage_gt3.json',
            'acc-data/session_20251225_023322_Barcelona_Race_ford_mustang_gt3.json',
            'acc-data/session_20251226_135126_donington_Practice_ford_mustang_gt3.json'
        ];

        for (const filePath of demoFiles) {
            try {
                const response = await fetch(filePath);
                if (response.ok) {
                    const data = await response.json();
                    const exists = this.sessions.some(s =>
                        s.session_info.date_start === data.session_info.date_start &&
                        s.session_info.track === data.session_info.track
                    );
                    if (!exists) {
                        this.sessions.push(data);
                    }
                }
            } catch (error) {
                // Silently continue if file doesn't exist
            }
        }

        if (this.sessions.length > 0) {
            this.updateDashboard();
        } else {
            console.log('No session data found. Use "Carica Sessioni" or place files in acc-data/ folder.');
        }
    }

    handleFileUpload(files) {
        const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));

        if (jsonFiles.length === 0) {
            alert('Seleziona file JSON validi');
            return;
        }

        let loaded = 0;
        jsonFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (this.validateSessionData(data)) {
                        // Check for duplicates
                        const exists = this.sessions.some(s =>
                            s.session_info.date_start === data.session_info.date_start &&
                            s.session_info.track === data.session_info.track
                        );
                        if (!exists) {
                            this.sessions.push(data);
                        }
                    }
                } catch (err) {
                    console.error('Error parsing file:', file.name, err);
                }

                loaded++;
                if (loaded === jsonFiles.length) {
                    this.updateDashboard();
                }
            };
            reader.readAsText(file);
        });
    }

    validateSessionData(data) {
        return data.session_info &&
            data.session_info.track &&
            data.stints &&
            Array.isArray(data.stints);
    }

    updateDashboard() {
        this.updateDriverName();
        this.updateOverview();
        this.updateFilters();
        this.renderSessionsList();

        // Navigate to Panoramica after loading files
        this.switchView('overview');

        // Note: Splash screen dismiss is now handled by setUIState('app')
    }

    updateDriverName() {
        let driverName = 'Pilota';
        if (this.sessions.length > 0 && this.sessions[0].static_data) {
            const firstName = this.sessions[0].static_data.playerName || '';
            const lastName = this.sessions[0].static_data.playerSurname || '';
            driverName = `${firstName} ${lastName}`.trim() || 'Pilota';
        }

        const el = document.getElementById('driverName');
        if (el) el.textContent = driverName;

        const sessionsDriverName = document.getElementById('sessionsDriverName');
        if (sessionsDriverName) sessionsDriverName.textContent = driverName;
    }

    // ===== Overview Functions =====
    setViewMode(mode) {
        this.viewMode = mode;

        // Update toggle buttons
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update toggle container class for sliding indicator
        const viewToggle = document.querySelector('.view-toggle');
        if (viewToggle) {
            viewToggle.classList.toggle('global-active', mode === 'global');
        }

        // Show/hide year selector based on mode
        const yearSelectorContainer = document.getElementById('yearSelectorContainer');
        if (yearSelectorContainer) {
            yearSelectorContainer.style.display = mode === 'global' ? 'flex' : 'none';

            // Populate year selector when switching to global mode
            if (mode === 'global') {
                this.populateYearSelector();
            }
        }

        // Reset year filter when switching to week mode
        if (mode === 'week') {
            this.rhythmYearFilter = 'rolling';
        }

        // Trigger data refresh animation
        const overviewView = document.getElementById('overview-view');
        if (overviewView) {
            overviewView.classList.add('data-refreshing');
            // Remove class after animation completes
            setTimeout(() => {
                overviewView.classList.remove('data-refreshing');
            }, 700);
        }

        // Update overview with new mode
        this.updateOverview();
    }

    populateYearSelector() {
        const selector = document.getElementById('rhythmYearSelector');
        if (!selector || this.sessions.length === 0) return;

        // Get unique years from sessions
        const years = new Set();
        this.sessions.forEach(session => {
            const date = new Date(session.session_info.date_start);
            years.add(date.getFullYear());
        });

        // Sort years in descending order
        const sortedYears = Array.from(years).sort((a, b) => b - a);

        // Build options
        let html = '<option value="rolling">ULTIMI 12 MESI</option>';
        sortedYears.forEach(year => {
            html += `<option value="${year}">${year}</option>`;
        });

        selector.innerHTML = html;

        // Restore current filter if it exists
        if (this.rhythmYearFilter && this.rhythmYearFilter !== 'rolling') {
            selector.value = this.rhythmYearFilter;
        }
    }


    updateOverview() {
        if (this.sessions.length === 0) return;

        const mode = this.viewMode || 'week';
        const sessions = mode === 'week' ? this.getWeekSessions() : this.sessions;
        const stats = this.calculateStats(sessions);

        // ===== ATTIVITÀ Box (Left) =====
        const totalMins = Math.round(stats.totalDriveTime / 60000);
        // Format time: show hours and minutes if >= 60 minutes
        const formattedTime = totalMins >= 60
            ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
            : totalMins;
        this.setText('weekDriveTime', formattedTime);
        this.setText('weekSessions', stats.totalSessions);
        this.setText('weekDays', mode === 'week' ? stats.trainingDays + '/7' : stats.trainingDays);
        const avgPerDay = stats.trainingDays > 0 ? Math.round(totalMins / stats.trainingDays) : 0;
        // Format avgPerDay the same way
        const formattedAvg = avgPerDay >= 60
            ? `${Math.floor(avgPerDay / 60)}h ${avgPerDay % 60}m`
            : avgPerDay;
        this.setText('weekAvgPerDay', formattedAvg);
        this.renderWeekActivityChart(sessions);
        this.renderSessionStackedBar(sessions);

        // ===== FOCUS DI GUIDA Box (Right) =====
        this.updateFocusBox(stats, sessions);
    }

    updateFocusBox(stats, sessions) {
        // Section 1: Giri Validi (Gradient handled by CSS)
        const color = this.getCleanLapsColor(stats.validPercent);

        const percentEl = document.getElementById('focusValidPercent');
        if (percentEl) {
            percentEl.textContent = stats.validPercent + '%';
            percentEl.style.color = color;
        }

        this.setText('focusValidStats', stats.validLaps + ' / ' + stats.totalLaps + ' giri');

        const validBar = document.getElementById('focusValidBar');
        if (validBar) {
            validBar.style.width = stats.validPercent + '%';
            validBar.style.background = color;
            validBar.style.boxShadow = `0 0 10px ${color}40`;
        }

        // Section 2: AUTO Variants
        const carStats = this.getCarStats(sessions);
        this.renderStorageBar(carStats, 'focusCarsStorage', 'focusCarsLegend', 'focusCarsTotal', 'Nessuna auto utilizzata');
        this.renderVerticalList(carStats, 'focusCarsList', 'Nessuna auto utilizzata');

        // Section 3: PISTE Variants
        const trackStats = this.getTrackStats(sessions);
        this.renderStorageBar(trackStats, 'focusTracksStorage', 'focusStorageLegend', 'focusStorageTotal', 'Nessuna pista utilizzata');
        this.renderVerticalList(trackStats, 'focusTracksList', 'Nessuna pista utilizzata');

        // Disable CTA if no sessions
        const ctaBtn = document.querySelector('.cta-last-session');
        if (ctaBtn) {
            if (sessions.length === 0) {
                ctaBtn.setAttribute('disabled', 'true');
                ctaBtn.style.opacity = '0.5';
                ctaBtn.style.cursor = 'not-allowed';
            } else {
                ctaBtn.removeAttribute('disabled');
                ctaBtn.style.opacity = '1';
                ctaBtn.style.cursor = 'pointer';
            }
        }
    }

    getCleanLapsColor(pct) {
        const tc = this.getChartColors();
        if (pct >= 70) return tc.success; // Green (100-70)
        if (pct >= 40) return tc.warning; // Yellow (69-40)
        return tc.danger; // Red (<40)
    }

    switchFocusVariant(variant) {
        // Toggle Segmented Buttons
        document.querySelectorAll('.toggle-segment').forEach(b => b.classList.remove('active'));

        if (variant === 'v2') {
            const btn = document.getElementById('btn-sintesi');
            if (btn) btn.classList.add('active');
        } else if (variant === 'v3') {
            const btn = document.getElementById('btn-dettaglio');
            if (btn) btn.classList.add('active');
        }

        // Toggle Content Sections (Piste + Auto)
        document.querySelectorAll('.f-variant, .f-variant-cars').forEach(v => v.classList.remove('active'));

        // Activate Piste
        const trackTarget = document.getElementById('f-variant-' + variant);
        if (trackTarget) trackTarget.classList.add('active');

        // Activate Auto
        const carTarget = document.getElementById('f-car-' + variant);
        if (carTarget) carTarget.classList.add('active');
    }

    getTrackStats(sessions) {
        const map = {};
        sessions.forEach(s => {
            const t = s.session_info.track;
            if (!map[t]) {
                map[t] = { name: t, minutes: 0, sessions: 0 };
            }
            const mins = (s.session_info.total_drive_time_ms || 0) / 60000;
            map[t].minutes += mins;
            map[t].sessions++;
        });
        return Object.values(map).sort((a, b) => b.minutes - a.minutes);
    }

    getCarStats(sessions) {
        const map = {};
        sessions.forEach(s => {
            let rawName = s.session_info.car || 'Sconosciuta';
            // Simple formatting: replace underscores, capitalize
            const name = rawName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            if (!map[name]) {
                map[name] = { name: name, minutes: 0, sessions: 0 };
            }
            const mins = (s.session_info.total_drive_time_ms || 0) / 60000;
            map[name].minutes += mins;
            map[name].sessions++;
        });
        return Object.values(map).sort((a, b) => b.minutes - a.minutes);
    }

    // Generic V2: Storage Segmented Bar
    renderStorageBar(stats, containerId, legendId, totalId, emptyMsg) {
        const barContainer = document.getElementById(containerId);
        const legendContainer = document.getElementById(legendId);
        const totalContainer = document.getElementById(totalId);
        if (!barContainer || !legendContainer) return;

        const totalMins = stats.reduce((acc, t) => acc + t.minutes, 0);

        if (stats.length === 0 || totalMins === 0) {
            const tc = this.getChartColors();
            barContainer.innerHTML = `<div class="storage-segment" style="width: 100%; background: ${tc.emptyBg}; display: flex; align-items: center; justify-content: center; color: ${tc.emptyText}; font-size: 0.75rem;">${emptyMsg}</div>`;
            legendContainer.innerHTML = '';
            if (totalContainer) totalContainer.textContent = '';
            return;
        }

        // Show ALL items (No limit)
        const topTargets = stats;
        const othersMins = 0; // Disabled logic

        const colors = this.getChartPalette();

        // Bar
        let barHtml = topTargets.map((t, i) => {
            const pct = (t.minutes / totalMins) * 100;
            const color = colors[i % colors.length];
            return `<div class="storage-segment" style="width: ${pct}%; background: ${color}" title="${t.name}: ${Math.round(t.minutes)} min (${Math.round(pct)}%)"></div>`;
        }).join('');

        // tc already defined from getChartPalette context
        const tcEmpty = this.getChartColors();
        if (othersMins > 0) {
            const pct = (othersMins / totalMins) * 100;
            barHtml += `<div class="storage-segment" style="width: ${pct}%; background: ${tcEmpty.emptySegment}" title="Altre: ${Math.round(othersMins)} min (${Math.round(pct)}%)"></div>`;
        }
        barContainer.innerHTML = barHtml;

        // Legend
        let legendHtml = topTargets.map((t, i) => {
            const color = colors[i % colors.length];
            return `<div class="storage-legend-item">
                <div class="legend-dot" style="background: ${color}"></div>
                <span>${t.name}</span>
            </div>`;
        }).join('');

        if (othersMins > 0) {
            legendHtml += `<div class="storage-legend-item">
                <div class="legend-dot" style="background: ${tcEmpty.emptySegment}"></div>
                <span>Altre</span>
            </div>`;
        }
        legendContainer.innerHTML = legendHtml;

        // Total Label REMOVED as per user request
        if (totalContainer) totalContainer.style.display = 'none';
    }

    // Generic V3: Vertical List with Truncation
    renderVerticalList(stats, containerId, emptyMsg) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (stats.length === 0) {
            container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; padding: 10px;">${emptyMsg}</div>`;
            return;
        }

        // Show ALL items
        const visibleItems = stats;
        const remainingCount = 0;
        const maxMins = visibleItems.length > 0 ? visibleItems[0].minutes : 1;

        let html = visibleItems.map(t => {
            const pct = (t.minutes / maxMins) * 100;
            return `<div class="track-list-item">
                <div class="track-list-name" title="${t.name}">${t.name}</div>
                <div class="track-list-bar-bg">
                    <div class="track-list-bar-fill" style="width: ${pct}%"></div>
                </div>
                <div class="track-list-val">${Math.round(t.minutes)} min</div>
            </div>`;
        }).join('');

        if (remainingCount > 0) {
            html += `<div class="track-list-item" style="opacity: 0.7;">
                <div class="track-list-name" style="font-style: italic;">+ ${remainingCount} altre</div>
                <div class="track-list-bar-bg" style="background: transparent;"></div>
                <div class="track-list-val"></div>
            </div>`;
        }

        container.innerHTML = html;
    }

    // V1: Main - Bar + Label (Wireframe style)
    renderFocusVariantV1(trackStats) {
        const container = document.getElementById('focusTracksMain');
        if (!container) return;
        const topTracks = trackStats.slice(0, 4);
        const maxMins = topTracks.length > 0 ? topTracks[0].minutes : 1;

        container.innerHTML = topTracks.map(t => {
            const pct = (t.minutes / maxMins) * 100;
            return `<div class="focus-track-row" title="${t.name}">
                <div class="focus-track-info">
                    <span>${t.name}</span>
                    <span class="focus-track-mins">${Math.round(t.minutes)} min</span>
                </div>
                <div class="focus-track-bar-bg">
                    <div class="focus-track-bar-fill" style="width: ${pct}%"></div>
                </div>
            </div>`;
        }).join('');
    }

    // V2: Storage - Single Segmented Bar
    renderFocusVariantV2(trackStats) {
        const barContainer = document.getElementById('focusTracksStorage');
        const legendContainer = document.getElementById('focusStorageLegend');
        const totalContainer = document.getElementById('focusStorageTotal');
        if (!barContainer || !legendContainer) return;

        const totalMins = trackStats.reduce((acc, t) => acc + t.minutes, 0);

        // Handle 0 sessions
        const tc = this.getChartColors();
        if (trackStats.length === 0 || totalMins === 0) {
            barContainer.innerHTML = `<div class="storage-segment" style="width: 100%; background: ${tc.emptyBg}; display: flex; align-items: center; justify-content: center; color: ${tc.emptyText}; font-size: 0.75rem;">Nessuna sessione</div>`;
            legendContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">Nessuna sessione negli ultimi 7 giorni</div>';
            if (totalContainer) totalContainer.textContent = '';
            return;
        }

        const topTargets = trackStats.slice(0, 5);
        const othersMins = totalMins - topTargets.reduce((acc, t) => acc + t.minutes, 0);

        // Extended Palette
        const colors = this.getChartPalette();

        // Bar
        let barHtml = topTargets.map((t, i) => {
            const pct = (t.minutes / totalMins) * 100;
            const color = colors[i % colors.length];
            return `<div class="storage-segment" style="width: ${pct}%; background: ${color}" title="${t.name}: ${Math.round(t.minutes)} min (${Math.round(pct)}%)"></div>`;
        }).join('');

        if (othersMins > 0) {
            const pct = (othersMins / totalMins) * 100;
            barHtml += `<div class="storage-segment" style="width: ${pct}%; background: ${tc.emptySegment}" title="Altre: ${Math.round(othersMins)} min (${Math.round(pct)}%)"></div>`;
        }
        barContainer.innerHTML = barHtml;

        // Legend
        let legendHtml = topTargets.map((t, i) => {
            const color = colors[i % colors.length];
            return `<div class="storage-legend-item">
                <div class="legend-dot" style="background: ${color}"></div>
                <span>${t.name}</span>
            </div>`;
        }).join('');

        if (othersMins > 0) {
            legendHtml += `<div class="storage-legend-item">
                <div class="legend-dot" style="background: ${tc.emptySegment}"></div>
                <span>Altre</span>
            </div>`;
        }
        legendContainer.innerHTML = legendHtml;

        // Total
        if (totalContainer) totalContainer.textContent = `${Math.round(totalMins)} min totali`;
    }

    // V3: List - Inline (All Tracks)
    renderFocusVariantV3(trackStats) {
        const container = document.getElementById('focusTracksList');
        if (!container) return;

        if (trackStats.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 10px;">Nessun dato</div>';
            return;
        }

        const topTracks = trackStats; // Use all
        const maxMins = topTracks.length > 0 ? topTracks[0].minutes : 1;

        container.innerHTML = topTracks.map(t => {
            const pct = (t.minutes / maxMins) * 100;
            return `<div class="track-list-item">
                <div class="track-list-name" title="${t.name}">${t.name}</div>
                <div class="track-list-bar-bg">
                    <div class="track-list-bar-fill" style="width: ${pct}%"></div>
                </div>
                <div class="track-list-val">${Math.round(t.minutes)} min</div>
            </div>`;
        }).join('');
    }

    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // Render 7-day activity bar chart
    renderWeekActivityChart(sessions) {
        const canvas = document.getElementById('weekActivityChart');
        if (!canvas) return;

        // Build 7 days with real day names
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        const now = new Date();
        const labels = [];
        const dayData = [];
        const dateMap = {};

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            const label = i === 0 ? 'Oggi' : dayNames[d.getDay()];
            labels.push(label);
            dateMap[dateKey] = labels.length - 1;
            dayData.push({ minutes: 0, sessions: 0, date: d });
        }

        // Populate with session data
        sessions.forEach(session => {
            const date = new Date(session.session_info.date_start);
            const dateKey = date.toISOString().split('T')[0];
            if (dateMap[dateKey] !== undefined) {
                const idx = dateMap[dateKey];
                dayData[idx].minutes += (session.session_info.total_drive_time_ms || 0) / 60000;
                dayData[idx].sessions++;
            }
        });

        const data = dayData.map(d => Math.round(d.minutes));

        if (this.weekActivityChartInstance) {
            this.weekActivityChartInstance.destroy();
        }


        // Get theme colors
        const colors = this.getChartColors();

        this.weekActivityChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: data.map((v, i) =>
                        labels[i] === 'Oggi' ? colors.success :
                            v > 0 ? colors.accent : 'rgba(63, 63, 70, 0.3)'),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const idx = ctx.dataIndex;
                                return data[idx] + ' MIN - ' + dayData[idx].sessions + ' SESS';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { display: false },
                        ticks: {
                            color: (ctx) => ctx.tick.label === 'Oggi' ? colors.success : colors.textMuted,
                            font: { size: 10, weight: (ctx) => ctx.tick.label === 'Oggi' ? 'bold' : 'normal' }
                        }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: colors.textMuted,
                            font: { size: 9 },
                            stepSize: 10
                        }
                    }
                }
            }
        });
    }

    // Render stacked bar + chips for session types
    renderSessionStackedBar(sessions) {
        const stackedBar = document.getElementById('weekSessionStackedBar');
        const chipsContainer = document.getElementById('weekSessionChips');

        // Chips might not exist in some variants (e.g. Activity Hero)
        if (!stackedBar || !chipsContainer) return;

        const types = { practice: 0, qualy: 0, race: 0 };
        const counts = { practice: 0, qualy: 0, race: 0 };

        sessions.forEach(s => {
            const time = s.session_info.total_drive_time_ms || 0;
            const type = s.session_info.session_type;

            if (type === 0 || type === 'Practice') {
                types.practice += time;
                counts.practice++;
            } else if (type === 1 || type === 'Qualify') {
                types.qualy += time;
                counts.qualy++;
            } else if (type === 2 || type === 'Race') {
                types.race += time;
                counts.race++;
            } else {
                types.practice += time;
                counts.practice++;
            }
        });

        const totalTime = types.practice + types.qualy + types.race;
        const pct = (v) => totalTime > 0 ? (v / totalTime) * 100 : 0;
        const mins = (v) => Math.round(v / 60000);

        if (totalTime === 0) {
            const tc = this.getChartColors();
            stackedBar.innerHTML = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: ${tc.textMuted}; font-size: 0.7rem;">Nessuna sessione</div>`;
            chipsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">Nessuna sessione negli ultimi 7 giorni</div>';
            return;
        }

        // Update stacked bar with Tooltips
        const segments = [];
        if (types.practice > 0) segments.push({ type: 'practice', name: 'Practice', width: pct(types.practice), mins: mins(types.practice) });
        if (types.qualy > 0) segments.push({ type: 'qualy', name: 'Qualify', width: pct(types.qualy), mins: mins(types.qualy) });
        if (types.race > 0) segments.push({ type: 'race', name: 'Race', width: pct(types.race), mins: mins(types.race) });

        stackedBar.innerHTML = segments.map(s =>
            `<div class="stacked-segment ${s.type}" style="width:${s.width}%" title="${s.name} — ${s.mins} min"></div>`
        ).join('');

        // Update chips with New Format: [ Practice · 68 min · 4 sessioni ]
        const chipHtml = [];
        if (counts.practice > 0) {
            chipHtml.push(`<div class="session-chip practice">
                <span class="chip-type">Practice</span>
                <span class="chip-separator">·</span>
                <span class="chip-details">${mins(types.practice)} min</span>
                <span class="chip-separator">·</span>
                <span class="chip-details">${counts.practice} sessioni</span>
            </div>`);
        }
        if (counts.qualy > 0) {
            chipHtml.push(`<div class="session-chip qualy">
                <span class="chip-type">Qualify</span>
                <span class="chip-separator">·</span>
                <span class="chip-details">${mins(types.qualy)} min</span>
                <span class="chip-separator">·</span>
                <span class="chip-details">${counts.qualy} sessioni</span>
            </div>`);
        }
        if (counts.race > 0) {
            chipHtml.push(`<div class="session-chip race">
                <span class="chip-type">Race</span>
                <span class="chip-separator">·</span>
                <span class="chip-details">${mins(types.race)} min</span>
                <span class="chip-separator">·</span>
                <span class="chip-details">${counts.race} sessioni</span>
            </div>`);
        }

        chipsContainer.innerHTML = chipHtml.join('');
    }



    getWeekSessions() {
        // Rolling window: oggi - 6 giorni (ultimi 7 giorni REALI)
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sixDaysAgo = new Date(startOfToday);
        sixDaysAgo.setDate(startOfToday.getDate() - 6);

        return this.sessions.filter(s => {
            const sessionDate = new Date(s.session_info.date_start);
            return sessionDate >= sixDaysAgo;
        });
    }

    updateSessionTypeDistribution(sessionTypeTimes) {
        const total = sessionTypeTimes.practice + sessionTypeTimes.qualifying + sessionTypeTimes.race;

        const practicePercent = total > 0 ? Math.round((sessionTypeTimes.practice / total) * 100) : 0;
        const qualifyPercent = total > 0 ? Math.round((sessionTypeTimes.qualifying / total) * 100) : 0;
        const racePercent = total > 0 ? Math.round((sessionTypeTimes.race / total) * 100) : 0;

        document.getElementById('legendPractice').textContent = `${practicePercent}%`;
        document.getElementById('legendQualify').textContent = `${qualifyPercent}%`;
        document.getElementById('legendRace').textContent = `${racePercent}%`;

        // Draw donut chart
        this.drawDonutChart(practicePercent, qualifyPercent, racePercent);
    }

    drawDonutChart(practice, qualify, race) {
        const canvas = document.getElementById('distributionChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 30;  // Restore original radius logic
        const lineWidth = 10;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const total = practice + qualify + race;
        const tc = this.getChartColors();
        if (total === 0) {
            // Draw empty ring
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = tc.ringEmpty;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            return;
        }

        const colors = [tc.accent, tc.warning, tc.success]; // practice, qualify, race
        const values = [practice, qualify, race];
        let startAngle = -Math.PI / 2;

        values.forEach((value, i) => {
            if (value > 0) {
                const sliceAngle = (value / total) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                ctx.strokeStyle = colors[i];
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                ctx.strokeStyle = colors[i];
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'butt';
                ctx.stroke();
                startAngle += sliceAngle;
            }
        });
    }

    updateWeeklyActivityChart(dailyActivity) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const maxActivity = Math.max(...Object.values(dailyActivity), 1);

        days.forEach((day, i) => {
            const barEl = document.getElementById(`bar${day}`);
            const valEl = document.getElementById(`val${day}`);

            if (barEl && valEl) {
                const activity = dailyActivity[i] || 0;
                const heightPercent = activity > 0 ? Math.max(5, (activity / maxActivity) * 100) : 0;
                barEl.style.height = `${heightPercent}%`;

                if (activity > 0) {
                    const minutes = Math.round(activity / 60000);
                    valEl.textContent = minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`;
                } else {
                    valEl.textContent = '-';
                }
            }
        });
    }

    updateMonthlyActivityChart() {
        const container = document.getElementById('monthlyActivityChart');
        if (!container) return;

        // Calculate monthly activity for last 12 months
        const monthlyData = {};
        const now = new Date();

        // Initialize last 12 months
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            monthlyData[key] = { time: 0, label: date.toLocaleDateString('it', { month: 'short' }) };
        }

        // Aggregate session time by month
        this.sessions.forEach(session => {
            const date = new Date(session.session_info.date_start);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (monthlyData[key]) {
                monthlyData[key].time += session.session_info.total_drive_time_ms || 0;
            }
        });

        const months = Object.values(monthlyData);
        const maxTime = Math.max(...months.map(m => m.time), 1);

        container.innerHTML = months.map(m => {
            const heightPercent = m.time > 0 ? Math.max(5, (m.time / maxTime) * 100) : 0;
            const hours = Math.round(m.time / 3600000);
            return `
                <div class="activity-bar-item">
                    <div class="bar-fill" style="height: ${heightPercent}%"></div>
                    <span class="bar-label">${m.label}</span>
                    <span class="bar-value">${hours > 0 ? hours + 'h' : '-'}</span>
                </div>
            `;
        }).join('');
    }

    goToLastSession() {
        if (this.sessions.length === 0) return;

        // Sort by date and get the latest
        const sortedSessions = [...this.sessions].sort((a, b) =>
            new Date(b.session_info.date_start) - new Date(a.session_info.date_start)
        );

        this.openSession(this.sessions.indexOf(sortedSessions[0]));
    }

    calculateStats(sessions) {
        let totalDriveTime = 0;
        let totalLaps = 0;
        let validLaps = 0;
        let totalStints = 0;
        const tracks = new Set();
        const cars = new Set();
        const trainingDays = new Set();
        const sessionTypes = { practice: 0, qualifying: 0, race: 0 };
        const sessionTypeTimes = { practice: 0, qualifying: 0, race: 0 }; // Time-based distribution
        const dailyActivity = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const bestLapsByTrack = {};
        let allLapTimes = [];

        sessions.forEach(session => {
            const driveTime = session.session_info.total_drive_time_ms || 0;
            totalDriveTime += driveTime;

            // Calcola giri usando getCleanLaps (escludi pit + out-lap)
            const { cleanLaps, excludedCount } = this.getCleanLaps(session);
            totalLaps += cleanLaps.length;
            validLaps += cleanLaps.filter(l => l.is_valid).length;

            totalStints += session.stints ? session.stints.length : 0;

            tracks.add(session.session_info.track);
            cars.add(session.session_info.car);

            const sessionDate = new Date(session.session_info.date_start);
            trainingDays.add(sessionDate.toDateString());

            const dayOfWeek = sessionDate.getDay();
            const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            dailyActivity[adjustedDay] += driveTime;

            const sessionType = session.session_info.session_type;
            if (sessionType === 0 || sessionType === 3 || sessionType === 4) {
                sessionTypes.practice++;
                sessionTypeTimes.practice += driveTime;
            } else if (sessionType === 1) {
                sessionTypes.qualifying++;
                sessionTypeTimes.qualifying += driveTime;
            } else if (sessionType === 2) {
                sessionTypes.race++;
                sessionTypeTimes.race += driveTime;
            }

            // Best lap per track
            const track = session.session_info.track;
            const bestLap = session.session_info.session_best_lap;
            if (bestLap > 0) {
                if (!bestLapsByTrack[track] || bestLap < bestLapsByTrack[track].time) {
                    bestLapsByTrack[track] = {
                        time: bestLap,
                        car: session.session_info.car,
                        date: session.session_info.date_start
                    };
                }
            }

            // Collect valid lap times for consistency
            session.stints.forEach((stint, stintIndex) => {
                stint.laps.forEach((lap, lapIndex) => {
                    // REGOLA: Ignora primo giro di ogni stint
                    if (lapIndex === 0) return;

                    if (lap.is_valid && !lap.is_pit_lap && lap.lap_time_ms > 0) {
                        allLapTimes.push(lap.lap_time_ms);
                    }
                });
            });
        });

        // Calculate consistency
        const avgLapTime = allLapTimes.length > 0
            ? allLapTimes.reduce((a, b) => a + b, 0) / allLapTimes.length
            : 0;
        const lapTimeVariance = allLapTimes.length > 1
            ? Math.sqrt(allLapTimes.reduce((sum, t) => sum + Math.pow(t - avgLapTime, 2), 0) / allLapTimes.length) / 1000
            : 0;
        const consistencyPercent = Math.min(100, Math.max(0, 100 - (lapTimeVariance / 5) * 100));
        const avgStintLaps = totalStints > 0 ? Math.round(totalLaps / totalStints) : 0;
        const validPercent = totalLaps > 0 ? Math.round(validLaps / totalLaps * 100) : 0;

        // Calculate period range
        let periodRange = '--';
        if (sessions.length > 0) {
            const dates = sessions.map(s => new Date(s.session_info.date_start)).sort((a, b) => a - b);
            const start = dates[0];
            const end = dates[dates.length - 1];
            periodRange = `${start.toLocaleDateString('it', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('it', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }

        return {
            totalDriveTime,
            totalLaps,
            validLaps,
            validPercent,
            totalSessions: sessions.length,
            trainingDays: trainingDays.size,
            tracks: [...tracks],
            cars: [...cars],
            sessionTypes,
            sessionTypeTimes,
            avgStintLaps,
            consistencyPercent,
            dailyActivity,
            bestLapsByTrack,
            periodRange,
            lapTimeVariance
        };
    }

    updatePeriodSection(stats) {
        // Period range
        document.getElementById('periodRange').textContent = stats.periodRange;

        // Quick stats
        document.getElementById('periodDriveTime').textContent = this.formatDurationLong(stats.totalDriveTime);
        document.getElementById('periodTrainingDays').textContent = stats.trainingDays;
        document.getElementById('periodSessions').textContent = stats.totalSessions;
        document.getElementById('periodLaps').textContent = stats.totalLaps;
        document.getElementById('periodValidInfo').textContent = `${stats.validLaps} validi`;
        document.getElementById('periodValidPercent').textContent = `${stats.validPercent}%`;

        // Activity heatmap
        this.updateActivityHeatmap(stats.dailyActivity);

        // Performance bars
        this.updatePeriodPerformance(stats);
    }

    updatePeriodPerformance(stats) {
        // Consistency
        const consistencyBar = document.getElementById('periodConsistencyBar');
        const consistencyBadge = document.getElementById('periodConsistency');
        consistencyBar.style.width = `${stats.consistencyPercent}%`;
        consistencyBadge.textContent = `${Math.round(stats.consistencyPercent)}%`;

        let consistencyDesc = 'Regolarità dei tempi sul giro';
        if (stats.consistencyPercent >= 80) {
            consistencyDesc = `±${stats.lapTimeVariance.toFixed(1)}s - Eccellente!`;
        } else if (stats.consistencyPercent >= 60) {
            consistencyDesc = `±${stats.lapTimeVariance.toFixed(1)}s - Buona consistenza`;
        } else {
            consistencyDesc = `±${stats.lapTimeVariance.toFixed(1)}s - Da migliorare`;
        }
        document.getElementById('periodConsistencyDesc').textContent = consistencyDesc;

        // Validity
        const validityBar = document.getElementById('periodValidityBar');
        const validityBadge = document.getElementById('periodValidity');
        validityBar.style.width = `${stats.validPercent}%`;
        validityBadge.textContent = `${stats.validPercent}%`;

        let validityDesc = 'Disciplina sui limiti pista';
        if (stats.validPercent >= 90) {
            validityDesc = 'Ottima disciplina sui limiti!';
        } else if (stats.validPercent >= 70) {
            validityDesc = 'Attenzione ai track limits';
        } else {
            validityDesc = 'Troppi invalidi, focus sui limiti';
        }
        document.getElementById('periodValidityDesc').textContent = validityDesc;

        // Stint
        const stintBar = document.getElementById('periodStintBar');
        const stintBadge = document.getElementById('periodStint');
        const stintPercent = Math.min(100, (stats.avgStintLaps / 10) * 100);
        stintBar.style.width = `${stintPercent}%`;
        stintBadge.textContent = `${stats.avgStintLaps}`;
        document.getElementById('periodStintDesc').textContent = `Media ${stats.avgStintLaps} giri per stint`;
    }

    updateGlobalSection(stats) {
        // Session count
        document.getElementById('globalSessionCount').textContent = `${stats.totalSessions} sessioni totali`;

        // Global totals
        document.getElementById('globalDriveTime').textContent = this.formatDurationLong(stats.totalDriveTime);
        document.getElementById('globalLaps').textContent = stats.totalLaps;
        document.getElementById('globalValidPercent').textContent = `${stats.validPercent}%`;
        document.getElementById('globalTracks').textContent = stats.tracks.length;
        document.getElementById('globalCars').textContent = stats.cars.length;

        // Best laps per track
        this.updateBestLapsGrid(stats.bestLapsByTrack);
    }

    updateBestLapsGrid(bestLapsByTrack) {
        const container = document.getElementById('bestLapsGrid');
        const tracks = Object.keys(bestLapsByTrack);

        if (tracks.length === 0) {
            container.innerHTML = '<div class="empty-state-small"><p>Nessun record disponibile</p></div>';
            return;
        }

        container.innerHTML = tracks.sort().map(track => {
            const data = bestLapsByTrack[track];
            return `
                <div class="best-lap-item">
                    <div class="bli-info">
                        <span class="bli-track">${track}</span>
                        <span class="bli-car">${this.formatCarName(data.car)}</span>
                    </div>
                    <span class="bli-time">${this.formatLapTime(data.time)}</span>
                </div>
            `;
        }).join('');
    }

    updateActivityHeatmap(dailyActivity) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const maxActivity = Math.max(...Object.values(dailyActivity), 1);

        days.forEach((day, i) => {
            const fillEl = document.getElementById(`day${day}`);
            const timeEl = document.getElementById(`time${day}`);

            if (fillEl && timeEl) {
                const activity = dailyActivity[i] || 0;
                const heightPercent = (activity / maxActivity) * 100;
                fillEl.style.height = `${heightPercent}%`;

                if (activity > 0) {
                    const hours = Math.floor(activity / 3600000);
                    const minutes = Math.floor((activity % 3600000) / 60000);
                    timeEl.textContent = hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
                } else {
                    timeEl.textContent = '-';
                }
            }
        });
    }

    formatDurationLong(ms) {
        if (!ms || ms <= 0) return '0h 0m';

        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);

        return `${hours}h ${minutes}m`;
    }

    // ===== Sector Filtering Helper =====
    isValidSectorData(lap, lapIndex, lapTimeMs) {
        // REGOLA 1: Ignora primo giro di ogni stint
        if (lapIndex === 0) return false;

        // REGOLA 2: Ignora settori anomali (somma > 105% del lap time)
        if (lap.sector_times_ms && lap.sector_times_ms.length >= 3) {
            const sectorSum = lap.sector_times_ms.reduce((a, b) => a + (b > 0 ? b : 0), 0);
            if (sectorSum > lapTimeMs * 1.05) return false;
        }

        return true;
    }

    calculateGlobalStats() {
        let totalLaps = 0;
        let validLaps = 0;
        let totalDriveTime = 0;
        let allLapTimes = [];
        let allSectorTimes = [[], [], []];
        let bestLap = null;

        this.sessions.forEach(session => {
            totalLaps += session.session_info.laps_total || 0;
            validLaps += session.session_info.laps_valid || 0;
            totalDriveTime += session.session_info.total_drive_time_ms || 0;

            // Track best lap
            if (session.session_info.session_best_lap > 0) {
                if (!bestLap || session.session_info.session_best_lap < bestLap.time) {
                    bestLap = {
                        time: session.session_info.session_best_lap,
                        track: session.session_info.track,
                        car: session.session_info.car
                    };
                }
            }

            // Collect lap times for statistics
            session.stints.forEach(stint => {
                stint.laps.forEach(lap => {
                    if (lap.is_valid && !lap.is_pit_lap && lap.lap_time_ms > 0) {
                        allLapTimes.push(lap.lap_time_ms);

                        // Collect sector times
                        if (lap.sector_times_ms && lap.sector_times_ms.length >= 3) {
                            for (let i = 0; i < 3; i++) {
                                if (lap.sector_times_ms[i] > 0 && lap.sector_times_ms[i] < 200000) {
                                    allSectorTimes[i].push(lap.sector_times_ms[i]);
                                }
                            }
                        }
                    }
                });
            });
        });

        // Calculate average and variance
        const avgLapTime = allLapTimes.length > 0
            ? Math.round(allLapTimes.reduce((a, b) => a + b, 0) / allLapTimes.length)
            : 0;

        const lapTimeVariance = allLapTimes.length > 1
            ? Math.sqrt(allLapTimes.reduce((sum, t) => sum + Math.pow(t - avgLapTime, 2), 0) / allLapTimes.length) / 1000
            : 0;

        // Calculate sector stats
        const sectorStats = allSectorTimes.map((times, i) => {
            if (times.length === 0) return null;
            const best = Math.min(...times);
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            const worst = Math.max(...times);
            return { best, avg, worst, variance: (worst - best) / 1000 };
        });

        return {
            totalLaps,
            validLaps,
            totalDriveTime,
            avgLapTime,
            lapTimeVariance,
            bestLap,
            sectorStats
        };
    }

    updateRing(ringId, percent) {
        const circumference = 339.292;
        const offset = circumference - (percent / 100) * circumference;
        const ring = document.querySelector(`#${ringId} .ring-progress`);
        if (ring) {
            ring.style.strokeDashoffset = offset;
        }
    }

    updateImprovementCards(stats) {
        const container = document.getElementById('improvementCards');

        if (!stats.sectorStats || stats.sectorStats.every(s => s === null)) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📂</span>
                    <p>Carica le sessioni per vedere l'analisi</p>
                </div>
            `;
            return;
        }

        let cards = '';

        // Consistency analysis
        if (stats.lapTimeVariance < 1) {
            cards += this.createImprovementCard('good', '🎯', 'Consistenza Eccellente',
                `Varianza di soli ${stats.lapTimeVariance.toFixed(2)}s tra i giri`);
        } else if (stats.lapTimeVariance < 2) {
            cards += this.createImprovementCard('improve', '📊', 'Consistenza Buona',
                `Varianza di ${stats.lapTimeVariance.toFixed(2)}s - Margine di miglioramento`);
        } else {
            cards += this.createImprovementCard('critical', '⚠️', 'Consistenza da Migliorare',
                `Varianza di ${stats.lapTimeVariance.toFixed(2)}s - Cerca di essere più costante`);
        }

        // Validity analysis
        const validityRate = stats.validLaps / stats.totalLaps * 100;
        if (validityRate >= 90) {
            cards += this.createImprovementCard('good', '✅', 'Ottima Disciplina',
                `${validityRate.toFixed(0)}% dei giri validi - Eccellente!`);
        } else if (validityRate >= 70) {
            cards += this.createImprovementCard('improve', '🔍', 'Track Limits',
                `${validityRate.toFixed(0)}% giri validi - Attenzione ai limiti pista`);
        } else {
            cards += this.createImprovementCard('critical', '🚨', 'Track Limits Critici',
                `Solo ${validityRate.toFixed(0)}% giri validi - Lavora sui limiti pista`);
        }

        // Sector analysis - find weakest sector
        const validSectors = stats.sectorStats.filter(s => s !== null);
        if (validSectors.length === 3) {
            const sectorVariances = stats.sectorStats.map((s, i) => ({ sector: i + 1, variance: s.variance }));
            sectorVariances.sort((a, b) => b.variance - a.variance);

            const weakest = sectorVariances[0];
            const strongest = sectorVariances[2];

            cards += this.createImprovementCard('improve', '🔧', `Focus: Settore ${weakest.sector}`,
                `Varianza più alta (${weakest.variance.toFixed(2)}s) - Concentra il training qui`);

            cards += this.createImprovementCard('good', '💪', `Forte: Settore ${strongest.sector}`,
                `Varianza più bassa (${strongest.variance.toFixed(2)}s) - Ottimo lavoro!`);
        }

        container.innerHTML = cards;
    }

    createImprovementCard(type, icon, title, description) {
        return `
            <div class="improvement-card">
                <div class="improvement-icon ${type}">${icon}</div>
                <div class="improvement-content">
                    <h4>${title}</h4>
                    <p>${description}</p>
                </div>
            </div>
        `;
    }

    updateSectorAnalysis(stats) {
        const container = document.getElementById('sectorBars');

        if (!stats.sectorStats || stats.sectorStats.every(s => s === null)) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📊</span>
                    <p>Nessun dato settori disponibile</p>
                </div>
            `;
            return;
        }

        const colors = ['s1', 's2', 's3'];
        const sectorNames = ['Settore 1', 'Settore 2', 'Settore 3'];

        let html = '';
        stats.sectorStats.forEach((sector, i) => {
            if (!sector) return;

            // Calculate fill percentage based on variance (inverse - less variance = more fill)
            const maxVariance = 5; // 5 seconds as max expected variance
            const fillPercent = Math.max(10, 100 - (sector.variance / maxVariance * 100));

            html += `
                <div class="sector-bar-container">
                    <div class="sector-header">
                        <h4>${sectorNames[i]}</h4>
                        <span class="sector-time">${this.formatSectorTime(sector.best)}</span>
                    </div>
                    <div class="sector-bar">
                        <div class="sector-bar-fill ${colors[i]}" style="width: ${fillPercent}%"></div>
                    </div>
                    <div class="sector-stats">
                        <span>Best: ${this.formatSectorTime(sector.best)}</span>
                        <span>Avg: ${this.formatSectorTime(sector.avg)}</span>
                        <span>Δ ${sector.variance.toFixed(2)}s</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ===== Sessions View Functions =====
    updateFilters() {
        const tracks = [...new Set(this.sessions.map(s => s.session_info.track))];
        const cars = [...new Set(this.sessions.map(s => s.session_info.car))];

        const trackFilter = document.getElementById('trackFilter');
        const carFilter = document.getElementById('carFilter');

        if (trackFilter) {
            trackFilter.innerHTML = '<option value="">Tutte le Piste</option>' +
                tracks.map(t => `<option value="${t}">${t}</option>`).join('');
        }

        if (carFilter) {
            carFilter.innerHTML = '<option value="">Tutte le Auto</option>' +
                cars.map(c => `<option value="${c}">${this.formatCarName(c)}</option>`).join('');
        }
    }

    renderSessionsList() {
        // Apply period filter
        let filtered = this.sessions;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        if (this.sessionsPeriod === 'today') {
            filtered = filtered.filter(s => new Date(s.session_info.date_start) >= todayStart);
        } else if (this.sessionsPeriod === 'week') {
            filtered = filtered.filter(s => new Date(s.session_info.date_start) >= weekAgo);
        }

        // Apply track filter
        const trackFilter = document.getElementById('trackFilter');
        if (trackFilter && trackFilter.value) {
            filtered = filtered.filter(s => s.session_info.track === trackFilter.value);
        }

        // Apply car filter
        const carFilter = document.getElementById('carFilter');
        if (carFilter && carFilter.value) {
            filtered = filtered.filter(s => s.session_info.car === carFilter.value);
        }

        // Apply type filter
        const typeFilter = document.getElementById('typeFilter');
        if (typeFilter && typeFilter.value !== '') {
            const typeVal = parseInt(typeFilter.value);
            filtered = filtered.filter(s => s.session_info.session_type === typeVal);
        }

        // Apply date range filter
        const dateStartInput = document.getElementById('dateStart');
        const dateEndInput = document.getElementById('dateEnd');

        if (dateStartInput && dateStartInput.value) {
            const startDate = new Date(dateStartInput.value);
            startDate.setHours(0, 0, 0, 0); // Inizio giornata
            filtered = filtered.filter(s => new Date(s.session_info.date_start) >= startDate);
        }

        if (dateEndInput && dateEndInput.value) {
            const endDate = new Date(dateEndInput.value);
            endDate.setHours(23, 59, 59, 999); // Fine giornata
            filtered = filtered.filter(s => new Date(s.session_info.date_start) <= endDate);
        }

        // Sort by date descending
        filtered.sort((a, b) => new Date(b.session_info.date_start) - new Date(a.session_info.date_start));
        this.filteredSessions = filtered;

        // Render Giornate layout
        this.renderGiornateVariant(filtered);
    }

    applyFilters() {
        this.renderSessionsList();
    }

    setSessionsPeriod(period) {
        this.sessionsPeriod = period;

        // Update tabs
        document.querySelectorAll('.period-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.period === period);
        });

        // Update sliding indicator
        const tabsContainer = document.querySelector('.period-tabs');
        if (tabsContainer) {
            tabsContainer.classList.remove('period-today', 'period-week', 'period-all');
            tabsContainer.classList.add('period-' + period);
        }

        this.renderSessionsList();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GIORNATE LAYOUT (grouped by day)
    // ═══════════════════════════════════════════════════════════════════════
    renderGiornateVariant(sessions) {
        const container = document.getElementById('giornateList');
        if (!container) return;

        if (sessions.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">📅</span><p>Nessuna sessione trovata</p></div>';
            return;
        }

        // Group by day
        const days = {};
        sessions.forEach(session => {
            const date = new Date(session.session_info.date_start);
            const dayKey = date.toISOString().split('T')[0];
            if (!days[dayKey]) {
                days[dayKey] = { sessions: [], tracks: new Set(), totalTime: 0 };
            }
            days[dayKey].sessions.push(session);
            days[dayKey].tracks.add(session.session_info.track);
            days[dayKey].totalTime += session.session_info.total_drive_time_ms || 0;
        });

        // Pagination: show limited days
        const DAYS_PER_PAGE = 10;
        const sortedDayKeys = Object.keys(days).sort().reverse();
        const visibleDays = sortedDayKeys.slice(0, this.visibleDaysCount || DAYS_PER_PAGE);
        const hasMore = sortedDayKeys.length > visibleDays.length;
        const totalSessions = sessions.length;
        let visibleSessions = 0;

        let html = '';

        visibleDays.forEach(dayKey => {
            const day = days[dayKey];
            const date = new Date(dayKey);
            const dateStr = date.toLocaleDateString('it', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();

            // Header Simplified: Date + Stats (No Tracks in header as per request "sotto la data")
            // Actually user said "Card GIORNO: Data... Sotto: solo righe".
            // Tracks summary is removed from header to keep it clean, as per "TOGLIERE pista ripetuta sotto la data".

            const totalMins = Math.round(day.totalTime / 60000);
            visibleSessions += day.sessions.length;

            html += '<div class="giornata-block">';
            html += '<div class="giornata-header simplified">';
            html += '<div class="giornata-date-row">';
            html += '<span class="date-text">' + dateStr + '</span>';
            html += '</div>';
            html += '<div class="giornata-stats-row">' + totalMins + ' min totali · ' + day.sessions.length + ' session' + (day.sessions.length === 1 ? 'e' : 'i') + '</div>';
            html += '</div>';

            html += '<div class="giornata-sessions">';

            day.sessions.forEach(session => {
                const sessionIndex = this.sessions.indexOf(session);

                // Data Preparation
                const typeName = this.getSessionTypeName(session.session_info.session_type).toUpperCase();
                const typeClass = this.getSessionTypeClass(session.session_info.session_type).toLowerCase(); // 'practice', 'qualify', 'race'
                const car = this.formatCarName(session.session_info.car);
                const track = session.session_info.track;

                const laps = session.session_info.laps_total || 0;
                const validLaps = session.session_info.laps_valid || 0;
                const validPercent = laps > 0 ? Math.round(validLaps / laps * 100) : 0;
                const bestTime = session.session_info.session_best_lap > 0 ? this.formatLapTime(session.session_info.session_best_lap) : '--:--.---';
                const bestClass = session.session_info.session_best_lap > 0 ? 'highlight-best' : '';

                const sessionDate = new Date(session.session_info.date_start);
                const timeStr = sessionDate.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });

                // Color for validity bar
                const validColor = this.getCleanLapsColor(validPercent); // Using method from class

                // --- STRICT SEMANTIC LAYOUT ---
                html += `<div class="session-card session-row" onclick="dashboard.openSession(${sessionIndex})">`;

                // 1. TYPE (Chip)
                html += `<div class="sess-type"><span class="session-chip chip-${typeClass}">${typeName}</span></div>`;

                // 2. TIME
                html += `<div class="sess-time">${timeStr}</div>`;

                // 3. TRACK
                html += `<div class="sess-track">${track}</div>`;

                // 4. CAR
                html += `<div class="sess-car">${car}</div>`;

                // 5. METRICS WRAPPER (Laps, Valid, Bar, Best)
                html += `<div class="sess-metrics">`;
                html += `<div class="metric-group"><span class="lbl">Giri</span> <strong class="val">${laps}</strong></div>`;
                html += `<div class="metric-divider"></div>`;
                html += `<div class="metric-group"><span class="lbl">Validi</span> <strong class="val">${validPercent}%</strong></div>`;
                html += `<div class="metric-divider"></div>`;
                html += `<div class="metric-bar"><div class="mini-validity-bar"><div class="fill" style="width: ${validPercent}%; background: linear-gradient(90deg, ${validColor}, ${validColor}); box-shadow: 0 0 8px ${validColor}66;"></div></div></div>`;
                html += `<div class="metric-divider"></div>`;
                html += `<div class="metric-best"><span class="lbl">BEST</span> <span class="val ${bestClass}">${bestTime}</span></div>`;
                html += `</div>`;

                // 6. ACTION
                html += `<div class="sess-action">`;
                html += `<button class="session-action-btn">Apri</button>`;
                html += `</div>`;

                html += '</div>'; // close session-card
            });

            html += '</div></div>'; // close sessions / block
        });

        // Load More button
        if (hasMore) {
            html += `<div class="load-more-container"><button class="btn btn-secondary" onclick="dashboard.loadMoreDays()">Carica altri giorni (${totalSessions - visibleSessions} rimanenti)</button></div>`;
        }

        container.innerHTML = html;
    }

    loadMoreDays() {
        const DAYS_PER_PAGE = 10;
        this.visibleDaysCount = (this.visibleDaysCount || DAYS_PER_PAGE) + DAYS_PER_PAGE;
        this.renderSessionsList();
    }

    getSessionTypeClass(type) {
        if (type === 0 || type === 3 || type === 4) return 'practice';
        if (type === 1) return 'qualify';
        if (type === 2) return 'race';
        return 'practice';
    }

    getValidityClass(percent) {
        if (percent >= 70) return 'high';
        if (percent >= 40) return 'medium';
        return 'low';
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderSessionsList();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    nextPage() {
        const totalPages = Math.ceil((this.filteredSessions?.length || 0) / 25);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderSessionsList();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    sortSessions(sortBy) {
        this.sortBy = sortBy;

        // Update active sort button
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === sortBy);
        });

        this.renderSessionsList();
    }

    // ===== Lap Analysis Filter Methods =====
    setStintFilter(stintValue) {
        this.stintFilter = stintValue;

        // Update button states
        document.querySelectorAll('#stintFilterGroup .filter-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.stint === stintValue);
        });

        // Re-render with filter
        this.applyLapFilters();
    }

    setSectorFilter(sectorValue) {
        this.sectorFilter = sectorValue;

        // Update button states
        document.querySelectorAll('#sectorFilterGroup .filter-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sector === sectorValue);
        });

        // Re-render with filter
        this.applyLapFilters();
    }

    applyLapFilters() {
        if (!this.currentSession) return;

        const session = this.currentSession;
        let allLaps = session.stints.flatMap(s => s.laps);
        const { cleanLaps } = this.getCleanLaps(session);
        const validLaps = cleanLaps.filter(l => l.is_valid);
        const bestLapTime = validLaps.length > 0 ? Math.min(...validLaps.map(l => l.lap_time_ms)) : 0;

        // Filter by stint
        let filteredLaps = cleanLaps;
        let allLapsFiltered = allLaps;

        if (this.stintFilter !== 'all') {
            const stintIndex = parseInt(this.stintFilter);
            filteredLaps = cleanLaps.filter(l => l.stint_index === stintIndex);
            allLapsFiltered = allLaps.filter(l => l.stint_index === stintIndex);
        }

        // Re-render chart and table with filtered data
        this.renderLapChart(filteredLaps, bestLapTime);
        this.renderLapsTable(allLapsFiltered, bestLapTime);

        // Update stats row
        this.updateLapStats(filteredLaps);
    }

    updateLapStats(laps) {
        const validLaps = laps.filter(l => l.is_valid && l.lap_time_ms > 0);
        const sectorFilter = this.sectorFilter || 'all';

        // Helper to get sector time safely
        const getSectorTime = (lap, sectorIndex) => {
            if (lap.sector_times_ms && lap.sector_times_ms.length > sectorIndex) {
                return lap.sector_times_ms[sectorIndex];
            }
            return 0;
        };

        let optimalValue, avgValue, deltaValue;
        let optimalLabel = 'GIRO OTTIMALE';
        let avgLabel = 'MEDIA';

        if (sectorFilter === 'all') {
            // Calculate optimal lap from best sectors
            const allSessionLaps = this.currentSession.stints.flatMap(s => s.laps);
            const lapsWithSectors = allSessionLaps.filter(l =>
                l.is_valid && l.sector_times_ms && l.sector_times_ms.length === 3 &&
                l.sector_times_ms[0] > 0 && l.sector_times_ms[1] > 0 && l.sector_times_ms[2] > 0
            );

            if (lapsWithSectors.length > 0) {
                const bestS1 = Math.min(...lapsWithSectors.map(l => l.sector_times_ms[0]));
                const bestS2 = Math.min(...lapsWithSectors.map(l => l.sector_times_ms[1]));
                const bestS3 = Math.min(...lapsWithSectors.map(l => l.sector_times_ms[2]));
                optimalValue = bestS1 + bestS2 + bestS3;
            } else {
                optimalValue = 0;
            }

            // Average lap time
            if (validLaps.length > 0) {
                avgValue = validLaps.reduce((sum, l) => sum + l.lap_time_ms, 0) / validLaps.length;
            } else {
                avgValue = 0;
            }

            // Delta (standard deviation)
            if (validLaps.length > 1) {
                const mean = avgValue;
                const squareDiffs = validLaps.map(l => Math.pow(l.lap_time_ms - mean, 2));
                const avgSquareDiff = squareDiffs.reduce((sum, d) => sum + d, 0) / squareDiffs.length;
                deltaValue = Math.sqrt(avgSquareDiff);
            } else {
                deltaValue = 0;
            }
        } else {
            // Sector-specific stats
            const sectorIndex = sectorFilter === 's1' ? 0 : sectorFilter === 's2' ? 1 : 2;
            const lapsWithSector = validLaps.filter(l => getSectorTime(l, sectorIndex) > 0);

            optimalLabel = `BEST ${sectorFilter.toUpperCase()}`;
            avgLabel = `MEDIA ${sectorFilter.toUpperCase()}`;

            if (lapsWithSector.length > 0) {
                // Best sector is optimal
                optimalValue = Math.min(...lapsWithSector.map(l => getSectorTime(l, sectorIndex)));

                // Average sector
                avgValue = lapsWithSector.reduce((sum, l) => sum + getSectorTime(l, sectorIndex), 0) / lapsWithSector.length;

                // Delta (standard deviation)
                if (lapsWithSector.length > 1) {
                    const mean = avgValue;
                    const squareDiffs = lapsWithSector.map(l => Math.pow(getSectorTime(l, sectorIndex) - mean, 2));
                    const avgSquareDiff = squareDiffs.reduce((sum, d) => sum + d, 0) / squareDiffs.length;
                    deltaValue = Math.sqrt(avgSquareDiff);
                } else {
                    deltaValue = 0;
                }
            } else {
                optimalValue = 0;
                avgValue = 0;
                deltaValue = 0;
            }
        }

        // Update DOM
        const optimalEl = document.getElementById('statOptimalLap');
        const avgEl = document.getElementById('statAvgLap');
        const deltaEl = document.getElementById('statDelta');

        if (optimalEl) {
            optimalEl.textContent = optimalValue > 0
                ? (sectorFilter === 'all' ? this.formatLapTime(optimalValue) : this.formatSectorTime(optimalValue))
                : '--:--.---';
            optimalEl.parentElement.querySelector('.lap-stat-label').textContent = optimalLabel;
        }
        if (avgEl) {
            avgEl.textContent = avgValue > 0
                ? (sectorFilter === 'all' ? this.formatLapTime(avgValue) : this.formatSectorTime(avgValue))
                : '--:--.---';
            avgEl.parentElement.querySelector('.lap-stat-label').textContent = avgLabel;
        }
        if (deltaEl) {
            deltaEl.textContent = deltaValue > 0
                ? `±${(deltaValue / 1000).toFixed(3)}`
                : '±0.000';
        }
    }

    populateStintFilterButtons() {
        if (!this.currentSession) return;

        const container = document.getElementById('stintFilterGroup');
        if (!container) return;

        const stints = this.currentSession.stints;

        // Build buttons: TUTTI + one for each stint
        let html = '<button class="filter-toggle-btn active" data-stint="all" onclick="dashboard.setStintFilter(\'all\')">TUTTI</button>';
        stints.forEach((stint, index) => {
            html += `<button class="filter-toggle-btn" data-stint="${index}" onclick="dashboard.setStintFilter('${index}')">${index + 1}</button>`;
        });

        container.innerHTML = html;
    }

    openSession(index) {
        // Use the index directly from the original sessions array
        // The rendering code passes this.sessions.indexOf(session) which is the correct index
        this.currentSession = this.sessions[index];
        if (!this.currentSession) {
            console.error('Session not found at index:', index);
            return;
        }
        this.renderStintsView();
        this.switchView('stints');
    }

    // ===== Session Detail View Functions =====
    renderStintsView() {
        if (!this.currentSession) return;

        const session = this.currentSession;
        const info = session.session_info;

        // Enable Stint tab
        const stintTab = document.getElementById('stintTab');
        if (stintTab) {
            stintTab.classList.remove('disabled');
            stintTab.removeAttribute('title');
        }

        // 1️⃣ Track Name
        this.setTextContent('stintTrackName', info.track || 'Unknown Track');

        // 2️⃣ Session Type Badge
        const sessionType = this.getSessionTypeName(info.session_type);
        const badgeEl = document.getElementById('stintTypeBadge');
        if (badgeEl) {
            badgeEl.textContent = sessionType.toUpperCase();
            // Remove all type classes and add the correct one
            badgeEl.classList.remove('race', 'qualifying', 'practice');
            if (info.session_type === 2) {
                badgeEl.classList.add('race');
            } else if (info.session_type === 1) {
                badgeEl.classList.add('qualifying');
            } else {
                badgeEl.classList.add('practice');
            }
        }

        // 3️⃣ Car Name
        this.setTextContent('stintCarName', this.formatCarName(info.car));

        // 4️⃣ Date & Time
        const date = new Date(info.date_start);
        const dateStr = date.toLocaleDateString('it', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });
        this.setTextContent('stintDate', dateStr);
        this.setTextContent('stintTime', timeStr);

        // 5️⃣ Weather & Conditions
        this.setTextContent('stintWeatherIcon', this.getWeatherIcon(info.start_weather || 'No Rain'));
        this.setTextContent('stintWeather', info.start_weather || 'Dry');
        this.setTextContent('stintAirTemp', Math.round(info.start_air_temp || 22) + '°C');
        this.setTextContent('stintRoadTemp', Math.round(info.start_road_temp || 28) + '°C');

        // 6️⃣ Statistics Cards
        // Total Laps (from JSON)
        this.setTextContent('stintTotalLaps', info.laps_total || 0);

        // Duration
        const totalMs = info.total_drive_time_ms || 0;
        const mins = Math.floor(totalMs / 60000);
        const secs = Math.floor((totalMs % 60000) / 1000);
        const durationStr = mins >= 60
            ? `${Math.floor(mins / 60)}h ${mins % 60}m`
            : `${mins}m ${secs}s`;
        this.setTextContent('stintDuration', durationStr);

        // Valid / Invalid Laps (from JSON)
        this.setTextContent('stintValidLaps', info.laps_valid || 0);
        this.setTextContent('stintInvalidLaps', info.laps_invalid || 0);

        // Best Lap (from JSON)
        const bestLapTime = info.session_best_lap || 0;
        this.setTextContent('stintBestLap', bestLapTime > 0 ? this.formatLapTime(bestLapTime) : '--:--.---');

        // 7️⃣ ECG Chart
        // 7️⃣ Initialize Advanced Analysis
        this.initAnalysis(session);

        // 8️⃣ Lap Table
        this.renderStintLapTable(session, bestLapTime);
    }

    // ===== ADVANCED ANALYSIS SYSTEM =====
    initAnalysis(session) {
        this.analysisState = {
            scope: 'all',
            metric: 'lap',
            mode: 'standard',
            compareStint: null,
            preset: 'none',
            trend: false,
            excludedLaps: new Set(),
            compareModeEnabled: false
        };
        this.renderAnalysisControls();
        this.renderLapManager();
        this.updateAnalysis();
    }

    renderAnalysisControls() {
        const session = this.currentSession;
        if (!session) return;

        const stintSelect = document.getElementById('analStintSelect');
        if (stintSelect) {
            let html = '<option value="all">Tutta la Sessione</option>';
            session.stints.forEach((s, i) => {
                const lapCount = s.laps ? s.laps.length : 0;
                html += `<option value="${i}">Stint ${i + 1} (${lapCount} giri)</option>`;
            });
            stintSelect.innerHTML = html;
            stintSelect.value = 'all';
        }

        const compareGroup = document.getElementById('analCompareGroup');
        const compareSelect = document.getElementById('analCompareTarget');
        const compareToggle = document.getElementById('analCompareCheck');

        if (session.stints.length > 1) {
            if (compareToggle) compareToggle.parentElement.style.display = 'flex';
            if (compareSelect) {
                let html = '';
                session.stints.forEach((s, i) => {
                    html += `<option value="${i}">Stint ${i + 1}</option>`;
                });
                compareSelect.innerHTML = html;
                // Set default compare target to 2nd stint if available, else 1st
                if (session.stints.length > 1) compareSelect.value = "1";
                else compareSelect.value = "0";
            }
        } else {
            if (compareToggle) compareToggle.parentElement.style.display = 'none';
            if (compareGroup) compareGroup.style.display = 'none';
        }

        // Reset toggles UI
        if (document.getElementById('analTrendCheck')) document.getElementById('analTrendCheck').checked = false;
        if (document.getElementById('analCompareCheck')) document.getElementById('analCompareCheck').checked = false;
    }

    renderLapManager() {
        const grid = document.getElementById('analLapGrid');
        if (!grid || !this.currentSession) return;

        const allLaps = this.currentSession.stints.flatMap(s => s.laps);
        const bestLap = this.currentSession.session_info.session_best_lap;

        grid.innerHTML = allLaps.map(lap => {
            const isExcluded = this.analysisState.excludedLaps.has(lap.lap_number);
            const isBest = lap.lap_time_ms === bestLap && lap.is_valid;

            let classes = ['lap-toggle-btn'];
            if (isExcluded) classes.push('excluded');
            else if (isBest) classes.push('valid', 'best');
            else if (lap.is_valid) classes.push('valid');
            else classes.push('invalid');

            return `<div class="${classes.join(' ')}" onclick="dashboard.toggleLapExclusion(${lap.lap_number})" title="Giro ${lap.lap_number} - ${this.formatLapTime(lap.lap_time_ms)}">
                ${lap.lap_number}
            </div>`;
        }).join('');
    }

    toggleLapManager() {
        const panel = document.getElementById('analLapManager');
        if (panel) panel.classList.toggle('hidden');
    }

    toggleLapExclusion(lapNum) {
        if (this.analysisState.excludedLaps.has(lapNum)) {
            this.analysisState.excludedLaps.delete(lapNum);
        } else {
            this.analysisState.excludedLaps.add(lapNum);
        }
        this.renderLapManager();
        this.updateAnalysis();
    }

    resetExcludedLaps() {
        this.analysisState.excludedLaps.clear();
        this.renderLapManager();
        this.updateAnalysis();
    }

    updateAnalysisState(key) {
        if (key === 'stint') this.analysisState.scope = document.getElementById('analStintSelect').value;
        if (key === 'metric') this.analysisState.metric = document.getElementById('analMetricSelect').value;
        if (key === 'preset') this.analysisState.preset = document.getElementById('analPresetSelect').value;
        if (key === 'trend') this.analysisState.trend = document.getElementById('analTrendCheck').checked;
        if (key === 'compareTarget') this.analysisState.compareStint = document.getElementById('analCompareTarget').value;

        this.updateAnalysis();
    }

    toggleCompareMode() {
        const isChecked = document.getElementById('analCompareCheck').checked;
        const compareGroup = document.getElementById('analCompareGroup');
        const stintSelect = document.getElementById('analStintSelect');
        const compareSelect = document.getElementById('analCompareTarget');
        const session = this.currentSession; // FIX: Get current session

        if (!session) return;

        this.analysisState.compareModeEnabled = isChecked;

        // Get the "Tutta la Sessione" option
        const allOption = stintSelect?.querySelector('option[value="all"]');

        if (isChecked) {
            if (compareGroup) {
                compareGroup.classList.remove('hidden');
                compareGroup.style.display = 'flex';
            }

            // Disable "Tutta la Sessione" option in compare mode
            if (allOption) {
                allOption.disabled = true;
                allOption.textContent = 'Tutta la Sessione (non disponibile)';
            }

            // When enabling compare mode: force a specific stint comparison
            if (this.analysisState.scope === 'all') {
                // Default to comparing Stint 1 vs Stint 2 (if exists)
                stintSelect.value = "0";
                this.analysisState.scope = "0";
            }

            // Set compare target to a DIFFERENT stint
            const currentScope = parseInt(this.analysisState.scope);
            if (session.stints.length > 1) {
                // Pick the next available stint (not the same as current)
                let compareIdx = currentScope === 0 ? 1 : 0;
                if (currentScope >= session.stints.length - 1) {
                    compareIdx = 0;
                } else {
                    compareIdx = currentScope + 1;
                }
                this.analysisState.compareStint = String(compareIdx);
                if (compareSelect) compareSelect.value = String(compareIdx);
            }
        } else {
            if (compareGroup) compareGroup.style.display = 'none';

            // Re-enable "Tutta la Sessione" option when compare mode is off
            if (allOption) {
                allOption.disabled = false;
                allOption.textContent = 'Tutta la Sessione';
            }
        }

        this.updateAnalysis();
    }

    // Render lap table with fluo styling, stint separators, and filter sync
    renderStintLapTable(session, bestLapTime) {
        const tbody = document.getElementById('stintLapTableBody');
        if (!tbody) return;

        // Get sync state and filter options
        const syncEnabled = document.getElementById('tableSyncCheck')?.checked ?? true;
        const hideUnknownGrip = document.getElementById('hideUnknownGripCheck')?.checked ?? false;
        const excludedLaps = this.analysisState?.excludedLaps || new Set();
        const presetFilter = this.analysisState?.preset || 'none';

        // Get all laps, optionally filtering out unknown grip laps
        let allLaps = session.stints.flatMap(s => s.laps);
        if (hideUnknownGrip) {
            allLaps = allLaps.filter(l => l.track_grip_status !== 'Unknown' && l.track_grip_status);
        }

        // Find best sectors (across all valid laps)
        const bestS1 = Math.min(...allLaps.filter(l => l.sector_times_ms?.[0] > 0 && l.is_valid).map(l => l.sector_times_ms[0]));
        const bestS2 = Math.min(...allLaps.filter(l => l.sector_times_ms?.[1] > 0 && l.is_valid).map(l => l.sector_times_ms[1]));
        const bestS3 = Math.min(...allLaps.filter(l => l.sector_times_ms?.[2] > 0 && l.is_valid).map(l => l.sector_times_ms[2]));

        // Format sector times (seconds with 3 decimals)
        const formatSector = (ms) => ms > 0 ? (ms / 1000).toFixed(3) : '-';

        // Helper to check if lap should be dimmed based on filters
        const shouldDim = (lap) => {
            if (!syncEnabled) return false;
            if (excludedLaps.has(lap.lap_number)) return true;
            if (presetFilter === 'no-pit' && (lap.has_pit_stop || lap.pit_out_lap)) return true;
            if (presetFilter === 'valid' && !lap.is_valid) return true;
            if (presetFilter === 'reliable' && lap.sectors_reliable === false) return true;
            return false;
        };

        let html = '';
        let currentStintIndex = 0;

        session.stints.forEach((stint, stintIdx) => {
            // Add stint separator (except for first stint)
            if (stintIdx > 0) {
                html += `
                    <tr class="stint-separator-row">
                        <td colspan="10" class="stint-separator-cell">
                            <div class="stint-separator-line"></div>
                            <span class="stint-separator-label">STINT ${stintIdx + 1}</span>
                            <div class="stint-separator-line"></div>
                        </td>
                    </tr>
                `;
            }

            stint.laps.forEach(lap => {
                // Skip unknown grip laps if filter is enabled
                if (hideUnknownGrip && (lap.track_grip_status === 'Unknown' || !lap.track_grip_status)) {
                    return;
                }

                const isBest = lap.lap_time_ms === bestLapTime && lap.is_valid;
                const isCut = !lap.is_valid;
                const isDimmed = shouldDim(lap);

                // Row classes
                let rowClasses = [];
                if (isBest) rowClasses.push('best-lap-row');
                else if (isCut) rowClasses.push('cut-lap-row');
                if (isDimmed) rowClasses.push('dimmed-row');

                // Lap time class
                let lapTimeClass = 'lap-time';
                if (isBest) lapTimeClass += ' best';
                else if (isCut) lapTimeClass += ' invalid';

                // Sector classes
                const s1Class = lap.sector_times_ms?.[0] === bestS1 && lap.is_valid ? 'sector-time best-sector' : 'sector-time';
                const s2Class = lap.sector_times_ms?.[1] === bestS2 && lap.is_valid ? 'sector-time best-sector' : 'sector-time';
                const s3Class = lap.sector_times_ms?.[2] === bestS3 && lap.is_valid ? 'sector-time best-sector' : 'sector-time';

                // Status badge
                let statusBadge;
                if (isBest) {
                    statusBadge = '<span class="stint-status-badge best">BEST</span>';
                } else if (lap.has_pit_stop) {
                    statusBadge = '<span class="stint-status-badge pit-in">PIT-IN</span>';
                } else if (lap.pit_out_lap) {
                    statusBadge = '<span class="stint-status-badge pit-out">PIT-OUT</span>';
                } else if (isCut) {
                    statusBadge = '<span class="stint-status-badge cut">CUT</span>';
                } else {
                    statusBadge = '<span class="stint-status-badge ok">OK</span>';
                }

                // Air temp display
                const airTemp = lap.air_temp ? `${Math.round(lap.air_temp)}°` : '-';

                html += `
                    <tr class="${rowClasses.join(' ')}" data-lap="${lap.lap_number}" data-stint="${stintIdx}">
                        <td class="lap-number">${lap.lap_number}</td>
                        <td class="${lapTimeClass}">${this.formatLapTime(lap.lap_time_ms)}</td>
                        <td class="${s1Class}">${formatSector(lap.sector_times_ms?.[0])}</td>
                        <td class="${s2Class}">${formatSector(lap.sector_times_ms?.[1])}</td>
                        <td class="${s3Class}">${formatSector(lap.sector_times_ms?.[2])}</td>
                        <td class="air-temp">${airTemp}</td>
                        <td class="fuel-value">${lap.fuel_remaining ? lap.fuel_remaining.toFixed(1) + 'L' : '-'}</td>
                        <td class="grip-value">${lap.track_grip_status || '-'}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            });
        });

        tbody.innerHTML = html;
    }

    // Toggle table sync with chart filters (also handles Hide Unknown globally)
    toggleTableSync() {
        if (!this.currentSession) return;

        const bestLapTime = this.currentSession.session_info.session_best_lap || 0;

        // Update dropdown counts with filtered data
        this.updateStintDropdownCounts();

        // Re-render chart and KPIs with filtered data
        this.updateAnalysis();

        // Re-render table with current sync state
        this.renderStintLapTable(this.currentSession, bestLapTime);
    }

    // Update stint dropdown to reflect filtered lap counts
    updateStintDropdownCounts() {
        const session = this.currentSession;
        if (!session) return;

        const hideUnknownGrip = document.getElementById('hideUnknownGripCheck')?.checked ?? false;
        const stintSelect = document.getElementById('analStintSelect');
        const compareSelect = document.getElementById('analCompareTarget');

        if (stintSelect) {
            // Get current selection
            const currentValue = stintSelect.value;

            // Calculate filtered lap counts
            let totalLaps = 0;
            let html = '';

            session.stints.forEach((s, i) => {
                let laps = s.laps || [];
                if (hideUnknownGrip) {
                    laps = laps.filter(l => l.track_grip_status && l.track_grip_status !== 'Unknown');
                }
                const lapCount = laps.length;
                totalLaps += lapCount;

                // Check if disabled (for compare mode)
                const option = stintSelect.querySelector(`option[value="${i}"]`);
                const isDisabled = option?.disabled || false;

                html += `<option value="${i}"${isDisabled ? ' disabled' : ''}>Stint ${i + 1} (${lapCount} giri)</option>`;
            });

            // Calculate total session laps (filtered)
            let allLaps = session.stints.flatMap(s => s.laps);
            if (hideUnknownGrip) {
                allLaps = allLaps.filter(l => l.track_grip_status && l.track_grip_status !== 'Unknown');
            }

            // Check if 'all' is disabled
            const allOption = stintSelect.querySelector('option[value="all"]');
            const allDisabled = allOption?.disabled || false;
            const allText = allDisabled ? 'Tutta la Sessione (non disponibile)' : 'Tutta la Sessione';

            html = `<option value="all"${allDisabled ? ' disabled' : ''}>${allText} (${allLaps.length} giri)</option>` + html;

            stintSelect.innerHTML = html;
            stintSelect.value = currentValue;
        }

        // Also update compare target dropdown
        if (compareSelect) {
            const currentValue = compareSelect.value;
            let html = '';

            session.stints.forEach((s, i) => {
                let laps = s.laps || [];
                if (hideUnknownGrip) {
                    laps = laps.filter(l => l.track_grip_status && l.track_grip_status !== 'Unknown');
                }
                html += `<option value="${i}">Stint ${i + 1} (${laps.length} giri)</option>`;
            });

            compareSelect.innerHTML = html;
            compareSelect.value = currentValue;
        }
    }

    // Helper to safely set text content
    setTextContent(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // Render Timeline with stint blocks
    renderTimeline(stints) {
        const container = document.getElementById('sdTimeline');
        if (!container) return;

        let html = '';
        stints.forEach((stint, index) => {
            const stintType = this.getStintType(stint, this.currentSession?.session_info?.session_type);
            const lapsCount = stint.laps ? stint.laps.length : 0;
            const duration = this.formatDuration(stint.stint_drive_time_ms || 0);

            html += `
                <div class="sd-stint-block type-${stintType}" data-stint="${index}" 
                     onclick="dashboard.selectTimelineStint(${index})"
                     onmouseenter="dashboard.highlightStint(${index})"
                     onmouseleave="dashboard.unhighlightStint()">
                    <span class="sd-stint-name">Stint ${stint.stint_number || index + 1}</span>
                    <span class="sd-stint-meta">${lapsCount} giri · ${duration}</span>
                </div>
            `;

            // Pit divider
            if (index < stints.length - 1) {
                html += `
                    <div class="sd-pit-divider">
                        <span class="sd-pit-icon">🔧</span>
                        <span class="sd-pit-label">PIT</span>
                    </div>
                `;
            }
        });

        container.innerHTML = html;
    }

    // Determine stint type from fuel or JSON
    getStintType(stint, sessionType) {
        // If JSON provides type, use it
        if (stint.type) {
            return stint.type.toLowerCase();
        }
        // Race session = race stint
        if (sessionType === 2) return 'race';
        // Practice: check fuel
        const fuelStart = stint.fuel_start || (stint.laps?.[0]?.fuel_start) || 50;
        return fuelStart < 20 ? 'qualy' : 'race';
    }

    // Select stint from timeline
    selectTimelineStint(index) {
        // Update timeline active state
        document.querySelectorAll('.sd-stint-block').forEach((block, i) => {
            block.classList.toggle('active', i === index);
        });

        // Update analysis scope
        this.analysisState.scope = index;
        const scopeSelect = document.getElementById('sdScopeSelect');
        if (scopeSelect) scopeSelect.value = index;

        this.updateAnalysis();
        this.renderLapTable();
    }

    // Highlight stint on hover
    highlightStint(index) {
        // Highlight corresponding lap rows
        const stint = this.currentSession?.stints?.[index];
        if (!stint) return;
        const lapNumbers = stint.laps.map(l => l.lap_number);
        document.querySelectorAll('#sdLapTableBody tr').forEach(row => {
            const lapNum = parseInt(row.dataset.lap);
            row.classList.toggle('highlight', lapNumbers.includes(lapNum));
        });
        // TODO: Highlight chart range
    }

    unhighlightStint() {
        document.querySelectorAll('#sdLapTableBody tr').forEach(row => {
            row.classList.remove('highlight');
        });
    }

    // Apply exclusion filters based on dropdown selection
    applyExclusionFilter(laps) {
        const { preset, excludedLaps } = this.analysisState;

        return laps.filter(l => {
            // Manual Exclusion (Global Lap Number)
            if (excludedLaps.has(l.lap_number)) return false;

            // Preset Filters
            if (preset === 'no-pit') {
                if (l.has_pit_stop || l.pit_out_lap) return false;
            }
            if (preset === 'valid') {
                if (!l.is_valid) return false;
            }
            if (preset === 'reliable') {
                // If reliable flag exists use it, otherwise fallback to validity
                if (l.sectors_reliable === false) return false;
                if (typeof l.sectors_reliable === 'undefined' && !l.is_valid) return false;
            }
            return true;
        });
    }

    updateAnalysis() {
        if (!this.currentSession) return;

        const session = this.currentSession;
        const state = this.analysisState;

        // 1. Determine Laps for Main Scope
        let laps = [];
        if (state.scope === 'all') {
            laps = session.stints.flatMap(s => s.laps);
        } else {
            const stintIndex = parseInt(state.scope);
            if (session.stints[stintIndex]) {
                laps = session.stints[stintIndex].laps;
            }
        }

        // Get hide unknown grip filter state (GLOBAL filter)
        const hideUnknownGrip = document.getElementById('hideUnknownGripCheck')?.checked ?? false;

        // Apply hide unknown filter FIRST (before other filters)
        if (hideUnknownGrip) {
            laps = laps.filter(l => l.track_grip_status && l.track_grip_status !== 'Unknown');
        }

        // Filter Main Laps (exclusions, presets, etc.)
        const filteredLaps = this.applyExclusionFilter(laps);

        // 2. Determine Laps for Compare Target (if enabled)
        let compareLaps = [];
        if (state.compareModeEnabled && state.compareStint !== null) {
            const stintIndex = parseInt(state.compareStint);
            if (session.stints[stintIndex]) {
                let cLaps = session.stints[stintIndex].laps;
                // Apply hide unknown filter to compare laps too
                if (hideUnknownGrip) {
                    cLaps = cLaps.filter(l => l.track_grip_status && l.track_grip_status !== 'Unknown');
                }
                compareLaps = this.applyExclusionFilter(cLaps);
            }
        }

        // 3. Update Chart
        this.updateEcgChart(filteredLaps, compareLaps);

        // 4. Update Dynamic KPIs
        this.updateDynamicKPIs(filteredLaps, compareLaps);

        // 5. Update Table if sync is enabled
        const syncEnabled = document.getElementById('tableSyncCheck')?.checked ?? true;
        if (syncEnabled) {
            const bestLapTime = session.session_info.session_best_lap || 0;
            this.renderStintLapTable(session, bestLapTime);
        }
    }

    // Calculate and update dynamic KPIs based on current selection
    updateDynamicKPIs(mainLaps, compareLaps) {
        if (!this.currentSession) return;

        const state = this.analysisState;
        const metric = state.metric;
        const isCompare = state.compareModeEnabled && compareLaps.length > 0;

        // Toggle visibility of standard vs compare mode
        const standardBox = document.getElementById('kpiStandard');
        const compareBox = document.getElementById('kpiCompare');

        if (standardBox && compareBox) {
            // LIQUID GLASS ANIMATION: Simple class toggle
            // CSS handles the transition - hidden element uses position:absolute
            // so container automatically adjusts height to visible content
            if (isCompare) {
                standardBox.classList.add('kpi-hidden');
                compareBox.classList.remove('kpi-hidden');
            } else {
                compareBox.classList.add('kpi-hidden');
                standardBox.classList.remove('kpi-hidden');
            }
        }

        // Update scope label
        let scopeLabel = 'SESSIONE COMPLETA';
        if (state.scope !== 'all') {
            scopeLabel = `STINT ${parseInt(state.scope) + 1}`;
        }
        if (metric !== 'lap') {
            scopeLabel += ` · ${metric.toUpperCase()}`;
        }
        this.setTextContent('kpiScopeLabel', scopeLabel);

        // Update weather info from session or average of laps
        const session = this.currentSession;
        const avgAirTemp = mainLaps.length > 0
            ? Math.round(mainLaps.reduce((s, l) => s + (l.air_temp || 0), 0) / mainLaps.filter(l => l.air_temp).length) || session.session_info.air_temp
            : session.session_info.air_temp;
        const avgRoadTemp = mainLaps.length > 0
            ? Math.round(mainLaps.reduce((s, l) => s + (l.road_temp || 0), 0) / mainLaps.filter(l => l.road_temp).length) || session.session_info.road_temp
            : session.session_info.road_temp;

        this.setTextContent('kpiAirTemp', avgAirTemp ? `${avgAirTemp}°C` : '-');
        this.setTextContent('kpiRoadTemp', avgRoadTemp ? `${avgRoadTemp}°C` : '-');

        // Helper to calculate KPIs for a set of laps
        const calcKPIs = (laps) => {
            const validLaps = laps.filter(l => l.is_valid);

            // Best lap time
            const bestLap = validLaps.length > 0
                ? Math.min(...validLaps.map(l => l.lap_time_ms))
                : 0;

            // Theoretical best (sum of best sectors)
            const bestS1 = validLaps.length > 0
                ? Math.min(...validLaps.filter(l => l.sector_times_ms?.[0] > 0).map(l => l.sector_times_ms[0]))
                : 0;
            const bestS2 = validLaps.length > 0
                ? Math.min(...validLaps.filter(l => l.sector_times_ms?.[1] > 0).map(l => l.sector_times_ms[1]))
                : 0;
            const bestS3 = validLaps.length > 0
                ? Math.min(...validLaps.filter(l => l.sector_times_ms?.[2] > 0).map(l => l.sector_times_ms[2]))
                : 0;
            const theoreticalBest = (bestS1 > 0 && bestS2 > 0 && bestS3 > 0)
                ? bestS1 + bestS2 + bestS3
                : 0;

            // Duration (sum of all lap times)
            const duration = laps.reduce((sum, l) => sum + (l.lap_time_ms || 0), 0);

            // Valid percentage
            const validPercent = laps.length > 0
                ? Math.round((validLaps.length / laps.length) * 100)
                : 0;

            // Total laps
            const totalLaps = laps.length;
            const validCount = validLaps.length;

            return { bestLap, theoreticalBest, duration, validPercent, totalLaps, validCount };
        };

        // Format duration (ms to Xm Ys)
        const formatDuration = (ms) => {
            if (!ms || ms <= 0) return '-';
            const totalSecs = Math.floor(ms / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            return `${mins}m ${secs}s`;
        };

        if (isCompare) {
            // Compare mode - calculate for both sets
            const kpisA = calcKPIs(mainLaps);
            const kpisB = calcKPIs(compareLaps);

            // Helper to apply gradient color to valid % element
            const applyValidColor = (elementId, percent) => {
                const validEl = document.getElementById(elementId);
                if (validEl) {
                    let color;
                    if (percent <= 50) {
                        const ratio = percent / 50;
                        const r = 239;
                        const g = Math.round(68 + (158 - 68) * ratio);
                        const b = Math.round(68 * (1 - ratio));
                        color = `rgb(${r}, ${g}, ${b})`;
                    } else {
                        const ratio = (percent - 50) / 50;
                        const r = Math.round(239 - (239 - 34) * ratio);
                        const g = Math.round(158 + (197 - 158) * ratio);
                        const b = Math.round(0 + 94 * ratio);
                        color = `rgb(${r}, ${g}, ${b})`;
                    }
                    validEl.style.color = color;
                }
            };

            // Column A (Main scope)
            this.setTextContent('kpiColumnAHeader', state.scope === 'all' ? 'SESSIONE' : `STINT ${parseInt(state.scope) + 1}`);
            this.setTextContent('kpiABestLap', kpisA.bestLap > 0 ? this.formatLapTime(kpisA.bestLap) : '-');
            this.setTextContent('kpiATheoreticalBest', kpisA.theoreticalBest > 0 ? this.formatLapTime(kpisA.theoreticalBest) : '-');
            this.setTextContent('kpiADuration', formatDuration(kpisA.duration));
            this.setTextContent('kpiAValidPercent', kpisA.validPercent + '%');
            applyValidColor('kpiAValidPercent', kpisA.validPercent);
            this.setTextContent('kpiAValidCount', `${kpisA.validCount} su ${kpisA.totalLaps}`);
            this.setTextContent('kpiATotalLaps', kpisA.totalLaps);

            // Column B (Compare target)
            this.setTextContent('kpiColumnBHeader', `STINT ${parseInt(state.compareStint) + 1}`);
            this.setTextContent('kpiBBestLap', kpisB.bestLap > 0 ? this.formatLapTime(kpisB.bestLap) : '-');
            this.setTextContent('kpiBTheoreticalBest', kpisB.theoreticalBest > 0 ? this.formatLapTime(kpisB.theoreticalBest) : '-');
            this.setTextContent('kpiBDuration', formatDuration(kpisB.duration));
            this.setTextContent('kpiBValidPercent', kpisB.validPercent + '%');
            applyValidColor('kpiBValidPercent', kpisB.validPercent);
            this.setTextContent('kpiBValidCount', `${kpisB.validCount} su ${kpisB.totalLaps}`);
            this.setTextContent('kpiBTotalLaps', kpisB.totalLaps);


        } else {
            // Standard mode
            const kpis = calcKPIs(mainLaps);

            this.setTextContent('kpiBestLap', kpis.bestLap > 0 ? this.formatLapTime(kpis.bestLap) : '-');
            this.setTextContent('kpiTheoreticalBest', kpis.theoreticalBest > 0 ? this.formatLapTime(kpis.theoreticalBest) : '-');
            this.setTextContent('kpiDuration', formatDuration(kpis.duration));

            // Valid percent with gradient color (red 0% -> yellow 50% -> green 100%)
            const validEl = document.getElementById('kpiValidPercent');
            if (validEl) {
                validEl.textContent = kpis.validPercent + '%';
                // Apply gradient color based on percentage
                const percent = kpis.validPercent;
                let color;
                if (percent <= 50) {
                    // Red (0%) to Yellow (50%)
                    const ratio = percent / 50;
                    const r = 239;
                    const g = Math.round(68 + (158 - 68) * ratio); // 68 -> 158
                    const b = Math.round(68 * (1 - ratio)); // 68 -> 0
                    color = `rgb(${r}, ${g}, ${b})`;
                } else {
                    // Yellow (50%) to Green (100%)
                    const ratio = (percent - 50) / 50;
                    const r = Math.round(239 - (239 - 34) * ratio); // 239 -> 34
                    const g = Math.round(158 + (197 - 158) * ratio); // 158 -> 197
                    const b = Math.round(0 + 94 * ratio); // 0 -> 94
                    color = `rgb(${r}, ${g}, ${b})`;
                }
                validEl.style.color = color;
            }

            // Show "X su Y" count below percentage
            this.setTextContent('kpiValidCount', `${kpis.validCount} su ${kpis.totalLaps}`);
            this.setTextContent('kpiTotalLaps', kpis.totalLaps);
        }
    }

    updateEcgChart(mainLaps, compareLaps) {
        const canvas = document.getElementById('stintEcgChart');
        if (!canvas) return;

        if (this.stintEcgChart) {
            this.stintEcgChart.destroy();
        }

        const state = this.analysisState;
        const metric = state.metric; // 'lap', 's1', 's2', 's3'

        // Get theme colors for chart
        const themeColors = this.getChartColors();

        // Helper to extract value
        const getValue = (l) => {
            if (metric === 'lap') return l.lap_time_ms / 1000;
            if (metric === 's1') return (l.sector_times_ms?.[0] || 0) / 1000;
            if (metric === 's2') return (l.sector_times_ms?.[1] || 0) / 1000;
            if (metric === 's3') return (l.sector_times_ms?.[2] || 0) / 1000;
            return 0;
        };

        // Filter out zero values (e.g. missing sectors)
        const validMain = mainLaps.filter(l => getValue(l) > 0);

        const datasets = [];

        // --- DATASET 1: MAIN ---
        const dataMain = validMain.map(l => getValue(l));
        const labelsMain = validMain.map(l => l.lap_number);


        // Colors - Best lap uses theme SUCCESS, invalid uses DANGER, normal uses ACCENT
        // In compare mode: Dataset A = Accent, Dataset B = Warning (secondary), best laps still SUCCESS
        const sessionBest = this.currentSession.session_info.session_best_lap;
        const pointColors = validMain.map(l => {
            // Always show best lap as success color, even in compare mode
            if (l.is_valid && l.lap_time_ms === sessionBest) return themeColors.success; // Best lap
            if (!l.is_valid) return themeColors.danger; // Invalid
            return themeColors.accent; // Normal
        });

        // If Compare Mode, X-Axis is relative index (1, 2, 3...)
        const labels = state.compareModeEnabled
            ? Array.from({ length: Math.max(validMain.length, compareLaps.length) }, (_, i) => i + 1)
            : labelsMain;

        datasets.push({
            label: state.scope === 'all' ? 'Session' : `Stint ${parseInt(state.scope) + 1}`,
            data: dataMain,
            borderColor: themeColors.accent,
            backgroundColor: `rgba(${themeColors.accentRgb}, 0.1)`,
            tension: 0,
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            pointBorderWidth: 2,
            segment: {
                borderColor: ctx => {
                    if (state.compareModeEnabled) return themeColors.accent;
                    const lap = validMain[ctx.p0DataIndex];
                    if (!lap?.is_valid) return themeColors.danger;
                    return themeColors.accent;
                }
            }
        });

        // --- DATASET 2: COMPARE ---
        if (state.compareModeEnabled && compareLaps.length > 0) {
            const validCompare = compareLaps.filter(l => getValue(l) > 0);
            const dataCompare = validCompare.map(l => getValue(l));

            datasets.push({
                label: `Stint ${parseInt(state.compareStint) + 1}`,
                data: dataCompare,
                borderColor: themeColors.secondary,
                backgroundColor: `rgba(${themeColors.secondaryRgb}, 0.1)`,
                tension: 0,
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: themeColors.secondary
            });
        }

        // --- TREND LINE (enabled for ALL modes including compare/sector) ---
        if (state.trend && dataMain.length > 1) {
            const { slope, intercept } = this.calculateTrendLine(dataMain);
            const trendData = dataMain.map((_, i) => intercept + slope * i);
            datasets.push({
                label: 'Trend',
                data: trendData,
                borderColor: themeColors.warning,
                borderDash: [6, 4],
                borderWidth: 2,
                pointRadius: 0,
                tension: 0,
                order: 10 // Render behind other lines
            });

            // If compare mode is on, add trend for compare dataset too
            if (state.compareModeEnabled && compareLaps.length > 0) {
                const validCompare = compareLaps.filter(l => getValue(l) > 0);
                const dataCompare = validCompare.map(l => getValue(l));
                if (dataCompare.length > 1) {
                    const trendCompare = this.calculateTrendLine(dataCompare);
                    const trendDataCompare = dataCompare.map((_, i) => trendCompare.intercept + trendCompare.slope * i);
                    datasets.push({
                        label: 'Trend B',
                        data: trendDataCompare,
                        borderColor: themeColors.secondary,
                        borderDash: [6, 4],
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0,
                        order: 10
                    });
                }
            }
        }

        this.stintEcgChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: state.compareModeEnabled || state.trend,
                        labels: { color: '#a1a1aa' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 15, 25, 0.95)',
                        titleColor: '#ffffff',
                        bodyColor: '#a1a1aa',
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                const lap = validMain[idx];
                                if (!lap) return `Lap ${items[0].label}`;
                                return `Giro ${lap.lap_number}`;
                            },
                            label: (ctx) => {
                                if (ctx.dataset.label === 'Trend' || ctx.dataset.label === 'Trend B') {
                                    return null; // Hide trend from tooltip
                                }
                                const val = ctx.raw;
                                const formatted = metric === 'lap'
                                    ? this.formatLapTime(val * 1000)
                                    : val.toFixed(3) + 's';
                                return `${ctx.dataset.label}: ${formatted}`;
                            },
                            afterBody: (items) => {
                                const idx = items[0].dataIndex;
                                const lap = validMain[idx];
                                if (!lap) return '';
                                const lines = [];
                                if (lap.air_temp) lines.push(`🌡️ Aria: ${Math.round(lap.air_temp)}°C`);
                                if (lap.road_temp) lines.push(`🛣️ Asfalto: ${Math.round(lap.road_temp)}°C`);
                                if (!lap.is_valid) lines.push('⚠️ CUT');
                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#a1a1aa',
                            callback: v => {
                                if (metric === 'lap') {
                                    // Show full time with milliseconds: M:SS.mmm
                                    const mins = Math.floor(v / 60);
                                    const secs = Math.floor(v % 60);
                                    const ms = Math.round((v % 1) * 1000);
                                    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
                                }
                                // Sectors: show 3 decimals
                                return v.toFixed(3) + 's';
                            }
                        }
                    },
                    x: {
                        title: { display: true, text: 'Giro', color: '#71717a' },
                        grid: { display: false },
                        ticks: { color: '#a1a1aa' }
                    }
                }
            }
        });
    }

    // Render compare chart with two stint overlays
    renderCompareChart(canvas) {
        const state = this.analysisState;
        const session = this.currentSession;

        const stintA = session.stints[state.compareA];
        const stintB = session.stints[state.compareB];
        if (!stintA || !stintB) return;

        // Get laps and apply filters
        let lapsA = stintA.laps.filter(l => l.lap_time_ms > 0 && l.lap_time_ms < 300000);
        let lapsB = stintB.laps.filter(l => l.lap_time_ms > 0 && l.lap_time_ms < 300000);
        lapsA = this.applyExclusionFilter(lapsA, state.excludeFilter, [stintA], 0);
        lapsB = this.applyExclusionFilter(lapsB, state.excludeFilter, [stintB], 0);

        if (lapsA.length === 0 || lapsB.length === 0) return;

        // Use normalized lap indices (1, 2, 3, ...)
        const maxLaps = Math.max(lapsA.length, lapsB.length);
        const labels = Array.from({ length: maxLaps }, (_, i) => i + 1);

        // Get data based on sector filter
        const sectorIndex = state.sector === 's1' ? 0 : state.sector === 's2' ? 1 : 2;
        const getData = (laps) => {
            if (state.sector === 'all') {
                return laps.map(l => l.lap_time_ms / 1000);
            } else {
                return laps.map(l => (l.sector_times_ms?.[sectorIndex] || 0) / 1000);
            }
        };

        const dataA = getData(lapsA);
        const dataB = getData(lapsB);

        const tc = this.getChartColors();
        const datasets = [
            {
                label: `Stint ${state.compareA + 1}`,
                data: dataA,
                borderColor: tc.accent,
                backgroundColor: 'transparent',
                tension: 0.2,
                borderWidth: 2,
                pointRadius: state.showDots ? 4 : 0,
                pointBackgroundColor: tc.accent
            },
            {
                label: `Stint ${state.compareB + 1}`,
                data: dataB,
                borderColor: tc.success,
                backgroundColor: 'transparent',
                tension: 0.2,
                borderWidth: 2,
                pointRadius: state.showDots ? 4 : 0,
                pointBackgroundColor: tc.success
            }
        ];

        // Add trend lines if enabled
        if (state.showTrend) {
            if (dataA.length > 1) {
                const { slope, intercept } = this.calculateTrendLine(dataA);
                datasets.push({
                    label: 'Trend A',
                    data: dataA.map((_, i) => intercept + slope * i),
                    borderColor: tc.accent,
                    borderDash: [5, 5],
                    borderWidth: 1,
                    pointRadius: 0
                });
            }
            if (dataB.length > 1) {
                const { slope, intercept } = this.calculateTrendLine(dataB);
                datasets.push({
                    label: 'Trend B',
                    data: dataB.map((_, i) => intercept + slope * i),
                    borderColor: tc.success,
                    borderDash: [5, 5],
                    borderWidth: 1,
                    pointRadius: 0
                });
            }
        }

        this.ecgChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#71717a',
                            callback: v => {
                                if (state.sector === 'all') {
                                    const mins = Math.floor(v / 60);
                                    const secs = (v % 60).toFixed(0);
                                    return `${mins}:${secs.padStart(2, '0')}`;
                                } else {
                                    return v.toFixed(1) + 's';
                                }
                            }
                        }
                    },
                    x: {
                        title: { display: true, text: 'Giro (relativo)', color: '#71717a' },
                        grid: { display: false },
                        ticks: { color: '#a1a1aa' }
                    }
                }
            }
        });
    }

    // Calculate linear regression for trend line
    calculateTrendLine(data) {
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += data[i];
            sumXY += i * data[i];
            sumX2 += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        return { slope, intercept };
    }

    // Render Lap Table
    renderLapTable() {
        const tbody = document.getElementById('sdLapTableBody');
        if (!tbody || !this.currentSession) return;

        const session = this.currentSession;
        const state = this.analysisState;

        // Get laps based on scope
        let laps;
        if (state.scope === 'all') {
            laps = session.stints.flatMap(s => s.laps);
        } else {
            const stint = session.stints[state.scope];
            laps = stint ? stint.laps : [];
        }

        // Apply filters based on exclusion dropdown
        let filteredLaps = laps.filter(l => l.lap_time_ms > 0 && l.lap_time_ms < 300000);
        filteredLaps = this.applyExclusionFilter(filteredLaps, state.excludeFilter, session.stints, state.scope);

        // Find best lap time among filtered valid laps
        const validLaps = filteredLaps.filter(l => l.is_valid);
        const bestLapTime = validLaps.length > 0 ? Math.min(...validLaps.map(l => l.lap_time_ms)) : 0;

        // Build table rows
        tbody.innerHTML = filteredLaps.map(lap => {
            // Row classes
            let rowClass = '';
            if (lap.lap_time_ms === bestLapTime && lap.is_valid) rowClass = 'best-lap';
            else if (!lap.is_valid) rowClass = 'cut-lap';

            // Status badge
            let statusBadge;
            if (lap.lap_time_ms === bestLapTime && lap.is_valid) {
                statusBadge = '<span class="sd-status-badge best">BEST</span>';
            } else if (lap.has_pit_stop) {
                statusBadge = '<span class="sd-status-badge pit">PIT-IN</span>';
            } else if (lap.pit_out_lap) {
                statusBadge = '<span class="sd-status-badge pit">PIT-OUT</span>';
            } else if (!lap.is_valid) {
                statusBadge = '<span class="sd-status-badge cut">CUT</span>';
            } else {
                statusBadge = '<span class="sd-status-badge ok">OK</span>';
            }

            // Sector times (3 decimals)
            const s1 = lap.sector_times_ms?.[0] > 0 ? this.formatSectorTime(lap.sector_times_ms[0]) : '--';
            const s2 = lap.sector_times_ms?.[1] > 0 ? this.formatSectorTime(lap.sector_times_ms[1]) : '--';
            const s3 = lap.sector_times_ms?.[2] > 0 ? this.formatSectorTime(lap.sector_times_ms[2]) : '--';

            return `
                <tr class="${rowClass}" data-lap="${lap.lap_number}" 
                    onmouseenter="dashboard.highlightChartPoint(${lap.lap_number})"
                    onmouseleave="dashboard.unhighlightChartPoint()">
                    <td>${lap.lap_number}</td>
                    <td>${this.formatLapTime(lap.lap_time_ms)}</td>
                    <td>${s1}</td>
                    <td>${s2}</td>
                    <td>${s3}</td>
                    <td>${lap.fuel_remaining ? lap.fuel_remaining.toFixed(1) + 'L' : '--'}</td>
                    <td>${lap.track_grip_status || '--'}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    // Chart controls
    setChartScope(value) {
        this.analysisState.scope = value === 'all' ? 'all' : parseInt(value);
        this.updateAnalysis();
        this.renderLapTable();
    }

    setChartMode(mode) {
        this.analysisState.mode = mode;

        // Update toggle buttons
        document.querySelectorAll('.sd-toggle[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Show/hide compare selectors
        const compareDiv = document.getElementById('sdCompareSelectors');
        if (compareDiv) {
            compareDiv.style.display = mode === 'compare' ? 'flex' : 'none';
        }

        this.updateAnalysis();
    }

    setChartSector(sector) {
        this.analysisState.sector = sector;

        // Update toggle buttons
        document.querySelectorAll('.sd-toggle[data-sector]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sector === sector);
        });

        this.updateAnalysis();
    }

    resetAnalysis() {
        this.analysisState = {
            scope: 'all',
            mode: 'pace',
            sector: 'all',
            compareA: null,
            compareB: null,
            excludeFilter: 'pit',
            showDots: false,
            showTrend: false
        };

        // Reset UI
        const scopeSelect = document.getElementById('sdScopeSelect');
        if (scopeSelect) scopeSelect.value = 'all';

        document.querySelectorAll('.sd-toggle').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.sd-toggle[data-mode="pace"]')?.classList.add('active');
        document.querySelector('.sd-toggle[data-sector="all"]')?.classList.add('active');

        const compareDiv = document.getElementById('sdCompareSelectors');
        if (compareDiv) compareDiv.style.display = 'none';

        // Reset exclusion dropdown
        const excludeSelect = document.getElementById('sdExcludeSelect');
        if (excludeSelect) excludeSelect.value = 'pit';

        // Reset checkboxes
        const showDotsCb = document.getElementById('sdShowDots');
        if (showDotsCb) showDotsCb.checked = false;
        const showTrendCb = document.getElementById('sdShowTrend');
        if (showTrendCb) showTrendCb.checked = false;

        // Clear timeline selection
        document.querySelectorAll('.sd-stint-block').forEach(block => {
            block.classList.remove('active');
        });

        this.updateAnalysis();
        this.renderLapTable();
    }

    // Set exclusion filter from dropdown
    setExcludeFilter(value) {
        this.analysisState.excludeFilter = value;
        this.updateAnalysis();
        this.renderLapTable();
    }

    // Toggle show dots on chart
    toggleShowDots() {
        const cb = document.getElementById('sdShowDots');
        this.analysisState.showDots = cb?.checked ?? false;
        this.updateAnalysis();
    }

    // Toggle show trend line
    toggleShowTrend() {
        const cb = document.getElementById('sdShowTrend');
        this.analysisState.showTrend = cb?.checked ?? false;
        this.updateAnalysis();
    }

    // Update compare mode
    updateCompare() {
        const aSelect = document.getElementById('sdCompareA');
        const bSelect = document.getElementById('sdCompareB');
        this.analysisState.compareA = aSelect?.value ? parseInt(aSelect.value) : null;
        this.analysisState.compareB = bSelect?.value ? parseInt(bSelect.value) : null;
        this.updateAnalysis();
    }

    // Placeholder for chart point highlight
    highlightChartPoint(lapNum) {
        // TODO: Implement chart point highlighting
    }

    unhighlightChartPoint() {
        // TODO: Implement chart point unhighlighting
    }

    // Render stint tabs for selection
    renderStintTabs(stints) {
        const container = document.getElementById('stintTabs');
        if (!container) return;

        let html = '';
        stints.forEach((stint, idx) => {
            const type = (stint.type || 'Practice').toUpperCase();
            const isActive = idx === stints.length - 1 ? ' active' : '';
            html += '<button class="stint-tab' + isActive + '" data-stint="' + idx + '" onclick="dashboard.selectStint(' + idx + ')">STINT ' + (idx + 1) + ' – ' + type + '</button>';
        });
        container.innerHTML = html;
    }

    // Select a specific stint
    selectStint(index) {
        this.selectedStintIndex = index;

        // Update tab active states
        document.querySelectorAll('.stint-tab').forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });

        // Update display for selected stint
        this.updateStintDisplay();

        // Scroll to stint header
        const header = document.getElementById('stintHeaderBlock');
        if (header) header.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Update all stint-specific displays
    updateStintDisplay() {
        if (!this.currentSession) return;
        const stint = this.currentSession.stints[this.selectedStintIndex];
        if (!stint) return;

        const stintNum = this.selectedStintIndex + 1;
        const type = (stint.type || 'Practice').toUpperCase();

        // 4️⃣ STINT HEADER
        const titleEl = document.getElementById('stintTitle');
        if (titleEl) titleEl.textContent = 'STINT ' + stintNum + ' – ' + type;

        const lapsEl = document.getElementById('stintLapsCount');
        if (lapsEl) lapsEl.textContent = stint.laps.length + ' giri';

        const fuelEl = document.getElementById('stintFuelStart');
        const startFuel = stint.laps.length > 0 ? Math.round(stint.laps[0].fuel_left || 0) : 0;
        if (fuelEl) fuelEl.textContent = 'Fuel start ' + startFuel + 'L';

        const tyresEl = document.getElementById('stintTyres');
        if (tyresEl) tyresEl.textContent = stint.tyre_compound || 'Gomme usate';

        // 5️⃣ KPI STINT (solo giri puliti)
        const cleanLaps = stint.laps.filter(l => l.is_valid && l.lap_time_ms > 0 && l.lap_time_ms < 300000);
        const totalStintLaps = stint.laps.filter(l => l.lap_time_ms > 0 && l.lap_time_ms < 300000).length;

        // Ritmo (media puliti)
        const avgTime = cleanLaps.length > 0 ? cleanLaps.reduce((sum, l) => sum + l.lap_time_ms, 0) / cleanLaps.length : 0;
        const ritmoEl = document.getElementById('kpiRitmo');
        if (ritmoEl) ritmoEl.textContent = avgTime > 0 ? this.formatLapTime(avgTime) : '--:--.---';

        // Consistenza: totale (max-min) + pulita (escludendo outlier)
        let totalSpread = 0;
        let cleanSpread = 0;
        if (cleanLaps.length >= 2) {
            const times = cleanLaps.map(l => l.lap_time_ms).sort((a, b) => a - b);
            totalSpread = (times[times.length - 1] - times[0]) / 1000;

            // Calcola spread pulito: escludi giri > 3s dalla mediana
            const median = times[Math.floor(times.length / 2)];
            const inlierTimes = times.filter(t => Math.abs(t - median) < 3000);
            if (inlierTimes.length >= 2) {
                cleanSpread = (inlierTimes[inlierTimes.length - 1] - inlierTimes[0]) / 1000;
            } else {
                cleanSpread = totalSpread;
            }
        }
        const consistEl = document.getElementById('kpiConsistenza');
        if (consistEl) consistEl.textContent = '±' + totalSpread.toFixed(1) + 's';
        const consistCleanEl = document.getElementById('kpiConsistenzaClean');
        if (consistCleanEl) consistCleanEl.textContent = '(±' + cleanSpread.toFixed(1) + 's puliti)';

        // Pulizia
        const puliziaEl = document.getElementById('kpiPulizia');
        if (puliziaEl) puliziaEl.textContent = cleanLaps.length + ' / ' + totalStintLaps;

        // Tipo - con etichetta contestuale
        const lapCount = stint.laps.length;
        const endFuel = stint.laps.length > 0 ? stint.laps[stint.laps.length - 1].fuel_left || 0 : 0;

        let stintLabel = type;
        if (lapCount >= 20) {
            stintLabel = type + ' · LUNGO';
        } else if (endFuel <= 20 && lapCount <= 5) {
            stintLabel = 'QUALIFICA';
        } else if (lapCount <= 6) {
            stintLabel = type + ' · BREVE';
        }

        const tipoEl = document.getElementById('kpiTipo');
        if (tipoEl) tipoEl.textContent = stintLabel;

        // 6️⃣ CONSISTENCY CHART
        this.renderConsistencyChart(cleanLaps);

        // 7️⃣ SECTOR CHARTS
        this.renderSectorCharts(cleanLaps);

        // 9️⃣ LAP TABLE
        this.renderLapsTableNew(stint.laps);
    }

    // Render main consistency chart (scatter plot, adaptive for long stints)
    renderConsistencyChart(laps) {
        const canvas = document.getElementById('consistencyChartCanvas');
        if (!canvas) return;

        if (this.consistencyChart) this.consistencyChart.destroy();

        const validLaps = laps.filter(l => l.lap_time_ms > 0);
        if (validLaps.length === 0) return;

        const lapCount = validLaps.length;
        const isLongStint = lapCount >= 15;

        // Convert to scatter data format
        const scatterData = validLaps.map((l, i) => ({
            x: i + 1,
            y: l.lap_time_ms / 1000
        }));

        const times = scatterData.map(d => d.y);
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

        // Dynamic Y axis with padding ±0.5s
        const yMin = Math.floor((minTime - 0.5) * 10) / 10;
        const yMax = Math.ceil((maxTime + 0.5) * 10) / 10;

        // Theme-aware colors
        const tc = this.getChartColors();

        // Point styling based on stint length
        const pointRadius = isLongStint ? 3 : 6;
        const pointColors = scatterData.map(d =>
            d.y === minTime ? tc.success : tc.accent
        );

        // Build datasets
        const datasets = [{
            label: 'Tempo giro',
            data: scatterData,
            backgroundColor: pointColors,
            borderColor: pointColors,
            pointRadius: pointRadius,
            pointHoverRadius: pointRadius + 2,
            showLine: false
        }];

        // Add trend line for long stints (low opacity)
        if (isLongStint) {
            datasets.push({
                label: 'Trend',
                data: scatterData,
                borderColor: `rgba(${tc.accentRgb}, 0.25)`,
                borderWidth: 1,
                pointRadius: 0,
                showLine: true,
                tension: 0.4,
                fill: false
            });
        }

        this.consistencyChart = new Chart(canvas, {
            type: 'scatter',
            data: { datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => 'Giro ' + ctx.raw.x + ': ' + ctx.raw.y.toFixed(3) + 's'
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Giro', color: '#71717a' },
                        grid: { display: false },
                        ticks: {
                            color: '#71717a',
                            stepSize: isLongStint ? 5 : 1
                        },
                        min: 0,
                        max: lapCount + 1
                    },
                    y: {
                        title: { display: true, text: 'Tempo (s)', color: '#71717a' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#71717a' },
                        min: yMin,
                        max: yMax
                    }
                }
            }
        });
    }

    // Render sector charts - adaptive for stint length
    renderSectorCharts(laps) {
        const lapCount = laps.length;
        const useSummary = lapCount > 12;

        const sectors = [
            { index: 0, chartId: 'sector1Chart', wrapperId: 'sector1ChartWrapper', summaryId: 'sector1Summary', avgId: 's1Avg', minId: 's1Min', maxId: 's1Max', varId: 's1Var' },
            { index: 1, chartId: 'sector2Chart', wrapperId: 'sector2ChartWrapper', summaryId: 'sector2Summary', avgId: 's2Avg', minId: 's2Min', maxId: 's2Max', varId: 's2Var' },
            { index: 2, chartId: 'sector3Chart', wrapperId: 'sector3ChartWrapper', summaryId: 'sector3Summary', avgId: 's3Avg', minId: 's3Min', maxId: 's3Max', varId: 's3Var' }
        ];

        sectors.forEach(sector => {
            const chartWrapper = document.getElementById(sector.wrapperId);
            const summaryWrapper = document.getElementById(sector.summaryId);
            const canvas = document.getElementById(sector.chartId);

            // Destroy existing chart
            if (this['sectorChart' + sector.index]) {
                this['sectorChart' + sector.index].destroy();
                this['sectorChart' + sector.index] = null;
            }

            const validLaps = laps.filter(l => {
                const time = l.sector_times_ms && l.sector_times_ms[sector.index];
                return time && time > 0;
            });

            if (validLaps.length === 0) return;

            const times = validLaps.map(l => l.sector_times_ms[sector.index] / 1000);
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const spread = maxTime - minTime;

            if (useSummary) {
                // Summary view for long stints
                if (chartWrapper) chartWrapper.style.display = 'none';
                if (summaryWrapper) summaryWrapper.style.display = 'flex';

                // Populate summary values
                document.getElementById(sector.avgId).textContent = avgTime.toFixed(1) + 's';
                document.getElementById(sector.minId).textContent = minTime.toFixed(1) + 's';
                document.getElementById(sector.maxId).textContent = maxTime.toFixed(1) + 's';

                // Variability indicator (◉○○ = low, ◉◉○ = medium, ◉◉◉ = high)
                let varIndicator = '◉○○';
                if (spread > 1.5) varIndicator = '◉◉◉';
                else if (spread > 0.7) varIndicator = '◉◉○';
                document.getElementById(sector.varId).textContent = varIndicator;

            } else {
                // Bar chart for short stints
                if (chartWrapper) chartWrapper.style.display = 'block';
                if (summaryWrapper) summaryWrapper.style.display = 'none';

                if (!canvas) return;

                const labels = validLaps.map((l, i) => i + 1);
                const tc = this.getChartColors();

                this['sectorChart' + sector.index] = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: times,
                            backgroundColor: times.map(t => t === minTime ? tc.success : tc.accent),
                            borderRadius: 3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { display: false },
                            y: {
                                grid: { color: 'rgba(255,255,255,0.05)' },
                                ticks: { color: '#52525b', font: { size: 9 } }
                            }
                        }
                    }
                });
            }
        });
    }

    // Populate comparison selectors
    populateComparisonSelectors(stints) {
        const selA = document.getElementById('compareStintA');
        const selB = document.getElementById('compareStintB');
        const section = document.querySelector('.comparison-section');
        const controls = document.querySelector('.comparison-controls');

        if (!selA || !selB || !section) return;

        // Hide comparison section if less than 2 stints
        if (stints.length < 2) {
            if (controls) controls.style.display = 'none';
            section.innerHTML = '<h3 class="chart-section-title">CONFRONTO STINT</h3>' +
                '<div class="comparison-placeholder">Disponibile quando sono presenti almeno 2 stint</div>';
            return;
        }

        // Show controls if hidden
        if (controls) controls.style.display = 'flex';

        let html = '<option value="">Seleziona...</option>';
        stints.forEach((s, i) => {
            const type = (s.type || 'Practice').toUpperCase();
            html += '<option value="' + i + '">Stint ' + (i + 1) + ' – ' + type + '</option>';
        });
        selA.innerHTML = html;
        selB.innerHTML = html;
    }

    // Compare two stints
    compareStints() {
        const idxA = parseInt(document.getElementById('compareStintA').value);
        const idxB = parseInt(document.getElementById('compareStintB').value);
        const wrapper = document.getElementById('comparisonChartWrapper');
        const warning = document.getElementById('comparisonWarning');

        if (isNaN(idxA) || isNaN(idxB) || idxA === idxB) {
            if (wrapper) wrapper.style.display = 'none';
            return;
        }

        const stintA = this.currentSession.stints[idxA];
        const stintB = this.currentSession.stints[idxB];

        const lapsA = stintA.laps.filter(l => l.is_valid && l.lap_time_ms > 0).map(l => l.lap_time_ms / 1000);
        const lapsB = stintB.laps.filter(l => l.is_valid && l.lap_time_ms > 0).map(l => l.lap_time_ms / 1000);

        // Show warning if different lengths
        if (warning) {
            warning.style.display = lapsA.length !== lapsB.length ? 'block' : 'none';
        }

        if (wrapper) wrapper.style.display = 'block';

        const canvas = document.getElementById('comparisonChartCanvas');
        if (this.comparisonChart) this.comparisonChart.destroy();

        const maxLen = Math.max(lapsA.length, lapsB.length);
        const labels = Array.from({ length: maxLen }, (_, i) => i + 1);

        const tc = this.getChartColors();
        this.comparisonChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Stint ' + (idxA + 1),
                        data: lapsA,
                        borderColor: tc.accent,
                        backgroundColor: `rgba(${tc.accentRgb}, 0.1)`,
                        tension: 0.3
                    },
                    {
                        label: 'Stint ' + (idxB + 1),
                        data: lapsB,
                        borderColor: tc.warning,
                        backgroundColor: `rgba(${tc.secondaryRgb}, 0.1)`,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    x: { title: { display: true, text: 'Giro' } },
                    y: { title: { display: true, text: 'Tempo (s)' } }
                }
            }
        });
    }

    // Toggle lap table visibility
    toggleLapTable() {
        const container = document.getElementById('lapTableContainer');
        const toggle = document.getElementById('lapTableToggle');
        if (!container || !toggle) return;

        const isExpanded = container.classList.contains('expanded');
        container.classList.toggle('collapsed', isExpanded);
        container.classList.toggle('expanded', !isExpanded);
        toggle.classList.toggle('expanded', !isExpanded);
    }

    // Render laps table for current stint
    renderLapsTableNew(laps) {
        const tbody = document.getElementById('lapsTableBody');
        if (!tbody) return;

        // Calculate summary stats (only valid laps with time)
        const validLaps = laps.filter(l => l.lap_time_ms > 0 && l.lap_time_ms < 300000);
        if (validLaps.length > 0) {
            const times = validLaps.map(l => l.lap_time_ms);
            const bestTime = Math.min(...times);
            const worstTime = Math.max(...times);
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

            const bestEl = document.getElementById('lapSummaryBest');
            const avgEl = document.getElementById('lapSummaryAvg');
            const worstEl = document.getElementById('lapSummaryWorst');

            if (bestEl) bestEl.textContent = this.formatLapTime(bestTime);
            if (avgEl) avgEl.textContent = this.formatLapTime(avgTime);
            if (worstEl) worstEl.textContent = this.formatLapTime(worstTime);
        }

        // Update count
        const countEl = document.getElementById('lapTableCount');
        if (countEl) countEl.textContent = '(' + laps.length + ' giri)';

        // Render table rows
        let html = '';
        laps.forEach((lap, i) => {
            const time = lap.lap_time_ms > 0 ? this.formatLapTime(lap.lap_time_ms) : '--:--.---';
            const s1 = lap.sector_times_ms && lap.sector_times_ms[0] ? (lap.sector_times_ms[0] / 1000).toFixed(1) : '--';
            const s2 = lap.sector_times_ms && lap.sector_times_ms[1] ? (lap.sector_times_ms[1] / 1000).toFixed(1) : '--';
            const s3 = lap.sector_times_ms && lap.sector_times_ms[2] ? (lap.sector_times_ms[2] / 1000).toFixed(1) : '--';
            const clean = lap.is_valid ? '✓' : '✗';
            const cleanClass = lap.is_valid ? 'valid' : 'invalid';

            html += '<tr class="' + cleanClass + '">' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + time + '</td>' +
                '<td>' + s1 + '</td>' +
                '<td>' + s2 + '</td>' +
                '<td>' + s3 + '</td>' +
                '<td>' + clean + '</td>' +
                '</tr>';
        });
        tbody.innerHTML = html;
    }

    // Update conditions bar with session weather data
    updateConditionsBar(session) {
        const info = session.session_info;

        // Air/Road temps
        const airTemp = document.getElementById('condAirTemp');
        const roadTemp = document.getElementById('condRoadTemp');
        if (airTemp) airTemp.textContent = `${Math.round(info.start_air_temp || 22)}°C`;
        if (roadTemp) roadTemp.textContent = `${Math.round(info.start_road_temp || 24)}°C`;

        // Weather icon and text
        const weatherIcon = document.getElementById('condWeatherIcon');
        const weatherText = document.getElementById('condWeather');
        const weatherBadge = document.getElementById('weatherBadge');
        const weather = info.start_weather || 'No Rain';
        const icon = this.getWeatherIcon(weather);

        if (weatherIcon) weatherIcon.textContent = icon;
        if (weatherText) weatherText.textContent = weather;
        if (weatherBadge) weatherBadge.textContent = icon;

        // Grip badge
        const gripText = document.getElementById('condGrip');
        const gripBadge = document.getElementById('gripBadge');
        const grip = info.start_track_grip || 'Optimum';

        if (gripText) {
            gripText.textContent = grip;
            gripText.dataset.grip = grip;
        }
        if (gripBadge) {
            gripBadge.textContent = grip;
            gripBadge.dataset.grip = grip;
        }
    }

    // Get weather icon based on condition
    getWeatherIcon(weather) {
        const icons = {
            'No Rain': '☀️',
            'Drizzle': '🌦️',
            'Light Rain': '🌧️',
            'Medium Rain': '🌧️',
            'Heavy Rain': '⛈️',
            'Thunderstorm': '🌩️'
        };
        return icons[weather] || '☀️';
    }

    // Render stint timeline
    renderStintTimeline(stints) {
        const container = document.getElementById('stintTimeline');
        if (!container) return;

        let html = '';
        stints.forEach((stint, index) => {
            const stintType = (stint.type || 'Practice').toLowerCase();
            const lapsCount = stint.laps ? stint.laps.length : 0;
            const duration = this.formatDuration(stint.stint_drive_time_ms || 0);

            // Stint block
            html += `
                <div class="stint-block">
                    <div class="stint-bar ${stintType}">
                        Stint ${stint.stint_number || index + 1}
                    </div>
                    <div class="stint-info">
                        <span class="stint-laps">${lapsCount} giri</span>
                        <span class="stint-time">${duration}</span>
                    </div>
                </div>
            `;

            // Pit divider between stints
            if (index < stints.length - 1) {
                html += `
                    <div class="pit-divider">
                        <span class="pit-icon">🔧</span>
                        <span class="pit-label">PIT</span>
                    </div>
                `;
            }
        });

        container.innerHTML = html;
    }

    renderLapChart(allLaps, bestLapTime) {
        const canvas = document.getElementById('lapTimesChartCanvas');
        if (!canvas) return;

        // Destroy existing chart if present
        if (this.lapTimesChart) {
            this.lapTimesChart.destroy();
        }

        // I giri passati sono già filtrati da getCleanLaps
        const chartLaps = allLaps.filter(l => l.lap_time_ms > 0 && l.lap_time_ms < 300000);
        if (chartLaps.length === 0) {
            return;
        }

        // Determine what to chart based on sector filter
        const sectorFilter = this.sectorFilter || 'all';
        let data, yAxisLabel, bestTime;

        // Helper to get sector time safely
        const getSectorTime = (lap, sectorIndex) => {
            if (lap.sector_times_ms && lap.sector_times_ms.length > sectorIndex) {
                return lap.sector_times_ms[sectorIndex];
            }
            return 0;
        };

        if (sectorFilter === 'all') {
            // Show full lap times
            data = chartLaps.map(l => l.lap_time_ms / 1000);
            yAxisLabel = 'Tempo Giro';
            bestTime = bestLapTime;
        } else {
            // Show specific sector times
            const sectorIndex = sectorFilter === 's1' ? 0 : sectorFilter === 's2' ? 1 : 2;
            data = chartLaps.map(l => getSectorTime(l, sectorIndex) / 1000);
            yAxisLabel = `Settore ${sectorFilter.toUpperCase()}`;

            // Find best sector time
            const validSectorTimes = chartLaps
                .filter(l => l.is_valid && getSectorTime(l, sectorIndex) > 0)
                .map(l => getSectorTime(l, sectorIndex));
            bestTime = validSectorTimes.length > 0 ? Math.min(...validSectorTimes) : 0;
        }

        const labels = chartLaps.map(l => l.lap_number);
        const tc = this.getChartColors();
        const colors = chartLaps.map((l, i) => {
            if (sectorFilter === 'all') {
                if (l.lap_time_ms === bestLapTime && l.is_valid) return tc.success; // best
                if (!l.is_valid) return tc.danger; // invalid
                return tc.accent; // normal
            } else {
                const sectorIndex = sectorFilter === 's1' ? 0 : sectorFilter === 's2' ? 1 : 2;
                const sectorTime = getSectorTime(l, sectorIndex);
                if (sectorTime === bestTime && l.is_valid && sectorTime > 0) return tc.success; // best sector
                if (!l.is_valid) return tc.danger; // invalid
                if (sectorTime === 0) return tc.textMuted; // no data
                return tc.accent; // normal
            }
        });

        this.lapTimesChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: yAxisLabel,
                    data: data,
                    borderColor: tc.accent,
                    backgroundColor: 'transparent',
                    tension: 0, // Sharp ECG-style
                    borderWidth: 2,
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const lap = chartLaps[context.dataIndex];
                                let time, isBest;

                                if (sectorFilter === 'all') {
                                    time = this.formatLapTime(lap.lap_time_ms);
                                    isBest = lap.lap_time_ms === bestLapTime;
                                } else {
                                    const sectorIdx = sectorFilter === 's1' ? 0 : sectorFilter === 's2' ? 1 : 2;
                                    const sectorTime = getSectorTime(lap, sectorIdx);
                                    time = sectorTime > 0 ? this.formatSectorTime(sectorTime) : 'N/A';
                                    isBest = sectorTime === bestTime && sectorTime > 0;
                                }

                                const status = !lap.is_valid ? ' (Invalid)' : (isBest && lap.is_valid ? ' (Best)' : '');
                                return `${time}${status}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#71717a',
                            callback: (v) => {
                                if (sectorFilter === 'all') {
                                    const mins = Math.floor(v / 60);
                                    const secs = Math.floor(v % 60);
                                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                                } else {
                                    // Sector times - just show seconds with milliseconds
                                    return `${v.toFixed(3)}`;
                                }
                            }
                        }
                    },
                    x: {
                        title: { display: true, text: 'Giro', color: '#71717a' },
                        grid: { display: false },
                        ticks: { color: '#a1a1aa' }
                    }
                }
            }
        });
    }

    renderStintsCompactList(stints) {
        const container = document.getElementById('stintsCompactList');
        if (!container) return;

        if (stints.length === 0) {
            container.innerHTML = '<p class="text-muted">Nessuno stint</p>';
            return;
        }

        container.innerHTML = stints.map((stint, i) => {
            const lapsCount = stint.laps.length;
            const validCount = stint.laps.filter(l => l.is_valid && !l.is_pit_lap).length;
            const duration = this.formatDuration(stint.stint_drive_time_ms);

            return `
                <div class="stint-compact-card" onclick="dashboard.selectStintDetail(${i})">
                    <div class="stint-compact-title">Stint ${i + 1}</div>
                    <div class="stint-compact-meta">${duration} · ${validCount}/${lapsCount} giri</div>
                </div>
            `;
        }).join('');
    }

    selectStintDetail(index) {
        // Highlight selected stint
        document.querySelectorAll('.stint-compact-card').forEach((card, i) => {
            card.classList.toggle('active', i === index);
        });

        // Could expand to show more stint details in future
    }

    renderLapsTable(allLaps, bestLapTime) {
        const tbody = document.getElementById('lapsTableBody');
        if (!tbody) return;

        // Calculate best sectors (solo da giri affidabili)
        const bestSectors = [0, 1, 2].map(i => {
            const sectorTimes = allLaps
                .filter(l => l.is_valid && l.sectors_reliable && l.sector_times_ms?.length === 3)
                .map(l => l.sector_times_ms[i])
                .filter(s => s > 0);
            return sectorTimes.length > 0 ? Math.min(...sectorTimes) : 0;
        });

        tbody.innerHTML = allLaps.map(lap => {
            // Usa sectors_reliable dal JSON
            const showSectors = lap.sectors_reliable && lap.sector_times_ms?.length === 3;

            const sectorCells = [0, 1, 2].map(i => {
                if (!showSectors) return '<td class="sector-time sector-na">-</td>';
                const s = lap.sector_times_ms[i];
                if (s <= 0) return '<td class="sector-time">-</td>';
                const isSectorBest = s === bestSectors[i] && bestSectors[i] > 0;
                return `<td class="sector-time ${isSectorBest ? 'sector-best' : ''}">${this.formatSectorTime(s)}</td>`;
            }).join('');

            // Determina badge usando nuovi campi JSON
            let statusBadge, rowClass, tooltip;
            if (lap.lap_time_ms === bestLapTime && lap.is_valid && !lap.has_pit_stop && !lap.pit_out_lap) {
                statusBadge = '<span class="status-badge best">BEST</span>';
                rowClass = 'best-lap';
                tooltip = 'Miglior tempo';
            } else if (lap.has_pit_stop) {
                statusBadge = '<span class="status-badge pit-in">PIT-IN</span>';
                rowClass = 'pit-stop-lap';
                tooltip = 'Pit Stop: include tempo sosta, non usato per calcoli';
            } else if (lap.pit_out_lap) {
                statusBadge = '<span class="status-badge pit-out">PIT-OUT</span>';
                rowClass = 'pit-out-lap';
                tooltip = 'Pit Out: uscita dai box, non usato per calcoli';
            } else if (!lap.is_valid) {
                statusBadge = '<span class="status-badge cut">CUT</span>';
                rowClass = 'invalid-lap';
                tooltip = 'Giro non valido (taglio pista)';
            } else {
                statusBadge = '';  // No badge for normal valid laps
                rowClass = '';
                tooltip = 'Giro valido';
            }

            return `
                <tr class="${rowClass}" title="${tooltip}">
                    <td>${lap.lap_number}</td>
                    <td class="lap-time">${this.formatLapTime(lap.lap_time_ms)}</td>
                    ${sectorCells}
                    <td>${lap.fuel_remaining ? lap.fuel_remaining.toFixed(1) + 'L' : '-'}</td>
                    <td>${lap.track_grip_status || '-'}</td>
                    <td class="status-cell">${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    // Sanity check: se somma settori diverge da lap_time > 3%, settori invalid
    validateSectorTimes(lap) {
        if (!lap.sector_times_ms || lap.sector_times_ms.length !== 3) return false;
        const sumSectors = lap.sector_times_ms.reduce((a, b) => a + b, 0);
        if (sumSectors <= 0 || lap.lap_time_ms <= 0) return false;
        const deviation = Math.abs(sumSectors - lap.lap_time_ms) / lap.lap_time_ms;
        return deviation < 0.03; // 3% tolerance
    }

    formatSectorTime(ms) {
        if (!ms || ms <= 0) return '-';
        const seconds = ms / 1000;
        return seconds.toFixed(3);
    }

    calculateSectorStats(validLaps) {
        const sectors = [0, 1, 2].map(i => {
            const times = validLaps
                .filter(l => l.sector_times_ms && l.sector_times_ms[i] > 0 && l.sector_times_ms[i] < 200000)
                .map(l => l.sector_times_ms[i]);

            if (times.length === 0) return null;

            const best = Math.min(...times);
            const worst = Math.max(...times);
            const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
            const variance = (worst - best) / 1000;

            return { best, worst, avg, variance, times };
        });

        return sectors;
    }

    renderLapTimesChart(allLaps, bestLapTime) {
        const container = document.getElementById('lapTimesChart');

        if (allLaps.length === 0) {
            container.innerHTML = '<div class="empty-state-small"><p>Nessun dato</p></div>';
            return;
        }

        // Filter out pit laps for chart scaling
        const chartLaps = allLaps.filter(l => l.lap_time_ms > 0 && l.lap_time_ms < 300000);
        if (chartLaps.length === 0) {
            container.innerHTML = '<div class="empty-state-small"><p>Nessun dato</p></div>';
            return;
        }

        const minTime = Math.min(...chartLaps.map(l => l.lap_time_ms));
        const maxTime = Math.max(...chartLaps.map(l => l.lap_time_ms));
        const range = maxTime - minTime || 1;

        container.innerHTML = allLaps.map((lap, i) => {
            if (lap.lap_time_ms <= 0 || lap.lap_time_ms > 300000) {
                return ''; // Skip invalid for chart
            }

            const heightPercent = 20 + ((lap.lap_time_ms - minTime) / range * 80);
            const invertedHeight = 100 - heightPercent + 20; // Invert so faster = taller

            let barClass = lap.is_valid ? 'valid' : 'invalid';
            if (lap.lap_time_ms === bestLapTime && lap.is_valid) {
                barClass = 'best';
            }

            return `
                <div class="lap-bar-container" title="Giro ${lap.lap_number}: ${this.formatLapTime(lap.lap_time_ms)}">
                    <div class="lap-bar ${barClass}" style="height: ${invertedHeight}%"></div>
                    <span class="lap-bar-label">${lap.lap_number}</span>
                </div>
            `;
        }).join('');
    }

    renderSectorImprovement(sectorStats) {
        const container = document.getElementById('sectorImprovement');

        if (sectorStats.every(s => s === null)) {
            container.innerHTML = '<div class="empty-state-small"><p>Nessun dato settori</p></div>';
            return;
        }

        // Calculate which sector needs most work (highest variance)
        const validSectors = sectorStats.filter(s => s !== null);
        const maxVariance = Math.max(...validSectors.map(s => s.variance));

        container.innerHTML = sectorStats.map((sector, i) => {
            if (!sector) return '';

            const variancePercent = Math.min(100, (sector.variance / 3) * 100); // 3 seconds = 100%
            let varianceClass = 'low';
            let priorityClass = 'good';
            let priorityText = '✓ OK';

            if (sector.variance > 1.5) {
                varianceClass = 'high';
                priorityClass = 'focus';
                priorityText = '⚠ Focus';
            } else if (sector.variance > 0.8) {
                varianceClass = 'medium';
                priorityClass = 'ok';
                priorityText = '○ Migliora';
            }

            // Mark the worst sector specifically
            if (sector.variance === maxVariance && sector.variance > 0.5) {
                priorityClass = 'focus';
                priorityText = '🎯 Priorità';
            }

            return `
                <div class="sector-row">
                    <span class="sector-label">Settore ${i + 1}</span>
                    <div class="sector-times">
                        <div class="sector-best-avg">
                            <span class="sector-best">Best: ${this.formatSectorTime(sector.best)}</span>
                            <span class="sector-avg">Avg: ${this.formatSectorTime(sector.avg)}</span>
                            <span>Δ ${sector.variance.toFixed(2)}s</span>
                        </div>
                        <div class="sector-variance-bar">
                            <div class="sector-variance-fill ${varianceClass}" style="width: ${variancePercent}%"></div>
                        </div>
                    </div>
                    <span class="sector-priority ${priorityClass}">${priorityText}</span>
                </div>
            `;
        }).join('');
    }

    renderConsistencyMetrics(validLaps, sectorStats) {
        const container = document.getElementById('consistencyMetrics');
        const ratingBadge = document.getElementById('consistencyRating');

        if (validLaps.length === 0) {
            container.innerHTML = '<div class="empty-state-small"><p>Nessun dato</p></div>';
            ratingBadge.textContent = '--';
            return;
        }

        // Calculate lap time variance
        const lapTimes = validLaps.map(l => l.lap_time_ms);
        const avgLapTime = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
        const variance = Math.sqrt(lapTimes.reduce((sum, t) => sum + Math.pow(t - avgLapTime, 2), 0) / lapTimes.length) / 1000;

        // Calculate best theoretical lap
        const theoreticalBest = sectorStats.reduce((sum, s) => sum + (s ? s.best : 0), 0);
        const actualBest = Math.min(...lapTimes);
        const gapToTheoretical = (actualBest - theoreticalBest) / 1000;

        // Calculate sector consistency
        const sectorVariances = sectorStats.filter(s => s !== null).map(s => s.variance);
        const avgSectorVariance = sectorVariances.length > 0
            ? sectorVariances.reduce((a, b) => a + b, 0) / sectorVariances.length
            : 0;

        // Overall rating
        let rating = 'Eccellente';
        let ratingClass = 'badge-success';
        if (variance > 2) {
            rating = 'Da Migliorare';
            ratingClass = 'badge-danger';
        } else if (variance > 1) {
            rating = 'Buona';
            ratingClass = 'badge-warning';
        }

        ratingBadge.className = `badge ${ratingClass}`;
        ratingBadge.textContent = rating;

        container.innerHTML = `
            <div class="consistency-metric">
                <span class="cm-value ${variance < 1 ? 'good' : variance < 2 ? 'warning' : 'bad'}">
                    ±${variance.toFixed(2)}s
                </span>
                <span class="cm-label">Varianza Giro</span>
            </div>
            <div class="consistency-metric">
                <span class="cm-value ${gapToTheoretical < 0.5 ? 'good' : gapToTheoretical < 1 ? 'warning' : 'bad'}">
                    +${gapToTheoretical.toFixed(3)}s
                </span>
                <span class="cm-label">Gap da Teorico</span>
            </div>
            <div class="consistency-metric">
                <span class="cm-value">${this.formatLapTime(theoreticalBest)}</span>
                <span class="cm-label">Teorico Best</span>
            </div>
            <div class="consistency-metric">
                <span class="cm-value ${avgSectorVariance < 0.8 ? 'good' : avgSectorVariance < 1.5 ? 'warning' : 'bad'}">
                    ±${avgSectorVariance.toFixed(2)}s
                </span>
                <span class="cm-label">Media Varianza Settori</span>
            </div>
        `;
    }

    renderStintTabs(stints) {
        const container = document.getElementById('stintTabs');

        container.innerHTML = stints.map((stint, i) => {
            const validLaps = stint.laps.filter(l => l.is_valid && !l.is_pit_lap);
            const bestLap = validLaps.length > 0
                ? Math.min(...validLaps.map(l => l.lap_time_ms))
                : 0;

            return `
                <div class="stint-tab" onclick="dashboard.selectStint(${i})" data-stint="${i}">
                    <span class="stint-tab-number">${stint.stint_number}</span>
                    <div class="stint-tab-info">
                        <span class="stint-tab-title">Stint ${stint.stint_number}</span>
                        <span class="stint-tab-meta">${stint.laps.length} giri • ${bestLap > 0 ? this.formatLapTime(bestLap) : '--:--'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectStint(index) {
        const session = this.currentSession;
        if (!session || !session.stints[index]) return;

        // Update active tab
        document.querySelectorAll('.stint-tab').forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });

        const stint = session.stints[index];
        this.renderStintDetail(stint);
    }

    renderStintDetail(stint) {
        const container = document.getElementById('stintDetail');

        const validLaps = stint.laps.filter(l => l.is_valid && !l.is_pit_lap);
        const invalidLaps = stint.laps.filter(l => !l.is_valid && !l.is_pit_lap);
        const bestLapTime = validLaps.length > 0 ? Math.min(...validLaps.map(l => l.lap_time_ms)) : 0;
        const avgLapTime = validLaps.length > 0
            ? Math.round(validLaps.reduce((a, l) => a + l.lap_time_ms, 0) / validLaps.length)
            : 0;

        // Calculate best sectors for this stint
        const stintSectorStats = this.calculateSectorStats(validLaps);

        // Calculate sector best/worst for highlighting
        const bestSectors = [0, 1, 2].map(i => {
            const times = validLaps
                .filter(l => l.sector_times_ms && l.sector_times_ms[i] > 0 && l.sector_times_ms[i] < 200000)
                .map(l => l.sector_times_ms[i]);
            return times.length > 0 ? Math.min(...times) : 0;
        });

        const worstSectors = [0, 1, 2].map(i => {
            const times = validLaps
                .filter(l => l.sector_times_ms && l.sector_times_ms[i] > 0 && l.sector_times_ms[i] < 200000)
                .map(l => l.sector_times_ms[i]);
            return times.length > 0 ? Math.max(...times) : 0;
        });

        // Generate stint summary phrase
        const stintSummary = this.generateStintSummary(stint, validLaps, invalidLaps, avgLapTime, stintSectorStats);

        container.innerHTML = `
            <div class="stint-detail-header">
                <div class="stint-title">
                    <span class="stint-number">${stint.stint_number}</span>
                    <div>
                        <h3>Stint ${stint.stint_number}</h3>
                        <span>${stint.type} • ${stint.laps.length} giri • Fuel: ${stint.fuel_start.toFixed(1)}L</span>
                    </div>
                </div>
                <div class="stint-detail-stats">
                    <div class="stint-detail-stat">
                        <span class="sds-value best">${bestLapTime > 0 ? this.formatLapTime(bestLapTime) : '--:--'}</span>
                        <span class="sds-label">Best Lap</span>
                    </div>
                    <div class="stint-detail-stat">
                        <span class="sds-value">${avgLapTime > 0 ? this.formatLapTime(avgLapTime) : '--:--'}</span>
                        <span class="sds-label">Media</span>
                    </div>
                    <div class="stint-detail-stat">
                        <span class="sds-value">${this.formatDuration(stint.stint_drive_time_ms)}</span>
                        <span class="sds-label">Durata</span>
                    </div>
                </div>
            </div>
            
            <div class="stint-summary-phrase">${stintSummary}</div>
            
            <div class="stint-sector-comparison">
                <h4>📊 Confronto Settori - Dove puoi migliorare</h4>
                <div class="sector-comparison-grid">
                    ${stintSectorStats.map((sector, i) => {
            if (!sector) return '<div class="sector-comparison-item"><span class="sci-header">S${i+1}</span><span>--</span></div>';

            let varianceClass = 'low';
            if (sector.variance > 1.5) varianceClass = 'high';
            else if (sector.variance > 0.8) varianceClass = 'medium';

            return `
                            <div class="sector-comparison-item">
                                <span class="sci-header">Settore ${i + 1}</span>
                                <span class="sci-best">${this.formatSectorTime(sector.best)}</span>
                                <div class="sci-variance">
                                    <span>Varianza:</span>
                                    <span class="sci-variance-value ${varianceClass}">±${sector.variance.toFixed(2)}s</span>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
            
            <div class="stint-laps-table">
                <div class="lap-row header">
                    <span>Giro</span>
                    <span>Settori</span>
                    <span>Tempo</span>
                    <span>Fuel</span>
                    <span>Condizioni</span>
                    <span>Grip</span>
                    <span>Valido</span>
                </div>
                ${stint.laps.map(lap => this.renderLapRow(lap, bestLapTime, bestSectors, worstSectors)).join('')}
            </div>
        `;
    }

    renderLapRow(lap, bestLapTime, bestSectors, worstSectors) {
        const isBestLap = lap.lap_time_ms === bestLapTime && lap.is_valid && !lap.is_pit_lap;
        const lapTimeClass = !lap.is_valid ? 'invalid' : (isBestLap ? 'best' : '');

        // Sector chips
        const sectors = lap.sector_times_ms ? lap.sector_times_ms.map((time, i) => {
            let sectorClass = '';
            if (time === bestSectors[i] && time > 0 && time < 200000) {
                sectorClass = 'best';
            } else if (time === worstSectors[i] && time > 0 && time < 200000) {
                sectorClass = 'worst';
            }
            return `<span class="sector-chip ${sectorClass}">${this.formatSectorTime(time)}</span>`;
        }).join('') : '<span class="sector-chip">--</span>';

        return `
            <div class="lap-row">
                <span class="lap-number">${lap.lap_number}</span>
                <div class="lap-sectors">${sectors}</div>
                <span class="lap-time ${lapTimeClass}">
                    ${this.formatLapTime(lap.lap_time_ms)}
                    ${isBestLap ? '🏆' : ''}
                </span>
                <span class="lap-fuel">${lap.fuel_remaining.toFixed(2)}L</span>
                <div class="lap-conditions">
                    <span>${lap.rain_intensity === 'No Rain' ? '☀️' : '🌧️'}</span>
                    <span>${lap.air_temp}°C</span>
                </div>
                <span>${lap.track_grip_status}</span>
                <span class="lap-validity">
                    <span class="validity-icon">${lap.is_valid ? '✅' : '❌'}</span>
                </span>
            </div>
        `;
    }

    // ===== Stint Summary Generator =====
    generateStintSummary(stint, validLaps, invalidLaps, avgLapTime, sectorStats) {
        const totalLaps = stint.laps.length;
        const validPercent = totalLaps > 0 ? Math.round(validLaps.length / totalLaps * 100) : 0;
        const stintMinutes = Math.round(stint.stint_drive_time_ms / 60000);

        // Calculate lap consistency
        let consistency = 'costante';
        if (validLaps.length >= 2) {
            const times = validLaps.map(l => l.lap_time_ms);
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            const variance = Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length) / 1000;
            if (variance > 2) consistency = 'irregolare';
            else if (variance > 1) consistency = 'con variazioni';
        }

        // Determine stint length category
        let lengthDesc = 'breve';
        if (totalLaps >= 10) lengthDesc = 'lungo';
        else if (totalLaps >= 5) lengthDesc = 'medio';

        // Build phrase parts
        const parts = [];

        // Length and rhythm
        if (lengthDesc === 'lungo' && consistency === 'costante') {
            parts.push('💪 Stint lungo con ritmo costante');
        } else if (lengthDesc === 'breve' && validPercent >= 80) {
            parts.push('⚡ Stint breve ma produttivo');
        } else if (consistency === 'irregolare') {
            parts.push('📊 Stint con ritmo irregolare');
        } else {
            parts.push(`🏎️ Stint ${lengthDesc}, ritmo ${consistency}`);
        }

        // Valid laps analysis
        if (validPercent >= 90) {
            parts.push('ottima disciplina sui limiti');
        } else if (validPercent >= 70) {
            parts.push('attenzione ai track limits');
        } else if (validPercent < 50 && invalidLaps.length > 1) {
            parts.push('troppi giri invalidati, lavora sui limiti');
        }

        // Sector analysis
        const validSectors = sectorStats.filter(s => s !== null);
        if (validSectors.length === 3) {
            const maxVariance = Math.max(...validSectors.map(s => s.variance));
            const worstSector = sectorStats.findIndex(s => s && s.variance === maxVariance) + 1;
            if (maxVariance > 1.5) {
                parts.push(`focus sul Settore ${worstSector}`);
            }
        }

        // Join parts with ", "
        return parts.join(', ');
    }

    // ===== Navigation =====
    switchView(viewName) {
        // Update tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });

        // Update sliding indicator position
        const navTabs = document.querySelector('.nav-tabs');
        if (navTabs) {
            navTabs.classList.remove('tab-1', 'tab-2', 'tab-3');
            const positionMap = { 'overview': 'tab-1', 'sessions': 'tab-2', 'stints': 'tab-3' };
            navTabs.classList.add(positionMap[viewName] || 'tab-1');
        }

        // Update views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}-view`);
        });
    }

    // ===== Formatters =====
    formatLapTime(ms) {
        if (!ms || ms <= 0) return '--:--.---';

        // Round to nearest millisecond to handle averages with fractional values
        ms = Math.round(ms);

        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = ms % 1000;

        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    formatSectorTime(ms) {
        if (!ms || ms <= 0 || ms > 200000) return '--.--.---';

        const seconds = ms / 1000;
        return seconds.toFixed(3);
    }

    formatDuration(ms) {
        if (!ms || ms <= 0) return '0m';

        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    formatCarName(carCode) {
        if (!carCode) return 'Unknown';

        // Convert car code to readable name
        const formatted = carCode
            .replace(/_/g, ' ')
            .replace(/gt3/gi, 'GT3')
            .replace(/gt4/gi, 'GT4')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        return formatted;
    }

    // Helper: identifica e escludi giri non rappresentativi
    // Usa i nuovi campi JSON: has_pit_stop, pit_out_lap
    // Clean lap = is_valid && !has_pit_stop && !pit_out_lap
    getCleanLaps(session) {
        const cleanLaps = [];
        const excludedLaps = [];

        session.stints.forEach((stint, stintIndex) => {
            stint.laps.forEach(lap => {
                // Add stint_index for filtering
                lap.stint_index = stintIndex;

                // Escludi giri con pit stop (tempo alterato dalla sosta)
                if (lap.has_pit_stop) {
                    lap._excludeReason = 'pit-stop';
                    excludedLaps.push(lap);
                    return;
                }

                // Escludi outlap (giro dopo uscita pit)
                if (lap.pit_out_lap) {
                    lap._excludeReason = 'pit-out';
                    excludedLaps.push(lap);
                    return;
                }

                // Giro pulito
                lap._excludeReason = null;
                cleanLaps.push(lap);
            });
        });

        return {
            cleanLaps,
            excludedLaps,
            excludedCount: {
                pitStop: excludedLaps.filter(l => l._excludeReason === 'pit-stop').length,
                pitOut: excludedLaps.filter(l => l._excludeReason === 'pit-out').length
            }
        };
    }

    // ===== HEADER MENU =====
    toggleHeaderMenu() {
        const dropdown = document.getElementById('headerDropdown');
        if (dropdown) {
            dropdown.classList.toggle('active');
        }
    }

    // Close dropdown when clicking outside
    closeHeaderMenuOnOutsideClick(event) {
        const dropdown = document.getElementById('headerDropdown');
        const menuBtn = document.getElementById('headerMenuBtn');
        if (dropdown && menuBtn && !dropdown.contains(event.target) && !menuBtn.contains(event.target)) {
            dropdown.classList.remove('active');
        }
    }

    // ===== DRIVER HISTORY VIEW =====
    showDriverHistory() {
        // Morph navbar: hide main tabs, show back button
        const navbar = document.querySelector('.nav-tabs');
        const navMain = document.querySelector('.nav-tabs-main');
        const navBack = document.querySelector('.nav-tabs-back');

        if (navbar) {
            // Add morphing class for animation
            navbar.classList.add('nav-morphing');

            // After short delay, switch to back mode (CSS handles visibility)
            setTimeout(() => {
                navbar.classList.add('nav-back-mode');
                navbar.classList.remove('nav-morphing');
            }, 150);
        }

        // Hide all views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        // Show driver history view
        const historyView = document.getElementById('driver-history-view');
        if (historyView) {
            historyView.classList.add('active');
            this.renderDriverHistoryView();
        }
        // Deactivate nav tabs
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    }

    hideDriverHistory() {
        // Morph navbar back: hide back button, show main tabs
        const navbar = document.querySelector('.nav-tabs');
        const navMain = document.querySelector('.nav-tabs-main');
        const navBack = document.querySelector('.nav-tabs-back');

        if (navbar) {
            // Add morphing class for animation
            navbar.classList.add('nav-morphing');

            // After short delay, switch back to normal mode (CSS handles visibility)
            setTimeout(() => {
                navbar.classList.remove('nav-back-mode');
                navbar.classList.remove('nav-morphing');
            }, 150);
        }

        // Return to overview
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('overview-view')?.classList.add('active');

        // Activate overview tab and update selector position
        this.switchTab('overview');
    }

    // Handle back navigation (works for both login and driver history)
    handleBackNavigation() {
        // Check if login view is active
        const loginView = document.getElementById('login-view');
        if (loginView && loginView.classList.contains('active')) {
            this.closeLogin();
        } else {
            // Otherwise, close driver history
            this.hideDriverHistory();
        }
    }

    // Set track layout (cards, rows, compact, table)
    setTrackLayout(layout) {
        const grid = document.getElementById('dhTracksGrid');
        if (!grid) return;

        // Remove existing layout classes (including table)
        grid.classList.remove('layout-cards', 'layout-rows', 'layout-compact', 'layout-table');
        // Add new layout class (cards is default, no class needed)
        if (layout !== 'cards') {
            grid.classList.add(`layout-${layout}`);
        }

        // Update toggle buttons
        document.querySelectorAll('.dh-layout-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layout === layout);
        });

        // Re-render view to apply layout changes
        this.renderDriverHistoryView();
    }

    // Aggregate sessions by track
    aggregateByTrack() {
        const trackData = {};

        this.sessions.forEach((session, sessionIndex) => {
            const trackName = session.session_info?.track || 'Unknown';
            const sessionType = session.session_info?.session_type;
            const isRace = sessionType === 2; // Race
            const isQuali = sessionType === 1; // Qualifying

            if (!trackData[trackName]) {
                trackData[trackName] = {
                    name: trackName,
                    sessions: [],
                    raceSessions: [],
                    qualiSessions: [],
                    totalTimeMs: 0,
                    totalLaps: 0,
                    // Overall best (for backwards compatibility)
                    bestLapMs: Infinity,
                    bestLapDate: null,
                    bestLapSessionIndex: null,
                    // Race best with conditions
                    bestRaceLap: {
                        time: Infinity,
                        date: null,
                        weather: null,
                        temp: null,
                        grip: null,
                        sessionIndex: null
                    },
                    // Quali best with conditions
                    bestQualiLap: {
                        time: Infinity,
                        date: null,
                        weather: null,
                        temp: null,
                        grip: null,
                        sessionIndex: null
                    }
                };
            }

            const track = trackData[trackName];
            const sessionData = { session, index: sessionIndex };
            track.sessions.push(sessionData);

            if (isRace) track.raceSessions.push(sessionData);
            if (isQuali) track.qualiSessions.push(sessionData);

            track.totalTimeMs += session.session_info?.total_drive_time_ms || 0;

            // Extract session conditions
            const weather = session.session_info?.start_weather || 'Unknown';
            const temp = session.session_info?.ambient_temp || session.session_info?.air_temp;
            const grip = session.session_info?.track_grip || session.session_info?.grip_status;
            const date = session.session_info?.date_start;

            // Count laps and find best per type
            session.stints?.forEach(stint => {
                stint.laps?.forEach(lap => {
                    track.totalLaps++;

                    if (lap.is_valid && lap.lap_time_ms > 0) {
                        // Overall best
                        if (lap.lap_time_ms < track.bestLapMs) {
                            track.bestLapMs = lap.lap_time_ms;
                            track.bestLapDate = date;
                            track.bestLapSessionIndex = sessionIndex;
                        }

                        // Race best
                        if (isRace && lap.lap_time_ms < track.bestRaceLap.time) {
                            track.bestRaceLap = {
                                time: lap.lap_time_ms,
                                date: date,
                                weather: weather,
                                temp: temp,
                                grip: grip,
                                sessionIndex: sessionIndex
                            };
                        }

                        // Quali best
                        if (isQuali && lap.lap_time_ms < track.bestQualiLap.time) {
                            track.bestQualiLap = {
                                time: lap.lap_time_ms,
                                date: date,
                                weather: weather,
                                temp: temp,
                                grip: grip,
                                sessionIndex: sessionIndex
                            };
                        }
                    }
                });
            });
        });

        return Object.values(trackData);
    }

    renderDriverHistoryView() {
        if (this.sessions.length === 0) {
            console.log('No sessions loaded for Driver History');
            return;
        }

        // 1. Find the last session to determine which track to show
        let lastSession = null;
        let lastSessionDate = null;
        let lastSessionIdx = -1;
        this.sessions.forEach((session, idx) => {
            const date = session.session_info?.date_start;
            if (date && (!lastSessionDate || new Date(date) > new Date(lastSessionDate))) {
                lastSessionDate = date;
                lastSession = session;
                lastSessionIdx = idx;
            }
        });
        this.lastSessionIndex = lastSessionIdx;

        const lastTrack = lastSession?.session_info?.track || 'unknown';

        // 2. Calculate global statistics
        const totalSessions = this.sessions.length;
        const allTracks = [...new Set(this.sessions.map(s => s.session_info?.track).filter(Boolean))];
        const uniqueTracks = allTracks.length;
        const totalTimeMs = this.sessions.reduce((sum, s) => {
            let sessionTime = 0;
            s.stints?.forEach(stint => {
                stint.laps?.forEach(lap => {
                    if (lap.lap_time_ms && lap.lap_time_ms < 600000) {
                        sessionTime += lap.lap_time_ms;
                    }
                });
            });
            return sum + sessionTime;
        }, 0);

        // 3. Calculate period string
        const dates = this.sessions.map(s => new Date(s.session_info?.date_start)).filter(d => !isNaN(d));
        const minDate = dates.length ? new Date(Math.min(...dates)) : null;
        const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
        const periodStr = minDate && maxDate ?
            `${minDate.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })} – ${maxDate.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}` : '--';

        // 5. Update Header Bar (Pilot Info)
        this.setTextContent('dhPilotPeriod', periodStr);
        this.setTextContent('dhTotalSessions', totalSessions);
        this.setTextContent('dhTotalTracks', uniqueTracks);
        this.setTextContent('dhTotalTime', this.formatDuration(totalTimeMs));

        // 6. Set last session indicator
        this.setTextContent('dhLastTrack', this.getTrackDisplayName(lastTrack));
        this.lastSessionTrack = lastTrack;

        // 7. Store current track for highlighting
        this.currentHistoryTrack = lastTrack;

        // 8. Update Chart Title (more visible)
        this.setTextContent('dhChartTitle', `STORICO ${this.getTrackDisplayName(lastTrack).toUpperCase()}`);

        // 9. Populate track list sidebar
        this.populateTrackList(allTracks, lastTrack);

        // 10. Update best times for the selected track (dynamic)
        this.updateTrackBests(lastTrack);

        // 11. Render ECG-style chart for the last track
        this.renderTrackHistoryChart(lastTrack);
    }

    updateTrackBests(trackName) {
        // Find best qualifying and race times for this specific track
        let bestQuali = { time: Infinity, date: null, weather: null, sessionIndex: -1 };
        let bestRace = { time: Infinity, date: null, weather: null, sessionIndex: -1 };

        this.sessions.forEach((session, idx) => {
            if (session.session_info?.track !== trackName) return;

            const sessionType = session.session_info?.session_type;
            const bestLap = session.session_info?.session_best_lap;
            const date = session.session_info?.date_start;
            const weather = session.session_info?.start_weather || 'No Rain';

            if (!bestLap || bestLap <= 0) return;

            const isQuali = sessionType === 1;
            const isRace = sessionType === 2 || sessionType === 0; // Race or Practice

            if (isQuali && bestLap < bestQuali.time) {
                bestQuali = { time: bestLap, date, weather, sessionIndex: idx };
            }
            if (isRace && bestLap < bestRace.time) {
                bestRace = { time: bestLap, date, weather, sessionIndex: idx };
            }
        });

        // Store for CTA buttons
        this.bestQualiSessionIndex = bestQuali.sessionIndex >= 0 ? bestQuali.sessionIndex : null;
        this.bestRaceSessionIndex = bestRace.sessionIndex >= 0 ? bestRace.sessionIndex : null;

        // Update Best Times box title
        this.setTextContent('dhBestsTrackName', this.getTrackDisplayName(trackName));

        // Update Best Qualifying
        if (bestQuali.time < Infinity) {
            this.setTextContent('dhBestQualiTime', this.formatLapTime(bestQuali.time));
            const qualiMeta = `${bestQuali.weather} · ${bestQuali.date ? new Date(bestQuali.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}`;
            this.setTextContent('dhBestQualiMeta', qualiMeta);
            document.getElementById('dhBestQualiCta')?.classList.remove('hidden');
        } else {
            this.setTextContent('dhBestQualiTime', '--:--.---');
            this.setTextContent('dhBestQualiMeta', 'Nessuna qualifica registrata');
            document.getElementById('dhBestQualiCta')?.classList.add('hidden');
        }

        // Update Best Race
        if (bestRace.time < Infinity) {
            this.setTextContent('dhBestRaceTime', this.formatLapTime(bestRace.time));
            const raceMeta = `${bestRace.weather} · ${bestRace.date ? new Date(bestRace.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}`;
            this.setTextContent('dhBestRaceMeta', raceMeta);
            document.getElementById('dhBestRaceCta')?.classList.remove('hidden');
        } else {
            this.setTextContent('dhBestRaceTime', '--:--.---');
            this.setTextContent('dhBestRaceMeta', 'Nessuna gara registrata');
            document.getElementById('dhBestRaceCta')?.classList.add('hidden');
        }
    }

    populateTrackList(tracks, activeTrack) {
        const container = document.getElementById('dhTrackList');
        if (!container) return;

        container.innerHTML = tracks.map(track => `
            <div class="dh-track-item ${track === activeTrack ? 'active' : ''}" 
                 onclick="dashboard.selectHistoryTrack('${track}')">
                ${this.getTrackDisplayName(track)}
            </div>
        `).join('');
    }

    selectHistoryTrack(trackName) {
        this.currentHistoryTrack = trackName;

        // Update chart title
        this.setTextContent('dhChartTitle', `STORICO ${this.getTrackDisplayName(trackName).toUpperCase()}`);

        // Update track list active state
        document.querySelectorAll('.dh-track-item').forEach(item => {
            item.classList.toggle('active', item.textContent.trim() === this.getTrackDisplayName(trackName));
        });

        // Update best times for the selected track
        this.updateTrackBests(trackName);

        // Re-render chart for selected track
        this.renderTrackHistoryChart(trackName);
    }

    openBestQualiSession() {
        if (this.bestQualiSessionIndex !== null && this.bestQualiSessionIndex >= 0) {
            this.hideDriverHistory();
            this.openSession(this.bestQualiSessionIndex);
        }
    }

    openBestRaceSession() {
        if (this.bestRaceSessionIndex !== null && this.bestRaceSessionIndex >= 0) {
            this.hideDriverHistory();
            this.openSession(this.bestRaceSessionIndex);
        }
    }

    openLastSession() {
        if (this.lastSessionIndex !== null && this.lastSessionIndex >= 0) {
            this.hideDriverHistory();
            this.openSession(this.lastSessionIndex);
        }
    }

    renderTrackHistoryChart(trackName) {
        const canvas = document.getElementById('dhHistoryChart');
        if (!canvas) return;

        // Destroy existing chart
        if (this.charts.historyChart) {
            this.charts.historyChart.destroy();
        }

        // Collect all sessions for this track
        const trackSessions = this.sessions.filter(s => s.session_info?.track === trackName);

        // Build data points for quali and race
        const qualiPoints = [];
        const racePoints = [];

        trackSessions.forEach(session => {
            const date = session.session_info?.date_start;
            const sessionType = session.session_info?.session_type;
            // Use session_best_lap directly from session_info (already calculated)
            const bestLap = session.session_info?.session_best_lap;

            if (!date || !bestLap || bestLap <= 0) return;

            const isQuali = sessionType === 1;
            const isRace = sessionType === 2 || sessionType === 0; // Race or Practice

            const point = { x: new Date(date), y: bestLap };
            if (isQuali) {
                qualiPoints.push(point);
            } else if (isRace) {
                racePoints.push(point);
            }
        });

        // Sort by date
        qualiPoints.sort((a, b) => a.x - b.x);
        racePoints.sort((a, b) => a.x - b.x);

        // Check if trendlines should be shown
        const showTrend = document.getElementById('dhTrendCheck')?.checked || false;

        // Theme-aware colors
        const tc = this.getChartColors();

        // Build datasets
        const datasets = [
            {
                label: 'Qualifica',
                data: qualiPoints,
                borderColor: tc.accent,
                backgroundColor: `rgba(${tc.accentRgb}, 0.1)`,
                borderWidth: 2,
                tension: 0, // ECG style: straight lines
                pointRadius: 4,
                pointBackgroundColor: tc.accent,
                pointBorderColor: '#fff',
                pointBorderWidth: 1,
                pointHoverRadius: 6,
                fill: false,
                stepped: false
            },
            {
                label: 'Gara',
                data: racePoints,
                borderColor: tc.success,
                backgroundColor: `rgba(${tc.accentRgb}, 0.1)`,
                borderWidth: 2,
                tension: 0, // ECG style: straight lines
                pointRadius: 4,
                pointBackgroundColor: tc.success,
                pointBorderColor: '#fff',
                pointBorderWidth: 1,
                pointHoverRadius: 6,
                fill: false,
                stepped: false
            }
        ];

        // Add trendlines if enabled
        if (showTrend) {
            const qualiTrend = this.calculateTrendline(qualiPoints);
            const raceTrend = this.calculateTrendline(racePoints);

            if (qualiTrend) {
                datasets.push({
                    label: 'Trend Qualifica',
                    data: qualiTrend,
                    borderColor: '#fbbf24',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                });
            }

            if (raceTrend) {
                datasets.push({
                    label: 'Trend Gara',
                    data: raceTrend,
                    borderColor: '#fbbf24',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false,
                    tension: 0
                });
            }
        }

        const ctx = canvas.getContext('2d');
        this.charts.historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            title: (items) => {
                                if (items.length) {
                                    return new Date(items[0].parsed.x).toLocaleDateString('it-IT', {
                                        day: 'numeric', month: 'short', year: 'numeric'
                                    });
                                }
                                return '';
                            },
                            label: (ctx) => `${ctx.dataset.label}: ${this.formatLapTime(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                hour: 'd MMM HH:mm',
                                day: 'd MMM',
                                week: 'd MMM'
                            },
                            tooltipFormat: 'd MMM yyyy HH:mm'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            maxTicksLimit: 6,
                            autoSkip: false,
                            maxRotation: 0,
                            font: { size: 11 },
                            source: 'data'
                        },
                        border: { color: 'rgba(255,255,255,0.1)' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        border: { color: 'rgba(255,255,255,0.1)' },
                        ticks: {
                            color: 'rgba(255,255,255,0.5)',
                            callback: (val) => this.formatLapTime(val)
                        }
                    }
                }
            }
        });
    }

    toggleHistoryTrend() {
        // Re-render the chart with/without trendlines
        if (this.currentHistoryTrack) {
            this.renderTrackHistoryChart(this.currentHistoryTrack);
        }
    }

    calculateTrendline(points) {
        if (points.length < 2) return null;

        // Convert dates to numeric values (days from first point)
        const firstDate = points[0].x.getTime();
        const xValues = points.map(p => (p.x.getTime() - firstDate) / (1000 * 60 * 60 * 24));
        const yValues = points.map(p => p.y);

        // Calculate linear regression
        const n = xValues.length;
        const sumX = xValues.reduce((a, b) => a + b, 0);
        const sumY = yValues.reduce((a, b) => a + b, 0);
        const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
        const sumXX = xValues.reduce((acc, x) => acc + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Generate trendline points
        return [
            { x: points[0].x, y: intercept },
            { x: points[points.length - 1].x, y: intercept + slope * xValues[xValues.length - 1] }
        ];
    }

    renderCardsLayout(grid, trackData, globalBestTrack) {
        grid.innerHTML = trackData.map(track => {
            const isBest = track.name === globalBestTrack;
            const tooltipText = `${track.sessions.length} sess • ${this.formatDuration(track.totalTimeMs)}`;

            // Format race and quali times
            const raceTime = track.bestRaceLap.time < Infinity ? this.formatLapTime(track.bestRaceLap.time) : '--:--.---';
            const qualiTime = track.bestQualiLap.time < Infinity ? this.formatLapTime(track.bestQualiLap.time) : '--:--.---';
            const hasRace = track.bestRaceLap.time < Infinity;
            const hasQuali = track.bestQualiLap.time < Infinity;

            return `
            <div class="dh-track-card${isBest ? ' is-personal-best' : ''}" 
                 onclick="dashboard.openTrackDetail('${track.name}')"
                 data-tooltip="${tooltipText}">
                <div class="dh-track-name">${this.getTrackDisplayName(track.name)}</div>
                <div class="dh-track-stats">
                    <div class="dh-track-stat">
                        <span class="dh-track-stat-value">${track.sessions.length}</span>
                        <span class="dh-track-stat-label">Sessioni</span>
                    </div>
                    <div class="dh-track-stat">
                        <span class="dh-track-stat-value">${this.formatDuration(track.totalTimeMs)}</span>
                        <span class="dh-track-stat-label">Tempo</span>
                    </div>
                    <div class="dh-track-stat">
                        <span class="dh-track-stat-value">${track.totalLaps}</span>
                        <span class="dh-track-stat-label">Giri</span>
                    </div>
                </div>
                <div class="dh-track-bests">
                    <div class="dh-track-best-item dh-best-race${hasRace ? '' : ' no-data'}">
                        <span class="dh-best-icon">🏁</span>
                        <span class="dh-best-time">${raceTime}</span>
                        <span class="dh-best-label">Race</span>
                    </div>
                    <div class="dh-track-best-item dh-best-quali${hasQuali ? '' : ' no-data'}">
                        <span class="dh-best-icon">⏱️</span>
                        <span class="dh-best-time">${qualiTime}</span>
                        <span class="dh-best-label">Quali</span>
                    </div>
                </div>
            </div>
        `}).join('');
    }

    renderTableLayout(grid, trackData, globalBestTrack) {
        const sortedData = [...trackData].sort((a, b) => {
            const sortKey = this.tableSortKey || 'name';
            const sortDir = this.tableSortDir || 'asc';
            let aVal, bVal;

            switch (sortKey) {
                case 'sessions': aVal = a.sessions.length; bVal = b.sessions.length; break;
                case 'laps': aVal = a.totalLaps; bVal = b.totalLaps; break;
                case 'race': aVal = a.bestRaceLap.time; bVal = b.bestRaceLap.time; break;
                case 'quali': aVal = a.bestQualiLap.time; bVal = b.bestQualiLap.time; break;
                case 'activity': aVal = new Date(a.lastActivity || 0); bVal = new Date(b.lastActivity || 0); break;
                default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
            }

            if (sortDir === 'desc') [aVal, bVal] = [bVal, aVal];
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        });

        const sortIcon = (key) => {
            if (this.tableSortKey === key) {
                return `<span class="sort-icon">${this.tableSortDir === 'asc' ? '▲' : '▼'}</span>`;
            }
            return '<span class="sort-icon">⇅</span>';
        };

        grid.innerHTML = `
            <table class="dh-tracks-table">
                <thead>
                    <tr>
                        <th class="${this.tableSortKey === 'name' ? 'sorted' : ''}" onclick="dashboard.sortTable('name')">Pista ${sortIcon('name')}</th>
                        <th class="${this.tableSortKey === 'sessions' ? 'sorted' : ''}" onclick="dashboard.sortTable('sessions')">Sessioni ${sortIcon('sessions')}</th>
                        <th class="${this.tableSortKey === 'laps' ? 'sorted' : ''}" onclick="dashboard.sortTable('laps')">Giri ${sortIcon('laps')}</th>
                        <th class="${this.tableSortKey === 'race' ? 'sorted' : ''}" onclick="dashboard.sortTable('race')">🏁 Race ${sortIcon('race')}</th>
                        <th class="${this.tableSortKey === 'quali' ? 'sorted' : ''}" onclick="dashboard.sortTable('quali')">⏱️ Quali ${sortIcon('quali')}</th>
                        <th class="${this.tableSortKey === 'activity' ? 'sorted' : ''}" onclick="dashboard.sortTable('activity')">Ultima ${sortIcon('activity')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedData.map(track => {
            const raceTime = track.bestRaceLap.time < Infinity ? this.formatLapTime(track.bestRaceLap.time) : '--';
            const qualiTime = track.bestQualiLap.time < Infinity ? this.formatLapTime(track.bestQualiLap.time) : '--';
            return `
                        <tr onclick="dashboard.openTrackDetail('${track.name}')">
                            <td class="track-name">${track.name === globalBestTrack ? '👑 ' : ''}${this.getTrackDisplayName(track.name)}</td>
                            <td>${track.sessions.length}</td>
                            <td>${track.totalLaps}</td>
                            <td class="best-race">${raceTime}</td>
                            <td class="best-quali">${qualiTime}</td>
                            <td class="last-activity">${track.lastActivity ? this.getRelativeTime(track.lastActivity) : '--'}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
    }

    sortTable(key) {
        if (this.tableSortKey === key) {
            this.tableSortDir = this.tableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.tableSortKey = key;
            this.tableSortDir = key === 'best' ? 'asc' : 'desc';
        }
        this.renderDriverHistoryView();
    }

    getRelativeTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Oggi';
        if (diffDays === 1) return 'Ieri';
        if (diffDays < 7) return `${diffDays} giorni fa`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} sett fa`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} mesi fa`;
        return `${Math.floor(diffDays / 365)} anni fa`;
    }

    openTrackDetail(trackName) {
        const trackData = this.aggregateByTrack().find(t => t.name === trackName);
        if (!trackData) return;

        // Show detail panel
        const detailPanel = document.getElementById('dhTrackDetail');
        if (detailPanel) detailPanel.style.display = 'block';

        // Update header
        this.setTextContent('dhDetailTrackName', this.getTrackDisplayName(trackName));

        // Populate Race Record Card
        const raceRec = trackData.bestRaceLap;
        if (raceRec.time < Infinity) {
            this.setTextContent('dhRaceBestTime', this.formatLapTime(raceRec.time));
            this.setTextContent('dhRaceDate', raceRec.date ? `📅 ${new Date(raceRec.date).toLocaleDateString('it-IT')}` : '--');
            this.setTextContent('dhRaceWeather', raceRec.weather ? `☁️ ${raceRec.weather}` : '--');
            this.setTextContent('dhRaceTemp', raceRec.temp ? `🌡️ ${raceRec.temp}°C` : '');
            this.setTextContent('dhRaceGrip', raceRec.grip ? `🛞 ${raceRec.grip}` : '');
            const raceBtn = document.getElementById('dhRaceSessionBtn');
            if (raceBtn && raceRec.sessionIndex !== null) {
                raceBtn.style.display = 'inline-block';
                raceBtn.onclick = () => this.openSessionFromHistory(raceRec.sessionIndex);
            }
        } else {
            this.setTextContent('dhRaceBestTime', '--:--.---');
            this.setTextContent('dhRaceDate', 'Nessun dato');
            this.setTextContent('dhRaceWeather', '');
            this.setTextContent('dhRaceTemp', '');
            this.setTextContent('dhRaceGrip', '');
        }

        // Populate Quali Record Card
        const qualiRec = trackData.bestQualiLap;
        if (qualiRec.time < Infinity) {
            this.setTextContent('dhQualiBestTime', this.formatLapTime(qualiRec.time));
            this.setTextContent('dhQualiDate', qualiRec.date ? `📅 ${new Date(qualiRec.date).toLocaleDateString('it-IT')}` : '--');
            this.setTextContent('dhQualiWeather', qualiRec.weather ? `☁️ ${qualiRec.weather}` : '--');
            this.setTextContent('dhQualiTemp', qualiRec.temp ? `🌡️ ${qualiRec.temp}°C` : '');
            this.setTextContent('dhQualiGrip', qualiRec.grip ? `🛞 ${qualiRec.grip}` : '');
            const qualiBtn = document.getElementById('dhQualiSessionBtn');
            if (qualiBtn && qualiRec.sessionIndex !== null) {
                qualiBtn.style.display = 'inline-block';
                qualiBtn.onclick = () => this.openSessionFromHistory(qualiRec.sessionIndex);
            }
        } else {
            this.setTextContent('dhQualiBestTime', '--:--.---');
            this.setTextContent('dhQualiDate', 'Nessun dato');
            this.setTextContent('dhQualiWeather', '');
            this.setTextContent('dhQualiTemp', '');
            this.setTextContent('dhQualiGrip', '');
        }

        // Render summary stats (simplified)
        const statsEl = document.getElementById('dhDetailStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="dh-detail-stat">
                    <span class="dh-stat-value">${trackData.sessions.length}</span>
                    <span class="dh-stat-label">Sessioni</span>
                </div>
                <div class="dh-detail-stat">
                    <span class="dh-stat-value">${trackData.raceSessions.length}</span>
                    <span class="dh-stat-label">Gare</span>
                </div>
                <div class="dh-detail-stat">
                    <span class="dh-stat-value">${trackData.qualiSessions.length}</span>
                    <span class="dh-stat-label">Qualifiche</span>
                </div>
                <div class="dh-detail-stat">
                    <span class="dh-stat-value">${this.formatDuration(trackData.totalTimeMs)}</span>
                    <span class="dh-stat-label">Tempo</span>
                </div>
                <div class="dh-detail-stat">
                    <span class="dh-stat-value">${trackData.totalLaps}</span>
                    <span class="dh-stat-label">Giri</span>
                </div>
            `;
        }

        // Update sessions count
        this.setTextContent('dhSessionsCount', trackData.sessions.length);

        // Store track for sessions toggle
        this.currentDetailTrack = trackData;

        // Hide sessions list by default
        const listEl = document.getElementById('dhSessionsList');
        if (listEl) listEl.style.display = 'none';

        // Render trend chart with dual lines
        this.renderTrackTrend(trackData);

        // Scroll to detail
        detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    toggleSessionsList() {
        const listEl = document.getElementById('dhSessionsList');
        if (!listEl || !this.currentDetailTrack) return;

        const isHidden = listEl.style.display === 'none';
        if (isHidden) {
            // Populate and show
            const sessionsHtml = this.currentDetailTrack.sessions
                .sort((a, b) => new Date(b.session.session_info?.date_start) - new Date(a.session.session_info?.date_start))
                .map(({ session, index }) => {
                    const date = session.session_info?.date_start ? new Date(session.session_info.date_start).toLocaleDateString('it-IT') : '--';
                    const weather = session.session_info?.start_weather || '--';
                    const sessionType = this.getSessionTypeName(session.session_info?.session_type);
                    const bestLap = this.getSessionBestLap(session);
                    return `
                        <div class="dh-session-item" onclick="dashboard.openSessionFromHistory(${index})">
                            <div>
                                <div class="dh-session-date">${date}</div>
                                <div class="dh-session-info">${sessionType} • ${weather}</div>
                            </div>
                            <div class="dh-session-best">${bestLap ? this.formatLapTime(bestLap) : '--:--.---'}</div>
                        </div>
                    `;
                }).join('');
            listEl.innerHTML = sessionsHtml;
            listEl.style.display = 'block';
        } else {
            listEl.style.display = 'none';
        }
    }

    getSessionTypeName(type) {
        switch (type) {
            case 0: return 'Practice';
            case 1: return 'Qualifying';
            case 2: return 'Race';
            default: return 'Sessione';
        }
    }

    closeTrackDetail() {
        const detailPanel = document.getElementById('dhTrackDetail');
        if (detailPanel) detailPanel.style.display = 'none';
    }

    renderTrackTrend(trackData) {
        const canvas = document.getElementById('dhTrendChart');
        if (!canvas) return;

        // Destroy existing chart
        if (this.trendChart) {
            this.trendChart.destroy();
        }

        // Get race best laps sorted by date
        const racePoints = trackData.raceSessions
            .map(({ session }) => {
                const best = this.getSessionBestLap(session);
                const date = session.session_info?.date_start;
                return { date, best, type: 'race' };
            })
            .filter(d => d.best && d.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Get quali best laps sorted by date
        const qualiPoints = trackData.qualiSessions
            .map(({ session }) => {
                const best = this.getSessionBestLap(session);
                const date = session.session_info?.date_start;
                return { date, best, type: 'quali' };
            })
            .filter(d => d.best && d.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Merge all points for labels
        const allPoints = [...racePoints, ...qualiPoints].sort((a, b) => new Date(a.date) - new Date(b.date));

        if (allPoints.length === 0) return;

        // Create unique labels
        const labels = allPoints.map(d => new Date(d.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }));
        const uniqueLabels = [...new Set(labels)];

        // Map race and quali data to labels
        const raceData = uniqueLabels.map(label => {
            const point = racePoints.find(p =>
                new Date(p.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) === label
            );
            return point ? point.best / 1000 : null;
        });

        const qualiData = uniqueLabels.map(label => {
            const point = qualiPoints.find(p =>
                new Date(p.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) === label
            );
            return point ? point.best / 1000 : null;
        });

        const tc = this.getChartColors();
        this.trendChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: uniqueLabels,
                datasets: [
                    {
                        label: 'Best Race Lap',
                        data: raceData,
                        borderColor: tc.success,
                        backgroundColor: `rgba(${tc.accentRgb}, 0.1)`,
                        fill: false,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 5,
                        pointBackgroundColor: tc.success,
                        spanGaps: true
                    },
                    {
                        label: 'Best Quali Lap',
                        data: qualiData,
                        borderColor: tc.accent,
                        backgroundColor: `rgba(${tc.accentRgb}, 0.1)`,
                        fill: false,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 5,
                        pointBackgroundColor: tc.accent,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${this.formatLapTime(ctx.raw * 1000)}`
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#71717a',
                            callback: v => {
                                const mins = Math.floor(v / 60);
                                const secs = (v % 60).toFixed(0);
                                return `${mins}:${secs.padStart(2, '0')}`;
                            }
                        },
                        reverse: false
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#a1a1aa' }
                    }
                }
            }
        });
    }

    getSessionBestLap(session) {
        let best = Infinity;
        session.stints?.forEach(stint => {
            stint.laps?.forEach(lap => {
                if (lap.is_valid && lap.lap_time_ms > 0 && lap.lap_time_ms < best) {
                    best = lap.lap_time_ms;
                }
            });
        });
        return best < Infinity ? best : null;
    }

    openSessionFromHistory(sessionIndex) {
        this.hideDriverHistory();
        this.openSession(sessionIndex);
    }

    getSessionTypeName(type) {
        const types = {
            0: 'Practice',
            1: 'Qualifying',
            2: 'Race',
            3: 'Hotlap',
            4: 'Time Attack',
            5: 'Drift',
            6: 'Drag'
        };
        return types[type] || 'Practice';
    }

    // Convert track ID to display name
    getTrackDisplayName(trackId) {
        const trackNames = {
            'barcelona': 'Barcelona-Catalunya',
            'brands_hatch': 'Brands Hatch',
            'cota': 'Circuit of the Americas',
            'donington': 'Donington Park',
            'hungaroring': 'Hungaroring',
            'imola': 'Imola',
            'indianapolis': 'Indianapolis',
            'kyalami': 'Kyalami',
            'laguna_seca': 'Laguna Seca',
            'misano': 'Misano',
            'monza': 'Monza',
            'mount_panorama': 'Mount Panorama',
            'nurburgring': 'Nürburgring GP',
            'nurburgring_24h': 'Nürburgring 24h',
            'oulton_park': 'Oulton Park',
            'paul_ricard': 'Paul Ricard',
            'silverstone': 'Silverstone',
            'snetterton': 'Snetterton',
            'spa': 'Spa-Francorchamps',
            'suzuka': 'Suzuka',
            'valencia': 'Valencia',
            'watkins_glen': 'Watkins Glen',
            'zandvoort': 'Zandvoort',
            'zolder': 'Zolder'
        };
        // Try exact match first
        if (trackNames[trackId?.toLowerCase()]) {
            return trackNames[trackId.toLowerCase()];
        }
        // Try partial match
        for (const [key, name] of Object.entries(trackNames)) {
            if (trackId?.toLowerCase().includes(key)) {
                return name;
            }
        }
        // Return original if no match
        return trackId || 'Unknown Track';
    }

    // ===== LOGIN / REGISTER METHODS =====

    showLogin() {
        // Hide all other views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        // Show login view
        const loginView = document.getElementById('login-view');
        if (loginView) {
            loginView.classList.add('active');
        }

        // Reset to login tab
        this.switchLoginTab('login');

        // Enable back mode for nav tabs (shows "TORNA ALLA DASHBOARD" button)
        const navTabs = document.querySelector('.nav-tabs');
        if (navTabs) {
            navTabs.classList.add('nav-back-mode');
        }

        // Hide action buttons (CARICA, IMPORTA, STORICO)
        document.querySelectorAll('.header-controls button:not(.btn-login)').forEach(btn => {
            btn.style.display = 'none';
        });

        // Hide file inputs
        document.querySelectorAll('.header-controls input[type="file"]').forEach(input => {
            input.style.display = 'none';
        });
    }

    closeLogin() {
        // Hide login view
        const loginView = document.getElementById('login-view');
        if (loginView) {
            loginView.classList.remove('active');
        }

        // Show overview view
        const overviewView = document.getElementById('overview-view');
        if (overviewView) {
            overviewView.classList.add('active');
        }

        // Restore nav tabs (remove back mode)
        const navTabs = document.querySelector('.nav-tabs');
        if (navTabs) {
            navTabs.classList.remove('nav-back-mode');
        }

        // Restore action buttons
        document.querySelectorAll('.header-controls button:not(.btn-login)').forEach(btn => {
            btn.style.display = '';
        });

        // Restore file inputs (they stay hidden by default)
        document.querySelectorAll('.header-controls input[type="file"]').forEach(input => {
            input.style.display = 'none'; // Keep them hidden
        });

        // Reset forms
        document.getElementById('loginForm')?.reset();
        document.getElementById('registerForm')?.reset();

        // Reset to login tab and switch to overview
        this.switchTab('overview');
        setTimeout(() => {
            this.switchLoginTab('login');
        }, 300);
    }

    switchLoginTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.login-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update form containers
        const loginContainer = document.getElementById('login-form-container');
        const registerContainer = document.getElementById('register-form-container');
        const successContainer = document.getElementById('login-success-container');

        if (tab === 'login') {
            loginContainer?.classList.add('active');
            registerContainer?.classList.remove('active');
            successContainer?.classList.remove('active');
        } else if (tab === 'register') {
            loginContainer?.classList.remove('active');
            registerContainer?.classList.add('active');
            successContainer?.classList.remove('active');
        }
    }

    // switchLoginTab moved/renamed to match new tab structure

    showSuccessScreen(welcomeMessage = 'Benvenuto!') {
        // Hide login/register forms
        const loginContainer = document.getElementById('login-form-container');
        const registerContainer = document.getElementById('register-form-container');
        const successContainer = document.getElementById('login-success-container');

        loginContainer?.classList.remove('active');
        registerContainer?.classList.remove('active');
        successContainer?.classList.add('active');

        // Update welcome message if element exists
        const titleElement = successContainer?.querySelector('.login-title');
        if (titleElement) {
            titleElement.textContent = welcomeMessage;
        }

        // Auto-close after 3 seconds (optional)
        setTimeout(() => {
            // Uncomment to auto-redirect to dashboard
            // this.closeLogin();
        }, 3000);
    }

    showLoginSuccess(userName = null) {
        // This method is called from login.js after successful Firebase authentication
        const message = userName ? `Benvenuto, ${userName}!` : 'Accesso Effettuato!';
        this.showSuccessScreen(message);
    }

    onAuthStateChanged(user) {
        // This method is called from firebase-auth.js when auth state changes
        // Used to persist login state across page reloads
        if (user) {
            console.log('Dashboard: User authenticated:', user.email);
            // User is logged in - UI already updated by firebase-auth.js
            this.currentUser = user;
        } else {
            console.log('Dashboard: User logged out');
            this.currentUser = null;
        }
    }

    // ========== FIRESTORE JSON UPLOAD ==========
    async handleJSONFirestoreUpload(event) {
        const files = event.target.files;

        // CRITICAL: Check auth.currentUser directly (guaranteed to be current)
        if (!auth.currentUser) {
            console.warn('⚠️ Utente non loggato (auth.currentUser is null)');
            alert('Devi effettuare il login per caricare sessioni.');
            return;
        }

        // Check if files selected
        if (!files || files.length === 0) {
            console.log('Nessun file selezionato');
            return;
        }

        // Use auth.currentUser.uid ALWAYS (never this.currentUser which might be stale)
        const uid = auth.currentUser.uid;
        console.log(`📤 Upload Firestore for UID: ${uid}, files: ${files.length}`);

        const results = [];
        let newSessionsAdded = 0;

        // Sequential upload with await
        for (const file of files) {
            console.log(`⏳ Elaborazione: ${file.name}`);

            // 1. Upload to Firestore (returns rawData for immediate display)
            const result = await firestoreUpload(file, uid);
            results.push(result);

            // 2. If upload successful, use rawObj from result for immediate display
            if (result.status === 'ok' && result.rawObj) {
                const data = result.rawObj;

                // Attach metadata to rawObj for dedup
                data.__sessionId = result.sessionId;
                data.__fileHash = result.fileHash;
                data.__fileName = result.fileName;

                // Validate session structure
                if (this.validateSessionData(data)) {
                    // ROBUST dedup: check by fileHash or sessionId (NOT track/date!)
                    const exists = this.sessions.some(s =>
                        s.__fileHash === result.fileHash || s.__sessionId === result.sessionId
                    );
                    if (!exists) {
                        this.sessions.push(data);
                        newSessionsAdded++;
                        console.log(`✅ Caricato: ${result.fileName} (ID: ${result.sessionId})`);
                    } else {
                        console.log(`✅ Già presente localmente: ${result.fileName}`);
                    }
                } else {
                    console.warn(`⚠️ File non valido per dashboard: ${result.fileName}`);
                }
            } else if (result.status === 'duplicate') {
                console.log(`⚠️ Duplicato Firestore: ${result.fileName}`);
            } else if (result.status === 'error') {
                console.error(`❌ Errore: ${result.fileName} - ${result.error}`);
            }
        }

        // Summary log
        const ok = results.filter(r => r.status === 'ok').length;
        const dup = results.filter(r => r.status === 'duplicate').length;
        const err = results.filter(r => r.status === 'error').length;
        console.log(`\n📊 Riepilogo: ${ok} caricati, ${dup} duplicati, ${err} errori`);
        console.log(`📊 Nuove sessioni aggiunte alla dashboard: ${newSessionsAdded}`);

        // Clear input for next upload
        event.target.value = '';

        // 3. Update dashboard if new sessions were added
        if (newSessionsAdded > 0) {
            console.log('🔄 Aggiornamento dashboard...');
            this.updateDashboard();
        }

        return results;
    }

    // ========== AUTH BOOTSTRAP & FORMS ==========
    // ========== LOAD SESSIONS FROM FIRESTORE ==========
    async loadUserSessionsFromFirestore() {
        if (!this.currentUser) {
            console.log('⚠️ No user, clearing sessions');
            this.sessions = [];
            this.currentSession = null;
            this.updateDashboard();
            return;
        }

        console.log('📥 Loading sessions from Firestore for:', this.currentUser.uid);
        const data = await fetchAllSessionsRaw(this.currentUser.uid);

        // Filter only valid sessions with session_info
        this.sessions = data.filter(s => s && s.session_info);
        this.currentSession = this.sessions[0] ?? null;

        console.log(`✅ Loaded ${this.sessions.length} valid sessions`);
        this.updateDashboard();
    }

    async bootstrapApp(user) {
        console.log('🚀 Bootstrapping app for user:', user.email, 'UID:', user.uid);

        // CRITICAL: Reset state first (no riuso from previous user)
        this.sessions = [];
        this.currentUser = user;

        // Show loading state
        this.setUIState('loading');

        try {
            // 1. Load sessions using new chunked fetch
            await this.loadUserSessionsFromFirestore();

            // Debug dump
            this.debugDump();



            // 4. Show app (dashboard)
            this.setUIState('app');

            // 5. Show registration success message if user just registered
            if (this.registrationJustCompleted) {
                this.registrationJustCompleted = false;
                setTimeout(() => {
                    alert('✅ Registrazione completata! Benvenuto, ' + user.email.split('@')[0] + '!');
                }, 300);
            }

        } catch (error) {
            console.error('❌ Bootstrap error:', error);
            // On error, return to auth state
            this.currentUser = null;
            this.sessions = [];
            this.setUIState('auth');
            alert('Errore caricamento dati: ' + error.message);
        }
    }



    initAuthForms() {
        console.log('🔐 Initializing auth forms...');

        // ===== HELPER FUNCTIONS =====

        // Map Firebase error codes to user-friendly messages
        const mapFirebaseAuthError = (errorCode) => {
            const errorMap = {
                'auth/invalid-credential': 'Email o password non corretti.',
                'auth/invalid-email': 'Email non valida.',
                'auth/user-not-found': 'Email o password non corretti.',
                'auth/wrong-password': 'Email o password non corretti.',
                'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
                'auth/network-request-failed': 'Problema di rete. Controlla la connessione e riprova.',
                'auth/email-already-in-use': 'Questa email è già registrata.',
                'auth/weak-password': 'Password troppo debole (minimo 6 caratteri).',
                'auth/user-disabled': 'Questo account è stato disabilitato.',
                'auth/operation-not-allowed': 'Operazione non consentita.'
            };
            return errorMap[errorCode] || 'Errore durante l\'operazione. Riprova.';
        };

        // Show error message
        const showError = (formType, message) => {
            const errorEl = document.getElementById(formType + 'Error');
            if (errorEl) {
                errorEl.textContent = message;
                errorEl.classList.add('is-visible');
            }
        };

        // Clear error message
        const clearError = (formType) => {
            const errorEl = document.getElementById(formType + 'Error');
            if (errorEl) {
                errorEl.classList.remove('is-visible');
                errorEl.textContent = '';
            }
            // Remove input error styles
            const panel = document.getElementById(formType + 'Panel');
            if (panel) {
                panel.querySelectorAll('.form-input').forEach(input => {
                    input.classList.remove('has-error');
                });
            }
        };

        // Set loading state on button
        const setLoading = (buttonId, isLoading, loadingText = 'Accesso...') => {
            const btn = document.getElementById(buttonId);
            if (!btn) return;

            if (isLoading) {
                btn._originalText = btn.textContent;
                btn.textContent = loadingText;
                btn.classList.add('is-loading');
            } else {
                btn.textContent = btn._originalText || 'ACCEDI';
                btn.classList.remove('is-loading');
            }
        };

        // Mark input as having error
        const markInputError = (inputId) => {
            const input = document.getElementById(inputId);
            if (input) input.classList.add('has-error');
        };

        // ===== TAB SWITCHING =====
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.target.dataset.tab;

                // Clear errors when switching tabs
                clearError('login');
                clearError('register');

                // Update tabs
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                // Update panels
                document.querySelectorAll('.auth-form-panel').forEach(p => p.classList.remove('active'));
                document.getElementById(targetTab + 'Panel').classList.add('active');
            });
        });

        // ===== CLEAR ERRORS ON INPUT =====
        ['authLoginEmail', 'authLoginPassword'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => clearError('login'));
        });
        ['authRegisterEmail', 'authRegisterPassword', 'authRegisterConfirm'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => clearError('register'));
        });

        // ===== LOGIN HANDLER =====
        document.getElementById('authLoginBtn')?.addEventListener('click', async () => {
            clearError('login');

            const email = document.getElementById('authLoginEmail').value.trim();
            const password = document.getElementById('authLoginPassword').value;

            // Client-side validation
            if (!email) {
                markInputError('authLoginEmail');
                showError('login', 'Inserisci la tua email.');
                return;
            }
            if (!password) {
                markInputError('authLoginPassword');
                showError('login', 'Inserisci la password.');
                return;
            }

            setLoading('authLoginBtn', true, 'Accesso...');

            try {
                if (!auth) {
                    const module = await import('./firebase-auth.js');
                    auth = module.auth;
                }
                const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js");

                await signInWithEmailAndPassword(auth, email, password);
                // onAuthStateChanged will handle UI transition
                console.log('✅ Login successful, auth state will trigger bootstrap');

            } catch (error) {
                console.error('Login error:', error.code, error.message);
                const userMessage = mapFirebaseAuthError(error.code);
                showError('login', userMessage);
                setLoading('authLoginBtn', false);
            }
        });

        // ===== REGISTER HANDLER =====
        document.getElementById('authRegisterBtn')?.addEventListener('click', async () => {
            clearError('register');

            const email = document.getElementById('authRegisterEmail').value.trim();
            const password = document.getElementById('authRegisterPassword').value;
            const confirm = document.getElementById('authRegisterConfirm').value;

            // Client-side validation
            if (!email) {
                markInputError('authRegisterEmail');
                showError('register', 'Inserisci la tua email.');
                return;
            }
            if (!password) {
                markInputError('authRegisterPassword');
                showError('register', 'Inserisci una password.');
                return;
            }
            if (password.length < 6) {
                markInputError('authRegisterPassword');
                showError('register', 'La password deve essere di almeno 6 caratteri.');
                return;
            }
            if (!confirm) {
                markInputError('authRegisterConfirm');
                showError('register', 'Conferma la password.');
                return;
            }
            if (password !== confirm) {
                markInputError('authRegisterPassword');
                markInputError('authRegisterConfirm');
                showError('register', 'Le password non coincidono.');
                return;
            }

            setLoading('authRegisterBtn', true, 'Registrazione...');

            try {
                if (!auth) {
                    const module = await import('./firebase-auth.js');
                    auth = module.auth;
                }
                const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js");

                await createUserWithEmailAndPassword(auth, email, password);
                this.registrationJustCompleted = true;
                // onAuthStateChanged will handle UI transition
                console.log('✅ Registration successful, auth state will trigger bootstrap');

            } catch (error) {
                console.error('Register error:', error.code, error.message);
                const userMessage = mapFirebaseAuthError(error.code);
                showError('register', userMessage);
                setLoading('authRegisterBtn', false);
            }
        });

        // ===== RESET PASSWORD HANDLER =====
        document.getElementById('authResetBtn')?.addEventListener('click', async () => {
            const email = document.getElementById('authLoginEmail').value.trim();

            if (!email) {
                showError('login', 'Inserisci la tua email per il reset password.');
                markInputError('authLoginEmail');
                return;
            }

            setLoading('authResetBtn', true, 'Invio...');

            try {
                if (!auth) {
                    const module = await import('./firebase-auth.js');
                    auth = module.auth;
                }
                const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js");

                await sendPasswordResetEmail(auth, email);
                // Show success message in error box (green would be better but works)
                const errorEl = document.getElementById('loginError');
                if (errorEl) {
                    errorEl.textContent = '✅ Email di reset inviata! Controlla la tua casella.';
                    errorEl.style.background = 'rgba(34, 197, 94, 0.1)';
                    errorEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                    errorEl.style.color = 'var(--accent-success-light, #4ade80)';
                    errorEl.classList.add('is-visible');
                }

            } catch (error) {
                console.error('Reset error:', error.code, error.message);
                const userMessage = mapFirebaseAuthError(error.code);
                showError('login', userMessage);
            } finally {
                setLoading('authResetBtn', false);
            }
        });

        console.log('🔐 Auth forms initialized with UX error handling');
    }
}

// Initialize dashboard
const dashboard = new ACCDashboard();
window.dashboard = dashboard;

// Ensure splashScreen is also global
document.addEventListener('DOMContentLoaded', () => {
    if (typeof splashScreen !== 'undefined') {
        window.splashScreen = splashScreen;
    }

});
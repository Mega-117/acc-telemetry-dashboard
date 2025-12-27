// ===== ACC Telemetry Dashboard =====
// Main JavaScript Application

// ===== Splash Screen Controller =====
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
        this.sessions = [];
        this.currentSession = null;
        this.filters = {
            track: '',
            car: ''
        };
        // Lap analysis filters
        this.stintFilter = 'all';
        this.sectorFilter = 'all';

        // Sessions page variant and period
        this.sessionsVariant = 'giornate'; // 'giornate', 'timeline', 'cards'
        this.sessionsPeriod = 'all'; // 'today', 'week', 'all'
        this.charts = {}; // Store chart instances map

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadDemoData();
    }

    bindEvents() {
        // File input (singoli file)
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // Folder input (cartella intera)
        const folderInput = document.getElementById('folderInput');
        if (folderInput) {
            folderInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files);
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
        // Try to load JSON files from acc-data folder and current directory
        const sources = [
            'acc-data/', // Cartella dedicata per i dati
            ''           // Directory corrente
        ];

        for (const basePath of sources) {
            try {
                // Try to load index or known session files
                const response = await fetch(`${basePath}session_20251221_225634_Silverstone_Practice_ferrari_296_gt3.json`);
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
                // Silently continue if folder doesn't exist
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

        // Dismiss splash screen with animation
        if (splashScreen && splashScreen.isActive) {
            splashScreen.dismiss();
        }
    }

    updateDriverName() {
        let driverName = 'Pilota';
        if (this.sessions.length > 0 && this.sessions[0].static_data) {
            const firstName = this.sessions[0].static_data.playerName || '';
            const lastName = this.sessions[0].static_data.playerSurname || '';
            driverName = `${firstName} ${lastName}`.trim() || 'Pilota';
        }
        document.getElementById('driverName').textContent = driverName;
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

        // ===== ATTIVITÀ Box =====
        // 4 KPIs
        const totalMins = Math.round(stats.totalDriveTime / 60000);
        document.getElementById('weekDriveTime').textContent = totalMins;
        document.getElementById('weekSessions').textContent = stats.totalSessions;
        document.getElementById('weekDays').textContent = stats.trainingDays + '/7';
        const avgPerDay = stats.trainingDays > 0 ? Math.round(totalMins / stats.trainingDays) : 0;
        document.getElementById('weekAvgPerDay').textContent = avgPerDay;

        // Activity Chart (7 days bar chart)
        this.renderWeekActivityChart(sessions);

        // Session Types Stacked Bar + Chips
        this.renderSessionStackedBar(sessions);

        // ===== QUALITÀ Box =====
        document.getElementById('statValidPercent').textContent = stats.validPercent + '%';
        if (document.getElementById('statTotalLaps')) {
            document.getElementById('statTotalLaps').textContent = stats.validLaps + ' / ' + stats.totalLaps + ' giri';
        }

        const qualitaBar = document.getElementById('qualitaBarFill');
        if (qualitaBar) {
            qualitaBar.style.width = stats.validPercent + '%';
        }

        // DISTRIBUZIONE (donut in qualità box)
        this.updateSessionTypeDistribution(stats.sessionTypeTimes);

        // Update PISTE - chip style, max 5
        this.updateTracksChips(stats.tracks);

        // Update RITMO - dynamic chart, today on right
        this.updateRhythmChart(sessions);
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

        this.weekActivityChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: data.map((v, i) =>
                        labels[i] === 'Oggi' ? 'rgba(16, 185, 129, 0.8)' :
                            v > 0 ? 'rgba(99, 102, 241, 0.7)' : 'rgba(63, 63, 70, 0.3)'),
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
                            color: (ctx) => ctx.tick.label === 'Oggi' ? '#10b981' : '#71717a',
                            font: { size: 10, weight: (ctx) => ctx.tick.label === 'Oggi' ? 'bold' : 'normal' }
                        }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#52525b',
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
        const pct = (v) => totalTime > 0 ? Math.round(v / totalTime * 100) : 0;
        const mins = (v) => Math.round(v / 60000);

        // Update stacked bar
        var practiceW = pct(types.practice);
        var qualyW = pct(types.qualy);
        var raceW = pct(types.race);
        stackedBar.innerHTML = '<div class="stacked-segment practice" style="width:' + practiceW + '%"></div>' +
            '<div class="stacked-segment qualy" style="width:' + qualyW + '%"></div>' +
            '<div class="stacked-segment race" style="width:' + raceW + '%"></div>';

        // Update chips
        var practiceM = mins(types.practice);
        var qualyM = mins(types.qualy);
        var raceM = mins(types.race);
        chipsContainer.innerHTML = '<span class="session-chip practice">Practice ' + practiceM + ' MIN (' + counts.practice + ' SESS)</span>' +
            '<span class="session-chip qualy">Qualy ' + qualyM + ' MIN (' + counts.qualy + ' SESS)</span>' +
            '<span class="session-chip race">Race ' + raceM + ' MIN (' + counts.race + ' SESS)</span>';
    }

    updateTracksChips(tracks) {
        const container = document.getElementById('tracksChips');
        if (!container) return;

        if (tracks.length === 0) {
            container.innerHTML = '<span class="track-chip empty">Nessuna pista</span>';
            return;
        }

        const maxVisible = 5;
        const visibleTracks = tracks.slice(0, maxVisible);
        const extraCount = tracks.length - maxVisible;

        let html = visibleTracks.map(t => `<span class="track-chip">${t}</span>`).join('');
        if (extraCount > 0) {
            html += `<span class="track-chip extra">+${extraCount}</span>`;
        }
        container.innerHTML = html;
    }

    updateRhythmChart(sessions) {
        const canvas = document.getElementById('rhythmChartCanvas');
        if (!canvas) return;

        // Destroy existing chart if present
        if (this.rhythmChart) {
            this.rhythmChart.destroy();
        }

        const now = new Date();
        let periods = [];
        let xLabel = '';
        let yUnit = 'm'; // minutes per default

        if (this.viewMode === 'global') {
            const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
            const yearFilter = this.rhythmYearFilter || 'rolling';

            if (yearFilter === 'rolling') {
                // Modalità Rolling: ultimi 12 mesi
                for (let i = 11; i >= 0; i--) {
                    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    periods.push({
                        date: date,
                        label: monthNames[date.getMonth()] + (date.getFullYear() !== now.getFullYear() ? ` '${date.getFullYear().toString().slice(-2)}` : ''),
                        time: 0,
                        sessions: 0,
                        month: date.getMonth(),
                        year: date.getFullYear()
                    });
                }
            } else {
                // Modalità Anno Specifico: tutti i 12 mesi dell'anno selezionato
                const selectedYear = parseInt(yearFilter);
                for (let m = 0; m < 12; m++) {
                    periods.push({
                        date: new Date(selectedYear, m, 1),
                        label: monthNames[m],
                        time: 0,
                        sessions: 0,
                        month: m,
                        year: selectedYear
                    });
                }
            }
            xLabel = 'Mese';
            yUnit = 'h'; // ore per vista annuale

            // Aggregate session time by month
            sessions.forEach(session => {
                const sessionDate = new Date(session.session_info.date_start);
                const sessionMonth = sessionDate.getMonth();
                const sessionYear = sessionDate.getFullYear();

                periods.forEach(p => {
                    if (p.month === sessionMonth && p.year === sessionYear) {
                        p.time += session.session_info.total_drive_time_ms || 0;
                        p.sessions++;
                    }
                });
            });
        } else {
            // Modalità Week: ultimi 7 giorni
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                periods.push({
                    date: date,
                    label: i === 0 ? 'Oggi' : dayNames[date.getDay()],
                    time: 0,
                    sessions: 0
                });
            }
            xLabel = 'Giorno';

            // Aggregate session time by day
            sessions.forEach(session => {
                const sessionDate = new Date(session.session_info.date_start);
                const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

                periods.forEach(p => {
                    if (p.date.getTime() === sessionDay.getTime()) {
                        p.time += session.session_info.total_drive_time_ms || 0;
                        p.sessions++;
                    }
                });
            });
        }

        const labels = periods.map(p => p.label);
        const data = periods.map(p => {
            if (yUnit === 'h') {
                return Math.round(p.time / 3600000 * 10) / 10; // ore con 1 decimale
            }
            return Math.round(p.time / 60000); // minuti
        });
        const sessionCounts = periods.map(p => p.sessions);

        this.rhythmChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: yUnit === 'h' ? 'Ore' : 'Minuti',
                    data: data,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                    sessionCounts: sessionCounts
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
                                const value = context.raw;
                                const sessions = context.dataset.sessionCounts[context.dataIndex];
                                if (value === 0) return 'Nessuna attività';
                                const unit = yUnit === 'h' ? 'ore' : 'min';
                                return `${value}${yUnit} – ${sessions} session${sessions !== 1 ? 'i' : 'e'}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#71717a',
                            callback: (v) => v > 0 ? v + yUnit : ''
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#a1a1aa' }
                    }
                }
            }
        });
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
        if (total === 0) {
            // Draw empty ring
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = '#252533';
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            return;
        }

        const colors = ['#6366f1', '#f59e0b', '#10b981']; // practice, qualify, race
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

            // Truncate tracks list if too long
            const trackList = Array.from(day.tracks);
            let tracksStr = '';
            if (trackList.length > 3) {
                tracksStr = trackList.slice(0, 3).join(' · ') + ' + ' + (trackList.length - 3) + ' altre';
            } else {
                tracksStr = trackList.join(' · ');
            }

            const totalMins = Math.round(day.totalTime / 60000);

            visibleSessions += day.sessions.length;

            // LIVELLO 1: Header giornata
            html += '<div class="giornata-block">';
            html += '<div class="giornata-header">';
            html += '<div class="giornata-date">';
            html += '<span class="date-text">' + dateStr + '</span>';
            html += '<span class="track-name">' + tracksStr + '</span>';
            html += '</div>';
            html += '<div class="giornata-stats">' + totalMins + ' min totali<br>' + day.sessions.length + ' session' + (day.sessions.length > 1 ? 'i' : 'e') + '</div>';
            html += '</div>';
            html += '<div class="giornata-sessions">';

            // LIVELLO 2 & 3: Sessioni
            day.sessions.forEach(session => {
                const sessionIndex = this.sessions.indexOf(session);
                const type = this.getSessionTypeName(session.session_info.session_type);
                const typeClass = this.getSessionTypeClass(session.session_info.session_type);
                const car = this.formatCarName(session.session_info.car);
                const laps = session.session_info.laps_total || 0;
                const validPercent = laps > 0 ? Math.round((session.session_info.laps_valid || 0) / laps * 100) : 0;
                const bestTime = session.session_info.session_best_lap > 0 ? this.formatLapTime(session.session_info.session_best_lap) : '--:--.---';

                // Orario inizio sessione
                const sessionDate = new Date(session.session_info.date_start);
                const timeStr = sessionDate.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });

                // Griglia: [TIPO] [ORA] [PISTA·AUTO] [STATS] [CTA]
                html += '<div class="giornata-session" onclick="dashboard.openSession(' + sessionIndex + ')">';

                // Col 1: Tipo 
                html += '<div class="session-type-col">';
                html += '<span class="session-type-dot ' + typeClass + '"></span>';
                html += '<span class="session-type-label">' + type + '</span>';
                html += '</div>';

                // Col 2: Orario (separato)
                html += '<div class="session-time-col">' + timeStr + '</div>';

                // Col 3: Pista · Auto
                const track = session.session_info.track;
                html += '<div class="session-car-col"><strong>' + track + '</strong> · ' + car + '</div>';

                // Col 4: Stats (numeri tecnici)
                html += '<div class="session-metrics">';
                html += '<span class="metric">' + laps + ' giri</span>';
                html += '<span class="metric">Best <strong>' + bestTime + '</strong></span>';
                html += '<span class="metric">Puliti <strong>' + validPercent + '%</strong></span>';
                html += '</div>';

                // Col 5: CTA
                html += '<button class="session-action">Apri</button>';
                html += '</div>';
            });

            html += '</div></div>';
        });

        // Load More button
        if (hasMore) {
            const remainingDays = sortedDayKeys.length - visibleDays.length;
            html += '<div class="load-more-container">';
            html += '<button class="btn-load-more" onclick="dashboard.loadMoreDays()">Carica altri ' + remainingDays + ' giorni</button>';
            html += '<span class="sessions-count">Mostrate ' + visibleSessions + ' di ' + totalSessions + ' sessioni</span>';
            html += '</div>';
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
        // Get filtered list
        let filtered = this.sessions;
        if (this.filters.track) {
            filtered = filtered.filter(s => s.session_info.track === this.filters.track);
        }
        if (this.filters.car) {
            filtered = filtered.filter(s => s.session_info.car === this.filters.car);
        }
        filtered.sort((a, b) => new Date(b.session_info.date_start) - new Date(a.session_info.date_start));

        this.currentSession = filtered[index];
        this.renderStintsView();
        this.switchView('stints');
    }

    // ===== Session Detail View Functions =====
    renderStintsView() {
        if (!this.currentSession) return;

        const session = this.currentSession;
        const date = new Date(session.session_info.date_start);
        const dateStr = date.toLocaleDateString('it', { day: 'numeric', month: 'short', year: 'numeric' });
        const sessionType = this.getSessionTypeName(session.session_info.session_type);

        // Enable Stint tab
        const stintTab = document.getElementById('stintTab');
        if (stintTab) stintTab.classList.remove('disabled');

        // Calculate aggregated session stats
        const allLaps = session.stints.flatMap(s => s.laps);
        const { cleanLaps } = this.getCleanLaps(session);
        const validLaps = cleanLaps.filter(l => l.is_valid);
        const totalLaps = cleanLaps.length;
        const cleanPercent = totalLaps > 0 ? Math.round((validLaps.length / totalLaps) * 100) : 0;

        // 1️⃣ SESSION HEADER
        const sessionIndex = this.sessions.indexOf(session) + 1;
        const titleEl = document.getElementById('sessionTitle');
        if (titleEl) titleEl.textContent = 'SESSIONE #' + sessionIndex + ' – ' + sessionType.toUpperCase();

        const trackEl = document.getElementById('sessionTrackName');
        if (trackEl) trackEl.textContent = session.session_info.track;

        const carEl = document.getElementById('sessionCarName');
        if (carEl) carEl.textContent = this.formatCarName(session.session_info.car);

        const dateEl = document.getElementById('sessionDate');
        if (dateEl) dateEl.textContent = dateStr;

        const weatherEl = document.getElementById('sessionWeather');
        if (weatherEl) weatherEl.textContent = session.session_info.start_weather || 'Dry';

        const airEl = document.getElementById('sessionAirTemp');
        if (airEl) airEl.textContent = 'Aria ' + Math.round(session.session_info.start_air_temp || 22) + '°C';

        const roadEl = document.getElementById('sessionRoadTemp');
        if (roadEl) roadEl.textContent = 'Asfalto ' + Math.round(session.session_info.start_road_temp || 28) + '°C';

        const durationEl = document.getElementById('sessionDuration');
        const durMins = Math.round((session.session_info.total_drive_time_ms || 0) / 60000);
        if (durationEl) durationEl.textContent = 'Durata ' + (durMins >= 60 ? Math.floor(durMins / 60) + 'h ' + (durMins % 60) + 'm' : durMins + 'm');

        // 2️⃣ SESSION SUMMARY BAR
        document.getElementById('summaryDriveTime').textContent = durMins + 'm';
        document.getElementById('summaryStintCount').textContent = session.stints.length;
        document.getElementById('summaryTotalLaps').textContent = totalLaps;
        document.getElementById('summaryCleanLaps').textContent = validLaps.length;
        document.getElementById('summaryCleanPercent').textContent = cleanPercent + '%';

        // 3️⃣ STINT SELECTOR (tabs)
        this.renderStintTabs(session.stints);

        // 4️⃣ Select last stint by default (or first)
        this.selectedStintIndex = session.stints.length - 1;
        this.updateStintDisplay();

        // Populate comparison dropdowns
        this.populateComparisonSelectors(session.stints);

        // Render lap table count
        const countEl = document.getElementById('lapTableCount');
        if (countEl) countEl.textContent = '(' + totalLaps + ' giri)';
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

        // Point styling based on stint length
        const pointRadius = isLongStint ? 3 : 6;
        const pointColors = scatterData.map(d =>
            d.y === minTime ? '#10b981' : 'rgba(99, 102, 241, 0.8)'
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
                borderColor: 'rgba(99, 102, 241, 0.25)',
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

                this['sectorChart' + sector.index] = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: times,
                            backgroundColor: times.map(t => t === minTime ? '#10b981' : 'rgba(99, 102, 241, 0.6)'),
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

        this.comparisonChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Stint ' + (idxA + 1),
                        data: lapsA,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.3
                    },
                    {
                        label: 'Stint ' + (idxB + 1),
                        data: lapsB,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
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
        const colors = chartLaps.map((l, i) => {
            if (sectorFilter === 'all') {
                if (l.lap_time_ms === bestLapTime && l.is_valid) return '#22c55e'; // green best
                if (!l.is_valid) return '#ef4444'; // red invalid
                return '#6366f1'; // purple normal
            } else {
                const sectorIndex = sectorFilter === 's1' ? 0 : sectorFilter === 's2' ? 1 : 2;
                const sectorTime = getSectorTime(l, sectorIndex);
                if (sectorTime === bestTime && l.is_valid && sectorTime > 0) return '#22c55e'; // green best sector
                if (!l.is_valid) return '#ef4444'; // red invalid
                if (sectorTime === 0) return '#71717a'; // gray no data
                return '#6366f1'; // purple normal
            }
        });

        this.lapTimesChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: yAxisLabel,
                    data: data,
                    borderColor: '#6366f1',
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
}

// Initialize dashboard
const dashboard = new ACCDashboard();
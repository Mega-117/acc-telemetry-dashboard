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

        // Session Filters
        document.getElementById('trackFilter').addEventListener('change', (e) => {
            this.filters.track = e.target.value;
            this.renderSessionsList();
        });

        document.getElementById('carFilter').addEventListener('change', (e) => {
            this.filters.car = e.target.value;
            this.currentPage = 1;
            this.renderSessionsList();
        });

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

        // Update ATTIVITÀ section
        document.getElementById('statDriveTime').textContent = this.formatDurationLong(stats.totalDriveTime);
        document.getElementById('statTrainingDays').textContent = stats.trainingDays;
        document.getElementById('statSessions').textContent = stats.totalSessions;

        // Update QUALITÀ section
        document.getElementById('statValidPercent').textContent = `${stats.validPercent}%`;
        document.getElementById('statTotalLaps').textContent = `${stats.validLaps} validi / ${stats.totalLaps} totali`;

        // Update DISTRIBUZIONE
        this.updateSessionTypeDistribution(stats.sessionTypeTimes);

        // Update PISTE - chip style, max 5
        this.updateTracksChips(stats.tracks);

        // Update RITMO - dynamic chart, today on right
        this.updateRhythmChart(sessions);
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
        const radius = 30;  // Reduced for 80x80 canvas
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

        trackFilter.innerHTML = '<option value="">Tutte le Piste</option>' +
            tracks.map(t => `<option value="${t}">${t}</option>`).join('');

        carFilter.innerHTML = '<option value="">Tutte le Auto</option>' +
            cars.map(c => `<option value="${c}">${this.formatCarName(c)}</option>`).join('');
    }

    renderSessionsList() {
        const container = document.getElementById('sessionsList');
        const paginationControls = document.getElementById('paginationControls');

        // Get filter values
        let filtered = this.sessions;

        // Track filter
        if (this.filters.track) {
            filtered = filtered.filter(s => s.session_info.track === this.filters.track);
        }
        // Car filter
        if (this.filters.car) {
            filtered = filtered.filter(s => s.session_info.car === this.filters.car);
        }
        // Type filter
        if (this.filters.type) {
            filtered = filtered.filter(s => {
                const type = s.session_info.session_type;
                if (this.filters.type === 'practice') return type === 0 || type === 3 || type === 4;
                if (this.filters.type === 'qualify') return type === 1;
                if (this.filters.type === 'race') return type === 2;
                return true;
            });
        }
        // Period filter
        if (this.filters.period) {
            const now = new Date();
            filtered = filtered.filter(s => {
                const sessionDate = new Date(s.session_info.date_start);
                if (this.filters.period === 'week') {
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return sessionDate >= weekAgo;
                }
                if (this.filters.period === 'month') {
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    return sessionDate >= monthAgo;
                }
                return true;
            });
        }
        // Search filter
        if (this.filters.search) {
            const search = this.filters.search.toLowerCase();
            filtered = filtered.filter(s =>
                s.session_info.track.toLowerCase().includes(search) ||
                s.session_info.car.toLowerCase().includes(search)
            );
        }

        // Sort
        const sortBy = this.sortBy || 'date';
        if (sortBy === 'date') {
            filtered.sort((a, b) => new Date(b.session_info.date_start) - new Date(a.session_info.date_start));
        } else if (sortBy === 'bestlap') {
            filtered.sort((a, b) => (a.session_info.session_best_lap || Infinity) - (b.session_info.session_best_lap || Infinity));
        } else if (sortBy === 'duration') {
            filtered.sort((a, b) => (b.session_info.total_drive_time_ms || 0) - (a.session_info.total_drive_time_ms || 0));
        }

        // Store filtered for pagination
        this.filteredSessions = filtered;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">—</span>
                    <p>Nessuna sessione trovata</p>
                    <button class="btn btn-secondary" onclick="document.getElementById('fileInput').click()">
                        CARICA SESSIONI
                    </button>
                </div>
            `;
            if (paginationControls) paginationControls.style.display = 'none';
            return;
        }

        // Pagination logic
        const perPage = 25;
        const totalPages = Math.ceil(filtered.length / perPage);
        this.currentPage = Math.min(this.currentPage || 1, totalPages);
        const startIndex = (this.currentPage - 1) * perPage;
        const endIndex = Math.min(startIndex + perPage, filtered.length);
        const pageItems = filtered.slice(startIndex, endIndex);

        // Render premium cards
        container.innerHTML = pageItems.map((session) => {
            const date = new Date(session.session_info.date_start);
            const dateStr = date.toLocaleDateString('it', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
            const sessionType = this.getSessionTypeName(session.session_info.session_type);
            const sessionTypeClass = this.getSessionTypeClass(session.session_info.session_type);
            const duration = this.formatDuration(session.session_info.total_drive_time_ms);
            const lapsTotal = session.session_info.laps_total || 0;
            const lapsValid = session.session_info.laps_valid || 0;
            const validityPercent = lapsTotal > 0 ? Math.round((lapsValid / lapsTotal) * 100) : 0;
            const validityClass = this.getValidityClass(validityPercent);
            const bestLap = session.session_info.session_best_lap > 0
                ? this.formatLapTime(session.session_info.session_best_lap)
                : '--:--.---';
            const hasBestLap = session.session_info.session_best_lap > 0;
            const sessionIndex = this.sessions.indexOf(session);

            return `
                <div class="session-card-compact" onclick="dashboard.openSession(${sessionIndex})">
                    <div class="card-row-1">
                        <span class="card-date">${dateStr}</span>
                        <span class="card-track">${session.session_info.track}</span>
                        <span class="session-type-badge ${sessionTypeClass}">${sessionType}</span>
                        <span class="best-time ${hasBestLap ? '' : 'no-time'}">${bestLap}</span>
                    </div>
                    <div class="card-row-2">
                        <span class="card-car">${this.formatCarName(session.session_info.car)}</span>
                        <span class="card-laps"><span class="laps-label">GIRI</span> ${lapsTotal}</span>
                        <div class="validity-compact">
                            <span class="validity-label">VALIDI</span>
                            <span class="validity-text">${validityPercent}%</span>
                            <div class="validity-bar-mini">
                                <div class="validity-progress ${validityClass}" style="width: ${validityPercent}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Update pagination controls
        if (paginationControls) {
            paginationControls.style.display = totalPages > 1 ? 'flex' : 'none';
            document.getElementById('paginationCurrent').textContent = `Pagina ${this.currentPage} di ${totalPages}`;
            document.getElementById('paginationTotal').textContent = `(${filtered.length} sessioni)`;
            document.getElementById('prevPage').disabled = this.currentPage <= 1;
            document.getElementById('nextPage').disabled = this.currentPage >= totalPages;
        }
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

        // Enable Stint tab when viewing a session
        const stintTab = document.getElementById('stintTab');
        if (stintTab) {
            stintTab.classList.remove('disabled');
        }

        // Update header
        document.getElementById('sessionTrackName').textContent = session.session_info.track;
        document.getElementById('sessionTypeBadge').textContent = this.getSessionTypeName(session.session_info.session_type);
        document.getElementById('sessionCarName').textContent = this.formatCarName(session.session_info.car);
        document.getElementById('sessionDate').textContent = dateStr;

        // Calculate session statistics usando getCleanLaps
        const allLaps = session.stints.flatMap(s => s.laps);
        const { cleanLaps, excludedLaps, excludedCount } = this.getCleanLaps(session);
        const validLaps = cleanLaps.filter(l => l.is_valid);
        const bestLapTime = validLaps.length > 0 ? Math.min(...validLaps.map(l => l.lap_time_ms)) : 0;

        // Conta giri esclusi (pit-stop + pit-out)
        const excludedTotal = excludedCount.pitStop + excludedCount.pitOut;

        // Update synthesis
        document.getElementById('synthDuration').textContent = this.formatDuration(session.session_info.total_drive_time_ms);
        // Mostra "3(+2)" dove 2 = giri esclusi (pit-stop + pit-out)
        const lapsText = excludedTotal > 0 ? `${cleanLaps.length}(+${excludedTotal})` : cleanLaps.length.toString();
        document.getElementById('synthLaps').textContent = lapsText;
        document.getElementById('synthValid').textContent = `${validLaps.length}/${cleanLaps.length}`;
        document.getElementById('synthBest').textContent = bestLapTime > 0 ? this.formatLapTime(bestLapTime) : '--:--';

        // Update conditions bar
        this.updateConditionsBar(session);

        // Render stint timeline
        this.renderStintTimeline(session.stints);

        // Reset filters when opening new session
        this.stintFilter = 'all';
        this.sectorFilter = 'all';

        // Populate stint filter buttons dynamically
        this.populateStintFilterButtons();

        // Reset sector filter buttons to TUTTI active
        document.querySelectorAll('#sectorFilterGroup .filter-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sector === 'all');
        });

        // Render lap chart (solo giri puliti)
        this.renderLapChart(cleanLaps, bestLapTime);

        // Render stints compact list
        this.renderStintsCompactList(session.stints);

        // Render laps table
        this.renderLapsTable(allLaps, bestLapTime);

        // Update stats row (optimal, average, delta)
        this.updateLapStats(cleanLaps);
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

/**
 * ========================================
 * THEME MANAGER MODULE
 * ========================================
 * Handles theme switching, CSS variable access, and chart color management
 * Extracted from dashboard.js for better maintainability
 */

export class ThemeManager {
    constructor() {
        this.currentTheme = 'default';
    }

    /**
     * Initialize theme from localStorage
     */
    init() {
        const savedTheme = localStorage.getItem('acc-theme') || 'default';
        this.apply(savedTheme);

        // Set dropdown to saved theme
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.value = savedTheme;
        }

        console.log('🎨 ThemeManager initialized, theme:', savedTheme);
    }

    /**
     * Change theme and save to localStorage
     * @param {string} themeName - Theme identifier
     */
    change(themeName) {
        this.apply(themeName);
        localStorage.setItem('acc-theme', themeName);
    }

    /**
     * Apply theme to document
     * @param {string} themeName - Theme identifier
     */
    apply(themeName) {
        this.currentTheme = themeName;

        if (themeName === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', themeName);
        }
    }

    /**
     * Get current theme name
     * @returns {string} Current theme name
     */
    getCurrent() {
        return this.currentTheme;
    }

    /**
     * Helper to read CSS variable values
     * @param {string} varName - CSS variable name (with --)
     * @param {string} fallback - Fallback value if not found
     * @returns {string} CSS variable value
     */
    getCssVar(varName, fallback = '') {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue(varName).trim();
        return value || fallback;
    }

    /**
     * Get theme-aware chart colors object
     * @returns {object} Chart colors object
     */
    getChartColors() {
        return {
            // Theme accents
            accent: this.getCssVar('--theme-accent', '#6366f1'),
            accentRgb: this.getCssVar('--theme-accent-rgb', '99, 102, 241'),
            accentLight: this.getCssVar('--theme-accent-light', '#818cf8'),
            secondary: this.getCssVar('--theme-secondary', '#8b5cf6'),
            secondaryRgb: this.getCssVar('--theme-secondary-rgb', '139, 92, 246'),
            secondaryLight: this.getCssVar('--theme-secondary-light', '#a78bfa'),

            // Status colors
            success: this.getCssVar('--accent-success', '#22c55e'),
            warning: this.getCssVar('--accent-warning', '#f59e0b'),
            warningLight: this.getCssVar('--accent-warning-light', '#fbbf24'),
            danger: this.getCssVar('--accent-danger', '#ef4444'),
            info: this.getCssVar('--accent-info', '#06b6d4'),

            // Text colors
            textPrimary: this.getCssVar('--text-primary', '#ffffff'),
            textMuted: this.getCssVar('--text-muted', '#71717a'),
            textSecondary: this.getCssVar('--text-secondary', '#a1a1aa'),

            // Chart UI
            axisLabel: this.getCssVar('--chart-axis-label', '#71717a'),
            axisTick: this.getCssVar('--chart-axis-tick', '#a1a1aa'),
            axisGrid: this.getCssVar('--chart-axis-grid', 'rgba(255, 255, 255, 0.05)'),

            // Tooltip
            tooltipBg: this.getCssVar('--chart-tooltip-bg', 'rgba(15, 15, 25, 0.95)'),
            tooltipTitle: this.getCssVar('--chart-tooltip-title', '#ffffff'),
            tooltipBody: this.getCssVar('--chart-tooltip-body', '#a1a1aa'),
            tooltipBorder: this.getCssVar('--chart-tooltip-border', 'rgba(99, 102, 241, 0.3)'),

            // Chart specific
            trend: this.getCssVar('--chart-trend', '#fbbf24'),

            // Empty states
            emptyBg: this.getCssVar('--empty-bg', '#27272a'),
            emptyText: this.getCssVar('--empty-text', '#71717a'),
            emptySegment: this.getCssVar('--empty-segment', '#3f3f46'),
            ringEmpty: this.getCssVar('--ring-empty', '#252533'),

            // Legacy
            bgCard: this.getCssVar('--bg-card', '#18181b')
        };
    }

    /**
     * Get palette array for multi-item charts (bars, segments, etc.)
     * @returns {string[]} Array of color values
     */
    getChartPalette() {
        const c = this.getChartColors();
        return [c.accent, c.secondary, c.success, c.warning, c.danger, c.info, c.accentLight];
    }
}

// Export singleton instance for convenience
export const themeManager = new ThemeManager();

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// ── Quick Settings: toggle pill with a submenu link to Preferences ──────────

const DisplayTunerToggle = GObject.registerClass(
    class DisplayTunerToggle extends QuickSettings.QuickMenuToggle {
        _init(settings, openPrefs) {
            super._init({
                title: 'Display Tuner',
                iconName: 'preferences-desktop-display-symbolic',
                toggleMode: true,
            });

            // Two-way bind: GSettings ↔ toggle checked state
            settings.bind('global-enable', this, 'checked', Gio.SettingsBindFlags.DEFAULT);

            // Submenu header + shortcut to open full Preferences
            this.menu.setHeader(
                'preferences-desktop-display-symbolic',
                'Display Tuner',
                'Per-monitor dimmer & padding'
            );
            this.menu.addAction('Open Settings…', () => openPrefs());
        }
    });

// ── Quick Settings: system indicator (the pill's container) ─────────────────

const DisplayTunerIndicator = GObject.registerClass(
    class DisplayTunerIndicator extends QuickSettings.SystemIndicator {
        _init(settings, openPrefs) {
            super._init();

            // Ensure quickSettingsItems is initialised (guards against race with
            // the async _setupIndicators in GNOME 49's QuickSettings panel code)
            if (!this.quickSettingsItems)
                this.quickSettingsItems = [];

            // Small icon in the top-bar status area, visible only when enabled
            this._indicator = this._addIndicator();
            this._indicator.icon_name = 'display-brightness-symbolic';
            settings.bind('global-enable', this._indicator, 'visible', Gio.SettingsBindFlags.DEFAULT);

            const toggle = new DisplayTunerToggle(settings, openPrefs);
            this.quickSettingsItems.push(toggle);
        }
    });

// ── Main Extension ───────────────────────────────────────────────────────────

export default class ScreenPadExtension extends Extension {

    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.displaytuner');
        this._monitorWidgets = new Map();
        this._cursorInhibited = false;
        this._cursorTracker = null;
        this._cursorPosId = null;

        // Feature 2 – Quick Settings toggle (replaces standalone PanelMenu.Button)
        this._indicator = new DisplayTunerIndicator(
            this._settings,
            () => this.openPreferences()
        );
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        // Feature 1+5 – Hotkeys for brightness (OSD shown inside handler)
        Main.wm.addKeybinding(
            'shortcut-dim-up',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._adjustBrightness(5)
        );
        Main.wm.addKeybinding(
            'shortcut-dim-down',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._adjustBrightness(-5)
        );

        // Feature 5 – Hardware cursor dimming
        this._setupCursorTracking();

        // Build overlays and react to settings / monitor changes
        this._updateAllMonitors();
        this._settingsId = this._settings.connect('changed', () => this._updateAllMonitors());
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._updateAllMonitors());
    }

    // ── Feature 1: Brightness hotkey + native OSD ────────────────────────────

    _adjustBrightness(delta) {
        // Identify which monitor the pointer is currently on
        let [px, py] = global.get_pointer();
        let monitorIndex = global.display.get_monitor_index_for_rect(
            new Mtk.Rectangle({ x: px, y: py, width: 1, height: 1 })
        );
        let connector = this._getConnectorForIndex(monitorIndex);

        // Adjust brightness and persist
        let profiles = JSON.parse(this._settings.get_string('profiles') || '{}');
        let profile = profiles[connector] ?? { left: 0, right: 0, top: 0, bottom: 0, brightness: 100 };
        profile.brightness = Math.max(10, Math.min(100, profile.brightness + delta));
        profiles[connector] = profile;
        this._settings.set_string('profiles', JSON.stringify(profiles));

        // Feature 1: Native GNOME OSD popup (the translucent brightness bar)
        try {
            // Normalise 10–100 → 0.0–1.0 so the bar fills proportionally
            let level = (profile.brightness - 10) / 90;
            let icon = Gio.Icon.new_for_string('display-brightness-symbolic');
            // GNOME 49+: use showOne() for per-monitor OSD display
            Main.osdWindowManager.showOne(monitorIndex, icon, null, level);
        } catch (_) { /* OSD API unavailable – fail silently */ }
    }

    // ── Feature 5: Hardware cursor tracking & inhibition ─────────────────────

    _setupCursorTracking() {
        try {
            this._cursorTracker = Meta.CursorTracker.get_for_display(global.display);
            this._cursorPosId = this._cursorTracker.connect(
                'position-invalidated',
                this._onCursorMoved.bind(this)
            );
        } catch (e) {
            this._cursorTracker = null;
            console.warn('DisplayTuner: cursor tracking unavailable –', e.message);
        }
    }

    _onCursorMoved() {
        let [px, py] = global.get_pointer();
        let monitorIndex = global.display.get_monitor_index_for_rect(
            new Mtk.Rectangle({ x: px, y: py, width: 1, height: 1 })
        );
        let connector = this._getConnectorForIndex(monitorIndex);
        let profiles = JSON.parse(this._settings.get_string('profiles') || '{}');
        let profile = profiles[connector] ?? { brightness: 100 };
        let isDimmed = this._settings.get_boolean('global-enable') && profile.brightness < 100;

        try {
            if (isDimmed && !this._cursorInhibited) {
                // Force software cursor rendering → cursor obeys the dimmer
                global.backend.inhibit_hardware_cursors();
                this._cursorInhibited = true;
            } else if (!isDimmed && this._cursorInhibited) {
                global.backend.uninhibit_hardware_cursors();
                this._cursorInhibited = false;
            }
        } catch (_) { /* inhibit_hardware_cursors not available on this build */ }
    }

    // ── Monitor management ───────────────────────────────────────────────────

    /** Returns the hardware connector string (e.g. "HDMI-A-1") for a given
     *  layout-manager monitor index, or 'primary' as a safe fallback. */
    _getConnectorForIndex(monitorIndex) {
        let mgr = global.backend.get_monitor_manager();
        let logical = mgr ? mgr.get_logical_monitors() : [];
        let lm = logical[monitorIndex];
        if (lm) {
            let physical = lm.get_monitors();
            if (physical.length > 0) return physical[0].get_connector();
        }
        return 'primary';
    }

    _updateAllMonitors() {
        let isEnabled = this._settings.get_boolean('global-enable');
        let profiles = JSON.parse(this._settings.get_string('profiles') || '{}');
        let activeConnectors = new Set();

        let mgr = global.backend.get_monitor_manager();
        let logical = mgr ? mgr.get_logical_monitors() : [];

        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let layoutMonitor = Main.layoutManager.monitors[i];
            let logicalMonitor = logical[i];
            if (!logicalMonitor) continue;

            for (let metaMonitor of logicalMonitor.get_monitors()) {
                let connector = metaMonitor.get_connector();
                activeConnectors.add(connector);

                if (!this._monitorWidgets.has(connector))
                    this._createWidgetsForMonitor(connector);

                let profile = profiles[connector] ?? profiles['primary'] ??
                    { left: 0, right: 0, top: 0, bottom: 0, brightness: 100 };

                this._applyProfileToMonitor(
                    connector, layoutMonitor,
                    isEnabled
                        ? profile
                        : { left: 0, right: 0, top: 0, bottom: 0, brightness: 100, tintColor: '#000000' }
                );
            }
        }

        // Remove widgets for monitors that have been disconnected
        for (let [connector, widgets] of this._monitorWidgets.entries()) {
            if (!activeConnectors.has(connector)) {
                this._destroyWidgets(widgets);
                this._monitorWidgets.delete(connector);
            }
        }
    }

    _createWidgetsForMonitor(connector) {
        const marginStyle = 'background-color: black;';
        let widgets = {
            left: new St.BoxLayout({ style: marginStyle, reactive: true }),
            right: new St.BoxLayout({ style: marginStyle, reactive: true }),
            top: new St.BoxLayout({ style: marginStyle, reactive: true }),
            bottom: new St.BoxLayout({ style: marginStyle, reactive: true }),
            dimmer: new St.BoxLayout({ reactive: false }), // Feature 4: colour set dynamically
        };

        const strutParams = { affectsStruts: true, trackFullscreen: true };
        Main.layoutManager.addTopChrome(widgets.left, strutParams);
        Main.layoutManager.addTopChrome(widgets.right, strutParams);
        Main.layoutManager.addTopChrome(widgets.top, strutParams);
        Main.layoutManager.addTopChrome(widgets.bottom, strutParams);
        Main.layoutManager.addTopChrome(widgets.dimmer);

        this._monitorWidgets.set(connector, widgets);
    }

    _applyProfileToMonitor(connector, monitor, profile) {
        let w = this._monitorWidgets.get(connector);
        const anim = { duration: 300, mode: Clutter.AnimationMode.EASE_OUT_QUAD };

        // Margin boxes – smooth fluid animation
        w.left.ease({
            x: monitor.x, y: monitor.y,
            width: profile.left, height: monitor.height,
            ...anim,
        });
        w.right.ease({
            x: monitor.x + monitor.width - profile.right, y: monitor.y,
            width: profile.right, height: monitor.height,
            ...anim,
        });
        w.top.ease({
            x: monitor.x + profile.left, y: monitor.y,
            width: monitor.width - profile.left - profile.right,
            height: profile.top,
            ...anim,
        });
        w.bottom.ease({
            x: monitor.x + profile.left,
            y: monitor.y + monitor.height - profile.bottom,
            width: monitor.width - profile.left - profile.right,
            height: profile.bottom,
            ...anim,
        });

        // Feature 4: Colour-tinted dimmer overlay
        // Set the CSS background colour (can be any hex colour the user chose),
        // then animate Clutter's opacity so the tint fades in/out smoothly.
        let tintColor = profile.tintColor || '#000000';
        w.dimmer.set_style(`background-color: ${tintColor};`);
        w.dimmer.set_position(monitor.x, monitor.y);
        w.dimmer.set_size(monitor.width, monitor.height);
        w.dimmer.ease({
            opacity: Math.round(255 * (1 - profile.brightness / 100)),
            ...anim,
        });
    }

    _destroyWidgets(widgets) {
        for (let box of Object.values(widgets)) {
            if (box) {
                Main.layoutManager.removeChrome(box);
                box.destroy();
            }
        }
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────

    disable() {
        // Restore hardware cursor rendering before unloading
        if (this._cursorInhibited) {
            try { global.backend.uninhibit_hardware_cursors(); } catch (_) { }
            this._cursorInhibited = false;
        }
        if (this._cursorTracker && this._cursorPosId) {
            this._cursorTracker.disconnect(this._cursorPosId);
        }
        this._cursorTracker = null;
        this._cursorPosId = null;

        if (this._settingsId) this._settings.disconnect(this._settingsId);
        if (this._monitorsId) Main.layoutManager.disconnect(this._monitorsId);

        Main.wm.removeKeybinding('shortcut-dim-up');
        Main.wm.removeKeybinding('shortcut-dim-down');

        // Remove Quick Settings indicator and its pills
        if (this._indicator) {
            this._indicator.quickSettingsItems?.forEach(item => item.destroy());
            this._indicator.destroy();
            this._indicator = null;
        }

        // Remove all overlay widgets
        for (let widgets of this._monitorWidgets.values())
            this._destroyWidgets(widgets);
        this._monitorWidgets.clear();

        this._settings = null;
    }
}
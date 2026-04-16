import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ScreenPadExtension extends Extension {
    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.displaytuner');
        this._monitorWidgets = new Map(); // Stores the physical boxes per monitor

        // 1. Build the Top Bar Menu
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        let icon = new St.Icon({ icon_name: 'preferences-desktop-display-symbolic', style_class: 'system-status-icon' });
        this._indicator.add_child(icon);

        // Add a master toggle switch to the menu
        this._toggleItem = new PopupMenu.PopupSwitchMenuItem('Enable Padding & Dimming', this._settings.get_boolean('global-enable'));
        this._toggleItem.connect('toggled', (item, state) => {
            this._settings.set_boolean('global-enable', state);
        });
        this._indicator.menu.addMenuItem(this._toggleItem);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Add a quick settings button
        let settingsItem = new PopupMenu.PopupMenuItem('Open Advanced Settings');
        settingsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(settingsItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // 2. Global Hotkeys for Brightness
        Main.wm.addKeybinding('shortcut-dim-up', this._settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, () => this._adjustBrightness(5));
        Main.wm.addKeybinding('shortcut-dim-down', this._settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, () => this._adjustBrightness(-5));

        // 3. Listeners
        this._updateAllMonitors();
        this._settingsId = this._settings.connect('changed', () => this._updateAllMonitors());
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._updateAllMonitors());
    }

    _adjustBrightness(delta) {
        // Find which monitor the mouse is currently on
        let mousePos = global.get_pointer();
        let monitorIndex = global.display.get_monitor_index_for_rect(new Meta.Rectangle({ x: mousePos[0], y: mousePos[1], width: 1, height: 1 }));
        
        // Match it to the hardware manager via the BACKEND
        let monitorManager = global.backend.get_monitor_manager();
        let logicalMonitors = monitorManager ? monitorManager.get_logical_monitors() : [];
        let logicalMonitor = logicalMonitors[monitorIndex];
        
        // Safely extract the connector name
        let connector = 'primary';
        if (logicalMonitor) {
            let physicalMonitors = logicalMonitor.get_monitors();
            if (physicalMonitors.length > 0) {
                connector = physicalMonitors[0].get_connector();
            }
        }

        // Load profiles and adjust the specific monitor
        let profiles = JSON.parse(this._settings.get_string('profiles') || '{}');
        let profile = profiles[connector] || { left: 0, right: 0, top: 0, bottom: 0, brightness: 100 };
        
        profile.brightness = Math.max(10, Math.min(100, profile.brightness + delta)); // Clamp 10-100
        profiles[connector] = profile;
        
        this._settings.set_string('profiles', JSON.stringify(profiles));
    }

    _updateAllMonitors() {
        let isEnabled = this._settings.get_boolean('global-enable');
        if (this._toggleItem) {
            this._toggleItem.setToggleState(isEnabled);
        }

        let profiles = JSON.parse(this._settings.get_string('profiles') || '{}');
        let activeConnectors = new Set();

        // 1. Get the actual hardware Monitor Manager via the BACKEND
        let monitorManager = global.backend.get_monitor_manager();
        let logicalMonitors = monitorManager ? monitorManager.get_logical_monitors() : [];

        // 2. Loop through layout manager monitors and match them
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let layoutMonitor = Main.layoutManager.monitors[i];
            let logicalMonitor = logicalMonitors[i];

            if (!logicalMonitor) continue;

            // Get the hardware connector string (e.g., "HDMI-A-1")
            let physicalMonitors = logicalMonitor.get_monitors();
            for (let metaMonitor of physicalMonitors) {
                let connector = metaMonitor.get_connector();
                activeConnectors.add(connector);

                // Initialize boxes for this monitor if they don't exist
                if (!this._monitorWidgets.has(connector)) {
                    this._createWidgetsForMonitor(connector);
                }

                // Fetch its specific profile
                let profile = profiles[connector] || profiles['primary'] || { left: 0, right: 0, top: 0, bottom: 0, brightness: 100 };

                // Apply values (or zero out if disabled)
                this._applyProfileToMonitor(connector, layoutMonitor, isEnabled ? profile : { left: 0, right: 0, top: 0, bottom: 0, brightness: 100 });
            }
        }

        // Cleanup disconnected monitors
        for (let [connector, widgets] of this._monitorWidgets.entries()) {
            if (!activeConnectors.has(connector)) {
                this._destroyWidgets(widgets);
                this._monitorWidgets.delete(connector);
            }
        }
    }

    _createWidgetsForMonitor(connector) {
        const style = 'background-color: black;';
        let widgets = {
            left: new St.BoxLayout({ style: style, reactive: true }),
            right: new St.BoxLayout({ style: style, reactive: true }),
            top: new St.BoxLayout({ style: style, reactive: true }),
            bottom: new St.BoxLayout({ style: style, reactive: true }),
            dimmer: new St.BoxLayout({ style: style, reactive: false })
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
        const animParams = { duration: 300, mode: Clutter.AnimationMode.EASE_OUT_QUAD }; // Smooth fluid animations!

        // Smoothly animate Left box
        w.left.ease({ x: monitor.x, y: monitor.y, width: profile.left, height: monitor.height, ...animParams });
        
        // Smoothly animate Right box
        w.right.ease({ x: monitor.x + monitor.width - profile.right, y: monitor.y, width: profile.right, height: monitor.height, ...animParams });

        // Smoothly animate Top box
        w.top.ease({ x: monitor.x + profile.left, y: monitor.y, width: monitor.width - profile.left - profile.right, height: profile.top, ...animParams });

        // Smoothly animate Bottom box
        w.bottom.ease({ x: monitor.x + profile.left, y: monitor.y + monitor.height - profile.bottom, width: monitor.width - profile.left - profile.right, height: profile.bottom, ...animParams });

        // Smoothly animate Dimmer opacity
        let opacity = Math.round(255 * (1 - (profile.brightness / 100)));
        w.dimmer.set_position(monitor.x, monitor.y);
        w.dimmer.set_size(monitor.width, monitor.height);
        w.dimmer.ease({ opacity: opacity, ...animParams });
    }

    _destroyWidgets(widgets) {
        Object.values(widgets).forEach(box => {
            if (box) {
                Main.layoutManager.removeChrome(box);
                box.destroy();
            }
        });
    }

    disable() {
        if (this._settingsId) this._settings.disconnect(this._settingsId);
        if (this._monitorsId) Main.layoutManager.disconnect(this._monitorsId);
        
        Main.wm.removeKeybinding('shortcut-dim-up');
        Main.wm.removeKeybinding('shortcut-dim-down');

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        for (let widgets of this._monitorWidgets.values()) {
            this._destroyWidgets(widgets);
        }
        this._monitorWidgets.clear();
        this._settings = null;
    }
}
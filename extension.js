import St from 'gi://St';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ScreenPadExtension extends Extension {
    enable() {
        // 1. Setup the Top Bar Indicator
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        let icon = new St.Icon({
            icon_name: 'preferences-desktop-display-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // 2. Connect to Database
        this._settings = this.getSettings('org.gnome.shell.extensions.screenpadding');

        // 3. Create Padding Boxes (reactive: true blocks windows from going under them)
        const style = 'background-color: black;';
        this._padLeft = new St.BoxLayout({ style: style, reactive: true });
        this._padRight = new St.BoxLayout({ style: style, reactive: true });
        this._padTop = new St.BoxLayout({ style: style, reactive: true });
        this._padBottom = new St.BoxLayout({ style: style, reactive: true });

        // 4. Create Dimmer Box (reactive: false lets mouse clicks pass through!)
        this._dimmer = new St.BoxLayout({ style: style, reactive: false });

        // 5. Add padding to screen WITH Strut parameters
        const strutParams = { affectsStruts: true, trackFullscreen: true };
        Main.layoutManager.addTopChrome(this._padLeft, strutParams);
        Main.layoutManager.addTopChrome(this._padRight, strutParams);
        Main.layoutManager.addTopChrome(this._padTop, strutParams);
        Main.layoutManager.addTopChrome(this._padBottom, strutParams);

        // Add dimmer to screen WITHOUT Strut parameters (it shouldn't shrink the work area)
        Main.layoutManager.addTopChrome(this._dimmer);

        // 6. Initial apply and listeners
        this._updatePadding();
        this._settingsChangedId = this._settings.connect('changed', () => this._updatePadding());
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._updatePadding());
    }

    _updatePadding() {
        // 1. Read the EXACT connector string we saved
        let targetConnector = this._settings.get_string('target-connector');
        let monitor = Main.layoutManager.primaryMonitor; // Default fallback

        // 2. Search Mutter for the matching physical connector
        if (targetConnector !== 'primary') {
            for (let logicalMonitor of Main.layoutManager.monitors) {
                let metaMonitors = logicalMonitor.get_monitors();
                for (let metaMonitor of metaMonitors) {
                    if (metaMonitor.get_connector() === targetConnector) {
                        monitor = logicalMonitor;
                        break;
                    }
                }
            }
        }
        
        // Fetch values
        let left = this._settings.get_int('padding-left');
        let right = this._settings.get_int('padding-right');
        let top = this._settings.get_int('padding-top');
        let bottom = this._settings.get_int('padding-bottom');
        let brightness = this._settings.get_int('brightness');

        // Apply Left
        this._padLeft.set_position(monitor.x, monitor.y);
        this._padLeft.set_size(left, monitor.height);

        // Apply Right
        this._padRight.set_position(monitor.x + monitor.width - right, monitor.y);
        this._padRight.set_size(right, monitor.height);

        // Apply Top 
        this._padTop.set_position(monitor.x + left, monitor.y);
        this._padTop.set_size(monitor.width - left - right, top);

        // Apply Bottom 
        this._padBottom.set_position(monitor.x + left, monitor.y + monitor.height - bottom);
        this._padBottom.set_size(monitor.width - left - right, bottom);

        // Apply Dimmer
        let opacity = Math.round(255 * (1 - (brightness / 100)));
        this._dimmer.set_position(monitor.x, monitor.y);
        this._dimmer.set_size(monitor.width, monitor.height);
        this._dimmer.set_opacity(opacity);
    }

    disable() {
        // Disconnect listeners
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        // Clean up UI
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        const boxes = [this._padLeft, this._padRight, this._padTop, this._padBottom, this._dimmer];
        boxes.forEach(box => {
            if (box) {
                Main.layoutManager.removeChrome(box);
                box.destroy();
            }
        });
        
        this._padLeft = null;
        this._padRight = null;
        this._padTop = null;
        this._padBottom = null;
        this._dimmer = null;
        this._settings = null;
    }
}
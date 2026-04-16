import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScreenPadPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.screenpadding');

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ 
            title: 'Screen Controls',
            description: 'Adjust physical padding and software brightness per monitor.'
        });
        page.add(group);

        // ==========================================
        // DYNAMIC MONITOR DETECTION (FIXED)
        // ==========================================
        let monitorNames = ['Primary Monitor']; 
        let monitorConnectors = ['primary'];
        
        const display = Gdk.Display.get_default();
        if (display) {
            const monitors = display.get_monitors();
            for (let i = 0; i < monitors.get_n_items(); i++) {
                const monitor = monitors.get_item(i);
                const model = monitor.get_model() || '';
                const connector = monitor.get_connector() || `Unknown-${i}`;
                
                let displayName = `Display ${i + 1}`;
                
                // Clean up ugly hex names for internal laptop panels
                if (model.startsWith('0x')) {
                    displayName = `Built-in Display (${connector})`;
                } else if (model && connector) {
                    displayName = `${model} (${connector})`;
                } else if (connector) {
                    displayName = `Monitor on ${connector}`;
                }
                
                monitorNames.push(displayName);
                monitorConnectors.push(connector);
            }
        }

        const monitorModel = Gtk.StringList.new(monitorNames);
        const monitorRow = new Adw.ComboRow({
            title: 'Target Monitor',
            model: monitorModel,
        });
        
        // Match the UI to the saved database string
        let savedConnector = settings.get_string('target-connector');
        let selectedIndex = monitorConnectors.indexOf(savedConnector);
        if (selectedIndex !== -1) {
            monitorRow.set_selected(selectedIndex);
        }

        // Save the string to the database when user changes the dropdown
        monitorRow.connect('notify::selected', () => {
            let newIndex = monitorRow.get_selected();
            settings.set_string('target-connector', monitorConnectors[newIndex]);
        });
        
        group.add(monitorRow);

        // ==========================================
        // SLIDERS
        // ==========================================
        const brightnessRow = new Adw.SpinRow({
            title: 'Software Brightness (%)',
            subtitle: 'Artificially dim the screen if hardware controls are locked.',
            adjustment: new Gtk.Adjustment({ lower: 10, upper: 100, step_increment: 5 })
        });
        settings.bind('brightness', brightnessRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(brightnessRow);

        const createRow = (title, settingsKey) => {
            const row = new Adw.SpinRow({
                title: title,
                adjustment: new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 10 })
            });
            settings.bind(settingsKey, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            return row;
        };

        group.add(createRow('Left Margin', 'padding-left'));
        group.add(createRow('Right Margin', 'padding-right'));
        group.add(createRow('Top Margin', 'padding-top'));
        group.add(createRow('Bottom Margin', 'padding-bottom'));

        window.add(page);
    }
}
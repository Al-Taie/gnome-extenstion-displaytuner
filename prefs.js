import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScreenPadPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.settings = this.getSettings('org.gnome.shell.extensions.displaytuner');

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ 
            title: 'Screen Controls',
            description: 'Profiles are saved independently for each monitor you connect.'
        });
        page.add(group);

        // 1. Dynamic Monitor Detection
        let monitorNames = ['Primary Monitor']; 
        this.monitorConnectors = ['primary'];
        
        const display = Gdk.Display.get_default();
        if (display) {
            const monitors = display.get_monitors();
            for (let i = 0; i < monitors.get_n_items(); i++) {
                const monitor = monitors.get_item(i);
                const model = monitor.get_model() || '';
                const connector = monitor.get_connector() || `Unknown-${i}`;
                
                let displayName = `Display ${i + 1}`;
                if (model.startsWith('0x')) {
                    displayName = `Built-in Display (${connector})`;
                } else if (model && connector) {
                    displayName = `${model} (${connector})`;
                } else if (connector) {
                    displayName = `Monitor on ${connector}`;
                }
                
                monitorNames.push(displayName);
                this.monitorConnectors.push(connector);
            }
        }

        const monitorModel = Gtk.StringList.new(monitorNames);
        this.monitorRow = new Adw.ComboRow({ title: 'Target Monitor', model: monitorModel });
        group.add(this.monitorRow);

        // 2. Create the UI Sliders (Unbound for now)
        this.sliders = {};
        const createRow = (id, title, subtitle, min, max, step) => {
            const row = new Adw.SpinRow({
                title: title, subtitle: subtitle,
                adjustment: new Gtk.Adjustment({ lower: min, upper: max, step_increment: step })
            });
            
            // When user moves a slider, save to JSON
            row.connect('notify::value', () => this._saveCurrentProfile());
            this.sliders[id] = row;
            group.add(row);
        };

        createRow('brightness', 'Software Brightness (%)', 'Global Hotkey: Super+Shift+Up/Down', 10, 100, 5);
        createRow('left', 'Left Margin', '', 0, 1000, 10);
        createRow('right', 'Right Margin', '', 0, 1000, 10);
        createRow('top', 'Top Margin', '', 0, 1000, 10);
        createRow('bottom', 'Bottom Margin', '', 0, 1000, 10);

        // 3. Connect the Dropdown Logic
        this.monitorRow.connect('notify::selected', () => {
            let selectedIndex = this.monitorRow.get_selected();
            this.settings.set_string('target-connector', this.monitorConnectors[selectedIndex]);
            this._loadCurrentProfile();
        });

        // Initial Load
        let savedConnector = this.settings.get_string('target-connector');
        let index = this.monitorConnectors.indexOf(savedConnector);
        if (index !== -1) this.monitorRow.set_selected(index);
        this._loadCurrentProfile();

        window.add(page);
    }

    _loadCurrentProfile() {
        // Stop saving while we are updating the UI programmatically
        this._isUpdatingUI = true; 
        
        let connector = this.settings.get_string('target-connector');
        let profiles = JSON.parse(this.settings.get_string('profiles') || '{}');
        
        // Default values if monitor has never been configured
        let profile = profiles[connector] || { left: 0, right: 0, top: 0, bottom: 0, brightness: 100 };

        this.sliders['left'].set_value(profile.left);
        this.sliders['right'].set_value(profile.right);
        this.sliders['top'].set_value(profile.top);
        this.sliders['bottom'].set_value(profile.bottom);
        this.sliders['brightness'].set_value(profile.brightness);
        
        this._isUpdatingUI = false;
    }

    _saveCurrentProfile() {
        if (this._isUpdatingUI) return; // Prevent infinite loops
        
        let connector = this.settings.get_string('target-connector');
        let profiles = JSON.parse(this.settings.get_string('profiles') || '{}');
        
        profiles[connector] = {
            left: this.sliders['left'].get_value(),
            right: this.sliders['right'].get_value(),
            top: this.sliders['top'].get_value(),
            bottom: this.sliders['bottom'].get_value(),
            brightness: this.sliders['brightness'].get_value()
        };
        
        this.settings.set_string('profiles', JSON.stringify(profiles));
    }
}
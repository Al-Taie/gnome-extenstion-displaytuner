import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScreenPadPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        this.settings = this.getSettings('org.gnome.shell.extensions.displaytuner');

        // ── Page & main group ────────────────────────────────────────────────

        const page  = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title:       'Screen Controls',
            description: 'Profiles are saved independently for each monitor you connect.',
        });
        page.add(group);

        // ── Dynamic monitor detection ────────────────────────────────────────

        let monitorNames       = ['Primary Monitor'];
        this.monitorConnectors = ['primary'];

        const display = Gdk.Display.get_default();
        if (display) {
            const monitors = display.get_monitors();
            for (let i = 0; i < monitors.get_n_items(); i++) {
                const monitor   = monitors.get_item(i);
                const model     = monitor.get_model()     || '';
                const connector = monitor.get_connector() || `Unknown-${i}`;

                let displayName = `Display ${i + 1}`;
                if      (model.startsWith('0x'))  displayName = `Built-in Display (${connector})`;
                else if (model && connector)       displayName = `${model} (${connector})`;
                else if (connector)                displayName = `Monitor on ${connector}`;

                monitorNames.push(displayName);
                this.monitorConnectors.push(connector);
            }
        }

        const monitorModel  = Gtk.StringList.new(monitorNames);
        this.monitorRow     = new Adw.ComboRow({ title: 'Target Monitor', model: monitorModel });
        group.add(this.monitorRow);

        // ── Spinner rows ─────────────────────────────────────────────────────

        this.sliders = {};
        const addSpinRow = (id, title, subtitle, min, max, step) => {
            const row = new Adw.SpinRow({
                title, subtitle,
                adjustment: new Gtk.Adjustment({ lower: min, upper: max, step_increment: step }),
            });
            row.connect('notify::value', () => this._saveCurrentProfile());
            this.sliders[id] = row;
            group.add(row);
        };

        addSpinRow('brightness', 'Software Brightness (%)', 'Hotkey: Super+Shift+Up / Down', 10, 100, 5);

        // ── Feature 4: Tint colour picker ────────────────────────────────────

        const tintRow = new Adw.ActionRow({
            title:    'Overlay Tint Color',
            subtitle: 'Colorize the dimmer (e.g. warm amber for a night-light effect)',
        });

        this._colorButton = new Gtk.ColorButton({
            valign:    Gtk.Align.CENTER,
            use_alpha: false,
            title:     'Choose Overlay Tint Color',
        });
        this._colorButton.connect('color-set', () => this._saveCurrentProfile());

        tintRow.add_suffix(this._colorButton);
        tintRow.set_activatable_widget(this._colorButton);
        group.add(tintRow);

        addSpinRow('left',   'Left Margin',   '', 0, 1000, 10);
        addSpinRow('right',  'Right Margin',  '', 0, 1000, 10);
        addSpinRow('top',    'Top Margin',    '', 0, 1000, 10);
        addSpinRow('bottom', 'Bottom Margin', '', 0, 1000, 10);

        // ── Feature 3: Danger Zone – Reset button ────────────────────────────

        const dangerGroup = new Adw.PreferencesGroup({ title: 'Danger Zone' });
        page.add(dangerGroup);

        const resetRow = new Adw.ActionRow({
            title:    'Reset Monitor to Defaults',
            subtitle: 'Zeroes all margins, restores brightness to 100%, and clears tint for the selected monitor',
        });

        const resetButton = new Gtk.Button({
            label:       'Reset Profile',
            valign:      Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetButton.connect('clicked', () => this._resetCurrentProfile());

        resetRow.add_suffix(resetButton);
        resetRow.set_activatable_widget(resetButton);
        dangerGroup.add(resetRow);

        // ── Wire monitor selector ────────────────────────────────────────────

        this.monitorRow.connect('notify::selected', () => {
            let idx = this.monitorRow.get_selected();
            this.settings.set_string('target-connector', this.monitorConnectors[idx]);
            this._loadCurrentProfile();
        });

        // Initial load
        let savedConnector = this.settings.get_string('target-connector');
        let idx = this.monitorConnectors.indexOf(savedConnector);
        if (idx !== -1) this.monitorRow.set_selected(idx);
        this._loadCurrentProfile();

        window.add(page);
    }

    // ── Profile helpers ──────────────────────────────────────────────────────

    _loadCurrentProfile() {
        this._isUpdatingUI = true;

        let connector = this.settings.get_string('target-connector');
        let profiles  = JSON.parse(this.settings.get_string('profiles') || '{}');
        let profile   = profiles[connector] ?? { left: 0, right: 0, top: 0, bottom: 0, brightness: 100, tintColor: '#000000' };

        this.sliders['brightness'].set_value(profile.brightness);
        this.sliders['left'].set_value(profile.left);
        this.sliders['right'].set_value(profile.right);
        this.sliders['top'].set_value(profile.top);
        this.sliders['bottom'].set_value(profile.bottom);

        // Restore the tint colour into the picker
        const rgba = new Gdk.RGBA();
        rgba.parse(profile.tintColor || '#000000');
        this._colorButton.set_rgba(rgba);

        this._isUpdatingUI = false;
    }

    _saveCurrentProfile() {
        if (this._isUpdatingUI) return;

        let connector = this.settings.get_string('target-connector');
        let profiles  = JSON.parse(this.settings.get_string('profiles') || '{}');

        // Convert Gdk.RGBA (0.0–1.0 channels) to a CSS hex string
        const rgba    = this._colorButton.get_rgba();
        const toHex   = v => Math.round(v * 255).toString(16).padStart(2, '0');
        const tintColor = `#${toHex(rgba.red)}${toHex(rgba.green)}${toHex(rgba.blue)}`;

        profiles[connector] = {
            left:       this.sliders['left'].get_value(),
            right:      this.sliders['right'].get_value(),
            top:        this.sliders['top'].get_value(),
            bottom:     this.sliders['bottom'].get_value(),
            brightness: this.sliders['brightness'].get_value(),
            tintColor,
        };

        this.settings.set_string('profiles', JSON.stringify(profiles));
    }

    /** Feature 3: wipe the selected monitor's profile and reload defaults */
    _resetCurrentProfile() {
        let connector = this.settings.get_string('target-connector');
        let profiles  = JSON.parse(this.settings.get_string('profiles') || '{}');
        delete profiles[connector];
        this.settings.set_string('profiles', JSON.stringify(profiles));
        this._loadCurrentProfile(); // snaps sliders back to 0/100/black
    }
}
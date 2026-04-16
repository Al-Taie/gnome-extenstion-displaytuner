# Display Tuner — GNOME Shell Extension

A per-monitor **software dimmer and screen-padding** extension for GNOME Shell.  
Designed for setups where you want to use an external display (e.g. a large TV) alongside your laptop screen, without touching hardware settings.

---

## Features

### 🌑 Software Dimmer (per-monitor)
Overlays a coloured, translucent layer on any monitor to reduce perceived brightness in software — works on **Wayland** where redirecting hardware brightness is restricted.

### 📐 Physical Screen Padding
Adds configurable black bars to the **left, right, top and bottom** edges of any monitor. Useful if your display has overscan, a thick bezel you want to compensate for, or you simply want to shrink the usable desktop area.

### ☀️ Brightness Hotkeys with Native OSD
Press your monitor's brightness keys to adjust the software dimmer in 5 % steps. The standard GNOME **brightness OSD popup** (the translucent bar) appears on the correct monitor — identical to the experience of a hardware brightness key.

| Action | Default Shortcut |
|---|---|
| Increase brightness | `Shift + XF86MonBrightnessUp` |
| Decrease brightness | `Shift + XF86MonBrightnessDown` |

> Both shortcuts are fully remappable in **GNOME Settings → Keyboard → Custom Shortcuts** or directly in `dconf-editor`.

### ⚡ Quick Settings Toggle
The extension lives in the **Quick Settings** panel (the system tray dropdown) as a native pill-shaped toggle — identical to the Wi-Fi or Bluetooth toggles. Tap it to enable/disable all overlays instantly. The sub-menu contains a direct link to the full Preferences window.

### 🎨 Color Tinting (Per-Monitor Night Light)
Instead of a plain black overlay, choose any colour for the dimmer.  
Set a warm **amber/orange** for a permanent Night Light effect on a specific monitor, or a subtle **blue** to cool down a warm display. The tint colour and the brightness slider work together.

### 🔄 Reset to Defaults
A **Reset Profile** button (in the Danger Zone section of Preferences) instantly zeroes all margins and restores 100 % brightness for the currently selected monitor — no slider dragging required.

### 🖱️ Hardware Cursor Dimming *(GNOME 45+)*
Because Wayland hardware cursors render above all overlays, a maximally dimmed screen would still show a blazing-white cursor. The extension calls Mutter's `inhibit_hardware_cursors()` API to force software cursor rendering whenever the pointer is on a dimmed monitor, so the cursor respects the dimmer opacity. Degrades gracefully on builds where the API is unavailable.

---

## Installation

```bash
# 1. Clone (or unzip the release) into the extensions directory
git clone <repo-url> ~/.local/share/gnome-shell/extensions/displaytuner@al-taie.fedora

# 2. Compile the GSettings schema
cd ~/.local/share/gnome-shell/extensions/displaytuner@al-taie.fedora
glib-compile-schemas schemas/

# 3. Enable the extension
gnome-extensions enable displaytuner@al-taie.fedora
```

> On Fedora / GNOME 45+ you may need to log out and back in before the extension appears in the Quick Settings panel.

---

## Preferences

Open via **Quick Settings → Display Tuner → Open Settings…** or:

```bash
gnome-extensions prefs displaytuner@al-taie.fedora
```

| Setting | Description |
|---|---|
| **Target Monitor** | Dropdown listing all connected monitors by name and connector |
| **Software Brightness (%)** | 10 % (near-black) → 100 % (no overlay). Clamped at 10 % minimum |
| **Overlay Tint Color** | Colour picker for the dimmer overlay (default: black) |
| **Left / Right / Top / Bottom Margin** | Padding in pixels applied to that monitor edge |
| **Reset Profile** | Wipes the selected monitor's profile back to defaults |

---

## File Structure

```
displaytuner@al-taie.fedora/
├── extension.js        # Main GNOME Shell extension (overlays, hotkeys, Quick Settings)
├── prefs.js            # GTK4/Libadwaita Preferences window
├── metadata.json       # Extension metadata (UUID, supported GNOME versions)
└── schemas/
    ├── org.gnome.shell.extensions.displaytuner.gschema.xml
    └── gschemas.compiled
```

---

## Compatibility

| GNOME Shell | Status |
|---|---|
| 45 | ✅ Fully supported |
| 46 | ✅ Fully supported |
| 47 | ✅ Fully supported |
| 48 | ✅ Fully supported |
| 49+ | ✅ Expected compatible |

Requires **Wayland** session. X11 is untested and not a design target.

---

## License

MIT — do whatever you like with it.

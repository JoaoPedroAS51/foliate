/*
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

pkg.initGettext()
pkg.initFormat()
pkg.require({
    'Gio': '2.0',
    'Gtk': '3.0'
})

const { Gio, Gtk, Gdk, GObject, GLib } = imports.gi
const { ttsDialog } = imports.tts
let Handy; try { Handy = imports.gi.Handy } catch (e) {}
if (Handy) Handy.init(null)

const { mimetypes } = imports.utils
const { Window } = imports.window
const { LibraryWindow, OpdsWindow } = imports.library
const { customThemes, ThemeEditor, makeThemeFromSettings, applyTheme } = imports.theme

const settings = new Gio.Settings({ schema_id: pkg.name })
const windowState = new Gio.Settings({ schema_id: pkg.name + '.window-state' })
const viewSettings = new Gio.Settings({ schema_id: pkg.name + '.view' })
const librarySettings = new Gio.Settings({ schema_id: pkg.name + '.library' })

const makeActions = app => ({
    'new-theme': () => {
        const theme = makeThemeFromSettings()
        const editor = new ThemeEditor(theme)
        const dialog = editor.widget
        dialog.transient_for = app.active_window
        if (dialog.run() === Gtk.ResponseType.OK) {
            customThemes.addTheme(theme)
            applyTheme(theme)
        }
        dialog.destroy()
    },
    'preferences': () => {
        const builder = Gtk.Builder.new_from_resource(
            '/com/github/johnfactotum/Foliate/ui/preferenceWindow.ui')

        const $ = builder.get_object.bind(builder)
        const flag = Gio.SettingsBindFlags.DEFAULT

        settings.bind('restore-last-file', $('restoreLastFile'), 'state', flag)
        settings.bind('use-menubar', $('useMenubar'), 'state', flag)
        settings.bind('use-sidebar', $('useSidebar'), 'state', flag)
        settings.bind('autohide-headerbar', $('autohideHeaderbar'), 'state', flag)
        settings.bind('footer-left', $('footerLeftCombo'), 'active-id', flag)
        settings.bind('footer-right', $('footerRightCombo'), 'active-id', flag)
        settings.bind('selection-action-single', $('singleActionCombo'), 'active-id', flag)
        settings.bind('selection-action-multiple', $('multipleActionCombo'), 'active-id', flag)
        settings.bind('img-event-type', $('imgEventTypeCombo'), 'active-id', flag)
        settings.bind('tts-command', $('ttsEntry'), 'text', flag)
        settings.bind('turn-page-on-tap', $('turnPageOnTap'), 'state', flag)
        librarySettings.bind('use-tracker', $('useTracker'), 'state', flag)
        settings.bind('cache-locations', $('cacheLocations'), 'state', flag)
        settings.bind('cache-covers', $('cacheCovers'), 'state', flag)

        const updateAHBox = () => {
            const available =
                !viewSettings.get_boolean('skeuomorphism')
                && !settings.get_boolean('use-sidebar')
                && !settings.get_boolean('use-menubar')

            $('autohideHeaderbar').sensitive = available
            $('autohideHeaderbar').visible = available
            $('autohideHeaderbarDisabled').visible = !available
        }
        updateAHBox()
        const h1 = viewSettings.connect('changed::skeuomorphism', updateAHBox)
        const h2 = settings.connect('changed::use-sidebar', updateAHBox)
        const h3 = settings.connect('changed::use-menubar', updateAHBox)

        const dialog = builder.get_object('preferenceDialog')
        dialog.transient_for = app.active_window

        $('setupTtsButton').connect('clicked', () => ttsDialog(dialog))

        dialog.run()
        dialog.destroy()
        viewSettings.disconnect(h1)
        settings.disconnect(h2)
        settings.disconnect(h3)
    },
    'open': () => {
        const allFiles = new Gtk.FileFilter()
        allFiles.set_name(_('All Files'))
        allFiles.add_pattern('*')

        const epubFiles = new Gtk.FileFilter()
        epubFiles.set_name(_('E-book Files'))
        epubFiles.add_mime_type(mimetypes.epub)
        epubFiles.add_mime_type(mimetypes.mobi)
        epubFiles.add_mime_type(mimetypes.kindle)
        epubFiles.add_mime_type(mimetypes.fb2)
        epubFiles.add_mime_type(mimetypes.fb2zip)
        epubFiles.add_mime_type(mimetypes.cbz)
        epubFiles.add_mime_type(mimetypes.cbr)
        epubFiles.add_mime_type(mimetypes.cb7)
        epubFiles.add_mime_type(mimetypes.cbt)

        const dialog = Gtk.FileChooserNative.new(
            _('Open File'),
            app.active_window,
            Gtk.FileChooserAction.OPEN,
            null, null)
        dialog.add_filter(epubFiles)
        dialog.add_filter(allFiles)

        if (dialog.run() === Gtk.ResponseType.ACCEPT) {
            // const activeWindow = app.active_window
            // if (activeWindow instanceof LibraryWindow) activeWindow.close()
            new Window({ application: app, file: dialog.get_file() }).present()
        }
    },
    'open-opds': () => {
        const clipboardText = Gtk.Clipboard.get_default(Gdk.Display.get_default())
            .wait_for_text()
        const text = clipboardText && clipboardText.includes('://')
            ? clipboardText : ''

        const window = new Gtk.Dialog({
            title: _('Open a Catalog'),
            modal: true,
            use_header_bar: true,
            transient_for: app.active_window
        })
        window.add_button(_('Cancel'), Gtk.ResponseType.CANCEL)
        window.add_button(_('Open'), Gtk.ResponseType.OK)
        window.set_default_response(Gtk.ResponseType.OK)

        const label = new Gtk.Label({
            label: _('OPDS Catalog URL:'),
            wrap: true,
            xalign: 0
        })
        const entry =  new Gtk.Entry({ text })
        entry.connect('activate', () => window.response(Gtk.ResponseType.OK))

        const container = window.get_content_area()
        container.spacing = 6
        container.border_width = 18
        container.pack_start(label, false, true, 0)
        container.pack_start(entry, false, true, 0)
        window.show_all()
        const response = window.run()
        if (response === Gtk.ResponseType.OK && entry.text) {
            const window = new OpdsWindow({ application: app })
            let uri = entry.text.trim().replace(/^opds:\/\//, 'http://')
            if (!uri.includes(':')) uri = 'http://' + uri
            window.loadOpds(uri)
            window.present()
        }
        window.close()
    },
    'library': () => {
        const windows = app.get_windows()
        ;(windows.find(window => window instanceof LibraryWindow)
            || new LibraryWindow({ application: app })).present()
    },
    'about': () => {
        const aboutDialog = new Gtk.AboutDialog({
            authors: ['John Factotum'],
            artists: ['John Factotum', 'Tobias Bernard <tbernard@gnome.org>'],
            // Translators: put your names here, one name per line
            // they will be shown in the "About" dialog
            translator_credits: _('translator-credits'),
            program_name: _('Foliate'),
            comments: _('A simple and modern eBook viewer'),
            logo_icon_name: pkg.name,
            version: pkg.version,
            license_type: Gtk.License.GPL_3_0,
            website: 'https://johnfactotum.github.io/foliate/',
            modal: true,
            transient_for: app.active_window
        })
        aboutDialog.run()
        aboutDialog.destroy()
    },
    'quit': () => app.get_windows().forEach(window => window.close())
})

function main(argv) {
    let restore = true

    const application = new Gtk.Application({
        application_id: 'com.github.johnfactotum.Foliate',
        flags: Gio.ApplicationFlags.HANDLES_OPEN
    })

    application.add_main_option('library',
        0, GLib.OptionFlags.NONE, GLib.OptionArg.NONE,
        _('Open library window'), null)

    application.add_main_option('version',
        'v'.charCodeAt(0), GLib.OptionFlags.NONE, GLib.OptionArg.NONE,
        _('Show version'), null)

    application.connect('activate', () => {
        const windows = application.get_windows()
        let window
        const lastFile = windowState.get_string('last-file')
        if (restore && !windows.length && settings.get_boolean('restore-last-file') && lastFile)
            window = new Window({
                application,
                file: Gio.File.new_for_path(lastFile)
            })
        else {
            window = windows.find(window => window instanceof LibraryWindow)
                || new LibraryWindow({ application })
        }
        window.present_with_time(Gdk.CURRENT_TIME)
    })

    application.connect('handle-local-options', (application, options) => {
        if (options.contains('version')) {
            print(pkg.version)
            return 0
        }
        if (options.contains('library')) restore = false
        return -1
    })

    application.connect('open', (_, files) => files.forEach(file => {
        let window
        if (file.get_uri_scheme() === 'opds') {
            window = new OpdsWindow({ application })
            const uri = file.get_uri().replace(/^opds:\/\//, 'http://')
            window.loadOpds(uri)
        } else window = new Window({ application, file })
        window.present()
    }))

    application.connect('startup', () => {
        viewSettings.bind('prefer-dark-theme', Gtk.Settings.get_default(),
            'gtk-application-prefer-dark-theme', Gio.SettingsBindFlags.DEFAULT)

        const actions = makeActions(application)
        Object.keys(actions).forEach(name => {
            const action = new Gio.SimpleAction({ name })
            action.connect('activate', actions[name])
            application.add_action(action)
        })

        ;[
            ['app.quit', ['<ctrl>q']],
            ['app.open', ['<ctrl>o']],
            ['app.preferences', ['<ctrl>comma']],

            ['lib.list-view', ['<ctrl>1']],
            ['lib.grid-view', ['<ctrl>2']],
            ['lib.main-menu', ['F10']],
            ['lib.search', ['<ctrl>f', 'slash']],
            ['lib.close', ['<ctrl>w']],

            ['win.close', ['<ctrl>w']],
            ['win.reload', ['<ctrl>r']],
            ['win.open-copy', ['<ctrl>n']],
            ['win.properties', ['<ctrl>i']],
            ['win.fullscreen', ['F11']],
            ['win.unfullscreen', ['Escape']],
            ['win.side-menu', ['F9']],
            ['win.show-toc', ['<ctrl>t']],
            ['win.show-annotations', ['<ctrl>a']],
            ['win.show-bookmarks', ['<ctrl>b']],
            ['win.find-menu', ['<ctrl>f', 'slash']],
            ['win.main-menu', ['F10']],
            ['win.location-menu', ['<ctrl>l']],
            ['win.speak', ['F5']],
            ['win.selection-copy', ['<ctrl>c']],
            ['win.show-help-overlay', ['<ctrl>question']],

            ['view.go-prev', ['p']],
            ['view.go-next', ['n']],
            ['view.go-back', ['<alt>p', '<alt>Left']],
            ['view.zoom-in', ['plus', 'equal', '<ctrl>plus', '<ctrl>equal']],
            ['view.zoom-out', ['minus', '<ctrl>minus']],
            ['view.zoom-restore', ['0', '<ctrl>0']],
            ['view.bookmark', ['<ctrl>d']],
            ['view.clear-cache', ['<ctrl><shift>r']],

            ['img.copy', ['<ctrl>c']],
            ['img.save-as', ['<ctrl>s']],
            ['img.zoom-in', ['plus', 'equal', '<ctrl>plus', '<ctrl>equal']],
            ['img.zoom-out', ['minus', '<ctrl>minus']],
            ['img.zoom-restore', ['0', '<ctrl>0']],
            ['img.rotate-left', ['<ctrl>Left']],
            ['img.rotate-right', ['<ctrl>Right']],
            ['img.invert', ['<ctrl>i']],
            ['img.close', ['<ctrl>w']],
        ].forEach(([name, accels]) => application.set_accels_for_action(name, accels))

        const menu = Gtk.Builder.new_from_resource(
            '/com/github/johnfactotum/Foliate/ui/menuBar.ui')
            .get_object('menu')
        application.menubar = menu

        const cssProvider = new Gtk.CssProvider()
        cssProvider.load_from_data(`
            /* set min-width to 1px,
               so we can have variable width progress bars a la Kindle */
            progress, trough {
                min-width: 1px;
            }

            /* add shadow to book covers */
            .foliate-book-image {
                box-shadow:
                    5px 5px 12px 2px rgba(0, 0, 0, 0.1),
                    0 0 2px 1px rgba(0, 0, 0, 0.2);
            }

            /* for generated covers */
            .foliate-book-image-dark {
                color: #fff;
            }
            .foliate-book-image-light {
                color: #000;
            }
            .foliate-book-image-dark .foliate-book-image-title {
                border-color: rgba(255, 255, 255, 0.2);
                background: rgba(0, 0, 0, 0.2);
            }
            .foliate-book-image-light .foliate-book-image-title {
                border-color: rgba(0, 0, 0, 0.2);
                background: rgba(255, 255, 255, 0.2);
            }
            .foliate-book-image-title {
                border-width: 1px 0px;
                border-style: solid;
                padding: 12px;
            }
            .foliate-book-image-creator {
                opacity: 0.7;
                padding: 12px;
            }

            .foliate-emblem {
                color: white;
                background: gray;
                border-radius: 100%;
                padding: 6px;
                opacity: 0.9;
            }
            row .foliate-emblem {
                opacity: 0.6;
            }
            row .foliate-emblem:backdrop {
                opacity: 0.3;
            }

            .foliate-select {
                color: #fff;
                background: rgba(0, 0, 0, 0.4);
            }
        `)
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(),
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    })

    return application.run(argv)
}

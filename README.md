# Blot

At 8:15 there were six ducks on the pond. At 8:20 there were five ducks and a small periscope. This is why it pays to take notes.

Blot is a local-first notes app for macOS, Windows, and Linux. Write in rich text, file your observations under a hashtag, and put the next pond inspection on the calendar. Blot autosaves to SQLite on your computer and works offline from the first launch.

[Website](https://blot.page/) · [Report an issue](https://github.com/joduplessis/blot/issues)

![Blot in dark mode with nested tags, note previews, and an illustrated note](website/public/blot-screenshot.jpg)

## Run from source

With Node.js 22.12 or newer and npm installed, start Blot from the repository root.

```sh
cd app
npm ci
npm --prefix desktop ci
npm run dev
```

This opens the Electron app with the local renderer. Choose **New note** or press **Cmd/Ctrl+N** to make your first entry. When someone asks what time you saw the periscope, **Cmd/Ctrl+F** opens search.

The app uses the published Fold packages pinned in the lockfile. Run these commands from `app/`.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Check the renderer and desktop TypeScript |
| `npm run build` | Build the renderer and desktop services |
| `npm run electron` | Build and launch the production renderer locally |
| `npm run pack:mac`, `npm run pack:win`, or `npm run pack:linux` | Build an unpacked desktop app for the selected platform |

On Apple Silicon, `npm run pack:mac` leaves Blot at `app/desktop/release/mac-arm64/Blot.app`. Copy it to Applications to install it.

## Keeping field notes

- **File a sighting.** Type `#pond` anywhere in a note to tag it. If the sightings persist, try `#pond/periscopes`. Select a tag in the sidebar to see its notes, or drag a note onto a tag to add it.
- **Include the evidence.** Use the formatting menu or Markdown shortcuts for headings, lists, checkboxes, links, and code. Paste or drop a photograph into the note. The attachment button takes files, including the witness statement.
- **Go back on Thursday.** Open the calendar beside a checklist item to set a date, time, or repeat schedule. The task appears in **Calendar** until you check it off.
- **Keep the map handy.** Pin a note you use often. Deleted notes go to **Trash**, where you can restore them or delete them permanently.

## Notes, privacy, and backups

**Settings → Import / Export** brings Markdown files into Blot and exports unprotected notes with their images and attachments. Keep the exported media folders beside the Markdown files so the photographs travel with the report.

### Where the notes live

| Installation | Database location |
| --- | --- |
| macOS, packaged | `~/Library/Application Support/Noted/noted.sqlite` |
| Windows or Linux, packaged | `Noted/noted.sqlite` under the platform's app-data folder |
| Development | `app/desktop/.data/noted.sqlite` |

To try Blot with a separate library, point `BLOT_DATA_DIR` at an empty temporary directory.

### Back up and restore

Choose **File → Back up notes** for a full backup, including protected notes and retained revisions. Keep the SQLite backup together with its companion `.sqlite.images` folder if one was created.

To restore a backup manually, follow these steps.

1. Quit Blot. In its data directory, move the existing `noted.sqlite`, any `noted.sqlite-wal` and `noted.sqlite-shm` files, and the `images/` folder aside together.
2. Copy the backup database into the data directory as `noted.sqlite`. If the backup has a companion `.sqlite.images` folder, copy that folder into the same directory as `images/`.
3. Reopen Blot.

### Protect a note

Set a six-digit PIN in **Settings → Privacy** to lock individual notes. Blot encrypts a locked note's body and revision history. The title, tags, and dates remain visible, so give some thought to a title like “Where I Hid the Periscope.”

Remove attachments before protecting a note. Keep your PIN somewhere safe. Blot cannot recover it, and older encrypted backups still need their original PIN.

## Optional folder sync

If a second field station opens across the hall, you can share notes through a folder. Each computer keeps its own SQLite database.

1. Create an empty folder for Blot in a location your file-sync client shares between computers.
2. On the first computer, open **Settings → Sync → Choose folder** and select it. Give your file-sync client time to finish uploading.
3. Choose the same folder on the second computer. Blot merges the libraries. If both computers edited the same note independently, Blot keeps the competing edits as separate conflict notes. Use the same PIN on each device for protected notes.

Only the exchange folder belongs in your file-sync service. Keep it private because it retains revisions, including deleted content. Use **File → Back up notes** for an independent backup.

## Website

The site lives in `website/`. Start the development server from the repository root.

```sh
cd website
npm ci
npm run dev
```

Open `http://127.0.0.1:4320` to see the site. From `website/`, run `npm run build` to type-check it and regenerate `docs/`. Run `npm run preview` to view the production build locally.

Publish the generated `docs/` files with the website changes. In **Settings → Pages**, choose **Deploy from a branch**, **main**, and **/docs**. Set the custom domain to `blot.page` and configure its DNS for GitHub Pages. Relative asset URLs let the same build work at `/blot/`. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## License

Blot's source code uses the [MIT License](LICENSE). The bundled Inter typeface uses the [SIL Open Font License](app/public/Inter-LICENSE.txt).

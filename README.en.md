# Tag Sweeper (ST-TagSweeper)

[简体中文](README.md) ｜ [繁體中文](README.zh-TW.md) ｜ **English**

A SillyTavern extension that **deletes `<think>`, `<summary>`, `<plot>` … blocks from the chat file and keeps only the prose**.

The deletion is destructive: it is written back into the chat file itself, so the junk stays gone whether your regexes are on or off, and whichever preset you switch to.

---

## Install

SillyTavern → **Extensions** → **Install extension** → paste this repository's GitHub URL → Install, then refresh the page (F5).

The extension appears as “Tag Sweeper” in the extensions panel. Use **Update** in the extensions list to upgrade later.

### Uninstall

Delete `public/scripts/extensions/third-party/ST-TagSweeper/` and refresh.
Its settings and backup points live in your SillyTavern user settings; reset them with “Restore default settings”.

---

## Usage

Open the panel from any of:

* the **wand menu 🪄 → Tag Sweeper** next to the input box;
* the hotkey **`Ctrl + Alt + X`** (configurable);
* “Open panel” in the extension settings.

The toolbar has **Scan / Clean now / Undo last / ?**.

> Scanning reads the raw chat file — the same data the pencil (edit) dialog shows.
> You do **not** need to disable your regexes; the result is identical either way.

The interface language can be switched in **Settings → Language** (follow SillyTavern / 繁體中文 / 简体中文 / English). It only affects the UI, never the result.

### 1. Tags

After **Scan**, every angle-bracket tag found in the chat is listed. Each row has two checkboxes:

| Box | Meaning |
| --- | --- |
| 🔴 Red | **Remove**: delete the tag together with its content |
| 🟢 Green | **Whitelist**: keep the content, strip only the `< >` wrapper |
| Neither | **Leave**: keep the message exactly as it is |

Red is checked by default (everything except the whitelist is deleted). Ticking one clears the other.

Each row also shows hit count, `paired / orphan-open / orphan-close`, and a sample of the original text.

* **▸ Where it comes from** — lists the messages containing this tag; click a number to jump there.
* **👁 Hide** — hide a tag from the list; hiding is display-only and never changes what gets deleted.
* **Show hidden** — bring them back.
* **Hide listed** — filter by keyword, then hide everything shown.

### 2. Shells

Angle brackets are not the only wrappers models use. This tab manages other paired delimiters:

| Shell | Default |
| --- | --- |
| `< >` | **Enabled** (core of the extension: cannot be deleted, can be disabled, always closed by `/`) |
| `{ }`, `[ ]`, `《 》`, `【 】` | Built in, disabled by default — tick to enable |

* Add any pair you like (e.g. `「 」`, `* *`).
* Non-`< >` shells can require a **`/` terminator**: when on, the closing part must be `/` + the closing delimiter (e.g. `«text/»`); when off, the closing delimiter alone ends the block.
* Each shell is either **remove with content** or **strip only, keep content**.
* Shells also skip fenced code blocks, so sample code is never wiped.

**Exact-match removal**: add strings such as ` ```bash `, ` ``` ` or `<br>` below. Whenever that exact text appears, it is deleted during cleaning. This section ignores code protection — if you list it, it goes.

### 3. Preview

One message at a time, with a `‹ N / M ›` pager.

* **Show deleted content** — a pill button. When lit, the original text is shown with the doomed parts in <span style="color:#e0554b">red strikethrough</span>; when off, the cleaned result is shown.
* **Edit content** — edit this message's cleaned result directly. The toolbar above the text box (**Undo / Redo / Save / Cancel**, plus `Ctrl+Z`, `Ctrl+Y`, `Ctrl+S`) only appears while editing. The editor starts with the red strikethrough visible; you can backspace it away. Saving makes your text authoritative for that message; cancelling leaves no trace. Switching tabs while editing asks whether to save first.

A message flagged “⚠ prose may be deleted” loses more than 95% of its text — the prose itself is probably going too.

### 4. Clean now

1. Re-scans first, so the preview can never be stale.
2. Shows a confirmation dialog with the message count, characters removed, and a per-message before/after table.
3. If any message is flagged, it asks again: “Prose in #12 may be deleted — continue?” Yes proceeds, No cancels everything.
4. Creates a backup point automatically.
5. Writes the chat file → reloads → reads back to verify.

### 5. Undo

* **Undo last** on the panel, or
* **Settings → Backups**, roll back any backup point;
* backups can be downloaded as `.jsonl` (SillyTavern's native chat format) or imported from a file.

Rolling back first backs up the current state, so an undo can itself be undone.

---

## Whitelist rules

A whitelist means **keep the content, strip the shell**:

| Input | Whitelist | Result |
| --- | --- | --- |
| `<plot>prose</plot>` | `plot` | `prose` |
| `<plot>prose</plot>` | — | (deleted entirely) |
| `<!-- 2.prose -->` | `!--` | `2.prose` |
| `<!-- 2.prose -->` | — | (deleted entirely) |

* Tag names are case-insensitive; non-ASCII names work too (e.g. `<正文>`);
* Comments always use `!--` as their name;
* Nesting works: `<plot>a<think>reasoning</think>b</plot>` with `plot` whitelisted → `ab`;
* **Whitelisted content is protected unconditionally** — however many layers wrap it:

  | Input | Whitelist | Result |
  | --- | --- | --- |
  | `【<a><story>prose</story></a>】` | `story` | `【prose】` |
  | `<a><b><c><story>prose</story></c></b></a>` | `story` | `prose` |
  | `<think>outer<plot>inner</plot>end</think>` | `plot` | `inner` |

  Outer junk tags are still removed, and non-whitelisted tags *inside* a whitelisted block are still removed
  (`<plot>prose<think>reasoning</think>tail</plot>` → `prose tail`).
* Default whitelist: `plot`, `content`, `正文`.

---

## Broken tags

Models sometimes emit a closing tag without its opening counterpart:

```
(a long block of text)
</think>
<plot>
prose
</plot>
```

Rules:

* **Paired tags** → delete everything from `<tag>` to `</tag>`;
* **Orphan closing `</tag>`** → also delete the block before it (default);
* **Orphan opening `<tag>`** → delete up to the next tag or the end of the message (configurable).

### Where the deletion starts

Broken output often has stray fragments such as `<Admin>` inside the reasoning. Deleting only “up to the previous tag” lets those fragments cut the range short, leaving the text above it behind. The default instead **walks back to the nearest properly closed construct** and absorbs everything in between.

Switch modes in **Settings → Safety → Where to start cutting**:

| Mode | Behaviour | Use when |
| --- | --- | --- |
| **Previous closed construct** (default) | Walks back past stray fragments; falls back to the start of the message | Almost always |
| Always start at message start | Most aggressive; clears everything before the orphan | You know the whole prefix is junk |
| Only up to the previous tag | Most conservative; easily cut short by fragments | You want to verify each case |

### Residue warning

Whenever text above an orphan's deletion range is left untouched, the extension says so:

* the preview row shows `⚠ possible residue above`;
* the summary counts “residue warnings”;
* the confirmation dialog mentions it.

Check with “Show deleted content”, and if that text really is junk, switch to “Always start at message start” and clean again.

### Other protections (on by default)

* **Skip fenced code blocks** — a `<div>` inside ``` … ``` is not removed;
* **Tidy blank lines** — no piles of empty lines after cleaning;
* **Messages without tags are never touched**.

---

## Settings

| Group | Option | Notes |
| --- | --- | --- |
| Scope | Include user messages | Off = only AI messages are cleaned |
| | Include system messages | e.g. `/sys` |
| | Clean all swipes | Prevents junk reappearing when you swipe (default on) |
| | Clean the reasoning field | Handles `extra.reasoning` (default off) |
| Safety | Skip code blocks / inline code | Code blocks skipped by default |
| | Tidy blank lines | Default on |
| | Protect whitelisted content | Always on |
| | Orphan closing tags | Delete with content / delete tag only / leave |
| | └ where to start cutting | Smart (default) / start of message / previous tag |
| | Orphan opening tags | To next tag / to end / tag only / leave |
| Regex | Temporarily disable all regexes | Optional manual button; always restorable |
| Hotkey | Enable / customize | Default `Ctrl+Alt+X`; click the field and press the combo |
| Language | Follow SillyTavern / 繁體中文 / 简体中文 / English | UI only |
| Panel | Remember panel position | Drag by the title bar |
| Backups | Keep count / back up now / import / roll back | 5 kept by default, 1.5 MB each |

---

## Slash commands

| Command | Effect |
| --- | --- |
| `/tagsweep` | Toggle the panel |
| `/tagsweep-scan` | Scan only, returns tag statistics |
| `/tagsweep-apply` | Full clean flow (`quiet=true` skips the dialog, still backs up) |
| `/tagsweep-undo` | Roll back to the latest backup point |

---

## FAQ

**Can it delete my prose by mistake?**
It can, especially with broken orphan tags. That is why the flow is preview first (red = will be deleted) → automatic backup → write → read-back verification, with **Undo last** one click away. Whitelisted content is never deleted.

**Where do those unfamiliar tags come from?**
The list is computed across the whole chat file. Click **▸** on a row to see which messages contain it (and jump there). Press **👁** to hide it — it is still processed.

**Can I clean only a few messages?**
Cleaning is whole-chat for now. Whitelist the tags you want to keep, mark a tag “leave” so its messages are untouched, or rewrite a single message with **Edit content**.

**Where are backups stored?**
In SillyTavern's user settings (`extension_settings`): 5 kept, 1.5 MB each; oversized backups are downloaded as files instead. SillyTavern also keeps its own chat backups under `data/<user>/backups/`.

**Does it support group chats?**
Yes, each speaker's name is shown per message.

---

## License

MIT — see [`LICENSE`](LICENSE).

This is a standalone SillyTavern extension and does not modify the SillyTavern core,
which is licensed under AGPL-3.0.

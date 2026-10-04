# Al-Rabiʿ: Arab Spring podcast

Data and audio host for two Scriptable (iPhone) scripts:

- `scriptable/AS-Player.js`: the audio player and home-screen widget. It's gamified (XP, levels, daily streak, badges), resumes where you left off, has a speed slider (0.75×–2.5×), and auto-advances to the next episode.
- `scriptable/AS-Cards.js`: the flashcard reviewer. Each episode's cards unlock once you finish that episode in the player.

Both scripts share progress through `arab-spring-progress.json` in Scriptable's Documents folder.

GitHub Pages serves the repo: <https://iamrichardmaier-sudo.github.io/arab-spring-podcast/>

| File | What it is | Who edits it |
|---|---|---|
| `episodes.json` | the 83 episodes (IDs, order and titles are fixed) | `scripts/sync_audio.py` sets the `audio`/`driveId` fields |
| `cards.json` | flashcards | the NotebookLM browser process only, never edit by hand |
| `audio/<id>.m4a` | hosted, re-encoded audio | `scripts/sync_audio.py` |

## Adding new audio (the workflow)

1. A new NotebookLM audio overview is saved to the Google Drive folder **The Arab Spring** and named after its episode ID, for example `egypt-02.m4a`.
   Valid IDs are the `id` values in `episodes.json`, such as `master-03` or `syria-01`.
2. Get the files onto a computer, either through Google Drive for desktop (the folder syncs locally) or by downloading them to `~/Downloads`.
3. From this repo, run:

   ```sh
   python3 scripts/sync_audio.py "/path/to/The Arab Spring"
   ```

   The script:
   - skips (with a warning) any file whose name isn't an episode ID, such as `aftermath-01-alt.m4a`, `… (1).m4a` or the `Morocco_…` duplicate.
   - re-encodes each file to mono AAC at 56 kbps with faststart, writing `audio/<id>.m4a` (about 8 MB per 20 min, so speech still sounds clean).
   - runs `git pull --rebase`, sets `"audio": "audio/<id>.m4a"` and clears `"driveId"` for those episodes, commits, and pushes to `main`.
   - waits for GitHub Pages to publish, then checks every file: HTTP 206 on a Range request, `Content-Type: audio/mp4`, and a headless browser reaching `loadedmetadata` with the right duration.
   - prints a table: episode, size, duration, test results.
4. Open **AS-Player** on the phone. The episode is now playable. (It pulls `episodes.json` fresh on every launch.)

Files that are already encoded are skipped, so you can safely re-run it on the whole folder. Other options:

```sh
python3 scripts/sync_audio.py <folder> --no-push   # encode + edit episodes.json locally only
python3 scripts/sync_audio.py --verify-only        # re-test everything already hosted
python3 scripts/sync_audio.py <folder> --force     # re-encode even if already done
```

### Requirements

- `python3`, `git` (with push access to this repo), and `ffmpeg`/`ffprobe` (`brew install ffmpeg`).
- Optional for the browser check: Node plus `npm i -g playwright`. The check uses Google Chrome if it's installed, because Playwright's bundled Chromium can't decode AAC. Without an AAC-capable browser it falls back to probing the live URL with `ffprobe`.

### Why not stream from Google Drive?

Drive won't stream large files to an `<audio>` element. The `usercontent` download URL stalls before metadata, and `uc?export=download` returns MediaError 4, even with "Anyone with the link" sharing. So Drive is only the place new files land. GitHub Pages hosts the audio and serves the correct `audio/mp4` type with byte-range support, which iOS needs to seek.

Space budget: 83 episodes × about 8.5 MB ≈ 700 MB, under GitHub Pages' 1 GB site limit. Each file must stay under 100 MB (git's limit); a 20-minute episode is about 8 MB.

## Installing / updating the Scriptable scripts

1. In Scriptable, open (or create) a script named exactly **AS-Player**. Replace all of its code with `scriptable/AS-Player.js`. Do the same for **AS-Cards** with `scriptable/AS-Cards.js`.
2. Widget: long-press the home screen → **+** → Scriptable → pick small, medium or large → Edit Widget → Script: **AS-Player**. Lock-screen widgets (circular and rectangular) work too. Tapping the widget opens the player where you left off.

To change the player's look, edit `scriptable/src/player.html`, then run `python3 scripts/build_player.py`. That inlines the HTML into `AS-Player.js`, which stays a single file to paste.

## Progress file

`arab-spring-progress.json`:

```json
{ "current": 0, "positions": {"syria-01": 512}, "finished": ["master-01"], "cards": {},
  "stats": { "xp": 0, "speed": 1.25, "streak": 0, "best": 0, "lastDay": "", "days": {}, "badges": [], "listened": 0, "durations": {} } }
```

An episode counts as finished at 95% played or via **Mark finished**. Each script re-reads the file before writing and only replaces its own keys. AS-Cards writes `cards`; AS-Player writes `current`, `positions`, `finished` and `stats`.

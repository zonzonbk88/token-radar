# Screenshots — capture instructions (for whoever runs a browser)

The three gate screenshots still need to be captured from a real browser:
this build VM's Chromium is policy-locked to the agent harness and cannot
run headless from a shell.

1. Produce a render: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json`
   (it stops at the dossier step until screenshots/ is non-empty; out/ is
   still fully written before that point).
2. Open `out/dashboard/index.html` in a browser at a 1440x1000 viewport and save:
   - `screenshots/1-board.jpg`    — route `#/`
   - `screenshots/2-detail.jpg`   — route `#p/sentora-curator`
   - `screenshots/3-filtered.jpg` — route `#f/Lending`
   JPEG quality ~80, each file 300–350 KB, long side <= 1440, short side >= 800.
3. Re-run step 1: main.ts now copies the screenshots and writes dossier.json.
4. Commit the screenshots with the rest of the entry.

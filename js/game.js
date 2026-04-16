(function () {
  "use strict";

  /** Основные направления: ^ > v <  + изгибы 1..8 (см. уровни.js) */
  const CHAR_TO_DIR = {
    "^": "u", ">": "r", v: "d", "<": "l",
    "1": "u", "2": "u", "3": "d", "4": "d",
    "5": "r", "6": "r", "7": "l", "8": "l",
  };

  /** Для символа — код изгиба (или null если прямая) */
  const CHAR_TO_BEND = {
    "1": "ul", "2": "ur",
    "3": "dl", "4": "dr",
    "5": "rt", "6": "rb",
    "7": "lt", "8": "lb",
  };

  const DIR_DELTA = { u: [-1, 0], r: [0, 1], d: [1, 0], l: [0, -1] };

  const LS_COINS = "arrowgo_coins_v1";
  const LS_HINTS = "arrowgo_hints_v1";
  const LS_HIGHLIGHT = "arrowgo_highlight_v1";
  const LS_LEVEL = "arrowgo_level_idx_v1";
  const LS_TUTORIAL_DONE = "arrowgo_tutorial_done_v1";

  /** @type {Array<Array<{dir:string, bend:string|null}|null>> | null} */
  let grid = null;
  let rows = 0;
  let cols = 0;
  let levelIndex = 0;
  let lives = 3;
  let maxLives = 3;
  let coins = 0;
  let hints = 2;
  let highlightValid = true;
  let undoStack = [];
  let animating = false;
  let hintCell = null;
  let tutorialActive = false;
  let forceTutorial = false;

  const el = (id) => document.getElementById(id);

  function loadNumber(key, fallback) {
    const v = localStorage.getItem(key);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function loadBool(key, fallback) {
    const v = localStorage.getItem(key);
    if (v === "0") return false;
    if (v === "1") return true;
    return fallback;
  }

  function parseLevel(def) {
    return def.map.map((line) =>
      line.split("").map((ch) => {
        if (ch === "." || ch === " ") return null;
        const dir = CHAR_TO_DIR[ch];
        if (!dir) return null;
        const bend = CHAR_TO_BEND[ch] || null;
        return { dir, bend };
      })
    );
  }

  function cloneGrid(g) {
    return g.map((row) => row.map((v) => (v ? { dir: v.dir, bend: v.bend } : null)));
  }

  function isPathClear(g, r, c, dir) {
    const [dr, dc] = DIR_DELTA[dir];
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      if (g[nr][nc] != null) return false;
      nr += dr;
      nc += dc;
    }
    return true;
  }

  function isSolvable(g0) {
    const g = cloneGrid(g0);

    function empty() {
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) if (g[r][c] != null) return false;
      return true;
    }

    function dfs() {
      if (empty()) return true;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = g[r][c];
          if (!t) continue;
          if (isPathClear(g, r, c, t.dir)) {
            const save = t;
            g[r][c] = null;
            if (dfs()) {
              g[r][c] = save;
              return true;
            }
            g[r][c] = save;
          }
        }
      }
      return false;
    }

    return dfs();
  }

  /** Рисует стрелку — прямую или с изгибом. SVG всегда 24×24 (квадрат). */
  function arrowSvg(type) {
    const stroke = 3;
    const common = `fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`;

    if (!type.bend) {
      // Прямая стрелка: тонкая линия с наконечником сверху.
      const rot = { u: 0, r: 90, d: 180, l: -90 }[type.dir];
      return `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="transform: rotate(${rot}deg)">
        <g ${common}>
          <line x1="12" y1="22" x2="12" y2="5"/>
          <polyline points="6,11 12,3 18,11"/>
        </g>
      </svg>`;
    }

    // L-образная стрелка. 8 вариантов, пути и наконечники заданы явно.
    const paths = {
      // tip up, tail left  (L идёт: слева → центр → вверх)
      ul: { d: "M 3 18 H 12 V 5",  a: "6,11 12,3 18,11" },
      // tip up, tail right
      ur: { d: "M 21 18 H 12 V 5", a: "6,11 12,3 18,11" },
      // tip down, tail left
      dl: { d: "M 3 6 H 12 V 19",  a: "6,13 12,21 18,13" },
      // tip down, tail right
      dr: { d: "M 21 6 H 12 V 19", a: "6,13 12,21 18,13" },
      // tip right, tail top
      rt: { d: "M 6 3 V 12 H 19",  a: "13,6 21,12 13,18" },
      // tip right, tail bottom
      rb: { d: "M 6 21 V 12 H 19", a: "13,6 21,12 13,18" },
      // tip left, tail top
      lt: { d: "M 18 3 V 12 H 5",  a: "11,6 3,12 11,18" },
      // tip left, tail bottom
      lb: { d: "M 18 21 V 12 H 5", a: "11,6 3,12 11,18" },
    };
    const p = paths[type.bend];
    return `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g ${common}>
        <path d="${p.d}"/>
        <polyline points="${p.a}"/>
      </g>
    </svg>`;
  }

  function countArrows() {
    let n = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (grid[r][c] != null) n++;
    return n;
  }

  function renderGrid() {
    const host = el("grid");
    host.innerHTML = "";
    host.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    host.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    // --ar-ratio — десятичное число (cols/rows), используется в CSS и в aspect-ratio, и в calc().
    host.style.setProperty("--ar-ratio", String(cols / rows));
    // На плотных полях уменьшаем зазор, чтобы ячейки не становились крошечными.
    const dense = Math.max(cols, rows) >= 9;
    host.style.gap = dense ? "3px" : "6px";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = grid[r][c];
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell" + (t ? "" : " cell--empty");
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        if (t) {
          cell.innerHTML = `<span class="arrow">${arrowSvg(t)}</span>`;
          const ok = isPathClear(grid, r, c, t.dir);
          if (highlightValid && ok) cell.classList.add("cell--valid");
          if (hintCell && hintCell.r === r && hintCell.c === c) cell.classList.add("cell--hint");
        }
        cell.addEventListener("click", () => onCellTap(r, c));
        host.appendChild(cell);
      }
    }

    placeTutorialIfNeeded();
  }

  function setHeartsDisplay() {
    const wrap = el("hearts");
    const heart = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 21s-7-4.35-9.33-9.03C.88 8.3 3 4.5 6.7 4.5c2.06 0 3.5 1.1 4.3 2.3h2c.8-1.2 2.24-2.3 4.3-2.3 3.7 0 5.82 3.8 4.03 7.47C19 16.65 12 21 12 21Z"/></svg>`;
    let html = "";
    for (let i = 0; i < maxLives; i++) {
      html += `<span class="${i < lives ? "" : "lost"}">${heart}</span>`;
    }
    wrap.innerHTML = html;
  }

  function syncHud() {
    el("coins").textContent = String(coins);
    el("hint-badge").textContent = String(hints);
    setHeartsDisplay();
    const def = window.ARROWGO_LEVELS[levelIndex];
    el("level-line").textContent = def.title;
    el("diff-pill").textContent = def.difficulty;
    el("btn-hint").disabled = hints <= 0 || animating || countArrows() === 0;
  }

  function showToast(msg) {
    const t = el("toast");
    t.textContent = msg;
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(() => {
      t.textContent = "";
    }, 2200);
  }

  function burstConfetti() {
    const host = el("confetti");
    host.innerHTML = "";
    const colors = ["#59c6ff", "#ff6f9c", "#ffd260", "#81e8a8", "#b39bff", "#ffffff"];
    const n = 80;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.style.left = `${Math.random() * 100}%`;
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = `${Math.random() * 0.45}s`;
      s.style.animationDuration = `${2 + Math.random() * 1.2}s`;
      host.appendChild(s);
    }
    setTimeout(() => {
      host.innerHTML = "";
    }, 3200);
  }

  /* ---------------- Tutorial ---------------- */

  function placeTutorialIfNeeded() {
    const def = window.ARROWGO_LEVELS[levelIndex];
    const done = loadBool(LS_TUTORIAL_DONE, false);
    const shouldShow = def && def.tutorial && (forceTutorial || !done);

    const overlay = el("tutorial");
    if (!shouldShow) {
      tutorialActive = false;
      overlay.classList.remove("show");
      return;
    }

    const target = findHint();
    if (!target) {
      tutorialActive = false;
      overlay.classList.remove("show");
      return;
    }

    tutorialActive = true;
    overlay.classList.add("show");

    requestAnimationFrame(() => {
      const gridEl = el("grid");
      const cells = gridEl.querySelectorAll(".cell");
      const cellEl = cells[target.r * cols + target.c];
      if (!cellEl) return;

      // Координаты относительно .board (в которой лежит #tutorial).
      const boardEl = overlay.parentNode;
      const brect = boardEl.getBoundingClientRect();
      const crect = cellEl.getBoundingClientRect();
      const cx = crect.left - brect.left + crect.width * 0.68;
      const cy = crect.top - brect.top + crect.height * 0.55;

      const hand = el("tutorial-hand");
      hand.style.left = `${cx}px`;
      hand.style.top = `${cy}px`;

      const tip = el("tutorial-tip");
      const tipX = crect.left - brect.left + crect.width / 2;
      const tipY = crect.bottom - brect.top + 18;
      tip.style.left = `${tipX}px`;
      tip.style.top = `${tipY}px`;
    });
  }

  function finishTutorial() {
    tutorialActive = false;
    forceTutorial = false;
    localStorage.setItem(LS_TUTORIAL_DONE, "1");
    el("tutorial").classList.remove("show");
  }

  /* ---------------- Gameplay ---------------- */

  function applyLevel(idx) {
    const def = window.ARROWGO_LEVELS[idx];
    if (!def) return;
    levelIndex = idx;
    rows = def.rows;
    cols = def.cols;
    maxLives = def.lives != null ? def.lives : 3;
    lives = maxLives;
    grid = parseLevel(def);
    undoStack = [];
    hintCell = null;

    if (!isSolvable(grid)) {
      console.warn("Уровень может быть неразрешим:", def.id);
    }

    el("headline").textContent = "Уберите стрелки";
    renderGrid();
    syncHud();
    localStorage.setItem(LS_LEVEL, String(levelIndex));
  }

  function spawnRipple(cellEl) {
    const r = document.createElement("span");
    r.className = "ripple";
    cellEl.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  function afterFlyClear(r, c) {
    grid[r][c] = null;
    animating = false;
    hintCell = null;
    if (countArrows() === 0) {
      coins += 8;
      localStorage.setItem(LS_COINS, String(coins));
      renderGrid();
      openWin();
      syncHud();
      return;
    }
    renderGrid();
    syncHud();
  }

  function onCellTap(r, c) {
    if (animating) return;
    const t = grid[r][c];
    if (!t) return;

    const cells = el("grid").querySelectorAll(".cell");
    const idx = r * cols + c;
    const cellEl = cells[idx];

    spawnRipple(cellEl);

    if (!isPathClear(grid, r, c, t.dir)) {
      lives -= 1;
      cellEl.classList.add("cell--err");
      setTimeout(() => cellEl.classList.remove("cell--err"), 500);
      setHeartsDisplay();
      syncHud();
      if (lives <= 0) {
        el("modal-lose").classList.add("open");
      }
      return;
    }

    if (tutorialActive) finishTutorial();

    undoStack.push(cloneGrid(grid));
    animating = true;
    hintCell = null;
    const flyClass = { u: "cell--fly-u", r: "cell--fly-r", d: "cell--fly-d", l: "cell--fly-l" }[t.dir];
    cellEl.classList.add("cell--fly", flyClass);
    const dur = 500;
    setTimeout(() => afterFlyClear(r, c), dur);
  }

  function findHint() {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = grid[r][c];
        if (t && isPathClear(grid, r, c, t.dir)) return { r, c };
      }
    }
    return null;
  }

  function onHint() {
    if (hints <= 0 || animating) return;
    const h = findHint();
    if (!h) {
      showToast("Нет безопасного хода");
      return;
    }
    hints -= 1;
    localStorage.setItem(LS_HINTS, String(hints));
    hintCell = h;
    renderGrid();
    syncHud();
    showToast("Можно снять подсвеченную стрелку");
    setTimeout(() => {
      if (hintCell && hintCell.r === h.r && hintCell.c === h.c) {
        hintCell = null;
        renderGrid();
      }
    }, 2500);
  }

  /* ---------------- Win screen ---------------- */

  function openWin() {
    const def = window.ARROWGO_LEVELS[levelIndex];
    const card = el("win-card");
    const parsed = parseLevel(def);
    card.innerHTML = "";
    card.style.gridTemplateColumns = `repeat(${def.cols}, 1fr)`;
    card.style.gridTemplateRows = `repeat(${def.rows}, 1fr)`;
    card.style.setProperty("--ar-ratio", String(def.cols / def.rows));
    for (let r = 0; r < def.rows; r++) {
      for (let c = 0; c < def.cols; c++) {
        const t = parsed[r][c];
        const slot = document.createElement("div");
        slot.className = "win-slot";
        if (t) {
          slot.innerHTML = `<span class="arrow">${arrowSvg(t)}</span>`;
        }
        card.appendChild(slot);
      }
    }

    const nextIdx = levelIndex + 1;
    const nextDef = window.ARROWGO_LEVELS[nextIdx];
    el("win-next-sub").textContent = nextDef ? nextDef.title : "Снова уровень 1";

    el("modal-win").classList.add("open");
    burstConfetti();
  }

  function nextLevel() {
    el("modal-win").classList.remove("open");
    const next = levelIndex + 1;
    if (next >= window.ARROWGO_LEVELS.length) {
      showToast("Вы прошли все уровни!");
      applyLevel(0);
      return;
    }
    applyLevel(next);
  }

  function restartLevel() {
    el("modal-lose").classList.remove("open");
    el("modal-win").classList.remove("open");
    applyLevel(levelIndex);
  }

  function goHome() {
    el("modal-win").classList.remove("open");
    el("modal-lose").classList.remove("open");
    el("screen-game").classList.remove("active");
    el("screen-home").classList.add("active");
  }

  function startGame() {
    el("screen-home").classList.remove("active");
    el("screen-game").classList.add("active");
    const idx = Math.min(loadNumber(LS_LEVEL, 0), window.ARROWGO_LEVELS.length - 1);
    applyLevel(Math.max(0, idx));
  }

  /* ---------------- Settings ---------------- */

  function openSettings() {
    el("chk-highlight").checked = highlightValid;
    el("chk-tutorial").checked = false;
    el("modal-settings").classList.add("open");
  }

  function saveSettings() {
    highlightValid = el("chk-highlight").checked;
    localStorage.setItem(LS_HIGHLIGHT, highlightValid ? "1" : "0");

    if (el("chk-tutorial").checked) {
      localStorage.removeItem(LS_TUTORIAL_DONE);
      forceTutorial = true;
      if (levelIndex !== 0) applyLevel(0);
    }

    el("modal-settings").classList.remove("open");
    renderGrid();
    syncHud();
  }

  /* ---------------- Init ---------------- */

  function init() {
    coins = loadNumber(LS_COINS, 42);
    hints = loadNumber(LS_HINTS, 2);
    highlightValid = loadBool(LS_HIGHLIGHT, true);

    el("btn-play").addEventListener("click", startGame);
    el("btn-back").addEventListener("click", goHome);
    el("btn-settings").addEventListener("click", openSettings);
    el("btn-settings-save").addEventListener("click", saveSettings);
    el("btn-settings-close").addEventListener("click", () =>
      el("modal-settings").classList.remove("open")
    );
    el("btn-hint").addEventListener("click", onHint);
    el("btn-levels").addEventListener("click", () => {
      if (animating) return;
      const n = window.ARROWGO_LEVELS.length;
      const next = (levelIndex + 1) % n;
      el("modal-win").classList.remove("open");
      el("modal-lose").classList.remove("open");
      applyLevel(next);
      showToast(window.ARROWGO_LEVELS[next].title);
    });
    el("btn-win-next").addEventListener("click", nextLevel);
    el("btn-win-home").addEventListener("click", goHome);
    el("btn-lose-restart").addEventListener("click", restartLevel);
    el("btn-lose-home").addEventListener("click", () => {
      el("modal-lose").classList.remove("open");
      goHome();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        el("modal-settings").classList.remove("open");
      }
    });

    window.addEventListener("resize", () => {
      if (tutorialActive) placeTutorialIfNeeded();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

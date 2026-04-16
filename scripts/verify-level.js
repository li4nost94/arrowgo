#!/usr/bin/env node
/** Проверка решаемости уровня (дублирует логику game.js). */
const CHAR_TO_DIR = {
  "^": "u", ">": "r", v: "d", "<": "l",
  "1": "u", "2": "u", "3": "d", "4": "d",
  "5": "r", "6": "r", "7": "l", "8": "l",
};
const DIR_DELTA = { u: [-1, 0], r: [0, 1], d: [1, 0], l: [0, -1] };

function parse(map) {
  return map.map((line) =>
    line.split("").map((ch) => {
      if (ch === "." || ch === " ") return null;
      const dir = CHAR_TO_DIR[ch];
      return dir ? { dir } : null;
    })
  );
}

function clone(g) {
  return g.map((row) => row.map((v) => (v ? { ...v } : null)));
}

function isPathClear(g, rows, cols, r, c, dir) {
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

function gridKey(g, rows, cols) {
  let s = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = g[r][c];
      s += t ? t.dir[0] : ".";
    }
  }
  return s;
}

function isSolvable(g0, rows, cols) {
  const memo = new Map();
  const g = clone(g0);
  const empty = () => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) if (g[r][c] != null) return false;
    return true;
  };
  function dfs() {
    const k = gridKey(g, rows, cols);
    if (memo.has(k)) return memo.get(k);
    if (empty()) {
      memo.set(k, true);
      return true;
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = g[r][c];
        if (!t) continue;
        if (isPathClear(g, rows, cols, r, c, t.dir)) {
          const save = t;
          g[r][c] = null;
          if (dfs()) {
            g[r][c] = save;
            memo.set(k, true);
            return true;
          }
          g[r][c] = save;
        }
      }
    }
    memo.set(k, false);
    return false;
  }
  return dfs();
}

const map = process.argv.slice(2);
if (map.length === 0) {
  console.error("Usage: node verify-level.js <line1> <line2> ...");
  process.exit(1);
}
const rows = map.length;
const cols = map[0].length;
if (!map.every((l) => l.length === cols)) {
  console.error("All lines must have same length");
  process.exit(1);
}
const g = parse(map);
console.log("rows", rows, "cols", cols, "arrows", g.flat().filter(Boolean).length);
console.log("solvable", isSolvable(g, rows, cols));

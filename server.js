const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { randomUUID } = require("crypto");

const app = express();
const PORT = process.env.PORT || 4173;
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || "/");
const DAY_MS = 24 * 60 * 60 * 1000;
const COOKIE_NAME = "fastype_user";
const DB_PATH = path.join(__dirname, "fastype.db");

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function normalizeBasePath(input) {
  if (!input || input === "/") return "/";
  const cleaned = `/${String(input).trim().replace(/^\/+|\/+$/g, "")}`;
  return cleaned;
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT,
      last_seen_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      wpm INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_ip_last_seen ON users(ip, last_seen_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_results_user ON results(user_id, created_at)`);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function sanitizeName(name) {
  if (typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function isActiveUser(user, now) {
  return Boolean(user && now - user.last_seen_at <= DAY_MS);
}

async function cleanupExpired(now) {
  const cutoff = now - DAY_MS;
  await run(`DELETE FROM results WHERE created_at < ?`, [cutoff]);
}

async function resolveActiveUser(req, now) {
  const ip = getClientIp(req);
  const cookieId = req.cookies[COOKIE_NAME];
  let user = null;

  if (cookieId) {
    const byCookie = await get(`SELECT * FROM users WHERE id = ?`, [cookieId]);
    if (isActiveUser(byCookie, now)) {
      user = byCookie;
    }
  }

  if (!user) {
    user = await get(
      `
      SELECT * FROM users
      WHERE ip = ?
      AND last_seen_at >= ?
      ORDER BY last_seen_at DESC
      LIMIT 1
      `,
      [ip, now - DAY_MS]
    );
  }

  if (user) {
    await run(`UPDATE users SET ip = ?, last_seen_at = ? WHERE id = ?`, [ip, now, user.id]);
  }

  return user;
}

app.use(express.json());
app.use(cookieParser());
const router = express.Router();
router.use(express.static(path.join(__dirname, "public")));

router.get("/api/session", async (req, res) => {
  try {
    const now = Date.now();
    await cleanupExpired(now);
    const user = await resolveActiveUser(req, now);

    if (!user) {
      res.clearCookie(COOKIE_NAME);
      return res.json({ active: false });
    }

    res.cookie(COOKIE_NAME, user.id, {
      maxAge: 30 * DAY_MS,
      sameSite: "lax",
      httpOnly: true
    });
    return res.json({ active: true, name: user.name });
  } catch (error) {
    return res.status(500).json({ error: "Failed to resolve session." });
  }
});

router.post("/api/session", async (req, res) => {
  try {
    const now = Date.now();
    await cleanupExpired(now);

    const name = sanitizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: "Name is required." });
    }

    const ip = getClientIp(req);
    const existing = await resolveActiveUser(req, now);

    if (existing) {
      await run(`UPDATE users SET name = ?, ip = ?, last_seen_at = ? WHERE id = ?`, [
        name,
        ip,
        now,
        existing.id
      ]);
      res.cookie(COOKIE_NAME, existing.id, {
        maxAge: 30 * DAY_MS,
        sameSite: "lax",
        httpOnly: true
      });
      return res.json({ name });
    }

    const id = randomUUID();
    await run(`INSERT INTO users (id, name, ip, last_seen_at) VALUES (?, ?, ?, ?)`, [
      id,
      name,
      ip,
      now
    ]);
    res.cookie(COOKIE_NAME, id, {
      maxAge: 30 * DAY_MS,
      sameSite: "lax",
      httpOnly: true
    });
    return res.json({ name });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create session." });
  }
});

router.post("/api/results", async (req, res) => {
  try {
    const now = Date.now();
    await cleanupExpired(now);
    const user = await resolveActiveUser(req, now);

    if (!user) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: "Session expired. Enter name again." });
    }

    const wpm = Number(req.body?.wpm);
    const accuracy = Number(req.body?.accuracy);

    if (!Number.isFinite(wpm) || wpm < 0 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
      return res.status(400).json({ error: "Invalid result payload." });
    }

    await run(
      `INSERT INTO results (user_id, user_name, wpm, accuracy, created_at) VALUES (?, ?, ?, ?, ?)`,
      [user.id, user.name, Math.round(wpm), Number(accuracy.toFixed(2)), now]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to save result." });
  }
});

router.get("/api/leaderboard", async (req, res) => {
  try {
    const now = Date.now();
    await cleanupExpired(now);
    const cutoff = now - DAY_MS;

    const rows = await all(
      `
      WITH ranked AS (
        SELECT
          user_id,
          user_name,
          wpm,
          accuracy,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY wpm DESC, accuracy DESC, created_at ASC
          ) AS rn
        FROM results
        WHERE created_at >= ?
      )
      SELECT user_name AS name, wpm, accuracy, created_at AS createdAt
      FROM ranked
      WHERE rn = 1
      ORDER BY wpm DESC, accuracy DESC, createdAt ASC
      LIMIT 20
      `,
      [cutoff]
    );

    return res.json({ leaderboard: rows });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch leaderboard." });
  }
});

router.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(BASE_PATH, router);

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`fastype running on http://localhost:${PORT}${BASE_PATH}`);
    });
  })
  .catch((error) => {
    console.error("DB init failed:", error);
    process.exit(1);
  });

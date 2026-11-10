require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

const rateLimit = require("express-rate-limit");
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "borrowbox_db";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEMO_LENDER_EMAIL = (process.env.DEMO_LENDER_EMAIL || "").trim().toLowerCase();
const DEMO_LENDER_PASSWORD = process.env.DEMO_LENDER_PASSWORD;
const DEMO_BORROWER_EMAIL = (process.env.DEMO_BORROWER_EMAIL || "").trim().toLowerCase();
const DEMO_BORROWER_PASSWORD = process.env.DEMO_BORROWER_PASSWORD;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/calendar/callback`;
const GOOGLE_TIME_ZONE = process.env.GOOGLE_TIME_ZONE || "Asia/Manila";
const GOOGLE_CALENDAR_CONFIGURED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

if (!/^[a-zA-Z0-9_]+$/.test(DB_NAME)) {
    throw new Error("DB_NAME may contain only letters, numbers, and underscores.");
}
if (!ADMIN_PASSWORD || !DEMO_LENDER_PASSWORD || !DEMO_BORROWER_PASSWORD) {
    throw new Error("ADMIN_PASSWORD, DEMO_LENDER_PASSWORD, and DEMO_BORROWER_PASSWORD must be set in .env");
}
if (!isValidEmail(ADMIN_EMAIL) || ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD.length > 128) {
    throw new Error("ADMIN_EMAIL must be valid and ADMIN_PASSWORD must be 8-128 characters.");
}
if (!isValidEmail(DEMO_LENDER_EMAIL) || DEMO_LENDER_PASSWORD.length < 8 || DEMO_LENDER_PASSWORD.length > 128) {
    throw new Error("DEMO_LENDER_EMAIL must be valid and DEMO_LENDER_PASSWORD must be 8-128 characters.");
}
if (!isValidEmail(DEMO_BORROWER_EMAIL) || DEMO_BORROWER_PASSWORD.length < 8 || DEMO_BORROWER_PASSWORD.length > 128) {
    throw new Error("DEMO_BORROWER_EMAIL must be valid and DEMO_BORROWER_PASSWORD must be 8-128 characters.");
}
if (new Set([ADMIN_EMAIL, DEMO_LENDER_EMAIL, DEMO_BORROWER_EMAIL]).size !== 3) {
    throw new Error("Admin, sample lender, and sample borrower must use different email addresses.");
}
if (GOOGLE_CALENDAR_CONFIGURED && !/^[a-f\d]{64}$/i.test(TOKEN_ENCRYPTION_KEY || "")) {
    throw new Error("Set TOKEN_ENCRYPTION_KEY to 64 hexadecimal characters to enable Google Calendar.");
}
try {
    new Intl.DateTimeFormat(undefined, { timeZone: GOOGLE_TIME_ZONE });
} catch {
    throw new Error("GOOGLE_TIME_ZONE must be a valid IANA time zone.");
}

const logsDir = path.join(__dirname, "logs");
fs.mkdirSync(logsDir, { recursive: true });
const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), { flags: "a" });
app.use(morgan("combined", { stream: accessLogStream }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
    name: "borrowbox.sid",
    secret: process.env.SESSION_SECRET || require("crypto").randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/images", express.static(path.join(__dirname, "images")));

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", requireAuth, express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        callback(null, unique + path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype.startsWith("image/")) return callback(null, true);
        callback(new Error("Only image files are allowed"));
    }
});

let db;

function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ message: "Please log in to continue." });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== "admin") {
        return res.status(req.session.user ? 403 : 401).json({
            message: req.session.user ? "Administrator access is required." : "Please log in to continue."
        });
    }
    next();
}

function requireBorrower(req, res, next) {
    if (!req.session.user || req.session.user.role !== "user") {
        return res.status(req.session.user ? 403 : 401).json({
            message: req.session.user ? "Only borrower accounts can use this feature." : "Please log in to continue."
        });
    }
    next();
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => error ? reject(error) : resolve());
    });
}

function isValidEmail(email) {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

class CalendarIntegrationError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.status = status;
    }
}

function encryptToken(token) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(TOKEN_ENCRYPTION_KEY, "hex"), iv);
    const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptToken(value) {
    const [iv, authTag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(TOKEN_ENCRYPTION_KEY, "hex"), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function isValidLocalDateTime(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
        return false;
    }
    const [date, time] = value.split("T");
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const parsed = new Date(year, month - 1, day, hour, minute);
    return parsed.getFullYear() === year &&
        parsed.getMonth() === month - 1 &&
        parsed.getDate() === day &&
        parsed.getHours() === hour &&
        parsed.getMinutes() === minute;
}

async function exchangeGoogleToken(parameters) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            ...parameters
        })
    });
    const data = await response.json();
    if (!response.ok) {
        console.error("Google OAuth token request failed:", data.error);
        throw new CalendarIntegrationError("Google Calendar authorization failed. Please reconnect your account.");
    }
    return data;
}

async function addCalendarEvent(refreshToken, item, borrowerEmail) {
    const tokens = await exchangeGoogleToken({
        grant_type: "refresh_token",
        refresh_token: refreshToken
    });
    const eventId = crypto.createHash("sha256").update(`borrowbox-request-${item.id}`).digest("hex");
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            summary: `BorrowBox: ${item.item_name}`,
            description: `Borrow from ${item.owner_name || "BorrowBox member"}.\nPickup location: ${item.location}\nReturn by: ${item.return_by}\nBorrower: ${borrowerEmail}`,
            location: item.location,
            id: eventId,
            start: {
                dateTime: `${item.available_from.replace(" ", "T")}:00`,
                timeZone: GOOGLE_TIME_ZONE
            },
            end: {
                dateTime: `${item.return_by.replace(" ", "T")}:00`,
                timeZone: GOOGLE_TIME_ZONE
            }
        })
    });
    const data = await response.json();
    if (!response.ok) {
        if (response.status === 409) {
            const existingResponse = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
                { headers: { Authorization: `Bearer ${tokens.access_token}` } }
            );
            const existing = await existingResponse.json();
            if (existingResponse.ok && existing.status !== "cancelled") return existing.id;
        }
        console.error("Google Calendar event creation failed:", data.error && data.error.message);
        throw new CalendarIntegrationError(
            "Could not add the borrowing dates to Google Calendar. Reconnect Google Calendar and try approving again."
        );
    }
    if (typeof data.id !== "string") {
        throw new CalendarIntegrationError("Google Calendar did not confirm the event.");
    }
    return data.id;
}

async function ensureColumn(table, column, definition) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [DB_NAME, table, column]
    );
    if (rows.length === 0) {
        await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
}

async function initializeDatabase() {
    const bootstrap = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD
    });
    await bootstrap.query(
        `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await bootstrap.end();

    db = mysql.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        dateStrings: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS item (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            item_name VARCHAR(180) NOT NULL,
            category VARCHAR(80) NOT NULL,
            availability VARCHAR(180) NOT NULL,
            location VARCHAR(180) NOT NULL,
            item_condition VARCHAR(80) NOT NULL,
            description TEXT,
            preferred_contact VARCHAR(190) NOT NULL DEFAULT 'Not provided',
            file_attachment VARCHAR(255),
            owner_id INT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Available',
            available_from DATETIME NULL,
            return_by DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY item_owner_id_idx (owner_id)
        ) ENGINE=InnoDB
    `);
    await ensureColumn("item", "owner_id", "INT NULL");
    await ensureColumn("item", "status", "VARCHAR(30) NOT NULL DEFAULT 'Available'");
    await ensureColumn("item", "created_at", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await ensureColumn("item", "available_from", "DATETIME NULL");
    await ensureColumn("item", "return_by", "DATETIME NULL");
    await db.query(`
        CREATE TABLE IF NOT EXISTS borrow_requests (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            item_id INT NOT NULL,
            borrower_id INT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Pending',
            google_event_id VARCHAR(255) NULL,
            borrower_returned_at DATETIME NULL,
            owner_returned_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY request_item_id_idx (item_id),
            KEY request_borrower_id_idx (borrower_id),
            CONSTRAINT request_item_fk FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE,
            CONSTRAINT request_borrower_fk FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    `);
    await ensureColumn("borrow_requests", "google_event_id", "VARCHAR(255) NULL");
    await ensureColumn("borrow_requests", "borrower_returned_at", "DATETIME NULL");
    await ensureColumn("borrow_requests", "owner_returned_at", "DATETIME NULL");
    await ensureColumn("users", "google_email", "VARCHAR(190) NULL");
    await ensureColumn("users", "google_refresh_token", "TEXT NULL");

    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db.query(
        `INSERT IGNORE INTO users (name, email, password_hash, role)
         VALUES ('BorrowBox Administrator', ?, ?, 'admin')`,
        [ADMIN_EMAIL, adminHash]
    );
    const [[admin]] = await db.query("SELECT id, role FROM users WHERE email = ?", [ADMIN_EMAIL]);
    if (admin.role !== "admin") {
        throw new Error(`The configured administrator email ${ADMIN_EMAIL} belongs to a non-admin account.`);
    }

    const demoLenderHash = await bcrypt.hash(DEMO_LENDER_PASSWORD, 12);
    await db.query(
        `INSERT IGNORE INTO users (name, email, password_hash, role)
         VALUES ('BorrowBox Sample Lender', ?, ?, 'user')`,
        [DEMO_LENDER_EMAIL, demoLenderHash]
    );
    const [[demoLender]] = await db.query("SELECT id FROM users WHERE email = ?", [DEMO_LENDER_EMAIL]);
    const demoBorrowerHash = await bcrypt.hash(DEMO_BORROWER_PASSWORD, 12);
    await db.query(
        `INSERT IGNORE INTO users (name, email, password_hash, role)
         VALUES ('BorrowBox Sample Borrower', ?, ?, 'user')`,
        [DEMO_BORROWER_EMAIL, demoBorrowerHash]
    );
    const [[demoBorrower]] = await db.query("SELECT id FROM users WHERE email = ?", [DEMO_BORROWER_EMAIL]);

    const [[itemCount]] = await db.query("SELECT COUNT(*) AS total FROM item");
    const starterItems = [
        ["Scientific Calculator", "School Supplies", "Talamban Campus - Library", "Good", "Casio scientific calculator available for short-term borrowing."],
        ["HDMI Cable", "Electronics", "Talamban Campus - Library", "Good", "2-meter HDMI cable for classroom presentations."],
        ["Black Umbrella", "Other", "Talamban Campus - Main Gate", "Like New", "Compact umbrella; please return it before the end of the day."],
        ["USB Flash Drive", "Electronics", "Engineering Building", "Good", "32GB USB flash drive. Please safely eject after use."],
        ["Java Programming Book", "Books", "Talamban Campus - Library", "Used", "Introductory Java programming textbook, with some highlighting."]
    ];
    const missingStarterItems = Math.max(0, 5 - Number(itemCount.total));
    if (missingStarterItems > 0) {
        await db.query("UPDATE borrow_requests SET status = 'Borrowing' WHERE status = 'Approved'");
        await db.query(
            `UPDATE item
             SET status = 'Borrowed'
             WHERE status = 'Available'
               AND EXISTS (
                   SELECT 1 FROM borrow_requests
                   WHERE borrow_requests.item_id = item.id
                     AND borrow_requests.status = 'Borrowing'
               )`
        );
    }
    for (const [index, sample] of starterItems.slice(0, missingStarterItems).entries()) {
        await db.query(
            `INSERT INTO item
             (item_name, category, availability, location, item_condition, description,
              preferred_contact, owner_id, available_from, return_by)
             VALUES (?, ?, CONCAT(DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), '%Y-%m-%d'), ' ', ?, ' to ', DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), '%Y-%m-%d'), ' ', ?), ?, ?, ?, ?, ?, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL ? HOUR), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL ? HOUR))`,
            [
                sample[0],
                sample[1],
                `${String(10 + index).padStart(2, "0")}:00`,
                `${String(16 + index).padStart(2, "0")}:00`,
                sample[2],
                sample[3],
                sample[4],
                `BorrowBox Sample Lender (${DEMO_LENDER_EMAIL})`,
                demoLender.id,
                10 + index,
                16 + index
            ]
        );
    }
    await db.query(
        `UPDATE item
         SET owner_id = ?, preferred_contact = ?,
             available_from = DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL 10 HOUR),
             return_by = DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL 16 HOUR),
             availability = CONCAT(
                 DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), '%Y-%m-%d'),
                 ' 10:00 to ',
                 DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), '%Y-%m-%d'),
                 ' 16:00'
             )
         WHERE item_name IN (?, ?, ?, ?, ?)
           AND owner_id = ?
           AND (available_from IS NULL OR return_by IS NULL)`,
        [
            demoLender.id,
            `BorrowBox Sample Lender (${DEMO_LENDER_EMAIL})`,
            ...starterItems.map((item) => item[0]),
            admin.id
        ]
    );
    await db.query(
        `DELETE borrow_requests
         FROM borrow_requests
         INNER JOIN item ON item.id = borrow_requests.item_id
         WHERE item.owner_id = ?`,
        [admin.id]
    );
    const [adminItemsDeleted] = await db.query(
        "DELETE FROM item WHERE owner_id = ?",
        [admin.id]
    );
    const [[requestCount]] = await db.query("SELECT COUNT(*) AS total FROM borrow_requests");
    if (Number(requestCount.total) === 0) {
        const [demoItems] = await db.query(
            "SELECT id, item_name FROM item WHERE item_name IN (?, ?, ?) ORDER BY FIELD(item_name, ?, ?, ?)",
            [
                "Scientific Calculator", "HDMI Cable", "Black Umbrella",
                "Scientific Calculator", "HDMI Cable", "Black Umbrella"
            ]
        );
        if (demoItems.length === 3) {
            const [calculator, cable, umbrella] = demoItems;
            await db.query(
                `UPDATE item
                 SET available_from = DATE_SUB(NOW(), INTERVAL 1 HOUR),
                     return_by = DATE_ADD(NOW(), INTERVAL 1 DAY),
                     availability = CONCAT(
                         DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 HOUR), '%Y-%m-%d %H:%i'),
                         ' to ',
                         DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 DAY), '%Y-%m-%d %H:%i')
                     ),
                     status = 'Borrowed'
                 WHERE id = ?`,
                [cable.id]
            );
            await db.query(
                `INSERT INTO borrow_requests
                    (item_id, borrower_id, status, created_at)
                 VALUES (?, ?, 'Pending', DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
                        (?, ?, 'Borrowing', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
                        (?, ?, 'Returned', DATE_SUB(NOW(), INTERVAL 3 DAY))`,
                [calculator.id, demoBorrower.id, cable.id, demoBorrower.id, umbrella.id, demoBorrower.id]
            );
            await db.query(
                `UPDATE borrow_requests
                 SET borrower_returned_at = DATE_SUB(NOW(), INTERVAL 2 DAY),
                     owner_returned_at = DATE_SUB(NOW(), INTERVAL 2 DAY)
                 WHERE item_id = ? AND borrower_id = ? AND status = 'Returned'`,
                [umbrella.id, demoBorrower.id]
            );
        }
    }

    console.log(
        `Database ${DB_NAME} is ready; tables and starter records are initialized. ` +
        `Removed ${adminItemsDeleted.affectedRows} listing(s) owned by the administrator.`
    );
}

const pageFiles = [
    "dashboard.html",
    "details.html",
    "post.html",
    "login.html",
    "register.html",
    "settings.html",
    "admin.html",
    "activity.html"
];
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get(pageFiles.map((file) => `/${file}`), (req, res) => {
    res.sendFile(path.join(__dirname, path.basename(req.path)));
});

app.get("/api/health", async (_req, res) => {
    try {
        await db.query("SELECT 1");
        res.json({ status: "ok" });
    } catch {
        res.status(503).json({ status: "unhealthy" });
    }
});

app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.session.user || null });
});

app.get("/api/calendar/status", requireAuth, async (req, res) => {
    const [[user]] = await db.query(
        "SELECT google_email FROM users WHERE id = ?",
        [req.session.user.id]
    );
    res.json({
        configured: GOOGLE_CALENDAR_CONFIGURED,
        connected: Boolean(user && user.google_email),
        email: user && user.google_email,
        timeZone: GOOGLE_TIME_ZONE
    });
});

app.get("/api/calendar/connect", requireAuth, (req, res, next) => {
    if (!GOOGLE_CALENDAR_CONFIGURED) {
        return res.status(503).json({
            message: "Google Calendar is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY."
        });
    }
    const state = crypto.randomBytes(32).toString("hex");
    req.session.googleOAuthState = state;
    req.session.save((error) => {
        if (error) return next(error);
        const query = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: GOOGLE_REDIRECT_URI,
            response_type: "code",
            scope: "openid email https://www.googleapis.com/auth/calendar.events",
            access_type: "offline",
            prompt: "consent",
            state
        });
        res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
    });
});

app.get("/api/calendar/callback", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!req.session.user || !req.session.googleOAuthState || state !== req.session.googleOAuthState) {
        return res.redirect("/settings.html?calendar=invalid");
    }
    delete req.session.googleOAuthState;
    if (req.query.error) return res.redirect("/settings.html?calendar=cancelled");
    if (typeof req.query.code !== "string") {
        return res.redirect("/settings.html?calendar=failed");
    }

    try {
        const tokens = await exchangeGoogleToken({
            code: req.query.code,
            grant_type: "authorization_code",
            redirect_uri: GOOGLE_REDIRECT_URI
        });
        const existing = await db.query(
            "SELECT google_refresh_token FROM users WHERE id = ?",
            [req.session.user.id]
        );
        const refreshToken = tokens.refresh_token ||
            (existing[0][0] && existing[0][0].google_refresh_token
                ? decryptToken(existing[0][0].google_refresh_token)
                : null);
        if (!refreshToken) {
            return res.redirect("/settings.html?calendar=missing-token");
        }
        const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const profile = await profileResponse.json();
        if (!profileResponse.ok || !isValidEmail(profile.email)) {
            throw new CalendarIntegrationError("Google did not return a valid account email.");
        }
        await db.query(
            "UPDATE users SET google_email = ?, google_refresh_token = ? WHERE id = ?",
            [profile.email, encryptToken(refreshToken), req.session.user.id]
        );
        res.redirect("/settings.html?calendar=connected");
    } catch (error) {
        console.error("Google Calendar account connection failed:", error.message);
        res.redirect("/settings.html?calendar=failed");
    }
});

app.delete("/api/calendar/connection", requireAuth, async (req, res) => {
    const [[user]] = await db.query(
        "SELECT google_refresh_token FROM users WHERE id = ?",
        [req.session.user.id]
    );
    if (GOOGLE_CALENDAR_CONFIGURED && user && user.google_refresh_token) {
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: decryptToken(user.google_refresh_token) })
        });
        if (!response.ok && response.status !== 400) {
            throw new CalendarIntegrationError("Google access could not be revoked; the calendar connection was kept.");
        }
    }
    await db.query(
        "UPDATE users SET google_email = NULL, google_refresh_token = NULL WHERE id = ?",
        [req.session.user.id]
    );
    res.json({ message: "Google Calendar disconnected." });
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { message: "Too many login attempts. Try again later." } });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { message: "Too many registration attempts. Try again later." } });

app.post("/api/auth/register", registerLimiter, async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;
    if (name.length < 2 || name.length > 120 || !isValidEmail(email) ||
        typeof password !== "string" || password.length < 8 || password.length > 128) {
        return res.status(400).json({
            message: "Enter a name, valid email, and password between 8 and 128 characters."
        });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
        const [result] = await db.query(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')",
            [name, email, passwordHash]
        );
        const user = { id: result.insertId, name, email, role: "user" };
        await regenerateSession(req);
        req.session.user = user;
        res.status(201).json({ user });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "An account with that email already exists." });
        }
        throw error;
    }
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const [users] = await db.query(
        "SELECT id, name, email, password_hash, role FROM users WHERE email = ?",
        [email]
    );
    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password_hash))) {
        return res.status(401).json({ message: "Email or password is incorrect." });
    }
    await regenerateSession(req);
    req.session.user = publicUser(users[0]);
    res.json({ user: req.session.user });
});

app.post("/api/auth/logout", requireAuth, (req, res, next) => {
    req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie("borrowbox.sid");
        res.json({ message: "Logged out." });
    });
});

app.put("/api/auth/password", requireAuth, async (req, res) => {
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
    if (newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ message: "Your new password must be between 8 and 128 characters." });
    }
    const [users] = await db.query("SELECT password_hash FROM users WHERE id = ?", [req.session.user.id]);
    if (users.length === 0 || !(await bcrypt.compare(currentPassword, users[0].password_hash))) {
        return res.status(400).json({ message: "Your current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, req.session.user.id]);
    res.json({ message: "Password updated successfully." });
});

app.get("/api/items", requireAuth, async (_req, res) => {
    const [items] = await db.query(
        `SELECT item.*, COALESCE(users.name, 'BorrowBox Member') AS owner_name
         FROM item LEFT JOIN users ON item.owner_id = users.id
         WHERE item.status = 'Available'
         ORDER BY item.created_at DESC, item.id DESC`
    );
    res.json(items.map((item) => ({ ...item, time_zone: GOOGLE_TIME_ZONE })));
});

app.get("/api/items/:id", requireAuth, async (req, res) => {
    const [items] = await db.query(
        `SELECT item.*, COALESCE(users.name, 'BorrowBox Member') AS owner_name
         FROM item LEFT JOIN users ON item.owner_id = users.id
         WHERE item.id = ?`,
        [req.params.id]
    );
    if (items.length === 0) return res.status(404).json({ message: "Item not found." });
    res.json({ ...items[0], time_zone: GOOGLE_TIME_ZONE });
});

app.post("/api/items", requireBorrower, upload.single("itemImage"), async (req, res) => {
    const {
        itemName, category, availableFrom, returnBy, location, condition, description, contact
    } = req.body;
    if (![itemName, category, location, condition].every(
        (value) => typeof value === "string" && value.trim()
    ) || !isValidLocalDateTime(availableFrom) || !isValidLocalDateTime(returnBy) ||
        availableFrom >= returnBy) {
        return res.status(400).json({
            message: "Enter the item details and a valid return date and time after the available-from time."
        });
    }
    const file = req.file ? `uploads/${req.file.filename}` : null;
    const availability = `${availableFrom.replace("T", " ")} to ${returnBy.replace("T", " ")}`;
    const [result] = await db.query(
        `INSERT INTO item
         (item_name, category, availability, location, item_condition, description,
          preferred_contact, file_attachment, owner_id, available_from, return_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            itemName.trim(), category.trim(), availability.trim(), location.trim(),
            condition.trim(), typeof description === "string" ? description.trim() : null,
            typeof contact === "string" && contact.trim() ? contact.trim() : req.session.user.email,
            file, req.session.user.id, availableFrom.replace("T", " "), returnBy.replace("T", " ")
        ]
    );
    res.status(201).json({ message: "Item posted successfully.", id: result.insertId });
});

app.post("/api/items/:id/borrow", requireBorrower, async (req, res) => {
    if (!GOOGLE_CALENDAR_CONFIGURED) {
        return res.status(503).json({
            message: "Google Calendar is not configured on the server. Ask the project administrator to complete the Calendar setup."
        });
    }
    const [[borrower]] = await db.query(
        "SELECT google_email FROM users WHERE id = ?",
        [req.session.user.id]
    );
    if (!borrower || !borrower.google_email) {
        return res.status(409).json({
            message: "Connect Google Calendar in Account settings before requesting to borrow."
        });
    }
    const [items] = await db.query("SELECT id, owner_id, status FROM item WHERE id = ?", [req.params.id]);
    if (items.length === 0) return res.status(404).json({ message: "Item not found." });
    if (Number(items[0].owner_id) === Number(req.session.user.id)) {
        return res.status(400).json({ message: "You cannot request to borrow your own item." });
    }
    if (items[0].status !== "Available") {
        return res.status(409).json({ message: "This item is not currently available." });
    }
    const [pending] = await db.query(
        "SELECT id FROM borrow_requests WHERE item_id = ? AND borrower_id = ? AND status = 'Pending'",
        [req.params.id, req.session.user.id]
    );
    if (pending.length > 0) return res.status(409).json({ message: "You already have a pending request for this item." });

    const [result] = await db.query(
        "INSERT INTO borrow_requests (item_id, borrower_id) VALUES (?, ?)",
        [req.params.id, req.session.user.id]
    );
    res.status(201).json({
        message: "Borrow request sent. The confirmed borrowing period will be added to your connected Google Calendar if accepted.",
        id: result.insertId
    });
});

app.get("/api/my/activity", requireBorrower, async (req, res) => {
    const [incoming] = await db.query(
        `SELECT borrow_requests.id, borrow_requests.status, borrow_requests.created_at,
                borrow_requests.borrower_returned_at, borrow_requests.owner_returned_at,
                item.item_name, item.category, item.location,
                DATE_FORMAT(item.available_from, '%Y-%m-%d %H:%i') AS available_from,
                DATE_FORMAT(item.return_by, '%Y-%m-%d %H:%i') AS return_by,
                borrower.name AS borrower_name, borrower.email AS borrower_email
         FROM borrow_requests
         JOIN item ON item.id = borrow_requests.item_id
         JOIN users AS borrower ON borrower.id = borrow_requests.borrower_id
         WHERE item.owner_id = ?
         ORDER BY borrow_requests.created_at DESC, borrow_requests.id DESC`,
        [req.session.user.id]
    );
    const [borrowed] = await db.query(
        `SELECT borrow_requests.id, borrow_requests.status, borrow_requests.created_at,
                borrow_requests.borrower_returned_at, borrow_requests.owner_returned_at,
                item.item_name, item.category, item.location,
                DATE_FORMAT(item.available_from, '%Y-%m-%d %H:%i') AS available_from,
                DATE_FORMAT(item.return_by, '%Y-%m-%d %H:%i') AS return_by,
                owner.name AS owner_name, owner.email AS owner_email
         FROM borrow_requests
         JOIN item ON item.id = borrow_requests.item_id
         LEFT JOIN users AS owner ON owner.id = item.owner_id
         WHERE borrow_requests.borrower_id = ?
         ORDER BY borrow_requests.created_at DESC, borrow_requests.id DESC`,
        [req.session.user.id]
    );
    res.json({
        timeZone: GOOGLE_TIME_ZONE,
        incoming,
        borrowed
    });
});

app.post("/api/borrowings/:id/return", requireBorrower, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [requests] = await connection.query(
            "SELECT id, status FROM borrow_requests WHERE id = ? AND borrower_id = ? FOR UPDATE",
            [req.params.id, req.session.user.id]
        );
        if (requests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Borrowing record not found." });
        }
        if (requests[0].status !== "Borrowing") {
            await connection.rollback();
            return res.status(409).json({ message: "Only an active borrowing can be marked returned." });
        }
        await connection.query(
            `UPDATE borrow_requests
             SET status = 'Return Pending', borrower_returned_at = NOW()
             WHERE id = ?`,
            [requests[0].id]
        );
        await connection.commit();
        res.json({ message: "Return reported. The item owner must confirm they received it." });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
    const [[userStats]] = await db.query("SELECT COUNT(*) AS total FROM users WHERE role = 'user'");
    const [[itemStats]] = await db.query("SELECT COUNT(*) AS total FROM item");
    const [[requestStats]] = await db.query(
        `SELECT COUNT(*) AS total,
                SUM(status = 'Pending') AS pending,
                SUM(status = 'Borrowing') AS active,
                SUM(status = 'Return Pending') AS awaiting_return_confirmation,
                SUM(status = 'Returned') AS returned
         FROM borrow_requests`
    );
    const [borrowers] = await db.query(
        `SELECT users.id, users.name, users.email, users.created_at,
                users.google_email, COUNT(borrow_requests.id) AS request_count
         FROM users LEFT JOIN borrow_requests ON borrow_requests.borrower_id = users.id
         WHERE users.role = 'user'
         GROUP BY users.id, users.name, users.email, users.created_at, users.google_email
         ORDER BY users.created_at DESC`
    );
    const [items] = await db.query(
        `SELECT item.id, item.item_name, item.category, item.status, item.location,
                DATE_FORMAT(item.available_from, '%Y-%m-%d %H:%i') AS available_from,
                DATE_FORMAT(item.return_by, '%Y-%m-%d %H:%i') AS return_by,
                COALESCE(users.name, 'BorrowBox Member') AS owner_name
         FROM item LEFT JOIN users ON item.owner_id = users.id
         ORDER BY item.created_at DESC, item.id DESC`
    );
    const [requests] = await db.query(
        `SELECT borrow_requests.id, borrow_requests.status, borrow_requests.created_at,
                borrow_requests.borrower_returned_at, borrow_requests.owner_returned_at,
                item.item_name, item.id AS item_id, item.category, item.location,
                DATE_FORMAT(item.available_from, '%Y-%m-%d %H:%i') AS available_from,
                DATE_FORMAT(item.return_by, '%Y-%m-%d %H:%i') AS return_by,
                borrower.name AS borrower_name, borrower.email AS borrower_email,
                borrower.google_email, owner.name AS owner_name, owner.email AS owner_email
         FROM borrow_requests
         JOIN item ON item.id = borrow_requests.item_id
         JOIN users AS borrower ON borrower.id = borrow_requests.borrower_id
         LEFT JOIN users AS owner ON owner.id = item.owner_id
         ORDER BY borrow_requests.created_at DESC, borrow_requests.id DESC`
    );
    res.json({
        timeZone: GOOGLE_TIME_ZONE,
        stats: {
            borrowers: Number(userStats.total),
            items: Number(itemStats.total),
            requests: Number(requestStats.total),
            pending: Number(requestStats.pending || 0),
            active: Number(requestStats.active || 0),
            awaitingReturnConfirmation: Number(requestStats.awaiting_return_confirmation || 0),
            returned: Number(requestStats.returned || 0)
        },
        borrowers,
        items,
        requests
    });
});

app.patch("/api/owner/requests/:id", requireBorrower, async (req, res) => {
    const nextStatus = req.body.status;
    if (!["Approved", "Declined", "Returned"].includes(nextStatus)) {
        return res.status(400).json({ message: "Choose Approved, Declined, or Returned." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [requests] = await connection.query(
            `SELECT borrow_requests.id, borrow_requests.status, borrow_requests.item_id,
                    item.item_name, item.location,
                    DATE_FORMAT(item.available_from, '%Y-%m-%d %H:%i') AS available_from,
                    DATE_FORMAT(item.return_by, '%Y-%m-%d %H:%i') AS return_by,
                    borrower.email AS borrower_email, borrower.google_email,
                    borrower.google_refresh_token,
                    (SELECT name FROM users WHERE id = item.owner_id) AS owner_name
             FROM borrow_requests
             JOIN item ON item.id = borrow_requests.item_id
             JOIN users AS borrower ON borrower.id = borrow_requests.borrower_id
             WHERE borrow_requests.id = ? AND item.owner_id = ? FOR UPDATE`,
            [req.params.id, req.session.user.id]
        );
        if (requests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Borrow request not found." });
        }
        const request = requests[0];
        const expectedStatus = nextStatus === "Returned" ? "Return Pending" : "Pending";
        if (request.status !== expectedStatus) {
            await connection.rollback();
            return res.status(409).json({
                message: nextStatus === "Returned"
                    ? "The borrower must report the return before you can confirm it."
                    : "Only pending requests can be approved or declined."
            });
        }
        const [lockedItems] = await connection.query(
            "SELECT status FROM item WHERE id = ? FOR UPDATE",
            [request.item_id]
        );
        if (nextStatus === "Approved" && lockedItems[0].status !== "Available") {
            await connection.rollback();
            return res.status(409).json({ message: "This item is no longer available to approve." });
        }
        let calendarEventId = null;
        if (nextStatus === "Approved") {
            if (!GOOGLE_CALENDAR_CONFIGURED) {
                await connection.rollback();
                return res.status(503).json({
                    message: "Google Calendar is not configured. Set up the Google OAuth credentials before approving borrowing requests."
                });
            }
            if (!request.google_refresh_token || !request.google_email) {
                await connection.rollback();
                return res.status(409).json({
                    message: "The borrower must connect Google Calendar in Account settings before this request can be approved."
                });
            }
            if (!request.available_from || !request.return_by) {
                await connection.rollback();
                return res.status(409).json({
                    message: "This older listing has no scheduled borrowing dates. Ask the lender to repost it with a date and time range."
                });
            }
            calendarEventId = await addCalendarEvent(
                decryptToken(request.google_refresh_token),
                request,
                request.borrower_email
            );
        }
        await connection.query(
            `UPDATE borrow_requests
             SET status = ?, google_event_id = ?,
                 owner_returned_at = IF(? = 'Returned', NOW(), owner_returned_at)
             WHERE id = ?`,
            [nextStatus === "Approved" ? "Borrowing" : nextStatus, calendarEventId, nextStatus, request.id]
        );
        if (nextStatus === "Approved") {
            await connection.query("UPDATE item SET status = 'Borrowed' WHERE id = ?", [request.item_id]);
        } else if (nextStatus === "Returned") {
            await connection.query("UPDATE item SET status = 'Available' WHERE id = ?", [request.item_id]);
        }
        if (nextStatus === "Approved") {
            await connection.query(
                `UPDATE borrow_requests SET status = 'Declined'
                 WHERE item_id = ? AND id <> ? AND status = 'Pending'`,
                [request.item_id, request.id]
            );
        }
        await connection.commit();
        res.json({
            message: nextStatus === "Approved"
                ? "Borrowing request accepted. The borrower has been notified and the item is now marked as borrowed."
                : nextStatus === "Returned"
                    ? "Return confirmed. The item is available again."
                    : "Borrowing request declined."
        });
    } catch (error) {
        await connection.rollback();
        if (error instanceof CalendarIntegrationError) {
            return res.status(error.status).json({ message: error.message });
        }
        throw error;
    } finally {
        connection.release();
    }
});

app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            message: err.code === "LIMIT_FILE_SIZE" ? "Image must be 5MB or smaller." : err.message
        });
    }
    if (err.message === "Only image files are allowed") {
        return res.status(400).json({ message: err.message });
    }
    if (err instanceof CalendarIntegrationError) {
        console.error("Google Calendar integration error:", err.message);
        return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: "Server error. Check the server console for details." });
});

initializeDatabase()
    .then(() => {
        const server = app.listen(PORT, () => console.log(`BorrowBox server running at http://localhost:${PORT}`));
        const shutdown = () => {
            console.log("Shutting down...");
            server.close(() => {
                db.end().then(() => process.exit(0)).catch(() => process.exit(1));
            });
        };
        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    })
    .catch((error) => {
        console.error(
            `Could not initialize BorrowBox database at ${DB_HOST}:${DB_PORT}. Start MySQL in XAMPP and check DB_* settings.`,
            error
        );
        process.exitCode = 1;
    });

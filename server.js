const express = require("express");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

/*
    Install required packages:
    npm init -y
    npm install express mysql2 multer

    Run:
    node server.js
*/

// Allow JSON data
app.use(express.json());

// Serve your HTML, CSS, and frontend JavaScript files (and uploaded images)
app.use(express.static(__dirname));

// Home page: open the dashboard when visiting http://localhost:3000/
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});


// ========================================
// Image upload (post.html -> itemImage)
// ========================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
        cb(null, unique + path.extname(file.originalname).toLowerCase());
    }

});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {

        if (file.mimetype.startsWith("image/")) {
            return cb(null, true);
        }

        cb(new Error("Only image files are allowed"));

    }
});


// ========================================
// Connect to MySQL
// ========================================

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "borrowbox_db"
});


// Test database connection
db.connect((err) => {

    if (err) {
        console.error("Database connection failed:", err);
        return;
    }

    console.log("Connected to borrowbox_db");

});


// ========================================
// ITEM API
// ========================================


// ----------------------------------------
// GET - Retrieve all items (dashboard.html)
// ----------------------------------------

app.get("/api/items", (req, res) => {

    const sql = `
        SELECT *
        FROM item
        ORDER BY created_at DESC, id DESC
    `;

    db.query(sql, (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                message: "Database error"
            });
        }

        res.json(results);

    });

});


// ----------------------------------------
// GET - Retrieve one item (details.html?id=)
// ----------------------------------------

app.get("/api/items/:id", (req, res) => {

    const id = req.params.id;

    const sql = `
        SELECT *
        FROM item
        WHERE id = ?
    `;

    db.query(sql, [id], (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                message: "Database error"
            });
        }

        if (results.length === 0) {

            return res.status(404).json({
                message: "Item not found"
            });

        }

        res.json(results[0]);

    });

});


// ----------------------------------------
// POST - Add item (post.html)
// Form fields: itemName, category, availability, location,
//              condition, description, contact, itemImage
// ----------------------------------------

app.post("/api/items", upload.single("itemImage"), (req, res) => {

    const {
        itemName,
        category,
        availability,
        location,
        condition,
        description,
        contact
    } = req.body;


    // Validate required fields
    if (
        !itemName ||
        !category ||
        !availability ||
        !location ||
        !condition
    ) {

        return res.status(400).json({
            message: "Please fill in all required fields"
        });

    }


    const file = req.file ? "uploads/" + req.file.filename : null;


    const sql = `
        INSERT INTO item
        (item_name, category, availability, location,
         item_condition, description, preferred_contact, file_attachment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;


    db.query(
        sql,
        [
            itemName.trim(),
            category,
            availability.trim(),
            location.trim(),
            condition,
            description ? description.trim() : null,
            contact && contact.trim() ? contact.trim() : "Not provided",
            file
        ],
        (err, result) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    message: "Database error"
                });
            }


            res.status(201).json({
                message: "Item posted successfully",
                id: result.insertId
            });

        }
    );

});


// ----------------------------------------
// PUT - Update item
// ----------------------------------------

app.put("/api/items/:id", (req, res) => {

    const id = req.params.id;

    const {
        itemName,
        category,
        availability,
        location,
        condition,
        description,
        contact
    } = req.body;


    // Validate required fields
    if (
        !itemName ||
        !category ||
        !availability ||
        !location ||
        !condition
    ) {

        return res.status(400).json({
            message: "Please fill in all required fields"
        });

    }


    const sql = `
        UPDATE item
        SET item_name = ?, category = ?, availability = ?, location = ?,
            item_condition = ?, description = ?, preferred_contact = ?
        WHERE id = ?
    `;


    db.query(
        sql,
        [
            itemName.trim(),
            category,
            availability.trim(),
            location.trim(),
            condition,
            description ? description.trim() : null,
            contact && contact.trim() ? contact.trim() : "Not provided",
            id
        ],
        (err, result) => {

            if (err) {
                console.error(err);

                return res.status(500).json({
                    message: "Database error"
                });

            }


            if (result.affectedRows === 0) {

                return res.status(404).json({
                    message: "Item not found"
                });

            }


            res.json({
                message: "Item updated successfully"
            });

        }
    );

});


// ----------------------------------------
// DELETE - Delete item
// ----------------------------------------

app.delete("/api/items/:id", (req, res) => {

    const id = req.params.id;


    const sql = `
        DELETE FROM item
        WHERE id = ?
    `;


    db.query(sql, [id], (err, result) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                message: "Database error"
            });

        }


        if (result.affectedRows === 0) {

            return res.status(404).json({
                message: "Item not found"
            });

        }


        res.json({
            message: "Item deleted successfully"
        });

    });

});


// ========================================
// ERROR HANDLER (upload errors)
// ========================================

app.use((err, req, res, next) => {

    if (err instanceof multer.MulterError) {

        return res.status(400).json({
            message:
                err.code === "LIMIT_FILE_SIZE"
                    ? "Image must be 5MB or smaller"
                    : err.message
        });

    }

    if (err.message === "Only image files are allowed") {

        return res.status(400).json({
            message: err.message
        });

    }

    console.error(err);

    res.status(500).json({
        message: "Server error"
    });

});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {

    console.log(
        `Server running at http://localhost:${PORT}`
    );

});
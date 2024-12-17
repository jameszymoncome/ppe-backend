const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "lgu_db",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to database");
});

// Login route
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Check if user exists
  const sql = "SELECT * FROM users WHERE username = ?";
  db.query(sql, [username], async (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid username or password" });
    }

    const user = results[0];

    // Verify password
    try {
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ success: false, message: "Invalid username or password" });
      }

      // Generate JWT token with user role
      const token = jwt.sign({ id: user.user_id, role: user.role }, "your_jwt_secret", { expiresIn: "1h" });
      
      // Send back token, user's first name, and user ID
      return res.json({
        success: true,
        token,
        firstName: user.firstname,
        accessLevel: user.role === 'ADMIN' ? 'Full Access' : (user.role === 'ENCODER' ? 'Limited Access' : 'View Only'),
        userId: user.user_id // Include user ID in the response
      });
    } catch (bcryptError) {
      console.error("Error verifying password:", bcryptError);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });
});

// Account creation route
app.post("/create-account", async (req, res) => {
  const { lastname, firstname, middlename, suffix, email, contactNumber, username, password, role, department } = req.body;

  // Validate fields
  if (!lastname || !firstname || !email || !username || !password) {
    return res.status(400).json({ success: false, message: "Please fill out all required fields." });
  }

  // Check if the username already exists
  const checkUsernameSQL = "SELECT * FROM users WHERE username = ?";
  db.query(checkUsernameSQL, [username], async (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    if (results.length > 0) {
      return res.status(400).json({ success: false, message: "Username already exists." });
    }

    // Hash the password before saving
    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      // SQL query to insert the new account into the users table
      const insertSQL = `
        INSERT INTO users (lastname, firstname, middlename, suffix, email, contactNumber, username, password, role, department)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [lastname, firstname, middlename, suffix, email, contactNumber, username, hashedPassword, role, department];
      db.query(insertSQL, values, (err, result) => {
        if (err) {
          console.error("Error inserting data:", err);
          return res.status(500).json({ success: false, message: "Error saving account." });
        }
        res.status(201).json({ success: true, message: "Account created successfully" });
      });
    } catch (bcryptError) {
      console.error("Error hashing password:", bcryptError);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  });
});

// Save multiple PPE entries
app.post("/ppe-entries", (req, res) => {
  const entries = req.body; // Expecting an array of entries

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ success: false, message: "No entries provided." });
  }

  const insertSQL = `
    INSERT INTO ppe_entries (entityName, fundCluster, description, dateAcquired, quantity, unit, unitCost, totalCost)
    VALUES ?
  `;

  const values = entries.map(entry => [
    entry.entityName,
    entry.fundCluster,
    entry.description,
    entry.dateAcquired,
    entry.quantity,
    entry.unit,
    entry.unitCost,
    entry.totalCost
  ]);

  db.query(insertSQL, [values], (err) => {
    if (err) {
      console.error("Error inserting PPE entries:", err);
      return res.status(500).json({ success: false, message: "Error saving entries." });
    }
    res.json({ success: true, message: "Entries saved successfully!" });
  });
});

// Get all PPE entries
app.get("/ppe-entries", (req, res) => {
  const sql = "SELECT * FROM ppe_entries";
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching PPE entries:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, data: results });
  });
});

// Update a PPE entry
app.put("/ppe-entry/:id", (req, res) => {
  const { id } = req.params;
  const { entityName, fundCluster, description, dateAcquired, quantity, unit, unitCost } = req.body;

  const totalCost = quantity * unitCost;

  const updateSQL = `
    UPDATE ppe_entries SET entityName=?, fundCluster=?, description=?, dateAcquired=?, quantity=?, unit=?, unitCost=?, totalCost=?
    WHERE id=?
  `;
  
  const values = [entityName, fundCluster, description, dateAcquired, quantity, unit, unitCost, totalCost, id];
  
  db.query(updateSQL, values, (err) => {
    if (err) {
      console.error("Error updating PPE entry:", err);
      return res.status(500).json({ success: false, message: "Error updating PPE entry." });
    }
    res.json({ success: true, message: "PPE entry updated successfully" });
  });
});

// Delete a PPE entry
app.delete("/ppe-entry/:id", (req, res) => {
  const { id } = req.params;

  const deleteSQL = "DELETE FROM ppe_entries WHERE id=?";
  
  db.query(deleteSQL, [id], (err) => {
    if (err) {
      console.error("Error deleting PPE entry:", err);
      return res.status(500).json({ success: false, message: "Error deleting PPE entry." });
    }
    res.json({ success: true, message: "PPE entry deleted successfully" });
  });
});

// Fetch all accounts
app.get("/accounts", (req, res) => {
  const sql = "SELECT id, lastname, firstname, middlename, role, department FROM users";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching accounts:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, data: results });
  });
});

// Fetch logged-in user details
app.get("/user/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT lastname, firstname, middlename, suffix, email, contactNumber, username, role, department
    FROM users WHERE id = ?
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error("Error fetching user details:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, data: results[0] });
  });
});

// Fetch user profile data
app.get("/profile/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT lastname, firstname, middlename, suffix, email, contactNumber, username, role, department
    FROM users WHERE user_id = ?
  `;
  
  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error("Error fetching profile data:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, data: results[0] });
  });
});

// Update user profile
app.put("/profile/:id", (req, res) => {
  const { id } = req.params;
  const { lastname, firstname, middlename, suffix, email, contactNumber, username, department } = req.body;

  const updateSQL = `
    UPDATE users
    SET lastname = ?, firstname = ?, middlename = ?, suffix = ?, email = ?, contactNumber = ?, username = ?, department = ?
    WHERE user_id = ?
  `;
  
  const values = [lastname, firstname, middlename, suffix, email, contactNumber, username, department, id];

  db.query(updateSQL, values, (err) => {
    if (err) {
      console.error("Error updating profile:", err);
      return res.status(500).json({ success: false, message: "Error updating profile." });
    }

    res.json({ success: true, message: "Profile updated successfully" });
  });
});

// Delete user profile
app.delete("/profile/:id", (req, res) => {
  const { id } = req.params;

  const deleteSQL = "DELETE FROM users WHERE user_id = ?";
  
  db.query(deleteSQL, [id], (err) => {
    if (err) {
      console.error("Error deleting profile:", err);
      return res.status(500).json({ success: false, message: "Error deleting profile." });
    }

    res.json({ success: true, message: "Profile deleted successfully" });
  });
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

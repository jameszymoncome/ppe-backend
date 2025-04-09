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

  const values = entries.map(entry => [
    entry.entityName,
    entry.fundCluster,
    entry.department,
    entry.description,
    entry.receiver,
    entry.dateAcquired,
    entry.quantity,
    entry.unit,
    entry.unitCost,
    entry.totalCost
  ]);

  let parRowCount = 0;
  let propertyRowCount = 0;
  let completedInserts = 0;
  let totalInserts = 0;

  let icsRowCount = 0;
  let inventoryRowCount = 0;
  let icscompletedInserts = 0;
  let icstotalInserts = 0;

  let itemRows = 0;

  const item_id = `SELECT COUNT(*) AS itemRow FROM ppe_entries`;
  db.query(item_id, (countErr, countResultss) => {
    if (countErr) {
      console.error("Error counting rows:", countErr);
      return res.status(500).json({ success: false, message: "Error retrieving row count." });
    }

    itemRows = countResultss[0].itemRow;

    values.forEach(row => {
      if (row[8] > 49999) { // Check if totalCost > 49999
        const propertyCount = `SELECT COUNT(*) AS propCount FROM par`;

        db.query(propertyCount, (countErr, countResults) => {
          if (countErr) {
            console.error("Error counting rows:", countErr);
            return res.status(500).json({ success: false, message: "Error retrieving row count." });
          }

          propertyRowCount = countResults[0].propCount;

          const countSQL = `SELECT COUNT(DISTINCT PAR_id) AS parCount FROM par`;
          db.query(countSQL, (countErr, countResult) => {
            if (countErr) {
              console.error("Error counting rows:", countErr);
              return res.status(500).json({ success: false, message: "Error retrieving row count." });
            }

            parRowCount = countResult[0].parCount + 1;

            totalInserts += row[4];

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;

            let parNo = `par${parRowCount} ${currentYear}-${currentMonth}`;

            const insertITEM = `INSERT INTO ppe_entries (form_id, entityName, fundCluster, department, description, receiver_name, dateAcquired, quantity, unit, unitCost, totalCost) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
              
            const valuesToInsertITEM = [
              parNo,
              row[0],
              row[1],
              row[2],
              row[3],
              row[4],
              row[5],
              row[6],
              row[7],
              row[8],
              row[9],
              123
            ];

            db.query(insertITEM, valuesToInsertITEM, (insertErr) => {
              if (insertErr) {
                console.error("Error inserting into PAR table:", insertErr);
                return res.status(500).json({ success: false, message: "Error saving entries." });
              }
            })

            itemRows++;
            console.log(itemRows);

            for (let i = 0; i < row[5]; i++) {
              propertyRowCount++;

              let propertyNo = `par${parRowCount} ${currentYear}-${currentMonth} ${propertyRowCount}`;

              const insertPAR = `
                INSERT INTO par (property_id, PAR_id, item_id, enduser_id)
                VALUES (?, ?, ?, ?)
              `;

              const valuesToInsertPAR = [
                propertyNo,
                parNo,
                itemRows,
                123
              ];

              db.query(insertPAR, valuesToInsertPAR, (insertErr) => {
                if (insertErr) {
                  console.error("Error inserting into PAR table:", insertErr);
                  return res.status(500).json({ success: false, message: "Error saving entries." });
                }

                completedInserts++; // Increment completed insertions

                // Send the response only after all insertions are done
                if (completedInserts === totalInserts) {
                  res.json({ success: true, message: "Entries saved successfully!" });
                }
              });
            }
          });
        });
      }
      else{
        const inventoryCount = `SELECT COUNT(*) AS invenCount FROM ics`;

        db.query(inventoryCount, (countErr, countResults) => {
          if (countErr) {
            console.error("Error counting rows:", countErr);
            return res.status(500).json({ success: false, message: "Error retrieving row count." });
          }

          inventoryRowCount = countResults[0].invenCount;

          const countSQL = `SELECT COUNT(DISTINCT ICS_id) AS icsCount FROM ics`;
          db.query(countSQL, (countErr, countResult) => {
            if (countErr) {
              console.error("Error counting rows:", countErr);
              return res.status(500).json({ success: false, message: "Error retrieving row count." });
            }

            icsRowCount = countResult[0].icsCount + 1;

            icstotalInserts += row[4];

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;

            let icsNo = `ics${icsRowCount} ${currentYear}-${currentMonth}`;

            const insertITEMs = `INSERT INTO ppe_entries (form_id, entityName, fundCluster, department, description, receiver_name, dateAcquired, quantity, unit, unitCost, totalCost) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
              
            const valuesToInsertITEMs = [
              icsNo,
              row[0],
              row[1],
              row[2],
              row[3],
              row[4],
              row[5],
              row[6],
              row[7],
              row[8],
              row[9]
            ];

            db.query(insertITEMs, valuesToInsertITEMs, (insertErr) => {
              if (insertErr) {
                console.error("Error inserting into PAR table:", insertErr);
                return res.status(500).json({ success: false, message: "Error saving entries." });
              }
            })

            itemRows++;
            console.log(itemRows);

            for (let i = 0; i < row[5]; i++) {
              
              inventoryRowCount++;

              let inventoryNo = `ics${icsRowCount} ${currentYear}-${currentMonth} ${inventoryRowCount}`;

              const insertICS = `
                INSERT INTO ics (inventory_id, ICS_id, item_id, enduser_id)
                VALUES (?, ?, ?, ?)
              `;

              const valuesToInsertICS = [
                inventoryNo,
                icsNo,
                itemRows,
                123
              ];

              db.query(insertICS, valuesToInsertICS, (insertErr) => {
                if (insertErr) {
                  console.error("Error inserting into ICS table:", insertErr);
                  return res.status(500).json({ success: false, message: "Error saving entries." });
                }

                icscompletedInserts++; // Increment completed insertions

                // Send the response only after all insertions are done
                if (icscompletedInserts === icstotalInserts) {
                  res.json({ success: true, message: "Entries saved successfully!" });
                }
              });
            }
          });
        });
      }
    });

    // Handle the case where no rows meet the condition
    if (icstotalInserts === 0 || totalInserts === 0) {
      res.json({ success: true, message: "Entries saved successfully!" });
    }
  })

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
  const sql = "SELECT user_id, lastname, firstname, middlename, role, department FROM users";

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
    FROM users WHERE user_id = ?
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

// Fetching item
app.get("/items", (req, res) => {
  const query = "SELECT item_id, form_id, entityName, fundCluster, DATE_FORMAT(date, '%Y-%m-%d') AS date  FROM ppe_entries GROUP BY form_id";

  // Execute the query to fetch data
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Failed to fetch data from database" });
    }
    res.json(results); // Send the results as JSON response
  });
});

app.get("/getItem/:id", (req, res) => {
  const itemId = req.params.id;
  
  // SQL Query to fetch data with a grouped range
  const query = `
    SELECT 
      ppe_entries.quantity,
      ppe_entries.unit,
      ppe_entries.description,
      CASE
        WHEN COALESCE(MIN(ics.inventory_id), 0) = COALESCE(MAX(ics.inventory_id), 0) AND 
            COALESCE(MIN(par.property_id), 0) = COALESCE(MAX(par.property_id), 0) THEN 
          CONCAT(
            COALESCE(MIN(ics.inventory_id), COALESCE(MIN(par.property_id), ''))
          )
        ELSE 
          CONCAT(
            COALESCE(MIN(ics.inventory_id), COALESCE(MIN(par.property_id), '')), 
            ' to ', 
            COALESCE(MAX(ics.inventory_id), COALESCE(MAX(par.property_id), ''))
          )
      END AS procsid,
      DATE_FORMAT(ppe_entries.dateAcquired, '%Y-%m-%d') AS dateAcquired,
      ppe_entries.unitCost,
      ppe_entries.totalCost
    FROM 
      ppe_entries
    LEFT JOIN 
      ics ON ppe_entries.item_id = ics.item_id
    LEFT JOIN 
      par ON ppe_entries.item_id = par.item_id
    WHERE 
      ppe_entries.form_id = ?
    GROUP BY 
      ppe_entries.item_id;

  `;

  // Execute the query
  db.query(query, [itemId], (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Failed to fetch data from database" });
    }
    res.json(results); // Send the results as a JSON response
  });
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

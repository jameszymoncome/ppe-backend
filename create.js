const bcrypt = require("bcrypt");
const mysql = require("mysql");

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

const createAccount = async () => {
  const username = "admin"; // Replace with your desired username
  const plainPassword = "admin123"; // Replace with your desired password

  try {
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
    db.query(sql, [username, hashedPassword], (err, result) => {
      if (err) {
        console.error("Error inserting user:", err);
      } else {
        console.log("User created successfully:", result);
      }
      db.end();
    });
  } catch (error) {
    console.error("Error hashing password:", error);
    db.end();
  }
};

createAccount();

const express = require("express");
const path = require("path");
const { generateTempToken } = require("./tokenGenerator"); // your previously written function

const app = express();
const PORT = 8000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/token", async (req, res) => {
  try {
    const token = await generateTempToken(60); // Max value 600
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate token" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

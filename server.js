const { AssemblyAI } = require("assemblyai");
const express = require("express");
const path = require("path");

const aai = new AssemblyAI({ apiKey: "YOUR_API_KEY" })
const app = express();
app.use(express.static('public'))
app.use('/assemblyai.js', express.static(path.join(__dirname, 'node_modules/assemblyai/dist/index.umd.js')))
app.use(express.json());

app.get("/token", async (_req, res) => {
  const token = await aai.realtime.createTemporaryToken({ expires_in: 3600 });
  res.json({ token });
});

app.set("port", 8000);
const server = app.listen(app.get("port"), () => {
  console.log(`Server is running on port ${server.address().port}`);
});


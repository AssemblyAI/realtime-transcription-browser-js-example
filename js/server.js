const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", async (req, res) => {
  try {
    const response = await axios.post(
      "https://api.assemblyai.com/v2/realtime/token", // use account token to get a temp user token
      { expires_in: 3600 }, // can set a TTL timer in seconds.
      { headers: { authorization: "YOUR_API_TOKEN_HERE" } }, // AssemblyAI API Key goes here
    );
    const { data } = response;
    res.json(data);
  } catch (error) {
    const {
      response: { status, data },
    } = error;
    res.status(status).json(data);
  }
});

app.set("port", 8000);
const server = app.listen(app.get("port"), () => {
  console.log(`Server is running on port ${server.address().port}`);
});

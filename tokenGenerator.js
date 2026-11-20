const axios = require("axios");
require("dotenv").config();

// Mints a short-lived token so the browser never sees your API key.
// Docs: https://www.assemblyai.com/docs/temporary-tokens
async function generateTempToken(expiresInSeconds) {
  try {
    const response = await axios.post(
      "https://token.assemblyai.com/v1/token",
      {
        product: "streaming",
        expires_in_seconds: expiresInSeconds, // 1-600: time allowed to open the WebSocket
      },
      {
        headers: {
          Authorization: process.env.ASSEMBLYAI_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );
    return response.data.token;
  } catch (error) {
    console.error(
      "Error generating temp token:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

module.exports = { generateTempToken };

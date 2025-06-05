const axios = require('axios');
require("dotenv").config();

async function generateTempToken(expiresInSeconds) {
  const url = `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${expiresInSeconds}`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: process.env.ASSEMBLYAI_API_KEY,
      },
    });
    return response.data.token;
  } catch (error) {
    console.error("Error generating temp token:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { generateTempToken };

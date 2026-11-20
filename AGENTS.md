# Notes for coding agents

This repo is AssemblyAI's minimal browser example for Real-time Speech-to-Text (live captions from the microphone).

## Paths

- Default branch: **`master`** (not `main`).
- Browser client: **`public/index.js`** (there is no `main.js`).
- Raw URL: `https://raw.githubusercontent.com/AssemblyAI/realtime-transcription-browser-js-example/master/public/index.js`
- Token server: `server.js` + `tokenGenerator.js`. AudioWorklet: `public/audio-processor.js`.

## Minimal connection

Server side (Node 18+). Never send your API key to the browser:

```js
const res = await fetch("https://token.assemblyai.com/v1/token", {
  method: "POST",
  headers: {
    Authorization: process.env.ASSEMBLYAI_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ product: "streaming", expires_in_seconds: 60 }),
});
const { token } = await res.json();
```

Browser side:

```js
const params = new URLSearchParams({
  sample_rate: 16000,
  speech_model: "assemblyai-stt-3-7-realtime", // voice agents: "assemblyai-stt-3-7-realtime-agent"
  token, // browsers can't set WebSocket headers, so the token goes in the URL
});
const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "Begin") console.log("model:", msg.configuration.model);
  if (msg.type === "Turn") render(msg.turn_order, msg.transcript, msg.end_of_turn);
  if (msg.type === "Termination") ws.close();
};
// Send audio as binary frames of 16-bit mono PCM, 20-1000 ms each (50-100 ms recommended).
// To stop: ws.send(JSON.stringify({ type: "Terminate" })), then wait for Termination.
```

## Rules that are easy to get wrong

- Always set `speech_model`. Without it, the session runs the server's default model, not AssemblyAI-STT-3.7-Realtime.
- `formatted_finals` and `format_turns` are not parameters for current models. Formatting is always on. Unknown query params are ignored silently, so check `Begin.configuration.model`.
- A `Turn` message replaces the previous one with the same `turn_order`. Render the latest `transcript`; don't append.
- Don't close the socket right after `Terminate`, or you lose the final transcript.

Docs: https://www.assemblyai.com/docs/streaming/getting-started/transcribe-streaming-audio

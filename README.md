# AssemblyAI Real-Time Transcription Browser Example

Live captions in the browser with AssemblyAI's Real-time Speech-to-Text API.

The page captures microphone audio with an AudioWorklet, converts it to 16 kHz 16-bit PCM, and streams it over a WebSocket to AssemblyAI. Transcripts come back as `Turn` messages and render on the page as you speak. A small Express server mints a short-lived temporary token, so your API key never reaches the browser.

## Model

This example uses **AssemblyAI-STT-3.7-Realtime** (`speech_model=assemblyai-stt-3-7-realtime`), the streaming model built for live captions, notetakers, and ambient transcription. It returns formatted text (punctuation and casing) with no extra parameter.

Building a voice agent instead? Use **AssemblyAI-STT-3.7-Realtime-Agent** (`assemblyai-stt-3-7-realtime-agent`). Change the `SPEECH_MODEL` constant in [`public/index.js`](./public/index.js).

If you leave `speech_model` out, the server uses its default model, not AssemblyAI-STT-3.7-Realtime. Always set it.

## Prerequisites

- Node.js 18 or later
- A modern browser with microphone access (Chrome, Edge, Firefox, or Safari)
- An AssemblyAI API key. [Sign up here](https://www.assemblyai.com/dashboard/signup). New accounts get $50 in free credits.

## Run it

```bash
git clone https://github.com/AssemblyAI/realtime-transcription-browser-js-example.git
cd realtime-transcription-browser-js-example
npm install
cp .env.example .env   # then set ASSEMBLYAI_API_KEY in .env
npm run serve
```

Open http://localhost:8000, click **Start**, allow microphone access, and speak. Click **Stop** to end the session.

## How it works

| File | What it does |
| --- | --- |
| [`server.js`](./server.js) | Serves `public/` and exposes `GET /token` |
| [`tokenGenerator.js`](./tokenGenerator.js) | Calls `POST https://token.assemblyai.com/v1/token` with `{"product": "streaming", "expires_in_seconds": 60}` |
| [`public/index.js`](./public/index.js) | Gets a token, opens the WebSocket, streams audio, renders `Turn` messages |
| [`public/audio-processor.js`](./public/audio-processor.js) | AudioWorklet that converts Float32 samples to Int16 PCM |

The session flow:

1. The browser fetches `/token`. The server mints a temporary token with your API key.
2. The browser opens `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=assemblyai-stt-3-7-realtime&token=<token>`. Browsers can't set WebSocket headers, so the token goes in the query string.
3. The server sends `Begin`. The client logs `configuration.model` to confirm the model. Unknown query parameters are ignored rather than rejected, so this check catches typos.
4. The client sends 100 ms binary PCM frames. The server sends `Turn` messages: partials with `end_of_turn: false`, then a final with `end_of_turn: true`. Each `Turn` replaces the previous one for the same `turn_order`.
5. On **Stop**, the client sends `{"type": "Terminate"}` and waits for the `Termination` message before closing, so the last transcript isn't lost.

## For coding agents

See [AGENTS.md](./AGENTS.md). Key facts: the default branch is `master`, and the client code is `public/index.js` (there is no `main.js`).

## Further documentation

- [Real-time STT quickstart](https://www.assemblyai.com/docs/streaming/getting-started/transcribe-streaming-audio)
- [Select the speech model](https://www.assemblyai.com/docs/streaming/select-the-speech-model)
- [Temporary tokens](https://www.assemblyai.com/docs/temporary-tokens)
- [Message sequence](https://www.assemblyai.com/docs/streaming/message-sequence)
- [MDN: Using AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)

## Contact us

Questions? Reach our Support team at support@assemblyai.com.

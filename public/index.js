// DOM elements
const buttonEl = document.getElementById("button");
const messageEl = document.getElementById("message");
const titleEl = document.getElementById("real-time-title");

let isRecording = false;
let ws;
let microphone;

messageEl.style.display = "none";

function createMicrophone() {
  let stream;
  let audioContext;
  let audioWorkletNode;
  let source;
  let audioBufferQueue = new Int16Array(0);

  return {
    async requestPermission() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    },
    async startRecording(onAudioCallback) {
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioContext = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'balanced'
      });

      source = audioContext.createMediaStreamSource(stream);
      await audioContext.audioWorklet.addModule('audio-processor.js');

      audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      source.connect(audioWorkletNode);
      audioWorkletNode.connect(audioContext.destination);

      audioWorkletNode.port.onmessage = (event) => {
        const currentBuffer = new Int16Array(event.data.audio_data);
        audioBufferQueue = mergeBuffers(audioBufferQueue, currentBuffer);

        const bufferDuration = (audioBufferQueue.length / audioContext.sampleRate) * 1000;

        if (bufferDuration >= 100) {
          const totalSamples = Math.floor(audioContext.sampleRate * 0.1);
          const finalBuffer = new Uint8Array(audioBufferQueue.subarray(0, totalSamples).buffer);
          audioBufferQueue = audioBufferQueue.subarray(totalSamples);

          if (onAudioCallback) onAudioCallback(finalBuffer);
        }
      };
    },
    stopRecording() {
      stream?.getTracks().forEach((track) => track.stop());
      audioContext?.close();
      audioBufferQueue = new Int16Array(0);
    }
  };
}

function mergeBuffers(lhs, rhs) {
  const merged = new Int16Array(lhs.length + rhs.length);
  merged.set(lhs, 0);
  merged.set(rhs, lhs.length);
  return merged;
}

// AssemblyAI-STT-3.7-Realtime: the streaming model built for live captions
// and notetakers. For voice agents, use "assemblyai-stt-3-7-realtime-agent".
// Docs: https://www.assemblyai.com/docs/streaming/select-the-speech-model
const SPEECH_MODEL = "assemblyai-stt-3-7-realtime";
const SAMPLE_RATE = 16000; // must match the AudioContext sample rate above

async function run() {
  if (isRecording) {
    if (microphone) {
      microphone.stopRecording();
      microphone = null;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Don't close yet: the server flushes the final Turn, then sends
      // Termination. ws.onmessage closes the socket when that arrives.
      ws.send(JSON.stringify({ type: "Terminate" }));
    }
  } else {
    microphone = createMicrophone();
    await microphone.requestPermission();

    // Same-origin call to server.js, which mints the temporary token.
    const response = await fetch("/token");
    const data = await response.json();
    if (data.error || !data.token) {
      alert("Failed to get temp token");
      return;
    }

    // Browsers can't set WebSocket headers, so the token goes in the URL.
    const params = new URLSearchParams({
      sample_rate: SAMPLE_RATE,
      speech_model: SPEECH_MODEL,
      token: data.token,
    });
    ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`);

    const turns = {}; // keyed by turn_order

    ws.onopen = () => {
      console.log("WebSocket connected!");
      messageEl.style.display = "";
      microphone.startRecording((audioChunk) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(audioChunk);
        }
      });
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "Begin") {
        // Unknown query params are ignored, not rejected, so confirm the model.
        console.log("Session started with model:", msg.configuration?.model);
      } else if (msg.type === "Termination") {
        ws.close();
      } else if (msg.type === "Turn") {
        // Each Turn message replaces the previous one for the same turn_order.
        const { turn_order, transcript } = msg;
        turns[turn_order] = transcript;

        const orderedTurns = Object.keys(turns)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => turns[k])
          .join(" ");

        messageEl.innerText = orderedTurns;
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      alert("WebSocket error, check the console.");
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed", event.code, event.reason);
      ws = null;
    };
  }

  isRecording = !isRecording;
  buttonEl.innerText = isRecording ? "Stop" : "Start";
  titleEl.innerText = isRecording
    ? "Click stop to end recording!"
    : "Click start to begin recording!";
}

buttonEl.addEventListener("click", () => run());


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

async function run() {
  if (isRecording) {
    if (ws) {
      ws.send(JSON.stringify({ type: "Terminate" }));
      ws.close();
      ws = null;
    }
    if (microphone) {
      microphone.stopRecording();
      microphone = null;
    }
  } else {
    microphone = createMicrophone();
    await microphone.requestPermission();

    const response = await fetch("http://localhost:8000/token");
    const data = await response.json();
    if (data.error || !data.token) {
      alert("Failed to get temp token");
      return;
    }

    const endpoint = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=${data.token}`;
    ws = new WebSocket(endpoint);

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
      if (msg.type === "Turn") {
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

    ws.onclose = () => {
      console.log("WebSocket closed");
    };
  }

  isRecording = !isRecording;
  buttonEl.innerText = isRecording ? "Stop" : "Record";
  titleEl.innerText = isRecording
    ? "Click stop to end recording!"
    : "Click start to begin recording!";
}

buttonEl.addEventListener("click", () => run());


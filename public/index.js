// DOM elements
const buttonEl = document.getElementById("button");
const messageEl = document.getElementById("message");
const titleEl = document.getElementById("real-time-title");

let recordingState = "idle";
let activeSession;

messageEl.style.display = "none";

function createMicrophone() {
  let stream;
  let audioContext;
  let audioWorkletNode;
  let source;
  let stopped = false;
  let audioBufferQueue = new Int16Array(0);

  return {
    async requestPermission() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopped) stream.getTracks().forEach((track) => track.stop());
    },
    async startRecording(onAudioCallback) {
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      audioContext = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'balanced'
      });

      source = audioContext.createMediaStreamSource(stream);
      await audioContext.audioWorklet.addModule('audio-processor.js');
      // A socket may close while the worklet module is loading.
      if (stopped) return;

      audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      source.connect(audioWorkletNode);
      audioWorkletNode.connect(audioContext.destination);

      audioWorkletNode.port.onmessage = (event) => {
        if (stopped) return;
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
    async stopRecording() {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
      source?.disconnect();
      audioWorkletNode?.disconnect();
      if (audioWorkletNode) {
        audioWorkletNode.port.onmessage = null;
        audioWorkletNode.port.close();
      }
      audioBufferQueue = new Int16Array(0);
      if (audioContext && audioContext.state !== "closed") await audioContext.close();
    }
  };
}

function mergeBuffers(lhs, rhs) {
  const merged = new Int16Array(lhs.length + rhs.length);
  merged.set(lhs, 0);
  merged.set(rhs, lhs.length);
  return merged;
}

function updateUI() {
  buttonEl.innerText = recordingState === "recording" ? "Stop"
    : recordingState === "starting" ? "Starting..."
    : recordingState === "stopping" ? "Stopping..." : "Record";
  titleEl.innerText = recordingState === "recording"
    ? "Click stop to end recording!"
    : recordingState === "idle" ? "Click start to begin recording!"
    : "Please wait...";
}

async function stopSession(session, terminate = false) {
  if (activeSession !== session) return;
  // Invalidate callbacks before closing the socket (which can fire onclose).
  activeSession = null;
  recordingState = "stopping";
  updateUI();
  const socket = session.ws;
  try {
    if (terminate && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "Terminate" }));
    }
  } catch (error) {
    console.error("Failed to terminate WebSocket:", error);
  } finally {
    try {
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    } catch (error) {
      console.error("Failed to close WebSocket:", error);
    }
    try {
      await session.microphone.stopRecording();
    } catch (error) {
      console.error("Failed to stop microphone:", error);
    }
    recordingState = "idle";
    updateUI();
  }
}

async function failSession(session, error) {
  if (activeSession !== session) return;
  console.error("Recording failed:", error);
  await stopSession(session);
  alert(error.message || "Failed to start recording");
}

async function run() {
  // Repeated clicks during permission/token/socket/worklet setup or cleanup
  // are ignored. Only a fully started session exposes Stop.
  if (recordingState === "starting" || recordingState === "stopping") return;
  if (recordingState === "recording") {
    await stopSession(activeSession, true);
    return;
  }

  const session = { microphone: createMicrophone(), ws: null, opened: false };
  activeSession = session;
  recordingState = "starting";
  updateUI();
  try {
    await session.microphone.requestPermission();
    if (activeSession !== session) return;
    const response = await fetch("http://localhost:8000/token");
    const data = await response.json();
    if (response.ok === false || data.error || !data.token) {
      throw new Error("Failed to get temp token");
    }
    if (activeSession !== session) return;
    const endpoint = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=${data.token}`;
    const socket = session.ws = new WebSocket(endpoint);
    const turns = {}; // keyed by turn_order
    socket.onopen = async () => {
      if (activeSession !== session || session.opened) return;
      session.opened = true;
      try {
        await session.microphone.startRecording((audioChunk) => {
          if (activeSession === session && socket.readyState === WebSocket.OPEN) {
            socket.send(audioChunk);
          }
        });
        if (activeSession !== session) return;
        console.log("WebSocket connected!");
        messageEl.style.display = "";
        recordingState = "recording";
        updateUI();
      } catch (error) {
        await failSession(session, error);
      }
    };
    socket.onmessage = (event) => {
      if (activeSession !== session) return;
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

    socket.onerror = () => {
      void failSession(session, new Error("WebSocket error, check the console."));
    };
    socket.onclose = () => {
      void stopSession(session);
    };
  } catch (error) {
    await failSession(session, error);
  }
}

buttonEl.addEventListener("click", () => run());


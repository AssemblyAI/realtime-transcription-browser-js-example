// required dom elements
const buttonEl = document.getElementById("button");
const messageEl = document.getElementById("message");
const titleEl = document.getElementById("real-time-title");

// set initial state of application variables
messageEl.style.display = "none";
let isRecording = false;
let rt;
let recorder;

// runs real-time transcription and handles global variables
const run = async () => {
  if (isRecording) {
    if (rt) {
      await rt.close(false);
      rt = null;
    }

    if (recorder) {
      recorder.pauseRecording();
      recorder = null;
    }
  } else {
    const response = await fetch("/token"); // get temp session token from server.js (backend)
    const data = await response.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    rt = new assemblyai.RealtimeService({ token: data.token });
    // handle incoming messages to display transcription to the DOM
    const texts = {};
    rt.on("transcript", (message) => {
      let msg = "";
      texts[message.audio_start] = message.text;
      const keys = Object.keys(texts);
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        if (texts[key]) {
          msg += ` ${texts[key]}`;
        }
      }
      messageEl.innerText = msg;
    });

    rt.on("error", async (error) => {
      console.error(error);
      await rt.close();
    });

    rt.on("close", (event) => {
      console.log(event);
      rt = null;
    });

    await rt.connect();
    // once socket is open, begin recording
    messageEl.style.display = "";
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        recorder = new RecordRTC(stream, {
          type: "audio",
          mimeType: "audio/webm;codecs=pcm", // endpoint requires 16bit PCM audio
          recorderType: StereoAudioRecorder,
          timeSlice: 250, // set 250 ms intervals of data that sends to AAI
          desiredSampRate: 16000,
          numberOfAudioChannels: 1, // real-time requires only one channel
          bufferSize: 16384,
          audioBitsPerSecond: 128000,
          ondataavailable: async (blob) => {
            // audio data must be sent as a base64 encoded string
            if (rt) {
              rt.sendAudio(await blob.arrayBuffer());
            }
          },
        });

        recorder.startRecording();
      })
      .catch((err) => console.error(err));
  }

  isRecording = !isRecording;
  buttonEl.innerText = isRecording ? "Stop" : "Record";
  titleEl.innerText = isRecording
    ? "Click stop to end recording!"
    : "Click start to begin recording!";
};

buttonEl.addEventListener("click", () => run());

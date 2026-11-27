const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

async function packets(sizes) {
  let node;
  const context = vm.createContext({
    document: { getElementById: () => ({ style: {}, addEventListener() {} }) },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } },
    AudioContext: class {
      sampleRate = 16000;
      audioWorklet = { addModule: async () => {} };
      destination = {};
      createMediaStreamSource() { return { connect() {} }; }
    },
    AudioWorkletNode: class {
      port = {};
      constructor() { node = this; }
      connect() {}
    },
    Int16Array, Uint8Array,
  });
  const file = process.env.APP_JS || path.join(__dirname, "../public/index.js");
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  const output = [];
  context.capture = chunk => output.push(...new Int16Array(
    chunk.buffer, chunk.byteOffset, chunk.byteLength / 2));
  await vm.runInContext("createMicrophone().startRecording(capture)", context);
  let next = 0;
  for (const size of sizes) {
    const samples = Int16Array.from({ length: size }, () => next++);
    const before = output.length;
    node.port.onmessage({ data: { audio_data: samples.buffer } });
    if (output.length !== before) assert.equal(output.length - before, 1600);
  }
  assert.equal(output.length, Math.floor(next / 1600) * 1600);
  assert.deepEqual(output, Array.from({ length: output.length }, (_, i) => i));
}

test("128-sample worklet deliveries send only removed samples", () => packets(Array(25).fill(128)));
test("exact 1600-sample control", () => packets([1600, 1600]));
test("irregular deliveries retain the tail for the next packet", () => packets([1000, 701, 899, 700, 1500]));

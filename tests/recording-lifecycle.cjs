const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function app(mode = "success") {
  const a = { streams: [], contexts: [], sockets: [], nodes: [], alerts: [], tokenCalls: 0 };
  a.token = deferred();
  a.module = deferred();
  const elements = {};
  const context = vm.createContext({
    document: { getElementById: id => elements[id] ||= { style: {}, addEventListener() {} } },
    navigator: { mediaDevices: { getUserMedia: async () => {
      if (mode === "permission") throw new Error("permission denied");
      const track = { readyState: "live", stop() { this.readyState = "ended"; } };
      const stream = { getTracks: () => [track] };
      a.streams.push(stream);
      return stream;
    } } },
    AudioContext: class {
      state = "running";
      sampleRate = 16000;
      destination = {};
      audioWorklet = { addModule: async () => {
        if (mode === "addModule") throw new Error("module failure");
        if (mode === "modulePending") await a.module.promise;
      } };
      constructor() {
        if (mode === "context") throw new Error("context failure");
        a.contexts.push(this);
      }
      createMediaStreamSource() {
        if (mode === "source") throw new Error("source failure");
        return { connect() { if (mode === "connect") throw new Error("connect failure"); }, disconnect() {} };
      }
      async close() { this.state = "closed"; }
    },
    AudioWorkletNode: class {
      port = { close() {} };
      constructor() {
        if (mode === "node") throw new Error("node failure");
        a.nodes.push(this);
      }
      connect() {}
      disconnect() {}
    },
    fetch: async () => {
      a.tokenCalls++;
      if (mode === "reject") throw new Error("network failure");
      if (mode === "pending") return a.token.promise;
      return { ok: mode !== "http", json: async () => {
        if (mode === "badjson") throw new Error("JSON failure");
        return mode === "missing" ? {} : mode === "error" ? { error: "token failure" } : { token: "OFFLINE" };
      } };
    },
    WebSocket: class {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = 0;
      sent = [];
      constructor() {
        if (mode === "socket") throw new Error("socket constructor failure");
        a.sockets.push(this);
      }
      send(data) { this.sent.push(data); }
      close() { this.readyState = 3; this.onclose?.(); }
      open() { this.readyState = 1; return this.onopen?.(); }
    },
    alert: message => a.alerts.push(message),
    console: { log() {}, error() {} },
    Int16Array, Uint8Array,
  });
  vm.runInContext(fs.readFileSync(process.env.APP_JS || path.join(__dirname, "../public/index.js"), "utf8"), context);
  a.run = () => vm.runInContext("run()", context);
  a.eval = js => vm.runInContext(js, context);
  a.button = () => elements.button.innerText;
  a.idle = () => {
    assert.equal(a.button(), "Record");
    assert.ok(a.streams.every(s => s.getTracks().every(t => t.readyState === "ended")));
    assert.ok(a.contexts.every(c => c.state === "closed"));
    assert.ok(a.sockets.every(s => s.readyState === 3));
  };
  return a;
}

for (const mode of ["permission", "error", "missing", "reject", "badjson", "http", "socket",
  "context", "source", "addModule", "node", "connect"]) {
  test(`${mode} failure releases all acquired resources and permits retry`, async () => {
    const a = app(mode);
    for (let i = 0; i < 2; i++) {
      await a.run();
      if (a.sockets.at(-1)?.readyState === 0) await a.sockets.at(-1).open();
      a.idle();
      assert.equal(a.alerts.length, i + 1);
    }
  });
}

test("pending starts have one owner; late callbacks cannot affect the next session", async () => {
  const a = app("pending");
  const first = a.run();
  await tick();
  const repeat = a.run();
  await tick();
  assert.equal(a.streams.length, 1);
  assert.equal(a.tokenCalls, 1);
  await repeat;
  a.token.resolve({ json: async () => ({ token: "OFFLINE" }) });
  await first;
  const old = a.sockets[0];
  await a.run(); // ignored while connecting
  assert.equal(a.sockets.length, 1);
  await old.open();
  await old.onopen(); // duplicate open
  assert.equal(a.nodes.length, 1);
  const lateAudio = a.nodes[0].port.onmessage;
  await a.run();
  a.idle();
  assert.deepEqual(old.sent, ['{"type":"Terminate"}']);
  await a.run();
  const current = a.sockets[1];
  await old.onopen();
  old.onclose();
  old.onerror();
  old.onmessage({ data: '{"type":"Turn","turn_order":0,"transcript":"stale"}' });
  lateAudio({ data: { audio_data: new Int16Array(1600).buffer } });
  assert.equal(a.button(), "Starting...");
  assert.equal(current.readyState, 0);
  await current.open();
  assert.equal(a.button(), "Stop");
  await a.run();
  a.idle();
});

test("two normal recording/stop cycles preserve immediate Terminate then close", async () => {
  const a = app();
  for (let i = 0; i < 2; i++) {
    await a.run();
    await a.sockets[i].open();
    assert.equal(a.button(), "Stop");
    await a.run();
    a.idle();
    assert.deepEqual(a.sockets[i].sent, ['{"type":"Terminate"}']);
  }
});

for (const event of ["onerror", "onclose"]) {
  test(`${event} during connection or recording releases the session`, async () => {
    for (const opened of [false, true]) {
      const a = app();
      await a.run();
      if (opened) await a.sockets[0].open();
      a.sockets[0][event]();
      await tick();
      a.idle();
    }
  });
}

test("close while addModule is pending prevents late node creation", async () => {
  const a = app("modulePending");
  await a.run();
  const opening = a.sockets[0].open();
  await tick();
  a.sockets[0].onclose();
  await tick();
  a.idle();
  await a.run(); // new session owns the UI while the old module resolves
  a.module.resolve();
  await opening;
  assert.equal(a.nodes.length, 0);
  assert.equal(a.button(), "Starting...");
  await a.sockets[1].open();
  await a.run();
  a.idle();
});

test("stopping a microphone before permission resolves ends the late stream", async () => {
  const a = app();
  a.eval("globalThis.mic = createMicrophone()");
  const permission = a.eval("mic.requestPermission()");
  await a.eval("mic.stopRecording()");
  await permission;
  assert.ok(a.streams.every(s => s.getTracks().every(t => t.readyState === "ended")));
});

# AssemblyAI Real-Time Transcription Browser Example

## Description
This is an open-source repo provided by AssemblyAI that displays how to use our real-time API in the browser!

In this app, we grab an audio stream from the user's computer and then send that over a WebSocket to AssemblyAI for real-time processing. This is accomplished using express.js for our backend and Vanilla JavaScript with the npm package [recordrtc](https://www.npmjs.com/package/recordrtc) on the frontend.

## How To Install and Run the Project	

### Before running this app, you need to upgrade your AssemblyAI account to a Pro Account. That requires adding a card to your account; you can do that in your dashboard [here](https://app.assemblyai.com/)!

1. Clone the repo to you local machine.
2. Open a terminal in the main directory housing the project. In this case `realtime-transcription-browser-js-example`.
3. Run `npm install` to ensure all dependencies are installed.
4. Add your AssemblyAI key to line 13 of [`server.js`](https://github.com/AssemblyAI/realtime-transcription-browser-js-example/blob/62e07e1d2a7ee2e13349c4e817b048e41334c4ec/js/server.js#L13)
5. Start the server with the command `npm run server` (will run on port 5000).
7. Open a second terminal in the main directory of the project and start the client side with `npm run client` (will run on port 3000).
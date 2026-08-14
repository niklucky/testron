# Testron

Phase 0 feasibility spike for a secure Electron-owned browser recorder that emits deterministic Playwright TypeScript.

## Run

```sh
npm install
npm start
```

In the toolbar, select **Start recording**, press **Go**, fill both fixture fields, and press **Continue**. Stop recording to see the final normalized steps and source.

## Verify

```sh
npm run check
npm run test:replay
npm run build
npm run test:electron
```

The replay command runs the checked-in source generated from the canonical fixture steps against the controlled local fixture. The Electron test launches the built app and verifies the tested website's effective sandbox preferences and absent privileged globals.

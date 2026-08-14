# Phase 0 Recorder Spike Findings

Date: 2026-08-14

## Outcome

The feasibility spike meets its controlled exit criterion. Testron records one
main-frame navigation, two fills, and a click from a sandboxed Electron
`WebContentsView`. It renders normalized human-readable steps and deterministic
Playwright TypeScript. The checked-in generated test compiles and replays against
the fixture successfully without using private Playwright recorder APIs.

## Evidence

- The Electron integration test drives the actual app bridge, recorder preload,
  IPC validation, normalization, React output, and generated source preview.
- The replay test runs the generated login-like flow against the local fixture.
- Unit tests cover input-burst collapse, action ordering, sensitive-value
  redaction, deterministic code generation, process preferences, and channel
  allowlisting.
- The packaged macOS ARM64 application builds with Electron 43.4.0 and Electron
  Forge 7.11.2.

## Checkpoint review

- **Locator quality:** The fixture selects test IDs first and role/name second,
  retaining label, placeholder, text, and marked-fragile CSS alternatives. The
  accessible-name heuristic is intentionally incomplete and needs broader
  fixtures before Phase 2 ranking work.
- **Event noise:** Repeated input events collapse to a single final fill. A click
  flushes pending fills first. Click-caused navigation is not emitted as a second
  user action in the verified flow.
- **Navigation survival:** Electron reinstalls the isolated recorder preload on
  the next document, and the controlled flow continues through full navigation.
- **Security:** Effective runtime preferences are `nodeIntegration: false`,
  `contextIsolation: true`, and `sandbox: true`. The tested page receives no
  privileged bridge, and main process IPC rejects unexpected senders, frames,
  channels, and payload shapes.
- **Unsupported actions:** Known Phase 0 controls such as select, checkbox,
  radio, and file inputs emit a visible warning instead of silently producing a
  misleading step.

## Decision

Keep the embedded `WebContentsView` architecture for Phase 1. The spike does not
justify switching to a controlled external Playwright browser. Reassess after
testing framework re-renders, cross-origin frames, authentication, and popups on
representative applications.

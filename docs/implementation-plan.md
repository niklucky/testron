# Testron Implementation Plan

## Delivery rule

Build the recorder before building a product around it. Every phase has an exit
criterion. Do not advance because screens look complete; advance when the core
user outcome works end to end.

## Phase 0: Recorder feasibility spike

### Goal

Prove that an Electron-owned browser surface can record a small flow, generate
deterministic Playwright TypeScript, and replay it successfully.

### Work

- Scaffold the Electron, TypeScript, React, and Vite application.
- Create a Testron toolbar and a sandboxed `WebContentsView` below it.
- Load a configurable URL.
- Install the isolated recorder preload.
- Capture main-frame navigation, click, and fill observations.
- Normalize input event bursts into one fill step.
- Produce basic semantic locator candidates.
- Store steps in memory using versioned Zod schemas.
- Render both human-readable steps and generated Playwright source.
- Add a controlled local fixture page with a login-like flow.
- Compile and replay the generated test using Playwright Test.
- Add security assertions for the tested website's process preferences and IPC
  surface.

### Exit criterion

A user can record a navigation, fill two fields, click a button, and successfully
replay the generated Playwright test against the controlled fixture. No private
Playwright recorder API is used.

### Decision checkpoint

Review locator quality, event noise, page-navigation survival, and security. If
the embedded surface is unsuitable, compare it with a controlled external
Playwright browser before building CRUD.

## Phase 1: Thin vertical product slice

### Goal

Let a QA engineer create, record, persist, review, and export a simple test.

### Work

- Add SQLite initialization and explicit SQL migrations.
- Implement projects.
- Implement environments with name, base URL, and test-ID attribute.
- Implement test creation starting with the test title.
- Add recording-session lifecycle: start, record, pause, undo, and finish.
- Support:
  - Navigate.
  - Click.
  - Fill.
  - Select option.
  - Check and uncheck.
  - Meaningful key press.
- Persist normalized steps transactionally.
- Build the review screen with Human-readable and Playwright tabs.
- Allow deleting and reordering structured steps.
- Add Copy and Export `.spec.ts` actions.
- Validate generated TypeScript in automated tests.
- Restore saved projects and tests after restarting Testron.

### Exit criterion

A QA engineer can install Testron, create a project and environment, record a
test, finish it, restart Testron, reopen it, and export valid Playwright
TypeScript.

## Phase 2: Trustworthy tests

### Goal

Turn recorded scripts into tests with explicit expected outcomes and visible
quality signals.

### Work

- Add Verify mode.
- Support initial assertions:
  - Visible and hidden.
  - Text contains or equals.
  - Input value.
  - Enabled and disabled.
  - Checked and unchecked.
  - URL path.
- Rank locator candidates consistently.
- Retain alternative locator candidates.
- Detect ambiguous and fragile locators.
- Show warnings without preventing export.
- Add structured step editing and duplication.
- Add password-field secret placeholders.
- Generate environment-variable references rather than secret literals.
- Handle or explicitly report new windows and popups.
- Report unsupported interactions in the recording toolbar.
- Expand fixture applications to cover re-rendering and navigation cases.

### Exit criterion

Recorded tests contain assertions, secrets are absent from storage and source,
and common locator weaknesses are visible and repairable by the user.

## Phase 3: Replay and diagnosis

### Goal

Run tests from Testron and make failures understandable without hiding the
underlying Playwright behavior.

### Work

- Run an individual generated test locally.
- Display per-step progress.
- Capture failure screenshot and Playwright trace.
- Associate a Playwright failure with its structured step.
- Show the exact action, locator, error, and current page URL.
- Let the user choose an alternative locator and rerun.
- Add environment variables.
- Add reusable local authentication state with clear scope and revision rules.
- Add cancellation and timeouts without introducing a distributed job system.

### Exit criterion

A user can run a saved test, identify the structured step that failed, make a
bounded correction, and verify the result.

## Phase 4: Distribution and collaboration

### Goal

Make Testron safely distributable and portable after its local workflow proves
valuable.

### Work

- Package signed macOS and Windows builds.
- Add update delivery.
- Add project bundle import and export.
- Add Git-friendly Playwright project export.
- Define compatibility and migration policy for stored step schemas.
- Evaluate optional team synchronization based on actual usage.
- Evaluate narrow, explicit AI helpers only where they reduce demonstrated
  friction, such as explaining a failure or suggesting assertion wording.

### Exit criterion

Testron can be installed and updated by non-developers, and projects can leave
the application in an understandable, durable format.

## Phase 0 first-session checklist

1. Initialize the repository and package metadata.
2. Pin Electron and Forge versions.
3. Establish TypeScript, lint, format, unit-test, and package commands.
4. Create one main window containing an app renderer and a `WebContentsView`.
5. Lock down both renderer configurations before loading remote content.
6. Create the recorder event schema before implementing event listeners.
7. Build the controlled fixture page.
8. Record click and fill candidates.
9. Normalize candidates into structured steps.
10. Generate Playwright TypeScript.
11. Replay it and make the test pass.
12. Document spike findings and update the architecture decision.

## Engineering guardrails

- No backend during Phases 0-2.
- No AI dependency in recording, normalization, code generation, or replay.
- No use of undocumented Playwright internals.
- No Node integration in remote content.
- No silent event loss: unsupported actions surface a warning.
- No stored password values or generated secret literals.
- No arbitrary code-to-steps reverse parser in the initial product.
- No new abstraction without at least two concrete consumers or a clear safety
  boundary.

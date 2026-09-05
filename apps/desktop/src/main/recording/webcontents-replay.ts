import type { WebContents } from 'electron';
import type { Step } from '@testron/domain/steps/schema';
import { replayPage } from './replay-page';
import { parkPage } from './park-page';

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('Step replay cancelled.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });

export class WebContentsReplay {
  constructor(
    private readonly contents: () => WebContents,
    private readonly variables: () => Readonly<Record<string, string>>,
    private readonly timeoutMs = 5_000,
  ) {}

  private async evaluate(
    contents: WebContents,
    step: Step | undefined,
    operation: 'prepare' | 'highlight',
  ) {
    return (await contents.executeJavaScriptInIsolatedWorld(1004, [
      {
        code: `(${replayPage.toString()})(${JSON.stringify(step) ?? 'undefined'}, ${JSON.stringify(operation)})`,
      },
    ])) as { ready: boolean; point?: { x: number; y: number }; key?: string };
  }

  async reset(clear: () => Promise<void>, url: string, signal: AbortSignal): Promise<void> {
    const contents = this.contents();
    contents.stop();
    await this.bounded(parkPage(contents), signal);
    // Storage clearing has no cancellation API. Keep it serialized even when the
    // selection is superseded, so it cannot clear a newer replay's storage later.
    await clear();
    signal.throwIfAborted();
    await this.execute(
      { version: 1, kind: 'navigate', url, metadata: { recordedAt: new Date(0).toISOString() } },
      signal,
    );
    if (!contents.isDestroyed()) contents.navigationHistory.clear();
  }

  async execute(step: Step, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const contents = this.contents();
    if (step.kind === 'press') {
      const host = contents.hostWebContents;
      if (host && !host.isDestroyed()) {
        host.focus();
        await this.bounded(
          host.executeJavaScript(`
          Array.from(document.querySelectorAll('webview'))
            .find(view => view.getWebContentsId() === ${contents.id})?.focus();
        `),
          signal,
        );
      }
      contents.focus();
    }
    const abort = () => {
      if (!contents.isDestroyed()) contents.stop();
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (step.kind === 'code') throw new Error('Exact code cannot be replayed as a browser step.');
      if (step.kind === 'navigate') {
        const url = new URL(step.url);
        if (!['http:', 'https:'].includes(url.protocol))
          throw new Error('Only HTTP(S) steps can be replayed.');
        await this.bounded(contents.loadURL(url.href), signal);
        return;
      }
      if (step.kind === 'fill' && (step.variable || step.secret)) {
        const name = step.secret?.environmentVariable ?? step.variable!.name;
        const value = this.variables()[name];
        if (!value) throw new Error(`Missing required profile variable: ${name}`);
        step = { ...step, value };
      }
      const deadline = Date.now() + this.timeoutMs;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (contents.isDestroyed() || contents !== this.contents())
          throw new Error('The tested browser changed.');
        if (!contents.isLoadingMainFrame()) {
          if (step.kind === 'assertUrlPath') {
            if (new URL(contents.getURL()).pathname === step.expected) return;
          } else {
            const result = await this.bounded(this.evaluate(contents, step, 'prepare'), signal);
            if (result.ready) {
              if (result.point || result.key) {
                if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
                if (result.point) {
                  await contents.debugger.sendCommand('Input.dispatchMouseEvent', {
                    type: 'mouseMoved',
                    ...result.point,
                  });
                  if (step.kind !== 'hover') {
                    await contents.debugger.sendCommand('Input.dispatchMouseEvent', {
                      type: 'mousePressed',
                      ...result.point,
                      button: 'left',
                      clickCount: 1,
                    });
                    await contents.debugger.sendCommand('Input.dispatchMouseEvent', {
                      type: 'mouseReleased',
                      ...result.point,
                      button: 'left',
                      clickCount: 1,
                    });
                  }
                }
                if (result.key) await this.press(contents, result.key);
              }
              // Let synchronous navigation and framework event handlers settle before the next step.
              await delay(50, signal);
              while (contents.isLoadingMainFrame() && Date.now() < deadline)
                await delay(50, signal);
              if (contents.isLoadingMainFrame())
                throw new Error('The tested page did not finish loading.');
              if (step.kind === 'check' || step.kind === 'uncheck') {
                const checked = await this.bounded(
                  this.evaluate(contents, step, 'prepare'),
                  signal,
                );
                if (!checked.ready || checked.point)
                  throw new Error('The control did not change its checked state.');
              }
              return;
            }
          }
        }
        await delay(50, signal);
      }
      throw new Error('The selected step could not find a ready target or satisfy its assertion.');
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  async highlight(step: Step | undefined): Promise<void> {
    const contents = this.contents();
    await this.bounded(this.evaluate(contents, step, 'highlight'), new AbortController().signal);
  }

  private async bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          abort = () => reject(new Error('Step replay cancelled.'));
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
          timer = setTimeout(
            () => reject(new Error('The tested browser did not respond in time.')),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  private async press(contents: WebContents, chord: string): Promise<void> {
    const parts = chord.split('+');
    let key = parts.pop()!;
    const flags: Record<string, number> = {
      Alt: 1,
      Control: 2,
      Meta: 4,
      Shift: 8,
      ControlOrMeta: process.platform === 'darwin' ? 4 : 2,
    };
    if (parts.some((part) => flags[part] === undefined))
      throw new Error(`Unsupported key chord: ${chord}`);
    const modifiers = parts.reduce((value, part) => value | flags[part]!, 0);
    if (key === 'Space') key = ' ';
    const codes: Record<string, number> = {
      Enter: 13,
      Tab: 9,
      Escape: 27,
      Backspace: 8,
      Delete: 46,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      Home: 36,
      End: 35,
      PageUp: 33,
      PageDown: 34,
    };
    if (key.length !== 1 && codes[key] === undefined)
      throw new Error(`Unsupported replay key: ${key}`);
    const text =
      modifiers & (1 | 2 | 4)
        ? undefined
        : key === 'Enter'
          ? '\r'
          : key.length === 1
            ? key
            : undefined;
    const options = {
      key,
      modifiers,
      windowsVirtualKeyCode: codes[key] ?? key.toUpperCase().charCodeAt(0),
    };
    contents.focus();
    await contents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      ...options,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await contents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...options });
  }
}

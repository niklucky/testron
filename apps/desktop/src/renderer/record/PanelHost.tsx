import { useEffect, useState } from 'react';

import type { PanelId, RecordPanelEvent, RecordPanelState } from '../../preload/record';
import { Badge, IconButton } from '../design';
import { clock } from './codegen';
import { CodePanel } from './CodePanel';
import { GlassPanel } from './GlassPanel';
import { StepsPanel } from './StepsPanel';
import type { RecordedStep } from './types';

/**
 * What a panel view runs.
 *
 * This is a whole renderer whose window *is* the panel: an opaque block in a
 * WebContentsView docked beside the resized website view. It owns nothing — the
 * record screen pushes the state, and every interaction goes back as an event.
 *
 * The one exception is the resize drag. It starts here (the edge is in this
 * view), and while it runs the main process widens this view to the whole
 * browser plane so the pointer cannot cross into the site and strand the
 * gesture. `state.layout.resizing` is the handshake: until it names this
 * panel, the widening has not happened and moves are ignored.
 */
export const PanelHost = ({ panel }: { panel: PanelId }) => {
  const [state, setState] = useState<RecordPanelState>();

  const send = (event: RecordPanelEvent) => window.testron?.sendRecordEvent(event);

  useEffect(() => {
    // The document stays transparent so a temporarily widened resize view does
    // not cover the centre; GlassPanel itself is the opaque panel block.
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const stop = window.testron?.onRecordState(setState);
    window.testron?.sendRecordEvent({ type: 'ready', panel });
    return stop;
  }, [panel]);

  useEffect(() => {
    if (state) document.documentElement.dataset.theme = state.theme;
  }, [state?.theme]);

  // Shortcuts belong to the screen, but the keystroke lands wherever focus is.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (['r', 'a', 'f', '1', '2'].includes(key)) send({ type: 'shortcut', key });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const resizing = state?.layout.resizing === panel;
  const share = state?.layout.panels[panel].width ?? 25;
  const steps = (state?.steps ?? []) as RecordedStep[];

  return (
    <main className="ui-root relative h-screen w-screen overflow-hidden font-sans text-ink antialiased">
      <GlassPanel
        side={panel === 'steps' ? 'left' : 'right'}
        title={panel === 'steps' ? 'Test steps' : 'Auto test'}
        subtitle={
          panel === 'steps'
            ? `${steps.length} · ${clock(state?.elapsed ?? 0)}`
            : (state?.file.split('/').at(-1) ?? '')
        }
        // Normally the view is exactly the panel, so the frame fills it. While
        // the view is widened for a drag, the frame keeps its real share.
        width={resizing ? share : 100}
        onResize={(width, phase) => {
          if (phase === 'move' && !resizing) return;
          send({ type: 'resize', panel, width, done: phase === 'end' });
        }}
        onClose={() => send({ type: 'close', panel })}
        action={
          panel === 'steps' ? (
            state?.mode === 'assert' ? (
              <Badge tone="good" icon="eye" size="sm">
                Assert
              </Badge>
            ) : undefined
          ) : (
            <IconButton
              icon="copy"
              size="sm"
              label="Copy the spec"
              onClick={() => send({ type: 'copy' })}
            />
          )
        }
      >
        {panel === 'steps' ? (
          <StepsPanel
            steps={steps}
            status={state?.status ?? 'idle'}
            selectedId={state?.selectedId}
            expandedId={state?.expandedId}
            repickingId={state?.repickingId}
            onSelect={(id) => send({ type: 'select', id })}
            onExpand={(id) => send({ type: 'expand', id })}
            onUseAlternative={(id, locator) => send({ type: 'use-alternative', id, locator })}
            onEditLocator={(id, locator) => send({ type: 'edit-locator', id, locator })}
            onRepick={(id) => send({ type: 'repick', id })}
            onCancelRepick={() => send({ type: 'cancel-repick' })}
            onConvertToAssertion={(id) => send({ type: 'convert-to-assertion', id })}
            onDelete={(id) => send({ type: 'delete', id })}
          />
        ) : (
          <CodePanel
            lines={state?.lines ?? []}
            selectedId={state?.selectedId}
            onSelectStep={(id) => send({ type: 'select', id })}
          />
        )}
      </GlassPanel>
    </main>
  );
};

import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState } from 'react';
import { useHotkeys } from '@tanstack/react-hotkeys';

import type {
  PanelId,
  RecordPanelEvent,
  RecordPanelState,
  RecordShortcutKey,
} from '../../preload/record';
import { Badge, IconButton } from '../design';
import { clock } from './codegen';
import { SourceEditor } from '@testron/ui/source-editor';
import { useSourceDraft } from '@testron/ui/source-draft';
import { GlassPanel } from './GlassPanel';
import { recordPanelShortcutIds, recordShortcuts } from './hotkeys';
import { StepsPanel } from './StepsPanel';
import type { RecordedStep } from './types';
import type { StepViewMode } from './types';

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
  const { t } = useTranslation();
  const [state, setState] = useState<RecordPanelState>();
  const [stepViewMode, setStepViewMode] = useState<StepViewMode>('tester');

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

  // Panel views are separate documents, so they register the same shortcuts and forward them.
  useHotkeys(
    recordPanelShortcutIds.map((id) => ({
      hotkey: recordShortcuts[id].hotkey,
      callback: () =>
        send({
          type: 'shortcut',
          key: recordShortcuts[id].hotkey.toLowerCase() as RecordShortcutKey,
        }),
      options: {
        ignoreInputs: true,
        meta: {
          name: recordShortcuts[id].name,
          description: recordShortcuts[id].description,
        },
      },
    })),
  );

  const editor = useSourceDraft(state?.testId ?? '', state?.source ?? '', (source, testId) =>
    send({ type: 'update-source', source, ...(testId ? { testId } : {}) }),
  );

  const resizing = state?.layout.resizing === panel;
  const share = state?.layout.panels[panel].width ?? 25;
  const steps = (state?.steps ?? []) as RecordedStep[];

  return (
    <main className="ui-root relative h-screen w-screen overflow-hidden font-sans text-ink antialiased">
      <GlassPanel
        side={panel === 'steps' ? 'left' : 'right'}
        title={panel === 'steps' ? t('test_steps') : t('auto_test')}
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
                {t('assert')}
              </Badge>
            ) : undefined
          ) : (
            <IconButton
              icon="copy"
              size="sm"
              label={t('copy_the_spec')}
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
            viewMode={stepViewMode}
            onViewModeChange={setStepViewMode}
            onSelect={(id) => send({ type: 'select', id })}
            onExpand={(id) => send({ type: 'expand', id })}
            onUseAlternative={(id, locator) => send({ type: 'use-alternative', id, locator })}
            onEditLocator={(id, locator) => send({ type: 'edit-locator', id, locator })}
            onEditAssertion={(id, patch) => send({ type: 'edit-assertion', id, ...patch })}
            onRepick={(id) => send({ type: 'repick', id })}
            onCancelRepick={() => send({ type: 'cancel-repick' })}
            onConvertToAssertion={(id) => send({ type: 'convert-to-assertion', id })}
            onDelete={(id) => send({ type: 'delete', id })}
          />
        ) : (
          <SourceEditor {...editor} ariaLabel={t('test_source')} className="h-full" />
        )}
      </GlassPanel>
    </main>
  );
};

import { useEffect, useRef, useReducer } from 'react';

/** Keep acknowledgements and pending writes scoped to the document being edited. */
export const useSourceDraft = (
  documentKey: string,
  source: string,
  save: (source: string, documentKey: string) => void,
) => {
  const [, render] = useReducer((value: number) => value + 1, 0);
  const createDraft = () => ({
    documentKey,
    value: source,
    dirty: false,
    focused: false,
    pending: undefined as string | undefined,
    save,
  });
  const draftRef = useRef<ReturnType<typeof createDraft> | null>(null);
  if (!draftRef.current || draftRef.current.documentKey !== documentKey)
    draftRef.current = createDraft();
  const draft = draftRef.current;
  draft.save = save;
  useEffect(() => {
    if (source === draft.value) draft.dirty = false;
    else if (!draft.dirty && !draft.focused) draft.value = source;
    render();
  }, [source, draft]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (draft.pending === undefined) return;
      draft.save(draft.pending, documentKey);
      draft.pending = undefined;
    }, 500);
    return () => clearTimeout(timeout);
  }, [draft, draft.value, documentKey]);
  useEffect(
    () => () => {
      // Flush to the old document when switching tests or closing the editor.
      if (draft.pending !== undefined) draft.save(draft.pending, documentKey);
    },
    [draft, documentKey],
  );
  const flush = () => {
    if (draft.pending === undefined) return;
    draft.save(draft.pending, documentKey);
    draft.pending = undefined;
  };
  return {
    flush,
    value: draft.value,
    onChange: (value: string) => {
      draft.value = value;
      draft.pending = value;
      draft.dirty = true;
      render();
    },
    onFocusChange: (focused: boolean) => {
      draft.focused = focused;
      if (!focused) flush();
      if (!focused && !draft.dirty) draft.value = source;
      render();
    },
  };
};

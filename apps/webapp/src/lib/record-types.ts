export type PanelId = 'steps' | 'code';
export type RecordedStep = {
  id: string;
  kind:
    | 'navigate'
    | 'click'
    | 'hover'
    | 'fill'
    | 'select'
    | 'check'
    | 'uncheck'
    | 'press'
    | 'assert'
    | 'assertUrl';
  label: string;
  locator: string;
  alternatives: string[];
  spot?: string;
  value?: string;
  secret?: string;
  url?: string;
  assertion?:
    | 'visible'
    | 'hidden'
    | 'textContains'
    | 'textEquals'
    | 'value'
    | 'enabled'
    | 'disabled'
    | 'checked'
    | 'unchecked'
    | 'countExactly'
    | 'countAtLeast';
  warning?: string;
  at: number;
};
export type RecordPanelState = {
  status: 'idle' | 'recording' | 'paused' | 'finished';
  mode: 'act' | 'hover' | 'assert';
};

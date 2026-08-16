/**
 * The Testron design system.
 *
 *   tokens.css   colour, type and surface roles for both themes
 *   base.css     the element defaults everything else assumes
 *   tone.ts      the status vocabulary components speak in
 *   icons.tsx    one set, one stroke, one grid
 *   components/  interface primitives
 *   charts/      data-viz primitives
 *
 * Import from here, not from the individual files:
 *   import { Panel, Badge, StackedBars } from '../design';
 */

export { Icon, iconNames, type IconName } from './icons';
export { useTheme, type Theme } from './theme';
export {
  chartFill,
  heatEmpty,
  heatRamp,
  toneFill,
  toneInk,
  toneStyle,
  toneWash,
  type Tone,
} from './tone';

export { Badge, PulseDot, StatusDot } from './components/Badge';
export { Button, IconButton, type ButtonVariant } from './components/Button';
export { SearchField, TextArea } from './components/Fields';
export { Kbd } from './components/Kbd';
export { Avatar, NavItem } from './components/NavItem';
export { EmptyState, Panel, PanelHeader, SectionLabel } from './components/Panel';
export { SegmentedControl, Tabs, type SegmentedItem } from './components/Segmented';
export { Meter, StatCard, Trend } from './components/Stat';
export { Tooltip } from './components/Tooltip';

export { HeatMap, type HeatRow } from './charts/HeatMap';
export { Legend, type LegendItem } from './charts/Legend';
export { Ribbon, type RibbonCell } from './charts/Ribbon';
export { Sparkline } from './charts/Sparkline';
export { SplitBar, type Split } from './charts/SplitBar';
export { StackedBars, type StackedDatum } from './charts/StackedBars';

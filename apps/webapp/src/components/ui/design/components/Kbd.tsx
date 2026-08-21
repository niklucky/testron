import type { ReactNode } from 'react';

/** A key cap. Use it wherever a shortcut exists so the app teaches itself. */
export const Kbd = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <kbd
    className={`ui-mono rounded-[4px] border border-line bg-plane px-[5px] py-px text-xs leading-4 text-ink-3 ${className}`}
  >
    {children}
  </kbd>
);

import { Button, Icon, useTheme } from '../design';

export const RecoveryScreen = () => {
  const { theme, toggle } = useTheme();
  return (
    <main className="ui-root grid h-screen w-screen place-items-center bg-plane p-8 font-sans text-ink antialiased">
      <section className="w-full max-w-[560px] rounded-xl border border-line bg-surface p-7 shadow-[0_22px_60px_rgba(0,0,0,0.22)]">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-wash text-accent">
            <Icon name="monitor" size={20} />
          </span>
          <div>
            <p className="ui-mono tracking-[0.12em] text-accent uppercase">Local runtime</p>
            <h1 className="mt-1 text-2xl font-semibold">The Testron web app is unavailable</h1>
          </div>
        </div>
        <p className="mt-5 leading-6 text-ink-2">
          Check your connection and retry. Recording, replay, and recovery remain bundled with this
          desktop app. The browser installer will also live in this local layer.
        </p>
        <div className="mt-6 flex gap-2">
          <Button
            variant="primary"
            icon="rerun"
            onClick={() => window.testron.command({ type: 'reload-product' })}
          >
            Retry web app
          </Button>
          <Button
            onClick={() => {
              window.location.hash = '#/record';
            }}
          >
            Open local recorder
          </Button>
          <Button className="ml-auto" icon={theme === 'dark' ? 'sun' : 'moon'} onClick={toggle}>
            Theme
          </Button>
        </div>
      </section>
    </main>
  );
};

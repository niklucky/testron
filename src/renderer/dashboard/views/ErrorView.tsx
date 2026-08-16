import { SectionLabel } from '../../design';
import { failures } from '../data';
import type { Failure } from '../types';

/**
 * The raw stack, plus the two questions that follow it: which locator was
 * under test, and what else is failing next to it. A failure that co-occurs
 * with three others is usually one bug, not four.
 */
export const ErrorView = ({
  failure,
  onSelect,
}: {
  failure: Failure;
  onSelect: (id: string) => void;
}) => {
  const similar = failures.filter(
    (candidate) => candidate.id !== failure.id && candidate.suite === failure.suite,
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2">
          <SectionLabel>Stack</SectionLabel>
        </h3>
        <pre className="ui-mono overflow-x-auto rounded-lg border border-line bg-plane p-3 text-base leading-5 text-ink-2">
          {failure.message}
        </pre>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[1100px]:grid-cols-1">
        <div className="rounded-lg border border-line bg-plane p-3">
          <p className="text-sm text-ink-3">Locator under test</p>
          <p className="ui-mono mt-1.5 break-all text-base">{failure.locator}</p>
          <p className="mt-2 text-sm text-ink-3">
            Resolved in {failure.occurrences} of the last 24 runs · owner {failure.owner}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-plane p-3">
          <p className="text-sm text-ink-3">Seen together with</p>
          <ul className="mt-1.5 space-y-1.5">
            {similar.length === 0 && (
              <li className="text-base text-ink-3">Nothing else in {failure.suite} is failing.</li>
            )}
            {similar.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className="ui-mono w-full truncate text-left text-base text-accent hover:underline"
                  onClick={() => onSelect(candidate.id)}
                >
                  {candidate.signature} ×{candidate.occurrences}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

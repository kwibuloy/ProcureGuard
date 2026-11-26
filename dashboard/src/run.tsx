import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApi, type Run } from './api';

interface RunState {
  /** Every stored scoring run, newest first. */
  runs: Run[];
  /** The run every page is showing, or null to follow the latest. */
  selected: number | null;
  select: (id: number) => void;
}

const RunContext = createContext<RunState>({ runs: [], selected: null, select: () => {} });

/** The study's model; the API opens on its latest run (api/src/queries/runs.ts). */
const PRIMARY_MODEL = 'Isolation Forest';

/**
 * The current run: the latest run of the study's model, or the latest run of any
 * model when there is none, the same rule the API uses when no run is asked for.
 * `runs` is newest first. Every other run is superseded, kept only for the record.
 */
export function currentRunId(runs: Pick<Run, 'id' | 'modelName'>[]): number | null {
  return (runs.find((run) => run.modelName === PRIMARY_MODEL) ?? runs[0])?.id ?? null;
}
const STORAGE_KEY = 'procureguard-run';

function remembered(): number | null {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

/** Holds which scoring run the dashboard shows. The choice lasts for the browser session. */
export function RunProvider({ children }: { children: ReactNode }) {
  const runs = useApi<Run[]>('/api/runs').data;
  const [chosen, setChosen] = useState<number | null>(remembered);

  const value = useMemo<RunState>(() => {
    const list = runs ?? [];
    // A remembered run can have been deleted since; then follow the latest.
    const selected = chosen && list.some((run) => run.id === chosen) ? chosen : null;
    return {
      runs: list,
      selected,
      select: (id) => {
        setChosen(id);
        try {
          sessionStorage.setItem(STORAGE_KEY, String(id));
        } catch {
          // Storage can be unavailable; the choice still holds until the page reloads.
        }
      },
    };
  }, [runs, chosen]);

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export const useRuns = () => useContext(RunContext);

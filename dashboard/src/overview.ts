import { useOutletContext } from 'react-router-dom';
import type { Loaded, Overview } from './api';

/** The shown run's overview, loaded once by the layout and shared with every page. */
export type OverviewContext = Loaded<Overview> & {
  /** Contracts on the queue page being shown, in order, for previous and next. */
  listIds?: number[];
};
export const useOverview = () => useOutletContext<OverviewContext>();

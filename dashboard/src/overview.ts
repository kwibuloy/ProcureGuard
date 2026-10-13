import { useOutletContext } from 'react-router-dom';
import type { Loaded, Overview } from './api';

/** The latest run's overview, loaded once by the layout and shared with every page. */
export type OverviewContext = Loaded<Overview>;
export const useOverview = () => useOutletContext<OverviewContext>();

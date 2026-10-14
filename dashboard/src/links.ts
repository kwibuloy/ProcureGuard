import type { ProfileKind } from './api';

/** Link to the page listing everything one entity awarded or one awardee won. */
export const profileLink = (kind: ProfileKind, key: string) => ({
  pathname: `/profile/${kind}`,
  search: `?${new URLSearchParams({ name: key })}`,
});

import type { LocatorKind, LocatorSet, MatchResult } from '@/shared/types';
import type { FrameworkFilter } from './components/LocatorSuggestions';

/**
 * Everything the Locator tab needs to survive being unmounted when the user
 * switches to another side-panel tab and back — lifted to App.tsx (which
 * lazy-loads LocatorTab.tsx itself, so this shape lives in its own
 * dependency-light module instead of being imported as a value from there,
 * which would pull the whole component into the initial bundle).
 */
export interface LocatorTabState {
  picking: boolean;
  result: LocatorSet | null;
  error: string | null;
  filter: FrameworkFilter;
  query: string;
  testCount: number | null;
  testKind: LocatorKind;
  testedQuery: string;
  testError: string | null;
  highlighting: boolean;
  matchInfo: MatchResult | null;
}

export const INITIAL_LOCATOR_TAB_STATE: LocatorTabState = {
  picking: false,
  result: null,
  error: null,
  filter: 'all',
  query: '',
  testCount: null,
  testKind: 'css',
  testedQuery: '',
  testError: null,
  highlighting: false,
  matchInfo: null,
};

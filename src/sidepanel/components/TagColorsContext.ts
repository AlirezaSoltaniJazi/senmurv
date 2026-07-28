import { createContext } from 'react';

/**
 * Tag → palette-index overrides, shared with the Track view components so a
 * recolour chosen in Settings shows everywhere without threading the map through
 * every intermediate component. Provided by `TrackTab`; read via `useContext`.
 */
export const TagColorsContext = createContext<Record<string, number>>({});

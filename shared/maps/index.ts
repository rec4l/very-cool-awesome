import { classicMap } from './classic';
import { largeMap } from './large';
import { xlMap } from './xl';
import type { MapDefinition } from '../types';

export const MAPS: Record<string, MapDefinition> = {
  classic: classicMap,
  large: largeMap,
  xl: xlMap,
};

export { classicMap, largeMap, xlMap };

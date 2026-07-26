import type { RegionConfig } from '@/shared/types';

/**
 * Pure region-preset data for the Region Emulator. A preset bundles a country's
 * IANA timezone, BCP-47 locale and representative coordinates; the MAIN-world
 * shim (in the service worker) applies them so page JS reads that region's clock,
 * timezone, locale and geolocation. This module holds the data + config shaping,
 * which is what stays unit-testable — the shim itself is verified in a browser.
 */

export interface RegionPreset {
  readonly id: string;
  readonly label: string;
  readonly flag: string;
  readonly timezone: string;
  readonly locale: string;
  readonly lat: number;
  readonly lon: number;
}

export const REGIONS: readonly RegionPreset[] = [
  {
    id: 'us-ny',
    label: 'United States (New York)',
    flag: '🇺🇸',
    timezone: 'America/New_York',
    locale: 'en-US',
    lat: 40.7128,
    lon: -74.006,
  },
  {
    id: 'us-la',
    label: 'United States (Los Angeles)',
    flag: '🇺🇸',
    timezone: 'America/Los_Angeles',
    locale: 'en-US',
    lat: 34.0522,
    lon: -118.2437,
  },
  {
    id: 'ca',
    label: 'Canada (Toronto)',
    flag: '🇨🇦',
    timezone: 'America/Toronto',
    locale: 'en-CA',
    lat: 43.6532,
    lon: -79.3832,
  },
  {
    id: 'br',
    label: 'Brazil (São Paulo)',
    flag: '🇧🇷',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    lat: -23.5505,
    lon: -46.6333,
  },
  {
    id: 'uk',
    label: 'United Kingdom (London)',
    flag: '🇬🇧',
    timezone: 'Europe/London',
    locale: 'en-GB',
    lat: 51.5074,
    lon: -0.1278,
  },
  {
    id: 'fr',
    label: 'France (Paris)',
    flag: '🇫🇷',
    timezone: 'Europe/Paris',
    locale: 'fr-FR',
    lat: 48.8566,
    lon: 2.3522,
  },
  {
    id: 'de',
    label: 'Germany (Berlin)',
    flag: '🇩🇪',
    timezone: 'Europe/Berlin',
    locale: 'de-DE',
    lat: 52.52,
    lon: 13.405,
  },
  {
    id: 'es',
    label: 'Spain (Madrid)',
    flag: '🇪🇸',
    timezone: 'Europe/Madrid',
    locale: 'es-ES',
    lat: 40.4168,
    lon: -3.7038,
  },
  {
    id: 'ae',
    label: 'UAE (Dubai)',
    flag: '🇦🇪',
    timezone: 'Asia/Dubai',
    locale: 'ar-AE',
    lat: 25.2048,
    lon: 55.2708,
  },
  {
    id: 'ir',
    label: 'Iran (Tehran)',
    flag: '🇮🇷',
    timezone: 'Asia/Tehran',
    locale: 'fa-IR',
    lat: 35.6892,
    lon: 51.389,
  },
  {
    id: 'in',
    label: 'India (Mumbai)',
    flag: '🇮🇳',
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
    lat: 19.076,
    lon: 72.8777,
  },
  {
    id: 'cn',
    label: 'China (Shanghai)',
    flag: '🇨🇳',
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    lat: 31.2304,
    lon: 121.4737,
  },
  {
    id: 'jp',
    label: 'Japan (Tokyo)',
    flag: '🇯🇵',
    timezone: 'Asia/Tokyo',
    locale: 'ja-JP',
    lat: 35.6762,
    lon: 139.6503,
  },
  {
    id: 'au',
    label: 'Australia (Sydney)',
    flag: '🇦🇺',
    timezone: 'Australia/Sydney',
    locale: 'en-AU',
    lat: -33.8688,
    lon: 151.2093,
  },
];

/** Look up a preset by id. */
export function findRegion(id: string): RegionPreset | undefined {
  return REGIONS.find((r) => r.id === id);
}

/** Build the shim config for a preset; `includeGeo` decides whether to spoof geolocation. */
export function configForRegion(preset: RegionPreset, includeGeo: boolean): RegionConfig {
  return {
    timezone: preset.timezone,
    locale: preset.locale,
    coords: includeGeo ? { lat: preset.lat, lon: preset.lon } : null,
  };
}

import { SYNC_PORT } from '@field-form/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the sync server lives (DESIGN.md §7, "Server discovery").
 * The server runs on the same machine as Metro, so reuse Metro's host:
 * - physical device: hostUri is the dev machine's LAN IP
 * - Android emulator: localhost means the emulator itself, so map to 10.0.2.2
 * EXPO_PUBLIC_SYNC_URL overrides everything (e.g. a server on another machine).
 */
export function syncUrl(): string {
  const override = process.env.EXPO_PUBLIC_SYNC_URL;
  if (override) return override;
  let host = Constants.expoConfig?.hostUri?.split(':')[0] || 'localhost';
  if (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) host = '10.0.2.2';
  return `ws://${host}:${SYNC_PORT}`;
}

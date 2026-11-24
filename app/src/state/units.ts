import type { UnitSystem } from '@field-form/shared';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';

const KEY = 'unitSystem';

function saved(): UnitSystem {
  try {
    return Storage.getItemSync(KEY) === 'metric' ? 'metric' : 'imperial';
  } catch {
    return 'imperial';
  }
}

/**
 * Display units for this device, remembered between launches. Display only: every value is
 * stored in µm, so switching never changes data and the other device can use the other system.
 */
export const useUnits = create<{ system: UnitSystem; toggle(): void }>((set, get) => ({
  system: saved(),
  toggle: () => {
    const system: UnitSystem = get().system === 'imperial' ? 'metric' : 'imperial';
    try {
      Storage.setItemSync(KEY, system);
    } catch {
      // Not remembered after a restart, but the switch still applies now.
    }
    set({ system });
  },
}));

export const useUnitSystem = () => useUnits((s) => s.system);

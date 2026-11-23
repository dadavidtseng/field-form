import { randomUUID } from 'expo-crypto';

/** One id per app launch. Identifies this device's edits in commits. */
export const CLIENT_ID = randomUUID();

import { format } from 'date-fns';
import { cancelExternalTrip, expectExternalTrip } from '@/lib/external-trip';
import { loadUpiIntent } from '@/modules/upi-intent';

const native = loadUpiIntent();

/**
 * Save the recovery key as a text file through Android's "Save as" screen, which opens in Downloads and lets the
 * user pick Drive or any folder. No storage permission is needed. Returns false if the user backs out.
 */
export async function saveRecoveryKeyFile(key: string): Promise<boolean> {
  if (!native) throw new Error('Saving files isn’t available in this build.');
  const content = [
    'SpentSmart recovery key',
    '',
    key,
    '',
    'You need this to restore your backup on a new phone or after reinstalling SpentSmart.',
    'Anyone with this key and your Google account can read your backup, so keep it private.',
    'SpentSmart cannot recover it for you.',
    '',
  ].join('\n');
  expectExternalTrip();
  try {
    return await native.saveTextFile(`SpentSmart recovery key ${format(new Date(), 'yyyy-MM-dd')}.txt`, content);
  } finally {
    cancelExternalTrip();
  }
}

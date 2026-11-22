import { format } from 'date-fns';
import { Directory } from 'expo-file-system';
import { cancelExternalTrip, expectExternalTrip } from '@/lib/external-trip';

/**
 * Save the recovery key as a text file in a folder the user picks (Downloads, Drive...). Android's folder picker
 * grants access to that one folder only, so no storage permission is needed. Returns false if the user backs out.
 */
export async function saveRecoveryKeyFile(key: string): Promise<boolean> {
  expectExternalTrip();
  const folder = await Directory.pickDirectoryAsync().catch(() => null);
  if (!folder) {
    cancelExternalTrip();
    return false;
  }
  const file = folder.createFile(`SpentSmart recovery key ${format(new Date(), 'yyyy-MM-dd')}.txt`, 'text/plain');
  file.write(
    [
      'SpentSmart recovery key',
      '',
      key,
      '',
      'You need this to restore your backup on a new phone or after reinstalling SpentSmart.',
      'Anyone with this key and your Google account can read your backup, so keep it private.',
      'SpentSmart cannot recover it for you.',
      '',
    ].join('\n'),
  );
  return true;
}

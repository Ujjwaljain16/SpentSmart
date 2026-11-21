import { File, Paths } from 'expo-file-system';
import { createCrashLog, installCrashHandler } from './crash-log';

/** The app's crash log: a file in its private storage (not backed up; allowBackup is off). */
const file = new File(Paths.document, 'crash-log.json');

export const crashLog = createCrashLog({
  read: () => (file.exists ? file.textSync() : null),
  write: (text) => {
    if (!file.exists) file.create();
    file.write(text);
  },
});

declare const ErrorUtils: Parameters<typeof installCrashHandler>[1];
installCrashHandler(crashLog, typeof ErrorUtils !== 'undefined' ? ErrorUtils : undefined);

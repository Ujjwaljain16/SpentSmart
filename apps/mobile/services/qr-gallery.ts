import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { log } from '@/lib/logger';

export type SaveQrResult = 'saved' | 'denied' | 'error';

/**
 * Save a QR image (base64 PNG) to the photo gallery so a UPI app can import it with "scan from gallery".
 * Needs only the save-only photo permission; the app cannot read the user's photos.
 */
export async function saveQrToGallery(base64Png: string): Promise<SaveQrResult> {
  const file = new File(Paths.cache, `spentsmart-qr-${Date.now()}.png`);
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return 'denied';
    file.create({ overwrite: true });
    file.write(base64Png.replace(/^data:image\/png;base64,/, ''), { encoding: 'base64' });
    await MediaLibrary.saveToLibraryAsync(file.uri);
    return 'saved';
  } catch (error) {
    log.warn('Saving QR to gallery failed', error);
    return 'error';
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      /* best-effort cleanup of the temporary file */
    }
  }
}

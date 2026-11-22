import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { extractTextFromImage, isSupported as ocrSupported } from 'expo-text-extractor';
import { useCallback, useRef, useState } from 'react';
import { readReceipt } from '@spentsmart/finance/import/receipt';
import { paiseToDecimal } from '@spentsmart/finance/money';
import { cancelExternalTrip, expectExternalTrip } from '@/lib/external-trip';
import { log } from '@/lib/logger';

/**
 * Turn a receipt reading into a quick-add phrase ("Truffles 777 15/11"), so it goes through the same parser and
 * preview as typed text and the user checks it before saving.
 */
export function receiptPhrase(lines: readonly string[]): { phrase: string; foundAmount: boolean } {
  const r = readReceipt(lines);
  const parts = [r.merchant ?? 'Receipt', r.amountPaise !== null ? paiseToDecimal(r.amountPaise).replace(/\.00$/, '') : '', r.occurredAt ? format(r.occurredAt, 'dd/MM') : ''];
  return { phrase: parts.filter(Boolean).join(' '), foundAmount: r.amountPaise !== null };
}

/** Photo of a bill → text, all on the phone (ML Kit via Google Play services). The photo isn't kept. */
export async function scanReceipt(from: 'camera' | 'gallery'): Promise<{ phrase: string; foundAmount: boolean } | null> {
  if (!ocrSupported) throw new Error('Reading receipts isn’t supported on this phone.');
  const permission = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
  if (!permission.granted) throw new Error('Allow camera access to scan a receipt.');
  expectExternalTrip();
  let result: ImagePicker.ImagePickerResult;
  try {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
    result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } catch (e) {
    cancelExternalTrip();
    throw e;
  }
  if (result.canceled || !result.assets[0]) return null;
  let lines: string[];
  try {
    lines = await extractTextFromImage(result.assets[0].uri);
  } catch {
    // The usual cause is Google Play services still downloading the text model on this phone; its error says only
    // "err". It's fetched in the background, so a retry a little later works.
    throw new Error('Receipt reading is still getting ready on this phone. Try again in a minute, or type it in.');
  }
  return receiptPhrase(lines);
}

/**
 * Dictation with Android's speech recogniser. Prefers on-device recognition where the phone supports it, so speech
 * doesn't leave the phone; otherwise Android's own service handles it.
 */
/** Set once on-device recognition has failed for the language, so later taps don't wait for it to fail again. */
let onDeviceUnavailable = false;

export function useVoiceCapture(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDevice = useRef(false);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (e) => {
    const transcript = e.results[0]?.transcript;
    if (transcript) onText(transcript);
  });
  useSpeechRecognitionEvent('error', (e) => {
    // Phones that support on-device recognition may still lack the offline language pack; use the phone's
    // regular recogniser instead of failing.
    if (onDevice.current && e.error !== 'no-speech' && e.error !== 'not-allowed' && e.error !== 'aborted') {
      onDevice.current = false;
      onDeviceUnavailable = true;
      log.warn('On-device speech failed, retrying with the regular recogniser', e.error);
      ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, continuous: false });
      return;
    }
    setListening(false);
    log.warn('Speech recognition failed', `${e.error}: ${e.message}`);
    setError(
      e.error === 'no-speech'
        ? 'Didn’t catch that. Try again.'
        : e.error === 'not-allowed'
          ? 'Allow the microphone to use voice.'
          : `Voice input isn’t available right now (${e.error}).`,
    );
  });

  const start = useCallback(async () => {
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError('Allow the microphone to use voice.');
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError('This phone has no speech recogniser.');
      return;
    }
    onDevice.current = !onDeviceUnavailable && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    ExpoSpeechRecognitionModule.start({
      lang: 'en-IN',
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: onDevice.current,
    });
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  return { listening, error, start, stop };
}

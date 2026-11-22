// Receipt reading uses ML Kit's text model from Google Play services, downloaded on demand. This manifest entry asks
// the Play Store to download it when the app is installed, so the first scan doesn't fail while it's still missing.
// expo-dev-launcher declares the same key for barcode scanning, so ours lists both and replaces the library value.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const KEY = 'com.google.mlkit.vision.DEPENDENCIES';

module.exports = function withMlkitOcrModel(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, KEY, 'barcode_ui,ocr');
    const item = app['meta-data'].find((m) => m.$['android:name'] === KEY);
    item.$['tools:replace'] = 'android:value';
    return c;
  });
};

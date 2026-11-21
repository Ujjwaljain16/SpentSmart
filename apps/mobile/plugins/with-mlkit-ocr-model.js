// Receipt reading uses ML Kit's text model from Google Play services, downloaded on demand. This manifest entry asks
// the Play Store to download it when the app is installed, so the first scan doesn't fail while it's still missing.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withMlkitOcrModel(config) {
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    return c;
  });
};

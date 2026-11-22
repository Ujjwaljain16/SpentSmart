const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Registers a FileProvider that exposes exactly one directory — cache/qr_share/ — which the native module
 * fills with short-lived QR images. Nothing else in the app's storage is reachable through it.
 */
const withUpiIntent = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const { manifest } = mod.modResults;
    if (!manifest.application) manifest.application = [{}];
    const application = manifest.application[0];
    if (!application.provider) application.provider = [];

    const packageName = mod.android?.package || config.android?.package;
    if (!packageName) throw new Error('upi-intent: android.package must be set in app.json');
    const authority = `${packageName}.fileprovider`;

    const exists = application.provider.some((p) => p.$['android:authorities'] === authority);
    if (!exists) {
      application.provider.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': authority,
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.support.FILE_PROVIDER_PATHS',
              'android:resource': '@xml/spentsmart_file_provider_paths',
            },
          },
        ],
      });
    }
    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const xmlDir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'spentsmart_file_provider_paths.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="qr_share" path="qr_share/" />
</paths>
`,
        'utf8',
      );
      return mod;
    },
  ]);

  // Bank SMS capture straight from incoming SMS. Off by default: RECEIVE_SMS is one of the permissions Play Protect
  // blocks for apps installed from a download in some regions, so only builds made with SPENTSMART_SMS_CAPTURE=1 get it.
  if (process.env.SPENTSMART_SMS_CAPTURE === '1') {
    config = withAndroidManifest(config, (mod) => {
      const { manifest } = mod.modResults;
      manifest['uses-permission'] = manifest['uses-permission'] ?? [];
      if (!manifest['uses-permission'].some((p) => p.$['android:name'] === 'android.permission.RECEIVE_SMS')) {
        manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.RECEIVE_SMS' } });
      }
      const application = manifest.application[0];
      application.receiver = application.receiver ?? [];
      application.receiver.push({
        $: {
          'android:name': 'expo.modules.upiintent.SmsCaptureReceiver',
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }] }],
      });
      return mod;
    });
  }

  return config;
};

module.exports = withUpiIntent;

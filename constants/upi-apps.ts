export interface KnownUpiApp {
  id: string;
  name: string;
  packageName: string;
  /** Custom scheme, used only as a detection/launch fallback when the native module is unavailable. */
  scheme: string;
}

export const GPAY_PACKAGE = 'com.google.android.apps.nbu.paisa.user';
export const PHONEPE_PACKAGE = 'com.phonepe.app';

export const KNOWN_UPI_APPS: readonly KnownUpiApp[] = [
  { id: 'phonepe', name: 'PhonePe', packageName: PHONEPE_PACKAGE, scheme: 'phonepe://' },
  { id: 'gpay', name: 'Google Pay', packageName: GPAY_PACKAGE, scheme: 'tez://upi/pay' },
  { id: 'paytm', name: 'Paytm', packageName: 'net.one97.paytm', scheme: 'paytmmp://' },
  { id: 'navi', name: 'Navi', packageName: 'com.naviapp', scheme: 'navi://' },
  { id: 'cred', name: 'CRED', packageName: 'com.dreamplug.androidapp', scheme: 'credpay://' },
  { id: 'slice', name: 'Slice', packageName: 'indwin.c3.shareapp', scheme: 'slice://' },
  { id: 'jupiter', name: 'Jupiter', packageName: 'money.jupiter', scheme: 'jupiter://' },
  { id: 'bhim', name: 'BHIM', packageName: 'in.org.npci.upiapp', scheme: 'bhim://pay' },
  { id: 'icici', name: 'iMobile (ICICI)', packageName: 'com.csam.icici.bank.imobile', scheme: 'imobile://' },
  { id: 'hdfc', name: 'HDFC Bank', packageName: 'com.snapwork.hdfc', scheme: 'hdfcbank://' },
  { id: 'axis', name: 'Axis Pay', packageName: 'com.upi.axispay', scheme: 'axispay://' },
  { id: 'sbi', name: 'SBI UPI', packageName: 'com.sbi.upi', scheme: 'sbiupi://' },
  { id: 'kotak', name: 'Kotak Bank', packageName: 'com.olive.kotak.upi', scheme: 'kotakpay://' },
  { id: 'amazon', name: 'Amazon Pay', packageName: 'in.amazon.mShop.android.shopping', scheme: 'amazonpay://' },
];

export function knownAppByPackage(packageName: string): KnownUpiApp | undefined {
  return KNOWN_UPI_APPS.find((a) => a.packageName === packageName);
}

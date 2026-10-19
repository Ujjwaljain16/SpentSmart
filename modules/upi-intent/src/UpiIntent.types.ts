export interface InstalledUpiApp {
  packageName: string;
  name: string;
}

export interface PayWithUpiResult {
  /** Android Activity result code: -1 = RESULT_OK, 0 = RESULT_CANCELED. */
  resultCode: number;
  /** `txnId=..&responseCode=..&Status=..&txnRef=..` as returned by the UPI app, or null when it returned nothing. */
  response: string | null;
}

export interface UpiIntentNativeModule {
  /** Apps able to handle `upi://pay`, excluding this app. */
  getUpiApps(): Promise<InstalledUpiApp[]>;
  /**
   * Launch a payment with startActivityForResult. Pass `null` as packageName to show the system chooser.
   * Rejects with ERR_NO_UPI_APP, ERR_NO_ACTIVITY, ERR_INVALID_URI, ERR_BUSY or ERR_LAUNCH_DENIED.
   */
  payWithUpi(uri: string, packageName: string | null): Promise<PayWithUpiResult>;
  /** Open an app's launcher screen. Returns false if it is not installed. */
  launchApp(packageName: string): Promise<boolean>;
  /** Share a PNG (base64, optionally a data URL) to one specific app. Returns false on failure. */
  shareImage(packageName: string, base64Data: string): Promise<boolean>;
}

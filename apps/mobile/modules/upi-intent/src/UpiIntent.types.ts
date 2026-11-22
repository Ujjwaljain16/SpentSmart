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
  /** Draw the QR for a `upi://pay` URI ahead of time; a later shareQr/qrPng with the same URI reuses it. */
  prepareQr(upiUri: string): Promise<boolean>;
  /** Draw (or reuse) the QR natively and share it to one app. Returns false on failure. */
  shareQr(packageName: string, upiUri: string): Promise<boolean>;
  /** The QR as base64 PNG (no data-URL prefix), or null if it could not be drawn. */
  qrPng(upiUri: string): Promise<string | null>;
  /** The subset of these packages that accept a shared image. */
  qrShareTargets(packageNames: string[]): Promise<string[]>;

  /** Payment capture: our own switch, and whether Android has granted notification access. */
  captureStatus(): Promise<{ enabled: boolean; accessGranted: boolean }>;
  /** Turning capture off also discards anything captured but not yet read. */
  setCaptureEnabled(enabled: boolean): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
  /** Payment notifications captured since the last call; the queue is emptied. */
  drainCaptured(): Promise<CapturedNotification[]>;

  /** Whether SpentSmart is offered as a UPI app, to log payments other apps start. */
  proxyEnabled(): Promise<boolean>;
  /** `targetPackage` is the UPI app requests are passed to; null shows a chooser. */
  setProxy(enabled: boolean, targetPackage: string | null): Promise<boolean>;
  /** Payments passed through since the last call; the queue is emptied. */
  drainProxied(): Promise<ProxiedPayment[]>;
}

export interface CapturedNotification {
  app: string;
  text: string;
  at: number;
  key?: string;
}

export interface ProxiedPayment {
  uri: string | null;
  resultCode: number;
  response: string | null;
  caller: string | null;
  at: number;
}

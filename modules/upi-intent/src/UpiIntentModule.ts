import { NativeModule, requireNativeModule } from 'expo';

import { UpiIntentModuleEvents } from './UpiIntent.types';

declare class UpiIntentModule extends NativeModule<UpiIntentModuleEvents> {
  launchAppByPackage(packageName: string): Promise<boolean>;
  launchUPI(upiUrl: string): Promise<boolean>;
  getUPIApps(): Promise<Array<{ packageName: string, name: string }>>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<UpiIntentModule>('UpiIntent');

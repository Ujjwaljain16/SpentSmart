import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './UpiIntent.types';

type UpiIntentModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class UpiIntentModule extends NativeModule<UpiIntentModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world!';
  }
};

export default registerWebModule(UpiIntentModule, 'UpiIntentModule');

import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './ExpoFaceMatcher.types';

type ExpoFaceMatcherModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class ExpoFaceMatcherModule extends NativeModule<ExpoFaceMatcherModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(ExpoFaceMatcherModule, 'ExpoFaceMatcherModule');

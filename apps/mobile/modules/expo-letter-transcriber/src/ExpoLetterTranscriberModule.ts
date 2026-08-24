import { NativeModule, requireNativeModule } from 'expo';

type ExpoLetterTranscriberEvents = Record<string, never>;

declare class ExpoLetterTranscriberModule extends NativeModule<ExpoLetterTranscriberEvents> {
  transcribe(localUri: string): Promise<string>;
}

export default requireNativeModule<ExpoLetterTranscriberModule>('ExpoLetterTranscriber');

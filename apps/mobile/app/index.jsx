import { AppGate } from '../src/navigation/RouteGuards';
import RealAutoSaveWriteSmokeScreen from '../src/RealAutoSaveWriteSmokeScreen';

const HOSTED_QA_AUTORUN = process.env.EXPO_PUBLIC_OLW_QA_AUTORUN_REAL_WRITE === '1';

export default function IndexRoute() {
  if (__DEV__ && HOSTED_QA_AUTORUN) return <RealAutoSaveWriteSmokeScreen />;
  return <AppGate />;
}

import PurchaseScreen from '../src/PurchaseScreen';
import { ProtectedRoute } from '../src/navigation/RouteGuards';

export default function PurchaseRoute() {
  return (
    <ProtectedRoute allowMissingSubscription>
      <PurchaseScreen />
    </ProtectedRoute>
  );
}

import { spacing } from './theme';

/**
 * Scroll / form content padding that adds safe-area insets to layout gutters,
 * so you do not stack “full safe-area padding” on top of design spacing (a
 * common issue in landscape and on devices with asymmetric horizontal insets).
 *
 * @param {import('react-native-safe-area-context').EdgeInsets} insets
 * @param {{ top?: number; bottom?: number; horizontal?: number }} [opts]
 */
export function scrollContentInsets(insets, opts = {}) {
  const {
    top = spacing.lg,
    bottom = spacing.xxl,
    horizontal = spacing.lg,
  } = opts;
  return {
    paddingTop: insets.top + top,
    paddingBottom: insets.bottom + bottom,
    paddingLeft: insets.left + horizontal,
    paddingRight: insets.right + horizontal,
  };
}

/**
 * Horizontal `FlatList` / `ScrollView`: keep the scroll view full width
 * (content can move under the horizontal safe areas), while the first and
 * last items still clear cutouts via `contentContainerStyle` padding.
 *
 * @param {import('react-native-safe-area-context').EdgeInsets} insets
 * @param {number} [gutter] layout gutter inside the safe inset (default spacing.md)
 */
export function horizontalScrollContentPadding(insets, gutter = spacing.md) {
  return {
    paddingLeft: insets.left + gutter,
    paddingRight: insets.right + gutter,
  };
}

/**
 * Negative horizontal margins so a scroll view’s viewport is truly edge-to-edge;
 * pair with `horizontalScrollContentPadding` (or equivalent) on `contentContainerStyle`.
 */
export function horizontalScrollViewportBleed(insets) {
  return {
    marginLeft: -insets.left,
    marginRight: -insets.right,
  };
}

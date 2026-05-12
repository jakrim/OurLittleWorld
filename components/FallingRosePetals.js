import React, { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const PETAL_CHARS = ['🌹', '🥀', '🌸'];

function Petal({ screenW, screenH, dense, index }) {
  const left = useMemo(
    () => Math.random() * Math.max(8, screenW - 24) + 8,
    [screenW]
  );
  const size = useMemo(() => 15 + Math.random() * (dense ? 14 : 9), [dense]);
  const duration = useMemo(
    () => 5500 + Math.random() * 6500 - (dense ? 1000 : 0),
    [dense]
  );
  const drift = useMemo(() => (Math.random() - 0.5) * 36, []);
  const rotateSpan = useMemo(
    () => (Math.random() > 0.5 ? 1 : -1) * (140 + Math.random() * 120),
    []
  );
  const char = useMemo(() => PETAL_CHARS[index % PETAL_CHARS.length], [index]);
  const opacity = useMemo(() => 0.5 + Math.random() * 0.45, []);
  const startDelay = useMemo(() => Math.random() * (dense ? 1600 : 4000), [dense]);

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      startDelay,
      withRepeat(
        withTiming(1, { duration, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, [duration, progress, startDelay]);

  const style = useAnimatedStyle(() => {
    const travel = screenH + 140;
    const y = -70 + progress.value * travel;
    const wobble = Math.sin(progress.value * Math.PI * 5) * drift;
    const rot = progress.value * rotateSpan;
    return {
      transform: [
        { translateY: y },
        { translateX: wobble },
        { rotate: `${rot}deg` },
      ],
      opacity,
    };
  });

  return (
    <Animated.Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none"
      style={[
        styles.petal,
        style,
        {
          left,
          fontSize: size,
        },
      ]}
    >
      {char}
    </Animated.Text>
  );
}

/**
 * Full-screen falling rose/floral layer. `introDense` bumps the petal count
 * for the first moments after the home surface mounts.
 * @param {{ introDense?: boolean, quietCount?: number }} props
 */
export default function FallingRosePetals({ introDense = true, quietCount = 14 }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [burst, setBurst] = React.useState(introDense);

  useEffect(() => {
    if (!introDense) return undefined;
    const t = setTimeout(() => setBurst(false), 3200);
    return () => clearTimeout(t);
  }, [introDense]);

  const count = burst ? 26 : quietCount;

  const petals = useMemo(
    () => Array.from({ length: count }, (_, i) => i),
    [count]
  );

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.container]}
    >
      {petals.map((i) => (
        <Petal
          key={`${burst}-${i}`}
          dense={burst}
          index={i}
          screenH={screenH}
          screenW={screenW}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 1,
    overflow: 'hidden',
  },
  petal: {
    position: 'absolute',
    top: 0,
  },
});

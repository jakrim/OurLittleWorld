import React from 'react';
import { View } from 'react-native';

import { glass, space as s } from './theme';

/**
 * Tiny layout primitives so screens read top-to-bottom without inline
 * spacing math. Inspired by Tamagui / Radix Stack.
 *
 *   <V gap="lg"> ... </V>     vertical stack with gap
 *   <H gap="md" align="center"> ... </H>   horizontal stack
 *   <Spacer h={24} />         vertical spacer
 *   <Spacer w={24} />         horizontal spacer
 */
export function V({ gap = 'md', align = 'stretch', justify = 'flex-start', children, style, ...rest }) {
  const g = typeof gap === 'string' ? s[gap] ?? s.md : gap;
  return (
    <View
      style={[{ flexDirection: 'column', alignItems: align, justifyContent: justify, rowGap: g }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function H({ gap = 'md', align = 'center', justify = 'flex-start', wrap = false, children, style, ...rest }) {
  const g = typeof gap === 'string' ? s[gap] ?? s.md : gap;
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, columnGap: g, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function Spacer({ h, w }) {
  return <View style={{ height: h, width: w }} />;
}

export function Divider({ style, color }) {
  return (
    <View
      style={[
        { height: 1, backgroundColor: color || glass.inkDivider, alignSelf: 'stretch' },
        style,
      ]}
    />
  );
}

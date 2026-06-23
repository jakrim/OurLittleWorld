import React from 'react';
import { View } from 'react-native';

import { Caption, Field, SegmentedControl, Spacer, space } from './ui';
import { RELATIONSHIP_PRESETS } from './families';

export default function RelationshipRolePicker({
  preset,
  onChangePreset,
  customValue,
  onChangeCustomValue,
  label = 'Your role in the relationship',
  caption,
  columns = 3,
  customPlaceholder = 'What should your partner see?',
  customFieldSize = 'md',
  customFieldProps,
}) {
  return (
    <View>
      {label ? <Caption>{label}</Caption> : null}
      {caption ? (
        <>
          {label ? <Spacer h={space.xs} /> : null}
          <Caption>{caption}</Caption>
        </>
      ) : null}
      {(label || caption) ? <Spacer h={space.sm} /> : null}
      <SegmentedControl
        value={preset}
        onChange={onChangePreset}
        options={RELATIONSHIP_PRESETS}
        columns={columns}
      />
      {preset === 'custom' ? (
        <>
          <Spacer h={space.md} />
          <Field
            value={customValue}
            onChangeText={onChangeCustomValue}
            placeholder={customPlaceholder}
            autoCapitalize="words"
            returnKeyType="done"
            size={customFieldSize}
            {...customFieldProps}
          />
        </>
      ) : null}
    </View>
  );
}

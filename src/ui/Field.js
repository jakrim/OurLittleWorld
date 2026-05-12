import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Text, Pressable } from 'react-native';

import { colors, semantic, space, radius, type as t } from './theme';

/**
 * Text input with floating label, optional caption + error.
 *
 *   <Field label="Email" value={email} onChangeText={setEmail} />
 *   <Field label="Code" align="center" letterSpacing={8} mono />
 *
 * `as="textarea"` makes it multi-line. `rightAdornment` is a slot to the
 * right of the value (e.g. clear button, send icon).
 */
export default function Field({
  label,
  value,
  onChangeText,
  placeholder,
  caption,
  error,
  as = 'input',
  align,
  letterSpacing,
  mono,
  size = 'md',
  rightAdornment,
  inputProps,
  containerStyle,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const filled = (value && value.length > 0) || focused;

  const baseInputStyle = [
    styles.input,
    size === 'lg' ? styles.inputLg : null,
    as === 'textarea' ? styles.textarea : null,
    align === 'center' ? { textAlign: 'center' } : null,
    letterSpacing != null ? { letterSpacing } : null,
    mono ? { fontVariant: ['tabular-nums'] } : null,
  ];

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text style={[styles.label, focused && styles.labelFocused, error && styles.labelError]}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputBox,
          focused && styles.inputBoxFocused,
          error && styles.inputBoxError,
          as === 'textarea' && styles.inputBoxTextarea,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={semantic.textWhisper}
          multiline={as === 'textarea'}
          textAlignVertical={as === 'textarea' ? 'top' : 'center'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={baseInputStyle}
          {...inputProps}
          {...rest}
        />
        {rightAdornment ? <View style={styles.adornment}>{rightAdornment}</View> : null}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : caption ? (
        <Text style={styles.caption}>{caption}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  label: {
    ...t.micro,
    color: semantic.textMuted,
    marginBottom: space.sm,
  },
  labelFocused: {
    color: semantic.primary,
  },
  labelError: {
    color: colors.danger,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: semantic.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    paddingHorizontal: space.lg,
  },
  inputBoxFocused: {
    borderColor: semantic.primary,
    backgroundColor: '#FFFDFB',
  },
  inputBoxError: {
    borderColor: colors.danger,
  },
  inputBoxTextarea: {
    paddingVertical: space.md,
  },
  input: {
    flex: 1,
    paddingVertical: space.lg,
    fontSize: 17,
    color: semantic.text,
  },
  inputLg: {
    fontSize: 22,
    paddingVertical: space.xl,
  },
  textarea: {
    minHeight: 110,
    paddingVertical: space.sm,
    lineHeight: 22,
  },
  adornment: {
    marginLeft: space.sm,
  },
  caption: {
    ...t.caption,
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },
  error: {
    ...t.caption,
    color: colors.danger,
    fontWeight: '600',
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },
});

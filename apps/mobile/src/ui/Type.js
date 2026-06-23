import React from 'react';
import { Text } from 'react-native';

import { useTheme } from './theme';

/**
 * Typography primitives. Use these instead of raw <Text> in OLW screens
 * so we can re-tone the system from one place.
 *
 *   <Display>One sentence that lands.</Display>
 *   <Hero>A timeline of your little one</Hero>
 *   <Title>Section heading</Title>
 *   <Subtitle>Heavier body for emphasis</Subtitle>
 *   <Body>Regular paragraph copy.</Body>
 *   <Caption>Small print under inputs.</Caption>
 *   <Eyebrow>SECTION</Eyebrow>
 *   <Brand>our little world</Brand>
 *
 * Every component accepts `color`, `align`, and standard <Text> props.
 */
export function Display(props)  { return <Base token="display"  {...props} />; }
export function Hero(props)     { return <Base token="hero"     {...props} />; }
export function Title(props)    { return <Base token="title"    {...props} />; }
export function Subtitle(props) { return <Base token="subtitle" {...props} />; }
export function Body(props)     { return <Base token="body"     {...props} />; }
export function BodyTight(props){ return <Base token="bodyTight" {...props} />; }
export function Caption(props)  { return <Base token="caption"  {...props} />; }
export function Eyebrow(props)  { return <Base token="micro"    {...props} />; }
export function Brand(props)    { return <Base token="brand"    {...props} />; }

function Base({ children, token, style, color, align, italic, weight, ...rest }) {
  const theme = useTheme();
  const baseStyle = theme.type[token] || theme.type.body;
  const overrides = {};
  if (color)  overrides.color = color === 'inherit' ? undefined : color;
  if (align)  overrides.textAlign = align;
  if (italic) {
    overrides.fontStyle = 'italic';
    if (token === 'display' || token === 'hero' || token === 'title') {
      overrides.fontFamily = theme.fonts.displayItalic;
    }
  }
  if (weight) {
    overrides.fontWeight = weight;
    if (baseStyle.fontFamily?.startsWith('Manrope')) {
      if (weight === '400') overrides.fontFamily = theme.fonts.bodyRegular;
      if (weight === '500') overrides.fontFamily = theme.fonts.bodyMedium;
      if (weight === '600') overrides.fontFamily = theme.fonts.bodySemi;
      if (weight === '700') overrides.fontFamily = theme.fonts.bodyBold;
    }
  }
  return (
    <Text style={[baseStyle, overrides, style]} {...rest}>
      {children}
    </Text>
  );
}

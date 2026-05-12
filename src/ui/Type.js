import React from 'react';
import { Text } from 'react-native';

import { type as t, semantic } from './theme';

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
export function Display(props)  { return <Base style={t.display}  {...props} />; }
export function Hero(props)     { return <Base style={t.hero}     {...props} />; }
export function Title(props)    { return <Base style={t.title}    {...props} />; }
export function Subtitle(props) { return <Base style={t.subtitle} {...props} />; }
export function Body(props)     { return <Base style={t.body}     {...props} />; }
export function BodyTight(props){ return <Base style={t.bodyTight} {...props} />; }
export function Caption(props)  { return <Base style={t.caption}  {...props} />; }
export function Eyebrow(props)  { return <Base style={t.micro}    {...props} />; }
export function Brand(props)    { return <Base style={t.brand}    {...props} />; }

function Base({ children, style, color, align, italic, weight, ...rest }) {
  const overrides = {};
  if (color)  overrides.color = color === 'inherit' ? undefined : color;
  if (align)  overrides.textAlign = align;
  if (italic) overrides.fontStyle = 'italic';
  if (weight) overrides.fontWeight = weight;
  return (
    <Text style={[style, overrides, style?.fontFamily ? null : { color: semantic.text }, style]} {...rest}>
      {children}
    </Text>
  );
}

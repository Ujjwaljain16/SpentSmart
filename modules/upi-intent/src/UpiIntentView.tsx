import { requireNativeView } from 'expo';
import * as React from 'react';

import { UpiIntentViewProps } from './UpiIntent.types';

const NativeView: React.ComponentType<UpiIntentViewProps> =
  requireNativeView('UpiIntent');

export default function UpiIntentView(props: UpiIntentViewProps) {
  return <NativeView {...props} />;
}

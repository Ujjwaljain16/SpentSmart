import * as React from 'react';

import { UpiIntentViewProps } from './UpiIntent.types';

export default function UpiIntentView(props: UpiIntentViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}

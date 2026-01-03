import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

// Simple purple circle with white "P" for PhonePe
export const PhonePeIcon = ({ size = 24 }: { size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 32 32">
        <Circle cx="16" cy="16" r="16" fill="#5f259f" />
        <Path
            d="M13 10h4c2.2 0 4 1.8 4 4s-1.8 4-4 4h-2v4h-2V10zm2 6h2c1.1 0 2-0.9 2-2s-0.9-2-2-2h-2v4z"
            fill="#fff"
        />
    </Svg>
);

export const GPayIcon = ({ size = 24 }: { size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 32 32">
        <Circle cx="16" cy="16" r="16" fill="#fff" />
        <Path
            d="M16.5 16.5V13.5H21.5C21.7 14.2 21.9 15.2 21.9 16.5C21.9 20.2 19.3 22.9 16.5 22.9C12.9 22.9 10 20 10 16.5C10 12.9 12.9 10 16.5 10C18.2 10 19.8 10.6 21 11.8L23.3 9.5C21.5 7.8 19.2 6.8 16.5 6.8C11.1 6.8 6.8 11.1 6.8 16.5C6.8 21.9 11.1 26.2 16.5 26.2C21.9 26.2 25.5 22.4 25.5 16.8C25.5 16.1 25.4 15.6 25.3 15.2L16.5 15.2V16.5Z"
            fill="#4285F4"
        />
        <Path d="M7.1 14.5L10.3 16.9C11.1 14.8 13.1 13.2 15.5 13.2V10C11.8 10 8.5 12 7.1 14.5Z" fill="#EA4335" />
        <Path d="M15.5 22.8V19.6C13.1 19.6 11.1 18.1 10.3 15.9L7.1 18.4C8.5 21 11.8 23 15.5 23C15.5 22.9 15.5 22.8 15.5 22.8Z" fill="#34A853" />
        <Path d="M24.5 15.2H23.5V16.5H15.5V13.2H20.7C20.3 11.4 19.1 9.9 17.6 9L20 7.1C22.6 9.3 24.5 12.9 24.5 15.2Z" fill="#FBBC04" />
    </Svg>
);

// QR code icon with better visibility
export const QRIcon = ({ size = 24, color = '#14B8A6' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Top-left square */}
        <Rect x="3" y="3" width="7" height="7" stroke={color} strokeWidth="2" fill="none" />
        <Rect x="5" y="5" width="3" height="3" fill={color} />

        {/* Top-right square */}
        <Rect x="14" y="3" width="7" height="7" stroke={color} strokeWidth="2" fill="none" />
        <Rect x="16" y="5" width="3" height="3" fill={color} />

        {/* Bottom-left square */}
        <Rect x="3" y="14" width="7" height="7" stroke={color} strokeWidth="2" fill="none" />
        <Rect x="5" y="16" width="3" height="3" fill={color} />

        {/* Bottom-right pattern (pixelated) */}
        <Rect x="14" y="14" width="2" height="2" fill={color} />
        <Rect x="17" y="14" width="2" height="2" fill={color} />
        <Rect x="20" y="14" width="1" height="2" fill={color} />
        <Rect x="14" y="17" width="2" height="2" fill={color} />
        <Rect x="17" y="17" width="2" height="2" fill={color} />
        <Rect x="20" y="17" width="1" height="4" fill={color} />
        <Rect x="14" y="20" width="5" height="1" fill={color} />
    </Svg>
);

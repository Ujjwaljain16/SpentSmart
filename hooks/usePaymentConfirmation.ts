import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface PaymentConfirmationState {
    showConfirmation: boolean;
    timeSpentInUPIApp: number;
    suggestedConfidence: 'high' | 'medium' | 'low';
    confidenceScore: number; // 0-100%
}

/**
 * Hook to track when user returns from UPI app and show smart confirmation
 */
export function usePaymentConfirmation() {
    const [state, setState] = useState<PaymentConfirmationState>({
        showConfirmation: false,
        timeSpentInUPIApp: 0,
        suggestedConfidence: 'low',
        confidenceScore: 0
    });

    const appOpenTimeRef = useRef<number | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            // App went to background (user opened UPI app)
            if (
                appStateRef.current.match(/active/) &&
                nextAppState.match(/inactive|background/)
            ) {
                appOpenTimeRef.current = Date.now();
                console.log('📱 User left app (likely opened UPI app)');
            }

            // App came back to foreground (user returned from UPI app)
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                if (appOpenTimeRef.current) {
                    const timeSpent = Date.now() - appOpenTimeRef.current;
                    const timeSpentSeconds = Math.floor(timeSpent / 1000);

                    console.log(`📱 User returned after ${timeSpentSeconds}s`);

                    // Determine confidence based on time spent
                    let confidence: 'high' | 'medium' | 'low' = 'low';
                    let score = 0;
                    let shouldShow = false;

                    // Gen Z Algorithm: Time-based heuristics
                    if (timeSpentSeconds >= 25) {
                        // 25s+ -> Very high (entering PIN, waiting for success)
                        confidence = 'high';
                        score = 95;
                        shouldShow = true;
                    } else if (timeSpentSeconds >= 15) {
                        // 15-25s -> High (standard successful flow)
                        confidence = 'high';
                        score = 85;
                        shouldShow = true;
                    } else if (timeSpentSeconds >= 10) {
                        // 10-15s -> Medium (fast payer)
                        confidence = 'medium';
                        score = 60;
                        shouldShow = true;
                    } else if (timeSpentSeconds >= 5) {
                        // 5-10s -> Low (maybe cancelled or super fast)
                        confidence = 'low';
                        score = 30;
                        shouldShow = true;
                    } else {
                        // <5s -> Likely accidental switch or immediate back
                        confidence = 'low';
                        score = 10;
                        shouldShow = false; // Don't annoy for quick toggles
                    }

                    setState({
                        showConfirmation: shouldShow,
                        timeSpentInUPIApp: timeSpentSeconds,
                        suggestedConfidence: confidence,
                        confidenceScore: score
                    });

                    appOpenTimeRef.current = null;
                }
            }

            appStateRef.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, []);

    const hideConfirmation = () => {
        setState(prev => ({ ...prev, showConfirmation: false }));
    };

    const startTracking = () => {
        appOpenTimeRef.current = Date.now();
    };

    return {
        ...state,
        hideConfirmation,
        startTracking,
    };
}

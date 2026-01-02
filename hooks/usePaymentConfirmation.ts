import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface PaymentConfirmationState {
    showConfirmation: boolean;
    timeSpentInUPIApp: number;
    suggestedConfidence: 'high' | 'medium' | 'low';
}

/**
 * Hook to track when user returns from UPI app and show smart confirmation
 */
export function usePaymentConfirmation() {
    const [state, setState] = useState<PaymentConfirmationState>({
        showConfirmation: false,
        timeSpentInUPIApp: 0,
        suggestedConfidence: 'low',
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
                    let shouldShow = false;

                    if (timeSpentSeconds >= 12) {
                        // Spent 12+ seconds - likely completed payment
                        confidence = 'high';
                        shouldShow = true;
                    } else if (timeSpentSeconds >= 5) {
                        // Spent 5-12 seconds - maybe completed payment
                        confidence = 'medium';
                        shouldShow = true;
                    } else if (timeSpentSeconds >= 2) {
                        // Spent 2-5 seconds - Quick return (maybe failed or fast payment)
                        // STILL SHOW MODAL so user can manually confirm
                        confidence = 'low';
                        shouldShow = true;
                    } else {
                        // Spent <2 seconds - likely accidental or system jitter
                        confidence = 'low';
                        shouldShow = false;
                    }

                    setState({
                        showConfirmation: shouldShow,
                        timeSpentInUPIApp: timeSpentSeconds,
                        suggestedConfidence: confidence,
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

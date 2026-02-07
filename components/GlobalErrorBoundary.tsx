import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        // TODO: Log to a service like Sentry here
    }

    handleRestart = async () => {
        try {
            await Updates.reloadAsync();
        } catch (e) {
            // Fallback if not using expo-updates (e.g. dev client)
            console.log('Reload not supported in this environment');
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Ionicons name="alert-circle" size={64} color="#EF4444" />
                    <Text style={styles.title}>Oops! Something went wrong.</Text>
                    <Text style={styles.subtitle}>
                        We're sorry, but an unexpected error occurred.
                    </Text>
                    <Text style={styles.errorText}>
                        {this.state.error?.toString()}
                    </Text>
                    <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
                        <Text style={styles.buttonText}>Restart App</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F0F',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    title: {
        color: '#FFF',
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    subtitle: {
        color: '#A1A1AA',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 12,
        marginBottom: 32,
        textAlign: 'center',
        fontFamily: 'monospace',
    },
    button: {
        backgroundColor: '#229799',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    buttonText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 16,
    },
});

import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { log } from '@/lib/logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

declare const __DEV__: boolean;

/**
 * Last line of defence for render errors. Details are kept in the local, redacted log (Settings →
 * Diagnostics) and only shown on screen in development builds. Nothing is ever sent off the device.
 */
export class GlobalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('Uncaught render error', `${error.name}: ${error.message}\n${info.componentStack ?? ''}`);
  }

  private restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      this.setState({ hasError: false, message: null });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Ionicons name="alert-circle" size={64} color="#F87171" />
        <Text style={styles.title} accessibilityRole="header">
          Something went wrong
        </Text>
        <Text style={styles.subtitle}>Your data is safe on this device. Restart the app to continue.</Text>
        {__DEV__ && this.state.message ? <Text style={styles.detail}>{this.state.message}</Text> : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Restart the app" style={styles.button} onPress={this.restart}>
          <Text style={styles.buttonText}>Restart</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginTop: 8 },
  subtitle: { color: '#A1A1AA', fontSize: 16, textAlign: 'center' },
  detail: { color: '#F87171', fontSize: 12, textAlign: 'center', fontFamily: 'monospace' },
  button: { backgroundColor: '#14B8A6', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10, marginTop: 12, minHeight: 48 },
  buttonText: { color: '#0F0F0F', fontWeight: '700', fontSize: 16 },
});

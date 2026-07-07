/**
 * Error boundary around the React UI layer. The Skia canvas + engine live
 * outside it by design: if an overlay throws, the world keeps rendering and
 * the player gets a minimal recovery card instead of a dead app.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '../config/palette';
import { reportError } from '../observability/errorReporter';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class UiErrorBoundary extends React.Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    reportError(error, { componentStack: info.componentStack?.slice(0, 400) ?? '' });
  }

  private reset = (): void => this.setState({ hasError: false });

  override render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.card} pointerEvents="box-none">
        <View style={styles.inner}>
          <Text style={styles.title}>INTERFACE FAULT</Text>
          <Text style={styles.body}>The HUD hit an error. Your run is unaffected.</Text>
          <Pressable onPress={this.reset} accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>RELOAD INTERFACE</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    backgroundColor: 'rgba(5,6,15,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: 14,
    padding: 26,
    alignItems: 'center',
    gap: 10,
    maxWidth: 300,
  },
  title: { color: palette.danger, fontSize: 14, letterSpacing: 4 },
  body: { color: palette.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  button: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.accent,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  buttonText: { color: palette.accent, fontSize: 12, letterSpacing: 3 },
});

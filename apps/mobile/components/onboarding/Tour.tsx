import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface Slide {
  key: string;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  points?: string[];
}

export const TOUR_SLIDES: readonly Slide[] = [
  {
    key: 'welcome',
    title: 'Welcome to SpentSmart',
    body: 'Track every rupee you spend, without typing it all in.',
  },
  {
    key: 'pay',
    icon: 'qr-code-outline',
    title: 'Pay and it’s logged',
    body: 'Scan any UPI QR here instead of in your UPI app.',
    points: ['Google Pay or your UPI app opens with the payee and amount filled in', 'Come back after paying and it’s recorded once, already categorised'],
  },
  {
    key: 'log',
    icon: 'flash-outline',
    title: 'Log in two seconds',
    body: 'For cash and everything else:',
    points: ['Type a phrase like “swiggy 340 dinner”', 'Speak it, or snap the receipt', 'Add from the Quick Settings tile or the home-screen widget'],
  },
  {
    key: 'plan',
    icon: 'pie-chart-outline',
    title: 'Know what’s safe to spend',
    body: 'Set your payday and a budget, and Home shows what you can spend each day until payday.',
    points: ['Budgets per category, savings goals, accounts', 'Insights spot subscriptions and unusual spending'],
  },
  {
    key: 'private',
    icon: 'shield-checkmark-outline',
    title: 'Private by design',
    body: 'No account, no ads, no tracking. Your data is encrypted on this phone.',
    points: ['Backup is optional and end-to-end encrypted', 'The assistant is optional and uses your own Gemini key'],
  },
];

/** Swipeable intro to what the app does. Used on first launch and from Settings. */
export function Tour({ doneLabel, onDone }: { doneLabel: string; onDone: () => void }) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const last = index === TOUR_SLIDES.length - 1;

  const go = (i: number) => {
    list.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        {!last ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip the tour" style={styles.skip} onPress={onDone}>
            <Text style={{ color: colors.textSecondary, fontSize: FontSizes.md, fontWeight: '600' }}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        ref={list}
        data={TOUR_SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            {item.icon ? (
              <View style={[styles.iconCircle, { backgroundColor: colors.card }]}>
                <Ionicons name={item.icon} size={56} color={colors.tint} />
              </View>
            ) : (
              <Image source={require('@/assets/images/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
            )}
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {item.title}
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
            {item.points ? (
              <View style={styles.points}>
                {item.points.map((p) => (
                  <View key={p} style={styles.point}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.tint} />
                    <Text style={[styles.pointText, { color: colors.text }]}>{p}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${TOUR_SLIDES.length}`}>
          {TOUR_SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, { backgroundColor: i === index ? colors.tint : colors.border, width: i === index ? 22 : 8 }]} />
          ))}
        </View>
        <Button label={last ? doneLabel : 'Next'} onPress={() => (last ? onDone() : go(index + 1))} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { height: MIN_TOUCH_TARGET, alignItems: 'flex-end', paddingHorizontal: Spacing.md },
  skip: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: 'center', alignItems: 'center' },
  slide: { flex: 1, paddingHorizontal: Spacing.xl, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  logo: { width: 120, height: 120, borderRadius: 28, marginBottom: Spacing.md },
  iconCircle: { width: 112, height: 112, borderRadius: BorderRadius.full, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  title: { fontSize: FontSizes.xxl, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: FontSizes.md, lineHeight: 23, textAlign: 'center' },
  points: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.sm },
  point: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  pointText: { flex: 1, fontSize: FontSizes.md, lineHeight: 22 },
  bottom: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
});

import { useRef } from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { TERMS_INTRO, TERMS_LAST_UPDATED, TERMS_SECTIONS, SUPPORT_EMAIL } from '@finby/shared';
import { isAtBottom } from '../../lib/scroll-end';
import { Button } from '../ui/button';

interface TermsModalProps {
  visible: boolean;
  read: boolean;
  onRead: () => void;
  onClose: () => void;
}

export function TermsModal({ visible, read, onRead, onClose }: TermsModalProps) {
  const layoutHeightRef = useRef<number>(0);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isAtBottom(e.nativeEvent)) {
      onRead();
    }
  }

  function handleLayout(e: LayoutChangeEvent) {
    layoutHeightRef.current = e.nativeEvent.layout.height;
  }

  function handleContentSizeChange(_w: number, h: number) {
    if (layoutHeightRef.current > 0 && h <= layoutHeightRef.current + 8) {
      onRead();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center bg-black/50 px-4">
        <View className="max-h-[85%] rounded-2xl border border-line bg-surface">
          {/* Header */}
          <View className="border-b border-line px-5 py-4">
            <Text className="text-lg font-semibold text-ink">Terms of Service</Text>
            <Text className="mt-0.5 text-xs text-muted">Last updated: {TERMS_LAST_UPDATED}</Text>
          </View>

          {/* Scrollable body */}
          <ScrollView
            testID="terms-scrollview"
            className="flex-1 px-5 py-4"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={handleLayout}
            onContentSizeChange={handleContentSizeChange}
          >
            <Text className="mb-4 text-sm text-ink">{TERMS_INTRO}</Text>

            {TERMS_SECTIONS.map((section) => (
              <View key={section.title} className="mb-4">
                <Text className="mb-1 text-sm font-semibold text-ink">{section.title}</Text>
                {section.paragraphs.map((paragraph, idx) => {
                  const isContact = section.title === '15. Contact';
                  const emailIndex = isContact ? paragraph.indexOf(SUPPORT_EMAIL) : -1;

                  if (isContact && emailIndex !== -1) {
                    const before = paragraph.slice(0, emailIndex);
                    const after = paragraph.slice(emailIndex + SUPPORT_EMAIL.length);
                    return (
                      <Text key={idx} className="mb-1 text-sm text-ink">
                        {before}
                        <Text
                          className="text-accent underline"
                          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
                        >
                          {SUPPORT_EMAIL}
                        </Text>
                        {after}
                      </Text>
                    );
                  }

                  return (
                    <Text key={idx} className="mb-1 text-sm text-ink">
                      {paragraph}
                    </Text>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View className="border-t border-line px-5 py-4">
            <Button onPress={onClose} disabled={!read}>
              {read ? "I've read the Terms" : 'Scroll to the bottom to continue'}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

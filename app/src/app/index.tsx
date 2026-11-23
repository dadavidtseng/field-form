import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '../ui/BigButton';
import { color } from '../ui/theme';

/** Role picker (A8: no auth; the role is chosen at launch). */
export default function RolePicker() {
  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>Field Form</Text>
      <View style={styles.buttons}>
        <BigButton label="Field — lay out a space" onPress={() => router.push('/field')} />
        <BigButton label="Office — review layouts" onPress={() => router.push('/office')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper, padding: 24, justifyContent: 'center' },
  title: { fontSize: 40, fontWeight: '800', color: color.ink, marginBottom: 40 },
  buttons: { gap: 20 },
});

import { Alert, PermissionsAndroid, Platform } from 'react-native';

export type PickedAsset = { uri: string; fileName: string; type: string };

let _lib: any = null;
try {
  _lib = require('react-native-image-picker');
} catch {}

function isLinked(): boolean {
  return _lib != null && typeof _lib.launchImageLibrary === 'function';
}

async function requestAndroidPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  // Android 13+ uses READ_MEDIA_IMAGES; older uses READ_EXTERNAL_STORAGE
  const permission =
    Platform.Version >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  const already = await PermissionsAndroid.check(permission);
  if (already) return true;

  const result = await PermissionsAndroid.request(permission, {
    title: 'Photo access',
    message: 'Allow the app to access your photos.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function pickImage(onSuccess: (asset: PickedAsset) => void): void {
  if (!isLinked()) {
    Alert.alert(
      'Rebuild required',
      'Image picker needs a native rebuild.\n\nRun: npx react-native run-android',
    );
    return;
  }

  requestAndroidPermission()
    .then(granted => {
      if (!granted) {
        Alert.alert('Permission denied', 'Photo access is required to upload images.');
        return;
      }
      return _lib.launchImageLibrary({ mediaType: 'photo', quality: 0.85 });
    })
    .then((result: any) => {
      if (!result || result.didCancel || result.errorCode) return;
      const a = result.assets?.[0];
      if (a?.uri) {
        onSuccess({
          uri: a.uri,
          fileName: a.fileName ?? `photo_${Date.now()}.jpg`,
          type: a.type ?? 'image/jpeg',
        });
      }
    })
    .catch((e: any) => {
      const msg = e?.message ?? String(e);
      Alert.alert('Image picker error', msg || 'Unknown error. Try rebuilding the app.');
    });
}

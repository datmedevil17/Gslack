/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Not using react-navigation, so native screens are not needed.
// Passing false prevents the "native module not linked" console error.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { enableScreens } = require('react-native-screens');
  enableScreens(false);
} catch {}

AppRegistry.registerComponent(appName, () => App);

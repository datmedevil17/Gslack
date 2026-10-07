import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import { LoginScreen }        from './src/screens/LoginScreen';
import { SplashScreen }       from './src/screens/SplashScreen';
import { WorkspaceHubScreen } from './src/screens/WorkspaceHubScreen';
import { WorkspaceScreen }    from './src/screens/WorkspaceScreen';
import { ChatScreen }         from './src/screens/ChatScreen';
import { ThreadScreen }       from './src/screens/ThreadScreen';
import { ChannelSettingsScreen } from './src/screens/ChannelSettingsScreen';
import { DMChatScreen }       from './src/screens/DMChatScreen';
import { ProfileScreen }      from './src/screens/ProfileScreen';
import { MembersScreen }      from './src/screens/MembersScreen';
import { WorkspaceSettingsScreen } from './src/screens/WorkspaceSettingsScreen';
import { WorkspaceFilesScreen }    from './src/screens/WorkspaceFilesScreen';
import { colors } from './src/theme/tokens';
import type { Session } from '@supabase/supabase-js';
import type { Message } from './src/components/MessageBubble';

interface DMConvo {
  id: string;
  is_group: boolean;
  name?: string | null;
  participants?: Array<{
    user_id: string;
    user?: { id: string; username: string; full_name: string };
  }>;
}

type Screen =
  | { name: 'splash' }
  | { name: 'hub' }
  | { name: 'workspace';          id: string; wsName: string; initialTab?: string }
  | { name: 'channel';            id: string; channelName: string; channelDesc?: string | null; workspaceId: string; wsName: string }
  | { name: 'thread';             parent: Message; channelId: string; workspaceId: string; wsName: string }
  | { name: 'channel-settings';   id: string; channelName: string; channelDesc?: string | null; workspaceId: string; wsName: string }
  | { name: 'dm-chat';            convo: DMConvo; workspaceId: string; wsName: string; myUserId: string }
  | { name: 'profile' }
  | { name: 'workspace-settings'; id: string; wsName: string }
  | { name: 'workspace-members';  id: string; wsName: string }
  | { name: 'workspace-files';    id: string; wsName: string };

export default function App() {
  const [session,    setSession]    = React.useState<Session | null>(null);
  const [booting,    setBooting]    = React.useState(true);
  const [splashDone, setSplashDone] = React.useState(false);
  const [screen,     setScreen]     = React.useState<Screen>({ name: 'splash' });

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setBooting(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setScreen({ name: 'hub' });
    });
    return () => subscription.unsubscribe();
  }, []);

  // Advance past splash only when both the animation AND auth are ready
  React.useEffect(() => {
    if (splashDone && !booting) setScreen({ name: 'hub' });
  }, [splashDone, booting]);

  function renderContent() {
    if (screen.name === 'splash') {
      return <SplashScreen onDone={() => setSplashDone(true)} />;
    }
    if (booting) {
      return <View style={styles.splash}><ActivityIndicator color={colors.accent} size="large" /></View>;
    }
    if (!session) return <LoginScreen />;

    switch (screen.name) {
      case 'profile':
        return <ProfileScreen onBack={() => setScreen({ name: 'hub' })} />;

      case 'hub':
        return (
          <WorkspaceHubScreen
            onOpenWorkspace={(id, wsName) => setScreen({ name: 'workspace', id, wsName })}
            onOpenProfile={() => setScreen({ name: 'profile' })}
          />
        );

      case 'workspace':
        return (
          <WorkspaceScreen
            workspaceId={screen.id}
            workspaceName={screen.wsName}
            initialTab={screen.initialTab}
            onBack={() => setScreen({ name: 'hub' })}
            onOpenChannel={(id, channelName, desc) =>
              setScreen({ name: 'channel', id, channelName, channelDesc: desc, workspaceId: screen.id, wsName: screen.wsName })
            }
            onOpenDMChat={(convo, myUserId) =>
              setScreen({ name: 'dm-chat', convo, workspaceId: screen.id, wsName: screen.wsName, myUserId })
            }
            onOpenSettings={() => setScreen({ name: 'workspace-settings', id: screen.id, wsName: screen.wsName })}
            onOpenProfile={() => setScreen({ name: 'profile' })}
            onOpenMembers={() => setScreen({ name: 'workspace-members', id: screen.id, wsName: screen.wsName })}
            onOpenFiles={() => setScreen({ name: 'workspace-files', id: screen.id, wsName: screen.wsName })}
          />
        );

      case 'channel':
        return (
          <ChatScreen
            channelId={screen.id}
            channelName={screen.channelName}
            channelDesc={screen.channelDesc}
            workspaceId={screen.workspaceId}
            onBack={() => setScreen({ name: 'workspace', id: screen.workspaceId, wsName: screen.wsName })}
            onOpenThread={(parent) =>
              setScreen({ name: 'thread', parent, channelId: screen.id, workspaceId: screen.workspaceId, wsName: screen.wsName })
            }
            onOpenSettings={() =>
              setScreen({ name: 'channel-settings', id: screen.id, channelName: screen.channelName, channelDesc: screen.channelDesc, workspaceId: screen.workspaceId, wsName: screen.wsName })
            }
          />
        );

      case 'thread':
        return (
          <ThreadScreen
            parent={screen.parent}
            channelId={screen.channelId}
            workspaceId={screen.workspaceId}
            onClose={() => setScreen({ name: 'channel', id: screen.channelId, channelName: '', workspaceId: screen.workspaceId, wsName: screen.wsName })}
          />
        );

      case 'channel-settings':
        return (
          <ChannelSettingsScreen
            channelId={screen.id}
            channelName={screen.channelName}
            channelDescription={screen.channelDesc}
            workspaceId={screen.workspaceId}
            onBack={() => setScreen({ name: 'channel', id: screen.id, channelName: screen.channelName, channelDesc: screen.channelDesc, workspaceId: screen.workspaceId, wsName: screen.wsName })}
            onDeleted={() => setScreen({ name: 'workspace', id: screen.workspaceId, wsName: screen.wsName })}
          />
        );

      case 'dm-chat':
        return (
          <DMChatScreen
            convo={screen.convo}
            myUserId={screen.myUserId}
            onBack={() => setScreen({ name: 'workspace', id: screen.workspaceId, wsName: screen.wsName, initialTab: 'dms' })}
          />
        );

      case 'workspace-settings':
        return (
          <WorkspaceSettingsScreen
            workspaceId={screen.id}
            workspaceName={screen.wsName}
            onBack={() => setScreen({ name: 'workspace', id: screen.id, wsName: screen.wsName })}
            onDeleted={() => setScreen({ name: 'hub' })}
          />
        );

      case 'workspace-members':
        return (
          <MembersScreen
            workspaceId={screen.id}
            workspaceName={screen.wsName}
            onBack={() => setScreen({ name: 'workspace', id: screen.id, wsName: screen.wsName })}
          />
        );

      case 'workspace-files':
        return (
          <WorkspaceFilesScreen
            workspaceId={screen.id}
            workspaceName={screen.wsName}
            onBack={() => setScreen({ name: 'workspace', id: screen.id, wsName: screen.wsName })}
          />
        );

      default:
        return <View style={styles.splash}><ActivityIndicator color={colors.accent} /></View>;
    }
  }

  return <SafeAreaProvider>{renderContent()}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
});

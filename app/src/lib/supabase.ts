import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cplgpczqbztnivlydbxf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwbGdwY3pxYnp0bml2bHlkYnhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4Mzg1MDIsImV4cCI6MjA5NDQxNDUwMn0.kTvJUEaLpe2RVZzSuH_O3OP1XlxN6cNwRepkcJVXonE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

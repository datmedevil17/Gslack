export const colors = {
  bg:           '#0B0F14',
  surface:      '#121821',
  surfaceHigh:  '#18202B',
  border:       '#1E2A3A',
  borderSubtle: '#162030',

  accent:       '#7C5CFF',
  accentSec:    '#00C2FF',
  accentDim:    'rgba(124, 92, 255, 0.15)',
  accentGlow:   'rgba(124, 92, 255, 0.35)',
  accentSecDim: 'rgba(0, 194, 255, 0.12)',

  success:      '#32D583',
  danger:       '#F04438',
  warning:      '#F79009',
  info:         '#36BFFA',

  textPrimary:   '#E6EDF3',
  textSecondary: '#94A3B8',
  textMuted:     '#4A5568',
  textOnAccent:  '#FFFFFF',

  online:  '#32D583',
  away:    '#F79009',
  dnd:     '#F04438',
  offline: '#4A5568',

  tabBar:  '#0D1219',
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const radius = {
  sm:    6,
  md:    12,
  lg:    16,
  xl:    24,
  xxl:   32,
  card:  24,
  input: 20,
  full:  9999,
};

export const shadows = {
  accent: {
    shadowColor: '#7C5CFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 16,
  },
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
};

export const typography = {
  heading: { fontFamily: 'System', fontWeight: '700' as const },
  body:    { fontFamily: 'System', fontWeight: '400' as const },
  mono:    { fontFamily: 'Courier New', fontWeight: '400' as const },
};

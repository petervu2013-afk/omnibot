import { useWindowDimensions } from 'react-native';
import { TABLET_MIN_WIDTH } from '@/theme';

// Phone vs tablet layout. Tablets (iPad, Android tablets, phones in landscape ≥ 768pt) get a side rail and split views.
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;
  return { width, height, isTablet, columns: width >= 1100 ? 4 : isTablet ? 3 : 2 };
}

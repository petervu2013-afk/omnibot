import { Redirect } from 'expo-router';
import { useApp } from '@/lib/store';

export default function Index() {
  const { user } = useApp();
  return <Redirect href={user ? '/home' : '/login'} />;
}

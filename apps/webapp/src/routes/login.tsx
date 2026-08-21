import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '../components/features/auth/AuthScreen';

export const Route = createFileRoute('/login')({ component: AuthScreen });

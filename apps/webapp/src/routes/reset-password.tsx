import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '../components/features/auth/AuthScreen';

export const Route = createFileRoute('/reset-password')({ component: AuthScreen });

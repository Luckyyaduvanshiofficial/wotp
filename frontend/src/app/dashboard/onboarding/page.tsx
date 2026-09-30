import PageContainer from '@/components/layout/page-container';
import { OnboardingView } from '@/features/onboarding/components/onboarding-view';

export const metadata = { title: 'Setup' };

export default function OnboardingPage() {
  return (
    <PageContainer
      pageTitle='Setup'
      pageDescription='Seven steps from a fresh clone to a delivered OTP'
    >
      <OnboardingView />
    </PageContainer>
  );
}

import type { Metadata } from 'next';
import LegalPage from '../../components/LegalPage';
import { fetchLegalDoc } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'SMS Terms of Service — KIBA',
  description: 'Terms for KIBA’s recurring automated text messages, including how to stop.',
};

// See the note in ../privacy/page.tsx — edits made in the admin panel appear
// within this window, without a redeploy.
export const revalidate = 300;

export default async function SmsTerms() {
  const doc = await fetchLegalDoc('sms-terms');
  return <LegalPage title={doc.title} body={doc.body} />;
}

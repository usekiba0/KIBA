import type { Metadata } from 'next';
import LegalPage from '../../components/LegalPage';
import { fetchLegalDoc } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — KIBA',
  description: 'What KIBA collects, why, who it is shared with, and how to have it deleted.',
};

// Re-fetch periodically so an edit made in the admin panel appears without a
// redeploy, while still serving from cache rather than hitting the API on every
// request. 5 minutes is well inside "I changed it and it's live".
export const revalidate = 300;

export default async function Privacy() {
  const doc = await fetchLegalDoc('privacy');
  return <LegalPage title={doc.title} body={doc.body} />;
}

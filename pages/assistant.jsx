import Head from 'next/head';
import Layout from '../components/Layout';
import AssistantChat from '../components/AssistantChat';
import { useUser } from '../lib/useUser';

export default function AssistantPage() {
  const { user, loading: authLoading } = useUser();
  if (authLoading) return null;
  if (!user) return null;

  return (
    <>
      <Head><title>Assistant — ProposalIQ</title></Head>
      <Layout title="Assistant" subtitle="Ask anything about your repository or scans" user={user}>
        <div className="min-h-[calc(100vh-56px)] bg-surface flex flex-col">
          <header className="px-6 md:px-12 pt-12 pb-6 max-w-4xl">
            <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tight text-on-surface mb-2">
              Assistant
            </h1>
            <p className="text-on-surface-variant font-body max-w-2xl">
              Powered by Claude. Ask about your projects, scans, team, or how anything in ProposalIQ works.
              Searches and verdict explanations are grounded in your tenant's real data — never invented.
            </p>
          </header>

          <div className="flex-1 px-6 md:px-12 pb-12 max-w-4xl w-full">
            <div className="bg-surface-container-low border border-outline-variant/20 rounded-lg overflow-hidden h-[70vh] min-h-[500px]">
              <AssistantChat variant="full" />
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}

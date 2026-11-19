import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { PageHead } from '@/components/site/PageHead';
import { MCP_CLIENTS, MCP_LIMIT, MCP_PROMPT, MCP_TOOLS, MCP_URL } from '@/lib/mcp';
import { absolute } from '@/lib/seo/site-url';

// Static: nothing here comes from the api, so the page is built once and served from the CDN.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Use Tripsmith from your AI assistant',
  description:
    'Tripsmith runs a remote MCP server: Claude, ChatGPT, Cursor or any MCP client can search our packages, check dates and seats, and hand you a link to book here.',
  alternates: { canonical: absolute('/developers') },
};

const code = 'rounded-md bg-bg2 px-1.5 py-0.5 font-mono text-[14px] text-ink';

export default function DevelopersPage() {
  return (
    <Container className="pb-20">
      <PageHead
        crumb="Developers"
        title="Plan a Tripsmith trip from your AI assistant"
        lede="Our MCP server lets Claude, ChatGPT, Cursor or any MCP client search our packages, check real dates and seats, and hand you a link to book or enquire on this site."
      />

      <section className="mt-8 max-w-[70ch]" aria-labelledby="url">
        <h2 id="url" className="text-xl">
          The server
        </h2>
        <p className="mt-2 text-ink2">Remote MCP over Streamable HTTP. No sign-in, no API key.</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-4 font-mono text-[15px] text-white">
          {MCP_URL}
        </pre>
      </section>

      <section className="mt-10 max-w-[70ch]" aria-labelledby="clients">
        <h2 id="clients" className="text-xl">
          Add it to your client
        </h2>
        <ul className="mt-3 grid gap-4">
          {MCP_CLIENTS.map((client) => (
            <li key={client.name}>
              <p className="font-bold">{client.name}</p>
              <p className="text-ink2">{client.how}</p>
              {'config' in client && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-[14px] text-white">
                  {client.config}
                </pre>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 max-w-[70ch]" aria-labelledby="tools">
        <h2 id="tools" className="text-xl">
          What it can do
        </h2>
        <dl className="mt-3 grid gap-3">
          {MCP_TOOLS.map((tool) => (
            <div key={tool.name}>
              <dt>
                <code className={code}>{tool.name}</code>
              </dt>
              <dd className="mt-1 text-ink2">{tool.does}</dd>
            </div>
          ))}
          <div>
            <dt>
              <code className={code}>{MCP_PROMPT.name}</code>{' '}
              <span className="text-mute">prompt</span>
            </dt>
            <dd className="mt-1 text-ink2">{MCP_PROMPT.does}</dd>
          </div>
        </dl>
        <p className="mt-4 text-ink2">
          It reads the catalogue and hands you over: nothing is booked, paid, held or sent through
          it. Booking and enquiries happen on this site, with the same prices and seats.
        </p>
      </section>

      <section className="mt-10 max-w-[70ch]" aria-labelledby="limits">
        <h2 id="limits" className="text-xl">
          Limits and privacy
        </h2>
        <ul className="mt-3 grid list-disc gap-2 pl-5 text-ink2">
          <li>
            {MCP_LIMIT} requests an hour per connection. Past that, or if our limiter is down, the
            server says to try again later.
          </li>
          <li>
            No contact details or payments go through MCP. You type your name and phone on this
            site, never into a link.
          </li>
          <li>
            Each request is logged for abuse and debugging: the tool, its inputs with any phone
            number or email removed, and a one-way hash of your connection’s address, never the
            address itself.
          </li>
        </ul>
        <p className="mt-4 text-mute">
          More in our <Link href="/privacy">privacy policy</Link>. Questions?{' '}
          <Link href="/contact">Contact us</Link>.
        </p>
      </section>
    </Container>
  );
}

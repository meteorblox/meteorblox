import Link from "next/link";

type Section = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export function ProtocolPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: Section[] }) {
  return (
    <main className="protocol-page">
      <header className="protocol-header">
        <Link className="brand" href="/" aria-label="Back to SLVRBLOX">
          <span className="brand-meteor"><i /><b /><em /></span>
          <span className="wordmark"><strong>SLVR</strong><b>BLOX</b></span>
        </Link>
        <Link className="protocol-back" href="/">Back to the grid</Link>
      </header>
      <article className="protocol-document">
        <p className="protocol-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="protocol-intro">{intro}</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>
        ))}
      </article>
      <footer><p><strong>SLVRBLOX / DSLVR</strong> &middot; Sui Testnet beta</p><nav><Link href="/whitepaper">Whitepaper</Link><Link href="/roadmap">Roadmap</Link><Link href="/tokenomics">Tokenomics</Link></nav></footer>
    </main>
  );
}

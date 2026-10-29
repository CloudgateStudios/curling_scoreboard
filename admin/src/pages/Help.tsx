import { useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { allGuides, guideFor } from '../lib/guides';
import { renderGuide } from '../lib/helpMarkdown';
import common from '../styles/common.module.css';
import styles from './Help.module.css';

// The guides for club admins. Open to anyone, signed in or not, so a link to
// one can be sent to someone who has not got an account yet.
export function Help() {
  const { guide: slug } = useParams<{ guide: string }>();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const guide = guideFor(slug);
  const html = useMemo(() => (guide ? renderGuide(guide.markdown) : ''), [guide]);

  useEffect(() => {
    if (guide) document.title = `${guide.title} · Curling Scoreboard Admin`;
  }, [guide]);

  // A new guide starts at the top, or at the heading its link names.
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [slug, hash]);

  if (!guide) return <Navigate to="/help" replace />;

  // The guide's HTML is not React, so its links to other guides are caught
  // here and opened without reloading the page.
  function handleClick(e: React.MouseEvent<HTMLElement>) {
    const link = (e.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href');
    if (!href?.startsWith('/help') || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  }

  return (
    <div className={styles.layout}>
      <nav className={styles.guides} aria-label="Guides">
        <Link to="/help" aria-current={guide.slug === 'README' ? 'page' : undefined}>All guides</Link>
        {allGuides().map((g) => (
          <Link key={g.slug} to={g.path} aria-current={g.slug === guide.slug ? 'page' : undefined}>
            {g.title}
          </Link>
        ))}
      </nav>
      <article
        className={`${common.section} ${styles.guide}`}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

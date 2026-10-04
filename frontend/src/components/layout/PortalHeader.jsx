export default function PortalHeader() {
  return (
    <header className="portal-header">
      <div className="portal-banner">
        <img src="/header-banner.png" alt="Guru Nanak Dev Engineering College, Ludhiana — An Autonomous College under UGC Act 1956" width="1610" height="264" />
      </div>
      <div className="portal-compact-header">
        <img className="compact-emblem" src="/gndec-logo.png" alt="" width="220" height="220" />
        <div>
          <div className="compact-title">Guru Nanak Dev Engineering College</div>
          <div className="compact-sub" lang="pa">ਗੁਰੂ ਨਾਨਕ ਦੇਵ ਇੰਜੀਨੀਅਰਿੰਗ ਕਾਲਜ, ਲੁਧਿਆਣਾ</div>
        </div>
      </div>
    </header>
  );
}

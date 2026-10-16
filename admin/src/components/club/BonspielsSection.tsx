import common from '../../styles/common.module.css';

/** The club's bonspiels. A placeholder until bonspiels can be set up here. */
export function BonspielsSection() {
  return (
    <div className={common.section}>
      <div className={common.sectionHeader}>
        <h2 className={common.sectionTitle}>Bonspiels</h2>
      </div>
      <p className={common.empty}>Bonspiels are coming soon.</p>
    </div>
  );
}

import { ServiceSwitchesSection } from '../components/ServiceSwitchesSection';
import { SystemShell } from '../components/SystemShell';

/** The switches that turn public parts of the service off for every club,
 *  and the blocked addresses. Super admins only. */
export function ServiceControls() {
  return (
    <SystemShell>
      <ServiceSwitchesSection />
    </SystemShell>
  );
}

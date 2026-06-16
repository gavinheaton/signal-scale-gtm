import { useSearchParams } from 'react-router-dom';
import BrandAuditHub from './BrandAudit';
import BrandAuditDetail from './BrandAuditDetail';

export default function BrandAuditPage() {
  const [params] = useSearchParams();
  const runId = params.get('run');
  if (runId) return <BrandAuditDetail runId={runId} />;
  return <BrandAuditHub />;
}

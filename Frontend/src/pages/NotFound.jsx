import { Link } from 'react-router-dom';
import { useTitle } from '../context/hooks.js';
import { EmptyState } from '../components/ui.jsx';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <div className="container narrow">
      <div className="card">
        <EmptyState icon="404" title="This page does not exist" action={<Link to="/dashboard" className="btn btn-primary">Go to dashboard</Link>}>
          The link may be broken or the page may have moved.
        </EmptyState>
      </div>
    </div>
  );
}

import { Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useTitle } from '../../utils/hooks';
import { EmptyState } from '../../components/ui';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <EmptyState icon="signpost-split" title="We couldn't find that page" action={<Button as={Link} to="/">Go home</Button>}>
      The link may be old, or the page may have moved.
    </EmptyState>
  );
}

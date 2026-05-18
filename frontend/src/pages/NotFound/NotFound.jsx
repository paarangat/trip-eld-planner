import { Link } from "react-router-dom";

import Button from "../../components/Button/Button.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" eyebrow="404" />
      <EmptyState
        title="That page doesn't exist"
        body="Use the sidebar to find what you were looking for."
        action={
          <Button as={Link} to="/" variant="primary">
            Back to dashboard
          </Button>
        }
      />
    </>
  );
}

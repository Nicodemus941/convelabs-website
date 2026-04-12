import { useParams, useSearchParams, Navigate } from 'react-router-dom';

const BookAppointment = () => {
  const { tenantId } = useParams<{ tenantId?: string }>();
  const [searchParams] = useSearchParams();

  // For tenant-specific routes, keep existing behavior (future enhancement)
  // For plain /book, redirect to /book-now preserving query params
  const queryString = searchParams.toString();
  const target = `/book-now${queryString ? `?${queryString}` : ''}`;

  if (!tenantId) {
    return <Navigate to={target} replace />;
  }

  // Tenant-specific booking can be handled here in the future
  return <Navigate to={target} replace />;
};

export default BookAppointment;

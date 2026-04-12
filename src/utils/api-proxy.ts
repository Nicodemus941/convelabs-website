
/**
 * Sets up API proxy to map /api/* routes to Supabase Edge Functions
 */
export const setupApiProxy = () => {
  const apiPrefix = '/api';
  const edgeFunctionsUrl = 'https://yluyonhrxxtyuiyrdixl.supabase.co/functions/v1';

  // Setup API routes
  if (typeof window !== 'undefined') {
    const originalFetch = window.fetch;
    window.fetch = function (url: RequestInfo | URL, options?: RequestInit) {
      if (typeof url === 'string' && url.startsWith(apiPrefix)) {
        // Map /api/agreements/membership to the edge function
        if (url === '/api/agreements/membership') {
          return originalFetch(`${edgeFunctionsUrl}/get-membership-agreement`, options);
        }
        
        // Map other API routes as needed
        const newUrl = url.replace(apiPrefix, edgeFunctionsUrl);
        return originalFetch(newUrl, options);
      }
      return originalFetch(url, options);
    };
  }
};

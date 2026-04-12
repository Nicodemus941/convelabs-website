
// Format price from cents to dollars with proper formatting
export const formatPrice = (price: number): string => {
  return (price / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
};

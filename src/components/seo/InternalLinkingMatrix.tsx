import React from 'react';
import { Link } from 'react-router-dom';

interface InternalLinkingMatrixProps {
  currentPage: string;
}

export const InternalLinkingMatrix: React.FC<InternalLinkingMatrixProps> = ({ currentPage }) => {
  const luxuryServices = [
    { path: '/luxury-mobile-phlebotomy', title: 'Luxury Mobile Phlebotomy', anchor: 'premium mobile lab services' },
    { path: '/executive-health-orlando', title: 'Executive Health Orlando', anchor: 'executive health screening' },
    { path: '/concierge-phlebotomy', title: 'Concierge Phlebotomy', anchor: 'white-glove concierge service' }
  ];

  const luxuryCommunities = [
    { path: '/isleworth', title: 'Isleworth VIP Services', anchor: 'Isleworth golf community services' },
    { path: '/bay-hill', title: 'Bay Hill Club Services', anchor: 'Bay Hill Club championship services' },
    { path: '/golden-oak', title: 'Golden Oak Disney Services', anchor: 'Golden Oak Disney luxury services' },
    { path: '/lake-nona', title: 'Lake Nona Medical City', anchor: 'Lake Nona innovation district services' },
    { path: '/windermere', title: 'Windermere Services', anchor: 'Windermere luxury estate services' },
    { path: '/doctor-phillips', title: 'Dr Phillips Services', anchor: 'Dr Phillips executive services' }
  ];

  const specialtyServices = [
    { path: '/yacht-mobile-lab', title: 'Yacht Mobile Lab Testing', anchor: 'yacht and marine lab services' },
    { path: '/celebration', title: 'Celebration Disney Community', anchor: 'family-friendly Disney community services' },
    { path: '/heathrow-golf', title: 'Heathrow Golf Executive Services', anchor: 'aviation and golf community services' }
  ];

  const comparisons = [
    { path: '/vs-labcorp', title: 'ConveLabs vs LabCorp', anchor: 'why choose ConveLabs over LabCorp' }
  ];

  // Don't show current page in recommendations
  const allLinks = [...luxuryServices, ...luxuryCommunities, ...specialtyServices, ...comparisons]
    .filter(link => link.path !== currentPage);

  // Select 3-4 most relevant links based on current page
  const getRelevantLinks = () => {
    if (currentPage.includes('luxury') || currentPage.includes('executive') || currentPage.includes('concierge')) {
      return [...luxuryCommunities.slice(0, 3), ...specialtyServices.slice(0, 1)];
    }
    if (luxuryCommunities.some(link => link.path === currentPage)) {
      return [...luxuryServices.slice(0, 2), ...luxuryCommunities.filter(link => link.path !== currentPage).slice(0, 2)];
    }
    if (specialtyServices.some(link => link.path === currentPage)) {
      return [...luxuryServices.slice(0, 2), ...luxuryCommunities.slice(0, 2)];
    }
    return allLinks.slice(0, 4);
  };

  const relevantLinks = getRelevantLinks();

  if (relevantLinks.length === 0) return null;

  return (
    <div className="mt-16 luxury-card p-8">
      <h3 className="text-2xl font-bold mb-6 font-playfair text-center">Explore More Luxury Services</h3>
      <div className="grid md:grid-cols-2 gap-6">
        {relevantLinks.map((link, index) => (
          <Link 
            key={index}
            to={link.path}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-conve-red hover:bg-gray-50 transition-all duration-300 group"
          >
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 group-hover:text-conve-red transition-colors">
                {link.title}
              </h4>
              <p className="text-sm text-gray-600">
                Discover our {link.anchor}
              </p>
            </div>
            <div className="text-conve-red opacity-0 group-hover:opacity-100 transition-opacity">
              →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
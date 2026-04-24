import React, { useState } from 'react';
import { Users, Receipt, Building2, NotebookPen } from 'lucide-react';
import PatientsSection from './PatientsSection';
import InvoicesSection from './InvoicesSection';
import OrganizationsSection from './OrganizationsSection';
import NotesSection from './NotesSection';

/**
 * DirectoryTab — the phleb's read-only console for non-schedule data.
 * 4 sub-tabs as a segmented control (better than nested Tabs on mobile):
 *   Patients · Invoices · Organizations · Notes
 */

type Sub = 'patients' | 'invoices' | 'organizations' | 'notes';

const ITEMS: { id: Sub; label: string; short: string; Icon: any }[] = [
  { id: 'patients', label: 'Patients', short: 'Patients', Icon: Users },
  { id: 'invoices', label: 'Invoices', short: 'Invoices', Icon: Receipt },
  { id: 'organizations', label: 'Organizations', short: 'Orgs', Icon: Building2 },
  { id: 'notes', label: 'Care Notes', short: 'Notes', Icon: NotebookPen },
];

const DirectoryTab: React.FC = () => {
  const [active, setActive] = useState<Sub>(() =>
    (sessionStorage.getItem('phleb-directory-sub') as Sub) || 'patients'
  );

  const setSub = (s: Sub) => {
    setActive(s);
    sessionStorage.setItem('phleb-directory-sub', s);
  };

  return (
    <div className="max-w-lg mx-auto px-3 sm:px-4 pb-20 sm:pb-8 pt-3 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Directory</h1>
        <p className="text-xs text-gray-500 mt-0.5">Your patients, invoices, orgs, and care notes — all in one place.</p>
      </div>

      {/* Segmented control */}
      <div className="bg-gray-100 rounded-xl p-1 grid grid-cols-4 gap-1">
        {ITEMS.map((item) => {
          const sel = active === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSub(item.id)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-[11px] font-medium transition ${
                sel ? 'bg-white shadow-sm text-[#B91C1C]' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.short}</span>
            </button>
          );
        })}
      </div>

      {/* Section */}
      <div>
        {active === 'patients' && <PatientsSection />}
        {active === 'invoices' && <InvoicesSection />}
        {active === 'organizations' && <OrganizationsSection />}
        {active === 'notes' && <NotesSection />}
      </div>
    </div>
  );
};

export default DirectoryTab;

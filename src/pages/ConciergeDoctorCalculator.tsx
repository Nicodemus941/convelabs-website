
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import ConciergeDoctorCalculator from "@/components/membership/ConciergeDoctorCalculator";

const ConciergeDoctorCalculatorPage = () => {
  return (
    <DashboardWrapper>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Concierge Doctor Program</h1>
          <p className="max-w-2xl mx-auto text-muted-foreground">
            Customize your plan based on patient count. Each patient gets 12 lab credits per year, and you can manage all aspects of their lab work through your dashboard.
          </p>
        </div>
        
        <div className="mt-8">
          <ConciergeDoctorCalculator />
        </div>
        
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="bg-muted/30 p-6 rounded-lg">
            <h3 className="font-bold text-xl mb-3">Patient Management</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Add patients manually or via CSV upload</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Track lab usage by patient</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>View patient test history</span>
              </li>
            </ul>
          </div>
          
          <div className="bg-muted/30 p-6 rounded-lg">
            <h3 className="font-bold text-xl mb-3">Lab Services</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Schedule appointments for patients</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>12 credits per patient annually</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Premium add-on services available</span>
              </li>
            </ul>
          </div>
          
          <div className="bg-muted/30 p-6 rounded-lg">
            <h3 className="font-bold text-xl mb-3">Billing Benefits</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>No additional patient charges</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Simple, predictable pricing model</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 font-bold">✓</span>
                <span>Save with annual billing</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-10 text-center">
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Need a custom quote for more than 100 patients? Contact our sales team at <a href="mailto:sales@convelabs.com" className="text-primary underline">sales@convelabs.com</a>
          </p>
        </div>
      </div>
    </DashboardWrapper>
  );
};

export default ConciergeDoctorCalculatorPage;

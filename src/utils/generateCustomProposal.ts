import jsPDF from 'jspdf';
import { ROICalculatorResults } from '@/types/b2bTypes';
import { IndustryType } from '@/types/b2bTypes';

export const generateCustomProposal = async (
  results: ROICalculatorResults,
  industry: IndustryType,
  inputs: { volume: number; avgValue: number; currentSpend?: number }
) => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Helper functions
  const addText = (text: string, fontSize: number = 12, isBold: boolean = false, isTitle: boolean = false) => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
    
    if (isTitle) {
      pdf.setTextColor(220, 38, 127); // ConveLabs red
    } else {
      pdf.setTextColor(0, 0, 0);
    }
    
    const lines = pdf.splitTextToSize(text, contentWidth);
    const lineHeight = fontSize * 0.35;
    
    if (yPosition + (lines.length * lineHeight) > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin;
    }
    
    pdf.text(lines, margin, yPosition);
    yPosition += lines.length * lineHeight + (isTitle ? 15 : 8);
  };

  const addLine = () => {
    pdf.setDrawColor(220, 38, 127);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getIndustryName = (industry: IndustryType) => {
    const names = {
      healthcare: 'Healthcare',
      talent: 'Talent Agency',
      sports: 'Sports Organization',
      corporate: 'Corporate'
    };
    return names[industry];
  };

  // Cover Page
  pdf.setFillColor(220, 38, 127);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(36);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ConveLabs', pageWidth / 2, 70, { align: 'center' });
  
  pdf.setFontSize(24);
  pdf.text('Custom Partnership Proposal', pageWidth / 2, 100, { align: 'center' });
  
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${getIndustryName(industry)} Partnership`, pageWidth / 2, 130, { align: 'center' });
  
  pdf.setFontSize(14);
  pdf.text(`Prepared on ${new Date().toLocaleDateString()}`, pageWidth / 2, 160, { align: 'center' });
  
  // ROI Summary Box
  pdf.setFillColor(255, 255, 255, 0.1);
  pdf.roundedRect(margin, 180, contentWidth, 60, 5, 5, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Your Partnership Value', pageWidth / 2, 195, { align: 'center' });
  pdf.setFontSize(28);
  pdf.text(formatCurrency(results.totalValue), pageWidth / 2, 220, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Annual Partnership Value', pageWidth / 2, 235, { align: 'center' });

  // Page 2 - Executive Summary
  pdf.addPage();
  yPosition = margin;
  
  addText('Executive Summary', 24, true, true);
  addLine();
  
  addText('Partnership Overview', 16, true);
  addText(`This custom proposal outlines a strategic partnership opportunity between your ${getIndustryName(industry).toLowerCase()} and ConveLabs, designed to deliver measurable value through our premium mobile health services.`);
  
  addText('Your ROI Analysis Results', 16, true);
  addText(`Based on your inputs of ${inputs.volume} monthly volume and ${formatCurrency(inputs.avgValue)} average value, we project the following annual benefits:`);
  
  addText(`• Additional Revenue: ${formatCurrency(results.additionalRevenue)}`);
  addText(`• Cost Savings: ${formatCurrency(results.costSavings)}`);
  addText(`• Total Annual Value: ${formatCurrency(results.totalValue)}`);
  addText(`• Monthly Value: ${formatCurrency(results.monthlyValue)}`);
  
  addText('Partnership Recommendation', 16, true);
  if (results.totalValue > 100000) {
    addText('Based on your projected value, we recommend our Premium Partnership Package with dedicated account management, priority scheduling, and custom reporting.');
  } else if (results.totalValue > 50000) {
    addText('Based on your projected value, we recommend our Professional Partnership Package with enhanced support and quarterly business reviews.');
  } else {
    addText('Based on your projected value, we recommend our Standard Partnership Package with comprehensive support and monthly reporting.');
  }

  // Page 3 - Customized Service Plan
  pdf.addPage();
  yPosition = margin;
  
  addText('Customized Service Plan', 24, true, true);
  addLine();
  
  addText('Service Delivery Model', 16, true);
  addText(`For your ${getIndustryName(industry).toLowerCase()}, we propose the following service structure:`);
  
  if (industry === 'healthcare') {
    addText('• Revenue-share partnership (15-25% commission)\n• Seamless integration with your existing patient flow\n• HIPAA-compliant data handling and reporting\n• Same-day scheduling for patient convenience\n• Dedicated phlebotomist assignment for consistency');
  } else if (industry === 'talent') {
    addText('• White-label services under your brand\n• Executive health panels for talent protection\n• Flexible scheduling for busy talent schedules\n• Confidential results and reporting\n• Emergency testing availability');
  } else if (industry === 'sports') {
    addText('• Performance optimization testing protocols\n• Mobile services for training facilities\n• Real-time biomarker monitoring\n• Injury prevention screening programs\n• Travel team support capabilities');
  } else {
    addText('• Corporate wellness program integration\n• Executive health services\n• Employee convenience scheduling\n• Comprehensive health reporting\n• Wellness program ROI tracking');
  }
  
  addText('Implementation Timeline', 16, true);
  addText('Week 1-2: Contract finalization and system setup\nWeek 3-4: Staff training and integration testing\nWeek 5-6: Soft launch with select clients\nWeek 7-8: Full program launch and optimization');
  
  addText('Service Area Coverage', 16, true);
  addText('Orlando & Tampa, Florida - Complete Central Florida coverage with dedicated local team and rapid response capabilities.');

  // Page 4 - Financial Details
  pdf.addPage();
  yPosition = margin;
  
  addText('Financial Structure', 24, true, true);
  addLine();
  
  addText('Investment Requirements', 16, true);
  addText('No upfront investment required for revenue-share partnerships. ConveLabs provides all equipment, supplies, and staffing at no cost to you.');
  
  addText('Revenue Projections', 16, true);
  addText(`Monthly Projected Volume: ${inputs.volume} services`);
  addText(`Average Service Value: ${formatCurrency(inputs.avgValue)}`);
  addText(`Gross Monthly Revenue: ${formatCurrency(inputs.volume * inputs.avgValue)}`);
  addText(`Annual Revenue Potential: ${formatCurrency(inputs.volume * inputs.avgValue * 12)}`);
  
  addText('Partnership Benefits Breakdown', 16, true);
  addText(`Additional Revenue Generation: ${formatCurrency(results.additionalRevenue)} annually`);
  addText(`Operational Cost Savings: ${formatCurrency(results.costSavings)} annually`);
  addText(`Total Partnership Value: ${formatCurrency(results.totalValue)} annually`);
  
  addText('ROI Timeline', 16, true);
  addText('Month 1-2: Implementation and soft launch\nMonth 3-4: Ramp up to full capacity\nMonth 5-6: Achieve projected ROI\nMonth 6+: Optimize and expand services');

  // Page 5 - Next Steps
  pdf.addPage();
  yPosition = margin;
  
  addText('Next Steps', 24, true, true);
  addLine();
  
  addText('Partnership Agreement Process', 16, true);
  addText('1. Review and approval of this custom proposal\n2. Schedule detailed implementation planning session\n3. Contract negotiation and finalization\n4. System integration and staff training\n5. Soft launch and performance optimization\n6. Full program launch');
  
  addText('What We Need From You', 16, true);
  addText('• Confirmation of service volume projections\n• Integration requirements and preferences\n• Implementation timeline preferences\n• Key stakeholder involvement\n• Marketing and communication support');
  
  addText('Immediate Next Steps', 16, true);
  addText('Contact our Partnership Team within 48 hours to:\n• Schedule your implementation planning session\n• Review contract terms and customizations\n• Confirm your partnership package selection\n• Begin the onboarding process');
  
  addText('Contact Information', 16, true);
  addText('Partnership Team: (555) 123-4567\nEmail: partnerships@convelabs.com\nDirect Contact: Available 8AM-6PM EST\nEmergency Support: 24/7 availability');
  
  addText('Proposal Validity', 16, true);
  addText('This custom proposal is valid for 30 days from the date of generation. Pricing and terms are guaranteed during this period.');

  // Footer
  yPosition = pageHeight - 40;
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text('© 2024 ConveLabs. Confidential Partnership Proposal - For Internal Use Only.', pageWidth / 2, yPosition, { align: 'center' });

  // Save the PDF
  const filename = `ConveLabs-Custom-Proposal-${getIndustryName(industry).replace(' ', '')}-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(filename);
};
import jsPDF from 'jspdf';

export const generatePartnershipGuide = async () => {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let yPosition = margin;

  // Helper function to add text with word wrapping
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
    
    // Check if we need a new page
    if (yPosition + (lines.length * lineHeight) > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin;
    }
    
    pdf.text(lines, margin, yPosition);
    yPosition += lines.length * lineHeight + (isTitle ? 15 : 8);
  };

  // Helper function to add a horizontal line
  const addLine = () => {
    pdf.setDrawColor(220, 38, 127);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;
  };

  // Cover Page
  pdf.setFillColor(220, 38, 127);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(36);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ConveLabs', pageWidth / 2, 80, { align: 'center' });
  
  pdf.setFontSize(24);
  pdf.text('Partnership Guide', pageWidth / 2, 110, { align: 'center' });
  
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Premium Mobile Health Services', pageWidth / 2, 140, { align: 'center' });
  pdf.text('Transform Your Organization', pageWidth / 2, 160, { align: 'center' });
  
  pdf.setFontSize(12);
  pdf.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 30, { align: 'center' });

  // Page 2 - Introduction
  pdf.addPage();
  yPosition = margin;
  
  addText('Welcome to ConveLabs Partnerships', 24, true, true);
  addLine();
  
  addText('About ConveLabs', 18, true);
  addText('ConveLabs is the premier provider of mobile phlebotomy and comprehensive lab services, delivering executive-level healthcare experiences directly to your organization. With over 500 active partnerships and $50M+ in value delivered, we transform how organizations approach health and wellness.');
  
  addText('Our Mission', 16, true);
  addText('To revolutionize healthcare delivery by bringing premium, personalized medical services directly to where they\'re needed most - whether that\'s your office, home, or training facility.');
  
  addText('Why Partner with ConveLabs?', 16, true);
  addText('• Generate additional revenue streams without overhead\n• Enhance client/employee satisfaction and retention\n• Access to certified professionals and cutting-edge technology\n• Comprehensive support and training\n• Proven ROI with measurable results');

  // Page 3 - Partnership Models
  pdf.addPage();
  yPosition = margin;
  
  addText('Partnership Models', 24, true, true);
  addLine();
  
  addText('Revenue Share Partnership', 16, true);
  addText('Perfect for healthcare providers and wellness centers looking to expand their service offerings without additional overhead. Partners earn 15-25% commission on all services booked through their referrals.');
  addText('Benefits:\n• No upfront investment required\n• Passive income generation\n• Enhanced patient experience\n• Seamless integration with existing services');
  
  addText('White Label Services', 16, true);
  addText('Ideal for talent agencies, sports organizations, and corporations wanting to offer premium health services under their own brand.');
  addText('Benefits:\n• Full brand customization\n• Direct client relationships\n• Premium positioning\n• Comprehensive support package');
  
  addText('Exclusive Territory Partnership', 16, true);
  addText('For organizations seeking market exclusivity in their geographic area or industry vertical.');
  addText('Benefits:\n• Protected territory rights\n• Priority support and resources\n• Custom pricing structures\n• Joint marketing initiatives');

  // Page 4 - Industry-Specific Benefits
  pdf.addPage();
  yPosition = margin;
  
  addText('Industry-Specific Benefits', 24, true, true);
  addLine();
  
  addText('Healthcare Providers', 16, true);
  addText('• Additional revenue: $50K-200K annually\n• Enhanced patient experience with 40% satisfaction increase\n• Zero overhead expansion\n• Seamless EMR integration\n• HIPAA-compliant operations');
  
  addText('Talent Agencies', 16, true);
  addText('• Talent protection and career preservation\n• Booking protection worth $25K-100K per talent\n• Competitive advantage in talent retention\n• Premium service differentiation\n• Executive health program capabilities');
  
  addText('Sports Organizations', 16, true);
  addText('• Performance optimization through advanced biomarker tracking\n• Injury prevention saving $500K-2M annually\n• Mobile flexibility for travel teams\n• Real-time health monitoring\n• Competitive edge through data insights');
  
  addText('Corporate Partners', 16, true);
  addText('• Employee wellness ROI with 20-30% healthcare cost reduction\n• Executive health programs for talent retention\n• Productivity gains through preventive care\n• Comprehensive wellness solutions\n• Custom program development');

  // Page 5 - Services Overview
  pdf.addPage();
  yPosition = margin;
  
  addText('Comprehensive Service Portfolio', 24, true, true);
  addLine();
  
  addText('Mobile Phlebotomy Services', 16, true);
  addText('• Certified, licensed phlebotomists in all 50 states\n• Same-day scheduling and availability\n• Concierge-level service experience\n• Specialized collection for complex requirements\n• Mobile equipment and supplies included');
  
  addText('Comprehensive Lab Panels', 16, true);
  addText('• Executive health and wellness panels\n• Performance and biomarker testing\n• Specialized diagnostic testing\n• Custom panel development\n• Nutritional and metabolic assessments');
  
  addText('Rapid Results & Reporting', 16, true);
  addText('• 24-48 hour turnaround time\n• Secure online portal access\n• Comprehensive result interpretation\n• Trending and historical analysis\n• Direct physician consultation available');
  
  addText('Technology Platform', 16, true);
  addText('• HIPAA-compliant secure platform\n• Real-time scheduling and tracking\n• Integrated billing and reporting\n• Mobile app for clients\n• API integration capabilities');

  // Page 6 - Success Stories
  pdf.addPage();
  yPosition = margin;
  
  addText('Partner Success Stories', 24, true, true);
  addLine();
  
  addText('Healthcare Provider Success', 16, true);
  addText('"ConveLabs has transformed our patient experience while adding $180K in annual revenue. Our patients love the convenience, and we love the seamless integration." - Dr. Sarah Mitchell, Premier Health Group');
  
  addText('Talent Agency Success', 16, true);
  addText('"We\'ve prevented three potential career-ending health issues this year alone. The ROI is immeasurable when you\'re protecting million-dollar careers." - Marcus Rodriguez, Elite Talent Agency');
  
  addText('Sports Organization Success', 16, true);
  addText('"The biomarker insights have given us a competitive edge. We\'ve reduced injury downtime by 60% and our athletes are performing at unprecedented levels." - Coach Jennifer Walsh, Metro Athletics');
  
  addText('Corporate Partnership Success', 16, true);
  addText('"Our executive health program has become our top talent retention tool. We\'ve seen a 35% reduction in healthcare costs and dramatically improved executive satisfaction." - David Chen, TechCorp Solutions');

  // Page 7 - Getting Started
  pdf.addPage();
  yPosition = margin;
  
  addText('Getting Started', 24, true, true);
  addLine();
  
  addText('Partnership Process', 16, true);
  addText('1. Initial Consultation\n   • Assess your organization\'s needs\n   • Discuss partnership objectives\n   • Review service requirements\n   • Explore customization options');
  
  addText('2. Custom Proposal Development\n   • Detailed ROI analysis\n   • Pricing structure proposal\n   • Implementation timeline\n   • Support and training plan');
  
  addText('3. Agreement and Onboarding\n   • Contract finalization\n   • System integration setup\n   • Staff training program\n   • Marketing material development');
  
  addText('4. Launch and Support\n   • Soft launch with select clients\n   • Performance monitoring\n   • Ongoing optimization\n   • Continuous support and training');
  
  addText('Investment and Timeline', 16, true);
  addText('• No upfront investment required for revenue share partnerships\n• 30-60 day implementation timeline\n• Full support throughout onboarding\n• 24/7 ongoing partnership support\n• Average ROI timeline: 6 months');

  // Page 8 - Contact Information
  pdf.addPage();
  yPosition = margin;
  
  addText('Next Steps', 24, true, true);
  addLine();
  
  addText('Ready to Transform Your Organization?', 18, true);
  addText('Contact our Partnership Team today to schedule your consultation and receive a custom ROI analysis.');
  
  addText('Partnership Team Contact', 16, true);
  addText('Phone: (555) 123-4567\nEmail: partnerships@convelabs.com\nWebsite: www.convelabs.com\nHours: Monday-Friday, 8AM-6PM EST');
  
  addText('What Happens Next?', 16, true);
  addText('1. Partnership specialist will review your inquiry within 24 hours\n2. Custom ROI analysis and proposal preparation\n3. Detailed partnership discussion scheduled\n4. Implementation planning begins\n5. Launch your new revenue stream');
  
  addText('Partnership Success Metrics', 16, true);
  addText('• 96% Partner Retention Rate\n• 15% Average Revenue Increase\n• 30% Cost Reduction Average\n• 6 Month Average ROI Timeline\n• 98% Client Satisfaction Rate');
  
  // Footer
  yPosition = pageHeight - 40;
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text('© 2024 ConveLabs. All rights reserved. Confidential and Proprietary.', pageWidth / 2, yPosition, { align: 'center' });

  // Save the PDF
  pdf.save('ConveLabs-Partnership-Guide.pdf');
};
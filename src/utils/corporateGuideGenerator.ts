import jsPDF from 'jspdf';

export const generateCorporateWellnessGuide = () => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let currentY = 20;

  // Color scheme
  const primaryColor: [number, number, number] = [139, 22, 22]; // ConveLabs red
  const goldColor: [number, number, number] = [218, 165, 32]; // ConveLabs gold
  const textColor: [number, number, number] = [51, 51, 51]; // Dark gray
  const lightGray: [number, number, number] = [128, 128, 128];

  // Helper functions
  const addTitle = (text: string, size: number = 24) => {
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(size);
    doc.setFont('helvetica', 'bold');
    doc.text(text, pageWidth / 2, currentY, { align: 'center' });
    currentY += size * 0.6;
  };

  const addSubtitle = (text: string, size: number = 14) => {
    doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.setFontSize(size);
    doc.setFont('helvetica', 'normal');
    doc.text(text, pageWidth / 2, currentY, { align: 'center' });
    currentY += size * 0.8;
  };

  const addSectionTitle = (text: string) => {
    currentY += 10;
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(text, 20, currentY);
    currentY += 15;
  };

  const addParagraph = (text: string, indent: number = 20) => {
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, pageWidth - 40);
    doc.text(lines, indent, currentY);
    currentY += lines.length * 6 + 5;
  };

  const addBulletPoint = (text: string) => {
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, pageWidth - 60);
    doc.text('•', 25, currentY);
    doc.text(lines, 35, currentY);
    currentY += lines.length * 6 + 3;
  };

  const addMetricBox = (title: string, value: string, description: string, x: number) => {
    // Box background
    doc.setFillColor(248, 249, 250);
    doc.rect(x, currentY, 80, 35, 'F');
    
    // Box border
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.5);
    doc.rect(x, currentY, 80, 35);
    
    // Value
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + 40, currentY + 12, { align: 'center' });
    
    // Title
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(title, x + 40, currentY + 20, { align: 'center' });
    
    // Description
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(description, 75);
    doc.text(descLines, x + 40, currentY + 27, { align: 'center' });
  };

  const checkPageBreak = (neededSpace: number = 40) => {
    if (currentY + neededSpace > pageHeight - 20) {
      doc.addPage();
      currentY = 20;
    }
  };

  // Page 1 - Cover Page
  currentY = 80;
  
  // Company logo area (placeholder)
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(pageWidth / 2 - 15, currentY - 10, 30, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ConveLabs', pageWidth / 2, currentY - 5, { align: 'center' });
  
  currentY += 20;
  addTitle('Corporate Wellness', 28);
  addTitle('Program Guide', 28);
  currentY += 10;
  addSubtitle('Transform Your Workplace Health Initiative');
  addSubtitle('Mobile Phlebotomy & Executive Health Solutions');
  
  currentY = pageHeight - 60;
  doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setFontSize(10);
  doc.text('Orlando, Florida | (941) 527-9169', pageWidth / 2, currentY, { align: 'center' });
  doc.text('www.convelabs.com', pageWidth / 2, currentY + 12, { align: 'center' });

  // Page 2 - Table of Contents
  doc.addPage();
  currentY = 30;
  
  addTitle('Table of Contents', 22);
  currentY += 10;
  
  const tocItems = [
    { title: 'Executive Summary', page: 3 },
    { title: 'The Corporate Wellness Challenge', page: 4 },
    { title: 'ConveLabs Solution Overview', page: 5 },
    { title: 'Service Benefits & ROI', page: 6 },
    { title: 'Implementation Process', page: 7 },
    { title: 'Pricing & Packages', page: 8 },
    { title: 'Success Stories', page: 9 },
    { title: 'Getting Started', page: 10 }
  ];

  tocItems.forEach(item => {
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(12);
    doc.text(item.title, 30, currentY);
    doc.text(`${item.page}`, pageWidth - 30, currentY, { align: 'right' });
    
    // Dotted line
    doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(30 + doc.getTextWidth(item.title) + 5, currentY - 1, pageWidth - 40, currentY - 1);
    doc.setLineDashPattern([], 0);
    
    currentY += 15;
  });

  // Page 3 - Executive Summary
  doc.addPage();
  currentY = 30;
  
  addTitle('Executive Summary', 22);
  
  addParagraph('Traditional corporate health fairs are disruptive, expensive, and yield poor participation rates. ConveLabs revolutionizes workplace wellness with mobile phlebotomy services that take just 10 minutes per employee, delivering comprehensive health screenings at your location.');
  
  addParagraph('Our corporate wellness platform reduces employee sick days by 30%, cuts healthcare costs by 25%, and achieves 90%+ participation rates through convenient, on-demand health services.');
  
  currentY += 10;
  addSectionTitle('Key Benefits at a Glance:');
  addBulletPoint('10-minute service per employee with minimal workplace disruption');
  addBulletPoint('30% reduction in employee sick days and call-outs');
  addBulletPoint('25% decrease in corporate healthcare costs');
  addBulletPoint('90%+ employee participation vs. 40-60% for traditional health fairs');
  addBulletPoint('Monthly reporting and analytics for program optimization');
  addBulletPoint('HIPAA-compliant platform with enterprise-grade security');

  // Page 4 - The Challenge
  doc.addPage();
  currentY = 30;
  
  addTitle('The Corporate Wellness Challenge', 22);
  
  addSectionTitle('Traditional Health Fairs Fall Short');
  addParagraph('Most corporate wellness programs rely on annual or bi-annual health fairs that create significant challenges:');
  
  addBulletPoint('Half-day workplace disruptions affecting productivity');
  addBulletPoint('Low participation rates (40-60%) due to scheduling conflicts');
  addBulletPoint('High coordination costs and logistical complexity');
  addBulletPoint('Limited follow-up and ongoing health monitoring');
  addBulletPoint('Inconvenient timing leading to employee frustration');
  
  addSectionTitle('The Cost of Unhealthy Employees');
  addParagraph('According to the CDC, workplace health promotion programs can yield a return of $3.27 for every dollar spent. However, traditional approaches fail to capture this value due to:');
  
  addBulletPoint('Increased absenteeism and presenteeism');
  addBulletPoint('Higher healthcare premium costs');
  addBulletPoint('Reduced employee morale and satisfaction');
  addBulletPoint('Late detection of preventable health conditions');

  // Page 5 - Solution Overview
  doc.addPage();
  currentY = 30;
  
  addTitle('ConveLabs Solution Overview', 22);
  
  addSectionTitle('Mobile-First Approach');
  addParagraph('ConveLabs transforms corporate wellness through our mobile phlebotomy platform that brings health services directly to your employees - whether at the office, home, or preferred location.');
  
  addSectionTitle('What is a Corporate Seat?');
  addParagraph('Each Corporate Seat provides one employee with complete access to our platform, including:');
  
  addBulletPoint('On-site mobile phlebotomy services');
  addBulletPoint('Comprehensive lab panels and health screenings');
  addBulletPoint('Digital health tracking and results portal');
  addBulletPoint('Preventive care recommendations');
  addBulletPoint('24/7 appointment scheduling');
  addBulletPoint('HIPAA-compliant data management');
  
  addSectionTitle('Service Excellence');
  addParagraph('Our certified phlebotomists provide luxury-level service with clinical precision, ensuring every employee receives professional, comfortable care in just 10 minutes.');

  // Page 6 - Benefits & ROI
  doc.addPage();
  currentY = 30;
  
  addTitle('Service Benefits & ROI', 22);
  
  addSectionTitle('Measurable Business Impact');
  
  // Metrics boxes
  currentY += 5;
  addMetricBox('Sick Day Reduction', '30%', 'Fewer call-outs and medical absences', 20);
  addMetricBox('Cost Savings', '$2,400', 'Annual savings per employee', 110);
  currentY += 45;
  
  addMetricBox('Participation Rate', '92%', 'Employee program engagement', 20);
  addMetricBox('Service Time', '10 min', 'Per employee screening', 110);
  currentY += 50;
  
  addSectionTitle('Financial Benefits');
  addBulletPoint('Reduced healthcare premium costs through early detection');
  addBulletPoint('Decreased workers compensation claims');
  addBulletPoint('Lower recruitment and training costs due to reduced turnover');
  addBulletPoint('Improved productivity and reduced presenteeism');
  
  addSectionTitle('Employee Benefits');
  addBulletPoint('Convenient health screenings without time off work');
  addBulletPoint('Early detection of health risks and conditions');
  addBulletPoint('Improved health outcomes through preventive care');
  addBulletPoint('Enhanced job satisfaction and loyalty');

  // Page 7 - Implementation
  doc.addPage();
  currentY = 30;
  
  addTitle('Implementation Process', 22);
  
  addSectionTitle('30-Day Launch Timeline');
  
  // Timeline boxes
  const timelineItems = [
    { week: 'Week 1', title: 'Program Setup', description: 'Configure corporate wellness program and employee invitation system' },
    { week: 'Week 2-3', title: 'Employee Onboarding', description: 'Team members register and schedule first appointments' },
    { week: 'Week 4', title: 'Service Launch', description: 'Begin mobile health screenings and data collection' }
  ];
  
  timelineItems.forEach((item, index) => {
    checkPageBreak(60);
    
    // Timeline dot
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.circle(30, currentY + 10, 3, 'F');
    
    // Week label
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(item.week, 40, currentY + 8);
    
    // Title
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(item.title, 40, currentY + 18);
    
    // Description
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(item.description, pageWidth - 80);
    doc.text(lines, 40, currentY + 28);
    
    currentY += 45;
    
    // Timeline line (except for last item)
    if (index < timelineItems.length - 1) {
      doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.line(30, currentY - 35, 30, currentY - 10);
    }
  });
  
  currentY += 10;
  addSectionTitle('Ongoing Support');
  addBulletPoint('Dedicated account manager for enterprise clients');
  addBulletPoint('Monthly reporting and program optimization');
  addBulletPoint('24/7 technical support and customer service');
  addBulletPoint('Quarterly business reviews and strategy sessions');

  // Page 8 - Pricing
  doc.addPage();
  currentY = 30;
  
  addTitle('Pricing & Packages', 22);
  
  addSectionTitle('Corporate Seat - $99/month per employee');
  addParagraph('Complete workplace wellness platform access including:');
  addBulletPoint('On-site mobile phlebotomy services');
  addBulletPoint('Executive health screenings');
  addBulletPoint('Corporate health dashboards');
  addBulletPoint('Monthly reporting and analytics');
  addBulletPoint('HIPAA-compliant platform');
  
  currentY += 10;
  addSectionTitle('Executive Health Program - $99 + $29/month per executive');
  addParagraph('Premium services for leadership teams including all Corporate Seat features plus:');
  addBulletPoint('Priority same-day scheduling');
  addBulletPoint('Executive health assessments');
  addBulletPoint('Dedicated account manager');
  addBulletPoint('Enhanced reporting dashboard');
  addBulletPoint('Weekend and evening availability');
  
  currentY += 10;
  addSectionTitle('Enterprise Solutions');
  addParagraph('Custom packages available for organizations with 100+ employees, including volume discounts and tailored wellness programs. Contact our enterprise sales team for a customized proposal.');

  // Page 9 - Success Stories
  doc.addPage();
  currentY = 30;
  
  addTitle('Success Stories', 22);
  
  const testimonials = [
    {
      company: 'Orlando Technology Company',
      size: '250 Employees',
      quote: 'We saw a 35% reduction in sick days within 6 months. The mobile service eliminated the need for employees to take time off for routine health screenings.',
      author: 'HR Director'
    },
    {
      company: 'Central Florida Bank',
      size: '150 Employees', 
      quote: 'The monthly reports helped us identify health trends early. Our healthcare costs dropped by 22% year-over-year thanks to preventive interventions.',
      author: 'Benefits Manager'
    },
    {
      company: 'Premier Manufacturing',
      size: '400 Employees',
      quote: 'Employee satisfaction with our benefits package increased dramatically. The convenience factor cannot be overstated.',
      author: 'CEO'
    }
  ];
  
  testimonials.forEach(testimonial => {
    checkPageBreak(80);
    
    // Company box
    doc.setFillColor(248, 249, 250);
    doc.rect(20, currentY, pageWidth - 40, 60, 'F');
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.5);
    doc.rect(20, currentY, pageWidth - 40, 60);
    
    // Company name and size
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(testimonial.company, 30, currentY + 15);
    
    doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.setFontSize(10);
    doc.text(testimonial.size, 30, currentY + 25);
    
    // Quote
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'italic');
    const quoteLines = doc.splitTextToSize(`"${testimonial.quote}"`, pageWidth - 80);
    doc.text(quoteLines, 30, currentY + 35);
    
    // Author
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`- ${testimonial.author}`, 30, currentY + 52);
    
    currentY += 75;
  });

  // Page 10 - Getting Started
  doc.addPage();
  currentY = 30;
  
  addTitle('Getting Started', 22);
  
  addSectionTitle('Ready to Transform Your Corporate Wellness?');
  addParagraph('Join 500+ companies that have revolutionized their employee wellness programs with ConveLabs. Our team is ready to help you implement a program that delivers real results.');
  
  addSectionTitle('Next Steps:');
  addBulletPoint('Schedule a corporate demo to see our platform in action');
  addBulletPoint('Receive a customized proposal based on your company size');
  addBulletPoint('Review implementation timeline and support options');
  addBulletPoint('Begin your 30-day launch process');
  
  currentY += 20;
  addSectionTitle('Contact Information');
  
  // Contact box
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(20, currentY, pageWidth - 40, 50, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ConveLabs Corporate Solutions', pageWidth / 2, currentY + 15, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Phone: (941) 527-9169', pageWidth / 2, currentY + 25, { align: 'center' });
  doc.text('Email: corporate@convelabs.com', pageWidth / 2, currentY + 32, { align: 'center' });
  doc.text('Web: www.convelabs.com/corporate', pageWidth / 2, currentY + 39, { align: 'center' });
  
  currentY += 60;
  
  doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setFontSize(10);
  doc.text('Orlando, Florida | HIPAA Compliant | Enterprise Security', pageWidth / 2, currentY, { align: 'center' });

  // Add page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (i > 1) { // Skip page number on cover
      doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
      doc.setFontSize(10);
      doc.text(`${i}`, pageWidth - 20, pageHeight - 10, { align: 'right' });
    }
  }

  // Save the PDF
  doc.save('ConveLabs-Corporate-Wellness-Guide.pdf');
};
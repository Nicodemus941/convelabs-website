import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { industryContent } from '@/data/b2bContent';
import { PartnershipFormData } from '@/types/b2bTypes';
import { Calendar, Download, MessageSquare, CheckCircle } from 'lucide-react';
import { generatePartnershipGuide } from '@/utils/generatePartnershipGuide';

const partnershipFormSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  industry: z.enum(['healthcare', 'talent', 'sports', 'corporate']),
  contactName: z.string().min(2, 'Contact name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  partnershipType: z.string().min(1, 'Partnership type is required'),
  estimatedVolume: z.number().min(1, 'Volume estimate is required'),
  message: z.string().optional(),
});

const PartnershipCTA: React.FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const form = useForm<PartnershipFormData>({
    resolver: zodResolver(partnershipFormSchema),
    defaultValues: {
      industry: 'healthcare',
      companyName: '',
      contactName: '',
      email: '',
      phone: '',
      partnershipType: '',
      estimatedVolume: 0,
      message: '',
    },
  });

  const onSubmit = async (data: PartnershipFormData) => {
    try {
      // Here you would normally submit to your backend
      console.log('Partnership form submitted:', data);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setIsSubmitted(true);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const handleDownloadGuide = async () => {
    setIsDownloading(true);
    try {
      await generatePartnershipGuide();
    } catch (error) {
      console.error('Error generating partnership guide:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isSubmitted) {
    return (
      <section className="py-20 bg-gradient-to-br from-conve-red to-purple-700">
        <div className="container mx-auto px-4">
          <motion.div
            className="max-w-2xl mx-auto text-center text-white"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <CheckCircle className="w-24 h-24 mx-auto mb-6 text-conve-gold" />
            <h2 className="text-4xl font-bold mb-6">Thank You!</h2>
            <p className="text-xl mb-8">
              We've received your partnership inquiry. Our team will contact you within 24 hours to discuss your custom partnership proposal.
            </p>
            <div className="bg-white/10 p-6 rounded-2xl">
              <h3 className="text-xl font-semibold mb-4">What Happens Next?</h3>
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-conve-gold rounded-full" />
                  <span>Partnership specialist will review your submission</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-conve-gold rounded-full" />
                  <span>Custom ROI analysis and proposal preparation</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-conve-gold rounded-full" />
                  <span>Detailed partnership discussion scheduled</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 bg-gradient-to-br from-conve-red to-purple-700">
      <div className="container mx-auto px-4">
        <motion.div
          className="text-center mb-16 text-white"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Start Your Partnership Today
          </h2>
          <p className="text-xl max-w-3xl mx-auto">
            Join hundreds of organizations already transforming their operations with ConveLabs. Get your custom partnership proposal in 24 hours.
          </p>
        </motion.div>

        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <motion.div
              className="bg-white rounded-3xl p-8 shadow-luxury"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              <h3 className="text-2xl font-bold text-gray-800 mb-6">
                Get Your Custom Partnership Proposal
              </h3>
              
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      {...form.register('companyName')}
                      placeholder="Your Company"
                      className="luxury-input"
                    />
                    {form.formState.errors.companyName && (
                      <p className="text-red-500 text-sm mt-1">
                        {form.formState.errors.companyName.message}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="industry">Industry *</Label>
                    <Select 
                      value={form.watch('industry')} 
                      onValueChange={(value) => form.setValue('industry', value as any)}
                    >
                      <SelectTrigger className="luxury-input">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(industryContent).map(([key, content]) => (
                          <SelectItem key={key} value={key}>
                            {content.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactName">Contact Name *</Label>
                    <Input
                      id="contactName"
                      {...form.register('contactName')}
                      placeholder="Your Name"
                      className="luxury-input"
                    />
                    {form.formState.errors.contactName && (
                      <p className="text-red-500 text-sm mt-1">
                        {form.formState.errors.contactName.message}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      {...form.register('email')}
                      placeholder="your@email.com"
                      className="luxury-input"
                    />
                    {form.formState.errors.email && (
                      <p className="text-red-500 text-sm mt-1">
                        {form.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      {...form.register('phone')}
                      placeholder="(555) 123-4567"
                      className="luxury-input"
                    />
                    {form.formState.errors.phone && (
                      <p className="text-red-500 text-sm mt-1">
                        {form.formState.errors.phone.message}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="estimatedVolume">Estimated Monthly Volume *</Label>
                    <Input
                      id="estimatedVolume"
                      type="number"
                      {...form.register('estimatedVolume', { valueAsNumber: true })}
                      placeholder="e.g., 100"
                      className="luxury-input"
                    />
                    {form.formState.errors.estimatedVolume && (
                      <p className="text-red-500 text-sm mt-1">
                        {form.formState.errors.estimatedVolume.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="partnershipType">Partnership Interest *</Label>
                  <Select 
                    onValueChange={(value) => form.setValue('partnershipType', value)}
                  >
                    <SelectTrigger className="luxury-input">
                      <SelectValue placeholder="Select partnership type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue-share">Revenue Share Partnership</SelectItem>
                      <SelectItem value="white-label">White Label Services</SelectItem>
                      <SelectItem value="exclusive">Exclusive Territory Partnership</SelectItem>
                      <SelectItem value="consulting">Consulting Partnership</SelectItem>
                      <SelectItem value="custom">Custom Partnership</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="message">Additional Information</Label>
                  <Textarea
                    id="message"
                    {...form.register('message')}
                    placeholder="Tell us about your specific needs and goals..."
                    rows={4}
                    className="luxury-input"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-conve-red hover:bg-conve-red-dark text-white py-4 h-auto text-lg font-semibold shadow-luxury-red"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? 'Submitting...' : 'Get My Partnership Proposal'}
                </Button>
              </form>
            </motion.div>

            {/* CTA Options */}
            <motion.div
              className="space-y-8"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-white">
                <Calendar className="w-12 h-12 mb-4 text-conve-gold" />
                <h3 className="text-2xl font-bold mb-4">Schedule a Partnership Discussion</h3>
                <p className="text-lg mb-6 opacity-90">
                  Book a 30-minute consultation with our partnership team to discuss your specific needs and explore custom solutions.
                </p>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-gray-900 font-semibold"
                >
                  Schedule Consultation
                </Button>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-white">
                <Download className="w-12 h-12 mb-4 text-conve-gold" />
                <h3 className="text-2xl font-bold mb-4">Partnership Guide</h3>
                <p className="text-lg mb-6 opacity-90">
                  Download our comprehensive partnership guide with detailed information about our programs, benefits, and success stories.
                </p>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={handleDownloadGuide}
                  disabled={isDownloading}
                  className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-gray-900 font-semibold"
                >
                  {isDownloading ? 'Generating...' : 'Download Guide'}
                </Button>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-white">
                <MessageSquare className="w-12 h-12 mb-4 text-conve-gold" />
                <h3 className="text-2xl font-bold mb-4">Have Questions?</h3>
                <p className="text-lg mb-6 opacity-90">
                  Our partnership team is available to answer any questions about our programs, implementation, and support.
                </p>
                <div className="space-y-2">
                  <p><strong>Phone:</strong> (555) 123-4567</p>
                  <p><strong>Email:</strong> partnerships@convelabs.com</p>
                  <p><strong>Hours:</strong> Mon-Fri 8AM-6PM EST</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PartnershipCTA;
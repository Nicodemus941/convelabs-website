import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle, Calendar, Clock, Gift, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';

/**
 * RESCHEDULE CONFIRMED / DECLINED — the thank-you pages reached after
 * a patient completes the /reschedule/:token flow.
 */

export const RescheduleConfirmed: React.FC = () => {
  const [params] = useSearchParams();
  const date = params.get('date') || '';
  const time = params.get('time') || '';

  const displayDate = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <>
      <Helmet><title>You're All Set | ConveLabs</title></Helmet>
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-xl">
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-lg">
          <CardContent className="p-8 md:p-10 text-center">
            <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-12 w-12 text-emerald-600" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">You're all set 🎉</h1>
            <p className="text-lg text-muted-foreground mb-8">
              Thanks for being patient with us. Your new appointment is confirmed:
            </p>

            {displayDate && time && (
              <div className="bg-white border-2 border-emerald-200 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-center gap-2 text-gray-600 mb-2">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">{displayDate}</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-conve-red text-xl font-bold">
                  <Clock className="h-5 w-5" />
                  {time}
                </div>
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6 flex items-start gap-3 text-left">
              <Gift className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900 text-sm">$25 apology credit applied</p>
                <p className="text-xs text-emerald-700 mt-0.5">Auto-applies to your next visit — no code needed.</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              A confirmation email + text are on their way. We'll see you then.
            </p>

            <Link to="/">
              <Button className="bg-conve-red hover:bg-conve-red-dark text-white gap-2">
                Back to ConveLabs
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
};

export const RescheduleDeclined: React.FC = () => {
  return (
    <>
      <Helmet><title>We'll Call You | ConveLabs</title></Helmet>
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-xl">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-lg">
          <CardContent className="p-8 md:p-10 text-center">
            <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">📞</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">We'll call you shortly</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Got it — none of those times worked. A team member will reach out within the hour to find a time that does.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Your <strong className="text-gray-900">$25 apology credit</strong> is still on your account and will apply to whatever time we land on.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Prefer to call us directly?
            </p>
            <a href="tel:+19415279169">
              <Button className="bg-conve-red hover:bg-conve-red-dark text-white mb-3">
                Call (941) 527-9169
              </Button>
            </a>
            <div className="mt-4">
              <Link to="/" className="text-sm text-muted-foreground hover:text-conve-red underline">
                Back to ConveLabs
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
};

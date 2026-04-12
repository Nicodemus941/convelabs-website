import React from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MapPin, Clock, User, CheckCircle, Truck, FlaskConical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTrackingRealtime } from '@/hooks/useTrackingRealtime';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-800', icon: <Clock className="h-4 w-4" /> },
  en_route: { label: 'On the Way', color: 'bg-orange-100 text-orange-800', icon: <Truck className="h-4 w-4" /> },
  arrived: { label: 'Arrived', color: 'bg-green-100 text-green-800', icon: <MapPin className="h-4 w-4" /> },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-800', icon: <FlaskConical className="h-4 w-4" /> },
  specimens_delivered: { label: 'Specimens Delivered', color: 'bg-teal-100 text-teal-800', icon: <CheckCircle className="h-4 w-4" /> },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-800', icon: <CheckCircle className="h-4 w-4" /> },
};

const TrackAppointment: React.FC = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const tracking = useTrackingRealtime(appointmentId || '');

  if (!appointmentId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Invalid tracking link.</p>
      </div>
    );
  }

  if (tracking.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tracking.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{tracking.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[tracking.appointmentStatus] || STATUS_CONFIG.scheduled;

  return (
    <>
      <Helmet>
        <title>Track Your Appointment - ConveLabs</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      </Helmet>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-conve-red text-white p-4 text-center">
          <h1 className="text-lg font-bold">ConveLabs</h1>
          <p className="text-sm opacity-90">Appointment Tracking</p>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Status badge */}
          <div className="flex items-center justify-center">
            <Badge className={`${statusConfig.color} text-sm px-4 py-2 gap-2`}>
              {statusConfig.icon}
              {statusConfig.label}
            </Badge>
          </div>

          {/* ETA */}
          {tracking.appointmentStatus === 'en_route' && tracking.eta && (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-4xl font-bold text-conve-red">{tracking.eta} min</p>
                <p className="text-muted-foreground mt-1">Estimated arrival</p>
              </CardContent>
            </Card>
          )}

          {/* Phlebotomist info */}
          {tracking.phlebotomistName && (
            <Card>
              <CardContent className="py-4 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {tracking.phlebotomistPhoto ? (
                    <img src={tracking.phlebotomistPhoto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{tracking.phlebotomistName}</p>
                  <p className="text-sm text-muted-foreground">Your Phlebotomist</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Specimen delivery info */}
          {tracking.specimenLabName && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900">Specimens Delivered</p>
                    <p className="text-sm text-green-700 mt-1">
                      Your samples were delivered to <strong>{tracking.specimenLabName}</strong>.
                    </p>
                    {tracking.specimenTrackingId && (
                      <p className="text-sm text-green-700 mt-1">
                        Lab ID: <strong className="font-mono">{tracking.specimenTrackingId}</strong>
                      </p>
                    )}
                    <p className="text-xs text-green-600 mt-2">
                      Use this ID to track your samples if you don't see them in your portal.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status timeline */}
          <Card>
            <CardContent className="py-4">
              <h3 className="font-medium mb-3 text-sm">Appointment Progress</h3>
              <div className="space-y-3">
                {['scheduled', 'en_route', 'arrived', 'in_progress', 'specimens_delivered', 'completed'].map((status, index) => {
                  const config = STATUS_CONFIG[status];
                  const statusOrder = ['scheduled', 'en_route', 'arrived', 'in_progress', 'specimens_delivered', 'completed'];
                  const currentIndex = statusOrder.indexOf(tracking.appointmentStatus);
                  const isActive = index <= currentIndex;

                  return (
                    <div key={status} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        isActive ? 'bg-conve-red text-white' : 'bg-muted text-muted-foreground'
                      }`}>
                        {isActive ? <CheckCircle className="h-3.5 w-3.5" /> : <span className="text-xs">{index + 1}</span>}
                      </div>
                      <span className={`text-sm ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                        {config.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Thank you for choosing ConveLabs
          </p>
        </div>
      </div>
    </>
  );
};

export default TrackAppointment;

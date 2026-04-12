import React from "react";
import { membershipPlans } from "@/components/onboarding/plans/PlansData";
import { Check, Star, ArrowRight } from "lucide-react";
import { ENROLLMENT_URL, withSource } from "@/lib/constants/urls";

export const PricingIndividualTab = () => {
  return (
    <div className="container mx-auto max-w-7xl px-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {membershipPlans.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl border p-6 flex flex-col ${
              plan.isBestValue
                ? "border-primary shadow-lg ring-2 ring-primary/20"
                : "border-border shadow-sm"
            }`}
          >
            {plan.isBestValue && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
                <Star className="h-3 w-3" /> Most Popular
              </div>
            )}

            <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">{plan.description}</p>

            <div className="mb-6">
              {plan.annualOnly ? (
                <div>
                  <span className="text-3xl font-bold text-foreground">${plan.annualPrice}</span>
                  <span className="text-muted-foreground">/year</span>
                </div>
              ) : plan.isB2B ? (
                <div>
                  <span className="text-3xl font-bold text-foreground">${plan.monthlyPrice}</span>
                  <span className="text-muted-foreground">/patient/mo</span>
                </div>
              ) : (
                <div>
                  <span className="text-3xl font-bold text-foreground">${plan.monthlyPrice}</span>
                  <span className="text-muted-foreground">/month</span>
                  <p className="text-sm text-muted-foreground">
                    or ${plan.annualPrice}/year (save {Math.round((1 - plan.annualPrice / (plan.monthlyPrice * 12)) * 100)}%)
                  </p>
                </div>
              )}
            </div>

            <ul className="space-y-3 flex-grow mb-6">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href={plan.isB2B ? "/contact" : withSource(ENROLLMENT_URL, `pricing_${plan.id}`)}
              className={`mt-auto inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                plan.isBestValue
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {plan.isB2B ? "Contact Us" : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

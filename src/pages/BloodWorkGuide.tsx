import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { CheckCircle, ArrowRight } from 'lucide-react';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { Button } from '@/components/ui/button';

/**
 * BLOOD WORK GUIDE — The "Understanding Your Blood Work Results" content
 *
 * This is the payoff for the lead capture. Visitors who signed up for
 * the 10%-off + free guide land here after clicking the link in their
 * welcome email. SEO-friendly long-form content that also ranks for
 * informational searches and converts readers with inline CTAs.
 */

const BloodWorkGuide: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Understanding Your Blood Work Results | ConveLabs Guide</title>
        <meta
          name="description"
          content="What every line on your blood work report actually means — from CBC to metabolic panel to cholesterol. A plain-English guide from the mobile phlebotomy service trusted by NFL athletes."
        />
        <link rel="canonical" href="https://convelabs.com/blood-work-guide" />
      </Helmet>

      <div className="min-h-screen bg-white">
        <Header />

        <main className="container mx-auto px-4 py-12 md:py-16 max-w-3xl">
          <article className="prose prose-lg max-w-none">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-conve-red mb-2">
              Free Guide · 12 min read
            </p>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
              Understanding Your Blood Work Results
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed">
              What every line on your lab report actually means — and the 5 numbers
              most doctors don't explain to you.
            </p>

            <div className="bg-gradient-to-br from-conve-red/5 to-red-50 border border-red-200 rounded-xl p-5 mb-10 not-prose">
              <p className="text-sm text-gray-700 mb-0">
                <strong>Written by Nico Jean-Baptiste</strong>, Licensed Phlebotomist & Founder of ConveLabs —
                the mobile blood draw service trusted by NFL athletes, fitness
                influencers, and 500+ Central Florida patients.
              </p>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold mt-10 mb-4">Why This Guide Exists</h2>
            <p>
              If you're like most people, you leave the doctor's office with a blood work
              report in hand and no idea what any of it means. "Everything looks normal"
              is what you hear — but <em>normal for whom?</em> "Reference ranges" on lab
              reports are based on population averages, not your personal optimum.
            </p>
            <p>
              This guide breaks down what every line on a standard blood work report
              actually measures, what "normal" really means, and the five numbers your
              doctor probably didn't highlight but you should care about.
            </p>

            <h2 className="text-2xl md:text-3xl font-bold mt-10 mb-4">1. Complete Blood Count (CBC)</h2>
            <p>
              The CBC is the foundation panel. It counts and measures the cells in your blood:
            </p>
            <ul>
              <li><strong>Red Blood Cells (RBC)</strong> — carry oxygen. Low = anemia. High = dehydration or lung issues.</li>
              <li><strong>Hemoglobin (Hgb)</strong> — the protein in RBCs that binds oxygen. Women: 12–16 g/dL. Men: 14–18 g/dL.</li>
              <li><strong>Hematocrit (Hct)</strong> — percentage of your blood that's RBCs. Roughly 3× hemoglobin.</li>
              <li><strong>White Blood Cells (WBC)</strong> — your immune army. High = infection or inflammation. Low = immune suppression.</li>
              <li><strong>Platelets</strong> — clotting cells. Low = bleeding risk. High = clot risk.</li>
            </ul>

            <h2 className="text-2xl md:text-3xl font-bold mt-10 mb-4">2. Comprehensive Metabolic Panel (CMP)</h2>
            <p>Measures kidney, liver, blood sugar, and electrolyte function:</p>
            <ul>
              <li><strong>Glucose</strong> — blood sugar. Fasting should be under 100 mg/dL. 100–125 = pre-diabetes. 126+ = diabetes.</li>
              <li><strong>BUN and Creatinine</strong> — kidney function. Elevated = dehydration or kidney issue.</li>
              <li><strong>eGFR</strong> — estimated kidney filtration rate. Want above 90.</li>
              <li><strong>ALT and AST</strong> — liver enzymes. High = liver stress (alcohol, medication, fatty liver, hepatitis).</li>
              <li><strong>Sodium, Potassium, Calcium</strong> — electrolytes. Off balance = hydration or kidney issues.</li>
              <li><strong>Albumin and Total Protein</strong> — nutritional markers. Low = malnutrition or inflammation.</li>
            </ul>

            <h2 className="text-2xl md:text-3xl font-bold mt-10 mb-4">3. Lipid Panel (Cholesterol)</h2>
            <p>
              The real story isn't total cholesterol — it's the <em>ratios</em>:
            </p>
            <ul>
              <li><strong>Total Cholesterol</strong> — under 200 mg/dL is the textbook number.</li>
              <li><strong>HDL (good)</strong> — above 60 is protective. Below 40 (men) or 50 (women) is a risk.</li>
              <li><strong>LDL (bad)</strong> — under 100 ideal. Under 70 if you have heart disease risk.</li>
              <li><strong>Triglycerides</strong> — under 150 ideal. Often rises with carbs + alcohol.</li>
              <li><strong>Total / HDL ratio</strong> — the number most doctors skip. Under 3.5 is excellent.</li>
            </ul>

            <h2 className="text-2xl md:text-3xl font-bold mt-10 mb-4">4. The 5 Numbers Most Doctors Don't Explain</h2>
            <p>These are the "hidden" markers that can quietly predict future disease:</p>
            <ol>
              <li>
                <strong>HbA1c (Hemoglobin A1c)</strong> — your 3-month average blood sugar.
                Under 5.7% is normal. 5.7–6.4% is pre-diabetic. Over 6.5% is diabetic.
                Most doctors don't order it unless they suspect diabetes. Ask for it.
              </li>
              <li>
                <strong>Fasting Insulin</strong> — tells you if you're insulin resistant
                <em>before</em> blood sugar gets high. Should be under 10 μIU/mL. Ideal is 2–6.
              </li>
              <li>
                <strong>hs-CRP (High-Sensitivity C-Reactive Protein)</strong> — inflammation
                marker. Under 1.0 mg/L is low risk. Over 3.0 = high cardiovascular risk.
              </li>
              <li>
                <strong>Vitamin D (25-OH)</strong> — most Americans are deficient. Want 40–80 ng/mL.
                Under 30 is low. Low D is linked to almost every chronic disease.
              </li>
              <li>
                <strong>TSH + Free T3 + Free T4</strong> — thyroid function.
                Doctors often only order TSH. A "normal" TSH with low free T3 can still
                mean you feel exhausted. Ask for the full panel.
              </li>
            </ol>

            <h2 className="text-2xl md:text-3xl font-bold mt-10 mb-4">5. How Often Should You Get Blood Work Done?</h2>
            <p>General guidance from the American Academy of Family Physicians:</p>
            <ul>
              <li><strong>Once a year</strong> for healthy adults under 40 with no known issues</li>
              <li><strong>Every 6 months</strong> for adults 40+ or with any chronic condition</li>
              <li><strong>Every 3 months</strong> if you're actively optimizing (bloodwork-driven athletes, biohackers, TRT/HRT users)</li>
              <li><strong>Every 6 weeks</strong> if starting or adjusting medications that affect labs</li>
            </ul>

            <h2 className="text-2xl md:text-3xl font-bold mt-10 mb-4">6. Preparing for Your Draw</h2>
            <ul>
              <li><strong>Fast 8–12 hours</strong> if glucose, lipids, or metabolic panel are ordered (water is fine — and encouraged)</li>
              <li><strong>Hydrate well</strong> the night before and morning of — makes vein access easier and less painful</li>
              <li><strong>Avoid alcohol 24 hours prior</strong> — skews liver enzymes and triglycerides</li>
              <li><strong>Take medications as usual</strong> unless your doctor specifies otherwise</li>
              <li><strong>Morning is best</strong> — many markers have diurnal variation</li>
            </ul>

            <div className="bg-gradient-to-br from-conve-red/5 to-red-50 border-l-4 border-conve-red rounded-lg p-6 mt-12 not-prose">
              <p className="text-sm font-semibold uppercase tracking-wider text-conve-red mb-2">
                Ready to draw?
              </p>
              <h3 className="text-2xl font-bold mb-2">
                Skip the lab — we come to you.
              </h3>
              <p className="text-gray-700 mb-5">
                One-try blood draws at your home in 60 minutes. On-time or your visit is free.
                Use code <strong className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200">WELCOME10</strong> for $15 off.
              </p>
              <Link to="/?ref=WELCOME10">
                <Button size="lg" className="bg-conve-red hover:bg-conve-red-dark text-white font-semibold rounded-xl">
                  Book My Home Visit
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <p className="text-xs text-gray-500 mt-4 flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-emerald-600" />
                Trusted by NFL athletes · 5.0 ⭐ (164 Google reviews)
              </p>
            </div>

            <div className="mt-16 pt-8 border-t border-gray-200 text-sm text-gray-500">
              <p>
                <strong>Medical Disclaimer:</strong> This guide is general educational content
                and does not constitute medical advice. Always discuss your specific lab results
                with a licensed healthcare provider. Reference ranges vary by lab; this guide
                uses commonly accepted US adult ranges from AAFP, AHA, and ADA guidelines.
              </p>
            </div>
          </article>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default BloodWorkGuide;

import { Link } from 'react-router-dom';
import { HeroSection } from '@/components/ui/hero-section-1';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ProcessBeamSection from '@/components/home/process-beam-section';
import EMICalculatorSection from '@/components/home/EMICalculatorSection';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileCheck2,
  GitBranch,
  Search,
} from 'lucide-react';

const painPoints = [
  {
    icon: Search,
    title: 'Hard to Compare Schemes',
    desc: 'Loan rates, collateral rules, and eligibility criteria differ by bank and are difficult to compare manually.',
  },
  {
    icon: CircleHelp,
    title: 'Unclear Approval Chances',
    desc: 'Many applicants submit without knowing if they are likely to be approved.',
  },
  {
    icon: Clock3,
    title: 'Slow, Repetitive Process',
    desc: 'Applicants often repeat the same checks and rework documents across multiple banks.',
  },
  {
    icon: FileCheck2,
    title: 'Document Gaps',
    desc: 'Missing files or inconsistencies can delay decisions and reduce approval confidence.',
  },
  {
    icon: GitBranch,
    title: 'No Single Workflow',
    desc: 'SMEs need one place to compare, estimate, prepare, and track progress end-to-end.',
  },
];

const platformBenefits = [
  { icon: Search, title: 'Compare banks in one place' },
  { icon: CheckCircle2, title: 'Check readiness before applying' },
  { icon: FileCheck2, title: 'Prepare documents with clarity' },
  { icon: Clock3, title: 'Track loan progress after submission' },
];

const studyFocus = [
  { label: 'Target Users', value: 'Sri Lankan SME Owners' },
  { label: 'Platform Type', value: 'Web-based Decision Support' },
  { label: 'Predictive Layer', value: 'ML/DL Approval Estimation' },
];

const sectors = ['Retail', 'Services', 'Manufacturing', 'Agriculture', 'Trade'];

const journeySteps = [
  {
    step: 'Step 1',
    title: 'Share Business Details',
    desc: 'Enter your SME profile, loan amount, and purpose in a guided flow.',
  },
  {
    step: 'Step 2',
    title: 'Get Smart Recommendations',
    desc: 'Review eligible bank options, estimated EMI, and predicted approval confidence.',
  },
  {
    step: 'Step 3',
    title: 'Submit with Confidence',
    desc: 'Upload required documents and track progress using one connected workspace.',
  },
];

export default function Index() {
  return (
    <div className='min-h-screen overflow-x-clip bg-background text-foreground'>
      <HeroSection />

      <main className='px-2 md:px-6'>
        <section className='border-y border-border/70 bg-muted/35'>
          <div className='container px-2 py-10 sm:py-14 md:px-0'>
            <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'>
              <div className='max-w-3xl'>
                <p className='inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'>
                  Built for Sri Lankan SMEs
                </p>
                <h2 className='mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl'>
                  Find the Right Loan Faster
                </h2>
                <p className='mt-4 text-base text-muted-foreground sm:text-lg'>
                  LonaFlow brings loan comparison, EMI estimation, approval prediction, and document preparation into one simple experience.
                </p>

                <div className='mt-6 grid gap-3 sm:grid-cols-2'>
                  {platformBenefits.map((item) => (
                    <div
                      key={item.title}
                      className='flex items-center gap-3 rounded-xl border border-border/80 bg-card px-4 py-3'
                    >
                      <item.icon className='h-4 w-4 text-primary' />
                      <p className='text-sm font-medium text-foreground'>{item.title}</p>
                    </div>
                  ))}
                </div>

                <div className='mt-7 flex flex-col gap-3 sm:flex-row'>
                  <Button size='lg' asChild className='w-full sm:w-auto'>
                    <Link to='/signup'>
                      Get Started
                      <ArrowRight className='ml-2 h-4 w-4' />
                    </Link>
                  </Button>
                  <Button size='lg' variant='outline' asChild className='w-full sm:w-auto'>
                    <Link to='/login'>I Already Have an Account</Link>
                  </Button>
                </div>
              </div>

              <div className='rounded-2xl border border-border bg-card p-5 shadow-sm'>
                <p className='text-sm font-semibold text-foreground'>Study Focus</p>
                <div className='mt-4 space-y-3'>
                  {studyFocus.map((item) => (
                    <div
                      key={item.label}
                      className='rounded-lg border border-border/80 bg-muted/35 px-4 py-3'
                    >
                      <p className='text-xs font-medium text-muted-foreground'>{item.label}</p>
                      <p className='mt-1 text-sm font-semibold text-foreground'>{item.value}</p>
                    </div>
                  ))}
                </div>

                <p className='mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground'>
                  SME Sectors Covered
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {sectors.map((sector) => (
                    <span
                      key={sector}
                      className='rounded-full border border-border bg-muted/35 px-3 py-1.5 text-xs font-medium text-foreground'
                    >
                      {sector}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <ProcessBeamSection />

        <section id='features' className='py-16 sm:py-20'>
          <div className='container space-y-10 px-2 md:px-0'>
            <div className='max-w-4xl'>
              <h2 className='text-3xl font-bold sm:text-4xl'>Why This Platform Matters</h2>
              <p className='mt-3 text-base text-muted-foreground sm:text-lg'>
                SME financing can be complex. LonaFlow is designed to reduce confusion, shorten decision time, and improve application quality.
              </p>
            </div>

            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
              {painPoints.map((feature) => (
                <Card key={feature.title} className='border-border/80'>
                  <CardContent className='space-y-4 p-6'>
                    <div className='flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/45 text-foreground'>
                      <feature.icon className='h-5 w-5' />
                    </div>
                    <h3 className='text-lg font-semibold text-foreground'>{feature.title}</h3>
                    <p className='text-sm leading-relaxed text-muted-foreground'>{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className='rounded-2xl border border-border bg-card p-6 sm:p-8'>
              <h3 className='text-xl font-semibold text-foreground sm:text-2xl'>Simple 3-Step Journey</h3>
              <div className='mt-6 grid gap-4 md:grid-cols-3'>
                {journeySteps.map((item) => (
                  <div key={item.step} className='rounded-xl border border-border/80 bg-muted/30 p-4'>
                    <p className='text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'>
                      {item.step}
                    </p>
                    <p className='mt-2 text-base font-semibold text-foreground'>{item.title}</p>
                    <p className='mt-2 text-sm text-muted-foreground'>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <EMICalculatorSection />

        <section className='pb-16 pt-16'>
          <div className='container px-2 md:px-0'>
            <div className='rounded-2xl border border-border bg-card p-8 text-center sm:p-10'>
              <h3 className='text-2xl font-bold text-foreground sm:text-3xl'>Ready to Start Your Loan Plan?</h3>
              <p className='mx-auto mt-3 max-w-2xl text-base text-muted-foreground'>
                Create an account to compare banks, calculate EMI, and prepare a stronger SME loan application.
              </p>
              <div className='mt-7 flex flex-col justify-center gap-3 sm:flex-row'>
                <Button asChild className='w-full sm:w-auto'>
                  <Link to='/signup'>Create Account</Link>
                </Button>
                <Button variant='outline' asChild className='w-full sm:w-auto'>
                  <Link to='/login'>Login</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className='border-t border-border/70 bg-muted/20 px-2 py-10 md:px-6'>
        <div className='container flex flex-col gap-6 px-2 sm:flex-row sm:items-center sm:justify-between md:px-0'>
          <Link to='/' className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-foreground'>
              <Building2 className='h-4 w-4' />
            </div>
            <span className='font-semibold text-foreground'>LonaFlow</span>
          </Link>
          <div className='flex flex-wrap items-center gap-4 text-sm text-muted-foreground'>
            <span className='inline-flex items-center gap-2'>
              <CheckCircle2 className='h-4 w-4 text-success' />
              Secure processing
            </span>
            <span>Support: info@lonaflow.lk</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

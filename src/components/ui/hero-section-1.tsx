import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Building2,
  ChevronRight,
  Factory,
  Handshake,
  Landmark,
  Menu,
  Rocket,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedGroup } from '@/components/ui/animated-group';
import { cn } from '@/lib/utils';
import heroMain from '@/assets/hero.png';
import logo from '@/assets/logo.png';

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      filter: 'blur(12px)',
      y: 12,
    },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        type: 'spring' as const,
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
};

const partnerIcons = [
  { name: 'Banking', Icon: Landmark },
  { name: 'SME Growth', Icon: Rocket },
  { name: 'Retail', Icon: Store },
  { name: 'Manufacturing', Icon: Factory },
  { name: 'Advisory', Icon: Handshake },
  { name: 'Trust & Risk', Icon: ShieldCheck },
  { name: 'Business Ops', Icon: Building2 },
  { name: 'Finance', Icon: Banknote },
];
export function HeroSection() {
  return (
    <>
      <HeroHeader />
      <section className='overflow-x-clip'>
        <div
          aria-hidden
          className='z-[2] absolute inset-0 pointer-events-none isolate hidden opacity-50 contain-strict lg:block'
        >
          <div className='absolute left-0 top-0 h-[80rem] w-[35rem] -translate-y-[350px] -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]' />
          <div className='absolute left-0 top-0 h-[80rem] w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]' />
          <div className='absolute left-0 top-0 h-[80rem] w-56 -translate-y-[350px] -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]' />
        </div>

        <section>
          <div className='relative pt-20 sm:pt-24 md:pt-32'>
            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      delayChildren: 1,
                    },
                  },
                },
                item: {
                  hidden: {
                    opacity: 0,
                    y: 20,
                  },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      type: 'spring' as const,
                      bounce: 0.3,
                      duration: 2,
                    },
                  },
                },
              }}
              className='absolute inset-0 -z-20'
            >
              <img
                src={heroMain}
                alt='Background office scene'
                className='absolute inset-x-0 top-56 -z-20 hidden lg:top-32 dark:block'
                width='3276'
                height='4095'
                loading='lazy'
                decoding='async'
              />
            </AnimatedGroup>

            <div
              aria-hidden
              className='absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]'
            />

            <div className='mx-auto max-w-7xl px-4 sm:px-6'>
              <div className='text-center sm:mx-auto lg:mr-auto lg:mt-0'>
                <AnimatedGroup variants={transitionVariants}>
                  <a
                    href='#features'
                    className='group mx-auto flex w-fit items-center gap-3 rounded-full border bg-muted p-1 pl-3.5 shadow-md shadow-black/5 transition-all duration-300 hover:bg-background dark:border-t-white/5 dark:shadow-zinc-950 dark:hover:border-t-border'
                  >
                    <span className='text-xs text-foreground sm:text-sm'>Built for Sri Lankan SMEs</span>
                    <span className='block h-4 w-0.5 border-l bg-white dark:border-background dark:bg-zinc-700' />

                    <div className='size-6 overflow-hidden rounded-full bg-background duration-500 group-hover:bg-muted'>
                      <div className='flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0'>
                        <span className='flex size-6'>
                          <ArrowRight className='m-auto size-3' />
                        </span>
                        <span className='flex size-6'>
                          <ArrowRight className='m-auto size-3' />
                        </span>
                      </div>
                    </div>
                  </a>

                  <h1 className='mx-auto mt-8 max-w-4xl text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:mt-14'>
                    Smarter SME Loan Decisions with LoanFlow
                  </h1>

                  <p className='mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg'>
                    Compare loans, estimate installments, improve application readiness, and track progress in one guided workflow.
                  </p>
                </AnimatedGroup>

                <AnimatedGroup
                  variants={{
                    container: {
                      visible: {
                        transition: {
                          staggerChildren: 0.05,
                          delayChildren: 0.75,
                        },
                      },
                    },
                    ...transitionVariants,
                  }}
                  className='mx-auto mt-10 flex w-full max-w-md flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row'
                >
                  <div key={1} className='w-full rounded-[14px] border border-border/80 bg-foreground/10 p-0.5 sm:w-auto'>
                    <Button asChild size='lg' className='w-full rounded-xl px-5 text-base sm:w-auto'>
                      <Link to='/signup'>
                        <span className='text-nowrap'>Create Free Account</span>
                      </Link>
                    </Button>
                  </div>

                  <Button key={2} asChild size='lg' variant='ghost' className='h-10.5 w-full rounded-xl px-5 sm:w-auto'>
                    <a href='#features'>
                      <span className='text-nowrap'>See Features</span>
                    </a>
                  </Button>
                </AnimatedGroup>
              </div>
            </div>

            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: 0.75,
                    },
                  },
                },
                ...transitionVariants,
              }}
            >
              <div className='relative mt-10 overflow-hidden px-2 sm:mt-12 md:mt-16'>
                <div
                  aria-hidden
                  className='absolute inset-0 z-10 bg-gradient-to-b from-transparent from-35% to-background'
                />
                <div className='relative mx-auto max-w-6xl overflow-hidden rounded-2xl border bg-background p-4 shadow-lg shadow-zinc-950/15 ring-1 ring-background inset-shadow-2xs dark:inset-shadow-white/20'>
                  <picture>
                    <source
                      media='(prefers-color-scheme: dark)'
                      srcSet={heroMain}
                    />
                    <img
                      className='relative z-2 aspect-[5/4] rounded-2xl border border-border/25 bg-background object-cover sm:aspect-[15/8]'
                      src={heroMain}
                      alt='Loan onboarding workflow'
                      width='2200'
                      height='1173'
                      fetchPriority='high'
                      decoding='async'
                    />
                  </picture>
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>

        <section id='partners' className='bg-background pb-16 pt-12 md:pb-28'>
          <div className='group relative m-auto max-w-5xl px-6'>
            <div className='absolute inset-0 z-10 hidden scale-95 items-center justify-center opacity-0 duration-500 group-hover:scale-100 group-hover:opacity-100 lg:flex'>
              <Link to='/results' className='block text-sm duration-150 hover:opacity-75'>
                <span>Explore loan results</span>
                <ChevronRight className='ml-1 inline-block size-3' />
              </Link>
            </div>

            <div className='mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-4 transition-all duration-500 group-hover:opacity-50 group-hover:blur-xs sm:mt-12 sm:grid-cols-4 sm:gap-6'>
              {partnerIcons.map(({ name, Icon }) => (
                <div
                  key={name}
                  className='flex flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-5'
                >
                  <Icon className='size-5 text-muted-foreground' />
                  <span className='text-center text-xs font-medium text-muted-foreground'>{name}</span>
                </div>
              ))}
            </div>

            <div className='mt-6 text-center lg:hidden'>
              <Link to='/results' className='inline-flex items-center text-sm text-muted-foreground duration-150 hover:text-foreground'>
                <span>Explore loan results</span>
                <ChevronRight className='ml-1 size-3' />
              </Link>
            </div>
          </div>
        </section>
      </section>
    </>
  );
}

const menuItems = [
  { name: 'Features', href: '#features' },
  { name: 'How it works', href: '#how-it-works' },
  { name: 'EMI Calculator', href: '#calculator' },
];

const HeroHeader = () => {
  const [menuState, setMenuState] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header>
      <nav data-state={menuState ? 'active' : 'inactive'} className='group fixed z-20 w-full px-2'>
        <div
          className={cn(
            'mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12',
            isScrolled && 'max-w-4xl rounded-2xl border bg-background/50 backdrop-blur-lg lg:px-5',
          )}
        >
          <div className='relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4'>
            <div className='flex w-full justify-between lg:w-auto'>
              <Link to='/' aria-label='home' className='flex items-center space-x-2'>
                <Logo />
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState ? 'Close Menu' : 'Open Menu'}
                className='relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden'
              >
                <Menu className='m-auto size-6 duration-200 group-data-[state=active]:scale-0 group-data-[state=active]:rotate-180 group-data-[state=active]:opacity-0' />
                <X className='absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200 group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100' />
              </button>
            </div>

            <div className='absolute inset-0 m-auto hidden size-fit lg:block'>
              <ul className='flex gap-8 text-sm'>
                {menuItems.map((item) => (
                  <li key={item.name}>
                    <a href={item.href} className='block text-muted-foreground duration-150 hover:text-accent-foreground'>
                      <span>{item.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className='mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border bg-background p-6 shadow-2xl shadow-zinc-300/20 group-data-[state=active]:block md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none lg:group-data-[state=active]:flex dark:shadow-none dark:lg:bg-transparent'>
              <div className='lg:hidden'>
                <ul className='space-y-6 text-base'>
                  {menuItems.map((item) => (
                    <li key={`${item.name}-mobile`}>
                      <a href={item.href} className='block text-muted-foreground duration-150 hover:text-accent-foreground'>
                        <span>{item.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className='flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit'>
                <Button asChild variant='outline' size='sm' className={cn(isScrolled && 'lg:hidden')}>
                  <Link to='/login'>
                    <span>Login</span>
                  </Link>
                </Button>

                <Button asChild size='sm' className={cn(isScrolled && 'lg:hidden')}>
                  <Link to='/signup'>
                    <span>Sign Up</span>
                  </Link>
                </Button>

                <Button asChild size='sm' className={cn(isScrolled ? 'lg:inline-flex' : 'hidden')}>
                  <Link to='/apply'>
                    <span>Get Started</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

const Logo = ({ className }: { className?: string }) => {
  return (
    <img src={logo} alt='LoanFlow' className={cn('h-8 w-auto object-contain', className)} />
  );
};

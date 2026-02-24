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
        type: 'spring',
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
                      type: 'spring',
                      bounce: 0.3,
                      duration: 2,
                    },
                  },
                },
              }}
              className='absolute inset-0 -z-20'
            >
              <img
                src='https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=3276&q=80'
                alt='Background office scene'
                className='absolute inset-x-0 top-56 -z-20 hidden lg:top-32 dark:block'
                width='3276'
                height='4095'
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
                    <span className='text-xs text-foreground sm:text-sm'>Introducing LonaFlow for Sri Lankan SMEs</span>
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

                  <h1 className='mx-auto mt-8 max-w-4xl text-balance text-4xl sm:text-5xl md:text-6xl lg:mt-14'>
                    Informed SME Loan Decisions with LonaFlow
                  </h1>

                  <p className='mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg'>
                    A proposed web platform for loan comparison, installment analysis, approval probability estimation, document readiness, and post-loan management.
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
                  <div key={1} className='w-full rounded-[14px] border bg-foreground/10 p-0.5 sm:w-auto'>
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
                  <img
                    className='relative hidden aspect-[5/4] rounded-2xl bg-background object-cover sm:aspect-[15/8] dark:block'
                    src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=2700&q=80'
                    alt='Loan dashboard screen'
                    width='2700'
                    height='1440'
                  />
                  <img
                    className='relative z-2 aspect-[5/4] rounded-2xl border border-border/25 object-cover sm:aspect-[15/8] dark:hidden'
                    src='https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=2700&q=80'
                    alt='Loan onboarding workflow'
                    width='2700'
                    height='1440'
                  />
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
    <svg viewBox='0 0 78 18' fill='none' xmlns='http://www.w3.org/2000/svg' className={cn('h-5 w-auto', className)}>
      <path
        d='M3 0H5V18H3V0ZM13 0H15V18H13V0ZM18 3V5H0V3H18ZM0 15V13H18V15H0Z'
        fill='url(#logo-gradient)'
      />
      <path
        d='M27.06 7.054V12.239C27.06 12.5903 27.1393 12.8453 27.298 13.004C27.468 13.1513 27.7513 13.225 28.148 13.225H29.338V14.84H27.808C26.9353 14.84 26.2667 14.636 25.802 14.228C25.3373 13.82 25.105 13.157 25.105 12.239V7.054H24V5.473H25.105V3.144H27.06V5.473H29.338V7.054H27.06ZM30.4782 10.114C30.4782 9.17333 30.6709 8.34033 31.0562 7.615C31.4529 6.88967 31.9855 6.32867 32.6542 5.932C33.3342 5.524 34.0822 5.32 34.8982 5.32C35.6349 5.32 36.2752 5.46733 36.8192 5.762C37.3745 6.04533 37.8165 6.40233 38.1452 6.833V5.473H40.1002V14.84H38.1452V13.446C37.8165 13.888 37.3689 14.2563 36.8022 14.551C36.2355 14.8457 35.5895 14.993 34.8642 14.993C34.0595 14.993 33.3229 14.789 32.6542 14.381C31.9855 13.9617 31.4529 13.3837 31.0562 12.647C30.6709 11.899 30.4782 11.0547 30.4782 10.114ZM38.1452 10.148C38.1452 9.502 38.0092 8.941 37.7372 8.465C37.4765 7.989 37.1309 7.62633 36.7002 7.377C36.2695 7.12767 35.8049 7.003 35.3062 7.003C34.8075 7.003 34.3429 7.12767 33.9122 7.377C33.4815 7.615 33.1302 7.972 32.8582 8.448C32.5975 8.91267 32.4672 9.468 32.4672 10.114C32.4672 10.76 32.5975 11.3267 32.8582 11.814C33.1302 12.3013 33.4815 12.6753 33.9122 12.936C34.3542 13.1853 34.8189 13.31 35.3062 13.31C35.8049 13.31 36.2695 13.1853 36.7002 12.936C37.1309 12.6867 37.4765 12.324 37.7372 11.848C38.0092 11.3607 38.1452 10.794 38.1452 10.148ZM43.6317 4.232C43.2803 4.232 42.9857 4.113 42.7477 3.875C42.5097 3.637 42.3907 3.34233 42.3907 2.991C42.3907 2.63967 42.5097 2.345 42.7477 2.107C42.9857 1.869 43.2803 1.75 43.6317 1.75C43.9717 1.75 44.2607 1.869 44.4987 2.107C44.7367 2.345 44.8557 2.63967 44.8557 2.991C44.8557 3.34233 44.7367 3.637 44.4987 3.875C44.2607 4.113 43.9717 4.232 43.6317 4.232ZM44.5837 5.473V14.84H42.6457V5.473H44.5837ZM49.0661 2.26V14.84H47.1281V2.26H49.0661ZM50.9645 10.114C50.9645 9.17333 51.1572 8.34033 51.5425 7.615C51.9392 6.88967 52.4719 6.32867 53.1405 5.932C53.8205 5.524 54.5685 5.32 55.3845 5.32C56.1212 5.32 56.7615 5.46733 57.3055 5.762C57.8609 6.04533 58.3029 6.40233 58.6315 6.833V5.473H60.5865V14.84H58.6315V13.446C58.3029 13.888 57.8552 14.2563 57.2885 14.551C56.7219 14.8457 56.0759 14.993 55.3505 14.993C54.5459 14.993 53.8092 14.789 53.1405 14.381C52.4719 13.9617 51.9392 13.3837 51.5425 12.647C51.1572 11.899 50.9645 11.0547 50.9645 10.114ZM58.6315 10.148C58.6315 9.502 58.4955 8.941 58.2235 8.465C57.9629 7.989 57.6172 7.62633 57.1865 7.377C56.7559 7.12767 56.2912 7.003 55.7925 7.003C55.2939 7.003 54.8292 7.12767 54.3985 7.377C53.9679 7.615 53.6165 7.972 53.3445 8.448C53.0839 8.91267 52.9535 9.468 52.9535 10.114C52.9535 10.76 53.0839 11.3267 53.3445 11.814C53.6165 12.3013 53.9679 12.6753 54.3985 12.936C54.8405 13.1853 55.3052 13.31 55.7925 13.31C56.2912 13.31 56.7559 13.1853 57.1865 12.936C57.6172 12.6867 57.9629 12.324 58.2235 11.848C58.4955 11.3607 58.6315 10.794 58.6315 10.148ZM65.07 6.833C65.3533 6.357 65.7273 5.98867 66.192 5.728C66.668 5.456 67.229 5.32 67.875 5.32V7.326H67.382C66.6227 7.326 66.0447 7.51867 65.648 7.904C65.2627 8.28933 65.07 8.958 65.07 9.91V14.84H63.132V5.473H65.07V6.833ZM73.3624 10.165L77.6804 14.84H75.0624L71.5944 10.811V14.84H69.6564V2.26H71.5944V9.57L74.9944 5.473H77.6804L73.3624 10.165Z'
        fill='currentColor'
      />
      <defs>
        <linearGradient id='logo-gradient' x1='10' y1='0' x2='10' y2='20' gradientUnits='userSpaceOnUse'>
          <stop stopColor='#9B99FE' />
          <stop offset='1' stopColor='#2BC8B7' />
        </linearGradient>
      </defs>
    </svg>
  );
};

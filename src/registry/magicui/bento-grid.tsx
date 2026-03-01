"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

type BentoGridProps = {
  className?: string;
  children: ReactNode;
};

type BentoCardProps = {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  description: string;
  href: string;
  cta: string;
  className?: string;
  background?: ReactNode;
};

export function BentoGrid({ className, children }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 gap-4 lg:auto-rows-[14rem] lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  Icon,
  name,
  description,
  href,
  cta,
  className,
  background,
}: BentoCardProps) {
  const isInternalHref = href.startsWith("/");

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">{background}</div>
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/80 to-background/20" />

      <div className="relative z-10 flex h-full flex-col justify-between p-5">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/80 bg-background/90 text-foreground">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h3 className="text-base font-semibold text-foreground">{name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {isInternalHref ? (
            <Link
              to={href}
              className="mt-3 inline-flex items-center text-sm font-medium text-primary transition hover:text-primary/80"
            >
              {cta}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          ) : (
            <a
              href={href}
              className="mt-3 inline-flex items-center text-sm font-medium text-primary transition hover:text-primary/80"
            >
              {cta}
              <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

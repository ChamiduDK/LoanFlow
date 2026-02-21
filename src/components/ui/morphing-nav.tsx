"use client";

import { useState, useEffect, type ComponentType } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

export type NavItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  href: string;
};

type MorphingNavProps = {
  items: NavItem[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  itemClassName?: string;
  showIcons?: boolean;
  activeClass?: string;
  iconClass?: string;
};

export const MorphingNav = ({
  items,
  value,
  onValueChange,
  className,
  itemClassName,
  showIcons = true,
  activeClass = "bg-slate-900",
  iconClass = "h-5 w-5",
}: MorphingNavProps) => {
  const [internalValue, setInternalValue] = useState(
    value || items[0]?.id || ""
  );

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const handleItemClick = (id: string) => {
    if (value === undefined) {
      setInternalValue(id);
    }
    onValueChange?.(id);
  };

  return (
    <nav
      className={cn(
        "overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm",
        className
      )}
    >
      <div className="flex min-w-full w-max items-center gap-1.5">
        {items.map((item) => {
          const isActive = internalValue === item.id;
          const Icon = item.icon;

          return (
            <Link
              to={item.href}
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className={cn(
                "group relative flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium sm:px-4",
                "transition-colors",
                itemClassName,
                isActive
                  ? "text-white"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="morphing-nav-active"
                  className={cn("absolute inset-0 rounded-lg", activeClass)}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}

              <motion.div
                className="relative z-10 flex items-center gap-2"
                transition={{ type: "spring", stiffness: 300 }}
              >
                {showIcons && Icon && (
                  <motion.span
                    className={cn(
                      "transition-colors",
                      isActive
                        ? "text-inherit"
                        : "text-slate-400 group-hover:text-current",
                      iconClass
                    )}
                  >
                    <Icon className={iconClass} />
                  </motion.span>
                )}
                <span>{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

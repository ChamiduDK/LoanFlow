"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

type AnimatedBeamProps = {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  duration?: number;
  delay?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
};

type BeamPath = {
  d: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

function buildPath(
  container: HTMLElement,
  from: HTMLElement,
  to: HTMLElement,
  curvature: number,
  startXOffset: number,
  startYOffset: number,
  endXOffset: number,
  endYOffset: number,
): BeamPath {
  const containerRect = container.getBoundingClientRect();
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();

  const startX = fromRect.left - containerRect.left + fromRect.width / 2 + startXOffset;
  const startY = fromRect.top - containerRect.top + fromRect.height / 2 + startYOffset;
  const endX = toRect.left - containerRect.left + toRect.width / 2 + endXOffset;
  const endY = toRect.top - containerRect.top + toRect.height / 2 + endYOffset;

  const controlPointOneX = startX + (endX - startX) * 0.34;
  const controlPointTwoX = startX + (endX - startX) * 0.66;
  const controlPointOneY = startY + curvature;
  const controlPointTwoY = endY - curvature;

  return {
    d: `M ${startX},${startY} C ${controlPointOneX},${controlPointOneY} ${controlPointTwoX},${controlPointTwoY} ${endX},${endY}`,
    startX,
    startY,
    endX,
    endY,
  };
}

export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  duration = 3.2,
  delay = 0,
  reverse = false,
  pathColor = "hsl(var(--border))",
  pathWidth = 2,
  pathOpacity = 0.55,
  gradientStartColor = "hsl(var(--info))",
  gradientStopColor = "hsl(var(--primary))",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: AnimatedBeamProps) {
  const [path, setPath] = useState<BeamPath | null>(null);
  const gradientId = useId().replace(/:/g, "");
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;

    if (!container || !from || !to) {
      return;
    }

    let frameId = 0;
    const updatePath = () => {
      setPath(
        buildPath(
          container,
          from,
          to,
          curvature,
          startXOffset,
          startYOffset,
          endXOffset,
          endYOffset,
        ),
      );
    };

    const requestPathUpdate = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updatePath();
      });
    };

    requestPathUpdate();

    const observer = new ResizeObserver(requestPathUpdate);
    [container, from, to].forEach((element) => observer.observe(element));

    window.addEventListener("resize", requestPathUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", requestPathUpdate);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
  ]);

  const dashAnimationDistance = useMemo(() => {
    if (!path) {
      return 180;
    }

    const distance = Math.hypot(path.endX - path.startX, path.endY - path.startY);
    return Math.max(distance * 0.55, 140);
  }, [path]);

  if (!path) {
    return null;
  }

  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={reverse ? path.endX : path.startX}
          y1={reverse ? path.endY : path.startY}
          x2={reverse ? path.startX : path.endX}
          y2={reverse ? path.startY : path.endY}
        >
          <stop offset="0%" stopColor={gradientStartColor} stopOpacity="0" />
          <stop offset="45%" stopColor={gradientStartColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d={path.d}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
        fill="none"
      />

      {!prefersReducedMotion && (
        <motion.path
          d={path.d}
          stroke={`url(#${gradientId})`}
          strokeWidth={pathWidth + 0.65}
          strokeLinecap="round"
          strokeDasharray={`28 ${dashAnimationDistance}`}
          fill="none"
          animate={{
            strokeDashoffset: reverse
              ? [0, dashAnimationDistance]
              : [dashAnimationDistance, 0],
          }}
          transition={{
            duration,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
            delay,
          }}
        />
      )}
    </svg>
  );
}

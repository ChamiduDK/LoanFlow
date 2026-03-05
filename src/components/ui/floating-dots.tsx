"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type FloatingDotsProps = {
  className?: string;
  color?: string;
  maxRadius?: number;
  maxSpeed?: number;
  minSpeed?: number;
};

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

export function FloatingDots({
  className,
  color = "white",
  maxRadius = 0.5,
  maxSpeed = 0.8,
  minSpeed = 0.1,
}: FloatingDotsProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    let width = 0;
    let height = 0;
    let animationFrameId = 0;

    const dots: Dot[] = [];

    const createDot = (): Dot => {
      const speed = randomBetween(minSpeed, Math.max(minSpeed + 0.05, maxSpeed));
      const angle = Math.random() * Math.PI * 2;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: randomBetween(0.2, Math.max(0.2, maxRadius)),
      };
    };

    const initializeDots = () => {
      dots.length = 0;
      const count = Math.max(40, Math.floor((width * height) / 14000));
      for (let i = 0; i < count; i += 1) {
        dots.push(createDot());
      }
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;
      initializeDots();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;

      for (let i = 0; i < dots.length; i += 1) {
        const dot = dots[i];

        dot.x += dot.vx;
        dot.y += dot.vy;

        if (dot.x < 0) dot.x += width;
        if (dot.x > width) dot.x -= width;
        if (dot.y < 0) dot.y += height;
        if (dot.y > height) dot.y -= height;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.globalAlpha = 0.55;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animationFrameId = window.requestAnimationFrame(draw);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);
    resize();
    draw();

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [color, maxRadius, maxSpeed, minSpeed]);

  return <canvas ref={canvasRef} className={cn("absolute inset-0 h-full w-full", className)} aria-hidden />;
}

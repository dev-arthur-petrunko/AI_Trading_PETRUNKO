"use client";

import React from "react";
import type { ReactNode } from "react";

/** Panel with cyberpunk HUD corners, icon, indicator dot and title. */
export function Panel({
  title,
  children,
  icon = "◈",
  right,
  className = "",
  bodyClass = "",
  delay = 0,
  flush = false,
  style,
}: {
  title: string;
  children: ReactNode;
  icon?: string;
  right?: ReactNode;
  className?: string;
  bodyClass?: string;
  delay?: number;
  flush?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={`panel panel-in ${className}`}
      style={
        {
          ...style,
          animationDelay: `${delay}ms`,
          "--gleam-delay": `${(delay % 7000) / 1000}s`,
        } as React.CSSProperties
      }
    >
      <span className="panel-corner tl" />
      <span className="panel-corner tr" />
      <span className="panel-corner bl" />
      <span className="panel-corner br" />
      <header className="panel-head">
        <span className="ico">{icon}</span>
        <span>{title}</span>
        <span className="spacer" />
        {right}
        <span className="dot" />
      </header>
      <div className={`panel-body ${flush ? "flush" : ""} ${bodyClass}`}>{children}</div>
    </section>
  );
}

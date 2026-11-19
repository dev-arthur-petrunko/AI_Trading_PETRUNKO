"use client";

import { useEffect, useRef, useState } from "react";
import { Style } from "./Style";

/**
 * Mechanical split-flap style rolling number.
 * Columns of digits roll to the new value; parent can flash direction.
 */
export function RollNumber({
  value,
  format,
  className = "",
  digitClass = "",
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
  digitClass?: string;
}) {
  const text = format(value);
  const prev = useRef(text);
  const [flash, setFlash] = useState<"" | "up" | "dn">("");

  useEffect(() => {
    const oldNum = parseFloat(prev.current.replace(/[^\d.-]/g, ""));
    const newNum = value;
    if (Number.isFinite(oldNum) && newNum > oldNum) setFlash("up");
    else if (Number.isFinite(oldNum) && newNum < oldNum) setFlash("dn");
    prev.current = text;
    const t = setTimeout(() => setFlash(""), 300);
    return () => clearTimeout(t);
  }, [value, text]);

  return (
    <span className={`roll-wrap ${className}`} data-flash={flash}>
      <span className="roll mono">
        {text.split("").map((ch, i) => {
          if (/\d/.test(ch)) {
            const d = Number(ch);
            return (
              <span className="col" key={i}>
                <span className="strip" style={{ transform: `translateY(-${d}em)` }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </span>
              </span>
          );
          }
          return (
            <span className="col" key={i}>
              <span className="strip" style={{ transform: "translateY(0)" }}>
                <span>{ch}</span>
                <span>{ch}</span>
              </span>
            </span>
          );
        })}
      </span>
      <Style>{`
        .roll-wrap[data-flash="up"] { color: #19f58a; text-shadow: 0 0 calc(var(--u) * 12) rgba(25,245,138,0.6); }
        .roll-wrap[data-flash="dn"] { color: #ff3b5c; text-shadow: 0 0 calc(var(--u) * 12) rgba(255,59,92,0.6); }
        .roll-wrap { display: inline-block; transition: color 0.3s; }
      `}</Style>
    </span>
  );
}

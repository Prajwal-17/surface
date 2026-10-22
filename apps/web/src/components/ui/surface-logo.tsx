import type { SVGProps } from "react";

/** Two offset planes joined by negative space; readable as an S at 16px. */
export function SurfaceLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M7 3h15l-4 5H8l-3 4H0l7-9Z" />
      <path d="M6 11h10l3-4h5l-7 14H2l4-5h10l3-5H6Z" />
    </svg>
  );
}

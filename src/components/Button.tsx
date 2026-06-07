import { buttonClasses, type ButtonSize, type ButtonVariant } from "./ui";
import type { ComponentProps } from "react";

/**
 * Presentational button using the shared design tokens. No client hooks, so it
 * works inside both server components and `<form action>` server actions.
 * For links, apply `buttonClasses()` directly to a `<Link>`/`<a>`.
 */
export default function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

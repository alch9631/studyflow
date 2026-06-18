"use client";

import CalmError from "@/components/CalmError";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <CalmError {...props} variant="data" />;
}

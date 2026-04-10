"use client";

import dynamic from "next/dynamic";

const InterstellarView = dynamic(
  () => import("./InterstellarView").then((m) => m.InterstellarView),
  { ssr: false },
);

export function InterstellarViewDynamic() {
  return <InterstellarView />;
}

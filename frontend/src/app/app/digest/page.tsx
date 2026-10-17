import type { Metadata } from "next";
import { DigestView } from "@/components/digest";

export const metadata: Metadata = { title: "This week" };

export default function DigestPage() {
  return <DigestView />;
}

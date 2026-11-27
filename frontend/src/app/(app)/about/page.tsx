import { AboutContent } from "@/components/about/AboutContent";
import { STATIC_DISTRICT_OPTIONS } from "@/lib/data/districtsStatic";

export const dynamic = "force-static";

export default function AboutPage() {
  return <AboutContent districts={STATIC_DISTRICT_OPTIONS} />;
}

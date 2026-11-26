"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  ChevronDown,
  CloudRain,
  Compass,
  Cpu,
  FileText,
  Globe2,
  Info,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  Siren,
  Target,
} from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DISCLAIMER } from "@/lib/config";
import { useAsync } from "@/lib/hooks";
import { districts as districtsApi } from "@/lib/services";

type TopicId =
  | "about"
  | "vision"
  | "how"
  | "ai"
  | "twin"
  | "monitoring"
  | "risk"
  | "simulations"
  | "districts"
  | "workflow"
  | "safety"
  | "privacy"
  | "terms"
  | "contact";

const SAFETY_GUIDES = [
  {
    hazard: "Floods & Flash Floods",
    steps: [
      "Move to higher ground early; never wait until floodwater surrounds your home.",
      "Do not walk, swim, or drive across flooded nullahs, causeways, or fast-moving water.",
      "Keep drinking water, essential medicines, documents, and a charged phone in a waterproof bag.",
    ],
  },
  {
    hazard: "Earthquakes",
    steps: [
      "Drop, Cover, and Hold On under sturdy furniture away from windows and heavy shelves.",
      "After shaking stops, evacuate calmly to open space away from cracked walls and power lines.",
      "Expect aftershocks and report trapped persons or damaged buildings immediately.",
    ],
  },
  {
    hazard: "Landslides & Mountain Roads",
    steps: [
      "Watch for fresh ground cracks, tilting poles, or sudden muddy debris flows after rain.",
      "Avoid narrow mountain passes during heavy rainfall and move sideways out of debris paths.",
    ],
  },
  {
    hazard: "Fires & Infrastructure Incidents",
    steps: [
      "Evacuate low to the floor if smoke is present and call Police 15 / Rescue services.",
      "Stay clear of downed electrical lines and damaged gas pipes.",
    ],
  },
] as const;

export default function AboutPage() {
  const ds = useAsync(() => districtsApi.list().catch(() => []), [], "about-districts");
  const [openTopic, setOpenTopic] = useState<TopicId>("about");
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  const sections: {
    id: TopicId;
    title: string;
    subtitle: string;
    icon: typeof Info;
    content: React.ReactNode;
  }[] = [
    {
      id: "about",
      title: "1. About CRISISTWIN AI",
      subtitle: "Balochistan Intelligent Disaster Management, Digital Twin & Emergency Response System",
      icon: Info,
      content: (
        <div className="space-y-3 text-sm leading-relaxed text-ct-secondary">
          <p>
            <strong className="text-ct-text">CRISISTWIN AI</strong> is a unified disaster preparedness and emergency response platform built specifically for communities, responders, and disaster coordinators across Balochistan, Pakistan.
          </p>
          <p>
            It bridges two dedicated experiences: a simple, accessible <strong className="text-ct-text">Citizen Portal</strong> (for emergency reporting, verified alerts, nearby medical/rescue help, and multilingual AI guidance) and a role-protected <strong className="text-ct-text">Administrator Command Center</strong> (for report triage, alert publishing, GIS boundary verification, risk assessment, and scenario planning).
          </p>
          <div className="rounded-xl border border-[#E9A23B]/45 bg-[#E9A23B]/10 p-3.5 text-xs text-ct-text">
            {DISCLAIMER}
          </div>
        </div>
      ),
    },
    {
      id: "vision",
      title: "2. Project Vision and Mission",
      subtitle: "Predict Risks. Simulate Disasters. Save Lives.",
      icon: Target,
      content: (
        <div className="grid gap-4 sm:grid-cols-2 text-sm leading-relaxed text-ct-secondary">
          <div className="rounded-xl border border-ct-border bg-ct-soft/60 p-4">
            <h4 className="font-bold text-ct-text">Vision</h4>
            <p className="mt-1">
              A resilient Balochistan where every resident—whether in Quetta, coastal Makran, or remote mountain valleys—can report danger within seconds and access verified life-saving guidance.
            </p>
          </div>
          <div className="rounded-xl border border-ct-border bg-ct-soft/60 p-4">
            <h4 className="font-bold text-ct-text">Mission</h4>
            <p className="mt-1">
              Provide transparent hazard intelligence, rapid citizen-to-coordinator reporting without login barriers, verified hospital/rescue directories, and honest data separation between confirmed facts and scenario estimates.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "how",
      title: "3. How the Platform Works",
      subtitle: "Connected citizen safety and administrator coordination workflow",
      icon: Compass,
      content: (
        <ol className="grid gap-3 sm:grid-cols-2 text-sm text-ct-secondary">
          {[
            ["Citizen Access (Guest or Account)", "Open the portal directly without mandatory registration to submit incidents, view verified alerts, locate facilities, or ask safety questions."],
            ["Location & Photo Capture", "Capture GPS coordinates, adjust map pins, or select a district manually alongside optional camera/gallery photos."],
            ["Human Coordinator Verification", "Every citizen report enters an administrator triage queue so unverified submissions are reviewed before public display or team dispatch."],
            ["Public Alert Broadcast", "Verified alerts published by administrators appear immediately on the Citizen Dashboard and Alerts feed with safety instructions."],
          ].map(([h, d]) => (
            <li key={h} className="rounded-xl border border-ct-border bg-ct-soft/50 p-3.5">
              <p className="font-bold text-ct-text">{h}</p>
              <p className="mt-1 text-xs leading-relaxed">{d}</p>
            </li>
          ))}
        </ol>
      ),
    },
    {
      id: "ai",
      title: "4. AI Technology & Image Support",
      subtitle: "Multilingual safety guidance and transparent handling of citizen photos",
      icon: Cpu,
      content: (
        <div className="space-y-3 text-sm leading-relaxed text-ct-secondary">
          <p>
            The <strong className="text-ct-text">AI Emergency Assistant</strong> operates on server-side language models grounded strictly against verified active alerts, official helpline records, and nearby recorded hospitals in English, Urdu (اردو), and Balochi.
          </p>
          <p>
            <strong className="text-ct-text">Image &amp; Evidence Handling:</strong> Photographs attached to citizen emergency reports are stripped of device EXIF GPS metadata in the browser before upload, hashed with SHA-256 on receipt, and queued for <strong className="text-ct-text">human coordinator review</strong>—the system does not automatically verify or publish unreviewed photos via computer vision guesses.
          </p>
        </div>
      ),
    },
    {
      id: "twin",
      title: "5. Balochistan Digital Twin",
      subtitle: "Provincial GIS foundation across 26 mapped districts",
      icon: Globe2,
      content: (
        <p className="text-sm leading-relaxed text-ct-secondary">
          The Balochistan Digital Twin models district administrative polygons (geoBoundaries ADM2 open data), verified emergency facilities, and reported incident coordinates on interactive Leaflet GIS layers inside the Command Center—allowing coordinators to inspect spatial proximity to hospitals, shelters, and high-risk corridors.
        </p>
      ),
    },
    {
      id: "monitoring",
      title: "6. Geographic Monitoring",
      subtitle: "Boundary-backed district detection and coordinate validation",
      icon: MapPin,
      content: (
        <p className="text-sm leading-relaxed text-ct-secondary">
          Submitted locations are validated against the Balochistan bounding envelope and matched using point-in-polygon GIS geometry to identify the affected district automatically while protecting citizen location privacy preferences on public displays.
        </p>
      ),
    },
    {
      id: "risk",
      title: "7. Disaster Risk Assessment",
      subtitle: "Weighted multi-factor flood risk scoring engine",
      icon: Activity,
      content: (
        <div className="space-y-2 text-sm leading-relaxed text-ct-secondary">
          <p>
            Coordinators run transparent weighted flood risk assessments across rainfall (24h), duration saturation, elevation, slope, historical flood index, and population exposure.
          </p>
          <p>
            Missing measurements are never silently treated as zero; if available factor weight coverage falls below 50%, the engine honestly reports <strong className="text-ct-text">Insufficient data</strong> rather than inventing a score.
          </p>
        </div>
      ),
    },
    {
      id: "simulations",
      title: "8. Scenario Simulations",
      subtitle: "Hypothetical rainfall scenario comparison & export",
      icon: CloudRain,
      content: (
        <p className="text-sm leading-relaxed text-ct-secondary">
          Command Center administrators configure hypothetical rainfall intensity and duration scenarios to inspect potential district stress indicators, compare scenarios side-by-side, and export PDF or CSV planning summaries—explicitly tagged as hypothetical planning models, not meteorological forecasts.
        </p>
      ),
    },
    {
      id: "districts",
      title: "9. Balochistan District Information",
      subtitle: ds.data ? `${ds.data.length} districts registered in platform GIS` : "Provincial district coverage",
      icon: MapPin,
      content: ds.loading ? (
        <Skeleton className="h-24" />
      ) : !ds.data?.length ? (
        <EmptyState title="District directory unavailable" text="Unable to fetch districts right now." />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-ct-muted">
            District boundaries sourced from geoBoundaries gbOpen PAK ADM2 (CC BY 4.0), with verification status tracked by coordinators.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {ds.data.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-ct-border bg-ct-soft/50 px-3 py-2 text-xs"
              >
                <span className="truncate font-semibold text-ct-text">{d.name}</span>
                {d.verified && <Badge tone="green">Verified</Badge>}
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "workflow",
      title: "10. Emergency Response Workflow",
      subtitle: "End-to-end lifecycle from report to resolution",
      icon: Siren,
      content: (
        <ol className="space-y-2 text-sm text-ct-secondary">
          <li><strong className="text-ct-text">1. Submitted:</strong> Citizen or guest files report and receives unique Reference ID (plus one-time Verification PIN for guests).</li>
          <li><strong className="text-ct-text">2. Under Review:</strong> Coordinator checks GPS pin, attached photos, and duplicate proximity.</li>
          <li><strong className="text-ct-text">3. Verified &amp; Response Assigned:</strong> Confirmed incidents update live tracking and notify relevant response teams.</li>
          <li><strong className="text-ct-text">4. Resolved:</strong> Status updates in immutable verification history for full accountability.</li>
        </ol>
      ),
    },
    {
      id: "safety",
      title: "11. Safety Guidelines",
      subtitle: "Preparedness steps for common Balochistan hazards",
      icon: ShieldCheck,
      content: (
        <div className="grid gap-3 sm:grid-cols-2">
          {SAFETY_GUIDES.map((g) => (
            <div key={g.hazard} className="rounded-xl border border-ct-border bg-ct-soft/50 p-4">
              <h4 className="font-bold text-ct-text">{g.hazard}</h4>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ct-secondary">
                {g.steps.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#21C7D9]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "privacy",
      title: "12. Privacy Policy",
      subtitle: "How citizen reports, locations, and guest pins are protected",
      icon: Lock,
      content: (
        <ul className="space-y-2 text-sm leading-relaxed text-ct-secondary">
          <li>• <strong className="text-ct-text">Minimal Data Collection:</strong> Guest emergency reports require no account or email address.</li>
          <li>• <strong className="text-ct-text">Photo EXIF Stripping:</strong> Uploaded evidence images are re-encoded on-device to strip embedded camera GPS/device metadata before transmission.</li>
          <li>• <strong className="text-ct-text">Private Tracking PINs:</strong> Guest tracking PINs are hashed server-side (SHA-256) and verified in constant time; tracking responses omit reporter phone numbers and personal details.</li>
          <li>• <strong className="text-ct-text">Optional Location Rounding:</strong> Registered citizens can enable approximate coordinate rounding (~110 m) for public incident display.</li>
        </ul>
      ),
    },
    {
      id: "terms",
      title: "13. Terms and Conditions",
      subtitle: "Responsible public use and emergency disclaimers",
      icon: FileText,
      content: (
        <ul className="space-y-2 text-sm leading-relaxed text-ct-secondary">
          <li>• <strong className="text-ct-text">Life-Threatening Emergencies:</strong> Always call <strong className="text-ct-text">Police 15</strong> or local emergency services immediately—never wait solely on a web platform during active danger.</li>
          <li>• <strong className="text-ct-text">Honest Reporting:</strong> Submitting fabricated or malicious reports delays rescue coordination and is subject to rate limits and rejection.</li>
          <li>• <strong className="text-ct-text">Advisory Nature:</strong> Risk assessments and scenario outputs are decision-support tools and not official evacuation orders.</li>
        </ul>
      ),
    },
    {
      id: "contact",
      title: "14. Contact & Project Information",
      subtitle: "Emergency numbers, platform support, and coordinator access",
      icon: Mail,
      content: (
        <div className="space-y-3 text-sm text-ct-secondary">
          <p>
            For immediate police or rescue assistance across Balochistan, call <strong className="text-ct-text">15</strong> or inspect verified facility contacts in{" "}
            <Link href="/resources?tab=contacts" className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
              Emergency Help &amp; Helplines
            </Link>.
          </p>
          {contactEmail && (
            <p>
              Project contact:{" "}
              <a href={`mailto:${contactEmail}`} className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
                {contactEmail}
              </a>
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-ct-muted">
            <span>Maps © OpenStreetMap, Esri, OpenTopoMap</span>
            <span>·</span>
            <span>Boundaries: geoBoundaries (CC BY 4.0)</span>
            <span>·</span>
            <Link href="/staff-access" className="font-semibold text-[#0b8a99] hover:underline dark:text-[#21C7D9]">
              Staff / Coordinator Portal
            </Link>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="About CRISISTWIN AI"
        subtitle="System overview, technology, Balochistan district monitoring, safety guidelines, privacy, and project information."
      />

      {/* Quick Jump Pills */}
      <div className="flex flex-wrap gap-1.5">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpenTopic(s.id)}
            className={cn(
              "min-h-[34px] rounded-xl border px-3 py-1 text-xs font-medium transition",
              openTopic === s.id
                ? "border-[#21C7D9] bg-[#21C7D9]/15 font-semibold text-[#0b7280] dark:text-[#21C7D9]"
                : "border-ct-border bg-ct-surface text-ct-secondary hover:border-[#21C7D9]/50 hover:text-ct-text"
            )}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* Expandable Accordion Sections */}
      <div className="space-y-3">
        {sections.map((s) => {
          const Icon = s.icon;
          const isOpen = openTopic === s.id;
          return (
            <Card key={s.id} className="overflow-hidden">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenTopic(isOpen ? "about" : s.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-ct-soft/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#21C7D9]/12 text-[#0b8a99] dark:text-[#21C7D9]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-ct-text sm:text-base">{s.title}</h2>
                    <p className="truncate text-xs text-ct-muted">{s.subtitle}</p>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-ct-muted transition-transform",
                    isOpen && "rotate-180 text-[#0b8a99] dark:text-[#21C7D9]"
                  )}
                />
              </button>
              {isOpen && <div className="border-t border-ct-border px-5 py-4">{s.content}</div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

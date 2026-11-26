"use client";

const MIN_LON = 60.5;
const MAX_LON = 70.6;
const MIN_LAT = 24.6;
const MAX_LAT = 32.3;
const W = 360;
const H = 300;

function project([lon, lat]: [number, number]): [number, number] {
  const x = ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * (W - 24) + 12;
  const y = (1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * (H - 24) + 12;
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

// Projected Natural Earth admin-1 boundary for Balochistan
const OUTLINE_POINTS =
  "294,35.6 304.8,24.9 316.8,21.6 321.6,23 322.9,27.4 326.2,26.5 328.2,42.3 330.5,43.7 335.8,41.6 335.7,54 330.2,70 327.3,78.2 326.8,86.5 329.4,86.2 319,104.9 314.7,107.1 316.7,115.8 317.8,119.9 319.5,120.2 311.9,132.9 312.4,136.5 305.8,145.4 277,149.9 261.5,162 251,168.8 235.1,182 233.6,216.1 242.9,242.8 235.6,255.7 229.3,267.5 223.7,273.3 217.6,276.9 219.5,267.9 213.2,260.6 212.6,255.1 209.5,252.2 207.5,251.2 198.1,256.6 203.6,254.2 209,256.4 210.2,257.4 206.9,257 190.3,258.7 177.3,259.8 174.9,259.6 166.9,263 150.7,264.5 152.1,267.2 148.4,267.5 147.2,264 140.4,263.5 131.2,258.4 129.9,257.5 130.1,258.7 130.4,261.3 119.7,259.9 110.8,263.3 111.8,266.7 96.1,265.8 77.8,264.4 75.7,266.3 74.6,270.5 72.4,269 66.7,265.8 65.1,269.8 56.8,272.3 54.7,266.9 49.3,263.4 51,250.1 53.7,244.3 65,226.5 70.7,224.9 71.6,219.9 85.3,216.2 99.9,215.4 103.9,206.6 103.8,197.8 104.2,194.7 91.6,194.3 87.8,191.2 89,184.2 87.2,157.3 74,151.1 47.5,134.9 44.9,127.4 39.7,120.4 23.5,99.5 114.1,112.5 134.2,112.9 162.9,110.9 204.1,98.6 202.3,92.4 205.7,78.8 207.2,61.4 217,55.6 222.9,48.7 229,50 253.7,46.6 248.6,43.9 251.4,39.9 260.4,35.7 266.1,29 278.1,32.6 275.4,30.5 284.4,31 288.2,37 294,35.6";

const HUBS: { name: string; lon: number; lat: number; anchor?: "start" | "end" }[] = [
  { name: "Quetta", lon: 66.99, lat: 30.18, anchor: "end" },
  { name: "Zhob", lon: 69.45, lat: 31.34, anchor: "end" },
  { name: "Sibi", lon: 67.88, lat: 29.54, anchor: "start" },
  { name: "Khuzdar", lon: 66.61, lat: 27.8, anchor: "start" },
  { name: "Turbat", lon: 63.05, lat: 26.0, anchor: "end" },
  { name: "Gwadar", lon: 62.33, lat: 25.13, anchor: "start" },
];

export function BalochistanOutline({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="Map outline of Balochistan with major provincial hubs"
    >
      <defs>
        <linearGradient id="ct-prov-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#21C7D9" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#21C7D9" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      <polygon
        points={OUTLINE_POINTS}
        fill="url(#ct-prov-fill)"
        stroke="#21C7D9"
        strokeOpacity="0.65"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />

      {HUBS.map((hub) => {
        const [cx, cy] = project([hub.lon, hub.lat]);
        const dx = hub.anchor === "end" ? -7 : 7;
        return (
          <g key={hub.name}>
            <circle cx={cx} cy={cy} r="3.2" fill="#21C7D9" />
            <circle cx={cx} cy={cy} r="6.5" fill="#21C7D9" fillOpacity="0.2" />
            <text
              x={cx + dx}
              y={cy + 3.5}
              textAnchor={hub.anchor ?? "start"}
              fill="#EDF5FA"
              fillOpacity="0.88"
              fontSize="10"
              fontWeight="600"
              fontFamily="var(--font-body), sans-serif"
            >
              {hub.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

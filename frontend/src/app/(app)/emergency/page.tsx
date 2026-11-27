import fs from "node:fs";
import path from "node:path";
import {
  EmergencyDirectoryClient,
  type EmergencyContactsData,
} from "@/components/emergency/EmergencyDirectoryClient";

export const dynamic = "force-static";

export default function EmergencyPage() {
  const filePath = path.join(process.cwd(), "public/data/emergency_contacts.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as EmergencyContactsData;
  return <EmergencyDirectoryClient data={data} />;
}

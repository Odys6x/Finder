/** Quick-pick interest chips. `value` is matched against data.gov.sg labels (word-start, case-insensitive). */
export const CCA_CHOICES = [
  { label: "Basketball", value: "Basketball" },
  { label: "Football", value: "Football" },
  { label: "Badminton", value: "Badminton" },
  { label: "Netball", value: "Netball" },
  { label: "Volleyball", value: "Volleyball" },
  { label: "Floorball", value: "Floorball" },
  { label: "Table tennis", value: "Table Tennis" },
  { label: "Swimming", value: "Swimming" },
  { label: "Track & field", value: "Track and Field" },
  { label: "Wushu", value: "Wushu" },
  { label: "Taekwondo", value: "Taekwondo" },
  { label: "Robotics", value: "Robotics" },
  { label: "Media / infocomm", value: "Infocomm" },
  { label: "Choir", value: "Choir" },
  { label: "Concert band", value: "Concert Band" },
  { label: "Chinese orchestra", value: "Chinese Orchestra" },
  { label: "Modern dance", value: "Modern Dance" },
  { label: "English drama", value: "English Drama" },
  { label: "Art & crafts", value: "Art and Crafts" },
  { label: "NPCC", value: "National Police Cadet Corps" },
  { label: "NCC", value: "National Cadet Corps" },
  { label: "Scouts", value: "Scouts" },
  { label: "Girl Guides", value: "Girl Guides" },
  { label: "Red Cross", value: "Red Cross" },
];

export const PROGRAMME_CHOICES = [
  { label: "Music", value: "Music" },
  { label: "Art", value: "Art" },
  { label: "Languages", value: "Language" },
  { label: "STEM", value: "STEM" },
  { label: "Sustainability", value: "Sustainability" },
  { label: "Health & food science", value: "Health" },
  { label: "Emerging tech", value: "Emerging Technologies" },
  { label: "Transport / aerospace", value: "Future of Transportation" },
  { label: "Humanities", value: "Humanities" },
  { label: "Business", value: "Business" },
  { label: "Sports & outdoor", value: "Sports" },
  { label: "Performing arts", value: "Performing Arts" },
  { label: "Leadership & community", value: "Community Youth Leadership" },
  { label: "Bicultural studies", value: "Bicultural" },
];

export const ZONES = ["NORTH", "SOUTH", "EAST", "WEST"];
export const MOTHER_TONGUES = ["CHINESE", "MALAY", "TAMIL"];

export function labelFor(value: string, list: { label: string; value: string }[]) {
  return list.find((x) => x.value === value)?.label ?? value;
}

const KEEP_UPPER = /\b(Mrt|Lrt|Sap|Ip|Chij|Alp|Llp|Npcc|Ncc|Nccc|Cca|Stem|Ict|Ib|Emas|Nus|Sji|Acs|Sst)\b/g;

export function title(s: string) {
  if (!(s.length > 3 && s === s.toUpperCase())) return s;
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/'S\b/g, "'s")
    .replace(KEEP_UPPER, (m) => m.toUpperCase());
}

export type Teacher = { id: string; name: string; title: string; bio: string; photo: string; photoSmall?: string; affiliations: string[]; feed: string };
export type ClassItem = { id: string; sid?: string; teacherId: string; title: string; date: string; durationSec: number; audioUrl: string; youtubeId?: string; image: string; link: string; topic: string | null; kind: 'audio' | 'video'; chapters?: [number, string][]; summary?: string };
// What the AI step wrote for a class: m summary, s subjects, q questions it answers, c key words for each part, t words said.
export type SearchEntry = { i: string; m: string; s: string; q: string; c: string[]; t: string };
export type WeeklyClass = { day: string; time: string; teacherId: string; teacherName: string; title: string; mode: 'zoom' | 'inperson' | 'both'; location: string; lockedZoom: string; lockedAddress: string };
export type Notice = { date: string; text: string; dedication: string };
export type Erub = { id: string; name: string; short: string; url: string; status: 'up' | 'down' | 'checked' | 'unknown'; date: string | null; fresh: boolean };
export type Resource = { category: string; name: string; area: string; note: string; open?: boolean; phone?: string; email?: string; lockedPhone: string; lockedEmail?: string };
export type Shortcuts = { daf: Record<string, { tractate: string; page: number }>; perasha: { name: string; search: string[]; shabbat: string } | null; holiday: { name: string; date: string; search?: string[] } | null };
export type AppData = {
  shortcuts?: Shortcuts;
  generatedAt: string; topics: string[]; teachers: Teacher[]; classes: ClassItem[];
  schedule: { weekly: WeeklyClass[]; notices: Notice[] };
  resources: Resource[]; resourceCategories: string[]; erub: Erub[];
  links: { giveLively: string; officeEmail: string; newsletter: string; addressContact?: { name: string; sms: string } | null; connect?: { label: string; note: string; url: string }[] }; hasLockedDetails: boolean; analytics?: { goatcounter?: string } | null;
};

// Shapes returned by the API (server/src/services). Kept by hand: the web never imports server code.
import type {
  BreakdownStatus,
  ContactKind,
  CoverageType,
  DateDisplay,
  EmailKind,
  EquipmentStatus,
  FileKind,
  FixedBy,
  PauseReason,
  PmsStatus,
  PmsUnit,
  RecipientSource,
  Role,
} from "@bmserv/shared/enums";

export type Me = {
  user: { id: string; name: string; username: string; email: string; phone: string; role: Role; mustChangePassword: boolean };
  hospital: {
    name: string;
    departmentName: string;
    departmentPhone: string;
    dateDisplay: DateDisplay;
    countryCode: string;
    logoFileId: string | null;
    whatsappButtons: boolean;
    staffReports: boolean;
  };
  pushPublicKey: string | null;
  emailRedirectTo: string | null;
  appUrl: string;
};

export type Person = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  isActive: boolean;
  /** Hospital staff only. */
  departmentIds: string[];
};

export type Settings = {
  logoFileId: string | null;
  hospitalName: string;
  hospitalAddress: string | null;
  departmentName: string;
  departmentEmail: string;
  departmentPhone: string;
  dailyEmailTime: string;
  pmsReminderDays: number;
  emailCc: string[];
  dateDisplay: DateDisplay;
  countryCode: string;
  emailTeamOnReport: boolean;
  pmsSoonDays: number;
  coverageWarnDays: number;
  pausedWarnDays: number;
  staffReports: boolean;
  staffReportAssigneeId: string | null;
  pushOnBreakdown: boolean;
  pushOnFixed: boolean;
  whatsappButtons: boolean;
  updatedAt: number;
};

export type DepartmentListItem = { id: string; name: string; shortName: string | null; isActive: boolean; hereNow: number; belongs: number };

export type EquipmentRow = {
  id: string;
  qrCode: string;
  typeName: string;
  manufacturer: string;
  model: string;
  modelId: string;
  serialNumber: string;
  hospitalTag: string | null;
  status: EquipmentStatus;
  labelOutdated: boolean;
  currentDepartmentId: string;
  currentDepartmentName: string;
  homeDepartmentId: string;
  homeDepartmentName: string;
  /** Current coverage today; null when not covered. */
  coverageType?: CoverageType | null;
  coverageLastDay?: string | null;
  providerId: string;
  providerName: string;
  installedOn: string;
  modelPmsEvery: number | null;
  modelPmsUnit: PmsUnit;
  modelPhotoFileId: string | null;
  away: boolean;
};

export type MoveInfo = { id: string; movedAt: number; expectedReturnOn: string | null; movedByName: string; reason?: string };

export type DepartmentDetail = {
  department: { id: string; name: string; shortName: string | null; isActive: boolean };
  hereNow: EquipmentRow[];
  elsewhere: (EquipmentRow & { move: MoveInfo | null })[];
};

export type ProviderListItem = {
  id: string;
  name: string;
  isActive: boolean;
  companyPhone: string | null;
  equipmentCount: number;
  engineerCount: number;
  emailCount: number;
};

export type Contact = { id: string; providerId: string; kind: ContactKind; value: string; label: string | null; isActive: boolean };
export type ServiceEngineer = {
  id: string;
  providerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
};
export type EmailLogRow = {
  id: string;
  kind: EmailKind;
  subject: string;
  toAddresses: string;
  ccAddresses?: string | null;
  status: "sending" | "sent" | "failed";
  error: string | null;
  createdAt: number;
  byName: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
};

export type ProviderDetail = {
  provider: {
    id: string;
    name: string;
    address: string | null;
    companyPhone: string | null;
    companyEmail: string | null;
    notes: string | null;
    isActive: boolean;
  };
  contacts: Contact[];
  engineers: ServiceEngineer[];
  equipment: EquipmentRow[];
  emails: EmailLogRow[];
};

export type Model = {
  id: string;
  typeName: string;
  manufacturer: string;
  model: string;
  category: string | null;
  pmsEvery: number | null;
  pmsUnit: PmsUnit;
  photoFileId?: string | null;
  equipmentCount?: number;
  manualCount?: number;
};

export type ModelDetail = { model: Model; manuals: FileRow[]; equipment: EquipmentRow[] };

export type FileRow = {
  id: string;
  kind: FileKind;
  title: string;
  note: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
  uploadedByName: string;
};

export type CoverageRow = {
  id: string;
  type: CoverageType;
  serviceProviderId: string;
  providerName: string;
  startsOn: string;
  endsOn: string;
  endedEarlyOn: string | null;
  pmsEvery: number | null;
  pmsUnit: PmsUnit;
  contractNo: string | null;
  notes: string | null;
  lastDay: string;
  isCurrent: boolean;
};

export type PmsVisit = {
  id: string;
  equipmentId: string;
  coverageId: string | null;
  number: number | null;
  total: number;
  dueOn: string;
  status: PmsStatus;
  reminderSentAt: number | null;
  doneOn: string | null;
  serviceEngineerName: string | null;
  remarks: string | null;
  fromEarlierRecords: boolean;
};

export type EquipmentDetail = {
  equipment: EquipmentRow & { notes: string | null; photoFileId: string | null; createdAt: number };
  designated: { id: string; name: string; phone: string | null; email: string | null; isActive: boolean }[];
  providerEngineers: { id: string; name: string; phone: string | null; email: string | null }[];
  providerContacts: { id: string; kind: ContactKind; value: string; label: string | null }[];
  manuals: FileRow[];
  documents: FileRow[];
  openBreakdowns: { id: string; number: number; status: BreakdownStatus; problem: string; reportedAt: number }[];
  activeMove: (MoveInfo & { reason: string }) | null;
  coverage: { current: CoverageRow | null; all: CoverageRow[] };
  lastPms: PmsVisit | null;
  nextPms: PmsVisit | null;
  pmsVisits: PmsVisit[];
};

export type HistoryEntry = {
  at: number;
  date: string | null;
  moment: number | null;
  title: string;
  by: string | null;
  details: string[];
  link: string | null;
};

export type PmsListItem = PmsVisit & {
  coverageType: CoverageType | null;
  coverageEndsOn: string | null;
  coverageEndedEarlyOn: string | null;
  coverageProviderId: string | null;
  markedByName: string | null;
  equipment: EquipmentRow;
};

export type BreakdownListItem = {
  id: string;
  number: number;
  numberText: string;
  status: BreakdownStatus;
  problem: string;
  reportedAt: number;
  closedAt: number | null;
  equipmentId: string;
  assignedTo: string;
  assignedName: string;
  lastEmailAt: number | null;
  pausedAt: number | null;
  pauseReason: PauseReason | null;
  equipment: EquipmentRow;
};

export type Recipient = { source: RecipientSource; sourceId: string | null; email: string; name: string | null };

export type PhoneContacts = {
  providerName: string;
  serviceDesk: { name: string; phone: string }[];
  serviceEngineers: { name: string; phone: string; designated: boolean }[];
  team: { id: string; name: string; phone: string; role: Role }[];
};

export type BreakdownDetail = {
  phoneContacts: PhoneContacts;
  breakdown: {
    id: string;
    number: number;
    numberText: string;
    status: BreakdownStatus;
    problem: string;
    reportedAt: number;
    reportedByName: string;
    assignedTo: string;
    assignedName: string | null;
    assignedPhone: string | null;
    recordedName: string | null;
    closedName: string | null;
    sentToProviderAt: number | null;
    lastEmailAt: number | null;
    lastEmailOn: string | null;
    closedAt: number | null;
    fixedBy: FixedBy | null;
    serviceEngineerName: string | null;
    workDone: string | null;
    partsReplaced: string | null;
    providerId: string | null;
  };
  equipment: EquipmentRow;
  coverage: { type: CoverageType; lastDay: string } | null;
  currentPause: Pause | null;
  pauses: (Pause & { resumedByName: string | null })[];
  notes: { id: string; note: string; createdAt: number; byName: string }[];
  recipients: (Recipient & { id: string })[];
  emails: EmailLogRow[];
  assignments: { summary: string; createdAt: number; action: string; byName: string | null }[];
};

export type Pause = {
  id: string;
  reason: PauseReason;
  note: string | null;
  pausedAt: number;
  resumeOn: string | null;
  resumedAt: number | null;
  resumedBy: string | null;
  pausedByName: string;
};

export type RecipientOptions = {
  provider: { id: string; name: string };
  defaults: Recipient[];
  saved: (Recipient & { id: string })[];
  engineers: { id: string; name: string; email: string | null; phone: string | null }[];
  preview: { subject: string; text: string };
};

export type HomeStats = {
  total: number;
  byStatus: Record<EquipmentStatus, number>;
  covered: number;
  coverageMix: Record<CoverageType, number>;
  byDepartment: { id: string; name: string; total: number; down: number }[];
  breakdownsByMonth: { key: string; label: string; n: number }[];
  topModels: { label: string; n: number }[];
  avgRepairMs: number | null;
  repairsCounted: number;
  pms90: { done: number; skipped: number; overdue: number };
  pmsDue30: number;
};

export type HomeData = {
  today: string;
  pmsSoonDays: number;
  stats: HomeStats;
  down: BreakdownListItem[];
  pausedLong: BreakdownListItem[];
  pmsOverdue: PmsListItem[];
  pmsThisWeek: PmsListItem[];
  toReturn: { id: string; equipmentId: string; expectedReturnOn: string | null; movedAt: number; equipment: EquipmentRow }[];
  coverageEnding: { id: string; type: CoverageType; lastDay: string; equipment: EquipmentRow }[];
};

export type ManualRow = {
  id: string;
  kind: FileKind;
  title: string;
  note: string | null;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
  modelId: string;
  typeName: string;
  manufacturer: string;
  model: string;
  uploadedByName: string;
  equipmentCount: number;
};

export type ReportInfo = {
  equipment: {
    id: string;
    qrCode: string;
    typeName: string;
    manufacturer: string;
    model: string;
    serialNumber: string;
    hospitalTag: string | null;
    currentDepartmentName: string;
    status: EquipmentStatus;
    photoFileId: string | null;
  };
  open: { numberText: string; status: BreakdownStatus; reportedAt: number } | null;
  departmentPhone: string;
};

export type ReportResult = {
  id: string;
  numberText: string;
  again: boolean;
  whatsapp: { text: string; contacts: { name: string; phone: string; role: Role }[] };
  countryCode: string;
};

export type MyEquipment = {
  departments: { id: string; name: string }[];
  equipment: {
    id: string;
    qrCode: string;
    typeName: string;
    manufacturer: string;
    model: string;
    serialNumber: string;
    hospitalTag: string | null;
    departmentId: string;
    departmentName: string;
    status: EquipmentStatus;
    photoFileId: string | null;
    openBreakdown: string | null;
  }[];
};

export type MyReport = {
  id: string;
  numberText: string;
  status: BreakdownStatus;
  problem: string;
  reportedAt: number;
  closedAt: number | null;
  assignedName: string;
  equipment: { typeName: string; manufacturer: string; model: string; serialNumber: string; currentDepartmentName: string; photoFileId: string | null } | null;
};

export type PushInfo = { publicKey: string | null; devices: number };

// BMServ tables (ARCHITECTURE.md section 4). Ids are nanoid text; dates are AD `YYYY-MM-DD` text;
// moments are integer UTC ms. Nothing a person recorded is hard-deleted.
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  breakdownStatuses,
  contactKinds,
  dateDisplays,
  coverageTypes,
  emailKinds,
  equipmentStatuses,
  fileKinds,
  fileOwnerTypes,
  fixedByOptions,
  moveTypes,
  pauseReasons,
  pmsStatuses,
  pmsUnits,
  recipientSources,
} from "@bmserv/shared/enums";
import { user } from "./auth";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const createdAt = () => integer("created_at").notNull().default(nowMs);
const bool = (name: string) => integer(name, { mode: "boolean" });

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  hospitalName: text("hospital_name").notNull(),
  hospitalAddress: text("hospital_address"),
  departmentName: text("department_name").notNull(),
  departmentEmail: text("department_email").notNull(),
  departmentPhone: text("department_phone").notNull(),
  dailyEmailTime: text("daily_email_time").notNull().default("08:00"),
  pmsReminderDays: integer("pms_reminder_days").notNull().default(3),
  emailCc: text("email_cc", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  dateDisplay: text("date_display", { enum: dateDisplays }).notNull().default("bs"),
  countryCode: text("country_code").notNull().default("+977"),
  emailTeamOnReport: bool("email_team_on_report").notNull().default(true),
  pmsSoonDays: integer("pms_soon_days").notNull().default(7),
  coverageWarnDays: integer("coverage_warn_days").notNull().default(30),
  pausedWarnDays: integer("paused_warn_days").notNull().default(14),
  staffReports: bool("staff_reports").notNull().default(true),
  staffReportAssigneeId: text("staff_report_assignee_id"),
  pushOnBreakdown: bool("push_on_breakdown").notNull().default(true),
  pushOnFixed: bool("push_on_fixed").notNull().default(true),
  whatsappButtons: bool("whatsapp_buttons").notNull().default(true),
  updatedAt: integer("updated_at").notNull().default(nowMs),
});

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  shortName: text("short_name"),
  isActive: bool("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const serviceProviders = sqliteTable("service_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  address: text("address"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  notes: text("notes"),
  isActive: bool("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const providerContacts = sqliteTable(
  "provider_contacts",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => serviceProviders.id),
    kind: text("kind", { enum: contactKinds }).notNull(),
    value: text("value").notNull(),
    label: text("label"),
    isActive: bool("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("provider_contacts_provider_idx").on(t.providerId)],
);

export const serviceEngineers = sqliteTable(
  "service_engineers",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => serviceProviders.id),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    isActive: bool("is_active").notNull().default(true),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull().default(nowMs),
  },
  (t) => [index("service_engineers_provider_idx").on(t.providerId)],
);

export const equipmentModels = sqliteTable("equipment_models", {
  id: text("id").primaryKey(),
  typeName: text("type_name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  category: text("category"),
  modelKey: text("model_key").notNull().unique(),
  pmsEvery: integer("pms_every"),
  pmsUnit: text("pms_unit", { enum: pmsUnits }).notNull().default("months"),
  /** Current photo (files row, kind photo). Replacing it deletes the old one from R2. */
  photoFileId: text("photo_file_id"),
  createdAt: createdAt(),
});

export const equipment = sqliteTable(
  "equipment",
  {
    id: text("id").primaryKey(),
    qrCode: text("qr_code").notNull().unique(),
    modelId: text("model_id")
      .notNull()
      .references(() => equipmentModels.id),
    serialNumber: text("serial_number").notNull(),
    serialKey: text("serial_key").notNull().unique(),
    hospitalTag: text("hospital_tag"),
    hospitalTagKey: text("hospital_tag_key").unique(),
    serviceProviderId: text("service_provider_id")
      .notNull()
      .references(() => serviceProviders.id),
    homeDepartmentId: text("home_department_id")
      .notNull()
      .references(() => departments.id),
    currentDepartmentId: text("current_department_id")
      .notNull()
      .references(() => departments.id),
    installedOn: text("installed_on").notNull(),
    status: text("status", { enum: equipmentStatuses }).notNull().default("working"),
    photoFileId: text("photo_file_id"),
    notes: text("notes"),
    labelOutdated: bool("label_outdated").notNull().default(false),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull().default(nowMs),
  },
  (t) => [
    index("equipment_model_idx").on(t.modelId),
    index("equipment_home_idx").on(t.homeDepartmentId),
    index("equipment_current_idx").on(t.currentDepartmentId),
    index("equipment_provider_idx").on(t.serviceProviderId),
  ],
);

export const equipmentServiceEngineers = sqliteTable(
  "equipment_service_engineers",
  {
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    serviceEngineerId: text("service_engineer_id")
      .notNull()
      .references(() => serviceEngineers.id),
    addedBy: text("added_by").references(() => user.id),
    addedAt: integer("added_at").notNull().default(nowMs),
  },
  (t) => [primaryKey({ columns: [t.equipmentId, t.serviceEngineerId] })],
);

export const coverage = sqliteTable(
  "coverage",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    type: text("type", { enum: coverageTypes }).notNull(),
    serviceProviderId: text("service_provider_id")
      .notNull()
      .references(() => serviceProviders.id),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    /** Before 0002: PMS was always in months. Copied into pms_every; no longer written. */
    pmsEveryMonths: integer("pms_every_months"),
    pmsEvery: integer("pms_every"),
    pmsUnit: text("pms_unit", { enum: pmsUnits }).notNull().default("months"),
    contractNo: text("contract_no"),
    notes: text("notes"),
    endedEarlyOn: text("ended_early_on"),
    endProcessedAt: integer("end_processed_at"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("coverage_equipment_idx").on(t.equipmentId)],
);

export const pmsVisits = sqliteTable(
  "pms_visits",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    coverageId: text("coverage_id").references(() => coverage.id),
    number: integer("number"),
    dueOn: text("due_on").notNull(),
    status: text("status", { enum: pmsStatuses }).notNull().default("scheduled"),
    reminderSentAt: integer("reminder_sent_at"),
    doneOn: text("done_on"),
    serviceEngineerName: text("service_engineer_name"),
    remarks: text("remarks"),
    markedBy: text("marked_by").references(() => user.id),
    fromEarlierRecords: bool("from_earlier_records").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("pms_equipment_idx").on(t.equipmentId),
    index("pms_coverage_idx").on(t.coverageId),
    index("pms_due_idx").on(t.status, t.dueOn),
  ],
);

export const breakdowns = sqliteTable(
  "breakdowns",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull().unique(),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    reportedAt: integer("reported_at").notNull(),
    reportedByName: text("reported_by_name").notNull(),
    problem: text("problem").notNull(),
    status: text("status", { enum: breakdownStatuses }).notNull().default("open"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    assignedTo: text("assigned_to")
      .notNull()
      .references(() => user.id),
    providerId: text("provider_id").references(() => serviceProviders.id),
    sentToProviderAt: integer("sent_to_provider_at"),
    lastEmailOn: text("last_email_on"),
    lastEmailAt: integer("last_email_at"),
    closedAt: integer("closed_at"),
    closedBy: text("closed_by").references(() => user.id),
    fixedBy: text("fixed_by", { enum: fixedByOptions }),
    serviceEngineerName: text("service_engineer_name"),
    workDone: text("work_done"),
    partsReplaced: text("parts_replaced"),
    createdAt: createdAt(),
  },
  (t) => [index("breakdowns_equipment_idx").on(t.equipmentId), index("breakdowns_status_idx").on(t.status)],
);

export const breakdownRecipients = sqliteTable(
  "breakdown_recipients",
  {
    id: text("id").primaryKey(),
    breakdownId: text("breakdown_id")
      .notNull()
      .references(() => breakdowns.id),
    source: text("source", { enum: recipientSources }).notNull(),
    sourceId: text("source_id"),
    email: text("email").notNull(),
    name: text("name"),
    isActive: bool("is_active").notNull().default(true),
    addedBy: text("added_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("breakdown_recipients_bd_idx").on(t.breakdownId)],
);

export const breakdownPauses = sqliteTable(
  "breakdown_pauses",
  {
    id: text("id").primaryKey(),
    breakdownId: text("breakdown_id")
      .notNull()
      .references(() => breakdowns.id),
    reason: text("reason", { enum: pauseReasons }).notNull(),
    note: text("note"),
    pausedAt: integer("paused_at").notNull(),
    pausedBy: text("paused_by")
      .notNull()
      .references(() => user.id),
    resumeOn: text("resume_on"),
    resumedAt: integer("resumed_at"),
    resumedBy: text("resumed_by").references(() => user.id),
  },
  (t) => [index("breakdown_pauses_bd_idx").on(t.breakdownId)],
);

export const breakdownNotes = sqliteTable(
  "breakdown_notes",
  {
    id: text("id").primaryKey(),
    breakdownId: text("breakdown_id")
      .notNull()
      .references(() => breakdowns.id),
    note: text("note").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("breakdown_notes_bd_idx").on(t.breakdownId)],
);

export const moves = sqliteTable(
  "moves",
  {
    id: text("id").primaryKey(),
    equipmentId: text("equipment_id")
      .notNull()
      .references(() => equipment.id),
    fromDepartmentId: text("from_department_id")
      .notNull()
      .references(() => departments.id),
    toDepartmentId: text("to_department_id")
      .notNull()
      .references(() => departments.id),
    type: text("type", { enum: moveTypes }).notNull(),
    reason: text("reason").notNull(),
    movedAt: integer("moved_at").notNull(),
    movedBy: text("moved_by")
      .notNull()
      .references(() => user.id),
    expectedReturnOn: text("expected_return_on"),
    returnedAt: integer("returned_at"),
    returnedBy: text("returned_by").references(() => user.id),
  },
  (t) => [index("moves_equipment_idx").on(t.equipmentId)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type", { enum: fileOwnerTypes }).notNull(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind", { enum: fileKinds }).notNull(),
    title: text("title").notNull(),
    note: text("note"),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status", { enum: ["pending", "ready"] })
      .notNull()
      .default("pending"),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    removedAt: integer("removed_at"),
    removedBy: text("removed_by").references(() => user.id),
    purgedAt: integer("purged_at"),
  },
  (t) => [index("files_owner_idx").on(t.ownerType, t.ownerId)],
);

export const emailLog = sqliteTable(
  "email_log",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: emailKinds }).notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    toAddresses: text("to_addresses").notNull(),
    ccAddresses: text("cc_addresses"),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    resendId: text("resend_id"),
    status: text("status", { enum: ["sending", "sent", "failed"] }).notNull(),
    error: text("error"),
    relatedType: text("related_type"),
    relatedId: text("related_id"),
    providerId: text("provider_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("email_log_related_idx").on(t.relatedType, t.relatedId), index("email_log_provider_idx").on(t.providerId)],
);

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    summary: text("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_subject_idx").on(t.subjectType, t.subjectId)],
);


/** One row per browser that turned notifications on (Web Push). Removed when the browser drops it. */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSentAt: integer("last_sent_at"),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/** Departments a hospital staff account belongs to: they see the equipment that is in these departments now. */
export const staffDepartments = sqliteTable(
  "staff_departments",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.departmentId] }), index("staff_departments_department_idx").on(t.departmentId)],
);

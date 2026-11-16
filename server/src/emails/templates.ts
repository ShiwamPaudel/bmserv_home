// Email wording from PRD.md section 6. Plain, short, factual. Dates Nepali first, AD in brackets.
import { formatDate, formatMoment } from "@bmserv/shared/dates";
import type { DateDisplay } from "@bmserv/shared/enums";
import { escapeHtml } from "./send";

export type Rendered = { subject: string; text: string; html: string };

function html(text: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#12303F;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

export type BreakdownEmailData = {
  dateMode: DateDisplay;
  hospital: string;
  providerName: string;
  typeName: string;
  manufacturer: string;
  model: string;
  serial: string;
  currentDepartment: string;
  installedOn: string;
  coverageText: string;
  bdNumber: string;
  reportedAt: number;
  problem: string;
  notesText: string;
  responsibleName: string;
  responsiblePhone: string;
  departmentName: string;
  departmentPhone: string;
};

function details(d: BreakdownEmailData): string {
  return [
    `Equipment:      ${d.typeName} ${d.manufacturer} ${d.model}`,
    `Serial number:  ${d.serial}`,
    `Department:     ${d.currentDepartment}`,
    `Installed on:   ${formatDate(d.installedOn, d.dateMode)}`,
    `Coverage:       ${d.coverageText}`,
    `Breakdown no.:  ${d.bdNumber}`,
    `Reported on:    ${formatMoment(d.reportedAt, d.dateMode)}`,
  ].join("\n");
}

function closing(d: BreakdownEmailData): string {
  return [
    "Please reply with the date and time your engineer will attend.",
    "We will send this email daily until the equipment is working again.",
    "",
    `Contact: ${d.responsibleName}, ${d.responsiblePhone}`,
    `${d.departmentName}, ${d.hospital}, ${d.departmentPhone}`,
  ].join("\n");
}

/** 6.1 Breakdown, help needed (first request) */
export function breakdownRequest(d: BreakdownEmailData): Rendered {
  const subject = `Breakdown: ${d.typeName} ${d.model}, S.N. ${d.serial} at ${d.hospital} needs service`;
  const text = [
    `Dear ${d.providerName} service team,`,
    "",
    `The equipment below at ${d.hospital} is not working and needs your service support.`,
    "",
    details(d),
    "",
    "Problem",
    d.problem,
    "",
    "Checked by our team so far",
    d.notesText || "Nothing recorded yet.",
    "",
    closing(d),
  ].join("\n");
  return { subject, text, html: html(text) };
}

/** 6.2 Breakdown, daily email */
export function breakdownDaily(d: BreakdownEmailData & { days: number; updateText: string }): Rendered {
  const subject = `Day ${d.days}: ${d.typeName} ${d.model}, S.N. ${d.serial} at ${d.hospital} still not working`;
  const text = [
    `Dear ${d.providerName} service team,`,
    "",
    `This equipment has been down for ${d.days} ${d.days === 1 ? "day" : "days"} and is still waiting for service.`,
    "",
    details(d),
    "",
    "Problem",
    d.problem,
    "",
    "Latest update from our team",
    d.updateText || "No new update since the last email.",
    "",
    closing(d),
  ].join("\n");
  return { subject, text, html: html(text) };
}

/** 6.3 Breakdown, closed */
export function breakdownClosed(
  d: BreakdownEmailData & { closedAt: number; fixedByName: string; downtime: string },
): Rendered {
  const subject = `Working again: ${d.typeName} ${d.model}, S.N. ${d.serial}, breakdown ${d.bdNumber}`;
  const text = [
    `Dear ${d.providerName} service team,`,
    "",
    `Breakdown ${d.bdNumber} of ${d.typeName} ${d.manufacturer} ${d.model}, S.N. ${d.serial} at ${d.hospital} was closed on ${formatMoment(d.closedAt, d.dateMode)}, fixed by ${d.fixedByName}. Total downtime: ${d.downtime}. The daily emails have stopped. Thank you for your support.`,
    "",
    `${d.departmentName}, ${d.hospital}, ${d.departmentPhone}`,
  ].join("\n");
  return { subject, text, html: html(text) };
}

/** To the Biomedical team: hospital staff reported a problem from a label. */
export function breakdownReported(d: {
  dateMode: DateDisplay;
  hospital: string;
  bdNumber: string;
  typeName: string;
  manufacturer: string;
  model: string;
  serial: string;
  department: string;
  problem: string;
  reportedByName: string;
  reportedByPhone: string;
  reportedAt: number;
  responsibleName: string;
  link: string;
}): Rendered {
  const subject = `Problem reported: ${d.typeName} ${d.model} at ${d.department}, ${d.bdNumber}`;
  const text = [
    `${d.reportedByName} reported a problem from the BMServ label.`,
    "",
    `Equipment:      ${d.typeName} ${d.manufacturer} ${d.model}`,
    `Serial number:  ${d.serial}`,
    `Department:     ${d.department}`,
    `Breakdown no.:  ${d.bdNumber}`,
    `Reported on:    ${formatMoment(d.reportedAt, d.dateMode)}`,
    `Reported by:    ${d.reportedByName}${d.reportedByPhone ? `, ${d.reportedByPhone}` : ""}`,
    `Responsible:    ${d.responsibleName}`,
    "",
    "Problem:",
    d.problem,
    "",
    `Open in BMServ: ${d.link}`,
    "",
    `BMServ, ${d.hospital}`,
  ].join("\n");
  return { subject, text, html: html(text) };
}

export type PmsEmailItem = {
  typeName: string;
  manufacturer: string;
  model: string;
  serial: string;
  currentDepartment: string;
  number: number | null;
  total: number;
  coverageText: string;
  dueOn: string;
};

/** 6.4 PMS due (one or grouped per provider and due date) */
export function pmsDue(d: {
  dateMode: DateDisplay;
  hospital: string;
  providerName: string;
  dueOn: string;
  items: PmsEmailItem[];
  departmentName: string;
  departmentPhone: string;
}): Rendered {
  const first = d.items[0];
  const subject =
    d.items.length === 1 && first
      ? `PMS due on ${formatDate(d.dueOn, d.dateMode)}: ${first.typeName} ${first.model}, S.N. ${first.serial} at ${d.hospital}`
      : `PMS due on ${formatDate(d.dueOn, d.dateMode)}: ${d.items.length} equipment at ${d.hospital}`;
  const blocks = d.items.map((i) =>
    [
      `${i.typeName} ${i.manufacturer} ${i.model}, S.N. ${i.serial}`,
      `Department: ${i.currentDepartment}`,
      `${i.number ? `PMS ${i.number} of ${i.total}` : "PMS"}, ${i.coverageText}`,
      `Due on: ${formatDate(i.dueOn, d.dateMode)}`,
    ].join("\n"),
  );
  const text = [
    `Dear ${d.providerName} service team,`,
    "",
    `The planned maintenance below is due at ${d.hospital}. Please arrange for your engineer to visit on or before the due date.`,
    "",
    blocks.join("\n\n"),
    "",
    "Please reply with the visit date and time.",
    "",
    `Contact: ${d.departmentName}, ${d.departmentPhone}`,
    d.hospital,
  ].join("\n");
  return { subject, text, html: html(text) };
}

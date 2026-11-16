import { inArray } from "drizzle-orm";
import { toCsv } from "@bmserv/shared/csv";
import { nepalDateOf, todayNepal } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { getDb } from "../db/client";
import { coverage } from "../db/schema";
import { coverageLastDay, isCoverageCurrent } from "@bmserv/shared/pms";
import type { Actor } from "../lib/http";
import { listBreakdowns } from "./breakdowns";
import { listEquipment } from "./equipment";
import { listPms } from "./pms";

const ad = (ms: number | null) => (ms ? nepalDateOf(ms) : "");

export async function exportList(actor: Actor, list: string): Promise<{ name: string; csv: string } | null> {
  const today = todayNepal();
  if (list === "equipment") {
    const { rows } = await listEquipment({ limit: 500 });
    let all = rows;
    let offset = 500;
    while (all.length === offset) {
      const more = await listEquipment({ limit: 500, offset });
      all = all.concat(more.rows);
      offset += 500;
      if (!more.rows.length) break;
    }
    const covers = all.length
      ? await getDb().select().from(coverage).where(inArray(coverage.equipmentId, all.map((r) => r.id)))
      : [];
    const current = (id: string) => covers.find((c) => c.equipmentId === id && isCoverageCurrent(c, today));
    return {
      name: `equipment-${today}.csv`,
      csv: toCsv(
        ["Equipment type", "Manufacturer", "Model", "Serial number", "Hospital tag", "Status", "Department", "Home department", "Service provider", "Installed on", "Coverage", "Coverage until"],
        all.map((r) => {
          const c = current(r.id);
          return [r.typeName, r.manufacturer, r.model, r.serialNumber, r.hospitalTag, t.status.equipment[r.status], r.currentDepartmentName, r.homeDepartmentName, r.providerName, r.installedOn, c ? t.coverageType[c.type] : t.coverage.none, c ? coverageLastDay(c.endsOn, c.endedEarlyOn) : ""];
        }),
      ),
    };
  }
  if (list === "breakdowns") {
    const rows = [
      ...(await listBreakdowns(actor, { status: "open" })),
      ...(await listBreakdowns(actor, { status: "with_provider" })),
      ...(await listBreakdowns(actor, { status: "fixed" })),
    ];
    return {
      name: `breakdowns-${today}.csv`,
      csv: toCsv(
        ["Breakdown no.", "Status", "Equipment type", "Model", "Serial number", "Department", "Reported on", "Closed on", "Problem", "Responsible engineer"],
        rows.map((r) => [r.numberText, t.status.breakdown[r.status], r.equipment?.typeName, `${r.equipment?.manufacturer ?? ""} ${r.equipment?.model ?? ""}`, r.equipment?.serialNumber, r.equipment?.currentDepartmentName, ad(r.reportedAt), ad(r.closedAt), r.problem, r.assignedName]),
      ),
    };
  }
  if (list === "pms") {
    const rows = [...(await listPms("overdue")), ...(await listPms("due")), ...(await listPms("done"))];
    return {
      name: `pms-${today}.csv`,
      csv: toCsv(
        ["Equipment type", "Model", "Serial number", "Department", "PMS", "Status", "Due on", "Done on", "Service engineer", "Remarks"],
        rows.map((v) => [
          v.equipment.typeName,
          `${v.equipment.manufacturer} ${v.equipment.model}`,
          v.equipment.serialNumber,
          v.equipment.currentDepartmentName,
          v.number ? t.pms.numberOf(v.number, v.total) : t.pms.fromEarlier,
          v.status === "scheduled" && v.dueOn < today ? t.status.pmsOverdue : t.status.pms[v.status],
          v.dueOn,
          v.doneOn ?? "",
          v.serviceEngineerName ?? "",
          v.remarks ?? "",
        ]),
      ),
    };
  }
  return null;
}


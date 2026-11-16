import type { ReactNode } from "react";
import { Link } from "react-router";
import { addDays } from "@bmserv/shared/dates";
import { t } from "@bmserv/shared/terms";
import { DateText } from "../lib/dates";
import type { EquipmentRow } from "../lib/types";
import { EquipmentStatusPill, Row } from "./ui";
import { ModelThumb } from "./ModelPhoto";

function CoverageLine({ e, today, warnDays }: { e: EquipmentRow; today: string; warnDays: number }) {
  if (!e.coverageType || !e.coverageLastDay) return <span className="coverage-line none">{t.equipment.notCovered}</span>;
  const ending = e.coverageLastDay <= addDays(today, warnDays);
  return (
    <span className={`coverage-line${ending ? " ending" : ""}`}>
      {t.equipment.coverageUntil(t.coverageType[e.coverageType])} <DateText ad={e.coverageLastDay} />
    </span>
  );
}

/** The equipment row used in every list: type, model, S.N., department, status. */
export function EquipmentLine({
  e,
  extra,
  side,
  to,
  onClick,
  before,
  selected,
  noLink,
  coverage,
}: {
  e: EquipmentRow;
  /** Equipment list: show the current coverage and its last day (amber when ending soon). */
  coverage?: { today: string; warnDays: number };
  extra?: ReactNode;
  side?: ReactNode;
  to?: string;
  onClick?: () => void;
  before?: ReactNode;
  selected?: boolean;
  noLink?: boolean;
}) {
  return (
    <Row
      {...(noLink ? {} : onClick ? { onClick } : { to: to ?? `/equipment/${e.id}` })}
      {...(before ? { before } : {})}
      {...(selected !== undefined ? { selected } : {})}
      thumb={<ModelThumb fileId={e.modelPhotoFileId} name={`${e.manufacturer} ${e.model}`} />}
      title={noLink ? <Link to={`/equipment/${e.id}`} style={{ color: "inherit" }}>{e.typeName}</Link> : e.typeName}
      lines={[
        `${e.manufacturer} ${e.model}`,
        <>
          {t.equipment.serialShort} <span className="serial">{e.serialNumber}</span>
          <span className="sep">
            {e.currentDepartmentName}
            {e.away && `, ${t.equipment.homeIs(e.homeDepartmentName)}`}
          </span>
        </>,
        coverage && <CoverageLine e={e} today={coverage.today} warnDays={coverage.warnDays} />,
        extra,
      ]}
      side={side ?? <EquipmentStatusPill status={e.status} />}
    />
  );
}

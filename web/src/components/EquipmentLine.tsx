import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "@bmserv/shared/terms";
import type { EquipmentRow } from "../lib/types";
import { EquipmentStatusPill, Row } from "./ui";
import { ModelThumb } from "./ModelPhoto";

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
}: {
  e: EquipmentRow;
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
        extra,
      ]}
      side={side ?? <EquipmentStatusPill status={e.status} />}
    />
  );
}

"""Supplies catalog: validation, history, and API-shaped responses."""
from __future__ import annotations

import json
import math
import uuid
from typing import Any, Dict, List, Optional, Tuple

import mysql.connector
from flask import session

from src.api.db import get_db
from src.api.helpers.datetime_json import db_datetime_to_utc_iso
from src.api.helpers.history import (
    get_supply_current_state,
    is_latest_global_history_timestamp,
    log_category_changes,
    log_supply_history,
    log_team_changes,
    snapshot_supply_locations_before_delete,
)
from src.api.models.supply import Supply
from src.api.repositories import custom_field_definitions_repository as cf_repo
from src.api.repositories import supplies_repository as repo


class CatalogError(Exception):
    __slots__ = ("status", "body")

    def __init__(self, status: int, body: dict):
        self.status = status
        self.body = body
        super().__init__(str(body))


def effective_supply_image(supply_image, type_image):
    if type_image:
        return type_image
    return supply_image if supply_image else None


def type_has_template_image(type_row) -> bool:
    return bool(type_row and type_row.get("image"))


def json_load_maybe(val, default=None):
    if default is None:
        default = {}
    if val is None:
        return default
    if isinstance(val, dict):
        return val
    if isinstance(val, str) and val.strip():
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, dict) else default
        except (TypeError, ValueError):
            return default
    return default


def merge_custom_fields_from_type(type_row, user_cf):
    defaults = json_load_maybe(type_row.get("default_custom_fields"), {})
    if not isinstance(defaults, dict):
        defaults = {}
    locked = type_row.get("locked_custom_field_keys")
    if isinstance(locked, str) and locked.strip():
        try:
            locked = json.loads(locked)
        except (TypeError, ValueError):
            locked = []
    elif not isinstance(locked, list):
        locked = []
    merged = dict(defaults)
    if isinstance(user_cf, dict):
        merged.update(user_cf)
    for k in locked:
        if k in defaults:
            merged[k] = defaults[k]
        elif k not in merged:
            merged[k] = ""
    return merged


def json_load_int_list(val) -> List[int]:
    if val is None:
        return []
    if isinstance(val, str) and val.strip():
        try:
            val = json.loads(val)
        except (TypeError, ValueError):
            return []
    if not isinstance(val, list):
        return []
    out: List[int] = []
    for x in val:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return sorted(set(out))


def locked_team_names_from_type_row(type_row) -> List[str]:
    if not type_row:
        return []
    raw = type_row.get("locked_team_names")
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    if not isinstance(raw, list):
        return []
    return normalize_teams([str(x) for x in raw if x is not None])


def locked_category_ids_from_type_row(type_row) -> List[int]:
    if not type_row:
        return []
    raw = type_row.get("locked_category_ids")
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return []
    return json_load_int_list(raw)


def merge_categories_with_type_locks(type_row, user_category_ids) -> List[int]:
    locked = locked_category_ids_from_type_row(type_row)
    user: List[int] = []
    for x in user_category_ids or []:
        try:
            user.append(int(x))
        except (TypeError, ValueError):
            continue
    return sorted(set(locked + user))


def merge_teams_with_type_locks(type_row, user_teams_raw) -> List[str]:
    locked = locked_team_names_from_type_row(type_row)
    user = normalize_teams(user_teams_raw or [])
    seen = set()
    out: List[str] = []
    for t in locked + user:
        tl = t.lower()
        if tl not in seen:
            seen.add(tl)
            out.append(t)
    return out


def validate_custom_fields(custom_fields, allowed_names) -> Tuple[bool, Optional[str]]:
    if not custom_fields:
        return True, None
    if not isinstance(custom_fields, dict):
        return False, "custom_fields must be an object"
    for key in custom_fields:
        if key not in allowed_names:
            return False, f"Unknown custom field: {key}"
    return True, None


def _locked_custom_field_key_list(type_row) -> List[str]:
    if not type_row:
        return []
    locked = type_row.get("locked_custom_field_keys")
    if isinstance(locked, str) and locked.strip():
        try:
            locked = json.loads(locked)
        except (TypeError, ValueError):
            return []
    if not isinstance(locked, list):
        return []
    return [str(k) for k in locked if k is not None]


def _merged_cf_value_is_present_for_type(field_type: str, val: Any) -> bool:
    ft = (field_type or "text").strip().lower()
    if ft == "number":
        if val is None:
            return False
        if isinstance(val, bool):
            return False
        if isinstance(val, (int, float)):
            return math.isfinite(float(val))
        if isinstance(val, str):
            s = val.strip()
            if not s:
                return False
            try:
                x = float(s)
            except (TypeError, ValueError):
                return False
            return math.isfinite(x)
        return False
    if ft == "date":
        if val is None:
            return False
        return bool(str(val).strip())
    if val is None:
        return False
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return True
    return bool(str(val).strip())


def validate_locked_custom_fields_filled(type_row, merged_cf, cur) -> Tuple[bool, Optional[str]]:
    """Every key in the type's locked_custom_field_keys must have a non-empty merged value."""
    locked = _locked_custom_field_key_list(type_row)
    if not locked:
        return True, None
    rows = cf_repo.list_id_name_type_ordered(cur)
    name_to_type = {str(r[1]): str(r[2]) for r in rows}
    cf: Dict[str, Any] = merged_cf if isinstance(merged_cf, dict) else {}
    for key in locked:
        ft = name_to_type.get(key, "text")
        if not _merged_cf_value_is_present_for_type(ft, cf.get(key)):
            return False, f'Custom field "{key}" is required for this item type.'
    return True, None


def validate_name_desc_prefixes(type_row, name, description) -> Tuple[bool, Optional[str]]:
    np = (type_row.get("item_name_prefix") or "").strip()
    if np:
        nm = (name or "").strip()
        if not nm.startswith(np):
            return False, "Name must begin with the type prefix."
    ndp_raw = type_row.get("item_description_prefix")
    ndp = (ndp_raw or "").strip() if ndp_raw else ""
    if ndp:
        desc_str = (description or "").strip() if description is not None else ""
        if desc_str and not desc_str.startswith(ndp):
            return False, "Description must begin with the type prefix."
    return True, None


def normalize_teams(teams_raw: Optional[List]) -> List[str]:
    out = []
    for team in teams_raw or []:
        tl = team.lower()
        if tl == "software":
            out.append("Software")
        elif tl == "electrical":
            out.append("Electrical")
        elif tl == "mechanical":
            out.append("Mechanical")
        else:
            out.append(team.capitalize())
    return out


def parse_custom_fields_cell(cf) -> dict:
    if isinstance(cf, str) and cf:
        try:
            cf = json.loads(cf)
        except (TypeError, ValueError):
            cf = {}
    elif cf is None:
        cf = {}
    return cf if isinstance(cf, dict) else {}


def location_db_rows_to_api(loc_rows: List[dict]) -> List[dict]:
    locations = []
    for loc_row in loc_rows:
        if loc_row["location_name"] is None and loc_row["coord_x"] is not None:
            locations.append(
                {
                    "location": "Free Coordinate",
                    "shelf": loc_row["shelf"],
                    "qty": loc_row["amount"],
                    "coord_x": int(loc_row["coord_x"]),
                    "coord_y": int(loc_row["coord_y"]),
                    "supply_location_id": loc_row["id"],
                }
            )
        else:
            locations.append(
                {
                    "location": loc_row["location_name"],
                    "shelf": loc_row["shelf"],
                    "qty": loc_row["amount"],
                    "supply_location_id": loc_row["id"],
                }
            )
    return locations


def _attach_last_modified_names(supply_dict: dict, member: Optional[dict]) -> None:
    if member:
        supply_dict["last_modified_by_name"] = f"{member['first_name']} {member['last_name']}"
        supply_dict["last_modified_by_email"] = member["uf_email"]


def list_supplies() -> List[dict]:
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    try:
        rows = repo.list_supplies_aggregate_rows(cur)
        if not rows:
            return []
        ids = [r["id"] for r in rows]
        loc_map = repo.fetch_locations_by_supply_ids(cur, ids)
        team_map = repo.fetch_teams_by_supply_ids(cur, ids)
        cat_map = repo.fetch_categories_by_supply_ids(cur, ids)
        uf_ids = list({str(r["last_modified_by"]) for r in rows if r.get("last_modified_by")})
        mem_map = repo.fetch_members_by_uf_ids(cur, uf_ids)

        supplies = []
        for row in rows:
            sid = row["id"]
            cf = parse_custom_fields_cell(row.get("custom_fields"))
            supply_dict = {
                "id": sid,
                "public_id": row["public_id"],
                "name": row["name"],
                "description": row["description"],
                "image": effective_supply_image(row.get("image"), row.get("type_image")),
                "type_has_template_image": bool(row.get("type_image")),
                "custom_fields": cf,
                "supply_type_id": row.get("supply_type_id"),
                "type_name": row.get("type_name"),
                "lastModified": db_datetime_to_utc_iso(row["last_modified"]),
                "last_modified_by": row["last_modified_by"],
                "totalQty": int(row["totalQty"]),
                "locations": location_db_rows_to_api(loc_map.get(sid, [])),
                "teams": team_map.get(sid, []),
                "categories": cat_map.get(sid, []),
            }
            if row["last_order_date"]:
                supply_dict["last_order_date"] = db_datetime_to_utc_iso(row["last_order_date"])
            if row["last_modified_by"]:
                m = mem_map.get(str(row["last_modified_by"]))
                _attach_last_modified_names(supply_dict, m)
            supplies.append(supply_dict)
        return supplies
    finally:
        cur.close()
        conn.close()


def get_supply(supply_id: int) -> dict:
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    try:
        row = repo.fetch_supply_detail_aggregate_row(cur, supply_id)
        if not row:
            raise CatalogError(404, {"error": "Supply not found"})
        cf = parse_custom_fields_cell(row.get("custom_fields"))
        loc_rows = repo.fetch_locations_ordered_for_supply(cur, supply_id)
        teams = repo.fetch_teams_for_supply_ordered(cur, supply_id)
        category_ids = repo.fetch_categories_for_supply_ordered(cur, supply_id)
        supply_dict = {
            "id": row["id"],
            "public_id": row["public_id"],
            "name": row["name"],
            "description": row["description"],
            "image": effective_supply_image(row.get("image"), row.get("type_image")),
            "type_has_template_image": bool(row.get("type_image")),
            "custom_fields": cf,
            "supply_type_id": row.get("supply_type_id"),
            "type_name": row.get("type_name"),
            "lastModified": db_datetime_to_utc_iso(row["last_modified"]),
            "last_modified_by": row["last_modified_by"],
            "totalQty": int(row["totalQty"]),
            "locations": location_db_rows_to_api(loc_rows),
            "teams": teams,
            "categories": category_ids,
        }
        if row["last_order_date"]:
            supply_dict["last_order_date"] = db_datetime_to_utc_iso(row["last_order_date"])
        if row["last_modified_by"]:
            m = repo.fetch_member_by_uf_id(cur, row["last_modified_by"])
            _attach_last_modified_names(supply_dict, m)
        return supply_dict
    finally:
        cur.close()
        conn.close()


def create_supply(data: dict, current_user_id: str) -> dict:
    if not data:
        raise CatalogError(400, {"error": "Request body is required"})
    if "name" not in data or not data["name"].strip():
        raise CatalogError(400, {"error": "Name is required"})

    conn = get_db()
    cur = conn.cursor(dictionary=True)
    try:
        custom_fields = data.get("custom_fields")
        supply_type_id_raw = data.get("supply_type_id")
        type_row = None
        tid_insert = None
        if supply_type_id_raw is not None and supply_type_id_raw != "":
            try:
                tid_insert = int(supply_type_id_raw)
            except (TypeError, ValueError):
                raise CatalogError(400, {"error": "Invalid supply_type_id"})
            type_row = repo.fetch_supply_type_row(cur, tid_insert)
            if not type_row:
                raise CatalogError(400, {"error": "Supply type not found"})
            custom_fields = merge_custom_fields_from_type(type_row, custom_fields)

        allowed = repo.fetch_allowed_custom_field_names(cur)
        ok, err = validate_custom_fields(custom_fields, allowed)
        if not ok:
            raise CatalogError(400, {"error": err})
        if type_row:
            okl, errl = validate_locked_custom_fields_filled(type_row, custom_fields, cur)
            if not okl:
                raise CatalogError(400, {"error": errl})

        name_final = data["name"].strip()
        desc_final = data.get("description", "").strip() or None

        if type_row and type_has_template_image(type_row):
            if data.get("image"):
                raise CatalogError(
                    400,
                    {
                        "error": "Items linked to a type that has a template image cannot use a separate item image.",
                    },
                )
            image_final = None
        else:
            image_final = data.get("image") or None
            if image_final and str(image_final).startswith("data:image"):
                base64_part = image_final.split(",", 1)[1] if "," in image_final else ""
                if len(base64_part) > 13_300_000:
                    raise CatalogError(400, {"error": "Image file size exceeds 10MB limit"})

        if type_row:
            okp, errp = validate_name_desc_prefixes(type_row, name_final, desc_final)
            if not okp:
                raise CatalogError(400, {"error": errp})

        cf_json = json.dumps(custom_fields) if custom_fields else None
        new_public_id = str(uuid.uuid4())
        supply_id = repo.insert_supply(
            cur,
            new_public_id,
            name_final,
            desc_final,
            image_final,
            cf_json,
            data.get("last_order_date") or None,
            current_user_id,
            tid_insert,
        )

        cats_final = merge_categories_with_type_locks(type_row, data.get("categories"))
        teams_final = merge_teams_with_type_locks(type_row, data.get("teams"))

        for team_name in teams_final:
            repo.insert_supply_team_ignore(cur, supply_id, team_name)

        for cat_id in cats_final:
            repo.insert_supply_category_ignore(cur, supply_id, cat_id)

        new_values = {
            "name": name_final,
            "description": desc_final,
            "image": image_final,
            "last_order_date": data.get("last_order_date") or None,
        }
        history_id = log_supply_history(conn, supply_id, "CREATE", {}, new_values, current_user_id)
        log_team_changes(conn, history_id, [], teams_final)
        log_category_changes(conn, history_id, [], cats_final)

        conn.commit()

        row = repo.fetch_supply_with_type_join(cur, supply_id)
        cf = parse_custom_fields_cell(row.get("custom_fields"))
        teams = repo.fetch_teams_for_supply_ordered(cur, supply_id)
        category_ids = repo.fetch_categories_for_supply_ordered(cur, supply_id)
        supply = Supply.from_dict(row).to_dict()
        supply["public_id"] = row.get("public_id")
        supply["image"] = effective_supply_image(row.get("image"), row.get("type_image"))
        supply["type_has_template_image"] = bool(row.get("type_image"))
        supply["custom_fields"] = cf
        supply["supply_type_id"] = row.get("supply_type_id")
        supply["type_name"] = row.get("type_name")
        supply["totalQty"] = 0
        supply["locations"] = []
        supply["teams"] = teams
        supply["categories"] = category_ids
        return supply
    except mysql.connector.IntegrityError:
        conn.rollback()
        raise
    except CatalogError:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def update_supply(supply_id: int, data: dict, current_user_id: str) -> dict:
    if not data:
        raise CatalogError(400, {"error": "Request body is required"})

    conn = get_db()
    cur = conn.cursor(dictionary=True)
    try:
        supply_check = repo.fetch_supply_id_type(cur, supply_id)
        if not supply_check:
            raise CatalogError(
                404,
                {
                    "error": "Supply not found",
                    "error_type": "SUPPLY_DELETED",
                    "supply_id": supply_id,
                    "message": "This item was deleted by another user. Please refresh the page to see the latest data.",
                },
            )

        current_state = get_supply_current_state(conn, supply_id)
        old_values = {
            "name": current_state["name"],
            "description": current_state["description"],
            "image": current_state["image"],
            "last_order_date": current_state["last_order_date"],
        }
        old_teams = current_state["teams"]
        old_categories = current_state["categories"]

        requested_type_present = "supply_type_id" in data
        unlink_from_type = bool(data.get("unlink_from_type")) or (
            requested_type_present and (data.get("supply_type_id") is None or data.get("supply_type_id") == "")
        )
        old_type_id = supply_check.get("supply_type_id")
        effective_type_id = None if unlink_from_type else old_type_id
        type_row_update = None
        if requested_type_present and not unlink_from_type:
            try:
                effective_type_id = int(data.get("supply_type_id"))
            except (TypeError, ValueError):
                raise CatalogError(400, {"error": "Invalid supply_type_id"})
            type_row_update = repo.fetch_supply_type_row(cur, effective_type_id)
            if not type_row_update:
                raise CatalogError(400, {"error": "Supply type not found"})
        if effective_type_id:
            if not type_row_update:
                type_row_update = repo.fetch_supply_type_row(cur, effective_type_id)
                if not type_row_update:
                    effective_type_id = None

        has_type_template_image = type_has_template_image(type_row_update)

        if "image" in data and data["image"] and has_type_template_image:
            raise CatalogError(
                400,
                {
                    "error": "Items linked to a type that has a template image cannot use a separate item image.",
                },
            )

        if "image" in data and data["image"] and not has_type_template_image:
            img = data["image"]
            if str(img).startswith("data:image"):
                base64_part = img.split(",", 1)[1] if "," in img else ""
                if len(base64_part) > 13_300_000:
                    raise CatalogError(400, {"error": "Image file size exceeds 10MB limit"})

        merged_cf_for_update = None
        if "custom_fields" in data:
            allowed = repo.fetch_allowed_custom_field_names(cur)
            cf_work = data.get("custom_fields")
            if effective_type_id and type_row_update:
                cf_work = merge_custom_fields_from_type(type_row_update, cf_work)
            ok, err = validate_custom_fields(cf_work, allowed)
            if not ok:
                raise CatalogError(400, {"error": err})
            if type_row_update:
                okl, errl = validate_locked_custom_fields_filled(type_row_update, cf_work, cur)
                if not okl:
                    raise CatalogError(400, {"error": errl})
            merged_cf_for_update = cf_work

        if type_row_update and ("name" in data or "description" in data):
            prop_name = (
                data["name"].strip()
                if ("name" in data and data.get("name") is not None and str(data.get("name", "")).strip())
                else current_state["name"]
            )
            prop_desc = (
                (data["description"].strip() or None)
                if "description" in data
                else current_state["description"]
            )
            okp, errp = validate_name_desc_prefixes(type_row_update, prop_name, prop_desc)
            if not okp:
                raise CatalogError(400, {"error": errp})

        updates = []
        values = []
        if "name" in data:
            updates.append("name = %s")
            values.append(data["name"].strip())
        if "description" in data:
            updates.append("description = %s")
            values.append(data["description"].strip() or None)
        if has_type_template_image:
            updates.append("image = %s")
            values.append(None)
        elif "image" in data:
            updates.append("image = %s")
            values.append(data["image"] or None)
        if "last_order_date" in data:
            updates.append("last_order_date = %s")
            values.append(data["last_order_date"] or None)
        if "custom_fields" in data:
            updates.append("custom_fields = %s")
            values.append(json.dumps(merged_cf_for_update) if merged_cf_for_update else None)

        if unlink_from_type or requested_type_present:
            updates.append("supply_type_id = %s")
            values.append(None if unlink_from_type else effective_type_id)

        updates.append("last_modified_by = %s")
        values.append(current_user_id)
        values.append(supply_id)

        if updates:
            repo.update_supply_columns(cur, updates, values)

        type_for_team_cat_merge = None if unlink_from_type else type_row_update

        if "teams" in data:
            repo.delete_teams_for_supply(cur, supply_id)
            merged_teams = merge_teams_with_type_locks(type_for_team_cat_merge, data.get("teams"))
            for team_name in merged_teams:
                repo.insert_supply_team(cur, supply_id, team_name)

        if "categories" in data:
            repo.delete_categories_for_supply(cur, supply_id)
            merged_cats = merge_categories_with_type_locks(type_for_team_cat_merge, data.get("categories"))
            for cat_id in merged_cats:
                repo.insert_supply_category(cur, supply_id, cat_id)

        if has_type_template_image:
            image_for_history = None
        elif "image" in data:
            image_for_history = data["image"] or None
        else:
            image_for_history = old_values["image"]

        new_values = {
            "name": data.get("name", old_values["name"]).strip()
            if "name" in data
            else old_values["name"],
            "description": (data.get("description", "").strip() or None)
            if "description" in data
            else old_values["description"],
            "image": image_for_history,
            "last_order_date": data["last_order_date"]
            if "last_order_date" in data
            else old_values["last_order_date"],
        }
        history_id = log_supply_history(conn, supply_id, "UPDATE", old_values, new_values, current_user_id)

        if "teams" in data:
            new_teams = merge_teams_with_type_locks(type_for_team_cat_merge, data.get("teams"))
        else:
            new_teams = old_teams

        if "categories" in data:
            new_categories = merge_categories_with_type_locks(type_for_team_cat_merge, data.get("categories"))
        else:
            new_categories = old_categories
        log_team_changes(conn, history_id, old_teams, new_teams)
        log_category_changes(conn, history_id, old_categories, new_categories)

        conn.commit()

        row = repo.fetch_supply_with_type_join(cur, supply_id)
        cf = parse_custom_fields_cell(row.get("custom_fields"))
        supply = Supply.from_dict(row).to_dict()
        supply["public_id"] = row.get("public_id")
        supply["image"] = effective_supply_image(row.get("image"), row.get("type_image"))
        supply["type_has_template_image"] = bool(row.get("type_image"))
        supply["custom_fields"] = cf
        supply["supply_type_id"] = row.get("supply_type_id")
        supply["type_name"] = row.get("type_name")

        total_qty = repo.sum_location_qty(cur, supply_id)
        loc_rows = repo.fetch_locations_ordered_for_supply(cur, supply_id)
        teams = repo.fetch_teams_for_supply_ordered(cur, supply_id)
        category_ids = repo.fetch_categories_for_supply_ordered(cur, supply_id)

        supply["totalQty"] = int(total_qty)
        supply["locations"] = location_db_rows_to_api(loc_rows)
        supply["teams"] = teams
        supply["categories"] = category_ids

        if row["last_modified_by"]:
            m = repo.fetch_member_by_uf_id(cur, row["last_modified_by"])
            _attach_last_modified_names(supply, m)
        return supply
    except mysql.connector.IntegrityError:
        conn.rollback()
        raise
    except CatalogError:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def delete_supply(supply_id: int, current_user_id: str) -> None:
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    try:
        supply_check = repo.fetch_supply_id_name(cur, supply_id)
        if not supply_check:
            raise CatalogError(
                404,
                {
                    "error": "Supply not found",
                    "error_type": "SUPPLY_DELETED",
                    "supply_id": supply_id,
                    "message": "This item was already deleted by another user. Please refresh the page to see the latest data.",
                },
            )

        current_state = get_supply_current_state(conn, supply_id)
        old_values = {
            "name": current_state["name"],
            "description": current_state["description"],
            "image": current_state["image"],
            "last_order_date": current_state["last_order_date"],
        }
        old_teams = current_state["teams"]
        old_categories = current_state["categories"]

        history_id = log_supply_history(conn, supply_id, "DELETE", old_values, {}, current_user_id)
        log_team_changes(conn, history_id, old_teams, [])
        log_category_changes(conn, history_id, old_categories, [])
        snapshot_supply_locations_before_delete(conn, supply_id, supply_check["name"], current_user_id)
        repo.delete_supply_by_id(cur, supply_id)
        conn.commit()
    except CatalogError:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def get_supply_history(
    supply_id_filter: Optional[int],
    action_type_filter: Optional[str],
    limit: int,
    offset: int,
) -> dict:
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    try:
        total, rows = repo.fetch_supply_history_count_and_rows(
            cur, supply_id_filter, action_type_filter, limit, offset
        )
        history_entries = []
        for row in rows:
            user = repo.fetch_member_by_uf_id(cur, row["changed_by"])
            team_changes = [
                {"team_name": t["team_name"], "action": t["action"]}
                for t in repo.fetch_history_teams(cur, row["id"])
            ]
            category_changes = [
                {"category_id": c["category_id"], "action": c["action"]}
                for c in repo.fetch_history_categories(cur, row["id"])
            ]

            can_undo = False
            undo_removes_log_only = False
            if row["action_type"] == "DELETE":
                can_undo = True
            elif row["action_type"] == "CREATE":
                can_undo = True
                undo_removes_log_only = row["supply_id"] is None
            elif row["action_type"] == "UPDATE":
                can_undo = True
                undo_removes_log_only = row["supply_id"] is None

            history_entries.append(
                {
                    "id": row["id"],
                    "supply_id": row["supply_id"],
                    "supply_name": row["supply_name"],
                    "action_type": row["action_type"],
                    "old_name": row["old_name"],
                    "new_name": row["new_name"],
                    "old_description": row["old_description"],
                    "new_description": row["new_description"],
                    "old_image": row["old_image"],
                    "new_image": row["new_image"],
                    "old_last_order_date": db_datetime_to_utc_iso(row["old_last_order_date"]),
                    "new_last_order_date": db_datetime_to_utc_iso(row["new_last_order_date"]),
                    "changed_by": row["changed_by"],
                    "changed_by_name": f"{user['first_name']} {user['last_name']}" if user else None,
                    "changed_by_email": user["uf_email"] if user else None,
                    "changed_at": db_datetime_to_utc_iso(row["changed_at"]),
                    "can_undo": can_undo,
                    "undo_removes_log_only": undo_removes_log_only,
                    "team_changes": team_changes,
                    "category_changes": category_changes,
                }
            )
        return {"history": history_entries, "total": total}
    finally:
        cur.close()
        conn.close()


def undo_supply_history(history_id: int, current_user_id: str) -> dict:
    conn = get_db()
    cur = conn.cursor(dictionary=True)
    restored_supply_id = None
    try:
        history = repo.fetch_history_row(cur, history_id)
        if not history:
            raise CatalogError(404, {"error": "History entry not found"})

        if not session.get("is_leader", False):
            if not is_latest_global_history_timestamp(cur, history["changed_at"]):
                raise CatalogError(
                    403,
                    {"error": "Only the most recent action can be undone.", "error_type": "UNDO_NOT_LATEST"},
                )

        original_supply_id = history["supply_id"]
        if not original_supply_id and history["action_type"] == "DELETE":
            if history["old_name"]:
                name_matches = repo.select_supply_ids_by_name(cur, history["old_name"])
                if len(name_matches) > 1:
                    raise CatalogError(
                        400,
                        {
                            "error": "Cannot undo: multiple supplies share this name; disambiguation is not available for this history entry.",
                            "error_type": "UNDO_AMBIGUOUS_NAME",
                        },
                    )
                if len(name_matches) == 1:
                    original_supply_id = name_matches[0]

        team_changes = repo.fetch_history_teams(cur, history_id)
        category_changes = repo.fetch_history_categories(cur, history_id)

        if history["action_type"] == "CREATE":
            if history["supply_id"]:
                repo.delete_supply_by_id(cur, history["supply_id"])

        elif history["action_type"] == "UPDATE":
            if history["supply_id"]:
                if not repo.supply_exists_by_id(cur, history["supply_id"]):
                    raise CatalogError(
                        400,
                        {"error": "Cannot undo: supply no longer exists", "error_type": "UNDO_IMPOSSIBLE"},
                    )
                upd = []
                vals = []
                if history["old_name"]:
                    upd.append("name = %s")
                    vals.append(history["old_name"])
                if history["old_description"] is not None:
                    upd.append("description = %s")
                    vals.append(history["old_description"])
                if history["old_image"] is not None:
                    upd.append("image = %s")
                    vals.append(history["old_image"])
                if history["old_last_order_date"] is not None:
                    upd.append("last_order_date = %s")
                    vals.append(history["old_last_order_date"])
                upd.append("last_modified_by = %s")
                vals.append(current_user_id)
                vals.append(history["supply_id"])
                repo.update_supply_columns(cur, upd, vals)

                repo.delete_teams_for_supply(cur, history["supply_id"])
                for team_change in team_changes:
                    if team_change["action"] == "REMOVED":
                        repo.insert_supply_team_ignore(
                            cur, history["supply_id"], team_change["team_name"]
                        )

                repo.delete_categories_for_supply(cur, history["supply_id"])
                for cat_change in category_changes:
                    if cat_change["action"] == "REMOVED":
                        repo.insert_supply_category_ignore(
                            cur, history["supply_id"], cat_change["category_id"]
                        )

        elif history["action_type"] == "DELETE":
            restore_public_id = str(uuid.uuid4())
            if original_supply_id:
                repo.insert_supply_with_id(
                    cur,
                    original_supply_id,
                    restore_public_id,
                    history["old_name"],
                    history["old_description"],
                    history["old_image"],
                    history["old_last_order_date"],
                    current_user_id,
                )
                restored_supply_id = original_supply_id
            else:
                restored_supply_id = repo.insert_supply_without_id(
                    cur,
                    restore_public_id,
                    history["old_name"],
                    history["old_description"],
                    history["old_image"],
                    history["old_last_order_date"],
                    current_user_id,
                )

            for team_change in team_changes:
                if team_change["action"] == "REMOVED":
                    repo.insert_supply_team_ignore(cur, restored_supply_id, team_change["team_name"])

            for cat_change in category_changes:
                if cat_change["action"] == "REMOVED":
                    repo.insert_supply_category_ignore(
                        cur, restored_supply_id, cat_change["category_id"]
                    )

            snapshot_batch = repo.fetch_undo_snapshot_batch(
                cur, history["old_name"], history["changed_at"]
            )
            if snapshot_batch and snapshot_batch["batch_id"]:
                batch_id = snapshot_batch["batch_id"]
                for entry in repo.fetch_undo_snapshot_entries(cur, batch_id):
                    repo.insert_supplies_location_row(
                        cur,
                        restored_supply_id,
                        entry["location_name"],
                        entry["shelf"],
                        entry["old_amount"],
                        current_user_id,
                    )
                repo.delete_location_history_cascaded_batch(cur, batch_id)

        repo.delete_history_by_id(cur, history_id)
        conn.commit()

        response_data = {
            "success": True,
            "message": f'Successfully undid {history["action_type"]} action',
        }
        if history["action_type"] == "DELETE" and restored_supply_id is not None:
            response_data["restored_supply_id"] = restored_supply_id
        return response_data
    except CatalogError:
        conn.rollback()
        raise
    except mysql.connector.IntegrityError as e:
        conn.rollback()
        raise CatalogError(400, {"error": str(e), "error_type": "UNDO_IMPOSSIBLE"})
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def discard_supply_history(history_id: int) -> dict:
    conn = get_db()
    dcur = conn.cursor(dictionary=True)
    try:
        row = repo.fetch_history_id_and_changed_at(dcur, history_id)
        if not row:
            raise CatalogError(404, {"error": "History entry not found"})

        if not session.get("is_leader", False):
            if not is_latest_global_history_timestamp(dcur, row["changed_at"]):
                raise CatalogError(
                    403,
                    {"error": "Only the most recent action can be undone.", "error_type": "UNDO_NOT_LATEST"},
                )
    except CatalogError:
        dcur.close()
        conn.close()
        raise

    dcur.close()
    xcur = conn.cursor()
    try:
        xcur.execute("DELETE FROM supplies_history WHERE id = %s", (history_id,))
        conn.commit()
        return {"success": True, "discarded_id": history_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        xcur.close()
        conn.close()

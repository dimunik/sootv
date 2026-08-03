# -*- coding: utf-8 -*-
"""
Rebuild historical specialty mappings (1988–2003) into:
  - public/legacy-links.js  (merge with existing 740/835)
  - data/sootv.db           (full graph rebuild from all links)

Also re-parses 2014/2022 tables from public/data.js so SQLite stays in sync
with the browser runtime.
"""
from __future__ import annotations

import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

from docx import Document

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
LEGACY_LINKS_PATH = PUBLIC / "legacy-links.js"
DATA_JS_PATH = PUBLIC / "data.js"
DB_PATH = DATA / "sootv.db"

DOCX = {
    "order_623_1994": ROOT / "1994 623 Специальности.docx",
    "order_2714_2001": ROOT / "2001 2714 Специальности.docx",
    "order_4377_2003": ROOT / "2003 4377 Специальности.docx",
}

ORDERS = {
    "spo_224_1988": {
        "id": "spo_224_1988",
        "year": 1988,
        "number": "224",
        "title": "Приказ Гособразования СССР № 224 (перечень специальностей ссузов)",
    },
    "spo_4_1994": {
        "id": "spo_4_1994",
        "year": 1994,
        "number": "4",
        "title": "Постановление Госкомвуза РФ № 4 (классификатор специальностей СПО)",
    },
    "spo_2572_2001": {
        "id": "spo_2572_2001",
        "year": 2001,
        "number": "2572",
        "title": "Приказ Минобразования № 2572 (классификатор специальностей СПО)",
    },
    "ok_009_2003": {
        "id": "ok_009_2003",
        "year": 2003,
        "number": "276-СТ",
        "title": "ОК 009-2003 (классификатор специальностей)",
    },
    "npo_1362": {
        "id": "npo_1362",
        "year": 1999,
        "number": "1362",
        "title": "Постановление Правительства РФ № 1362 (профессии НПО)",
    },
    "order_354_2009": {
        "id": "order_354_2009",
        "year": 2009,
        "number": "354",
        "title": "Приказ МОиН № 354 (профессии НПО)",
    },
    "order_355_2009": {
        "id": "order_355_2009",
        "year": 2009,
        "number": "355",
        "title": "Приказ МОиН № 355 (специальности СПО)",
    },
    "order_1199_2013": {
        "id": "order_1199_2013",
        "year": 2013,
        "number": "1199",
        "title": "Приказ МОиН № 1199 (профессии и специальности СПО)",
    },
    "order_336_2022": {
        "id": "order_336_2022",
        "year": 2022,
        "number": "336",
        "title": "Приказ Минпросвещения № 336 (профессии и специальности СПО)",
    },
}

MAPPINGS = {
    "order_623_1994": {
        "id": "order_623_1994",
        "year": 1994,
        "number": "623",
        "title": "Приказ Госкомвуза № 623 (специальности 1994 ↔ 1988)",
        "from_order_id": "spo_4_1994",
        "to_order_id": "spo_224_1988",
        "entry_type": "specialty",
    },
    "order_2714_2001": {
        "id": "order_2714_2001",
        "year": 2001,
        "number": "2714",
        "title": "Приказ Минобразования № 2714 (специальности 2001 ↔ 1994)",
        "from_order_id": "spo_2572_2001",
        "to_order_id": "spo_4_1994",
        "entry_type": "specialty",
    },
    "order_4377_2003": {
        "id": "order_4377_2003",
        "year": 2003,
        "number": "4377",
        "title": "Приказ Минобразования № 4377 (ОК 009-2003 ↔ 2001)",
        "from_order_id": "ok_009_2003",
        "to_order_id": "spo_2572_2001",
        "entry_type": "specialty",
    },
    "order_740_2009": {
        "id": "order_740_2009",
        "year": 2009,
        "number": "740",
        "title": "Приказ МОиН № 740",
        "from_order_id": "order_354_2009",
        "to_order_id": "npo_1362",
        "entry_type": "profession",
    },
    "order_835_2009": {
        "id": "order_835_2009",
        "year": 2009,
        "number": "835",
        "title": "Приказ МОиН № 835",
        "from_order_id": "order_355_2009",
        "to_order_id": "ok_009_2003",
        "entry_type": "specialty",
    },
    "order_632_2014_prof": {
        "id": "order_632_2014_prof",
        "year": 2014,
        "number": "632",
        "title": "Приказ МОиН № 632 (прил. 1 — профессии)",
        "from_order_id": "order_1199_2013",
        "to_order_id": "order_354_2009",
        "entry_type": "profession",
    },
    "order_632_2014_spec": {
        "id": "order_632_2014_spec",
        "year": 2014,
        "number": "632",
        "title": "Приказ МОиН № 632 (прил. 2 — специальности)",
        "from_order_id": "order_1199_2013",
        "to_order_id": "order_355_2009",
        "entry_type": "specialty",
    },
    "order_336_2022_prof": {
        "id": "order_336_2022_prof",
        "year": 2022,
        "number": "336",
        "title": "Приказ Минпросвещения № 336 (профессии)",
        "from_order_id": "order_336_2022",
        "to_order_id": "order_1199_2013",
        "entry_type": "profession",
    },
    "order_336_2022_spec": {
        "id": "order_336_2022_spec",
        "year": 2022,
        "number": "336",
        "title": "Приказ Минпросвещения № 336 (специальности)",
        "from_order_id": "order_336_2022",
        "to_order_id": "order_1199_2013",
        "entry_type": "specialty",
    },
}


def normalize_name(name: str) -> str:
    text = str(name or "")
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^\-\s*", "", text)
    text = re.sub(r"\(в ред\..*?\)", "", text, flags=re.I)
    text = re.sub(r"Утратило силу\..*", "", text, flags=re.I)
    text = re.sub(r"Приказа?$", "", text, flags=re.I)
    return text.strip(" -;,:")


def is_code(text: str) -> bool:
    if not text:
        return False
    t = str(text).strip()
    return bool(
        re.fullmatch(r"\d{2}\.\d{2}\.\d{2}", t)
        or re.fullmatch(r"\d{2}\.\d{2}\.00", t)
        or re.fullmatch(r"\d{6}(\.\d{2})?", t)
        or re.fullmatch(r"\d{4}", t)
        or re.fullmatch(r"\d{1,2}\.\d{1,2}(\.\d+)?", t)
    )


def is_group_code(code: str) -> bool:
    if not code:
        return False
    return code.endswith(".00") or (
        len(code) == 6 and code.endswith("00") and "." not in code
    ) or (re.fullmatch(r"\d{4}", code) and code.endswith("00"))


def largest_table(doc: Document):
    return max(doc.tables, key=lambda t: len(t.rows))


def table_rows(doc_path: Path) -> list[list[str]]:
    doc = Document(doc_path)
    table = largest_table(doc)
    rows = []
    for row in table.rows:
        cells = [c.text.replace("\xa0", " ").replace("\n", " ").strip() for c in row.cells]
        rows.append(cells)
    return rows


def parse_four_col_mapping(
    rows: list[list[str]],
    mapping_id: str,
    from_order: str,
    to_order: str,
    entry_type: str,
) -> list[dict]:
    links = []
    for row in rows:
        if len(row) < 4:
            continue
        left_code = str(row[0] or "").strip()
        left_name = normalize_name(row[1])
        right_code = str(row[2] or "").strip()
        right_name = normalize_name(row[3])

        # Skip headers / notes / groups
        if left_code.lower() in {"код", "1"}:
            continue
        if "классификатор" in left_code.lower() or "наименование" in left_code.lower():
            continue
        if not re.fullmatch(r"\d{4}", left_code):
            continue
        if is_group_code(left_code):
            continue
        if re.search(r"перенесен", left_name, re.I) or re.search(r"перенесен", right_name, re.I):
            # keep only if both sides still have usable codes
            pass
        if not left_name and not right_name:
            continue
        if not right_code and not right_name:
            continue
        if right_code and not is_code(right_code) and not right_name:
            continue

        # Multiple right codes may be in one cell (rare) — keep first token if pure code
        if right_code and not is_code(right_code):
            # sometimes empty code with name only
            if not right_name:
                right_name = normalize_name(right_code)
                right_code = ""

        if is_group_code(right_code):
            continue

        if not right_name and left_name:
            right_name = left_name
        if not left_name and right_name:
            left_name = right_name

        # Skip pure transfer notes without a real left specialty
        if re.search(r"^перенесен", left_name, re.I) and not is_code(left_code):
            continue

        match_by_name = not is_code(left_code) and not is_code(right_code)
        link = {
            "mappingId": mapping_id,
            "from": {
                "orderId": from_order,
                "code": left_code,
                "name": left_name,
                "type": entry_type,
            },
            "to": {
                "orderId": to_order,
                "code": right_code or right_name,
                "name": right_name,
                "type": entry_type,
            },
        }
        if match_by_name:
            link["matchByName"] = True
        links.append(link)
    return links


def parse_4377(rows: list[list[str]]) -> list[dict]:
    """OK 009-2003 (left) → 2001 №2572 (right code only)."""
    links = []
    for row in rows:
        if len(row) < 3:
            continue
        left_code = str(row[0] or "").strip()
        left_name = normalize_name(row[1])
        right_code = str(row[2] or "").strip()

        if left_code.lower() in {"код", "1"}:
            continue
        if "классификатор" in left_code.lower() or "общероссийск" in left_code.lower():
            continue
        if not re.fullmatch(r"\d{6}", left_code):
            continue
        if is_group_code(left_code):
            continue
        if not re.fullmatch(r"\d{4}", right_code):
            continue
        if is_group_code(right_code):
            continue
        if not left_name:
            continue

        links.append(
            {
                "mappingId": "order_4377_2003",
                "from": {
                    "orderId": "ok_009_2003",
                    "code": left_code,
                    "name": left_name,
                    "type": "specialty",
                },
                "to": {
                    "orderId": "spo_2572_2001",
                    "code": right_code,
                    "name": left_name,  # name from OKSO; 2001 name filled via other mappings when possible
                    "type": "specialty",
                },
            }
        )
    return links


def load_existing_legacy_links() -> dict:
    text = LEGACY_LINKS_PATH.read_text(encoding="utf-8")
    m = re.search(r"window\.__SOOTV_LEGACY_LINKS__\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not m:
        raise RuntimeError("Cannot parse legacy-links.js")
    return json.loads(m.group(1).rstrip(";"))


def load_raw_parsed_data() -> dict:
    text = DATA_JS_PATH.read_text(encoding="utf-8")
    # Extract each window.__RAW_PARSED_DATA__["key"] = {...};
    pattern = re.compile(
        r'window\.__RAW_PARSED_DATA__\["([^"]+)"\]\s*=\s*',
        re.S,
    )
    matches = list(pattern.finditer(text))
    result = {}
    for i, m in enumerate(matches):
        key = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()
        if chunk.endswith(";"):
            chunk = chunk[:-1].strip()
        result[key] = json.loads(chunk)
    return result


def parse_table_mapping_runtime(rows, mapping_id, from_order, to_order, entry_type) -> list[dict]:
    """Mirror of public/data-runtime.js parseTableMapping."""
    links = []
    for i, row in enumerate(rows):
        if i == 0:
            continue  # skip header
        if not row:
            continue
        if len(row) == 1:
            continue
        if row[0] and "в ред." in row[0]:
            continue
        if len(row) > 1 and row[1] and "Утратило силу" in row[1]:
            continue

        new_code = str(row[0] or "").strip()
        new_name = normalize_name(row[1] if len(row) > 1 else "")
        old_code = str(row[2] or "").strip() if len(row) > 2 else ""
        old_name = normalize_name(row[3] if len(row) > 3 else (row[2] if len(row) > 2 else ""))

        if not new_code and not new_name:
            continue
        if is_group_code(new_code) or (new_code.endswith(".00") and not old_code):
            continue
        if (
            not is_code(new_code)
            and new_name
            and new_name == new_name.upper()
            and len(new_name) > 10
        ):
            continue
        if not is_code(new_code):
            continue

        if old_code and is_code(old_code):
            links.append(
                {
                    "mappingId": mapping_id,
                    "from": {
                        "orderId": from_order,
                        "code": new_code,
                        "name": new_name,
                        "type": entry_type,
                    },
                    "to": {
                        "orderId": to_order,
                        "code": old_code,
                        "name": old_name,
                        "type": entry_type,
                    },
                }
            )
        elif old_name:
            links.append(
                {
                    "mappingId": mapping_id,
                    "from": {
                        "orderId": from_order,
                        "code": new_code,
                        "name": new_name,
                        "type": entry_type,
                    },
                    "to": {
                        "orderId": to_order,
                        "code": old_code or old_name,
                        "name": old_name,
                        "type": entry_type,
                    },
                    "matchByName": not bool(old_code),
                }
            )
    return links


def is_valid_code(code: str) -> bool:
    return bool(code and re.match(r"^\d", code) and len(code) <= 15)


def build_dataset(all_links: list[dict]):
    next_entry_id = 1
    entry_map = {}
    name_index = defaultdict(dict)  # orderId -> normName.lower -> {code,name,id}
    entries_by_id = {}
    graph_links = []

    def entry_key(order_id, code, name):
        return f"{order_id}::{code or ''}::{normalize_name(name)}"

    def get_or_create_entry(order_id, code, name, entry_type):
        nonlocal next_entry_id
        norm_name = normalize_name(name)
        key = entry_key(order_id, code, norm_name)
        if key in entry_map:
            return entry_map[key]

        existing = name_index[order_id].get(norm_name.lower())
        if existing:
            existing_entry = entries_by_id[existing["id"]]
            incoming_has = is_valid_code(code)
            existing_has = is_valid_code(existing_entry["code"])
            if not incoming_has or not existing_has:
                if incoming_has and not existing_has:
                    existing_entry["code"] = code
                    existing_entry["search_text"] = f"{code} {existing_entry['name']}".lower()
                entry_map[key] = existing["id"]
                entry_map[entry_key(order_id, existing_entry["code"], norm_name)] = existing["id"]
                return existing["id"]

        order = ORDERS[order_id]
        entry = {
            "id": next_entry_id,
            "order_id": order_id,
            "code": code or norm_name,
            "name": norm_name,
            "entry_type": entry_type,
            "search_text": f"{code or norm_name} {norm_name}".lower(),
            "order_year": order["year"],
            "order_number": order["number"],
            "order_title": order["title"],
        }
        entry_map[key] = next_entry_id
        entries_by_id[next_entry_id] = entry
        name_index[order_id][norm_name.lower()] = {
            "code": code,
            "name": norm_name,
            "id": next_entry_id,
        }
        next_entry_id += 1
        return entry["id"]

    def resolve_entry(side, link):
        code = side["code"]
        name = side["name"]
        if link.get("matchByName") and not is_valid_code(code):
            found = name_index[side["orderId"]].get(normalize_name(name).lower())
            if found:
                code = found["code"]
                name = found["name"]
        eid = get_or_create_entry(side["orderId"], code, name, side["type"])
        norm = normalize_name(name).lower()
        existing = name_index[side["orderId"]].get(norm)
        if not existing or (is_valid_code(code) and not is_valid_code(existing["code"])):
            name_index[side["orderId"]][norm] = {"code": code, "name": name, "id": eid}
        return eid

    # Prefer filling names for 2001 codes from 2714 before 4377 edges that only have OKSO names
    def link_sort_key(link):
        order = [
            "order_623_1994",
            "order_2714_2001",
            "order_4377_2003",
            "order_740_2009",
            "order_835_2009",
            "order_632_2014_prof",
            "order_632_2014_spec",
            "order_336_2022_prof",
            "order_336_2022_spec",
        ]
        try:
            return order.index(link["mappingId"])
        except ValueError:
            return 999

    for link in sorted(all_links, key=link_sort_key):
        if link.get("identity"):
            continue
        from_id = resolve_entry(link["from"], link)
        to_id = resolve_entry(link["to"], link)
        if from_id == to_id:
            continue
        graph_links.append(
            {
                "from": from_id,
                "to": to_id,
                "mapping_id": link["mappingId"],
            }
        )

    return entries_by_id, graph_links


def write_legacy_links(legacy: dict) -> None:
    # Stable key order for readability
    ordered = {}
    for key in [
        "order_623_1994",
        "order_2714_2001",
        "order_4377_2003",
        "order_740_2009",
        "order_835_2009",
    ]:
        if key in legacy:
            ordered[key] = legacy[key]
    for key, val in legacy.items():
        if key not in ordered:
            ordered[key] = val

    payload = json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))
    LEGACY_LINKS_PATH.write_text(
        f"window.__SOOTV_LEGACY_LINKS__ = {payload};\n",
        encoding="utf-8",
    )


def rebuild_db(entries_by_id: dict, graph_links: list[dict]) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    # Remove wal/shm leftovers
    for suffix in ("", "-wal", "-shm"):
        p = Path(str(DB_PATH) + suffix) if suffix else DB_PATH
        if p.exists() and suffix:
            try:
                p.unlink()
            except OSError:
                pass

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.executescript(
        """
        PRAGMA foreign_keys = OFF;
        DROP TABLE IF EXISTS links;
        DROP TABLE IF EXISTS entries;
        DROP TABLE IF EXISTS mappings;
        DROP TABLE IF EXISTS orders;

        CREATE TABLE orders (
          id TEXT PRIMARY KEY,
          year INTEGER NOT NULL,
          number TEXT NOT NULL,
          title TEXT NOT NULL
        );

        CREATE TABLE mappings (
          id TEXT PRIMARY KEY,
          year INTEGER NOT NULL,
          number TEXT NOT NULL,
          title TEXT NOT NULL,
          from_order_id TEXT NOT NULL,
          to_order_id TEXT NOT NULL,
          entry_type TEXT NOT NULL
        );

        CREATE TABLE entries (
          id INTEGER PRIMARY KEY,
          order_id TEXT NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          entry_type TEXT NOT NULL,
          search_text TEXT NOT NULL
        );

        CREATE TABLE links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mapping_id TEXT NOT NULL,
          from_entry_id INTEGER NOT NULL,
          to_entry_id INTEGER NOT NULL
        );
        """
    )

    cur.executemany(
        "INSERT INTO orders (id, year, number, title) VALUES (?, ?, ?, ?)",
        [
            (o["id"], o["year"], o["number"], o["title"])
            for o in sorted(ORDERS.values(), key=lambda x: (x["year"], x["id"]))
        ],
    )
    cur.executemany(
        """
        INSERT INTO mappings
          (id, year, number, title, from_order_id, to_order_id, entry_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                m["id"],
                m["year"],
                m["number"],
                m["title"],
                m["from_order_id"],
                m["to_order_id"],
                m["entry_type"],
            )
            for m in sorted(MAPPINGS.values(), key=lambda x: (x["year"], x["id"]))
        ],
    )
    cur.executemany(
        """
        INSERT INTO entries (id, order_id, code, name, entry_type, search_text)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                e["id"],
                e["order_id"],
                e["code"],
                e["name"],
                e["entry_type"],
                e["search_text"],
            )
            for e in sorted(entries_by_id.values(), key=lambda x: x["id"])
        ],
    )
    cur.executemany(
        """
        INSERT INTO links (mapping_id, from_entry_id, to_entry_id)
        VALUES (?, ?, ?)
        """,
        [(g["mapping_id"], g["from"], g["to"]) for g in graph_links],
    )
    conn.commit()

    # Stats
    print("DB rebuilt:", DB_PATH)
    for row in cur.execute(
        "SELECT mapping_id, COUNT(*) FROM links GROUP BY mapping_id ORDER BY mapping_id"
    ):
        print(" ", row)
    for row in cur.execute(
        "SELECT order_id, entry_type, COUNT(*) FROM entries GROUP BY order_id, entry_type ORDER BY order_id"
    ):
        print(" ", row)
    print(
        " totals:",
        cur.execute("SELECT COUNT(*) FROM entries").fetchone()[0],
        "entries,",
        cur.execute("SELECT COUNT(*) FROM links").fetchone()[0],
        "links",
    )
    conn.close()


def improve_2001_names(links_4377: list[dict], links_2714: list[dict]) -> None:
    """Fill 2001 names on 4377 edges from 2714 left side when codes match."""
    by_code = {}
    for link in links_2714:
        code = link["from"]["code"]
        name = link["from"]["name"]
        if code and name:
            by_code[code] = name
    for link in links_4377:
        code = link["to"]["code"]
        if code in by_code:
            link["to"]["name"] = by_code[code]


def main():
    print("Parsing historical specialty DOCX...")
    rows_623 = table_rows(DOCX["order_623_1994"])
    rows_2714 = table_rows(DOCX["order_2714_2001"])
    rows_4377 = table_rows(DOCX["order_4377_2003"])

    links_623 = parse_four_col_mapping(
        rows_623, "order_623_1994", "spo_4_1994", "spo_224_1988", "specialty"
    )
    links_2714 = parse_four_col_mapping(
        rows_2714, "order_2714_2001", "spo_2572_2001", "spo_4_1994", "specialty"
    )
    links_4377 = parse_4377(rows_4377)
    improve_2001_names(links_4377, links_2714)

    print(f"  623: {len(links_623)} links")
    print(f"  2714: {len(links_2714)} links")
    print(f"  4377: {len(links_4377)} links")

    existing = load_existing_legacy_links()
    # Keep only old profession/specialty precomputed sets
    legacy = {
        "order_740_2009": existing.get("order_740_2009", []),
        "order_835_2009": existing.get("order_835_2009", []),
        "order_623_1994": links_623,
        "order_2714_2001": links_2714,
        "order_4377_2003": links_4377,
    }
    write_legacy_links(legacy)
    print("Wrote", LEGACY_LINKS_PATH)

    print("Parsing 2014/2022 tables from data.js...")
    raw = load_raw_parsed_data()
    data632 = raw.get("2014 632", {}).get("tables", [])
    data336 = raw.get("2022 336", {}).get("tables", [])

    links_632_prof = parse_table_mapping_runtime(
        data632[2] if len(data632) > 2 else [],
        "order_632_2014_prof",
        "order_1199_2013",
        "order_354_2009",
        "profession",
    )
    links_632_spec = parse_table_mapping_runtime(
        data632[3] if len(data632) > 3 else [],
        "order_632_2014_spec",
        "order_1199_2013",
        "order_355_2009",
        "specialty",
    )
    links_336_prof = parse_table_mapping_runtime(
        data336[2] if len(data336) > 2 else [],
        "order_336_2022_prof",
        "order_336_2022",
        "order_1199_2013",
        "profession",
    )
    links_336_spec = parse_table_mapping_runtime(
        data336[4] if len(data336) > 4 else [],
        "order_336_2022_spec",
        "order_336_2022",
        "order_1199_2013",
        "specialty",
    )
    print(
        f"  632 prof/spec: {len(links_632_prof)}/{len(links_632_spec)}; "
        f"336 prof/spec: {len(links_336_prof)}/{len(links_336_spec)}"
    )

    all_links = (
        links_623
        + links_2714
        + links_4377
        + legacy["order_740_2009"]
        + legacy["order_835_2009"]
        + links_632_prof
        + links_632_spec
        + links_336_prof
        + links_336_spec
    )
    print(f"Total raw links: {len(all_links)}")

    entries_by_id, graph_links = build_dataset(all_links)
    rebuild_db(entries_by_id, graph_links)

    # Connectivity smoke test: specialty chain depth from a modern OK code
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # BFS from a 2022 specialty if present
    sample = cur.execute(
        """
        SELECT id, code, name FROM entries
        WHERE order_id='order_336_2022' AND entry_type='specialty'
        LIMIT 1
        """
    ).fetchone()
    if sample:
        start = sample[0]
        visited = {start}
        queue = [start]
        years = set()
        while queue:
            cur_id = queue.pop(0)
            row = cur.execute(
                "SELECT order_id FROM entries WHERE id=?", (cur_id,)
            ).fetchone()
            years.add(ORDERS[row[0]]["year"])
            for a, b in cur.execute(
                """
                SELECT from_entry_id, to_entry_id FROM links
                WHERE from_entry_id=? OR to_entry_id=?
                """,
                (cur_id, cur_id),
            ):
                other = b if a == cur_id else a
                if other not in visited:
                    visited.add(other)
                    queue.append(other)
        print(
            f"Smoke lineage for {sample[1]} {sample[2]}: "
            f"{len(visited)} nodes, years={sorted(years)}"
        )
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a local global IUCN Red List status dataset for BirdNET species."""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_API_BASE = "https://api.iucnredlist.org/api/v4"
INAT_API_BASE = "https://api.inaturalist.org/v1"
DEFAULT_TOKEN_ENV = "IUCN_API_TOKEN"
# Local maintenance token used only by this manually executed updater.
IUCN_API_TOKEN = "Zg7cQQJnHgtki7jsWYzFocf9WZUUt7H7yrvp"
VALID_CATEGORIES = {"EX", "EW", "CR", "EN", "VU", "NT", "LC", "DD", "NE"}
CATEGORY_NAMES = {
    "EX": "Extinct",
    "EW": "Extinct in the Wild",
    "CR": "Critically Endangered",
    "EN": "Endangered",
    "VU": "Vulnerable",
    "NT": "Near Threatened",
    "LC": "Least Concern",
    "DD": "Data Deficient",
    "NE": "Not Evaluated",
}


@dataclass(frozen=True)
class BirdName:
    """Store the scientific name and API query components for one BirdNET entry."""

    scientific_name: str
    genus_name: str
    species_name: str
    infra_name: str | None = None


class IucnRequestError(RuntimeError):
    """Describe a failed IUCN request while retaining its HTTP status."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def parse_args() -> argparse.Namespace:
    """Define command-line options for repeatable local refreshes."""

    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description=(
            "Fetch current global IUCN assessments for the scientific names in "
            "lang/labels_en.txt and create a local JSON dataset."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=project_root / "lang" / "labels_en.txt",
        help="BirdNET label file containing Scientific name_Common name lines.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=project_root / "data" / "iucn-statuses.json",
        help="Generated website dataset.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=project_root / "data" / "iucn-update-report.json",
        help="Detailed unmatched, not-assessed, and failed-name report.",
    )
    parser.add_argument(
        "--details-output",
        type=Path,
        default=project_root / "data" / "iucn-details.json",
        help="Generated assessment narratives, ecology, population, and threats.",
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=project_root / "tools" / "iucn-statuses.checkpoint.json",
        help="Resumable working state, ignored by Git.",
    )
    parser.add_argument(
        "--api-base",
        default=DEFAULT_API_BASE,
        help="IUCN API base URL.",
    )
    parser.add_argument(
        "--token-env",
        default=DEFAULT_TOKEN_ENV,
        help="Environment variable containing the IUCN API token.",
    )
    parser.add_argument(
        "--auth-scheme",
        choices=("raw", "bearer"),
        default="raw",
        help="Send Authorization as the raw token or as 'Bearer TOKEN'.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.6,
        help="Minimum delay in seconds between species requests.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=6,
        help="Retries for rate limits and temporary server errors.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=45.0,
        help="HTTP request timeout in seconds.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process only the first N names for testing.",
    )
    parser.add_argument(
        "--restart",
        action="store_true",
        help="Ignore and replace an existing checkpoint.",
    )
    return parser.parse_args()


def load_bird_names(path: Path) -> list[BirdName]:
    """Read unique binomial and trinomial scientific names from a BirdNET label file."""

    if not path.is_file():
        raise FileNotFoundError(f"Bird list not found: {path}")

    names: dict[str, BirdName] = {}
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8-sig").splitlines(), start=1
    ):
        line = raw_line.strip()
        if not line:
            continue
        scientific_name = line.split("_", 1)[0].strip()
        parts = scientific_name.split()
        if len(parts) < 2:
            print(
                f"Skipping line {line_number}: invalid scientific name {scientific_name!r}",
                file=sys.stderr,
            )
            continue

        # The v4 endpoint accepts genus, species, and an optional infraspecific name.
        normalized_name = " ".join(parts[:3])
        names.setdefault(
            normalized_name.casefold(),
            BirdName(
                scientific_name=normalized_name,
                genus_name=parts[0],
                species_name=parts[1],
                infra_name=parts[2] if len(parts) >= 3 else None,
            ),
        )

    return sorted(names.values(), key=lambda bird: bird.scientific_name.casefold())


def read_json(path: Path, default: Any) -> Any:
    """Read JSON state while returning a safe default for a missing file."""

    if not path.is_file():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path: Path, payload: Any) -> None:
    """Write formatted UTF-8 JSON through a temporary file to avoid partial datasets."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    with temporary_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    temporary_path.replace(path)


def build_taxon_url(api_base: str, bird: BirdName) -> str:
    """Create the official v4 scientific-name lookup URL."""

    query = {
        "genus_name": bird.genus_name,
        "species_name": bird.species_name,
    }
    if bird.infra_name:
        query["infra_name"] = bird.infra_name
    return (
        f"{api_base.rstrip('/')}/taxa/scientific_name?"
        f"{urllib.parse.urlencode(query)}"
    )


def request_json(
    url: str,
    token: str,
    auth_scheme: str,
    timeout: float,
    max_retries: int,
) -> Any:
    """Request JSON with conservative retries for rate limiting and temporary failures."""

    authorization = token if auth_scheme == "raw" else f"Bearer {token}"
    headers = {
        "Accept": "application/json",
        "Authorization": authorization,
        "User-Agent": "Bird-Encyclopedia-IUCN-Updater/1.0",
    }

    for attempt in range(max_retries + 1):
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            if not retryable or attempt >= max_retries:
                body = error.read().decode("utf-8", errors="replace")[:500]
                raise IucnRequestError(
                    f"HTTP {error.code}: {body or error.reason}", error.code
                ) from error

            # Respect Retry-After when supplied and otherwise use jittered exponential backoff.
            retry_after = error.headers.get("Retry-After")
            try:
                wait_seconds = float(retry_after) if retry_after else 0.0
            except ValueError:
                wait_seconds = 0.0
            wait_seconds = max(
                wait_seconds,
                min(120.0, (2**attempt) + random.uniform(0.25, 1.25)),
            )
            print(
                f"HTTP {error.code}; retrying in {wait_seconds:.1f}s "
                f"({attempt + 1}/{max_retries})",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt >= max_retries:
                raise IucnRequestError(f"Network error: {error}") from error
            wait_seconds = min(120.0, (2**attempt) + random.uniform(0.25, 1.25))
            print(
                f"Network error; retrying in {wait_seconds:.1f}s "
                f"({attempt + 1}/{max_retries})",
                file=sys.stderr,
            )
            time.sleep(wait_seconds)

    raise IucnRequestError("Request failed after all retries")


def request_public_json(
    url: str,
    timeout: float,
    max_retries: int,
) -> Any:
    """Request a public JSON endpoint with the same conservative retry behavior."""

    headers = {
        "Accept": "application/json",
        "User-Agent": "Bird-Encyclopedia-IUCN-Updater/1.0",
    }
    for attempt in range(max_retries + 1):
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            if not retryable or attempt >= max_retries:
                body = error.read().decode("utf-8", errors="replace")[:500]
                raise IucnRequestError(
                    f"iNaturalist HTTP {error.code}: {body or error.reason}",
                    error.code,
                ) from error
            retry_after = error.headers.get("Retry-After")
            try:
                wait_seconds = float(retry_after) if retry_after else 0.0
            except ValueError:
                wait_seconds = 0.0
            wait_seconds = max(
                wait_seconds,
                min(120.0, (2**attempt) + random.uniform(0.25, 1.25)),
            )
            time.sleep(wait_seconds)
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt >= max_retries:
                raise IucnRequestError(
                    f"iNaturalist network error: {error}"
                ) from error
            time.sleep(min(120.0, (2**attempt) + random.uniform(0.25, 1.25)))

    raise IucnRequestError("iNaturalist request failed after all retries")


def recursive_values(value: Any, key_names: set[str]) -> list[Any]:
    """Collect values under known keys from API response variations."""

    found: list[Any] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key.casefold() in key_names:
                found.append(child)
            found.extend(recursive_values(child, key_names))
    elif isinstance(value, list):
        for child in value:
            found.extend(recursive_values(child, key_names))
    return found


def category_code(value: Any) -> str | None:
    """Normalize a category object or string to an official IUCN abbreviation."""

    if isinstance(value, str):
        candidate = value.strip().upper()
        return candidate if candidate in VALID_CATEGORIES else None
    if isinstance(value, dict):
        for key in ("code", "abbreviation", "category", "name"):
            code = category_code(value.get(key))
            if code:
                return code
    return None


def assessment_candidates(payload: Any) -> list[dict[str, Any]]:
    """Extract assessment dictionaries from the documented or nested response shapes."""

    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("assessments", "results", "result"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            return [value]

    # A single-assessment response can be used directly.
    return [payload]


def extract_assessment(payload: Any, requested_name: str) -> dict[str, Any] | None:
    """Select the latest global assessment and normalize fields needed by the website."""

    candidates = assessment_candidates(payload)
    normalized: list[dict[str, Any]] = []
    for assessment in candidates:
        category_values = recursive_values(
            assessment,
            {
                "red_list_category",
                "red_list_category_code",
                "redlistcategory",
                "category",
                "category_code",
            },
        )
        code = next(
            (found for value in category_values if (found := category_code(value))),
            None,
        )
        if not code:
            continue

        # Preserve stable source identifiers when the API includes them.
        assessment_id = assessment.get("assessment_id") or assessment.get(
            "assessmentId"
        )
        year = (
            assessment.get("year_published")
            or assessment.get("yearPublished")
            or assessment.get("assessment_year")
        )
        url = next(
            (
                value
                for value in recursive_values(assessment, {"url", "assessment_url"})
                if isinstance(value, str) and value.startswith("http")
            ),
            "",
        )
        latest_values = recursive_values(assessment, {"latest", "is_latest"})
        normalized.append(
            {
                "code": code,
                "category": code,
                "label": CATEGORY_NAMES[code],
                "authority": "IUCN Red List",
                "assessmentId": assessment_id,
                "assessmentYear": year,
                "url": url,
                "_latest": any(value is True for value in latest_values),
            }
        )

    if not normalized:
        return None

    # Prefer a response explicitly marked latest, then the highest numeric publication year.
    def sort_key(item: dict[str, Any]) -> tuple[int, int]:
        try:
            year_number = int(str(item.get("assessmentYear") or "0")[:4])
        except ValueError:
            year_number = 0
        return (1 if item["_latest"] else 0, year_number)

    selected = max(normalized, key=sort_key)
    selected.pop("_latest", None)
    selected["scientificName"] = requested_name
    selected["source"] = "IUCN Red List"
    return selected


def response_has_taxon(payload: Any) -> bool:
    """Distinguish an unmatched scientific name from a matched taxon without an assessment."""

    if payload is None:
        return False
    if isinstance(payload, list):
        return bool(payload)
    if isinstance(payload, dict):
        for key in ("taxon", "taxa", "result", "results", "assessments"):
            if key in payload:
                return bool(payload[key])
        return bool(payload)
    return False


def fetch_inaturalist_fallback(
    bird: BirdName,
    timeout: float,
    max_retries: int,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str]:
    """Return an exact-name iNaturalist global status and limited taxon details."""

    search_url = (
        f"{INAT_API_BASE}/taxa?"
        f"{urllib.parse.urlencode({'q': bird.scientific_name, 'per_page': 10})}"
    )
    search_payload = request_public_json(search_url, timeout, max_retries)
    results = (
        search_payload.get("results", [])
        if isinstance(search_payload, dict)
        else []
    )
    exact_taxon = next(
        (
            taxon
            for taxon in results
            if isinstance(taxon, dict)
            and str(taxon.get("name", "")).casefold()
            == bird.scientific_name.casefold()
        ),
        None,
    )
    if not exact_taxon:
        # Accept an explicit iNaturalist synonym match, such as a former species name.
        exact_taxon = next(
            (
                taxon
                for taxon in results
                if isinstance(taxon, dict)
                and str(taxon.get("matched_term", "")).casefold()
                == bird.scientific_name.casefold()
            ),
            None,
        )
    if not exact_taxon:
        # Accept an unambiguous reclassification where the species epithet became an infra-name.
        reclassified = [
            taxon
            for taxon in results
            if isinstance(taxon, dict)
            and str(taxon.get("name", "")).casefold().startswith(
                f"{bird.genus_name} ".casefold()
            )
            and str(taxon.get("name", "")).casefold().endswith(
                f" {bird.species_name}".casefold()
            )
            and taxon.get("rank") in {"subspecies", "variety", "form"}
        ]
        exact_taxon = reclassified[0] if len(reclassified) == 1 else None
    if not exact_taxon:
        return None, None, "iNaturalist scientific name or unambiguous synonym not found"

    detail_payload = request_public_json(
        f"{INAT_API_BASE}/taxa/{exact_taxon['id']}",
        timeout,
        max_retries,
    )
    detail_taxon = (
        detail_payload.get("results", [exact_taxon])[0]
        if isinstance(detail_payload, dict)
        and detail_payload.get("results")
        else exact_taxon
    )
    statuses = (
        detail_taxon.get("conservation_statuses", [])
        if isinstance(detail_taxon, dict)
        else []
    )
    global_status = next(
        (
            status
            for status in statuses
            if isinstance(status, dict)
            and not status.get("place")
            and "iucn" in str(status.get("authority", "")).casefold()
        ),
        None,
    )
    if not global_status:
        candidate = detail_taxon.get("conservation_status")
        global_status = candidate if isinstance(candidate, dict) else None
    code = category_code(global_status.get("status")) if global_status else None
    if not code:
        return None, None, "iNaturalist taxon found without a global IUCN status"

    status_url = global_status.get("url") or (
        f"https://www.inaturalist.org/taxa/{exact_taxon['id']}"
    )
    summary = {
        "code": code,
        "category": code,
        "label": CATEGORY_NAMES[code],
        "authority": "IUCN Red List via iNaturalist",
        "assessmentId": None,
        "assessmentYear": str(global_status.get("updated_at", ""))[:4] or None,
        "url": status_url,
        "scientificName": bird.scientific_name,
        "source": "iNaturalist fallback",
        "iNaturalistTaxonId": exact_taxon["id"],
        "iNaturalistScientificName": exact_taxon.get("name"),
        "matchedTerm": exact_taxon.get("matched_term"),
    }
    details = compact_value(
        {
            "scientificName": bird.scientific_name,
            "url": status_url,
            "category": code,
            "categoryLabel": CATEGORY_NAMES[code],
            "source": "iNaturalist fallback",
            "matchedScientificName": exact_taxon.get("name"),
            "assessmentDate": global_status.get("updated_at"),
            "documentation": {
                "abstract": detail_taxon.get("wikipedia_summary"),
            },
            "taxonomy": {
                "kingdom": detail_taxon.get("iconic_taxon_name"),
                "authority": detail_taxon.get("name"),
                "commonNames": [
                    {
                        "main": True,
                        "name": detail_taxon.get("preferred_common_name"),
                        "language": "en",
                    }
                ]
                if detail_taxon.get("preferred_common_name")
                else [],
            },
        }
    )
    return summary, details, "iNaturalist fallback"


def apply_inaturalist_fallback(
    checkpoint: dict[str, Any],
    bird: BirdName,
    timeout: float,
    max_retries: int,
    iucn_reason: str,
    missing_section: str,
) -> str:
    """Store an exact-name iNaturalist fallback or a combined missing-data reason."""

    fallback_status, fallback_details, fallback_result = fetch_inaturalist_fallback(
        bird,
        timeout=timeout,
        max_retries=max_retries,
    )
    if fallback_status:
        checkpoint["completed"][bird.scientific_name] = fallback_status
        checkpoint["details"][bird.scientific_name] = fallback_details or {}
        checkpoint["fallback"][bird.scientific_name] = {
            "reason": (
                f"{iucn_reason}; global status recovered from an exact name "
                "or controlled taxonomy alias in iNaturalist."
            ),
            "source": "iNaturalist",
            "acceptedScientificName": fallback_status.get(
                "iNaturalistScientificName"
            ),
            "matchedTerm": fallback_status.get("matchedTerm"),
        }
        checkpoint["notAssessed"].pop(bird.scientific_name, None)
        checkpoint["unmatched"].pop(bird.scientific_name, None)
        checkpoint["failed"].pop(bird.scientific_name, None)
        return f"{fallback_status['category']} via iNaturalist"

    checkpoint[missing_section][bird.scientific_name] = {
        "reason": f"{iucn_reason}. {fallback_result}."
    }
    checkpoint["failed"].pop(bird.scientific_name, None)
    return fallback_result


def english_description(value: Any) -> str:
    """Extract an English description from IUCN's localized value objects."""

    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        english = value.get("en")
        return english.strip() if isinstance(english, str) else ""
    return ""


def compact_value(value: Any) -> Any:
    """Remove empty nested values so the published details file stays reasonably small."""

    if isinstance(value, dict):
        compacted = {
            key: cleaned
            for key, child in value.items()
            if (cleaned := compact_value(child)) not in (None, "", [], {})
        }
        return compacted
    if isinstance(value, list):
        return [
            cleaned
            for child in value
            if (cleaned := compact_value(child)) not in (None, "", [], {})
        ]
    if isinstance(value, str):
        return value.strip()
    return value


def normalize_named_records(records: Any) -> list[dict[str, Any]]:
    """Normalize coded IUCN lists such as habitats, threats, actions, and systems."""

    if not isinstance(records, list):
        return []
    normalized: list[dict[str, Any]] = []
    for record in records:
        if not isinstance(record, dict):
            continue
        description = english_description(record.get("description"))
        name = record.get("name") or description
        item = compact_value(
            {
                "code": record.get("code"),
                "name": name,
                "description": description if description != name else None,
                "majorImportance": record.get("majorImportance"),
                "season": record.get("season"),
                "suitability": record.get("suitability"),
                "timing": record.get("timing"),
                "score": record.get("score"),
            }
        )
        if item:
            normalized.append(item)
    return normalized


def extract_assessment_details(payload: Any, scientific_name: str) -> dict[str, Any]:
    """Normalize useful assessment-detail fields while excluding large map geometries."""

    if not isinstance(payload, dict):
        return {}
    taxon = payload.get("taxon") if isinstance(payload.get("taxon"), dict) else {}
    supplementary = (
        payload.get("supplementary_info")
        if isinstance(payload.get("supplementary_info"), dict)
        else {}
    )
    documentation = (
        payload.get("documentation")
        if isinstance(payload.get("documentation"), dict)
        else {}
    )
    population_trend = payload.get("population_trend")
    trend_code = (
        population_trend.get("code")
        if isinstance(population_trend, dict)
        else population_trend
    )
    trend_label = (
        english_description(population_trend.get("description"))
        if isinstance(population_trend, dict)
        else ""
    )
    red_list_category = payload.get("red_list_category")
    category = category_code(red_list_category)

    # Publish prose, structured ecology, and numeric limits, but omit range polygons and points.
    details = {
        "scientificName": scientific_name,
        "source": "IUCN Red List API v4",
        "assessmentId": payload.get("assessment_id"),
        "assessmentDate": payload.get("assessment_date"),
        "yearPublished": payload.get("year_published"),
        "latest": payload.get("latest"),
        "url": payload.get("url"),
        "citation": payload.get("citation"),
        "criteria": payload.get("criteria"),
        "category": category,
        "categoryLabel": CATEGORY_NAMES.get(category or ""),
        "possiblyExtinct": payload.get("possibly_extinct"),
        "possiblyExtinctInTheWild": payload.get("possibly_extinct_in_the_wild"),
        "scope": normalize_named_records(payload.get("scopes")),
        "populationTrend": compact_value(
            {"code": trend_code, "label": trend_label}
        ),
        "population": compact_value(
            {
                "size": supplementary.get("population_size"),
                "numberOfLocations": supplementary.get("number_of_locations"),
                "numberOfSubpopulations": supplementary.get("no_of_subpopulations"),
                "largestSubpopulationIndividuals": supplementary.get(
                    "no_of_individuals_in_largest_subpopulation"
                ),
                "severelyFragmented": supplementary.get(
                    "population_severely_fragmented"
                ),
                "continuingDecline": supplementary.get(
                    "population_continuing_decline"
                ),
                "generationLength": supplementary.get("generational_length"),
            }
        ),
        "geographicRange": compact_value(
            {
                "lowerElevation": supplementary.get("lower_elevation_limit"),
                "upperElevation": supplementary.get("upper_elevation_limit"),
                "lowerDepth": supplementary.get("lower_depth_limit"),
                "upperDepth": supplementary.get("upper_depth_limit"),
                "estimatedAreaOfOccupancy": supplementary.get(
                    "estimated_area_of_occupancy"
                ),
                "estimatedExtentOfOccurrence": supplementary.get(
                    "estimated_extent_of_occurence"
                ),
                "numberOfLocations": supplementary.get("number_of_locations"),
                "narrative": documentation.get("range"),
            }
        ),
        "movementPatterns": supplementary.get("movement_patterns"),
        "documentation": compact_value(
            {
                "abstract": documentation.get("rationale"),
                "population": documentation.get("population"),
                "populationTrend": documentation.get("trend_justification"),
                "habitatAndEcology": documentation.get("habitats"),
                "threats": documentation.get("threats"),
                "conservationMeasures": documentation.get("measures"),
                "useAndTrade": documentation.get("use_trade"),
                "taxonomicNotes": documentation.get("taxonomic_notes"),
            }
        ),
        "taxonomy": compact_value(
            {
                "kingdom": taxon.get("kingdom_name"),
                "phylum": taxon.get("phylum_name"),
                "class": taxon.get("class_name"),
                "order": taxon.get("order_name"),
                "family": taxon.get("family_name"),
                "genus": taxon.get("genus_name"),
                "authority": taxon.get("authority"),
                "commonNames": taxon.get("common_names"),
                "synonyms": taxon.get("synonyms"),
                "specialistGroups": taxon.get("ssc_groups"),
            }
        ),
        "habitats": normalize_named_records(payload.get("habitats")),
        "threats": normalize_named_records(payload.get("threats")),
        "stresses": normalize_named_records(payload.get("stresses")),
        "conservationActions": normalize_named_records(
            payload.get("conservation_actions")
        ),
        "research": normalize_named_records(payload.get("researches")),
        "useAndTrade": normalize_named_records(payload.get("use_and_trade")),
        "systems": normalize_named_records(payload.get("systems")),
        "biogeographicalRealms": normalize_named_records(
            payload.get("biogeographical_realms")
        ),
        "references": payload.get("references"),
        "credits": payload.get("credits"),
    }
    return compact_value(details)


def build_checkpoint() -> dict[str, Any]:
    """Create an empty resumable state document."""

    return {
        "version": 3,
        "completed": {},
        "details": {},
        "fallback": {},
        "unmatched": {},
        "notAssessed": {},
        "failed": {},
    }


def main() -> int:
    """Fetch all requested assessments and publish deterministic local JSON files."""

    args = parse_args()
    # Prefer an optional environment override, otherwise use the local script token.
    token = os.environ.get(args.token_env, "").strip() or IUCN_API_TOKEN.strip()
    if not token:
        print(
            f"Missing token. Set IUCN_API_TOKEN in the script or the "
            f"{args.token_env} environment variable.",
            file=sys.stderr,
        )
        return 2

    birds = load_bird_names(args.input)
    if args.limit is not None:
        birds = birds[: max(0, args.limit)]
    if not birds:
        print("No valid scientific names were found.", file=sys.stderr)
        return 2

    checkpoint = (
        build_checkpoint()
        if args.restart
        else read_json(args.checkpoint, build_checkpoint())
    )
    if checkpoint.get("version", 1) < 2:
        # Version 1 could confuse taxon IDs with assessment IDs, so refresh its summaries once.
        checkpoint["version"] = 2
        checkpoint["completed"] = {}
        checkpoint["details"] = {}
        checkpoint["failed"] = {}
    if checkpoint.get("version", 1) < 3:
        # Retry earlier unmatched and unassessed names through the new iNaturalist fallback.
        checkpoint["version"] = 3
        checkpoint["unmatched"] = {}
        checkpoint["notAssessed"] = {}
        checkpoint["fallback"] = {}
    checkpoint.setdefault("details", {})
    checkpoint.setdefault("fallback", {})
    summary_names = {
        name.casefold()
        for section in ("completed", "unmatched", "notAssessed")
        for name in checkpoint.get(section, {})
    }
    detail_names = {
        name.casefold() for name in checkpoint.setdefault("details", {})
    }

    print(
        f"Loaded {len(birds):,} unique names; "
        f"{len(summary_names):,} summaries and {len(detail_names):,} details completed."
    )

    for position, bird in enumerate(birds, start=1):
        key = bird.scientific_name.casefold()
        if key in detail_names or bird.scientific_name in checkpoint.get(
            "unmatched", {}
        ):
            continue

        try:
            assessment = checkpoint.get("completed", {}).get(bird.scientific_name)
            if not assessment:
                payload = request_json(
                    url=build_taxon_url(args.api_base, bird),
                    token=token,
                    auth_scheme=args.auth_scheme,
                    timeout=args.timeout,
                    max_retries=args.max_retries,
                )
                assessment = extract_assessment(payload, bird.scientific_name)
            if assessment and assessment.get("assessmentId"):
                checkpoint["completed"][bird.scientific_name] = assessment
                detail_payload = request_json(
                    url=(
                        f"{args.api_base.rstrip('/')}/assessment/"
                        f"{assessment['assessmentId']}"
                    ),
                    token=token,
                    auth_scheme=args.auth_scheme,
                    timeout=args.timeout,
                    max_retries=args.max_retries,
                )
                checkpoint["details"][bird.scientific_name] = (
                    extract_assessment_details(
                        detail_payload, bird.scientific_name
                    )
                )
                result = f"{assessment['category']} + details"
            elif assessment:
                checkpoint["completed"][bird.scientific_name] = assessment
                result = f"{assessment['category']} (no assessment ID)"
            else:
                result = apply_inaturalist_fallback(
                    checkpoint=checkpoint,
                    bird=bird,
                    timeout=args.timeout,
                    max_retries=args.max_retries,
                    iucn_reason="IUCN API returned no global assessment",
                    missing_section=(
                        "notAssessed" if response_has_taxon(payload) else "unmatched"
                    ),
                )
            checkpoint["failed"].pop(bird.scientific_name, None)
            summary_names.add(key)
        except IucnRequestError as error:
            if error.status == 404:
                try:
                    result = apply_inaturalist_fallback(
                        checkpoint=checkpoint,
                        bird=bird,
                        timeout=args.timeout,
                        max_retries=args.max_retries,
                        iucn_reason=f"IUCN API returned HTTP 404 ({error})",
                        missing_section="unmatched",
                    )
                    summary_names.add(key)
                except IucnRequestError as fallback_error:
                    checkpoint["failed"][bird.scientific_name] = {
                        "status": fallback_error.status,
                        "error": (
                            f"IUCN failed with {error}; iNaturalist fallback "
                            f"failed with {fallback_error}"
                        ),
                    }
                    result = f"failed: {fallback_error}"
            else:
                checkpoint["failed"][bird.scientific_name] = {
                    "status": error.status,
                    "error": str(error),
                }
                result = f"failed: {error}"

        # Persist after every species so an interrupted multi-hour refresh resumes safely.
        write_json_atomic(args.checkpoint, checkpoint)
        print(f"[{position:,}/{len(birds):,}] {bird.scientific_name}: {result}")
        time.sleep(max(0.0, args.delay))

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    completed = checkpoint.get("completed", {})
    details = checkpoint.get("details", {})
    dataset = {
        "metadata": {
            "source": "IUCN Red List API v4",
            "generatedAt": generated_at,
            "input": str(args.input),
            "speciesCount": len(completed),
            "notAssessedCount": len(checkpoint.get("notAssessed", {})),
            "unmatchedCount": len(checkpoint.get("unmatched", {})),
            "failedCount": len(checkpoint.get("failed", {})),
            "iNaturalistFallbackCount": len(checkpoint.get("fallback", {})),
        },
        "statuses": dict(sorted(completed.items(), key=lambda item: item[0].casefold())),
    }
    details_dataset = {
        "metadata": {
            **dataset["metadata"],
            "detailsCount": len(details),
            "rangeGeometryIncluded": False,
        },
        "details": dict(sorted(details.items(), key=lambda item: item[0].casefold())),
    }
    report = {
        "metadata": dataset["metadata"],
        "notAssessed": checkpoint.get("notAssessed", {}),
        "unmatched": checkpoint.get("unmatched", {}),
        "failed": checkpoint.get("failed", {}),
        "iNaturalistFallback": checkpoint.get("fallback", {}),
    }
    write_json_atomic(args.output, dataset)
    write_json_atomic(args.details_output, details_dataset)
    write_json_atomic(args.report, report)

    print(f"Wrote {len(completed):,} assessments to {args.output}")
    print(f"Wrote {len(details):,} assessment details to {args.details_output}")
    print(f"Wrote update diagnostics to {args.report}")
    if checkpoint.get("failed"):
        print(
            "Some requests failed. Run the same command again to retry them.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

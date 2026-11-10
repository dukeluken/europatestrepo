"""Lädt TKKG-Cover nach public/tkkg_covers/ (Deezer, Fallback iTunes).

    python tkkg_cover_finder.py            # nur fehlende Cover laden
    python tkkg_cover_finder.py --force    # alle neu laden

Folgenliste: migration/data/tkkg-episodes.json
Zuordnung: Künstler "TKKG" oder "TKKG Retro-Archiv" (alte Folgen), nie "TKKG Junior";
reguläre Folgen über Folgennummer + Titel, Specials über den Titel.
"""
import json
import os
import re
import sys
import time
import unicodedata

import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "migration", "data", "tkkg-episodes.json")
OUTPUT_DIR = os.path.join(ROOT, "public", "tkkg_covers")
HEADERS = {"User-Agent": "EuropaRanking-Fanprojekt/1.0"}
ALLOWED_ARTISTS = {"tkkg", "tkkg retro-archiv"}
STOPWORDS = {"und", "der", "die", "das", "im", "in", "mit", "von", "den", "dem", "ein", "eine", "auf", "für", "fur"}


def tokens(value):
    # Bindestriche zusammenziehen: "Schokoladen-Museum" == "Schokoladenmuseum"
    normalized = unicodedata.normalize("NFKD", (value or "").replace("ß", "ss").replace("-", "")).encode("ascii", "ignore").decode("ascii").lower()
    return {t for t in re.findall(r"[a-z0-9]+", normalized) if t not in STOPWORDS}


def title_matches(candidate, target):
    wanted = tokens(target)
    return bool(wanted) and wanted.issubset(tokens(candidate))


def number_in_title(album_title):
    match = re.match(r"^\s*(?:Folge\s*)?0*(\d+)\s*[/:]", album_title, re.IGNORECASE)
    return int(match.group(1)) if match else None


def matches(album_title, artist, episode):
    if artist.strip().lower() not in ALLOWED_ARTISTS:
        return False
    if re.search(r"\b(junior|liest|gelesen)\b", album_title, re.IGNORECASE):
        return False
    if episode["nr"] == "Special":
        return title_matches(album_title, episode["titel"]) and number_in_title(album_title) is None
    # Reguläre Folgen: Nummer muss stimmen; beim Titel reicht ein gemeinsames Wort
    # (Schreibweisen weichen ab, z. B. "Geister-Auto" vs. "Geisterauto").
    return number_in_title(album_title) == episode["nr"] and bool(tokens(album_title) & tokens(episode["titel"]))


def search_deezer(term, episode):
    res = requests.get("https://api.deezer.com/search/album", params={"q": term}, headers=HEADERS, timeout=15)
    for album in res.json().get("data", []):
        if matches(album.get("title", ""), album.get("artist", {}).get("name", ""), episode):
            return album.get("cover_xl") or album.get("cover_big")
    return None


def search_itunes(term, episode):
    params = {"term": term, "country": "de", "media": "music", "entity": "album", "limit": 15}
    res = requests.get("https://itunes.apple.com/search", params=params, headers=HEADERS, timeout=15)
    for item in res.json().get("results", []):
        if matches(item.get("collectionName", ""), item.get("artistName", ""), episode):
            artwork = item.get("artworkUrl100", "")
            if artwork:
                return artwork.replace("100x100bb", "1000x1000bb")
    return None


def file_name(episode):
    if episode["nr"] == "Special":
        return f"tkkg_special_{episode['folgeId']}.jpg"
    return f"tkkg_folge_{episode['nr']:03d}.jpg"


def main():
    force = "--force" in sys.argv
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    episodes = json.load(open(DATA, encoding="utf-8"))["episodes"]
    found, missing = 0, []
    for episode in episodes:
        path = os.path.join(OUTPUT_DIR, file_name(episode))
        if os.path.exists(path) and not force:
            found += 1
            continue
        title = episode["titel"]
        terms = [f"TKKG {title}"]
        if episode["nr"] != "Special":
            terms += [f"TKKG {episode['nr']} {title}", f"TKKG Folge {episode['nr']}"]
        url = None
        for term in terms:
            url = search_deezer(term, episode) or search_itunes(term, episode)
            if url:
                break
            time.sleep(0.3)
        if not url:
            missing.append(f"{episode['folgeId']} {title}")
            print(f"Kein Cover: {episode['folgeId']} {title}")
            continue
        try:
            image = requests.get(url, headers=HEADERS, timeout=20)
            image.raise_for_status()
            with open(path, "wb") as handle:
                handle.write(image.content)
            found += 1
        except Exception as error:  # noqa: BLE001
            missing.append(f"{episode['folgeId']} {title} ({error})")
        time.sleep(0.25)
    print(f"\nFertig: {found} von {len(episodes)} Covern vorhanden.")
    if missing:
        print("Ohne Cover:\n  " + "\n  ".join(missing))


if __name__ == "__main__":
    main()

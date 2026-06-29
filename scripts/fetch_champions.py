#!/usr/bin/env python3
"""Fetch all League of Legends champions with splash art from Data Dragon."""

import json
import time
import urllib.request
from pathlib import Path

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SPLASH_DIR = DATA_DIR / "splash"


def fetch_json(url: str, retries: int = 3):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2)


VERSION = fetch_json("https://ddragon.leagueoflegends.com/api/versions.json")[0]
BASE = f"https://ddragon.leagueoflegends.com/cdn/{VERSION}/data"


def fetch_champions():
    zh = fetch_json(f"{BASE}/zh_CN/champion.json")
    en = fetch_json(f"{BASE}/en_US/champion.json")

    champions = []
    for champ_id, zh_data in zh["data"].items():
        en_data = en["data"][champ_id]
        splash_key = en_data["id"]
        champions.append(
            {
                "id": champ_id,
                "key": en_data["key"],
                "splash_key": splash_key,
                "name_zh": zh_data["name"],
                "name_en": en_data["name"],
                "title_zh": zh_data["title"],
                "splash_url": (
                    "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/"
                    f"{splash_key}_0.jpg"
                ),
                "icon_url": (
                    f"https://ddragon.leagueoflegends.com/cdn/{VERSION}/img/champion/"
                    f"{en_data['image']['full']}"
                ),
            }
        )

    champions.sort(key=lambda x: x["name_zh"])
    return champions, VERSION


def download_splash(champion: dict, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return True
    req = urllib.request.Request(
        champion["splash_url"],
        headers={"User-Agent": USER_AGENT, "Referer": "https://www.leagueoflegends.com/"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                dest.write_bytes(resp.read())
            return True
        except Exception as exc:
            if attempt == 2:
                print(f"  Failed {champion['name_zh']}: {exc}")
                return False
            time.sleep(1)
    return False


def main():
    print(f"Data Dragon version: {VERSION}")
    champions, version = fetch_champions()
    print(f"Found {len(champions)} champions")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SPLASH_DIR.mkdir(parents=True, exist_ok=True)

    meta = {
        "version": version,
        "source": "https://ddragon.leagueoflegends.com/",
        "count": len(champions),
        "champions": champions,
    }

    meta_path = DATA_DIR / "champions.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Saved metadata: {meta_path}")

    print("Downloading splash arts...")
    ok = 0
    for i, champ in enumerate(champions):
        filename = f"{champ['splash_key']}_{champ['name_zh']}.jpg"
        if download_splash(champ, SPLASH_DIR / filename):
            ok += 1
        if (i + 1) % 10 == 0:
            print(f"  Progress: {i + 1}/{len(champions)}")
        time.sleep(0.15)
    print(f"Downloaded {ok}/{len(champions)} splash images to {SPLASH_DIR}")


if __name__ == "__main__":
    main()

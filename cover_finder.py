import os
import re
import time
import requests

# Vollständige Folgenliste mit korrigierten Titeln (001 bis 241)
RAW_DATA = """
1und der Super-Papagei2und der Phantomsee3und der Karpatenhund4und die schwarze Katze5und der Fluch des Rubins6und der sprechende Totenkopf7und der unheimliche Drache8und der grüne Geist9und die rätselhaften Bilder10und die flüsternde Mumie11und das Gespensterschloss12und der seltsame Wecker13und der lachende Schatten14und das Bergmonster15und der rasende Löwe16und der Zauberspiegel17und die gefährliche Erbschaft18und die Geisterinsel19und der Teufelsberg20und die flammende Spur21und der tanzende Teufel22und der verschwundene Schatz23und das Aztekenschwert24und die silberne Spinne25und die singende Schlange26und die Silbermine27und der magische Kreis28und der Doppelgänger29Die Originalmusik30und das Riff der Haie31und das Narbengesicht32und der Ameisenmensch33und die bedrohte Ranch34und der rote Pirat35und der Höhlenmensch36und der Super-Wal37und der heimliche Hehler38und der unsichtbare Gegner39und die Perlenvögel40und der Automarder41und das Volk der Winde42und der weinende Sarg43und der höllische Werwolf44und der gestohlene Preis45und das Gold der Wikinger46und der schrullige Millionär47und der giftige Gockel48und die gefährlichen Fässer49und die Comic-Diebe50und der verschwundene Filmstar51und der riskante Ritt52und die Musikpiraten53und die Automafia54Gefahr im Verzug55Gekaufte Spieler56Angriff der Computer-Viren57Tatort Zirkus58und der verrückte Maler59Giftiges Wasser60Dopingmixer61und die Rache des Tigers62Spuk im Hotel63Fußball-Gangster64Geisterstadt65Diamantenschmuggel66und die Schattenmänner67und das Geheimnis der Särge68und der Schatz im Bergsee69Späte Rache70Schüsse aus dem Dunkel71Die verschwundene Seglerin72Dreckiger Deal73Poltergeist74und das brennende Schwert75Die Spur des Raben76Stimmen aus dem Nichts77Pistenteufel78Das leere Grab79Im Bann des Voodoo80Geheimakte UFO81Verdeckte Fouls82Die Karten des Bösen83Meuterei auf hoher See84Musik des Teufels85Feuerturm86Nacht in Angst87Wolfsgesicht88Vampir im Internet89Tödliche Spur90Der Feuerteufel91Labyrinth der Götter92Todesflug93und das Geisterschiff94Das schwarze Monster95Botschaft von Geisterhand96und der rote Rächer97Insektenstachel98Tal des Schreckens99Rufmord100Toteninsel101und das Hexen-Handy102Doppelte Täuschung103Das Erbe des Meisterdiebes104Gift per E-Mail105Der Nebelberg106Der Mann ohne Kopf107und der Schatz der Mönche108Die sieben Tore109Gefährliches Quiz110Panik im Park111Die Höhle des Grauens112Schlucht der Dämonen113Das Auge des Drachen114Die Villa der Toten115Auf tödlichem Kurs116Codename: Cobra117Der finstere Rivale118Das düstere Vermächtnis119Der geheime Schlüssel120Der schwarze Skorpion121Spur ins Nichts122und der Geisterzug123Fußballfieber124Geister-Canyon125Feuermond126Schrecken aus dem Moor127Schwarze Madonna128Schatten über Hollywood129SMS aus dem Grab130Der Fluch des Drachen131Haus des Schreckens132Spuk im Netz133Fels der Dämonen134Der tote Mönch135Fluch des Piraten136und das versunkene Dorf137Pfad der Angst138Die geheime Treppe139Das Geheimnis der Diva140Stadt der Vampire141und die Fußball-Falle142Tödliches Eis143und die Poker-Hölle144Zwillinge der Finsternis145und die Rache der Samurai146Der Biss der Bestie147Grusel auf Campbell Castle148und die feurige Flut149Der namenlose Gegner150Geisterbucht151Schwarze Sonne152Skateboardfieber153und das Fußballphantom154Botschaft aus der Unterwelt155und der Meister des Todes156Im Netz des Drachen157Im Zeichen der Schlangen158und der Feuergeist159Nacht der Tiger160Geheimnisvolle Botschaften161Die blutenden Bilder162und der schreiende Nebel163und der verschollene Pilot164Fußball-Teufel165Im Schatten des Giganten166und die brennende Stadt167und das blaue Biest168GPS-Gangster169Die Spur des Spielers170Straße des Grauens171und das Phantom aus dem Meer172und der Eisenmann173Dämon der Rache174und das Tuch der Toten175Schattenwelt176und der gestohlene Sieg177Der Geist des Goldgräbers178Der gefiederte Schrecken179Die Rache des Untoten180und die flüsternden Puppen181Das Kabinett des Zauberers182Im Haus des Henkers183und der letzte Song184und der Hexengarten185und der Mann ohne Augen186Insel des Vergessens187und das silberne Amulett188Signale aus dem Jenseits189und der unsichtbare Passagier190und die Kammer der Rätsel191Verbrechen im Nichts192Im Bann des Drachen193Schrecken aus der Tiefe194und die Zeitreisende195Im Reich der Ungeheuer196Geheimnis des Bauchredners197Im Auge des Sturms198Die Legende der Gaukler199und der grüne Kobold200Feuriges Auge201Höhenangst202Das weiße Grab203Tauchgang ins Ungewisse204Der dunkle Wächter205Das rätselhafte Erbe206und der Mottenmann207Die falschen Detektive208Kelch des Schicksals209Kreaturen der Nacht210Die schweigende Grotte211und der Jadekönig212und der weiße Leopard213Der Fluch der Medusa214und der Geisterbunker215und die verlorene Zeit216Die Schwingen des Unheils217und der Kristallschädel218Im Netz der Lügen219und die Teufelsklippe220Im Wald der Gefahren221Manuskript des Satans222und die Gesetzlosen223und der Knochenmann224Die Yacht des Verrats225und der Puppenmacher226Die Spur der Toten227Melodie der Rache228Der Ruf der Krähen229Drehbuch der Täuschung230Der Tag der Toten231und der Dreiäugige Schakal232Die Stadt aus Gold233Die Nacht der Gewitter234und der lebende Tresor235und das Fantasmofon236Im Bann des Barrakudas237und der rote Büffel238Falsche Schuld239Das Geheimnis der sieben Palmen240und die schwarze Rose241Meister des Lichts
"""

OUTPUT_DIR = "ddf_covers"
os.makedirs(OUTPUT_DIR, exist_ok=True)

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

# Begriffe, die bei der Identifikation von Hauptserien-Folgen ausgeschlossen werden
EXCLUDE_KEYWORDS = ["kids", "die drei ??? kids", "zum film", "original-hörspiel zum film", "adventskalender"]

def clean_title_for_fallback(title: str) -> str:
    """Bereinigt Präfixe, Artikel und Bindestriche für eine flexible Zweitsuche."""
    clean = re.sub(r'^(und\s+(die|der|das)?\s*)', '', title, flags=re.IGNORECASE)
    clean = re.sub(r'^(die|der|das)\s+', '', clean, flags=re.IGNORECASE)
    return clean.replace('-', ' ').strip()

def search_deezer(search_term: str, target_title: str):
    """Sucht auf Deezer nach dem Cover."""
    url = f"https://api.deezer.com/search/album?q={requests.utils.quote(search_term)}"
    res = requests.get(url, headers=headers, timeout=10)
    data = res.json()
    
    for album in data.get("data", []):
        album_title = album.get("title", "")
        album_lower = album_title.lower()
        
        if any(bad in album_lower for bad in EXCLUDE_KEYWORDS):
            continue
            
        cleaned_target = clean_title_for_fallback(target_title).lower()
        if target_title.lower() in album_lower or cleaned_target in album_lower:
            cover_url = album.get("cover_xl") or album.get("cover_big")
            if cover_url:
                return cover_url
    return None

def search_itunes(search_term: str, target_title: str):
    """Fallback-Suche auf iTunes."""
    url = f"https://itunes.apple.com/search?term={requests.utils.quote(search_term)}&country=de&media=music&entity=album&limit=10"
    res = requests.get(url, headers=headers, timeout=10)
    data = res.json()
    
    for item in data.get("results", []):
        name = item.get("collectionName", "")
        name_lower = name.lower()
        
        if any(bad in name_lower for bad in EXCLUDE_KEYWORDS):
            continue
            
        cleaned_target = clean_title_for_fallback(target_title).lower()
        if target_title.lower() in name_lower or cleaned_target in name_lower:
            artwork = item.get("artworkUrl100", "")
            if artwork:
                return artwork.replace("100x100bb.jpg", "1400x1400bb.jpg")
    return None

# 1. Parsing der Rohdaten per Regex
matches = re.findall(r'(\d+)(.*?)(?=(?:\d+|$))', RAW_DATA.strip())
folgen = [(int(num), title.strip()) for num, title in matches if title.strip()]

print(f"🚀 Starte Cover-Download für {len(folgen)} Folgen...\n")

for nummer, titel in folgen:
    filepath = os.path.join(OUTPUT_DIR, f"ddf_folge_{nummer:03d}.jpg")
    
    # 1. Versuch: Deezer mit Exakttitel
    cover_url = search_deezer(f"Die drei ??? {titel}", titel)
    
    # 2. Versuch: Deezer mit Folgennummer + Titel
    if not cover_url:
        cover_url = search_deezer(f"Die drei ??? {nummer} {clean_title_for_fallback(titel)}", titel)
        
    # 3. Versuch: iTunes Fallback
    if not cover_url:
        cover_url = search_itunes(f"Die drei Fragezeichen {titel}", titel)
        
    if cover_url:
        try:
            img_bytes = requests.get(cover_url, headers=headers, timeout=10).content
            with open(filepath, "wb") as f:
                f.write(img_bytes)
            print(f"✅ Folge {nummer:03d} - {titel}")
        except Exception as e:
            print(f"❌ Fehler beim Speichern von Folge {nummer:03d}: {e}")
    else:
        print(f"⚠️ Folge {nummer:03d} ({titel}): Kein Cover gefunden.")
        
    time.sleep(0.15)

print(f"\n🎉 Fertig! Alle verfügbaren Cover liegen im Ordner '{OUTPUT_DIR}'.")
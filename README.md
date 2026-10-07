# Bazénový 3D konfigurátor

Interaktivní webový konfigurátor bazénu ve 3D (Three.js). Běží jako čistě statická stránka – bez build kroku a bez externích obrázků (všechny textury se generují procedurálně).

## Funkce

- **Tvar a rozměry** – obdélník, zaoblený obdélník, ovál, kruh; délka, šířka, poloměr rohů, hloubka, svažité dno (mělká / hluboká část)
- **Vstup** – schodiště přes celou šířku, boční, rohové, románské; nerezový žebřík
- **Povrch** – fólie, skleněná mozaika, dlažba v 7 barvách; 5 druhů lemu (koping)
- **Okolí** – terasa (dřevo, WPC, kámen, beton, trávník) s nastavitelnou šířkou
- **Technologie** – úprava vody, ohřev (tepelné čerpadlo / solární panely), podvodní LED světla s volbou barvy, protiproud
- **Doplňky** – teleskopické zastřešení, zahradní sprcha, lehátka se slunečníkem
- Animovaná hladina a kaustiky, stíny, režim **den / noc**, kóty, předvolené pohledy (3D, shora, bok, od hladiny)
- **Orientační cena** s rozpisem položek, plocha hladiny, objem vody
- Sdílení konfigurace odkazem (stav je v URL), export snímku PNG, JSON, tisk souhrnu
- Responzivní rozložení pro mobil

## Spuštění

Stránka používá ES moduly, proto ji otevřete přes lokální server (ne `file://`):

```bash
python3 -m http.server 8000
# pak otevřete http://localhost:8000
```

Lze ji nasadit i na GitHub Pages / libovolný statický hosting.

## Struktura

| Soubor | Obsah |
| --- | --- |
| `index.html` | kostra stránky, import map pro Three.js (CDN jsDelivr) |
| `css/style.css` | vzhled panelu a nástrojové lišty (světlý i tmavý režim) |
| `js/config.js` | katalog voleb, výchozí konfigurace, limity a **ceník** |
| `js/builder.js` | stavba 3D modelu (obrys, stěny, dno, schody, lem, terasa, doplňky, kóty) |
| `js/textures.js` | procedurální textury (fólie, mozaika, dřevo, kámen, tráva, voda, kaustiky) |
| `js/pricing.js` | výpočet orientační ceny |
| `js/main.js` | scéna, osvětlení, ovládací panel, akce |

Ceny v `js/config.js` jsou ilustrativní – upravte je podle vlastního ceníku.

# City & Metro

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · **English**

**Draw your own metro through real cities.**

City & Metro is a single-player metro planning and city management game for your browser. Start with one station, connect homes, business districts, campuses, and airports, cross rivers, and build a network of your own. Cities develop over time, and residents reconsider how they travel as your network grows.

**[Play online](https://city-and-metro.pages.dev)** · [Source repository](https://github.com/VinsonFung/city-and-metro) · [License](./LICENSE.txt)

The web edition **v2.7.0** brings London and 11 local train models, city-specific mechanics, Shenzhen, expanded Hong Kong and cross-border gates, the new network diagram and growth replay, city reviews, XL stations, and redesigned fare and batch station management. In-game release notes cover v2.6 and v2.7 separately. The world map, city transitions, city achievements, and three selectable line styles remain exclusive to the standalone edition.

## Maintenance and community editions

The original author, **VinsonFung**, will continue maintaining and updating this repository. **Please do not submit Pull Requests (PRs) to this repository.**

You are welcome to create a community edition under the non-commercial license and deploy it to your own website. Clearly identify it as a community modification and prominently display the following attribution and links:

- Original author: [VinsonFung](https://github.com/VinsonFung)
- Original game website: [City & Metro](https://city-and-metro.pages.dev)
- Original repository: [VinsonFung/city-and-metro](https://github.com/VinsonFung/city-and-metro)

**Commercial use of both the original game and community editions is strictly prohibited.** This includes paid access, sales, advertising, commercial sponsorship, and other monetization. Free distribution, modification, or renaming does not create an exception. Retain the license, copyright notices, and third-party attribution, explain your changes, and do not present a community edition as an official release.

Community-edition links will be collected and integrated into the original game website in the future, so players can discover and try different versions. Thank you for your understanding and cooperation.

## What you can do

- **Choose a city and era.** Eleven real cities and the separate Qingwan tutorial have distinct geography, development stages, and local goals. Free Build also lets you choose a starting year and unlock construction across the map.
- **Design your network.** Build underground, surface, and elevated lines, curves, loops, branches, and multilevel interchanges. Adjust platform directions, split or merge lines, and preview or undo drafts before construction.
- **Run a city's metro.** Choose unlimited funds or balance construction, operations, fares, grants, and debt in financial challenges. Use ridership, congestion, walking coverage, and construction impact reports to plan your next move.
- **Grow with the city.** New districts, airports, campuses, and attractions open over time. Historical events affect travel and the economy; complete facility-access tasks and review stage summaries and the city chronicle. Airports outside the map show direction, distance, and demand beyond the boundary; connect a line to their boundary entrance to serve them.
- **Watch the city move.** Switch between 2D, 2.5D, and underground views, follow trains into stations, and watch street traffic, landmarks, and night scenes. Ambient sound changes with the area on screen.

- **Let metro shape the city.** Residents gradually develop a metro habit after stations open, while new homes and jobs cluster around the network. Compare congestion over time and inspect the metro-led development layer.
- **Develop and decorate stations.** Add advertising and convenience stores, shopping streets, or integrated station developments for non-fare revenue. Choose station styles, theme colours, public art, and signs.
- **Hear from passengers.** The Metro Circle shows posts, replies, and satisfaction based on your current simulation. Follow residents across months, and choose from 22 local planning challenges across the eleven real cities.

- **Manage trains and services.** Buy, assign and sell 56 train models unlocked by city and era. Schedule morning peak, daytime, evening peak and night service, with separate directions on loops. Choose line speeds from 40–120 km/h and add express or short services.
- **Run the network in Metro Core.** Open the lower-right app for network, line, station, fleet and fare management, trends, maps and section load factors. Batch-change station sizes, commercial development and decoration. Trends follow line mergers and splits. Locate or automatically address persistent overload.
- **Take on contracts and commercial risk.** Financial challenges unlock tenders for new-line PPP, rail-plus-property and capacity projects. Payments depend on construction and service checks. Station commerce now pays maintenance costs and follows the economic cycle; low-traffic sites can lose money.
- **Meet compound objectives.** Tasks combine network, coverage, operations, financial or development conditions. Completing the core objective by expiry earns a partial reward. Late-opening facilities extend deadlines; closed facility subgoals are waived. Fare requirements explain what to restore. Existing tasks retain their progress.
- **Use twelve layers and four tools.** Inspect commute times, metro mode share and commercial development; measure distance and toggle line labels or task markers. Multi-select or box-select demolition and undo the batch at once.
- **Read city mechanics and reviews.** Explore historical rules, timelines and planning hints. Receive a city review when its historical era ends, export a poster, and build XL stations in later eras.
- **Connect Shenzhen and Hong Kong.** Build operating lines to border gates, manage surcharges and passengers, save before switching to the latest same-mode progress, and view the other city’s network.
- **Replay network growth.** Watch confirmed construction and demolition by month in the network diagram. Pause, scrub the timeline, pan or zoom. History is saved with this game; older saves replay from the records they contain.

Simplified Chinese, Traditional Chinese, and English are available under **Settings → Display → Language**. Phone layouts use a more compact default size, adjustable in Settings. Touch supports dragging and pinch-to-zoom.

During map loading, the city map fills the background as the logo is drawn stroke by stroke and stations light up. A metro-style progress bar tracks city, transport, and journey preparation. The animation follows the system's reduced-motion preference.

## Screenshots

All four screenshots were recaptured from local **v2.7.0** on 2026-11-08. They retain the original subjects and order and use isolated test progress without accessing player saves.

### Choose your city

The current version has twelve maps, including London and Shenzhen, each with an introduction, city mechanics, and a timeline grouped by era. Drag the region and era filters horizontally to see more options. The updated Hong Kong map shown here extends north to the border gates and includes the islands and airport.

![v2.7 map selection: twelve maps, Hong Kong details, and historical timeline](./img/screenshot-map-selection.png)

### Tokyo: begin with the Ginza Line

Start in 1950 with the Ginza Line's 18 stations between Asakusa and Shibuya. Study the neighborhoods and existing network in the daytime 2D view.

![v2.7 Tokyo: 1950 daytime 2D map and the starting Ginza Line](./img/screenshot-tokyo-day.png)

### Guangzhou: night on the Pearl River

Buildings, water, landmarks, and metro lines in 2.5D. This is the main menu's 2012 Guangzhou demonstration scene, with the interface hidden.

![v2.7 Guangzhou: 2.5D Pearl River nightscape and demonstration network](./img/screenshot-guangzhou-night.png)

### From the network to the city economy

Economic statistics show GDP, growth, local finances, and transport efficiency. This separate Guangzhou Free Build demonstration began in 2000, built a five-station line, and advanced two years through normal settlement to 2002. Earlier chart data comes from the simulation leading up to the starting year. All figures are game simulation results.

![v2.7 economic statistics: Guangzhou after two years with a five-station demonstration line](./img/screenshot-economy-statistics.png)

## Cities and starting conditions

| Map | Default year | Planning features |
| --- | --- | --- |
| Qingwan | 2000 | Fictional city, 13-step tutorial (~12 minutes), unlimited funds |
| Guangzhou | 1990 | The Pearl River, old city, Tianhe, Panyu, and University Town |
| Hangzhou | 2000 | West Lake, the Qiantang River, new districts, and Xiaoshan Airport |
| Hong Kong | 1970 | Mountains, harbor, new towns, reclamation, and Chek Lap Kok Airport |
| Taipei | 1990 | A basin, three rivers, and multiple urban centers |
| Beijing | 1990 | Take over 29 stations on Line 1 and the loop Line 2; connect ring roads, Olympic venues, and the subcenter |
| Tokyo | 1950 | Take over 18 Ginza Line stations; connect subcenters and Haneda Airport |
| Shanghai | 1990 | The Huangpu River, Pudong development, the World Expo, and Disneyland |
| Wuhan | 2000 | Three towns, two rivers, East Lake, Optics Valley, and Tianhe Airport |
| Paris | 1900 | A century of change, cross-city commuting, and two major airports |
| London | 1860 | Historic districts, docklands, world wars and pre-decimal fares |
| Shenzhen | 2000 | Reclamation, westward growth, Bao’an Airport, Universiade and border gates |

All eleven real cities support financial challenges and Free Build, with currency, fares, and financial parameters appropriate to each city and era. Later real-world metro lines do not appear automatically; you design the network.

## Running and saving

Open the [game website](https://city-and-metro.pages.dev) to play. You can also download this repository and open `index.html` in desktop Chrome, Edge, or Firefox, without installing dependencies or building the project.

Progress and settings are stored in your current browser; no account is needed. Autosaves, manual saves, save renaming, and JSON import/export are supported. Export a backup before changing computers, browsers, or website addresses. Unconfirmed construction drafts are not saved.

Supported older saves retain a raw backup before upgrading, preserving existing networks, fares, funds, debt, and past accounts. If loading fails, the save list offers an export of the original data.

## Common controls

Change bindings under **Settings → Controls**; in-game hints update with them.

| Action | Default controls |
| --- | --- |
| Pan / zoom | Left-drag, WASD / arrow keys; mouse wheel, `+` / `−` |
| Tools | `V` Select · `B` Build Station · `L` Draw Line · `E` Edit · `X` / `Delete` Demolish · `O` Measure |
| Draw a line | Click points; `Shift` + click adds a bend; right-click / `Enter` finishes |
| Batch demolition | In the demolition tool, `Ctrl` + click to select, `Shift` + drag to box-select; `Enter` / `Delete` executes |
| Draft | `Ctrl+Z` Undo · `Ctrl+Y` Redo · `Ctrl+Enter` Confirm Build |
| Time | `Space` Pause / Resume; `1` / `2` / `3` / `4` select speed; `.` advances one month |
| Views | `T` 2D / 2.5D · `U` Underground · `K` Network Map · `F` Full Map |
| Layers / immersion | `C` / `Shift+C` switches analysis layers · `H` hides / shows the interface |
| Shortcuts | `/` Search · `J` Tasks · `G` Statistics · `Ctrl+S` Save · `F10` Settings |
| Help / menu | `F1` Help; `Esc` pauses and opens the menu, or cancels / goes back in dialogs |

## Copyright and license

**Copyright © 2026 VinsonFung. All rights reserved. Commercial use is strictly prohibited.**

Non-commercial study, research, play, modification, and sharing are subject to [LICENSE.txt](./LICENSE.txt). Third-party code, data, and assets retain their own licenses. OpenStreetMap geographic data is provided under ODbL 1.0; see the [third-party notices](./THIRD_PARTY_NOTICES.txt).

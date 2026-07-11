# Rotterdam Time Machine

An interactive SvelteKit app for exploring, comparing, and studying georeferenced historical maps of Rotterdam over time. Historical map layers are loaded through Allmaps annotations and displayed on top of a modern Protomaps/MapLibre basemap.

_This project was initially developed as a student project in collaboration between Delft University of Technology Library, Rotterdam City Archive and MBO Techniek College Rotterdam._

## Features

- Explore historical maps with a vertical time slider
- Select multiple maps from the same year in the layers panel
- Compare two map views side by side or stacked on smaller screens
- Adjust opacity, map orientation, and map focus per map pane
- Filter by favorites and maps that overlap the current map view
- Search for locations with Nominatim, bounded to the map collection area
- Share the current map view through the URL
- Mobile layout with the same map and layer controls

## Local development

### Requirements

- [Node.js](https://nodejs.org/) 18 or higher
- [pnpm](https://pnpm.io/)

### Install

```bash
git clone https://github.com/allmaps/rotterdam-tijdmachine.git
cd rotterdam-tijdmachine
pnpm install
```

### Run

```bash
pnpm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Check And build

```bash
pnpm run check
pnpm run build
```

To run or build with alternate content files, set `CONFIG`:

```bash
CONFIG=content/gouda/config.yml pnpm run dev
CONFIG=content/gouda/config.yml pnpm run build
```

## Deploying to GitHub Pages

This repository is configured for GitHub Pages through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The workflow builds the static SvelteKit site and deploys the generated `build/` directory with GitHub's official Pages actions.

To enable deployment:

1. In GitHub, open **Settings > Pages** for the repository.
2. Set **Build and deployment > Source** to **GitHub Actions**.
3. Push to the `main` branch, or run **Deploy to GitHub Pages** manually from the **Actions** tab.

SvelteKit derives its base path from `site.url` in the selected config file. A root URL builds with no base path, while a URL with a path builds with that path:

```text
https://rotterdamtimemachine.nl/         -> BASE_PATH=<root>
https://pages.allmaps.org/time-machine/ -> BASE_PATH=/time-machine
```

`site.url` must match the final public URL, including any subpath. For custom domains, configure the domain in GitHub Pages settings; the app does not need a committed or generated `CNAME` file.

Before deploying a reused version of the app, update:

- `site.url` in `config.yml` to the final public URL, including the trailing slash
- `basemap.protomapsApiKey` to your own key, and allow the GitHub Pages origin in the Protomaps dashboard
- `CONFIG` as a repository variable, or the manual workflow input `config`, if you want to deploy an alternate config file

To deploy an alternate configuration, set the repository variable `CONFIG` to a file such as `content/gouda/config.yml`, or fill in the `config` input when manually running the workflow.

SvelteKit is configured with `@sveltejs/adapter-static` and `fallback: '404.html'`, so direct links with query parameters keep working on GitHub Pages.

## Reusing the app with different content

The app is structured so the most important content lives outside the components. To reuse it for another city, region, or map collection, you mainly need to edit these two files:

- `config.yml`: app settings, text, metadata, and UI labels
- `collection.yml`: historical map records and Georeference Annotation URLs or local annotation paths

The YAML files are parsed by `scripts/generate-annotations.ts`, which writes generated JSON files to `src/lib/generated/`. The app imports those generated JSON files through `src/lib/content.ts`. If you extend the YAML structure, also update the shared types in `src/lib/types.ts`.

By default, the app uses `config.yml`, which points to `collection.yml`. To keep multiple configurations in one repository, place alternate content packages in `content/` folders and select the configuration file with `CONFIG`:

```bash
CONFIG=content/gouda/config.yml pnpm run dev
CONFIG=content/gouda/config.yml pnpm run build
```

`CONFIG` selects the app configuration file. If it is omitted, the app falls back to `config.yml`. The selected config file then points to the collection with its top-level `collection` field. Bare collection filenames are resolved relative to the config file, so `content/gouda/config.yml` can use `collection: collection.yml`.

`CONFIG` is read when the Vite dev server starts. Stop and restart the dev server after switching to another config file; hot module replacement does not switch a running server from one content package to another.

### `config.yml`

Important sections:

- `collection`: YAML file with map records; bare filenames are resolved relative to the config file
- `site`: name, URL, description, and locale for metadata
- `site.shortName`: optional compact title used in the header on phone-sized screens
- `site.favicon`: optional favicon URL or path; overrides the bundled `static/favicon.svg`
- `theme.color`: hex or RGB value used for the primary UI color
- `theme.fonts`: optional custom font files and semantic font roles
- `map.defaultYear`: the year the app opens with by default
- `map.initialView`: default map view with `center`, `zoom`, and `bearing`
- `map.autoZoomOutThreshold`: zoom-level margin before the app zooms out to a selected map's native maximum zoom
- `map.visibilityPaddingPixels`: inset used when checking whether the selected map is meaningfully visible in the viewport
- `map.tinyVisibilityAreaRatio`: minimum screen-area ratio before a visible selected map is treated as too small to study
- `map.keyboard`: panning distance for keyboard map movement
- `basemap.protomapsApiKey`: API key used for Protomaps hosted basemap tiles
- `slider.scaleInterval`: year scale interval
- `slider.showOnlyAvailableYears`: show only years with available maps in the year picker
- `autoplay.intervalSeconds`: seconds per map slide in presentation mode; omit `autoplay` to hide the header play button
- `autoplay.flyToDurationMs`: camera animation duration when presentation mode focuses on a map
- `tour.enabled`: set to `false` to disable the one-time guided tour
- `search.appendPlaceName`: optional place name appended to Nominatim queries, for example `Rotterdam`
- `header`, `about`, `share`, `search`, `layers`, `controls`, `mapWarnings`: visible labels and modal text

For a new use case, usually start with:

1. Update `site.name`, `site.shortName`, `site.url`, and `site.description`.
2. Set `map.defaultYear` to a year that exists in your collection.
3. Set `map.initialView.center` to `[longitude, latitude]` for your area.
4. Set `theme.color` for the primary UI color, for example `color: "#006d2c"` or `color: rgb(0, 109, 44)`. Quote hex values in YAML. The app derives five semantic brand colors from that value: soft, muted, secondary, main, and hover.
5. Request your own free Protomaps API key at [protomaps.com/api](https://protomaps.com/api) and set it as `basemap.protomapsApiKey`.
6. Rewrite or translate the text under `tour`, `about`, `search`, `layers`, and `controls`.
7. Check `search.countryCodes` and `search.appendPlaceName` for the intended search area.

### Custom fonts

Noto Sans is bundled with the app and is always used as the fallback font. To use a custom font, place the font files in `static/fonts` and define them under `theme.fonts` in `config.yml`. Font paths are resolved through SvelteKit's base path, so both `fonts/ExampleSans-Regular.woff2` and `/fonts/ExampleSans-Regular.woff2` work when deploying under a subpath. Absolute font URLs, such as CDN-hosted `https://...` URLs, can also be used.

```yaml
theme:
  fonts:
    families:
      - name: Example Sans
        faces:
          - weight: 400
            style: normal
            files:
              - fonts/ExampleSans-Regular.woff2
          - weight: 700
            style: normal
            files:
              - fonts/ExampleSans-Bold.woff2
    roles:
      body: Noto Sans
      accent: Example Sans
      heading: Example Sans
      display: Example Sans
```

Font roles map to the app's internal Tailwind font classes:

- `body`: default page text
- `accent`: compact UI elements such as the header and slider
- `heading`: titles, badges, and shortcut key labels
- `display`: reserved for larger display text

Each role can be a single family name or a list, for example `heading: [Example Heading, Example Sans]`. The app automatically appends `Noto Sans, ui-sans-serif, system-ui, sans-serif` as fallback fonts. If `theme.fonts` is omitted, all roles use Noto Sans.

### Favicon

The favicon is served from `static/favicon.svg`. To reuse the app with another brand, replace that file with your own SVG favicon. The layout references it through SvelteKit's base path, so it also works when the app is deployed under a subpath.

Alternatively, set `site.favicon` in `config.yml` to point at a different favicon without replacing the bundled file. The value is used as-is, so it can be a relative path or an absolute URL, for example `favicon: https://example.org/logo.svg`. When `site.favicon` is omitted, the app falls back to `static/favicon.svg`.

### `collection.yml`

Each map in the collection has this shape:

```yaml
- label: Short title for the UI
  title: Full title or description
  year: 1897
  institution: Institution name
  url: https://example.org/item
  iiif:
    url: https://example.org/iiif/manifest.json
    type: manifest
  annotation: https://annotations.allmaps.org/manifests/example
```

Required fields:

- `label`: short name used in the slider, layer panel, and search results
- `title`: full title
- `year`: year used for sorting on the slider; this can be a single year such as `1897` or an inclusive range such as `1811/1832`
- `institution`: collection holder or institution
- `url`: public item page
- `annotation`: Georeference Annotation URL, or a path to a bundled annotation file in `static/`

Optional fields:

- `iiif.url`: IIIF Image API `info.json` or IIIF Presentation manifest
- `iiif.type`: `image` or `manifest`

Multiple maps can share the same year. The app will show previous/next buttons and a position indicator, for example `1/3`. Maps with a year range appear for every year in that range.

### Georeference Annotations

The app expects each map to have valid Georeference Annotations. During development and production builds, `scripts/generate-annotations.ts` reads the configured config and collection YAML files, sorts the collection by earliest year, fetches or reads every annotation, parses the annotations with Allmaps, and writes generated JSON assets to `src/lib/generated/`. `config.json` and `collection.json` are the runtime content files imported by the app. `collection.json` augments every collection record with its generated annotation ID and map IDs, while `maps.json` contains the unique georeferenced maps. This allows map series annotations to repeat sheets across years without loading duplicate maps. The app then loads those local generated assets and builds a `WarpedMapList` from them for:

- displaying historical map layers
- the "in view" filter
- map bounds and visibility checks
- linking Georeference Annotations IDs back to records in `collection.yml`

Annotations can be referenced as full external URLs:

```yaml
annotation: https://annotations.allmaps.org/manifests/example
```

They can also be bundled with the app by placing JSON files in `static/annotations` and using the served path in `collection.yml`. Files in `static` are served from the site root, so omit the `static/` prefix:

```yaml
annotation: annotations/rotterdam-1897.json
```

Relative annotation paths are resolved with the SvelteKit base path, so they continue to work when the app is deployed under a subpath such as `/rotterdam-tijdmachine`. Links generated for Allmaps Viewer and copied XYZ tile URLs use the full public URL for bundled annotations, for example `https://example.org/time-machine/annotations/rotterdam-1897.json`.

Remote annotations are cached in `.cache/annotations` after a successful fetch. When the cache contains an annotation, local development and builds reuse that cached copy instead of requesting it again, which keeps startup fast when switching between multiple configs. If no cache exists, the script fetches the remote annotation and stores it for later. The generated JSON and cache directory are ignored by Git.

To rebuild the generated content and annotation assets from the current cache, run:

```bash
pnpm run generate:annotations
```

To force fresh remote annotation requests and update the cache, run:

```bash
REFRESH_ANNOTATIONS=1 pnpm run generate:annotations
```

### Basemap and search bounds

The basemap uses Protomaps in `src/lib/basemap.ts`, with the API key configured through `basemap.protomapsApiKey` in `config.yml`. Developers reusing this app should request their own free Protomaps API key at [protomaps.com/api](https://protomaps.com/api). Protomaps keys can be restricted by domain, so configure the allowed origins for your deployment as needed.

The Nominatim search bounds are derived from the bounds of the Allmaps layer. For a new collection, check that the combined annotations cover the area you want users to search.

### Constructing URLs

The app opens with the default map and view from `config.yml` when no query parameters are provided:

```text
https://example.org/time-machine/
```

You can link to a year with the `year` parameter. This parameter only accepts a numeric year and selects the first map in `collection.yml` for that year:

```text
https://example.org/time-machine/?year=1897
```

You can link to a specific map with the `map` parameter. This parameter accepts the generated annotation ID from `src/lib/generated/collection.json`; full annotation URLs are not accepted. For Allmaps annotations this is the hash in the annotation URL; any version hash after `@` is ignored:

```text
https://example.org/time-machine/?map=7256050d27d1f599
```

For bundled annotations in `static/annotations`, the generated ID is the first 16 characters of a SHA-1 hash of the normalized static path. The sharing modal creates these URLs automatically.

```text
https://example.org/time-machine/?map=ee371ce2fd6f97fa
```

If `year` and `map` are both present, `map` takes preference. To link to a specific view, add `lat`, `lng`, and optionally `zoom` and `bearing`:

```text
https://example.org/time-machine/?lat=51.92146&lng=4.48488&zoom=14.00&map=7256050d27d1f599
```

The sharing modal keeps the default link simple and only includes view parameters when the current-view option is selected.

## Project structure

- `config.yml`: app settings, text, and metadata
- `collection.yml`: map collection
- `src/lib/content.ts`: imports generated config and collection JSON files
- `src/routes/+page.ts`: exposes config and collection to the main page
- `src/routes/+layout.ts`: exposes config for metadata
- `src/lib/components`: Svelte components for the map, layers, header, modals, and slider
- `src/lib/app-state.svelte.ts`: shared UI state, favorites, and map pane state
- `src/lib/services/geocoder.svelte.ts`: Nominatim search service
- `src/lib/warped-map-list.ts`: Allmaps annotation and warped map helper
- `src/lib/types.ts`: shared TypeScript types for config, collection, and UI events
- `static/favicon.svg`: replaceable favicon

## Technology

- [SvelteKit](https://kit.svelte.dev/)
- [Svelte 5](https://svelte.dev/)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [Allmaps](https://allmaps.org/)
- [Protomaps Basemaps](https://github.com/protomaps/basemaps)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide icons](https://lucide.dev/)
- [Nominatim](https://nominatim.org/)
- [driver.js](https://driverjs.com/)
- [svelte-scroll-input-date-picker](https://github.com/abufahimkhan/svelte-scroll-input-date-picker)

## Examples and inspiration

- [Topotijdreis Netherlands](https://www.topotijdreis.nl/)
- [Topotijdreis Belgium](https://topotijdreis.be/) (Open source Belgian version of the Dutch original by Manuel Claeys Bouuaert, [source code](https://github.com/mclaeysb/topotijdreis/))
- [Watertijdreis](https://watertijdreis.nl/), [source code](https://github.com/allmaps/watertijdreis)

## Credits and attribution

- Historical map records link to their source institutions through `institution` and `url` in `collection.yml`.
- Georeferencing and map warping are handled through [Allmaps](https://allmaps.org/).
- The modern basemap uses [Protomaps](https://protomaps.com/) and data from [OpenStreetMap](https://www.openstreetmap.org/).
- Location search uses [Nominatim](https://nominatim.org/); when reusing the app, follow the [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).
- Development from commit `095bedc` onward was carried out with assistance from OpenAI Codex. Architectural decisions, review, testing, and final responsibility remain with the project maintainers.

## License

This project is licensed under the GNU General Public License v3.0 or later. See [LICENSE](LICENSE).

Bundled or configured fonts have their own licenses and are not relicensed by this project. Check the license files distributed with the fonts, such as `static/fonts/OFL.txt`, and the original font providers.

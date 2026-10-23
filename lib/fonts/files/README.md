# Font files

Self-hosted so the build never downloads fonts. `next/font/google` fetched these from Google at build time, and a failed download failed the build.

These are Google Fonts' own files, byte for byte: what Google serves to `next/font/google` for the requests the app used to make.

| Family            | Request                     | Blocks                                                      |
| ----------------- | --------------------------- | ----------------------------------------------------------- |
| Plus Jakarta Sans | `wght@400;500;600;700;800`  | latin, latin-ext, vietnamese, cyrillic-ext                  |
| Big Shoulders     | `opsz,wght@10..72,100..900` | latin, latin-ext, vietnamese                                |
| Instrument Sans   | `wght@400..700`             | latin, latin-ext                                            |
| JetBrains Mono    | `wght@500;700`              | latin, latin-ext, vietnamese, cyrillic, greek, cyrillic-ext |

There is one file per unicode block. `lib/fonts/app.ts` and `lib/site/fonts.ts` copy each block's `unicode-range`, weights and stretch from Google's CSS.

All four families are under the SIL Open Font License 1.1 (`OFL-*.txt`, from github.com/google/fonts).

## Refreshing

1. Fetch `https://fonts.googleapis.com/css2?family=<Family>:<request>&display=swap` with a current Chrome user agent.
2. Download each block's `url(...)` file under the name `<family>-<block>.woff2`.
3. If a `unicode-range` or weight changed, copy it into the matching `localFont` call.

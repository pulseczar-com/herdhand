# Icon sources

`icon.svg` is the app icon on the 108-unit Android adaptive icon grid. `icon-mono.svg` is the same mark in one color, for the themed (monochrome) icon. The connection notification's icon is the same mark as an Android vector drawable, in `modules/ssh/android/src/main/res/drawable/ic_connection_notice.xml`.

The PNGs in `assets/` are rendered from these files with [resvg](https://github.com/yisibl/resvg-js). Run from the repository root:

```sh
resvg="npx -y @resvg/resvg-js-cli@2.6.2-beta.1 --fit-width 1024"
fg() { sed '/id="background"/d' assets/brand/icon.svg; }
$resvg assets/brand/icon.svg assets/icon.png
fg | $resvg - assets/android-icon-foreground.png
$resvg assets/brand/icon-mono.svg \
  assets/android-icon-monochrome.png
fg | sed 's/#3DDC84/#17924F/' | $resvg - assets/splash-icon.png
```

The "by PulseCzar" lockup in About is PulseCzar's inline lockup, `inline-dark.svg` and `inline-light.svg` from PulseCzar's brand files, rendered at three times its 14 px height:

```sh
for cut in dark light; do
  npx -y @resvg/resvg-js-cli@2.6.2-beta.1 --fit-height 42 \
    inline-$cut.svg assets/pulseczar-lockup-$cut.png
done
```

The splash is the mark in `#17924F` on white in light mode, and in `#3DDC84` on `#0A0D0C` in dark mode, where it reuses `android-icon-foreground.png` (see `app.json`).

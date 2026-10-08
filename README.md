# Deskworlds

> **This fork adds a fifth world, Koi pond.** Everything else is [chaseleantj/deskworlds](https://github.com/chaseleantj/deskworlds), unchanged, and all credit for the app and the other four worlds goes there.
>
> [![Koi pond](docs/images/koiscape-wide.png)](scenes/koiscape/)
>
> Koi pond was built in one evening with Claude Code, using the reference-and-critic loop the original author described. It has been tested on one machine (M4 Mac mini, 3440 x 1440, macOS 26.5), where it holds 30 fps on the Balanced profile and about 40 fps as wallpaper. It is new, so expect rough edges. The scene on its own is on the [`koiscape` branch](https://github.com/JeremyADay/deskworlds/tree/koiscape). Install it the same way as the original, below.

[![Watch Riverbed](docs/images/riverscape.gif)](docs/videos/riverscape.mp4)

[![Watch Betta](docs/images/bettascape.gif)](docs/videos/bettascape.mp4)

Have you always wanted a little living world on your desktop? Now you can have one :)

Each world is a live 3D scene that reacts to your cursor. There are five so far. Three are underwater: **Riverbed**, a planted river where a school of fish competes for food, **Coral reef**, a coral reef with clownfish and cleaner shrimp, and **Betta**, a single halfmoon betta on a black background. The fourth, **Plasma globe**, is a plasma lamp glowing on a walnut desk in a dark room, with moonlight falling through a window beside it. Bring the cursor toward the glass and the plasma reaches for it like it would for a fingertip. The fifth, **Koi pond**, looks down through the surface of a dark garden pond, with koi of several varieties cruising under lily pads and the trees mirrored overhead.

Every scene is rendered live with Three.js and WebGL2. Everything runs locally, with no account or internet connection needed after setup. Desktop wallpaper support is **macOS only** for now; all five worlds also run in a browser. The Mac app starts with Riverbed and remembers the world you pick from its menu.

## Install on Mac

You need macOS 13 or newer and the Xcode command line tools. To install the tools, open Terminal and run:

```sh
xcode-select --install
```

Wait for that installation to finish. Download and unzip this repository, or clone it, then open Terminal in the project folder and run:

```sh
sh wallpaper/install.sh
```

The script builds the app for your Mac, installs it at `~/Applications/Deskworlds.app`, and starts it. It also adds a login item so your world starts when you sign in. Allow about 20 seconds for the first frame to appear.

The installer doesn't change your desktop picture. The world draws on top of it, and your own wallpaper still shows at login and in Mission Control.

You don't need Node.js for the wallpaper. If you already have it, `npm run wallpaper` runs the same installer.

## Use the wallpaper

Click the Deskworlds icon in the menu bar:

- **World** switches every screen between Riverbed, Coral reef, Betta, Plasma globe and Koi pond and remembers your choice.
- **Feed** drops ten pellets into each screen's scene, eight in Coral reef or six to eight in Betta. Uneaten pellets dissolve after 20–40 seconds of running simulation time in Riverbed, 36 seconds in Coral reef, 30 seconds in Betta and 38 seconds in Koi pond, measured from when they touch the water. Plasma globe has nothing to feed, so the item is dimmed there.
- **Pause / Resume** controls the animation. Your choice is remembered across restarts.
- **Quit** closes the app until you open it again or next sign in.

Move your cursor through a scene to see its creatures react. Desktop icons, clicks and dragging work as usual. To feed them, use the menu; clicking the desktop does not drop food.

## FAQ

### Does it work on Windows or Linux?

The desktop app supports macOS only. The browser preview needs a browser with WebGL2, but there is no wallpaper installer for Windows or Linux.

### Will it drain my battery?

It uses more power than a still wallpaper because it renders a 3D scene. The amount depends on your Mac, screen resolution and number of displays. There isn't a measured battery-life estimate yet.

All five scenes use the same quality profiles and stop rendering when paused or hidden. The wallpaper also responds to window coverage, battery power, Low Power Mode and screen sleep.

Plugged in, every world renders at your display's full resolution. On battery it drops to a lower resolution, like the browser previews' Balanced profile. Frame rates follow these limits:

| Desktop state | Frame rate |
| --- | --- |
| Clearly visible, plugged in | Up to 60 fps |
| Clearly visible, on battery | Up to 30 fps |
| Mostly covered by windows | Up to 20 fps |
| Almost entirely covered | Stopped |
| Low Power Mode, locked screen or sleeping display | Stopped |

Pause it from the menu when you want a still wallpaper, or quit to close the app completely. The browser previews offer Eco, Balanced and Detail profiles; actual frame rates depend on the device and scene. Battery life has not been measured.

### Does it monitor my keystrokes?

No. The wallpaper does not listen to typing in other apps or record keystrokes. All the browser previews handle Space to pause or resume, F for fullscreen, and H to hide or show controls while a scene has focus.

The wallpaper reads your cursor position so the creatures can react. It also checks window positions and sizes to estimate how much of the desktop is visible. It does not capture the contents of those windows, store cursor history, or send this information anywhere.

### Does it need internet access or special permissions?

Once installed, Deskworlds works offline. Its code, textures and Three.js library are bundled with the app. There are no analytics or external services.

The app does not request Accessibility, Input Monitoring or Screen Recording access.

### Why has the scene stopped moving?

Click the menu bar icon to see the current status. The wallpaper stops when it is almost entirely covered, in Low Power Mode, and while the screen is locked or asleep.

If Reduce Motion is enabled in macOS, the wallpaper starts paused unless you have already saved a different choice. Choose **Resume** to animate it. Low Power Mode must be turned off before animation can resume.

### Can I use multiple monitors?

Yes. Each display gets its own world, and **Feed** drops food on every display. Each one renders separately, so more displays can increase power use.

### Do I need to leave Terminal open?

No. The installed app has its own copy of the scene and runs independently. You can close Terminal once installation finishes.

### How do I update it?

Download or pull the latest source, then rerun `sh wallpaper/install.sh` from the project folder. Editing the source alone does not update the installed app. Deskworlds was called Desktop Habitats, and before that Aquatica. The installer removes either earlier app and its login item before starting Deskworlds. Your Desktop Habitats scene and pause choices carry over; Aquatica's saved preference is left behind.

### How do I remove it and get my old wallpaper back?

From the project folder, run:

```sh
sh wallpaper/uninstall.sh
```

Or use `npm run unwallpaper`. This stops the app, removes its login item and deletes the installed app. Your wallpaper was never changed, so it is already there underneath. The saved pause and world preferences are retained.

Versions before this one set a still image of the scene as the desktop picture. If you installed one of those, choose your wallpaper in System Settings, then delete `~/Pictures/Desktop Habitats.png`.

## Try it in a browser

With Node.js 20 or newer, run this from the project folder:

```sh
npm start
```

Open [the local preview](http://127.0.0.1:8080). There is no `npm install` step; the library is included. Use `PORT=8081 npm start` if port 8080 is busy, and Ctrl+C to stop the server.

- Click a scene to drop food.
- Move the pointer through a scene to interact.
- In Plasma globe, move the cursor toward the glass: the channels lean toward it, most go out, and one bright arc runs to the point nearest the cursor. There are no controls or words on the page; Space pauses and F is fullscreen.
- In Betta, drag to look around the betta and scroll to zoom. Clicking still drops food.
- In Koi pond, rest the cursor on the water and a curious koi or two come over to look; sweep it fast and the nearest dart away, then settle. A moving cursor trails ripples. Clicking drops two to four pellets where it lands, and the koi rise to take them at the surface.
- Swipe or scroll through the gallery, or use the left and right arrow keys. Open the image or name to enter a scene.
- Use **Pause / Resume**, **Feed**, **Fullscreen** and **Hide controls** in the three underwater scenes and Koi pond. **Show controls** brings the controls back.
- Press **Space** to pause or resume, **F** for fullscreen, and **H** to hide or show controls while a scene has focus.
- **Quality** offers Eco (20 fps), Balanced (30 fps, the default) and Detail (60 fps). The selection is shared between the scenes and remembered. These are frame-rate caps; lower profiles also reduce rendering resolution.

Reduce Motion starts the preview paused. Serve the page over HTTP; opening `index.html` directly will not load its JavaScript modules. Any static server also works, such as `python3 -m http.server 8080 --bind 127.0.0.1` if you have Python installed.

## Credits and license

Deskworlds is [MIT licensed](LICENSE). Three.js 0.180.0 is bundled under its [MIT license](vendor/THREE-LICENSE.txt).

The rock, wood and sand textures come from Poly Haven under [CC0](https://polyhaven.com/license): [Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry), [Rough Wood](https://polyhaven.com/a/rough_wood) and [Sand 01](https://polyhaven.com/a/sand_01). Coral reef's rock mesh, pore maps, coral texture and organism meshes are procedural, generated by the scripts in `tools/`.

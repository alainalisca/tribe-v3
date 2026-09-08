# Sport fallback photos — sources and licenses

These are the default hero images behind `SPORT_IMAGES` in `lib/sport-images.ts`.
They render only when a session has no photo of its own and its instructor has no
banner, so they are a floor, not a feature. Al may replace any of them with real
instructor or BullBox photography over time; the map keys stay the same.

## License

Every file below is from **Unsplash** under the
[Unsplash License](https://unsplash.com/license): free to use commercially, no
permission needed, no attribution required. Attribution is recorded here anyway,
because knowing where an asset came from matters more than the licence requiring it.

## Selection rules applied

- Landscape, cropped to 1200x675, progressive JPEG, every file under 150 KB.
- No identifiable close-up portraits. Distant figures, backs turned, motion blur
  and shoulders-down crops are fine; the rule exists so a generic fallback is never
  mistaken for the actual instructor, not for licensing reasons.
- No prominent brand names. Small moulded maker's marks on equipment are
  unavoidable in gym photography and were accepted; legible wordmarks, sponsor
  boards and named gyms or universities were rejected.

## Files

| File                | Photographer | Source                             | Notes                                                   |
| ------------------- | ------------ | ---------------------------------- | ------------------------------------------------------- |
| `running.jpg`       | Unsplash     | `photo-1549896869-ca27eeffe4fb`    | Track lane markings. No people.                         |
| `cycling.jpg`       | Unsplash     | `photo-1486425091969-f62210f08a26` | Riders under heavy motion blur; kit branding illegible. |
| `hiking.jpg`        | Unsplash     | `photo-1603834608556-88bb4f1b174d` | Mountain trail; figures distant on the ridge.           |
| `swimming.jpg`      | Unsplash     | `photo-1730244548329-4ae2f4fcaa7c` | Empty lane pool. Small backstroke pennants.             |
| `crossfit.jpg`      | Unsplash     | `photo-1597075958252-60fc09ec20c2` | Suspension trainers and rope on a block wall.           |
| `hyrox.jpg`         | Unsplash     | `photo-1764595753275-d9278a0b8f56` | Ergs on gym turf — a HYROX station. See caveat below.   |
| `boxing.jpg`        | Unsplash     | `photo-1748484531687-5faebc4a1965` | Heavy bag outdoors. No people, no branding.             |
| `yoga.jpg`          | Unsplash     | `photo-1761971975962-9cc397e2ba2a` | Studio with mats laid out. No people.                   |
| `pilates.jpg`       | Unsplash     | `photo-1717500252297-b09508db7ceb` | Reformer studio. No people.                             |
| `dance.jpg`         | Unsplash     | `photo-1775568350881-8d1610e442e9` | Dancers in motion blur, no faces resolvable.            |
| `calisthenics.jpg`  | Unsplash     | `photo-1788187575403-2a67b1fd0a8f` | Beach calisthenics park; figures distant.               |
| `basketball.jpg`    | Unsplash     | `photo-1626240362781-b0265a32161a` | Outdoor court by the sea. No people.                    |
| `soccer.jpg`        | Unsplash     | `photo-1590145081676-616176e24471` | Goal net against blue sky. No people.                   |
| `tennis.jpg`        | Unsplash     | `photo-1699117686612-ece525e4f91a` | Net across a blue court. No people.                     |
| `weightlifting.jpg` | Unsplash     | `photo-1685633224688-6a77675eb119` | Hex dumbbells; small moulded maker's mark only.         |
| `default.jpg`       | Unsplash     | `photo-1784798228092-659924b1a15b` | Monochrome rack room. Mapped to the `Other` category.   |

Full source URL for any row: `https://images.unsplash.com/<source>`.
Fetched at `?w=1200&h=675&fit=crop&crop=entropy&fm=jpg&q=85`, then recompressed
with mozjpeg (`djpeg | cjpeg -progressive -optimize`), stepping quality down until
the file came in under 150 KB.

## Caveats worth a second opinion

- **`hyrox.jpg`** carries legible `Concept2` and `Olympia` marks on the ergs and
  wall ball. It was kept because it is the only free image found that actually
  depicts HYROX-style stations, and the alternatives were worse: the best-composed
  candidate was a named competitor gym's branding wall. Swap it if the branding
  bothers you — the map key does not change.
- **`crossfit.jpg`** reads as functional training rather than unmistakably CrossFit.
  A rack-and-bumper-plate shot was clearer but carried three legible `Blackbull
Fitness` wordmarks, so this one was preferred on the no-logos rule.

## Sports still on the gradient

No file shipped, so `getSessionHeroImage()` returns `''` for these and the card
falls back to its sport gradient, exactly as before this change:

Muay Thai, Kickboxing, Jiu-Jitsu, Volleyball, Padel, Skateboarding, BMX.

`Other` is not in that list: it is the one category with no imagery of its own,
so it is mapped to `default.jpg`. Every other unshipped sport deliberately keeps
its gradient rather than falling through to a generic gym photo — a Muay Thai
session is better served by its own gradient than by a rack-room shot.

Adding one is two steps: drop `<key>.jpg` in this directory and add the key to
`SPORT_IMAGES`. The key is the stored sport name lowercased, so `Muay Thai`
becomes `'muay thai'` — with the space.

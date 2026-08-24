# App Store source UI captures

These images are real Our Little World UI captures from the dedicated
`OLW Marketing Capture 16 Pro` simulator on 2026-07-23 and 2026-07-24.

- The app rendered its existing development-only, non-writing QA fixtures.
- The temporary authentication/family preview bypass used for capture was removed
  immediately afterward and is not part of the product source or a release build.
- The Moment, timeline, and Places captures use real family photos supplied by a
  parent for this public App Store asset set on 2026-07-24.
- The source photo files and their metadata were not added to the repository.
  Temporary cropped copies used by the simulator were deleted after capture.
- The adult-and-child photo was not used, and visible child-name embroidery was
  cropped out before capture to avoid unnecessary identity exposure.
- Titles, dates, counts, places, and relationships remain non-writing sample-story
  fixtures. The photos are real and are not described as synthetic.
- The Expo development tools button was disabled before capture.
- The source captures are not App Store-sized upload assets. Run
  `python3 apps/mobile/app-store/generate_screenshots.py` to generate the public
  6.5-inch composites.

The iPad set remains unchanged until the native iPad UI is captured directly. Do
not stretch these iPhone captures and present them as iPad UI.
